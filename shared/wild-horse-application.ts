// Stable, versioned question IDs preserve the meaning of submitted answers.
export const WILD_HORSE_INTRO = "This application is for unhandled or minimally handled wild horses. Answers help us evaluate safety, humane care, realistic expectations, and long-term suitability. A site visit, references, and a written placement agreement may be required.";
export const WILD_HORSE_PRINCIPLES = "Our placements prioritize the horses’ physical and emotional welfare. Applicants must provide suitable equine companionship, secure containment, appropriate nutrition and veterinary care, and patient, low-stress handling. We do not approve using intimidation, flooding, excessive pressure, pain, or punishment to force compliance. This is a welfare expectation, not a question about a branded training system.\n\nNo horse may be sold at auction, transferred, bred, or rehomed without written permission under the final placement agreement. Ownership, return provisions, and any future monitoring are established in that separate signed agreement. Submission does not guarantee approval.";

type Question = { key: string; label: string; fieldType?: "text" | "textarea" | "radio" | "checkbox"; options?: string[]; required?: boolean; textAbove?: string; helpText?: string };
const questions: Question[] = [
  { key: "parish", label: "Parish", fieldType: "text", textAbove: "A. Applicant information" },
  { key: "placement", label: "Placement requested", fieldType: "radio", options: ["Permanent adoption", "Long-term sanctuary / care arrangement", "Either"] },
  { key: "capacity", label: "Horses you could accommodate", fieldType: "radio", options: ["1", "2", "All 3", "Other"] },
  { key: "capacity_other", label: "If Other, how many horses could you accommodate?", fieldType: "text", required: false },
  { key: "caregivers", label: "Who lives on the property and who will provide daily horse care?" },
  { key: "owner", label: "Property owner (if different)", fieldType: "text", required: false, textAbove: "B. Property and facilities" },
  { key: "acres", label: "Acres available to horses", fieldType: "text" },
  { key: "property_status", label: "Property status", fieldType: "radio", options: ["Owned", "Leased", "Boarding arrangement"] },
  { key: "boarding", label: "Explain your boarding arrangement, if applicable", required: false },
  { key: "fencing", label: "Describe fencing (height, materials, gate security, and any double-gated or smaller secure pen)." },
  { key: "facilities", label: "Describe water, forage/hay, shade, shelter, drainage, and winter/weather contingency plans." },
  { key: "photos", label: "Can you provide photos/video of fencing, gates, shelter, water, and the proposed pasture?", fieldType: "radio", options: ["Yes", "No"] },
  { key: "herd_total", label: "Current horses on property", fieldType: "text", textAbove: "C. Existing herd and companionship" },
  { key: "mares", label: "Mares", fieldType: "text" },
  { key: "geldings", label: "Geldings", fieldType: "text" },
  { key: "stallions", label: "Stallions", fieldType: "text" },
  { key: "herd_dynamics", label: "Tell us about your horses’ personalities, social dynamics, and how they react when a new horse arrives.", helpText: "If you have no current horses, say so and describe your companionship plan." },
  { key: "introductions", label: "Where would arriving wild horses stay initially? Describe safe introductions to the resident herd." },
  { key: "resources", label: "What would you do if a resident horse chased a newcomer away from hay or water?" },
  { key: "companionship", label: "If accepting fewer than three mares, how would you ensure safe, compatible companionship?", helpText: "If accepting all three, you may write Not applicable." },
  { key: "experience", label: "Describe your experience with unhandled, fearful, or difficult-to-approach horses.", textAbove: "D. Experience, practical care and support" },
  { key: "providers", label: "Name your equine vet, hoof-care provider, and backup caretaker. How would you arrange care for an unhandled horse?" },
  { key: "receive", label: "Can you safely receive horses that may not lead, tie, or load conventionally?", fieldType: "radio", options: ["Yes", "Not yet"] },
  { key: "transport", label: "Describe the unloading area and how you would arrange transport with handlers experienced in wild horses." },
  { key: "scenario_feed", label: "1. A mare moves away every time you approach with feed. Walk us through what you would do over the next week.", textAbove: "E. Building trust and responding to fear\nPlease answer in your own words. We are interested in what you would actually do, including how you would know when to stop or change your approach." },
  { key: "scenario_freeze", label: "2. You enter the pasture and a horse freezes, raises her head, and prepares to flee. What would you do in that moment?" },
  { key: "scenario_contact", label: "3. A horse approaches you voluntarily one day but refuses contact the next day. How would you respond?" },
  { key: "scenario_gate", label: "4. A horse becomes frightened near a gate and starts rushing the fence. How would you manage everyone’s safety and help her settle?" },
  { key: "scenario_care", label: "5. A routine care task cannot be completed without frightening the horse. What would you do next, and when would you call for qualified help?" },
  { key: "first_month", label: "What would a successful first 30 days look like for a wild mare on your property?", textAbove: "F. Expectations and decision-making" },
  { key: "long_term", label: "If one mare remains wary of people for years and is never rideable, what would her life with you look like?" },
  { key: "backup", label: "If your circumstances change (illness, finances, move, loss of pasture), what is your backup plan?" },
  { key: "vet_reference", label: "Equine veterinarian / clinic and phone", fieldType: "text", textAbove: "G. References and review" },
  { key: "personal_reference", label: "Horse-experienced personal reference and phone", fieldType: "text" },
  { key: "care_reference", label: "Additional horse-care reference and phone", fieldType: "text" },
  { key: "review_materials", label: "I can provide", fieldType: "checkbox", options: ["Property photos/video", "Veterinary reference", "Site visit or live video tour"], required: false },
  { key: "ack_unhandled", label: "I understand that these horses may remain unhandled and are not guaranteed to become rideable.", fieldType: "checkbox", options: ["I understand"], textAbove: `H. Placement principles and applicant acknowledgment\n${WILD_HORSE_PRINCIPLES}` },
  { key: "ack_screening", label: "I agree to a screening interview, reference checks, and property review before placement.", fieldType: "checkbox", options: ["I agree"] },
  { key: "signature", label: "Applicant signature — type your full legal name", fieldType: "text", helpText: "Typing your name acknowledges this application. The final placement agreement is signed separately." },
  { key: "date", label: "Date (YYYY-MM-DD)", fieldType: "text" },
];

