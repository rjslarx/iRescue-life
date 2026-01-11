import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { animals, tenants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
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

  // Use req.url which has been stripped of tenant prefix by tenant middleware
  const url = req.url;
  
  const animalMatch = url.match(/^\/animal\/([a-zA-Z0-9-]+)/);
  const campaignMatch = url.match(/^\/campaign\/([a-zA-Z0-9-]+)/);
  
  const match = animalMatch || campaignMatch;
  
  if (!match) {
    console.log(`[OG-TAGS] No pattern match for stripped URL: ${url} (original: ${req.originalUrl})`);
    return next();
  }

  const tenant = req.tenant;
  if (!tenant) {
    console.log(`[OG-TAGS] No tenant available for: ${url}`);
    return next();
  }

  console.log(`[OG-TAGS] Processing animal/campaign: tenant=${tenant.subdomain}, url=${url}`);
  const animalId = match[1];

  try {
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
    const tenantData = tenant;
    
    const title = `Meet ${animalData.name} - ${animalData.breed} | ${tenantData.name}`;
    const description = animalData.bio 
      ? animalData.bio.slice(0, 200) + (animalData.bio.length > 200 ? '...' : '')
      : `${animalData.name} is a ${animalData.age} year old ${animalData.breed} looking for a forever home at ${tenantData.name}.`;
    
    const photoUrls = animalData.photoUrls as string[] | null;
    console.log(`[OG-TAGS] Animal ${animalData.name} photoUrls:`, JSON.stringify(photoUrls));
    
    // Use first photo from array, or fall back to default icon
    // photoUrls can be relative paths (/objects/...) or absolute URLs (https://...)
    // We need to ensure absolute URLs for social media crawlers
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let image = `${baseUrl}/icon-512.png`; // Default fallback
    
    if (photoUrls && photoUrls.length > 0 && photoUrls[0]) {
      const firstPhoto = photoUrls[0];
      // Check if it's already an absolute URL
      if (firstPhoto.startsWith('http://') || firstPhoto.startsWith('https://')) {
        image = firstPhoto;
      } else {
        // It's a relative path, make it absolute
        image = `${baseUrl}${firstPhoto.startsWith('/') ? '' : '/'}${firstPhoto}`;
      }
    }
    console.log(`[OG-TAGS] Selected image: ${image}`);
    const canonicalUrl = `${req.protocol}://${req.get('host')}/${tenantData.subdomain}${url}`;

    const ogTags = `
    <!-- Dynamic Open Graph Tags for Social Sharing -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:site_name" content="${escapeHtml(tenantData.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <!-- End Dynamic Open Graph Tags -->
`;

    // Determine the correct index.html path based on environment
    // In development: server/middleware/og-tags.ts -> ../../client/index.html
    // In production: dist/index.js -> public/index.html (built files are in dist/public)
    const isProduction = process.env.NODE_ENV === 'production';
    
    let html: string;
    
    if (isProduction) {
      // Production: index.html is built to the same directory as dist/index.js -> public/
      const prodPath = path.resolve(import.meta.dirname, "public", "index.html");
      console.log(`[OG-TAGS] Production mode, trying: ${prodPath}`);
      try {
        html = await fs.promises.readFile(prodPath, 'utf-8');
        console.log(`[OG-TAGS] Successfully read index.html (${html.length} bytes)`);
      } catch (err) {
        console.error(`[OG-TAGS] Failed to read production index.html:`, err);
        return next();
      }
    } else {
      // Development: read from client/index.html
      const devPath = path.resolve(import.meta.dirname, "..", "..", "client", "index.html");
      console.log(`[OG-TAGS] Development mode, trying: ${devPath}`);
      try {
        html = await fs.promises.readFile(devPath, 'utf-8');
        console.log(`[OG-TAGS] Successfully read index.html (${html.length} bytes)`);
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
      `<title>${escapeHtml(title)}</title>`
    );

    html = html.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`
    );

    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (error) {
    console.error('Error injecting OG tags:', error);
    next();
  }
}
