import OpenAI from "openai";
import { stripAllUrls } from "./aiPostOptimizer";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export type SocialPostTheme =
  | "transformation_tuesday"
  | "happy_tail"
  | "urgent_need"
  | "volunteer_recruitment"
  | "monthly_donor_push"
  | "giving_tuesday"
  | "custom";

export const SOCIAL_POST_THEMES: SocialPostTheme[] = [
  "transformation_tuesday",
  "happy_tail",
  "urgent_need",
  "volunteer_recruitment",
  "monthly_donor_push",
  "giving_tuesday",
  "custom",
];

export type SocialPostTone = "heartwarming" | "urgent" | "celebratory";
export const SOCIAL_POST_TONES: SocialPostTone[] = ["heartwarming", "urgent", "celebratory"];

export interface SocialPostTenantContext {
  name: string;
  tagline?: string | null;
  missionStatement?: string | null;
  location?: string | null;
  socialFacebook?: string | null;
  socialInstagram?: string | null;
}

export interface SocialPostAnimalContext {
  name: string;
  species?: string | null;
  intakeDate?: string | null; // ISO
  intakeSource?: string | null;
  locationFound?: string | null;
  bio?: string | null;
  status?: string | null;
  adoptionDate?: string | null; // ISO
  storyTags?: string[] | null;
  photoUrl?: string | null;
}

export interface SocialPostInputs {
  /** Free-form Before description for transformation themes. */
  beforeText?: string;
  /** Free-form After description for transformation themes. */
  afterText?: string;
  /** Specific need / situation for urgent themes. */
  needDescription?: string;
  /** Dollar goal or amount referenced in the post. */
  dollarAmount?: string;
  /** Deadline / urgency window (e.g. "by Friday", "this weekend"). */
  deadline?: string;
  /** Volunteer role for volunteer_recruitment theme. */
  volunteerRole?: string;
  /** Time commitment for the volunteer role. */
  timeCommitment?: string;
  /** Custom-prompt notes the AI should incorporate (any theme). */
  customInstructions?: string;
}

export interface SocialPostGenerationRequest {
  theme: SocialPostTheme;
  tone: SocialPostTone;
  tenant: SocialPostTenantContext;
  animal?: SocialPostAnimalContext;
  inputs: SocialPostInputs;
  /** Final destination URL the first comment should link to (resolved by route). */
  destinationUrl: string;
  /** Hashtags the user wants prioritized (with or without leading `#`). */
  preferredHashtags: string[];
}

export interface SocialPostGenerationResult {
  caption: string;
  firstComment: string;
  suggestedHashtags: string[];
  visualCue: string;
}

export class SocialPostArchitectError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = "SocialPostArchitectError";
  }
}

const THEME_BRIEFS: Record<SocialPostTheme, { label: string; goal: string; ctaIntent: string }> = {
  transformation_tuesday: {
    label: "Transformation Tuesday",
    goal:
      "Tell a vivid before-and-after story that shows how the rescue's care transformed this animal. Lead with the emotional contrast (the 'before' should evoke empathy without graphic detail; the 'after' should land in hope).",
    ctaIntent:
      "Invite readers to make ongoing transformation possible by joining the rescue's monthly giving program.",
  },
  happy_tail: {
    label: "Happy Tail / Adoption Announcement",
    goal:
      "Celebrate a successful adoption — name the animal, name (or warmly anonymize) the family, and capture the joy of the match.",
    ctaIntent:
      "Invite readers to apply to adopt another available animal so the next happy tail can begin.",
  },
  urgent_need: {
    label: "Urgent Need",
    goal:
      "Make a clear, specific ask that conveys real urgency without panic. Lead with the situation, name the animal involved (if any), state the dollar goal, and tie it to a concrete outcome.",
    ctaIntent:
      "Drive supporters to the dedicated fundraiser so every dollar goes straight to this need.",
  },
  volunteer_recruitment: {
    label: "Volunteer Recruitment",
    goal:
      "Recruit volunteers for a specific role. Name the role, the time commitment, and the impact one volunteer will have on the animals.",
    ctaIntent:
      "Invite readers to apply to volunteer for this role.",
  },
  monthly_donor_push: {
    label: "Monthly Donor Push",
    goal:
      "Make the case for becoming a monthly donor. Frame recurring giving as the predictable lifeline that keeps the rescue running.",
    ctaIntent:
      "Ask readers to join the monthly giving program with a small, sustainable amount.",
  },
  giving_tuesday: {
    label: "Giving Tuesday",
    goal:
      "Rally supporters for Giving Tuesday. Acknowledge that today is the day, share what every gift makes possible, and reinforce that this rescue depends on community generosity.",
    ctaIntent:
      "Drive donations to the rescue's general donate page on Giving Tuesday.",
  },
  custom: {
    label: "Custom Post",
    goal:
      "Write a polished social post that incorporates the user's custom instructions. Stay true to the rescue's voice and the chosen tone.",
    ctaIntent:
      "Drive readers to take the next step indicated by the post (defaults to general support if no specific CTA is implied).",
  },
};

