import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export type PostCategory =
  | "urgent_emotional"
  | "overwhelmed_shelter"
  | "happy_adoption"
  | "volunteer_recruitment"
  | "events_fundraiser";

export interface OptimizePostUrls {
  vipClubUrl: string;
  fosterUrl: string;
  adoptionUrl: string;
  emergencyDonateUrl: string;
  volunteerUrl: string;
  eventsUrl: string;
}

/**
 * Where each candidate URL came from, so the UI can tell rescues at a glance
 * whether the optimizer used their tenant-configured override or a generic
 * public-site fallback (which usually means the tenant should fix a setting).
 */
export type PostUrlSource =
  | 'tenant_jotform'           // foster/adoption/volunteer JotForm URL set on tenant
  | 'public_site_default'      // /foster, /adopt, /volunteer on the rescue's public site
  | 'public_vip_club'          // /vip-club on the public site (no per-tenant override)
  | 'animal_emergency_campaign' // animal-specific active emergency-fund campaign
  | 'public_donate_fallback';   // /donate on the public site

export interface ResolvedPostUrl {
  url: string;
  source: PostUrlSource;
  /** True when this URL is a fallback the tenant probably wants to override. */
  isFallback: boolean;
}

export interface ResolvedPostUrls {
  vipClubUrl: ResolvedPostUrl;
  fosterUrl: ResolvedPostUrl;
  adoptionUrl: ResolvedPostUrl;
  volunteerUrl: ResolvedPostUrl;
  emergencyDonateUrl: ResolvedPostUrl;
  eventsUrl: ResolvedPostUrl;
}

export interface OptimizedPostResult {
  optimizedCaption: string;
  firstComment: string;
  category: PostCategory;
  paymentHandlesRemoved: number;
  paymentInterceptionApplied: boolean;
  /**
   * Echoes the `keepLinkInPost` flag the caller asked for. When true, the
   * caption keeps the destination URL inline and the firstComment is a
   * short supportive line (no link). The UI uses this to relabel result
   * cards so the description matches the actual mode.
   */
  keepLinkInPost: boolean;
}

