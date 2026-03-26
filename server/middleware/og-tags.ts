import { Request, Response, NextFunction, Router } from 'express';
import { db } from '../db';
import { animals, calendars, tenants, donationLinks, shopProducts, customPages } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const SOCIAL_CRAWLERS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Pinterest',
  'Slackbot',
  'TelegramBot',
  'WhatsApp',
  'Discordbot',
];

function isSocialCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return SOCIAL_CRAWLERS.some(crawler => 
    userAgent.toLowerCase().includes(crawler.toLowerCase())
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function injectOGTags(req: Request, res: Response, next: NextFunction) {
  const userAgent = req.get('User-Agent');
  
  // Log all requests from social crawlers for debugging
  if (isSocialCrawler(userAgent)) {
    console.log(`[OG-TAGS] Social crawler detected!`);
    console.log(`[OG-TAGS] User-Agent: ${userAgent?.substring(0, 80)}`);
    console.log(`[OG-TAGS] req.url: ${req.url}`);
    console.log(`[OG-TAGS] req.originalUrl: ${req.originalUrl}`);
    console.log(`[OG-TAGS] req.path: ${req.path}`);
    console.log(`[OG-TAGS] req.tenant: ${req.tenant ? req.tenant.subdomain : 'undefined'}`);
  }
  
  if (!isSocialCrawler(userAgent)) {
    return next();
  }

  const assetPaths = ['/objects/', '/api/', '/assets/', '/icon-', '/manifest', '/favicon'];
  if (assetPaths.some(p => req.url.includes(p) || req.originalUrl.includes(p))) {
    return next();
  }

  const tenant = req.tenant;
  if (!tenant) {
    console.log(`[OG-TAGS] No tenant available for: ${req.url}`);
    return next();
  }

  let url = req.url;
  const tenantPrefix = `/${tenant.subdomain}`;
  if (url.startsWith(tenantPrefix + '/') || url === tenantPrefix) {
    url = url.slice(tenantPrefix.length) || '/';
  }

  const hostname = req.get('host') || '';
  const isCustomDomain = tenant.customDomain && tenant.customDomainVerified &&
    hostname.replace(/^www\./i, '').toLowerCase() === tenant.customDomain.toLowerCase();
  const baseUrl = isCustomDomain
    ? `${req.protocol}://${tenant.customDomain}`
    : `${req.protocol}://${req.get('host')}`;

  const resolveImageUrl = (imgUrl: string | null | undefined): string | null => {
    if (!imgUrl) return null;
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) return imgUrl;
    return `${baseUrl}${imgUrl.startsWith('/') ? '' : '/'}${imgUrl}`;
  };

  const tenantImage = resolveImageUrl(tenant.logoUrl) || resolveImageUrl(tenant.heroImageUrl);
  const defaultImage = tenantImage || `${baseUrl}/icon-512.png`;

  let ogData: { title: string; description: string; image: string } | null = null;

  try {
    const calendarMatch = url.match(/^\/dashboard\/calendar(\?|$)/);
    if (calendarMatch) {
      const calendarList = await db.select({ name: calendars.name, type: calendars.type })
        .from(calendars)
        .where(and(eq(calendars.tenantId, tenant.id), eq(calendars.isActive, true), eq(calendars.isPublic, true)))
        .limit(5);

      const calendarNames = calendarList.map(c => c.name).join(', ');

      let calendarImage = defaultImage;
      const shareImageParam = (req.query as any).share_image;
      if (shareImageParam && typeof shareImageParam === 'string' && shareImageParam.startsWith('/objects/')) {
        calendarImage = `${baseUrl}${shareImageParam}`;
      }

      ogData = {
        title: `Volunteer Calendar | ${tenant.name}`,
        description: calendarNames
          ? `View and sign up for volunteer opportunities: ${calendarNames}. Help ${tenant.name} make a difference!`
          : `View and sign up for volunteer opportunities at ${tenant.name}.`,
        image: calendarImage,
      };
      console.log(`[OG-TAGS] Calendar match for tenant=${tenant.subdomain}, image=${calendarImage}`);
    }

    if (!ogData) {
      const donateLinkMatch = url.match(/^\/donate\/([a-f0-9-]+)$/i);
      if (donateLinkMatch) {
        const linkId = donateLinkMatch[1];
        const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidCheck.test(linkId)) {
          console.log(`[OG-TAGS] Processing individual donation link: tenant=${tenant.subdomain}, linkId=${linkId}`);
          const linkData = await db.select({
            title: donationLinks.title,
            description: donationLinks.description,
            imageUrl: donationLinks.imageUrl,
          })
          .from(donationLinks)
          .where(and(
            eq(donationLinks.id, linkId),
            eq(donationLinks.tenantId, tenant.id),
            eq(donationLinks.isActive, true)
          ))
          .limit(1);

          if (linkData.length > 0) {
            const link = linkData[0];
            let image = defaultImage;
            if (link.imageUrl) {
              if (link.imageUrl.startsWith('http://') || link.imageUrl.startsWith('https://')) {
                image = link.imageUrl;
              } else {
                image = `${baseUrl}${link.imageUrl.startsWith('/') ? '' : '/'}${link.imageUrl}`;
              }
            }
            ogData = {
              title: `${link.title} | ${tenant.name}`,
              description: link.description
                ? link.description.slice(0, 200) + (link.description.length > 200 ? '...' : '')
                : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`,
              image,
            };
          }
        }
      }
    }

    if (!ogData) {
      const donateMatch = url.match(/^\/donate$/);
      if (donateMatch) {
        const emergencyCampaigns = await db.select({
          title: donationLinks.title,
          description: donationLinks.description,
          imageUrl: donationLinks.imageUrl,
        })
        .from(donationLinks)
        .where(and(
          eq(donationLinks.tenantId, tenant.id),
          eq(donationLinks.campaignType, 'emergency_fund'),
          eq(donationLinks.isActive, true)
        ))
        .orderBy(desc(donationLinks.createdAt))
        .limit(1);

        let image = defaultImage;
        let description = `Support ${tenant.name} with a donation. Every contribution helps animals in need.`;
        let title = `Donate | ${tenant.name}`;

        if (emergencyCampaigns.length > 0) {
          const campaign = emergencyCampaigns[0];
          title = `${campaign.title} | ${tenant.name}`;
          if (campaign.description) {
            description = campaign.description.slice(0, 200) + (campaign.description.length > 200 ? '...' : '');
          }
          if (campaign.imageUrl) {
            if (campaign.imageUrl.startsWith('http://') || campaign.imageUrl.startsWith('https://')) {
              image = campaign.imageUrl;
            } else {
              image = `${baseUrl}${campaign.imageUrl.startsWith('/') ? '' : '/'}${campaign.imageUrl}`;
            }
          }
        }

        ogData = { title, description, image };
        console.log(`[OG-TAGS] Donate page match for tenant=${tenant.subdomain}, image=${image}`);
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!ogData) {
      const campaignMatch = url.match(/^\/campaigns?\/([a-zA-Z0-9-]+)/);
      if (campaignMatch) {
        const campaignId = campaignMatch[1];
        if (!uuidRegex.test(campaignId)) {
          console.log(`[OG-TAGS] Invalid UUID for campaign: ${campaignId}`);
          return next();
        }
        console.log(`[OG-TAGS] Processing campaign: tenant=${tenant.subdomain}, id=${campaignId}`);

        const campaignById = await db.select({
          title: donationLinks.title,
          description: donationLinks.description,
          imageUrl: donationLinks.imageUrl,
        })
        .from(donationLinks)
        .where(and(
          eq(donationLinks.id, campaignId),
          eq(donationLinks.tenantId, tenant.id),
          eq(donationLinks.isActive, true)
        ))
        .limit(1);

        if (campaignById.length > 0) {
          const campaign = campaignById[0];
          let image = defaultImage;
          if (campaign.imageUrl) {
            if (campaign.imageUrl.startsWith('http://') || campaign.imageUrl.startsWith('https://')) {
              image = campaign.imageUrl;
            } else {
              image = `${baseUrl}${campaign.imageUrl.startsWith('/') ? '' : '/'}${campaign.imageUrl}`;
            }
          }
          ogData = {
            title: `${campaign.title} | ${tenant.name}`,
            description: campaign.description
              ? campaign.description.slice(0, 200) + (campaign.description.length > 200 ? '...' : '')
              : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`,
            image,
          };
          console.log(`[OG-TAGS] Campaign found by link ID: ${campaign.title}, image=${image}`);
        } else {
          const campaignByAnimal = await db.select({
            title: donationLinks.title,
            description: donationLinks.description,
            imageUrl: donationLinks.imageUrl,
          })
          .from(donationLinks)
          .where(and(
            eq(donationLinks.tenantId, tenant.id),
            eq(donationLinks.animalId, campaignId),
            eq(donationLinks.campaignType, 'emergency_fund'),
            eq(donationLinks.isActive, true)
          ))
          .limit(1);

          if (campaignByAnimal.length > 0) {
            const campaign = campaignByAnimal[0];
            let image = defaultImage;
            if (campaign.imageUrl) {
              if (campaign.imageUrl.startsWith('http://') || campaign.imageUrl.startsWith('https://')) {
                image = campaign.imageUrl;
              } else {
                image = `${baseUrl}${campaign.imageUrl.startsWith('/') ? '' : '/'}${campaign.imageUrl}`;
              }
            }
            ogData = {
              title: `${campaign.title} | ${tenant.name}`,
              description: campaign.description
                ? campaign.description.slice(0, 200) + (campaign.description.length > 200 ? '...' : '')
                : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`,
              image,
            };
          } else {
            const animal = await db.select().from(animals)
              .where(and(eq(animals.id, campaignId), eq(animals.tenantId, tenant.id)))
              .limit(1);
            if (animal.length) {
              const animalData = animal[0];
              const photoUrls = animalData.photoUrls as string[] | null;
              let image = defaultImage;
              if (photoUrls && photoUrls.length > 0 && photoUrls[0]) {
                const firstPhoto = photoUrls[0];
                if (firstPhoto.startsWith('http://') || firstPhoto.startsWith('https://')) {
                  image = firstPhoto;
                } else {
                  image = `${baseUrl}${firstPhoto.startsWith('/') ? '' : '/'}${firstPhoto}`;
                }
              }
              ogData = {
                title: `Help ${animalData.name} - Medical Fund | ${tenant.name}`,
                description: `${animalData.name} needs your support for medical care at ${tenant.name}. Every donation helps!`,
                image,
              };
            }
          }
        }
      }
    }

    if (!ogData) {
      const animalMatch = url.match(/^\/animal\/([a-zA-Z0-9-]+)/);

      if (animalMatch) {
        console.log(`[OG-TAGS] Processing animal: tenant=${tenant.subdomain}, url=${url}`);
        const animalId = animalMatch[1];

        if (uuidRegex.test(animalId)) {
          const animal = await db.select().from(animals)
            .where(and(
              eq(animals.id, animalId),
              eq(animals.tenantId, tenant.id)
            ))
            .limit(1);

          if (animal.length) {
            const animalData = animal[0];
            const photoUrls = animalData.photoUrls as string[] | null;
            let image = defaultImage;

            if (photoUrls && photoUrls.length > 0 && photoUrls[0]) {
              image = resolveImageUrl(photoUrls[0]) || defaultImage;
            }

            ogData = {
              title: `Meet ${animalData.name} - ${animalData.breed} | ${tenant.name}`,
              description: animalData.bio
                ? animalData.bio.slice(0, 200) + (animalData.bio.length > 200 ? '...' : '')
                : `${animalData.name} is a ${animalData.age} year old ${animalData.breed} looking for a forever home at ${tenant.name}.`,
              image,
            };
          }
        }
      }
    }

    if (!ogData) {
      const shopMatch = url.match(/^\/shop\/([a-z0-9-]+)$/i);
      if (shopMatch) {
        const slug = shopMatch[1];
        if (slug !== 'checkout') {
          const [product] = await db.select({
            name: shopProducts.name,
            description: shopProducts.description,
            imageUrls: shopProducts.imageUrls,
            basePrice: shopProducts.basePrice,
          })
          .from(shopProducts)
          .where(and(
            eq(shopProducts.tenantId, tenant.id),
            eq(shopProducts.slug, slug),
            eq(shopProducts.status, 'active')
          ))
          .limit(1);

          if (product) {
            const productImage = product.imageUrls?.[0]
              ? (resolveImageUrl(product.imageUrls[0]) || defaultImage)
              : defaultImage;
            const priceStr = product.basePrice ? `$${parseFloat(product.basePrice).toFixed(2)}` : '';
            ogData = {
              title: `${product.name}${priceStr ? ` - ${priceStr}` : ''} | ${tenant.name}`,
              description: product.description
                ? product.description.slice(0, 200) + (product.description.length > 200 ? '...' : '')
                : `Shop ${product.name} at ${tenant.name}. Support animal rescue with every purchase!`,
              image: productImage,
            };
          }
        }
      }
    }

    if (!ogData) {
      const shopListMatch = url.match(/^\/shop\/?$/i);
      if (shopListMatch) {
        ogData = {
          title: `Shop | ${tenant.name}`,
          description: `Browse products from ${tenant.name}. Every purchase supports animal rescue!`,
          image: defaultImage,
        };
      }
    }

    if (!ogData) {
      const customPageMatch = url.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
      if (customPageMatch) {
        const slug = customPageMatch[1].toLowerCase();
        const knownPrefixes = ['login', 'register', 'dashboard', 'admin', 'api', 'apply', 'foster-portal', 'intake'];
        if (!knownPrefixes.includes(slug)) {
          const [page] = await db.select({
            title: customPages.title,
            excerpt: customPages.excerpt,
            contentBlocks: customPages.contentBlocks,
          })
          .from(customPages)
          .where(and(
            eq(customPages.tenantId, tenant.id),
            eq(customPages.slug, slug),
            eq(customPages.isPublished, true)
          ))
          .limit(1);

          if (page) {
            let image = defaultImage;
            let description = page.excerpt || '';

            if (!description && page.contentBlocks && Array.isArray(page.contentBlocks)) {
              const paragraphBlock = page.contentBlocks.find((b: any) => b.type === 'paragraph' && b.content);
              if (paragraphBlock) {
                const text = (paragraphBlock as any).content as string;
                description = text.slice(0, 200) + (text.length > 200 ? '...' : '');
              }
            }

            if (!description) {
              description = `${page.title} - ${tenant.name}`;
            }

            if (page.contentBlocks && Array.isArray(page.contentBlocks)) {
              const imageBlock = page.contentBlocks.find((b: any) => b.type === 'image' && b.src);
              if (imageBlock) {
                image = resolveImageUrl((imageBlock as any).src) || defaultImage;
              }
            }

            ogData = {
              title: `${page.title} | ${tenant.name}`,
              description,
              image,
            };
            console.log(`[OG-TAGS] Custom page match: slug=${slug}, tenant=${tenant.subdomain}`);
          }
        }
      }
    }

    if (!ogData) {
      ogData = {
        title: tenant.name,
        description: tenant.tagline || `${tenant.name} - Adopt, Foster, Donate. Help animals find their forever homes.`,
        image: defaultImage,
      };
      console.log(`[OG-TAGS] Using tenant fallback for: ${url} (tenant=${tenant.subdomain})`);
    }

    const canonicalUrl = isCustomDomain
      ? `${req.protocol}://${tenant.customDomain}${url}`
      : `${req.protocol}://${req.get('host')}/${tenant.subdomain}${url}`;

    let ogImage = ogData.image;
    const ogImageOriginal = ogData.image;
    if (ogImage.includes('/objects/')) {
      const objectsPath = ogImage.includes('/objects/') ? ogImage.substring(ogImage.indexOf('/objects/')) : '';
      if (objectsPath) {
        ogImage = `${baseUrl}/api/og-image?url=${encodeURIComponent(objectsPath)}`;
      }
    }

    const ogTags = `
    <!-- Dynamic Open Graph Tags for Social Sharing -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(ogData.title)}" />
    <meta property="og:description" content="${escapeHtml(ogData.description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:site_name" content="${escapeHtml(tenant.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(ogData.title)}" />
    <meta name="twitter:description" content="${escapeHtml(ogData.description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <meta name="description" content="${escapeHtml(ogData.description)}" />
    <title>${escapeHtml(ogData.title)}</title>
    <!-- End Dynamic Open Graph Tags -->
`;

    const isProduction = process.env.NODE_ENV === 'production';
    let html: string;

    if (isProduction) {
      const prodPath = path.resolve(import.meta.dirname, "public", "index.html");
      try {
        html = await fs.promises.readFile(prodPath, 'utf-8');
      } catch (err) {
        console.error(`[OG-TAGS] Failed to read production index.html:`, err);
        return next();
      }
    } else {
      const devPath = path.resolve(import.meta.dirname, "..", "..", "client", "index.html");
      try {
        html = await fs.promises.readFile(devPath, 'utf-8');
      } catch (err) {
        console.error(`[OG-TAGS] Failed to read development index.html:`, err);
        return next();
      }
    }

    html = html.replace(
      /<meta property="og:type" content="website" \/>[\s\S]*?<meta name="twitter:image"[^>]*>/,
      ogTags.trim()
    );

    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(ogData.title)}</title>`
    );

    html = html.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(ogData.description)}" />`
    );

    html = html.replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    );

    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (error) {
    console.error('Error injecting OG tags:', error);
    next();
  }
}

export const ogImageRouter = Router();

ogImageRouter.get('/api/og-image', async (req, res) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl || !imageUrl.startsWith('/objects/')) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    const { ObjectStorageService } = await import('../objectStorage');
    const objectStorage = new ObjectStorageService();
    const objectFile = await objectStorage.getObjectEntityFile(imageUrl);

    const [contents] = await objectFile.download();

    const sharp = (await import('sharp')).default;
    const optimized = await sharp(contents)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toBuffer();

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': String(optimized.length),
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(optimized);
  } catch (error) {
    console.error('[OG-IMAGE] Error generating OG image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});