const TONE_BRIEFS: Record<SocialPostTone, string> = {
  heartwarming:
    "Warm, hopeful, and human. Sincere without being saccharine; lean on small concrete moments rather than abstract sentiment.",
  urgent:
    "Direct, clear-eyed, and time-sensitive. Communicate genuine urgency without melodrama or alarmism.",
  celebratory:
    "Upbeat and joyful. Celebrate the win and invite the community into the moment.",
};

const SYSTEM_PROMPT = `You are an expert social media strategist for animal rescues. Your job is to produce a polished, ready-to-paste social media post that maximizes organic reach and drives the right call-to-action.

You will be given:
- The rescue's tenant context (name, mission, location, social handles).
- An optional animal context with intake/adoption details.
- A theme brief that explains what kind of post to write.
- A tone brief.
- A destination URL the call-to-action should drive to.
- The user's preferred hashtags.

Algorithm-friendly rules (these are non-negotiable):
1. The "caption" must NOT contain any URL. Not http(s)://, not www., not bare domains. Strip them all. The destination URL belongs in the first comment, not the caption.
2. The caption should end with a one-line P.S. variant that points readers to the comments — for example: "P.S. Check the first comment for the link.". Use exactly that line on its own line, no decorations.
3. The "firstComment" is 2-4 short sentences plus the destination URL on its own line near the end. The URL must be the EXACT URL provided — never invent, shorten, or modify it.
4. "suggestedHashtags" is an array of 3-8 hashtags, each beginning with "#", no spaces in the tag, ASCII letters/digits only. Always include at least one hashtag derived from the rescue's name and at least one theme-appropriate hashtag. If the user supplied preferred hashtags, include them all (deduplicated, case-insensitive) and add complementary ones to reach 3-8 total.
5. "visualCue" is a single short sentence (no URL) describing the photo or visual the user should pair with this post (e.g., "Pair this with a side-by-side intake photo and current photo of [Animal].").

Voice rules:
- Use the rescue's name naturally where it fits — usually once in the caption and once in the first comment. Do not over-use it.
- Use emojis sparingly (0-3 per caption), only if they reinforce the tone. Never substitute emojis for proper words.
- Keep the caption between 60 and 220 words. Keep the first comment between 25 and 90 words.
- Never fabricate facts about the animal or the rescue. If a detail wasn't provided, leave it out.
- If an animal name is provided, use it. If not, write the post generically.
- Do not include phone numbers, email addresses, or P2P payment handles (Venmo/CashApp/PayPal handles).

Output rules:
- Respond with a single JSON object with exactly these keys: "caption" (string), "firstComment" (string), "suggestedHashtags" (string[]), "visualCue" (string).
- No markdown code fences, no commentary, no extra keys.`;

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildAnimalContextBlock(animal?: SocialPostAnimalContext): string {
  if (!animal) return "No animal selected — write a general post for the rescue.";
  const lines: string[] = [`- Name: ${animal.name}`];
  if (animal.species) lines.push(`- Species: ${animal.species}`);
  const intakeDate = formatDate(animal.intakeDate);
  if (intakeDate) lines.push(`- Intake date: ${intakeDate}`);
  if (animal.intakeSource) lines.push(`- Intake source: ${animal.intakeSource}`);
  if (animal.locationFound) lines.push(`- Where found: ${animal.locationFound}`);
  if (animal.status) lines.push(`- Current status: ${animal.status}`);
  const adoptionDate = formatDate(animal.adoptionDate);
  if (adoptionDate) lines.push(`- Adopted: ${adoptionDate}`);
  if (animal.bio && animal.bio.trim()) lines.push(`- Bio: ${animal.bio.trim()}`);
  if (animal.storyTags && animal.storyTags.length) lines.push(`- Story tags: ${animal.storyTags.join(", ")}`);
  if (animal.photoUrl) lines.push(`- Featured photo URL (do NOT include in caption — for context only): ${animal.photoUrl}`);
  return lines.join("\n");
}