const SYSTEM_PROMPT = `You are an expert Facebook social media strategist for animal rescues. Your job is to take a rescue's draft Facebook post and produce two outputs that maximize organic reach on Facebook and channel engagement into the right action.

Facebook's algorithm penalizes posts that contain outbound links OR third-party payment handles in the main caption. Your strategy is:
1. Strip every URL out of the caption (no links, no "www.", no domain names).
2. Strip every peer-to-peer payment handle out of the caption — this includes Venmo handles ("@username", "Venmo @username", "Venmo: username"), CashApp Cashtags ("$Username"), and PayPal links ("paypal.me/username"). Remove the surrounding language too (e.g. "Send to Venmo @rescue" → remove the whole instruction). Never leave a hint that money should be sent off-platform.
3. Rewrite the caption so it stands on its own emotionally and ends with: "P.S. Check the first comment for how you can help!" (exactly that sentence, appended at the end, on its own line).
4. Classify the emotional tone of the draft into exactly one of five categories and produce a tailored "first comment" that contains the SINGLE most appropriate URL for that category.

PAYMENT INTERCEPTION OVERRIDE:
- If the draft contains ANY payment handle (Venmo, CashApp, PayPal), category MUST be "urgent_emotional" regardless of other tone signals — these handles only appear on emergency asks. This override beats every other category, including volunteer_recruitment.
- When this override applies, the first comment MUST use the Emergency Donate URL (NOT the VIP Club URL).
- The first comment MUST mention that Apple Pay and Google Pay are accepted at checkout, so donors who were about to use Venmo know it's just as fast.
- Open the first comment by acknowledging the urgency, briefly explain the on-site option is faster and gives them a tax receipt, then ask for the gift.

Categories and rules (when no payment handles were detected):
- "urgent_emotional" — the post describes a medical emergency, a critical/urgent need for funds, a heartbreaking situation, or a life-or-death case. The first comment should drive recurring monthly giving via the VIP Club URL. Open with empathy, then ask people to become monthly donors.
- "overwhelmed_shelter" — the post describes the rescue being full, overwhelmed, needing fosters, kennel space, or temporary homes. The first comment should drive foster sign-ups via the Foster URL. Open by acknowledging the strain, then ask people to apply to foster.
- "happy_adoption" — the post is a happy update, a new adoptable pet, a success story, or a celebratory adoption announcement. The first comment should drive adoption applications via the Adoption URL. Open warmly, then invite people to apply to adopt or meet other available pets.
- "volunteer_recruitment" — the post is asking people to donate their TIME, not money or a home. Examples: recruiting volunteers, asking for help at adoption events, dog walkers, kennel cleaners, transport drivers, fundraising volunteers, event helpers, calls to "join our volunteer team", or general "we need more hands" posts that aren't specifically about fostering or adopting. The first comment should drive volunteer sign-ups via the Volunteer URL. Open warmly by thanking the community for caring, then invite people to sign up to volunteer. Do NOT pick this category if the post is primarily about fostering (use overwhelmed_shelter) or about a money emergency (use urgent_emotional).
- "events_fundraiser" — the post is PROMOTING ATTENDANCE at a specific upcoming event the rescue is hosting or co-hosting. Examples: adoption events ("Join us this Saturday for our adoption event at PetSmart"), open houses, gala fundraisers, "yappy hours", trivia nights, fundraising dinners, ticketed events, holiday photo sessions, fun runs. The post is about getting people to SHOW UP, not asking them to apply or donate. The first comment should drive RSVPs / attendance via the Events URL. Open warmly with the date/place hook, then invite people to see all upcoming events. IMPORTANT disambiguation: if the post is recruiting *helpers* for an event (volunteers to staff the booth) use volunteer_recruitment, not this category. If the post is a generic adoptable spotlight with no dated event ("meet our adoptable Bella!") use happy_adoption. Only use this when the post's primary purpose is promoting attendance at a specific dated event. The payment-interception override still beats this category — a gala post that mentions Venmo MUST be urgent_emotional.

URL injection rules:
- Use the EXACT URL provided. Do not invent, shorten, or modify URLs.
- Place exactly one URL in the first comment, on its own line near the end, so it is easy to tap.
- Never put any URL in the optimizedCaption.

Tone rules:
- Keep the rescue's voice but tighten phrasing and remove fluff.
- Do not use emojis unless the original draft uses them; if so, use them sparingly.
- Keep the caption roughly the same length as the original (no shorter than half, no longer than 1.5x).
- The first comment should be 2-4 short sentences plus the URL line.

Output rules:
- Respond with a single JSON object with exactly these keys: "optimizedCaption" (string), "firstComment" (string), "category" (one of "urgent_emotional", "overwhelmed_shelter", "happy_adoption", "volunteer_recruitment", "events_fundraiser").
- No markdown, no commentary, no extra keys.`;

const VALID_CATEGORIES: PostCategory[] = [
  "urgent_emotional",
  "overwhelmed_shelter",
  "happy_adoption",
  "volunteer_recruitment",
  "events_fundraiser",
];

/**
 * Regex patterns that match peer-to-peer payment handles we want stripped from
 * the optimized caption. We use these both to (a) detect handles in the user's
 * draft so we can flag the override, and (b) post-process the AI output as a
 * defense-in-depth layer in case the AI misses one.
 */
const PAYMENT_HANDLE_PATTERNS: RegExp[] = [
  // "Venmo @handle" or "Venmo: handle". Requires an explicit `@` or `:`
  // marker so generic phrases like "Venmo donations" or "We accept Venmo"
  // do NOT trigger interception.
  /\bvenmo\s*(?::\s*@?[a-z0-9._-]{2,30}|@[a-z0-9._-]{2,30})\b/gi,
  // CashApp $Cashtag (1 letter then 2-19 alphanumerics, per Cash App spec).
  // The leading `$` plus a multi-character handle is what distinguishes it
  // from a plain dollar amount like `$5`.
  /(?<![A-Za-z0-9])\$[A-Za-z][A-Za-z0-9_]{2,19}\b/g,
  // "Cash App: tag" or "Cash App $tag" / "CashApp $tag". Requires explicit
  // `:` or `$` marker so "Cash App accepted" does not match.
  /\bcash\s*app\s*(?::\s*\$?[a-z0-9._-]{2,30}|\$[a-z0-9._-]{2,30})\b/gi,
  // paypal.me links (with or without protocol/www); the `/handle` part is
  // the explicit marker.
  /\b(?:https?:\/\/)?(?:www\.)?paypal\.me\/[A-Za-z0-9._-]+/gi,
  // "PayPal: handle" or "PayPal @handle". Requires explicit `:` or `@`
  // marker so "PayPal accepted" does not match.
  /\bpaypal\s*(?::\s*@?[a-z0-9._-]{2,30}|@[a-z0-9._-]{2,30})\b/gi,
];