export function wildHorseFields(tenantId: string) {
  return questions.map((q, order) => ({
    id: `wild_horse_v1_${q.key}`, tenantId, label: q.label,
    fieldType: q.fieldType || "textarea", options: q.options || null,
    required: q.required !== false, placeholder: null, helpText: q.helpText || null,
    textAbove: q.textAbove || null, textBelow: null, order, speciesFilter: "Horse",
    isActive: true,
  }));
}

export function usesWildHorseApplication(subdomain: string, animal: { species?: string | null; petfinderType?: string | null; horseType?: string | null }) {
  return subdomain === "haseyas" && (animal.petfinderType || animal.species || "").toLowerCase() === "horse" && animal.horseType === "wild";
}

export function validateWildHorseResponses(responses: Record<string, unknown> = {}) {
  const errors: string[] = [];
  for (const field of wildHorseFields("")) {
    const value = responses[field.id];
    const empty = value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
    if (empty) { if (field.required) errors.push(field.label); continue; }
    if (field.fieldType === "checkbox") {
      if (!Array.isArray(value) || value.some(v => typeof v !== "string" || !field.options?.includes(v))) errors.push(field.label);
    } else if (typeof value !== "string" || value.length > 10000 || (field.options && !field.options.includes(value))) errors.push(field.label);
  }
  for (const [trigger, answer, dependent] of [["capacity", "Other", "capacity_other"], ["property_status", "Boarding arrangement", "boarding"]]) {
    if (responses[`wild_horse_v1_${trigger}`] === answer && !String(responses[`wild_horse_v1_${dependent}`] || "").trim()) errors.push(dependent === "boarding" ? "Boarding arrangement explanation" : "Number of horses");
  }
  const date = responses.wild_horse_v1_date;
  if (typeof date === "string" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) errors.push("Valid signature date (YYYY-MM-DD)");
  return errors;
}
