import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export type PostCategory = "urgent_emotional" | "overwhelmed_shelter" | "happy_adoption";

export interface OptimizePostUrls {
  vipClubUrl: string;
  fosterUrl: string;
  adoptionUrl: string;
  emergencyDonateUrl: string;
}

export interface OptimizedPostResult {
  optimizedCaption: string;
  firstComment: string;
  category: PostCategory;
  paymentHandlesRemoved: number;
  paymentInterceptionApplied: boolean;
}

const SYSTEM_PROMPT = `You are an expert Facebook social media strategist for animal rescues. Your job is to take a rescue's draft Facebook post and produce two outputs that maximize organic reach on Facebook and channel engagement into the right action.

Facebook's algorithm penalizes posts that contain outbound links OR third-party payment handles in the main caption. Your strategy is:
1. Strip every URL out of the caption (no links, no "www.", no domain names).
2. Strip every peer-to-peer payment handle out of the caption — this includes Venmo handles ("@username", "Venmo @username", "Venmo: username"), CashApp Cashtags ("$Username"), and PayPal links ("paypal.me/username"). Remove the surrounding language too (e.g. "Send to Venmo @rescue" → remove the whole instruction). Never leave a hint that money should be sent off-platform.
3. Rewrite the caption so it stands on its own emotionally and ends with: "P.S. Check the first comment for how you can help!" (exactly that sentence, appended at the end, on its own line).
4. Classify the emotional tone of the draft into exactly one of three categories and produce a tailored "first comment" that contains the SINGLE most appropriate URL for that category.

PAYMENT INTERCEPTION OVERRIDE:
- If the draft contains ANY payment handle (Venmo, CashApp, PayPal), category MUST be "urgent_emotional" regardless of other tone signals — these handles only appear on emergency asks.
- When this override applies, the first comment MUST use the Emergency Donate URL (NOT the VIP Club URL).
- The first comment MUST mention that Apple Pay and Google Pay are accepted at checkout, so donors who were about to use Venmo know it's just as fast.
- Open the first comment by acknowledging the urgency, briefly explain the on-site option is faster and gives them a tax receipt, then ask for the gift.

Categories and rules (when no payment handles were detected):
- "urgent_emotional" — the post describes a medical emergency, a critical/urgent need for funds, a heartbreaking situation, or a life-or-death case. The first comment should drive recurring monthly giving via the VIP Club URL. Open with empathy, then ask people to become monthly donors.
- "overwhelmed_shelter" — the post describes the rescue being full, overwhelmed, needing fosters, kennel space, or temporary homes. The first comment should drive foster sign-ups via the Foster URL. Open by acknowledging the strain, then ask people to apply to foster.
- "happy_adoption" — the post is a happy update, a new adoptable pet, a success story, or a celebratory adoption announcement. The first comment should drive adoption applications via the Adoption URL. Open warmly, then invite people to apply to adopt or meet other available pets.

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
- Respond with a single JSON object with exactly these keys: "optimizedCaption" (string), "firstComment" (string), "category" (one of "urgent_emotional", "overwhelmed_shelter", "happy_adoption").
- No markdown, no commentary, no extra keys.`;

