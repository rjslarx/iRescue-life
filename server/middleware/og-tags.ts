import { Request, Response, NextFunction, Router } from 'express';
import { db } from '../db';
import { animals, calendars, tenants, donationLinks, shopProducts, customPages, peerCampaigns, votingContests, votingContestEntrants, type PageBlock } from '@shared/schema';
import { eq, and, desc, or, isNull, ne } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { votingSocialVersion, votingSocialPhotoPath, renderVotingSocialImage, type VotingSocialData } from '../lib/voting-social-image';

// In development, Vite's @vitejs/plugin-react normally injects a "preamble"
// script into index.html via transformIndexHtml. Because this middleware
// serves the raw client/index.html directly (to inject OG/SEO tags), that
// preamble is missing, which makes React refuse to render ("can't detect
// preamble" error → blank page). Inject the standard preamble ourselves.
// Production reads the built index.html and does not need this.
const VITE_REACT_PREAMBLE = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;

function injectDevVitePreamble(html: string): string {
  if (process.env.NODE_ENV === 'production') return html;
  if (html.includes('__vite_plugin_react_preamble_installed__')) return html;
  return html.replace('<script type="module" src="/src/main.tsx">', `${VITE_REACT_PREAMBLE}\n    <script type="module" src="/src/main.tsx">`);
}

const CRAWLERS = [
  // Social / messaging bots
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Pinterest',
  'Slackbot',
  'TelegramBot',
  'WhatsApp',
  'Discordbot',
  // Search engines
  'Googlebot',
  'Google-InspectionTool',
  'AdsBot-Google',
  'bingbot',
  'DuckDuckBot',
  'YandexBot',
  'Baiduspider',
  'Applebot',
  'Sogou',
  // AI / LLM crawlers
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'cohere-ai',
  'YouBot',
  'Amazonbot',
  'ia_archiver',
  // Generic SEO / preview
  'rogerbot',
  'Screaming Frog',
  'AhrefsBot',
  'SemrushBot',
  'DataForSeoBot',
];

function isCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLERS.some(crawler => ua.includes(crawler.toLowerCase()));
}

// Keep old name as alias for log messages
const isSocialCrawler = isCrawler;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Static blog post metadata mirrored from PlatformBlogPostPage.tsx so crawlers
// receive the real title/description without waiting for client-side hydration.
const PLATFORM_BLOG_POSTS: Record<string, { title: string; excerpt: string; date: string; isoDate: string; category: string; content: string }> = {
  'google-for-nonprofits-for-animal-rescues': {
    title: 'Stop Juggling Spreadsheets: How Your Animal Rescue Can Get Google Workspace for Free',
    excerpt: "Running an animal rescue is chaotic. See how your 501(c)(3) can get Google Workspace for Nonprofits 100% free, and how it integrates with rescue management software like iRescue.life.",
    date: 'January 15, 2025',
    isoDate: '2025-01-15',
    category: 'Nonprofit Resources',
    content: `<p>As a leader in animal rescue, your day is a constant scramble. You're managing foster applications, coordinating vet appointments, tracking animal intakes, scheduling volunteers, and trying to fundraise&mdash;all at the same time.</p>
<p>More often than not, this means data is scattered across personal Gmail accounts, messy Excel spreadsheets, and random Word documents. It's chaotic, insecure, and a massive time-sink.</p>
<p>What if you could have a professional, centralized, and secure system for your entire team? And what if it was 100% free?</p>
<p>That's what the Google for Nonprofits program offers. It gives eligible organizations, including 501(c)(3) animal rescues, free access to the full-power Google Workspace (formerly G Suite) and other powerful tools. This creates the perfect foundation for your rescue's digital operations.</p>
<h2>What Your Rescue Gets with Google Workspace for Nonprofits</h2>
<p>Google Workspace is a suite of cloud-based tools that allows your entire team&mdash;volunteers, fosters, and staff&mdash;to collaborate from anywhere. The free plan includes:</p>
<h3>Professional Email (Gmail)</h3>
<p>Give your team professional email addresses like Amy@yourrescuename.org. This builds credibility with donors and adopters instantly.</p>
<h3>Massive Cloud Storage (Google Drive)</h3>
<p>You get 100 TB of pooled storage to store intake photos, signed adoption contracts, scanned vet records, and fundraising assets.</p>
<h3>Shared Calendars (Google Calendar)</h3>
<p>Run your entire operation from a central schedule with separate, shareable calendars for adoption events, vet appointments, and volunteer shifts.</p>
<h3>Collaborative Documents (Docs and Sheets)</h3>
<p>Replace spreadsheet chaos with real-time collaborative editing for adoption applications, foster agreements, and donor tracking.</p>
<h2>How iRescue.life Supercharges Your Free Google Workspace</h2>
<p>iRescue.life is built to integrate seamlessly with Google Workspace for Nonprofits, creating a unified command center for your entire rescue operation. Connect your Google account to unlock unlimited free email sending through Gmail's API, automatic calendar sync for vet appointments and events, and Google Drive backup for all your rescue documents.</p>
<h2>How to Qualify</h2>
<p>Your organization must be a registered 501(c)(3) charitable organization and agree to Google's terms of service. Government entities, hospitals, and schools are excluded&mdash;animal rescues almost never fall into these categories.</p>
<h2>How to Apply</h2>
<ol>
<li>Go to the Google for Nonprofits website and click "Get Started."</li>
<li>Submit your verification request through Goodstack (Google's verification partner), providing your EIN and 501(c)(3) determination letter.</li>
<li>Wait 2&ndash;14 business days for approval.</li>
<li>Once approved, activate Google Workspace for Nonprofits from your dashboard.</li>
<li>Also activate the Google Ad Grant: $10,000/month in free advertising credits to find adopters and donors.</li>
</ol>
<p>Running an animal rescue is hard enough. Don't let disorganized technology make it harder. Get your free Google Workspace foundation, then centralize everything in iRescue.life.</p>`,
  },
};

// Returns a JSON-LD BlogPosting object for a platform blog post.
function buildBlogJsonLd(post: { title: string; excerpt: string; isoDate: string; category: string }, canonicalUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.excerpt,
        "datePublished": post.isoDate,
        "articleSection": post.category,
        "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
        "publisher": {
          "@type": "Organization",
          "name": "iRescue.life",
          "url": PLATFORM_BASE_URL,
          "logo": { "@type": "ImageObject", "url": PLATFORM_IMAGE },
        },
        "author": { "@type": "Organization", "name": "iRescue.life" },
      },
      {
        "@type": "WebSite",
        "name": "iRescue.life",
        "url": PLATFORM_BASE_URL,
      },
    ],
  };
}

// Wraps noscript body content in a consistent styled container.
function buildTenantNoscript(content: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:1rem 2rem;line-height:1.7">${content}</div>`;
}