/**
 * Count how many P2P payment handles appear in a given text. Used on the
 * raw draft to decide whether the Payment Interception override applies.
 */
export function countPaymentHandles(text: string): number {
  if (!text) return 0;
  let total = 0;
  for (const pattern of PAYMENT_HANDLE_PATTERNS) {
    // Reset lastIndex for global regex reuse
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (matches) total += matches.length;
  }
  return total;
}

/**
 * Generic URL stripper for the firstComment. Used in keep-link-in-post mode
 * so an AI-supplied URL of any kind (not just one of the tenant's known
 * destinations) cannot leak into the supportive first comment. Removes
 * http(s):// URLs, bare `www.` URLs, and tidies up orphaned punctuation /
 * whitespace.
 */
export function stripAllUrls(text: string): string {
  if (!text) return text;
  let cleaned = text
    // http(s)://... URLs
    .replace(/https?:\/\/[^\s)\]>,]+/gi, "")
    // bare www. URLs without a protocol
    .replace(/\bwww\.[^\s)\]>,]+/gi, "");
  cleaned = cleaned
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

/**
 * Defense-in-depth stripper. Removes any payment handles that survived the AI
 * pass, then collapses the resulting whitespace so we don't leave dangling
 * sentences like "Send to ." behind.
 */
export function stripPaymentHandles(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const pattern of PAYMENT_HANDLE_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  // Collapse multiple spaces, fix orphaned punctuation like " ." or " ,"
  cleaned = cleaned
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

export class PostOptimizerError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = "PostOptimizerError";
  }
}

export interface OptimizePostOptions {
  /**
   * When true, the AI is instructed to keep the primary destination URL inline
   * in the optimized caption (instead of stripping it to the first comment).
   * Used for paid/boosted posts, emergency posts, or posts where the rescue
   * wants Facebook's auto-generated link preview card.
   *
   * The Payment Interception override is unaffected — payment handles are
   * always stripped from the caption regardless of this flag, because the
   * goal there is to swap off-platform payment for the on-site Emergency
   * Donate URL with Apple Pay / Google Pay.
   */
  keepLinkInPost?: boolean;
}