function buildTenantContextBlock(tenant: SocialPostTenantContext): string {
  const lines: string[] = [`- Rescue name: ${tenant.name}`];
  if (tenant.tagline) lines.push(`- Tagline: ${tenant.tagline}`);
  if (tenant.missionStatement) lines.push(`- Mission: ${tenant.missionStatement.slice(0, 600)}`);
  if (tenant.location) lines.push(`- Location: ${tenant.location}`);
  if (tenant.socialFacebook) lines.push(`- Facebook: ${tenant.socialFacebook}`);
  if (tenant.socialInstagram) lines.push(`- Instagram: ${tenant.socialInstagram}`);
  return lines.join("\n");
}

function buildInputsBlock(theme: SocialPostTheme, inputs: SocialPostInputs): string {
  const lines: string[] = [];
  if (inputs.beforeText) lines.push(`- BEFORE: ${inputs.beforeText.trim()}`);
  if (inputs.afterText) lines.push(`- AFTER: ${inputs.afterText.trim()}`);
  if (inputs.needDescription) lines.push(`- Need / situation: ${inputs.needDescription.trim()}`);
  if (inputs.dollarAmount) lines.push(`- Dollar amount / goal: ${inputs.dollarAmount.trim()}`);
  if (inputs.deadline) lines.push(`- Deadline / urgency: ${inputs.deadline.trim()}`);
  if (inputs.volunteerRole) lines.push(`- Volunteer role: ${inputs.volunteerRole.trim()}`);
  if (inputs.timeCommitment) lines.push(`- Time commitment: ${inputs.timeCommitment.trim()}`);
  if (inputs.customInstructions) lines.push(`- Custom instructions from user: ${inputs.customInstructions.trim()}`);
  if (lines.length === 0) {
    return `(No additional inputs supplied — generate a strong default ${THEME_BRIEFS[theme].label} post using only the tenant + animal context above.)`;
  }
  return lines.join("\n");
}

function normalizeHashtag(tag: string): string | null {
  if (!tag) return null;
  const stripped = tag.trim().replace(/^#+/, "").replace(/[^A-Za-z0-9]/g, "");
  if (!stripped) return null;
  return `#${stripped}`;
}

function dedupeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const norm = normalizeHashtag(raw);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(norm);
  }
  return result;
}

/**
 * Defense-in-depth post-processor for the AI's caption. Strips any URL the
 * model may have left in, ensures the P.S. comment-pointer line is present,
 * and tidies whitespace.
 */
