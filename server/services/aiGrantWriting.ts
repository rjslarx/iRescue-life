import OpenAI from "openai";
import { db } from "../db";
import { animals, type Tenant, type Grant } from "@shared/schema";
import { and, eq, gte, lte, or, isNull, ne, inArray, sql } from "drizzle-orm";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const MODEL = "gpt-4o";

export interface OrgContext {
  name: string;
  legalName: string | null;
  ein: string | null;
  missionStatement: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  stateLicense: string | null;
  stats: {
    periodLabel: string;
    totalIntake: number;
    intakeBySpecies: Record<string, number>;
    totalOutcomes: number;
    outcomesByStatus: Record<string, number>;
    adoptions: number;
    liveReleaseRate: number;
  };
}

/**
 * Assemble the org context bundle: tenant profile fields + live intake/outcome/LRR
 * stats for the trailing 12 months (same aggregation logic as the Data Matrix tab).
 */
export async function buildOrgContext(tenant: Tenant): Promise<OrgContext> {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  const notTnr = or(isNull(animals.recordType), ne(animals.recordType, "tnr"));

  const intakeRows = await db
    .select({ species: animals.species, count: sql<number>`count(*)::int` })
    .from(animals)
    .where(and(eq(animals.tenantId, tenant.id), gte(animals.intakeDate, start), lte(animals.intakeDate, end), notTnr))
    .groupBy(animals.species);

  const intakeBySpecies: Record<string, number> = {};
  let totalIntake = 0;
  for (const row of intakeRows) {
    intakeBySpecies[row.species || "unknown"] = row.count;
    totalIntake += row.count;
  }

  const outcomeStatuses = ["adopted", "returned_to_owner", "transported", "deceased", "returned_to_field"];
  const outcomeRows = await db
    .select({ status: animals.status, count: sql<number>`count(*)::int` })
    .from(animals)
    .where(and(
      eq(animals.tenantId, tenant.id),
      inArray(animals.status, outcomeStatuses),
      notTnr,
      gte(animals.updatedAt, start),
      lte(animals.updatedAt, end),
    ))
    .groupBy(animals.status);

  const outcomesByStatus: Record<string, number> = {};
  let totalOutcomes = 0;
  for (const row of outcomeRows) {
    outcomesByStatus[row.status] = row.count;
    totalOutcomes += row.count;
  }
  const deceased = outcomesByStatus["deceased"] || 0;
  const liveReleaseRate = totalOutcomes > 0
    ? Math.round(((totalOutcomes - deceased) / totalOutcomes) * 1000) / 10
    : 0;

  const t = tenant as any;
  const addressParts = [t.orgAddressStreet, t.orgAddressCity, t.orgAddressState, t.orgAddressZip].filter(Boolean);
  const ein = t.orgTaxEin || t.transparencyVault?.ein || null;

  return {
    name: tenant.name,
    legalName: t.orgLegalName || null,
    ein,
    missionStatement: t.missionStatement || null,
    address: addressParts.length ? addressParts.join(", ") : (t.footerAddress || null),
    phone: t.orgPhonePublic || t.contactPhone || null,
    email: t.orgEmailRecords || t.contactEmail || null,
    website: t.orgWebsiteUrl || null,
    stateLicense: t.orgStateLicenseNumber || null,
    stats: {
      periodLabel: "trailing 12 months",
      totalIntake,
      intakeBySpecies,
      totalOutcomes,
      outcomesByStatus,
      adoptions: outcomesByStatus["adopted"] || 0,
      liveReleaseRate,
    },
  };
}

