import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { animals, calendars, tenants, donationLinks } from '@shared/schema';
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
  const defaultImage = `${baseUrl}/icon-512.png`;

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

      if (!animalMatch) {
        console.log(`[OG-TAGS] No pattern match for stripped URL: ${url} (original: ${req.originalUrl})`);
        return next();
      }

      console.log(`[OG-TAGS] Processing animal: tenant=${tenant.subdomain}, url=${url}`);
      const animalId = animalMatch[1];

      if (!uuidRegex.test(animalId)) {
        console.log(`[OG-TAGS] Invalid UUID for animal: ${animalId}`);
        return next();
      }

      const animal = await db.select().from(animals)
        .where(and(
          eq(animals.id, animalId),
          eq(animals.tenantId, tenant.id)
        ))
        .limit(1);

      if (!animal.length) {
        return next();
      }

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
        title: `Meet ${animalData.name} - ${animalData.breed} | ${tenant.name}`,
        description: animalData.bio
          ? animalData.bio.slice(0, 200) + (animalData.bio.length > 200 ? '...' : '')
          : `${animalData.name} is a ${animalData.age} year old ${animalData.breed} looking for a forever home at ${tenant.name}.`,
        image,
      };
    }

    const canonicalUrl = isCustomDomain
      ? `${req.protocol}://${tenant.customDomain}${url}`
      : `${req.protocol}://${req.get('host')}/${tenant.subdomain}${url}`;

    const ogTags = `
    <!-- Dynamic Open Graph Tags for Social Sharing -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(ogData.title)}" />
    <meta property="og:description" content="${escapeHtml(ogData.description)}" />
    <meta property="og:image" content="${escapeHtml(ogData.image)}" />
    <meta property="og:site_name" content="${escapeHtml(tenant.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(ogData.title)}" />
    <meta name="twitter:description" content="${escapeHtml(ogData.description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogData.image)}" />
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
