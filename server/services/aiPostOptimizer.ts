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
}

export interface OptimizedPostResult {
  optimizedCaption: string;
  firstComment: string;
  category: PostCategory;
}

const SYSTEM_PROMPT = `You are an expert Facebook social media strategist for animal rescues. Your job is to take a rescue's draft Facebook post and produce two outputs that maximize organic reach on Facebook and channel engagement into the right action.

Facebook's algorithm penalizes posts that contain outbound links in the main caption. Your strategy is:
1. Strip every URL out of the caption (no links, no "www.", no domain names).
2. Rewrite the caption so it stands on its own emotionally and ends with: "P.S. Check the first comment for how you can help!" (exactly that sentence, appended at the end, on its own line).
3. Classify the emotional tone of the draft into exactly one of three categories and produce a tailored "first comment" that contains the SINGLE most appropriate URL for that category.

Categories and rules:
- "urgent_emotional" — the post describes a medical emergency, a critical/urgent need for funds, a heartbreaking situation, or a life-or-death case. The first comment should drive recurring monthly giving via the VIP Club URL. Open with empathy, then ask people to become monthly donors.
- "overwhelmed_shelter" — the post describes the rescue being full, overwhelmed, needing fosters, kennel space, or temporary homes. The first comment should drive foster sign-ups via the Foster URL. Open by acknowledging the strain, then ask people to apply to foster.
- "happy_adoption" — the post is a happy update, a new adoptable pet, a success story, or a celebratory adoption announcement. The first comment should drive adoption applications via the Adoption URL. Open warmly, then invite people to apply to adopt or meet other available pets.

URL injection rules:
- Use the EXACT URL provided for the chosen category. Do not invent, shorten, or modify URLs.
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
  const userPrompt = `Tenant URLs to use when injecting links into the first comment:
- VIP Club URL (for urgent_emotional): ${urls.vipClubUrl}
- Foster URL (for overwhelmed_shelter): ${urls.fosterUrl}
- Adoption URL (for happy_adoption): ${urls.adoptionUrl}

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
  const optimizedCaption = typeof parsedObj.optimizedCaption === "string" ? parsedObj.optimizedCaption.trim() : "";
  const firstComment = typeof parsedObj.firstComment === "string" ? parsedObj.firstComment.trim() : "";
  const categoryValue = parsedObj.category;
  const category = (typeof categoryValue === "string" && (VALID_CATEGORIES as string[]).includes(categoryValue))
    ? (categoryValue as PostCategory)
    : null;

  if (!optimizedCaption || !firstComment || !category) {
    console.error("Post optimizer returned malformed JSON:", parsedObj);
    throw new PostOptimizerError("The AI service returned an incomplete response. Please try again.", 502);
  }

  return { optimizedCaption, firstComment, category };
}

/**
 * Resolve the three URLs the AI needs based on the tenant's configuration.
 */
export function resolveTenantPostUrls(tenant: {
  customDomain?: string | null;
  customDomainVerified?: boolean;
  subdomain: string;
  jotformAdoptionUrl?: string | null;
  jotformFosterUrl?: string | null;
}): OptimizePostUrls {
  const publicSiteRoot = (() => {
    if (tenant.customDomain && tenant.customDomainVerified) {
      return `https://${tenant.customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
    return `https://${tenant.subdomain}.irescue.life`;
  })();

  const vipClubUrl = `${publicSiteRoot}/vip-club`;
  const fosterUrl = tenant.jotformFosterUrl?.trim() || `${publicSiteRoot}/foster`;
  const adoptionUrl = tenant.jotformAdoptionUrl?.trim() || `${publicSiteRoot}/adopt`;

  return { vipClubUrl, fosterUrl, adoptionUrl };
}