const VALID_CATEGORIES: PostCategory[] = [
  "urgent_emotional",
  "overwhelmed_shelter",
  "happy_adoption",
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

export async function optimizeFacebookPost(
  draft: string,
  urls: OptimizePostUrls,
  timeoutMs: number = 30000
): Promise<OptimizedPostResult> {
  const paymentHandlesInDraft = countPaymentHandles(draft);
  const paymentInterceptionApplied = paymentHandlesInDraft > 0;

  const userPrompt = `Tenant URLs to use when injecting links into the first comment:
- VIP Club URL (for urgent_emotional, ONLY when no payment handles were in the draft): ${urls.vipClubUrl}
- Foster URL (for overwhelmed_shelter): ${urls.fosterUrl}
- Adoption URL (for happy_adoption): ${urls.adoptionUrl}
- Emergency Donate URL (REQUIRED when payment handles were stripped from the draft): ${urls.emergencyDonateUrl}

Payment handles detected in this draft: ${paymentHandlesInDraft}
${paymentInterceptionApplied ? "PAYMENT INTERCEPTION ACTIVE — category MUST be urgent_emotional and the first comment MUST use the Emergency Donate URL with Apple Pay / Google Pay messaging." : "No payment handles detected — follow normal category rules."}

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

  // Defense-in-depth: scrub any payment handles the AI missed from the
  // optimized caption. We do NOT scrub the first comment because the AI may
  // legitimately reference brand names like "Apple Pay" there.
  if (paymentInterceptionApplied) {
    optimizedCaption = stripPaymentHandles(optimizedCaption);
    // Force category override server-side as a final safety net.
    category = "urgent_emotional";
    // Guarantee the required P.S. line is present at the end of the caption,
    // since interception promises the reader that the link is in the comment.
    if (!/check the first comment/i.test(optimizedCaption)) {
      optimizedCaption = `${optimizedCaption.replace(/\s+$/, "")}\n\nP.S. Check the first comment for how you can help!`;
    }
    // If the AI somehow used the wrong URL, swap it for the emergency URL.
    const otherUrls = [urls.vipClubUrl, urls.fosterUrl, urls.adoptionUrl];
    if (!firstComment.includes(urls.emergencyDonateUrl)) {
      let swapped = firstComment;
      for (const wrongUrl of otherUrls) {
        if (wrongUrl && swapped.includes(wrongUrl)) {
          swapped = swapped.split(wrongUrl).join(urls.emergencyDonateUrl);
        }
      }
      // If no URL was present at all, append the emergency URL on its own line.
      if (!swapped.includes(urls.emergencyDonateUrl)) {
        swapped = `${swapped.replace(/\s+$/, "")}\n${urls.emergencyDonateUrl}`;
      }
      firstComment = swapped;
    }
    // Guarantee the Apple Pay / Google Pay messaging the interception
    // contract requires, in case the model omitted it.
    if (!/apple\s*pay/i.test(firstComment) && !/google\s*pay/i.test(firstComment)) {
      firstComment = `${firstComment.replace(/\s+$/, "")}\nApple Pay & Google Pay accepted — donate in seconds.`;
    }
  }

  return {
    optimizedCaption,
    firstComment,
    category,
    paymentHandlesRemoved: paymentHandlesInDraft,
    paymentInterceptionApplied,
  };
}

/**
 * Resolve the URLs the AI needs based on the tenant's configuration plus an
 * optional emergency donate URL chosen by the route handler (which has access
 * to the database to look up animal-specific emergency campaigns).
 */
export function resolveTenantPostUrls(tenant: {
  customDomain?: string | null;
  customDomainVerified?: boolean;
  subdomain: string;
  jotformAdoptionUrl?: string | null;
  jotformFosterUrl?: string | null;
}, emergencyDonateUrl?: string): OptimizePostUrls {
  const publicSiteRoot = (() => {
    if (tenant.customDomain && tenant.customDomainVerified) {
      return `https://${tenant.customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
    return `https://${tenant.subdomain}.irescue.life`;
  })();

  const vipClubUrl = `${publicSiteRoot}/vip-club`;
  const fosterUrl = tenant.jotformFosterUrl?.trim() || `${publicSiteRoot}/foster`;
  const adoptionUrl = tenant.jotformAdoptionUrl?.trim() || `${publicSiteRoot}/adopt`;
  const fallbackDonateUrl = `${publicSiteRoot}/donate?utm_source=fb_optimizer&utm_medium=first_comment`;

  return {
    vipClubUrl,
    fosterUrl,
    adoptionUrl,
    emergencyDonateUrl: emergencyDonateUrl?.trim() || fallbackDonateUrl,
  };
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