function contextBlock(ctx: OrgContext): string {
  const speciesLines = Object.entries(ctx.stats.intakeBySpecies)
    .map(([sp, n]) => `  - ${sp}: ${n}`)
    .join("\n");
  const outcomeLines = Object.entries(ctx.stats.outcomesByStatus)
    .map(([st, n]) => `  - ${st.replace(/_/g, " ")}: ${n}`)
    .join("\n");
  return `ORGANIZATION PROFILE:
- Name: ${ctx.name}${ctx.legalName ? ` (legal name: ${ctx.legalName})` : ""}
- 501(c)(3) EIN: ${ctx.ein || "not on file"}
- Mission statement: ${ctx.missionStatement || "not on file"}
- Address: ${ctx.address || "not on file"}
- Phone: ${ctx.phone || "not on file"} | Email: ${ctx.email || "not on file"}
- Website: ${ctx.website || "not on file"}
${ctx.stateLicense ? `- State license #: ${ctx.stateLicense}\n` : ""}
LIVE IMPACT STATISTICS (${ctx.stats.periodLabel}):
- Total animal intake: ${ctx.stats.totalIntake}
${speciesLines ? `- Intake by species:\n${speciesLines}` : ""}
- Total outcomes: ${ctx.stats.totalOutcomes}
${outcomeLines ? `- Outcomes by type:\n${outcomeLines}` : ""}
- Adoptions: ${ctx.stats.adoptions}
- Live release rate: ${ctx.stats.liveReleaseRate}%

RULES:
- Use ONLY the statistics above; never invent numbers, program names, budgets, or history that is not provided.
- If a fact is "not on file", write around it gracefully rather than inventing it.
- Write in a professional, warm nonprofit grant-writing voice. No emoji. No markdown headings unless asked.`;
}

function grantToneBlock(grant: Grant): string {
  return `TARGET GRANT:
- Funder: ${grant.funderName}
- Program: ${grant.programName}
- Program area of this request: ${grant.programArea ? grant.programArea.replace(/_/g, " ") : "general support"}
${grant.amountRequested ? `- Amount requested: $${grant.amountRequested}` : ""}
${grant.notes ? `- Internal notes about this grant: ${grant.notes}` : ""}

Tailor the tone and emphasis to THIS funder and program area (e.g., a medical-care funder should hear about veterinary outcomes; a spay/neuter funder about surgery counts). Do not produce generic copy-paste text.`;
}

/**
 * Draft answers for a batch of application questions. Returns answers in the
 * same order as the input questions.
 */
export async function draftGrantAnswers(
  ctx: OrgContext,
  grant: Grant,
  questions: string[],
): Promise<{ answers: string[]; model: string }> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert nonprofit grant writer drafting application answers for an animal rescue. ${contextBlock(ctx)}\n\n${grantToneBlock(grant)}`,
      },
      {
        role: "user",
        content: `Draft an answer for each of the following application questions. Answers should be complete, specific to this organization, and ready for staff review (typically 100-250 words each unless the question implies a short factual answer like an EIN or address).

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Respond with ONLY valid JSON in this exact shape: {"answers": ["answer to question 1", "answer to question 2", ...]} with exactly ${questions.length} answers in order.`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.answers) || parsed.answers.length !== questions.length) {
    throw new Error("AI response did not contain the expected number of answers");
  }
  return { answers: parsed.answers.map((a: any) => String(a)), model: MODEL };
}

/**
 * Seed initial Answer Library blocks from the org's real data.
 */
export async function seedAnswerLibrary(
  ctx: OrgContext,
): Promise<Array<{ title: string; category: "org_history" | "programs_overview" | "financial" | "contact" | "other"; content: string }>> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert nonprofit grant writer building reusable boilerplate blocks for an animal rescue's grant applications. ${contextBlock(ctx)}`,
      },
      {
        role: "user",
        content: `Write four reusable boilerplate blocks this organization can paste into grant applications:
1. "Organization History & Mission" (category "org_history") — who they are and what they do, grounded in the mission statement and real stats.
2. "Programs Overview" (category "programs_overview") — describe their rescue work using ONLY the intake/outcome statistics provided (do not invent named programs).
3. "Financial & Legal Summary" (category "financial") — legal name, EIN, 501(c)(3) status; note any items not on file as placeholders in [BRACKETS] for staff to fill.
4. "Contact Information" (category "contact") — a clean contact block from the profile fields; use [BRACKETS] placeholders for anything not on file.

Respond with ONLY valid JSON: {"blocks": [{"title": "...", "category": "...", "content": "..."}, ...]}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.blocks)) throw new Error("AI response missing blocks");
  const validCategories = ["org_history", "programs_overview", "financial", "contact", "other"];
  return parsed.blocks.map((b: any) => ({
    title: String(b.title || "Untitled block"),
    category: validCategories.includes(b.category) ? b.category : "other",
    content: String(b.content || ""),
  }));
}

export interface GrantSuggestion {
  funderName: string;
  programName: string;
  rationale: string;
  programArea: string;
  searchQuery: string;
}

/**
 * Suggest candidate funders/programs matched to the org profile. Suggestions
 * come from model knowledge only and must be verified by staff.
 */
export async function suggestGrants(
  ctx: OrgContext,
  lookingFor: string | undefined,
): Promise<GrantSuggestion[]> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a nonprofit development researcher who knows the US animal-welfare grant landscape well. ${contextBlock(ctx)}

You CANNOT browse the web. Suggest only funders/programs you are reasonably confident actually exist (e.g., well-known national and regional animal-welfare funders). Staff will verify every suggestion on the funder's website before acting.`,
      },
      {
        role: "user",
        content: `Suggest 5-7 grant funders or programs this rescue is a plausible fit for${lookingFor ? `, focused on: ${lookingFor}` : ""}.

For each suggestion include:
- funderName
- programName (the likely grant program; if unsure, a plausible general label like "General grants program")
- rationale (1-2 sentences tying it to THIS org's profile and stats)
- programArea (one of: medical, operations, spay_neuter, senior_program, special_needs, foster_program, facility, unrestricted, other)
- searchQuery (a short web search string staff can use to verify, e.g. "PetSmart Charities grant application animal rescue")

Respond with ONLY valid JSON: {"suggestions": [{...}, ...]}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.suggestions)) throw new Error("AI response missing suggestions");
  const validAreas = ["medical", "operations", "spay_neuter", "senior_program", "special_needs", "foster_program", "facility", "unrestricted", "other"];
  return parsed.suggestions.map((s: any) => ({
    funderName: String(s.funderName || "Unknown funder"),
    programName: String(s.programName || "General grants program"),
    rationale: String(s.rationale || ""),
    programArea: validAreas.includes(s.programArea) ? s.programArea : "other",
    searchQuery: String(s.searchQuery || `${s.funderName || ""} grant application`),
  }));
}