// Renders custom-page content blocks to basic HTML for non-JS crawlers.
function renderBlocksToHtml(blocks: PageBlock[]): string {
  return blocks.map((block: PageBlock) => {
    if (block.type === 'paragraph' && 'content' in block && typeof block.content === 'string') {
      return `<p>${escapeHtml(block.content)}</p>`;
    }
    if (block.type === 'heading' && 'content' in block && typeof block.content === 'string') {
      const level = ('level' in block && typeof block.level === 'number') ? Math.min(Math.max(block.level, 2), 4) : 2;
      return `<h${level}>${escapeHtml(block.content)}</h${level}>`;
    }
    if (block.type === 'list' && 'items' in block && Array.isArray(block.items)) {
      const items = (block.items as string[]).map((item: string) => `<li>${escapeHtml(item)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    return '';
  }).filter(Boolean).join('\n');
}

// Returns static noscript HTML for key /platform/** marketing pages.
// Blog post pages are handled separately (full article HTML via PLATFORM_BLOG_POSTS.content).
function buildPlatformPageNoscript(pathname: string): string | undefined {
  const clean = pathname.replace(/\?.*$/, '').replace(/\/$/, '') || '/';
  const w = (html: string) =>
    `<div style="font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:1rem 2rem;line-height:1.7">${html}</div>`;

  if (clean === '/platform' || clean === '') {
    return w(`<h1>iRescue.life &mdash; Complete Animal Rescue Management Platform</h1>
<p>All-in-one software platform designed for 501(c)(3) animal rescue organizations of all sizes. Manage adoptions, volunteers, finances, medical records, and more &mdash; in one place.</p>
<h2>Core Features</h2>
<ul>
<li><strong>Adoption Pipeline</strong> &mdash; Kanban-style application tracking, e-signatures, and automated adopter notifications.</li>
<li><strong>Animal Records</strong> &mdash; Medical history, vaccinations, microchip data, photos, and documents in one place.</li>
<li><strong>Foster Portal</strong> &mdash; Mobile-first portal for fosters to log medications, weight checks, and updates.</li>
<li><strong>Volunteer Coordination</strong> &mdash; Shift scheduling, calendar sync, volunteer applications, and SMS notifications.</li>
<li><strong>Donation &amp; Fundraising</strong> &mdash; Stripe-powered donations, P2P campaigns, event ticket sales, and VIP monthly giving clubs.</li>
<li><strong>Custom Website Builder</strong> &mdash; Public-facing pages with your branding for animals, events, and fundraising campaigns.</li>
<li><strong>Medical Records &amp; CPOE</strong> &mdash; Smart medical ordering, preventative care automation, and complete audit trails.</li>
<li><strong>TNR Management</strong> &mdash; Trap-Neuter-Return colony tracking with Google Maps integration.</li>
<li><strong>Grant Readiness</strong> &mdash; Dashboard for regulatory compliance tracking and statistics required by grant funders.</li>
</ul>
<h2>Pricing</h2>
<p><strong>Community Plan (Free):</strong> Full access with a small platform fee per adoption. Perfect for new or small rescues.</p>
<p><strong>Scale Plan ($39/month):</strong> Flat monthly rate with zero platform fees per adoption. Best for established rescues processing multiple adoptions per month.</p>
<p><a href="${PLATFORM_BASE_URL}/platform/pricing">View full pricing details</a></p>`);
  }

  if (clean === '/platform/pricing') {
    return w(`<h1>Pricing &mdash; iRescue.life</h1>
<p>Simple, transparent pricing for animal rescues. Full access on both plans &mdash; choose the billing model that fits your cash flow.</p>
<h2>Community Plan &mdash; Free</h2>
<p>No monthly fee. A small platform fee per completed adoption transaction. Full access to all features.</p>
<ul>
<li>Unlimited animals, staff, and volunteers</li>
<li>Custom subdomain (yourrescue.irescue.life)</li>
<li>Adoption pipeline, medical records, and foster portal</li>
<li>Stripe-powered donations and event ticket sales</li>
<li>Email and optional SMS notifications</li>
<li>Google Workspace and Gmail API integration</li>
<li>Automated daily backups</li>
</ul>
<h2>Scale Plan &mdash; $39/month</h2>
<p>Flat monthly rate with zero platform fees per adoption. Best for rescues that process multiple adoptions per month.</p>
<ul>
<li>Everything in Community, plus:</li>
<li>Zero platform fees on adoptions and fees</li>
<li>Custom domain support (yourrescue.org)</li>
<li>VIP monthly donor club with tiered membership levels</li>
<li>Priority support and advanced analytics</li>
</ul>`);
  }

  if (clean === '/platform/blog') {
    const postLinks = Object.entries(PLATFORM_BLOG_POSTS).map(([slug, post]) =>
      `<li><article>` +
      `<h2><a href="${PLATFORM_BASE_URL}/platform/blog/${escapeHtml(slug)}">${escapeHtml(post.title)}</a></h2>` +
      `<p><time>${escapeHtml(post.date)}</time> &middot; ${escapeHtml(post.category)}</p>` +
      `<p>${escapeHtml(post.excerpt)}</p>` +
      `</article></li>`
    ).join('');
    return w(`<h1>Blog &mdash; iRescue.life</h1>
<p>Tips, guides, and resources for animal rescue organizations. Learn how to streamline operations, leverage free nonprofit tools, and save more lives.</p>
<ul style="list-style:none;padding:0">${postLinks}</ul>`);
  }

  if (clean === '/platform/security') {
    return w(`<h1>Security &mdash; iRescue.life</h1>
<p>iRescue.life is built with security and data isolation as first-class concerns. Every tenant&rsquo;s data is logically isolated and encrypted in transit.</p>
<h2>Data Isolation</h2>
<p>All tenant data lives in a shared PostgreSQL database with <code>tenant_id</code> row-level filtering applied to every query. No tenant can access another tenant&rsquo;s data.</p>
<h2>Authentication</h2>
<ul>
<li>bcrypt password hashing (no plain-text passwords stored)</li>
<li>TOTP multi-factor authentication for platform administrators</li>
<li>Token-based password reset with short expiry windows</li>
<li>Role-Based Access Control (RBAC) with tenant-scoped permissions</li>
</ul>
<h2>Data Protection</h2>
<ul>
<li>All data in transit encrypted via TLS 1.2+</li>
<li>Daily automated PostgreSQL database backups to Google Cloud Storage</li>
<li>Daily automated tenant file backups to Google Drive</li>
<li>Object storage files served through signed URLs with expiry</li>
</ul>`);
  }

  if (clean === '/platform/integrations') {
    return w(`<h1>Integrations &mdash; iRescue.life</h1>
<p>iRescue.life connects with the tools your rescue already uses.</p>
<ul>
<li><strong>Google Workspace for Nonprofits</strong> &mdash; Free Gmail, Drive, and Calendar for eligible 501(c)(3) organizations. Gmail API for unlimited email; Calendar API for two-way volunteer shift sync.</li>
<li><strong>Stripe</strong> &mdash; Secure donation processing, adoption fee collection, event ticket sales, and VIP monthly subscriptions.</li>
<li><strong>Twilio</strong> &mdash; Optional SMS notifications for adopters, fosters, and volunteers.</li>
<li><strong>Google Maps</strong> &mdash; Colony map view for TNR (Trap-Neuter-Return) programs.</li>
<li><strong>Google Drive</strong> &mdash; Automated daily backup of all tenant documents and uploaded files.</li>
<li><strong>Resend</strong> &mdash; Fallback transactional email delivery when Gmail API is not configured.</li>
<li><strong>Gemini AI</strong> &mdash; AI-powered PDF medical record parsing, social post generation, and post optimizer.</li>
</ul>`);
  }

  if (clean === '/platform/privacy') {
    return w(`<h1>Privacy Policy &mdash; iRescue.life</h1>
<p><em>Operated by Turbeau, LLC</em></p>
<p>iRescue.life collects only the information necessary to provide the platform to rescue organizations (Tenants) and the adopters, fosters, donors, and volunteers they serve. We do not sell personal information to third parties.</p>
<h2>Data Storage</h2>
<p>All data is stored in PostgreSQL databases hosted in the United States with daily encrypted backups. All data transmission is encrypted via TLS.</p>
<h2>Contact</h2>
<p>For questions or data deletion requests, contact <a href="mailto:privacy@irescue.life">privacy@irescue.life</a>.</p>`);
  }

  if (clean === '/platform/terms') {
    return w(`<h1>Terms of Use &mdash; iRescue.life</h1>
<p><em>Operated by Turbeau, LLC</em></p>
<p>By accessing or using iRescue.life, you agree to these Terms of Use. iRescue.life is a software-as-a-service platform licensed to animal rescue organizations (&ldquo;Tenants&rdquo;).</p>
<h2>Tenant Responsibilities</h2>
<ul>
<li>Tenants are responsible for ensuring their use of the platform complies with applicable laws.</li>
<li>Tenants must obtain proper consents from adopters, fosters, donors, and volunteers.</li>
<li>Tenants must maintain accurate 501(c)(3) status to qualify for platform access.</li>
</ul>
<h2>Contact</h2>
<p>For questions, contact <a href="mailto:support@irescue.life">support@irescue.life</a>.</p>`);
  }

  return undefined;
}

// Returns true for known public-facing tenant routes that should always
// receive server-injected metadata regardless of User-Agent.
export function isKnownPublicTenantRoute(cleanUrl: string): boolean {
  const staticPublicRoutes = [
    '/',
    '/animals',
    '/donate',
    '/vip-club',
    '/shop',
    '/contact',
    '/volunteer',
    '/become-a-foster',
    '/foster',
    '/surrender',
    '/transparency',
    '/dashboard/calendar',
  ];
  if (staticPublicRoutes.includes(cleanUrl)) return true;
  // Dynamic public routes
  if (/^\/animal\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/donate\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/campaigns?\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/campaign\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/shop\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/fundraise\/[^/?]/.test(cleanUrl)) return true;
  if (/^\/contest\/[a-zA-Z0-9-]+$/.test(cleanUrl)) return true;
  return false;
}

const CONTEST_ROUTE = /^\/contest\/([a-zA-Z0-9-]+)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only a single, valid UUID is eligible for a contestant share preview.
// Invalid or repeated query values must never make it into the canonical URL.
export function contestShareEntrantId(url: string): string | null {
  const params = new URL(url, 'https://localhost').searchParams;
  const entrants = params.getAll('entrant');
  return entrants.length === 1 && UUID_PATTERN.test(entrants[0]) ? entrants[0] : null;
}

export function contestShareMetadata(
  contest: { title: string; description: string | null; imageUrl: string | null },
  rescueName: string,
  entrant?: { name: string; description?: string | null; photoUrl: string | null } | null,
): { title: string; description: string; imageUrl: string | null } {
  return {
    title: entrant ? `Vote for ${entrant.name} | ${contest.title}` : `${contest.title} | ${rescueName}`,
    description: (entrant
      ? `Vote for ${entrant.name} in ${contest.title}! $1 = 1 vote. Support ${rescueName}.`
      : contest.description?.trim() || `Vote in ${contest.title}! $1 = 1 vote. Support ${rescueName}.`),
    imageUrl: entrant?.photoUrl || contest.imageUrl,
  };
}

const PLATFORM_BASE_URL = 'https://irescue.life';
const PLATFORM_IMAGE = `${PLATFORM_BASE_URL}/icon-512.png`;
const PLATFORM_SITE_NAME = 'iRescue.life';

// Returns per-route OG data for /platform/** pages, or null if the path is not a
// recognised platform marketing route.
function getPlatformOGData(pathname: string): { title: string; description: string; image: string; canonical: string } | null {
  const clean = pathname.replace(/\?.*$/, '').replace(/\/$/, '') || '/';

  if (clean === '/platform' || clean === '') {
    return {
      title: `${PLATFORM_SITE_NAME} - Complete Animal Rescue Management Platform`,
      description: 'All-in-one platform for animal rescues. Manage adoptions, volunteers, finances, medical records, and more. Start free or upgrade to Scale ($39/mo) for zero platform fees.',
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform`,
    };
  }
  if (clean === '/platform/pricing') {
    return {
      title: `Pricing - ${PLATFORM_SITE_NAME}`,
      description: 'Simple, transparent pricing for animal rescues. Full access on both plans — choose the billing model that fits your cash flow. Start free or go flat-rate at $39/mo.',
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/pricing`,
    };
  }
  if (clean === '/platform/privacy') {
    return {
      title: `Privacy Policy - ${PLATFORM_SITE_NAME}`,
      description: `Privacy Policy for ${PLATFORM_SITE_NAME} animal rescue management platform, operated by Turbeau, LLC.`,
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/privacy`,
    };
  }
  if (clean === '/platform/terms') {
    return {
      title: `Terms of Use - ${PLATFORM_SITE_NAME}`,
      description: `Terms of Use for ${PLATFORM_SITE_NAME} animal rescue management platform, operated by Turbeau, LLC.`,
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/terms`,
    };
  }
  if (clean === '/platform/security') {
    return {
      title: `Security - ${PLATFORM_SITE_NAME}`,
      description: `Learn about ${PLATFORM_SITE_NAME}'s comprehensive security measures and data protection practices.`,
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/security`,
    };
  }
  if (clean === '/platform/integrations') {
    return {
      title: `Integrations - ${PLATFORM_SITE_NAME}`,
      description: `Explore all integrations available with ${PLATFORM_SITE_NAME} animal rescue management platform.`,
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/integrations`,
    };
  }
  if (clean === '/platform/blog') {
    return {
      title: `Blog - ${PLATFORM_SITE_NAME}`,
      description: 'Tips, guides, and insights for animal rescue organizations. Learn how to streamline operations and save more lives.',
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/blog`,
    };
  }
  const blogSlugMatch = clean.match(/^\/platform\/blog\/([a-z0-9-]+)$/i);
  if (blogSlugMatch) {
    const slug = blogSlugMatch[1];
    const post = PLATFORM_BLOG_POSTS[slug];
    if (post) {
      return {
        title: `${post.title} - ${PLATFORM_SITE_NAME}`,
        description: post.excerpt,
        image: PLATFORM_IMAGE,
        canonical: `${PLATFORM_BASE_URL}/platform/blog/${slug}`,
      };
    }
    // Unknown blog slug — generic fallback so at least the blog section is recognised
    return {
      title: `Blog - ${PLATFORM_SITE_NAME}`,
      description: 'Tips, guides, and insights for animal rescue organizations.',
      image: PLATFORM_IMAGE,
      canonical: `${PLATFORM_BASE_URL}/platform/blog`,
    };
  }
  return null;
}

async function serveInjectedHtml(
  req: Request,
  res: Response,
  next: NextFunction,
  title: string,
  description: string,
  canonicalUrl: string,
  ogImage: string,
  siteName: string,
  ogType: 'website' | 'article' = 'website',
  options?: {
    // JSON-LD structured data object (serialized into a <script type="application/ld+json"> in <head>)
    jsonLd?: object;
    // Raw HTML injected inside <noscript> before </body>. Visible to non-JS crawlers only.
    noscriptBody?: string;
  },
): Promise<void> {
  const ogMetaTags = `
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="${escapeHtml(siteName)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`;

  const isProduction = process.env.NODE_ENV === 'production';
  let html: string;
  if (isProduction) {
    const prodPath = path.resolve(import.meta.dirname, 'public', 'index.html');
    try {
      html = await fs.promises.readFile(prodPath, 'utf-8');
    } catch (err) {
      console.error(`[OG-TAGS] Failed to read production index.html:`, err);
      return next();
    }
  } else {
    const devPath = path.resolve(import.meta.dirname, '..', '..', 'client', 'index.html');
    try {
      html = await fs.promises.readFile(devPath, 'utf-8');
      html = injectDevVitePreamble(html);
    } catch (err) {
      console.error(`[OG-TAGS] Failed to read development index.html:`, err);
      return next();
    }
  }

  // Inject / replace OG meta tags
  const ogRegex = /<meta property="og:type" content="website"\s*\/?>([\s\S]*?)<meta name="twitter:image"[^>]*\/?>/;
  if (ogRegex.test(html)) {
    html = html.replace(ogRegex, () => ogMetaTags.trim());
  } else {
    html = html.replace('</head>', () => `${ogMetaTags}\n</head>`);
  }
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, () => `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);

  // Inject JSON-LD structured data into <head> (visible to all crawlers)
  if (options?.jsonLd) {
    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`;
    html = html.replace('</head>', () => `${jsonLdScript}\n</head>`);
  }

  // Inject noscript body content visible only to non-JS crawlers.
  // Placed before </body> so React's #root div is unaffected.
  if (options?.noscriptBody) {
    html = html.replace('</body>', () => `<noscript id="server-page-content">${options.noscriptBody}</noscript>\n</body>`);
  }

  res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
}

export function isSensitiveTrainingTokenPath(value?: string): boolean {
  if (!value) return false;
  const pathOnly = value.split(/[?#]/, 1)[0];
  return /^\/(?:[^/]+\/)?volunteer-training\/[^/]+\/?$/.test(pathOnly);
}

export async function injectOGTags(req: Request, res: Response, next: NextFunction) {
  if (isSensitiveTrainingTokenPath(req.url) || isSensitiveTrainingTokenPath(req.originalUrl)) return next();
  const userAgent = req.get('User-Agent');

  // Always skip asset / API paths
  const assetPaths = ['/objects/', '/api/', '/assets/', '/icon-', '/manifest', '/favicon'];
  if (assetPaths.some(p => req.url.includes(p) || req.originalUrl.includes(p))) {
    return next();
  }

  // ── Platform marketing pages (/platform/**) ──────────────────────────────
  // Served to ALL requests (no UA gate) so search engines, AI crawlers, and
  // even plain HTTP clients receive real titles/descriptions on the first
  // response — not the generic SPA shell.
  const platformData = getPlatformOGData(req.url);
  if (platformData) {
    const blogSlugMatch = req.url.match(/\/platform\/blog\/([a-z0-9-]+)/i);
    let jsonLd: object | undefined;
    let noscriptBody: string | undefined;
    if (blogSlugMatch) {
      const post = PLATFORM_BLOG_POSTS[blogSlugMatch[1]];
      if (post) {
        jsonLd = buildBlogJsonLd(post, platformData.canonical);
        // Article body injected in <noscript> so non-JS crawlers can read it
        noscriptBody = `<article style="font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:1rem 2rem;line-height:1.7">` +
          `<header style="margin-bottom:1.5rem">` +
          `<span style="font-size:.85rem;color:#666;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(post.category)}</span>` +
          `<h1 style="margin:.5rem 0 .75rem;font-size:2rem">${escapeHtml(post.title)}</h1>` +
          `<time style="font-size:.9rem;color:#555">${escapeHtml(post.date)}</time>` +
          `<p style="font-size:1.1rem;color:#444;margin-top:.75rem">${escapeHtml(post.excerpt)}</p>` +
          `</header>` +
          `<div>${post.content}</div>` +
          `</article>`;
      }
    }
    // For non-blog platform pages, build static body content from the page content function
    if (!noscriptBody) {
      noscriptBody = buildPlatformPageNoscript(req.url);
    }
    const ogType = blogSlugMatch ? 'article' : 'website';
    console.log(`[OG-TAGS] Platform page (all UA): ${platformData.canonical}`);
    return serveInjectedHtml(
      req, res, next,
      platformData.title, platformData.description,
      platformData.canonical, platformData.image,
      PLATFORM_SITE_NAME, ogType,
      { jsonLd, noscriptBody },
    );
  }

  // ── Tenant pages ──────────────────────────────────────────────────────────
  const tenant = req.tenant;
  if (!tenant) {
    return next();
  }

  let url = req.url;
  const tenantPrefix = `/${tenant.subdomain}`;
  if (url.startsWith(tenantPrefix + '/') || url === tenantPrefix) {
    url = url.slice(tenantPrefix.length) || '/';
  }

  const PLATFORM_DOMAIN = 'irescue.life';

  // Strip query string for route matching
  const cleanUrl = url.split('?')[0].replace(/\/$/, '') || '/';

  // Known public tenant routes are served to ALL requests so Google's initial
  // HTML fetch and AI crawlers that don't execute JavaScript both receive the
  // real page metadata on the first response.
  // All other (non-public) routes remain crawler-only to avoid unnecessary
  // DB overhead on authenticated/admin requests.
  if (!isKnownPublicTenantRoute(cleanUrl) && !isCrawler(userAgent)) {
    return next();
  }

  console.log(`[OG-TAGS] Tenant public page: tenant=${tenant.subdomain}, url=${url}, ua=${userAgent?.substring(0, 60)}`);

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

  let ogData: { title: string; description: string; image: string; imageTheme?: string | null } | null = null;
  let tenantNoscriptBody: string | undefined;
  // A validated contestant is the only query value included in contest canonical URLs.
  let contestCanonicalEntrantId: string | null = null;

  try {
    const contestMatch = cleanUrl.match(CONTEST_ROUTE);
    if (contestMatch) {
      const [contest] = await db.select({
        id: votingContests.id,
        title: votingContests.title,
        description: votingContests.description,
        imageUrl: votingContests.imageUrl,
        primaryColor: votingContests.primaryColor,
        accentColor: votingContests.accentColor,
        themeBackground: votingContests.themeBackground,
      }).from(votingContests).where(and(
        eq(votingContests.tenantId, tenant.id),
        eq(votingContests.slug, contestMatch[1]),
        eq(votingContests.isActive, true),
      )).limit(1);

      if (contest) {
        const requestedId = contestShareEntrantId(url);
        const [entrant] = requestedId ? await db.select({
          id: votingContestEntrants.id,
          name: votingContestEntrants.name,
          ownerDisplayName: votingContestEntrants.ownerDisplayName,
          description: votingContestEntrants.description,
          photoUrl: votingContestEntrants.photoUrl,
        }).from(votingContestEntrants).where(and(
          eq(votingContestEntrants.id, requestedId),
          eq(votingContestEntrants.tenantId, tenant.id),
          eq(votingContestEntrants.contestId, contest.id),
        )).limit(1) : [];

        if (entrant) contestCanonicalEntrantId = entrant.id;
        const share = contestShareMetadata(contest, tenant.name, entrant);
        ogData = {
          title: share.title,
          description: share.description,
          image: entrant
            ? `${baseUrl}/api/public/voting-contest-entrants/${entrant.id}/social-image?v=${votingSocialVersion({
                name: entrant.name, ownerDisplayName: entrant.ownerDisplayName, contestTitle: contest.title, rescueName: tenant.name,
                photoUrl: entrant.photoUrl, themeBackground: contest.themeBackground,
                primaryColor: contest.primaryColor, accentColor: contest.accentColor,
                backgroundImageUrl: contest.backgroundImageUrl, backgroundImageTarget: contest.backgroundImageTarget,
              })}`
            : resolveImageUrl(share.imageUrl) || defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>${escapeHtml(share.title)}</h1><p>${escapeHtml(share.description)}</p>`
        );
      }
    }

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
      tenantNoscriptBody = buildTenantNoscript(
        `<h1>Volunteer Calendar &mdash; ${escapeHtml(tenant.name)}</h1>` +
        (calendarNames ? `<p>Available calendars: ${escapeHtml(calendarNames)}.</p>` : '') +
        `<p>View open volunteer shifts and sign up to help ${escapeHtml(tenant.name)} save more animals.</p>`
      );
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
            const linkDesc = link.description
              ? link.description.slice(0, 200) + (link.description.length > 200 ? '...' : '')
              : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`;
            ogData = {
              title: `${link.title} | ${tenant.name}`,
              description: linkDesc,
              image,
            };
            tenantNoscriptBody = buildTenantNoscript(
              `<h1>${escapeHtml(link.title)}</h1>` +
              `<p>${escapeHtml(linkDesc)}</p>` +
              `<p>Support ${escapeHtml(tenant.name)} with a secure online donation through this fundraising page.</p>`
            );
          }
        }
      }
    }

    if (!ogData) {
      const fundraiseMatch = cleanUrl.match(/^\/fundraise\/([a-zA-Z0-9-]+)$/);
      if (fundraiseMatch) {
        const slug = fundraiseMatch[1];
        console.log(`[OG-TAGS] Processing peer campaign: tenant=${tenant.subdomain}, slug=${slug}`);
        const campaignData = await db.select({
          campaignTitle: peerCampaigns.campaignTitle,
          campaignStory: peerCampaigns.campaignStory,
          coverImageUrl: peerCampaigns.coverImageUrl,
          themeBackground: peerCampaigns.themeBackground,
          creatorName: peerCampaigns.creatorName,
          goalAmount: peerCampaigns.goalAmount,
          amountRaised: peerCampaigns.amountRaised,
        })
        .from(peerCampaigns)
        .where(and(
          eq(peerCampaigns.slug, slug),
          eq(peerCampaigns.tenantId, tenant.id),
          eq(peerCampaigns.isActive, true)
        ))
        .limit(1);

        if (campaignData.length > 0) {
          const campaign = campaignData[0];
          const image = resolveImageUrl(campaign.coverImageUrl) || defaultImage;
          const storyDesc = campaign.campaignStory
            ? campaign.campaignStory.slice(0, 200) + (campaign.campaignStory.length > 200 ? '...' : '')
            : `${campaign.creatorName} is fundraising for ${tenant.name}. Every donation helps animals in need.`;
          ogData = {
            title: `${campaign.campaignTitle} | ${tenant.name}`,
            description: storyDesc,
            image,
            imageTheme: campaign.themeBackground,
          };
          tenantNoscriptBody = buildTenantNoscript(
            `<h1>${escapeHtml(campaign.campaignTitle)}</h1>` +
            `<p>${escapeHtml(storyDesc)}</p>` +
            `<p>This fundraiser by ${escapeHtml(campaign.creatorName)} supports ${escapeHtml(tenant.name)}. Every donation helps animals in need.</p>`
          );
          console.log(`[OG-TAGS] Peer campaign found: ${campaign.campaignTitle}, image=${image}`);
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
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>${escapeHtml(title)}</h1>` +
          `<p>${escapeHtml(description)}</p>` +
          `<p>Your donation directly supports the animals in ${escapeHtml(tenant.name)}'s care. 100% of funds go toward rescue operations, veterinary care, and finding forever homes.</p>`
        );
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
          const campaignDesc = campaign.description
            ? campaign.description.slice(0, 200) + (campaign.description.length > 200 ? '...' : '')
            : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`;
          ogData = {
            title: `${campaign.title} | ${tenant.name}`,
            description: campaignDesc,
            image,
          };
          tenantNoscriptBody = buildTenantNoscript(
            `<h1>${escapeHtml(campaign.title)}</h1>` +
            `<p>${escapeHtml(campaignDesc)}</p>` +
            `<p>This fundraising campaign supports ${escapeHtml(tenant.name)}. Every donation helps animals in need.</p>`
          );
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
            const campaignDesc = campaign.description
              ? campaign.description.slice(0, 200) + (campaign.description.length > 200 ? '...' : '')
              : `Support ${tenant.name} with a donation. Every contribution helps animals in need.`;
            ogData = {
              title: `${campaign.title} | ${tenant.name}`,
              description: campaignDesc,
              image,
            };
            tenantNoscriptBody = buildTenantNoscript(
              `<h1>${escapeHtml(campaign.title)}</h1>` +
              `<p>${escapeHtml(campaignDesc)}</p>`
            );
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
              tenantNoscriptBody = buildTenantNoscript(
                `<h1>Help ${escapeHtml(animalData.name)} &mdash; Medical Fund</h1>` +
                `<p>${escapeHtml(animalData.name)} is in the care of ${escapeHtml(tenant.name)} and needs your support for medical care.</p>` +
                `<p>Every donation helps ${escapeHtml(tenant.name)} provide life-saving treatment. Please donate today.</p>`
              );
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
              eq(animals.tenantId, tenant.id),
              or(
                eq(animals.status, 'available'),
                eq(animals.status, 'adoption_pending'),
                eq(animals.status, 'in_trial' as any),
              ),
              eq(animals.medicalHold, false),
              or(isNull(animals.recordType), ne(animals.recordType, 'tnr')),
            ))
            .limit(1);

          if (animal.length) {
            const animalData = animal[0];
            const photoUrls = animalData.photoUrls as string[] | null;
            let image = defaultImage;

            if (photoUrls && photoUrls.length > 0 && photoUrls[0]) {
              image = resolveImageUrl(photoUrls[0]) || defaultImage;
            }

            const animalDesc = animalData.bio
              ? animalData.bio.slice(0, 200) + (animalData.bio.length > 200 ? '...' : '')
              : `${animalData.name} is a ${animalData.age} year old ${animalData.breed} looking for a forever home at ${tenant.name}.`;
            ogData = {
              title: `Meet ${animalData.name} - ${animalData.breed} | ${tenant.name}`,
              description: animalDesc,
              image,
            };
            const metaParts: string[] = [];
            if (animalData.species) metaParts.push(escapeHtml(animalData.species));
            if (animalData.breed) metaParts.push(escapeHtml(animalData.breed));
            if (animalData.age != null) metaParts.push(`${escapeHtml(String(animalData.age))} years old`);
            tenantNoscriptBody = buildTenantNoscript(
              `<h1>Meet ${escapeHtml(animalData.name)}</h1>` +
              (metaParts.length ? `<p>${metaParts.join(' &middot; ')}</p>` : '') +
              `<p>${escapeHtml(animalDesc)}</p>` +
              `<p>${animalData.status === 'available' ? 'Available for adoption' : 'Learn more'} at ${escapeHtml(tenant.name)}.</p>`
            );
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
            socialImageUrl: shopProducts.socialImageUrl,
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
            const preferredImage = product.socialImageUrl || product.imageUrls?.[0];
            const productImage = preferredImage
              ? (resolveImageUrl(preferredImage) || defaultImage)
              : defaultImage;
            const priceStr = product.basePrice ? `$${parseFloat(product.basePrice).toFixed(2)}` : '';
            const productDesc = product.description
              ? product.description.slice(0, 200) + (product.description.length > 200 ? '...' : '')
              : `Shop ${product.name} at ${tenant.name}. Support animal rescue with every purchase!`;
            ogData = {
              title: `${product.name}${priceStr ? ` - ${priceStr}` : ''} | ${tenant.name}`,
              description: productDesc,
              image: productImage,
            };
            tenantNoscriptBody = buildTenantNoscript(
              `<h1>${escapeHtml(product.name)}${priceStr ? ` &mdash; ${escapeHtml(priceStr)}` : ''}</h1>` +
              `<p>${escapeHtml(productDesc)}</p>` +
              `<p>Available in the ${escapeHtml(tenant.name)} shop. Every purchase supports animal rescue operations.</p>`
            );
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
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Shop &mdash; ${escapeHtml(tenant.name)}</h1>` +
          `<p>Browse products from ${escapeHtml(tenant.name)}. Every purchase supports our animal rescue operations, veterinary care, and adoption programs.</p>`
        );
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
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Join the ${escapeHtml(tenant.name)} Hero Club</h1>` +
          `<p>Become a monthly sustaining donor and help ${escapeHtml(tenant.name)} provide consistent, life-saving care to animals in need every single month.</p>` +
          `<p>Monthly members unlock exclusive benefits and recognition on our Wall of Heroes. Choose a membership tier that works for you.</p>`
        );
        console.log(`[OG-TAGS] VIP Club match for tenant=${tenant.subdomain}, image=${vipImage}`);
      }
    }

    // ── Contact page ─────────────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/contact\/?(?:\?.*)?$/i.test(url)) {
        ogData = {
          title: `Contact Us | ${tenant.name}`,
          description: `Get in touch with ${tenant.name}. Send us a message and we'll get back to you as soon as possible.`,
          image: defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Contact ${escapeHtml(tenant.name)}</h1>` +
          `<p>Have a question about adoption, fostering, volunteering, or donating? Use the contact form on this page to reach us and we will respond as soon as possible.</p>`
        );
      }
    }

    // ── Volunteer page ────────────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/volunteer\/?(?:\?.*)?$/i.test(url)) {
        ogData = {
          title: `Volunteer - ${tenant.name}`,
          description: `Make a difference in the lives of animals in need. Browse volunteer opportunities and apply to join ${tenant.name}'s dedicated team.`,
          image: defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Volunteer at ${escapeHtml(tenant.name)}</h1>` +
          `<p>Make a difference in the lives of animals in need. ${escapeHtml(tenant.name)} relies on dedicated volunteers to help with dog walks, socialization, transport, events, and much more.</p>` +
          `<p>Browse open volunteer opportunities on this page and submit your application. No experience required &mdash; just a love of animals and a willingness to help.</p>`
        );
      }
    }

    // ── Become a Foster page ──────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/become-a-foster\/?(?:\?.*)?$/i.test(url) || /^\/foster\/?(?:\?.*)?$/i.test(url)) {
        ogData = {
          title: `Become a Foster - ${tenant.name}`,
          description: `Open your home to an animal in need. Learn about fostering requirements and apply to become a foster parent at ${tenant.name}.`,
          image: defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Become a Foster for ${escapeHtml(tenant.name)}</h1>` +
          `<p>Foster parents provide temporary homes for animals while they wait for adoption. Fostering saves lives by freeing up shelter space and giving animals the individualized care they need.</p>` +
          `<p>Review our fostering requirements on this page and submit your foster application. ${escapeHtml(tenant.name)} provides all supplies; you provide the love and a safe space.</p>`
        );
      }
    }

    // ── Surrender page ────────────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/surrender\/?(?:\?.*)?$/i.test(url)) {
        ogData = {
          title: `Surrender an Animal - ${tenant.name}`,
          description: `Need to rehome your pet? ${tenant.name} is here to help. Submit an animal surrender request and we'll work with you to find the best solution for your pet.`,
          image: defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Surrender an Animal &mdash; ${escapeHtml(tenant.name)}</h1>` +
          `<p>We understand that circumstances change. If you need to rehome your pet, ${escapeHtml(tenant.name)} is here to help. Please complete the surrender request form on this page.</p>` +
          `<p>Our team will review your request and contact you to discuss next steps and availability. Surrender intake is subject to capacity.</p>`
        );
      }
    }

    // ── Transparency page ─────────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/transparency\/?(?:\?.*)?$/i.test(url)) {
        ogData = {
          title: `Transparency | ${tenant.name}`,
          description: `View ${tenant.name}'s nonprofit documents, financial reports, and organizational transparency information. We believe in complete openness with our donors and supporters.`,
          image: defaultImage,
        };
        tenantNoscriptBody = buildTenantNoscript(
          `<h1>Transparency &mdash; ${escapeHtml(tenant.name)}</h1>` +
          `<p>${escapeHtml(tenant.name)} is committed to complete transparency with our donors, adopters, and the public. This page contains our nonprofit registration documents, financial reports, and organizational statistics.</p>` +
          `<p>We believe accountability and openness are essential for maintaining the trust of our community and the animals we serve.</p>`
        );
      }
    }

    // ── Animals listing page ──────────────────────────────────────────────────
    if (!ogData) {
      if (/^\/animals\/?(?:\?.*)?$/i.test(url)) {
        // Fetch a sample of available animals to populate the noscript body
        const animalList = await db.select({
          id: animals.id,
          name: animals.name,
          species: animals.species,
          breed: animals.breed,
          age: animals.age,
          bio: animals.bio,
        }).from(animals)
          .where(eq(animals.tenantId, tenant.id))
          .limit(12);

        ogData = {
          title: `Adoptable Animals | ${tenant.name}`,
          description: `Meet the animals available for adoption at ${tenant.name}. Find your perfect companion and give an animal a forever home.`,
          image: defaultImage,
        };

        if (animalList.length > 0) {
          const animalItems = animalList.map(a => {
            const meta: string[] = [];
            if (a.species) meta.push(escapeHtml(a.species));
            if (a.breed) meta.push(escapeHtml(a.breed));
            if (a.age != null) meta.push(`${escapeHtml(String(a.age))} yrs`);
            const bioSnippet = a.bio ? ` &mdash; ${escapeHtml(a.bio.slice(0, 120))}${a.bio.length > 120 ? '...' : ''}` : '';
            return `<li><strong>${escapeHtml(a.name)}</strong>${meta.length ? ` (${meta.join(', ')})` : ''}${bioSnippet}</li>`;
          }).join('');
          tenantNoscriptBody = buildTenantNoscript(
            `<h1>Adoptable Animals &mdash; ${escapeHtml(tenant.name)}</h1>` +
            `<p>Meet the animals looking for forever homes at ${escapeHtml(tenant.name)}. Visit our website to view photos, read their full bios, and submit an adoption application.</p>` +
            `<ul>${animalItems}</ul>`
          );
        } else {
          tenantNoscriptBody = buildTenantNoscript(
            `<h1>Adoptable Animals &mdash; ${escapeHtml(tenant.name)}</h1>` +
            `<p>Visit ${escapeHtml(tenant.name)}'s website to meet animals currently available for adoption and submit an application.</p>`
          );
        }
      }
    }

    if (!ogData) {
      const customPageMatch = url.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:\?.*)?$/i);
      if (customPageMatch) {
        const slug = customPageMatch[1].toLowerCase();
        const knownPrefixes = [
          'login', 'register', 'dashboard', 'admin', 'api', 'apply',
          'foster-portal', 'intake', 'contact', 'volunteer', 'foster',
          'become-a-foster', 'surrender', 'transparency', 'animals',
        ];
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
            tenantNoscriptBody = buildTenantNoscript(
              `<h1>${escapeHtml(page.title)}</h1>` +
              (page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : '') +
              renderBlocksToHtml(blocks)
            );
            console.log(`[OG-TAGS] Custom page match: slug=${slug}, tenant=${tenant.subdomain}`);
          }
        }
      }
    }

    if (!ogData) {
      const tagline = tenant.tagline || `${tenant.name} - Adopt, Foster, Donate. Help animals find their forever homes.`;
      ogData = {
        title: tenant.name,
        description: tagline,
        image: defaultImage,
      };
      tenantNoscriptBody = buildTenantNoscript(
        `<h1>${escapeHtml(tenant.name)}</h1>` +
        `<p>${escapeHtml(tagline)}</p>` +
        `<p>Visit our website to meet adoptable animals, learn about volunteer and foster opportunities, and support our mission.</p>`
      );
      console.log(`[OG-TAGS] Using tenant fallback for: ${url} (tenant=${tenant.subdomain})`);
    }

    // Narrow for use inside replace callbacks (closures defeat TS narrowing on `let`).
    const resolvedOgData = ogData;

    // Build canonical URL based on the resolved routing mode:
    // - Custom domain: canonical lives on the tenant's verified custom domain
    // - Legacy subdomain (demo.irescue.life): canonical is at the root of the subdomain host,
    //   with no extra /{tenant.subdomain} path segment
    // - Path-based (irescue.life/demo/...): canonical includes the tenant subdomain prefix
    const canonicalPath = contestMatch
      ? `${cleanUrl}${contestCanonicalEntrantId ? `?entrant=${encodeURIComponent(contestCanonicalEntrantId)}` : ''}`
      : url;
    const canonicalUrl = isCustomDomain
      ? `${protocol}://${tenant.customDomain}${canonicalPath}`
      : isLegacySubdomain
        ? `${protocol}://${hostname}${canonicalPath}`
        : `${protocol}://${hostname}/${tenant.subdomain}${canonicalPath}`;

    let ogImage = ogData.image;
    const ogImageOriginal = ogData.image;
    if (ogImage.includes('/objects/')) {
      const objectsPath = ogImage.includes('/objects/') ? ogImage.substring(ogImage.indexOf('/objects/')) : '';
      if (objectsPath) {
        ogImage = `${baseUrl}/api/og-image?url=${encodeURIComponent(objectsPath)}`;
        if (ogData.imageTheme) {
          ogImage += `&theme=${encodeURIComponent(ogData.imageTheme)}`;
        }
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
        html = injectDevVitePreamble(html);
      } catch (err) {
        console.error(`[OG-TAGS] Failed to read development index.html:`, err);
        return next();
      }
    }

    const ogRegex = /<meta property="og:type" content="website"\s*\/?>([\s\S]*?)<meta name="twitter:image"[^>]*\/?>/;
    const regexMatched = ogRegex.test(html);

    if (regexMatched) {
      html = html.replace(ogRegex, () => ogMetaTags.trim());
      console.log(`[OG-TAGS] Replaced existing OG tags via regex`);
    } else {
      html = html.replace('</head>', () => `${ogMetaTags}\n</head>`);
      console.log(`[OG-TAGS] Injected OG tags before </head> (regex fallback)`);
    }

    html = html.replace(
      /<title>[^<]*<\/title>/,
      () => `<title>${escapeHtml(resolvedOgData.title)}</title>`
    );

    html = html.replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      () => `<meta name="description" content="${escapeHtml(resolvedOgData.description)}" />`
    );

    html = html.replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/,
      () => `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    );

    if (tenantNoscriptBody) {
      html = html.replace('</body>', () => `<noscript>${tenantNoscriptBody}</noscript>\n</body>`);
    }

    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (error) {
    console.error('Error injecting OG tags:', error);
    next();
  }
}

export const ogImageRouter = Router();

ogImageRouter.get('/api/public/voting-contest-entrants/:id/social-image', async (req, res) => {
  const tenant = req.tenant;
  if (!tenant || !UUID_PATTERN.test(req.params.id)) return res.sendStatus(404);
  try {
    const [row] = await db.select({
      name: votingContestEntrants.name,
      ownerDisplayName: votingContestEntrants.ownerDisplayName,
      photoUrl: votingContestEntrants.photoUrl,
      contestTitle: votingContests.title,
      backgroundImageUrl: votingContests.backgroundImageUrl,
      backgroundImageTarget: votingContests.backgroundImageTarget,
      themeBackground: votingContests.themeBackground,
      primaryColor: votingContests.primaryColor,
      accentColor: votingContests.accentColor,
    }).from(votingContestEntrants).innerJoin(votingContests, eq(votingContestEntrants.contestId, votingContests.id))
      .where(and(
        eq(votingContestEntrants.id, req.params.id),
        eq(votingContestEntrants.tenantId, tenant.id),
        eq(votingContests.tenantId, tenant.id),
        eq(votingContests.isActive, true),
      )).limit(1);
    if (!row) return res.sendStatus(404);
    const data: VotingSocialData = { ...row, rescueName: tenant.name };
    let photo: Buffer | undefined;
    const photoPath = votingSocialPhotoPath(row.photoUrl, tenant.id);
    if (photoPath) {
      try {
        const { ObjectStorageService } = await import('../objectStorage');
        const { ObjectPermission } = await import('../objectAcl');
        const storage = new ObjectStorageService();
        const file = await storage.getObjectEntityFile(photoPath);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) <= 10_000_000 &&
            await storage.canAccessObjectEntity({ objectFile: file, requestedPermission: ObjectPermission.READ })) {
          const [download] = await file.download();
          photo = download;
        }
      } catch (error) {
        console.warn('[VOTING-SOCIAL] Photo unavailable; rendering branded card:', error);
      }
    }
    let customBackground: Buffer | undefined;
    if (row.backgroundImageUrl) {
      customBackground = await (await import('../lib/voting-background')).readVotingBackground(row.backgroundImageUrl, tenant.id);
    }
    const image = await renderVotingSocialImage(data, photo, customBackground);
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': String(image.length),
      'Cache-Control': 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    }).end(image);
  } catch (error) {
    console.error('[VOTING-SOCIAL] Could not render image:', error);
    res.sendStatus(500);
  }
});

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


const OG_THEME_COLORS: Record<string, { bg: string; pattern: string; opacity: number }> = {
  birthday: { bg: '#ffffff', pattern: '#ec4899', opacity: 0.35 },
  confetti: { bg: '#ffffff', pattern: '#f59e0b', opacity: 0.35 },
  hearts: { bg: '#ffffff', pattern: '#ef4444', opacity: 0.3 },
  stars: { bg: '#ffffff', pattern: '#eab308', opacity: 0.35 },
  paws: { bg: '#f0ece4', pattern: '#8B7355', opacity: 0.18 },
};

const OG_THEME_TILES: Record<string, { size: number; content: string }> = {
  birthday: {
    size: 120,
    content: `
      <g fill="none" stroke="__C__" stroke-width="2">
        <ellipse cx="24" cy="26" rx="10" ry="13"/>
        <path d="M24 39 l-3 5 h6 z M24 44 q4 8 -2 16" fill="__C__" stroke="none"/>
        <ellipse cx="88" cy="80" rx="9" ry="12"/>
        <path d="M88 92 l-3 5 h6 z M88 97 q-4 8 2 14" fill="__C__" stroke="none"/>
      </g>
      <g fill="__C__">
        <rect x="60" y="18" width="6" height="3" transform="rotate(30 63 19)"/>
        <rect x="100" y="34" width="6" height="3" transform="rotate(-20 103 35)"/>
        <rect x="14" y="76" width="6" height="3" transform="rotate(45 17 77)"/>
        <rect x="48" y="98" width="6" height="3" transform="rotate(-40 51 99)"/>
        <circle cx="72" cy="56" r="2.4"/>
        <circle cx="36" cy="60" r="2"/>
        <circle cx="106" cy="106" r="2.4"/>
      </g>`,
  },
  confetti: {
    size: 100,
    content: `
      <g fill="__C__">
        <rect x="10" y="12" width="8" height="3.5" transform="rotate(25 14 13)"/>
        <rect x="66" y="20" width="8" height="3.5" transform="rotate(-35 70 21)"/>
        <rect x="36" y="48" width="8" height="3.5" transform="rotate(60 40 49)"/>
        <rect x="82" y="66" width="8" height="3.5" transform="rotate(-15 86 67)"/>
        <rect x="18" y="80" width="8" height="3.5" transform="rotate(40 22 81)"/>
        <circle cx="52" cy="10" r="2.6"/>
        <circle cx="90" cy="40" r="2.2"/>
        <circle cx="8" cy="50" r="2.2"/>
        <circle cx="58" cy="88" r="2.6"/>
      </g>`,
  },
  hearts: {
    size: 110,
    content: `
      <g fill="__C__">
        <path d="M28 24 c-3-6 -12-5 -12 2 c0 5 7 9 12 13 c5-4 12-8 12-13 c0-7 -9-8 -12-2 z"/>
        <path d="M82 70 c-2.4-4.8 -9.6-4 -9.6 1.6 c0 4 5.6 7.2 9.6 10.4 c4-3.2 9.6-6.4 9.6-10.4 c0-5.6 -7.2-6.4 -9.6-1.6 z"/>
        <path d="M60 34 c-1.5-3 -6-2.5 -6 1 c0 2.5 3.5 4.5 6 6.5 c2.5-2 6-4 6-6.5 c0-3.5 -4.5-4 -6-1 z" opacity="0.7"/>
      </g>`,
  },
  paws: {
    size: 110,
    content: `
      <g fill="__C__">
        <g transform="translate(22,24)">
          <ellipse cx="0" cy="4" rx="7" ry="6"/>
          <ellipse cx="-8" cy="-4" rx="3" ry="4"/>
          <ellipse cx="-2.5" cy="-8" rx="3" ry="4"/>
          <ellipse cx="4" cy="-7.5" rx="3" ry="4"/>
          <ellipse cx="9" cy="-2.5" rx="3" ry="3.6"/>
        </g>
        <g transform="translate(78,76) rotate(-20)">
          <ellipse cx="0" cy="4" rx="7" ry="6"/>
          <ellipse cx="-8" cy="-4" rx="3" ry="4"/>
          <ellipse cx="-2.5" cy="-8" rx="3" ry="4"/>
          <ellipse cx="4" cy="-7.5" rx="3" ry="4"/>
          <ellipse cx="9" cy="-2.5" rx="3" ry="3.6"/>
        </g>
      </g>`,
  },
  stars: {
    size: 110,
    content: `
      <g fill="__C__">
        <path d="M26 14 l3 7 7 1 -5 5 1 7 -6-3.5 -6 3.5 1-7 -5-5 7-1 z"/>
        <path d="M82 62 l2.4 5.6 5.6 0.8 -4 4 0.8 5.6 -4.8-2.8 -4.8 2.8 0.8-5.6 -4-4 5.6-0.8 z"/>
        <circle cx="60" cy="30" r="2"/>
        <circle cx="18" cy="72" r="2"/>
        <circle cx="98" cy="20" r="2"/>
        <circle cx="52" cy="96" r="2"/>
      </g>`,
  },
};

function buildOgBackgroundSvg(theme: string, w: number, h: number): string {
  const key = OG_THEME_TILES[theme] ? theme : 'paws';
  const tile = OG_THEME_TILES[key];
  const colors = OG_THEME_COLORS[key];
  const content = tile.content.replace(/__C__/g, colors.pattern);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <pattern id="bgtile" width="${tile.size}" height="${tile.size}" patternUnits="userSpaceOnUse">
        ${content}
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="${colors.bg}"/>
    <rect width="100%" height="100%" fill="url(#bgtile)" opacity="${colors.opacity}"/>
  </svg>`;
}

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
        const theme = typeof req.query.theme === 'string' ? req.query.theme : '';
        const bgSvg = buildOgBackgroundSvg(theme, targetW, targetH);

        const background = await sharp(Buffer.from(bgSvg))
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
