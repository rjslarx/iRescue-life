import { Request, Response, NextFunction, Router } from 'express';
import { db } from '../db';
import { animals, calendars, tenants, donationLinks, shopProducts, customPages, type PageBlock } from '@shared/schema';
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

  const PLATFORM_DOMAIN = 'irescue.life';
  const hostname = req.get('host') || '';
  const normalizedHostname = hostname.split(':')[0].replace(/^www\./i, '').toLowerCase();
  const isCustomDomain = !!(tenant.customDomain && tenant.customDomainVerified &&
    normalizedHostname === tenant.customDomain.toLowerCase());
  // Legacy subdomain tenants: e.g. demo.irescue.life — the tenant prefix is NOT in the URL path
  const isLegacySubdomain = !isCustomDomain &&
    normalizedHostname !== PLATFORM_DOMAIN &&
    normalizedHostname.endsWith('.' + PLATFORM_DOMAIN);
  const protocol = 'https';
  const baseUrl = isCustomDomain
    ? `${protocol}://${tenant.customDomain}`
    : `${protocol}://${hostname}`;

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
      const vipClubMatch = url.match(/^\/vip-club\/?(?:\?.*)?$/i);
      if (vipClubMatch) {
        const vipImage = `${baseUrl}/api/og/vip-club/${tenant.id}.png`;
        ogData = {
          title: `Join the ${tenant.name} Hero Club`,
          description: 'Help us provide consistent, life-saving care every single month.',
          image: vipImage,
        };
        console.log(`[OG-TAGS] VIP Club match for tenant=${tenant.subdomain}, image=${vipImage}`);
      }
    }

    if (!ogData) {
      const customPageMatch = url.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:\?.*)?$/i);
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
            const blocks: PageBlock[] = Array.isArray(page.contentBlocks) ? page.contentBlocks : [];

            if (!description) {
              const paragraphBlock = blocks.find((b): b is PageBlock & { type: 'paragraph'; content: string } => b.type === 'paragraph' && 'content' in b && typeof b.content === 'string');
              if (paragraphBlock) {
                description = paragraphBlock.content.slice(0, 200) + (paragraphBlock.content.length > 200 ? '...' : '');
              }
            }

            if (!description) {
              description = `${page.title} - ${tenant.name}`;
            }

            const imageBlock = blocks.find((b): b is PageBlock & { type: 'image'; src: string } => b.type === 'image' && 'src' in b && typeof b.src === 'string');
            if (imageBlock) {
              image = resolveImageUrl(imageBlock.src) || defaultImage;
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

    // Build canonical URL based on the resolved routing mode:
    // - Custom domain: canonical lives on the tenant's verified custom domain
    // - Legacy subdomain (demo.irescue.life): canonical is at the root of the subdomain host,
    //   with no extra /{tenant.subdomain} path segment
    // - Path-based (irescue.life/demo/...): canonical includes the tenant subdomain prefix
    const canonicalUrl = isCustomDomain
      ? `${protocol}://${tenant.customDomain}${url}`
      : isLegacySubdomain
        ? `${protocol}://${hostname}${url}`
        : `${protocol}://${hostname}/${tenant.subdomain}${url}`;

    let ogImage = ogData.image;
    const ogImageOriginal = ogData.image;
    if (ogImage.includes('/objects/')) {
      const objectsPath = ogImage.includes('/objects/') ? ogImage.substring(ogImage.indexOf('/objects/')) : '';
      if (objectsPath) {
        ogImage = `${baseUrl}/api/og-image?url=${encodeURIComponent(objectsPath)}`;
      }
    }

    const ogMetaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(ogData.title)}" />
    <meta property="og:description" content="${escapeHtml(ogData.description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="${ogImage.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'}" />
    <meta property="og:site_name" content="${escapeHtml(tenant.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(ogData.title)}" />
    <meta name="twitter:description" content="${escapeHtml(ogData.description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`;

    console.log(`[OG-TAGS] Generated OG data: title="${ogData.title}", image="${ogImage}", canonicalUrl="${canonicalUrl}"`);

    const isProduction = process.env.NODE_ENV === 'production';
    let html: string;

    if (isProduction) {
      const prodPath = path.resolve(import.meta.dirname, "public", "index.html");
      try {
        html = await fs.promises.readFile(prodPath, 'utf-8');
        console.log(`[OG-TAGS] Read production index.html (${html.length} bytes) from ${prodPath}`);
      } catch (err) {
        console.error(`[OG-TAGS] Failed to read production index.html at ${prodPath}:`, err);
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

    const ogRegex = /<meta property="og:type" content="website"\s*\/?>([\s\S]*?)<meta name="twitter:image"[^>]*\/?>/;
    const regexMatched = ogRegex.test(html);

    if (regexMatched) {
      html = html.replace(ogRegex, ogMetaTags.trim());
      console.log(`[OG-TAGS] Replaced existing OG tags via regex`);
    } else {
      html = html.replace('</head>', `${ogMetaTags}\n</head>`);
      console.log(`[OG-TAGS] Injected OG tags before </head> (regex fallback)`);
    }

    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(ogData.title)}</title>`
    );

    html = html.replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(ogData.description)}" />`
    );

    html = html.replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    );

    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (error) {
    console.error('Error injecting OG tags:', error);
    next();
  }
}