export async function optimizeFacebookPost(
  draft: string,
  urls: OptimizePostUrls,
  options: OptimizePostOptions = {},
  timeoutMs: number = 30000
): Promise<OptimizedPostResult> {
  const paymentHandlesInDraft = countPaymentHandles(draft);
  const paymentInterceptionApplied = paymentHandlesInDraft > 0;
  const keepLinkInPost = Boolean(options.keepLinkInPost);

  const userPrompt = `Tenant URLs to use when injecting links into the first comment:
- VIP Club URL (for urgent_emotional, ONLY when no payment handles were in the draft): ${urls.vipClubUrl}
- Foster URL (for overwhelmed_shelter): ${urls.fosterUrl}
- Adoption URL (for happy_adoption): ${urls.adoptionUrl}
- Volunteer URL (for volunteer_recruitment): ${urls.volunteerUrl}
- Events URL (for events_fundraiser): ${urls.eventsUrl}
- Emergency Donate URL (REQUIRED when payment handles were stripped from the draft): ${urls.emergencyDonateUrl}

Payment handles detected in this draft: ${paymentHandlesInDraft}
${paymentInterceptionApplied ? "PAYMENT INTERCEPTION ACTIVE — category MUST be urgent_emotional and the first comment MUST use the Emergency Donate URL with Apple Pay / Google Pay messaging." : "No payment handles detected — follow normal category rules."}

KEEP-LINK-IN-POST FLAG: ${keepLinkInPost ? "TRUE" : "FALSE"}
${keepLinkInPost
  ? `The user has explicitly opted to keep the destination URL in the main caption (paid/boosted post, emergency, or to trigger a Facebook link preview card). Override the default link-stripping behavior:
- KEEP every URL from the original draft inline in the optimizedCaption (do not strip them).
- After classifying the category, ALSO append the chosen destination URL on its own line at the end of optimizedCaption (so the link preview card is generated and the link is tappable).
- DO NOT append the "P.S. Check the first comment" sentence — there is no "go look in the comments" CTA when the link is already in the caption.
- The firstComment must be a short supportive/engagement line (1-2 sentences) — gratitude to the community, a call for shares/tags, or an emotional reinforcement of the post. DO NOT tell people to click a link, and DO NOT include any URL in the firstComment.
- If PAYMENT INTERCEPTION is also active, the destination URL kept in the caption MUST be the Emergency Donate URL (payment-interception rules still win).`
  : "Follow the default rules above: strip every URL from the optimizedCaption, append the P.S. line, and put the single destination URL in the firstComment."}

Draft Facebook post:
"""
${draft}
"""

Return the JSON object now.`;

  let response;
  try {
    response = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.7,
      },
      { timeout: timeoutMs }
    );
  } catch (error: unknown) {
    const errObj = error as { status?: number; name?: string; message?: string };
    const status = errObj?.status;
    const name = errObj?.name;
    const message = errObj?.message ?? String(error);
    console.error("Error calling OpenAI for post optimizer:", message, status ? `(status: ${status})` : "");
    if (name === "APIConnectionTimeoutError" || /timeout/i.test(message)) {
      throw new PostOptimizerError(
        "The AI service took too long to respond. Please try again.",
        504
      );
    }
    throw new PostOptimizerError(
      "The AI service is temporarily unavailable. Please try again in a moment.",
      502
    );
  }

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    console.error("Post optimizer returned empty content. Response:", JSON.stringify(response.choices?.[0] ?? {}));
    throw new PostOptimizerError("The AI service returned an empty response. Please try again.", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Post optimizer returned non-JSON content:", content);
    throw new PostOptimizerError("The AI service returned an invalid response. Please try again.", 502);
  }

  if (!parsed || typeof parsed !== "object") {
    console.error("Post optimizer returned non-object JSON:", parsed);
    throw new PostOptimizerError("The AI service returned an incomplete response. Please try again.", 502);
  }

  const parsedObj = parsed as Record<string, unknown>;
  let optimizedCaption = typeof parsedObj.optimizedCaption === "string" ? parsedObj.optimizedCaption.trim() : "";
  let firstComment = typeof parsedObj.firstComment === "string" ? parsedObj.firstComment.trim() : "";
  const categoryValue = parsedObj.category;
  let category = (typeof categoryValue === "string" && (VALID_CATEGORIES as string[]).includes(categoryValue))
    ? (categoryValue as PostCategory)
    : null;

  if (!optimizedCaption || !firstComment || !category) {
    console.error("Post optimizer returned malformed JSON:", parsedObj);
    throw new PostOptimizerError("The AI service returned an incomplete response. Please try again.", 502);
  }

  // ---- Payment Interception fix-ups (always run when handles were detected) ----
  if (paymentInterceptionApplied) {
    optimizedCaption = stripPaymentHandles(optimizedCaption);
    // Force category override server-side as a final safety net.
    category = "urgent_emotional";
  }

  // Determine the URL the user should be sent to, mirroring the routing
  // rules in `pickDestinationForResult` (which the route layer uses for the
  // UI's destination card). Computing it here lets us deterministically
  // enforce that the URL ends up in the right place (caption vs. comment)
  // regardless of model compliance.
  const destinationUrl = paymentInterceptionApplied
    ? urls.emergencyDonateUrl
    : (() => {
        switch (category) {
          case "urgent_emotional": return urls.vipClubUrl;
          case "overwhelmed_shelter": return urls.fosterUrl;
          case "happy_adoption": return urls.adoptionUrl;
          case "volunteer_recruitment": return urls.volunteerUrl;
          case "events_fundraiser": return urls.eventsUrl;
        }
      })();

  if (keepLinkInPost) {
    // ---- Caption-link mode ----
    // The destination URL belongs inline in the caption (so Facebook
    // generates a link preview card and the link is tappable without
    // scrolling to comments). The first comment must be a short
    // supportive line with NO URL.

    // 1. Make sure the destination URL is present in the caption.
    if (destinationUrl && !optimizedCaption.includes(destinationUrl)) {
      optimizedCaption = `${optimizedCaption.replace(/\s+$/, "")}\n${destinationUrl}`;
    }
    // 2. Remove any "check the first comment" CTA the model may have added —
    //    inappropriate when the link is already in the caption.
    optimizedCaption = optimizedCaption
      .replace(/^\s*P\.?\s*S\.?[^\n]*check the first comment[^\n]*$/gim, "")
      .replace(/[^\n.!?]*check the first comment[^\n.!?]*[.!?]?/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // 3. Strip ANY URL (not just known tenant URLs) from the first comment.
    firstComment = stripAllUrls(firstComment);
    // 4. Also strip click-the-link CTA language from the first comment.
    firstComment = firstComment
      .replace(/[^\n.!?]*\b(click|tap|visit)\b[^\n.!?]*\blink\b[^\n.!?]*[.!?]?/gi, "")
      .replace(/[^\n.!?]*\blink (?:is )?(?:in (?:the )?)?(?:bio|comments?|caption)\b[^\n.!?]*[.!?]?/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // 5. If the first comment is now empty (e.g. it was only a URL line),
    //    fall back to a generic supportive nudge so the UI never shows a
    //    blank result.
    if (!firstComment) {
      firstComment = "Thank you for being part of this community — every share helps us reach the right person.";
    }
    // 6. When payment interception is also active, the Apple Pay / Google
    //    Pay messaging needs to be in the caption (not the comment, which
    //    no longer drives traffic). Enforce both phrases independently.
    if (paymentInterceptionApplied) {
      const captionHasApple = /apple\s*pay/i.test(optimizedCaption);
      const captionHasGoogle = /google\s*pay/i.test(optimizedCaption);
      if (!captionHasApple || !captionHasGoogle) {
        optimizedCaption = `${optimizedCaption.replace(/\s+$/, "")}\nApple Pay & Google Pay accepted — donate in seconds.`;
      }
    }
  } else if (paymentInterceptionApplied) {
    // ---- Default mode + payment interception ----
    // Link belongs in the first comment; caption tells the reader to look
    // there. Mirrors the original behavior prior to Task #144.
    if (!/check the first comment/i.test(optimizedCaption)) {
      optimizedCaption = `${optimizedCaption.replace(/\s+$/, "")}\n\nP.S. Check the first comment for how you can help!`;
    }
    const otherUrls = [urls.vipClubUrl, urls.fosterUrl, urls.adoptionUrl, urls.volunteerUrl, urls.eventsUrl];
    if (!firstComment.includes(urls.emergencyDonateUrl)) {
      let swapped = firstComment;
      for (const wrongUrl of otherUrls) {
        if (wrongUrl && swapped.includes(wrongUrl)) {
          swapped = swapped.split(wrongUrl).join(urls.emergencyDonateUrl);
        }
      }
      if (!swapped.includes(urls.emergencyDonateUrl)) {
        swapped = `${swapped.replace(/\s+$/, "")}\n${urls.emergencyDonateUrl}`;
      }
      firstComment = swapped;
    }
    // Enforce both Apple Pay AND Google Pay phrases, not just one.
    const commentHasApple = /apple\s*pay/i.test(firstComment);
    const commentHasGoogle = /google\s*pay/i.test(firstComment);
    if (!commentHasApple || !commentHasGoogle) {
      firstComment = `${firstComment.replace(/\s+$/, "")}\nApple Pay & Google Pay accepted — donate in seconds.`;
    }
  }
  // (Default mode, no payment interception → no post-processing required;
  //  the AI's own output stands.)

  return {
    optimizedCaption,
    firstComment,
    category,
    paymentHandlesRemoved: paymentHandlesInDraft,
    paymentInterceptionApplied,
    keepLinkInPost,
  };
}

/**
 * Resolve the URLs the AI needs based on the tenant's configuration plus an
 * optional emergency donate URL chosen by the route handler (which has access
 * to the database to look up animal-specific emergency campaigns).
 *
 * Returns each URL alongside a `source` and `isFallback` flag so the route
 * handler can echo that metadata back to the client. The optimizer itself only
 * needs the URL strings (see `toOptimizePostUrls`).
 */
export function resolveTenantPostUrls(tenant: {
  customDomain?: string | null;
  customDomainVerified?: boolean;
  subdomain: string;
  jotformAdoptionUrl?: string | null;
  jotformFosterUrl?: string | null;
  jotformVolunteerUrl?: string | null;
}, emergencyDonateUrl?: string): ResolvedPostUrls {
  const publicSiteRoot = (() => {
    if (tenant.customDomain && tenant.customDomainVerified) {
      return `https://${tenant.customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
    return `https://${tenant.subdomain}.irescue.life`;
  })();

  const fosterOverride = tenant.jotformFosterUrl?.trim();
  const adoptionOverride = tenant.jotformAdoptionUrl?.trim();
  const volunteerOverride = tenant.jotformVolunteerUrl?.trim();
  const emergencyOverride = emergencyDonateUrl?.trim();

  return {
    // The VIP Club page is always served by the public site — there is no
    // per-tenant override for it, so it's never considered a "fallback".
    vipClubUrl: {
      url: `${publicSiteRoot}/vip-club`,
      source: 'public_vip_club',
      isFallback: false,
    },
    fosterUrl: fosterOverride
      ? { url: fosterOverride, source: 'tenant_jotform', isFallback: false }
      : { url: `${publicSiteRoot}/foster`, source: 'public_site_default', isFallback: true },
    adoptionUrl: adoptionOverride
      ? { url: adoptionOverride, source: 'tenant_jotform', isFallback: false }
      : { url: `${publicSiteRoot}/adopt`, source: 'public_site_default', isFallback: true },
    volunteerUrl: volunteerOverride
      ? { url: volunteerOverride, source: 'tenant_jotform', isFallback: false }
      : { url: `${publicSiteRoot}/volunteer`, source: 'public_site_default', isFallback: true },
    emergencyDonateUrl: emergencyOverride
      ? { url: emergencyOverride, source: 'animal_emergency_campaign', isFallback: false }
      : {
          url: `${publicSiteRoot}/donate?utm_source=fb_optimizer&utm_medium=first_comment`,
          source: 'public_donate_fallback',
          isFallback: true,
        },
    // Events listing is always the public site's `/events` page — there is no
    // per-tenant override (mirrors how vipClubUrl works), so it's never a fallback.
    eventsUrl: {
      url: `${publicSiteRoot}/events`,
      source: 'public_site_default',
      isFallback: false,
    },
  };
}

/**
 * Flatten the rich resolved URLs into the plain string-only shape the AI
 * prompt builder expects.
 */
export function toOptimizePostUrls(resolved: ResolvedPostUrls): OptimizePostUrls {
  return {
    vipClubUrl: resolved.vipClubUrl.url,
    fosterUrl: resolved.fosterUrl.url,
    adoptionUrl: resolved.adoptionUrl.url,
    volunteerUrl: resolved.volunteerUrl.url,
    emergencyDonateUrl: resolved.emergencyDonateUrl.url,
    eventsUrl: resolved.eventsUrl.url,
  };
}

export interface DestinationDescriptor extends ResolvedPostUrl {
  /** Short user-facing label for the destination, e.g. "Volunteer application". */
  label: string;
  /** Which of the resolved URLs the optimizer chose. */
  kind: 'vipClub' | 'foster' | 'adoption' | 'volunteer' | 'emergencyDonate' | 'events';
}

/**
 * Pick the destination URL the optimizer's first comment will actually link
 * to, based on the AI's chosen category and whether the payment-interception
 * override applied. Mirrors the routing rules described in the system prompt
 * so the UI shows the same URL the AI was instructed to use.
 */
export function pickDestinationForResult(
  resolved: ResolvedPostUrls,
  result: Pick<OptimizedPostResult, 'category' | 'paymentInterceptionApplied'>
): DestinationDescriptor {
  if (result.paymentInterceptionApplied) {
    return { ...resolved.emergencyDonateUrl, label: 'Emergency donate page', kind: 'emergencyDonate' };
  }
  switch (result.category) {
    case 'urgent_emotional':
      return { ...resolved.vipClubUrl, label: 'VIP Club page', kind: 'vipClub' };
    case 'overwhelmed_shelter':
      return { ...resolved.fosterUrl, label: 'Foster application', kind: 'foster' };
    case 'happy_adoption':
      return { ...resolved.adoptionUrl, label: 'Adoption application', kind: 'adoption' };
    case 'volunteer_recruitment':
      return { ...resolved.volunteerUrl, label: 'Volunteer application', kind: 'volunteer' };
    case 'events_fundraiser':
      return { ...resolved.eventsUrl, label: 'Events page', kind: 'events' };
  }
}

/**
 * Helper exposed for the route handler to compute the public site root the
 * same way `resolveTenantPostUrls` does, so it can build campaign URLs that
 * point at the correct domain (custom domain when verified, else subdomain).
 */
export function resolvePublicSiteRoot(tenant: {
  customDomain?: string | null;
  customDomainVerified?: boolean;
  subdomain: string;
}): string {
  if (tenant.customDomain && tenant.customDomainVerified) {
    return `https://${tenant.customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  return `https://${tenant.subdomain}.irescue.life`;
}