function sanitizeCaption(captionRaw: string): string {
  let caption = stripAllUrls(captionRaw);
  caption = caption.replace(/```[a-z]*|```/gi, "").trim();
  if (!/check the first comment/i.test(caption)) {
    caption = `${caption.replace(/\s+$/, "")}\n\nP.S. Check the first comment for the link.`;
  }
  return caption.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Defense-in-depth post-processor for the firstComment. Ensures the
 * destination URL is present (and only the destination URL — strips any other
 * URLs the model may have invented).
 */
function sanitizeFirstComment(firstCommentRaw: string, destinationUrl: string): string {
  let cleaned = (firstCommentRaw || "").replace(/```[a-z]*|```/gi, "").trim();
  // Strip every URL except the canonical destinationUrl. We do this by
  // first removing all URLs, then re-appending the destination on its own
  // line so the link is always tappable and always correct.
  cleaned = stripAllUrls(cleaned);
  if (destinationUrl) {
    cleaned = `${cleaned.replace(/\s+$/, "")}\n${destinationUrl}`;
  }
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export async function generateSocialPost(
  request: SocialPostGenerationRequest,
  timeoutMs: number = 30000,
): Promise<SocialPostGenerationResult> {
  const themeBrief = THEME_BRIEFS[request.theme];
  const toneBrief = TONE_BRIEFS[request.tone];

  const preferredHashtagBlock = request.preferredHashtags.length
    ? request.preferredHashtags.map((t) => normalizeHashtag(t)).filter(Boolean).join(", ")
    : "(none — generate sensible ones)";

  const userPrompt = `THEME: ${themeBrief.label}
THEME GOAL: ${themeBrief.goal}
THEME CTA INTENT: ${themeBrief.ctaIntent}

TONE: ${request.tone}
TONE GUIDANCE: ${toneBrief}

DESTINATION URL (use EXACTLY this URL in the firstComment, on its own line near the end):
${request.destinationUrl}

USER'S PREFERRED HASHTAGS (include them all, deduped):
${preferredHashtagBlock}

TENANT CONTEXT:
${buildTenantContextBlock(request.tenant)}

ANIMAL CONTEXT:
${buildAnimalContextBlock(request.animal)}

USER-SUPPLIED INPUTS:
${buildInputsBlock(request.theme, request.inputs)}

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
      { timeout: timeoutMs },
    );
  } catch (error: unknown) {
    const errObj = error as { status?: number; name?: string; message?: string };
    const status = errObj?.status;
    const name = errObj?.name;
    const message = errObj?.message ?? String(error);
    console.error("Error calling OpenAI for social post architect:", message, status ? `(status: ${status})` : "");
    if (name === "APIConnectionTimeoutError" || /timeout/i.test(message)) {
      throw new SocialPostArchitectError(
        "The AI service took too long to respond. Please try again.",
        504,
      );
    }
    throw new SocialPostArchitectError(
      "The AI service is temporarily unavailable. Please try again in a moment.",
      502,
    );
  }

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    console.error("Social post architect returned empty content.");
    throw new SocialPostArchitectError("The AI service returned an empty response. Please try again.", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Social post architect returned non-JSON content:", content);
    throw new SocialPostArchitectError("The AI service returned an invalid response. Please try again.", 502);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new SocialPostArchitectError("The AI service returned an incomplete response. Please try again.", 502);
  }

  const obj = parsed as Record<string, unknown>;
  const captionRaw = typeof obj.caption === "string" ? obj.caption : "";
  const firstCommentRaw = typeof obj.firstComment === "string" ? obj.firstComment : "";
  const visualCueRaw = typeof obj.visualCue === "string" ? obj.visualCue.trim() : "";
  const aiHashtags = Array.isArray(obj.suggestedHashtags)
    ? (obj.suggestedHashtags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];

  if (!captionRaw.trim() || !firstCommentRaw.trim()) {
    console.error("Social post architect returned malformed JSON:", obj);
    throw new SocialPostArchitectError("The AI service returned an incomplete response. Please try again.", 502);
  }

  const caption = sanitizeCaption(captionRaw);
  const firstComment = sanitizeFirstComment(firstCommentRaw, request.destinationUrl);
  // Per spec: 3-8 hashtags. Cap at 8; if the AI under-delivered, top up
  // from the theme's default hashtag list and a tenant-derived tag so we
  // never return fewer than 3.
  const merged = dedupeHashtags([...request.preferredHashtags, ...aiHashtags]);
  const topUp = dedupeHashtags(defaultHashtagsForTheme(request.theme, request.tenant.name));
  const filled = dedupeHashtags([...merged, ...topUp]);
  const suggestedHashtags = filled.slice(0, 8);

  let visualCue = stripAllUrls(visualCueRaw).trim();
  if (!visualCue) {
    visualCue = request.animal
      ? `Pair this with a clear photo of ${request.animal.name}.`
      : "Pair this with a strong rescue photo that matches the tone.";
  }

  return {
    caption,
    firstComment,
    suggestedHashtags,
    visualCue,
  };
}

/**
 * Derive a sensible, brand-aware default hashtag from the rescue's name.
 * E.g., "Haseya's New Beginning Animal Rescue" → "#HaseyasNewBeginning".
 */
export function defaultHashtagFromName(name: string): string {
  const cleaned = (name || "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return cleaned ? `#${cleaned}` : "#AnimalRescue";
}

const THEME_HASHTAGS: Record<SocialPostTheme, string[]> = {
  transformation_tuesday: ["#TransformationTuesday", "#RescueTransformation", "#BeforeAndAfter"],
  happy_tail: ["#HappyTail", "#Adopted", "#AdoptDontShop"],
  urgent_need: ["#UrgentNeed", "#PleaseHelp", "#RescueLifeline"],
  volunteer_recruitment: ["#Volunteer", "#JoinUs", "#GiveYourTime"],
  monthly_donor_push: ["#MonthlyGiving", "#JoinThePack", "#SustainingDonor"],
  giving_tuesday: ["#GivingTuesday", "#GiveBack", "#GivingDay"],
  custom: [],
};

export function defaultHashtagsForTheme(theme: SocialPostTheme, tenantName: string): string[] {
  return dedupeHashtags([defaultHashtagFromName(tenantName), ...THEME_HASHTAGS[theme]]);
}