export const ogImageRouter = Router();

/**
 * GET /api/og/vip-club/preview.png
 * Admin preview of the share card for the current request's tenant context.
 * Used by the admin VIP tier settings page. Registered BEFORE the dynamic
 * :tenantId.png route so Express matches the literal "preview" first.
 */
ogImageRouter.get('/api/og/vip-club/preview.png', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) {
      return res.status(404).json({ error: 'No tenant context' });
    }
    const { generateVipClubShareImage, TenantNotFoundError } = await import('../services/vip-club-share-image');
    try {
      const png = await generateVipClubShareImage({ tenantId: tenant.id });
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        // Admin preview should always be fresh; don't aggressively cache.
        'Cache-Control': 'private, max-age=60',
      });
      res.end(png);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      throw err;
    }
  } catch (error) {
    console.error('[VIP-OG] Preview render failed:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

/**
 * GET /api/og/vip-club/:tenantId.png
 * Renders the dynamic VIP Club share card (1200x630 PNG) for a given tenant.
 * Cached for 24 hours via Cache-Control. Tenant ID must be a UUID.
 */
ogImageRouter.get('/api/og/vip-club/:tenantId.png', async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant id' });
    }

    const { generateVipClubShareImage, TenantNotFoundError } = await import('../services/vip-club-share-image');
    try {
      const png = await generateVipClubShareImage({ tenantId });
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        // Crawlers re-fetch; allow CDNs/browsers to cache for a day. Strong but bounded.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      });
      res.end(png);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      throw err;
    }
  } catch (error) {
    console.error('[VIP-OG] Failed to generate VIP Club share image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

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

    try {
      const sharp = (await import('sharp')).default;

      const targetW = 1200;
      const targetH = 630;

      const rotatedBuf = await sharp(contents).rotate().toBuffer();
      const rotatedMeta = await sharp(rotatedBuf).metadata();
      const imgW = rotatedMeta.width || 1200;
      const imgH = rotatedMeta.height || 630;

      const targetRatio = targetW / targetH;
      const imgRatio = imgW / imgH;

      let finalImage: Buffer;

      if (Math.abs(imgRatio - targetRatio) < 0.15) {
        finalImage = await sharp(rotatedBuf)
          .resize(targetW, targetH, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 85 })
          .toBuffer();
      } else {
        const paw = (cx: number, cy: number, s: number, rot: number) => {
          return `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${s})">
            <ellipse cx="0" cy="5" rx="9" ry="10" fill="#8B7355"/>
            <circle cx="-9" cy="-7" r="5" fill="#8B7355"/>
            <circle cx="-3" cy="-12" r="4.5" fill="#8B7355"/>
            <circle cx="3" cy="-12" r="4.5" fill="#8B7355"/>
            <circle cx="9" cy="-7" r="5" fill="#8B7355"/>
          </g>`;
        };
        const prints: string[] = [];
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 10; col++) {
            const ox = row % 2 === 0 ? 0 : 65;
            const x = col * 130 + ox + 30;
            const y = row * 115 + 40;
            const rot = ((row * 7 + col * 13) % 40) - 20;
            prints.push(paw(x, y, 1.0, rot));
          }
        }
        const pawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}">
          <rect width="100%" height="100%" fill="#f0ece4"/>
          <g opacity="0.13">${prints.join('')}</g>
        </svg>`;

        const background = await sharp(Buffer.from(pawSvg))
          .png()
          .toBuffer();

        const photo = await sharp(rotatedBuf)
          .resize(targetW, targetH, { fit: 'inside' })
          .toBuffer();
        const photoMeta = await sharp(photo).metadata();
        const photoW = photoMeta.width || 0;
        const photoH = photoMeta.height || 0;
        const photoLeft = Math.round((targetW - photoW) / 2);
        const photoTop = Math.round((targetH - photoH) / 2);

        finalImage = await sharp(background)
          .composite([{ input: photo, left: photoLeft, top: photoTop }])
          .jpeg({ quality: 85 })
          .toBuffer();
      }

      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': String(finalImage.length),
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(finalImage);
    } catch (sharpErr) {
      console.error('[OG-IMAGE] Sharp processing failed, serving raw image:', sharpErr);
      const contentType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
      res.set({
        'Content-Type': contentType,
        'Content-Length': String(contents.length),
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(contents);
    }
  } catch (error) {
    console.error('[OG-IMAGE] Error fetching OG image:', error);
    res.status(404).json({ error: 'Image not found' });
  }
});
