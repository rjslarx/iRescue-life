import DOMPurify from 'isomorphic-dompurify';
import { db } from '../db';
import { catSafetyAddendumSettings, type CatSafetyAddendumAnswers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { mergePlaceholders } from './contract-template';

export const DEFAULT_CAT_SAFETY_ADDENDUM_HTML = `
<section class="cat-safety-addendum">
  <h1>Cat Safety Disclosure, Acknowledgment and Adopter Responsibility Agreement</h1>
  <table>
    <tr><th>Dog</th><td>{{animal_name}}</td></tr>
    <tr><th>Rescue</th><td>{{organization_name}}</td></tr>
    <tr><th>Effective date</th><td>{{contract_date}}</td></tr>
    <tr><th>Adopter 1</th><td>{{adopter_name}}</td></tr>
    <tr><th>Adopter 2, if applicable</th><td>{{adopter2_name}}</td></tr>
    <tr><th>Adoption address</th><td>{{adopter_address}}</td></tr>
    <tr><th>Existing cat name or description</th><td>{{resident_cat_description}}</td></tr>
  </table>
  <p><strong>Important safety warning:</strong> {{animal_name}} is <strong>not cat friendly</strong>. A cat already lives in the adopter's home. If {{animal_name}} gains access to that cat, the dog may chase, attack, seriously injure, or kill the cat. This risk may exist even if the dog appears calm, supervised, trained, or previously tolerated a cat.</p>
  <p>In consideration of the adoption of {{animal_name}}, each undersigned adopter agrees as follows:</p>
  <ol>
    <li><strong>Specific disclosure and actual knowledge.</strong> Before transfer, {{organization_name}} expressly told the adopter that {{animal_name}} is not safe with cats and presents a foreseeable risk of seriously injuring or killing a cat. The rescue has advised that placing {{animal_name}} in a home with a cat is not recommended. The adopter nevertheless requests to proceed and confirms that this warning was explained, understood, and accepted.<br><strong>Adopter initials:</strong> {{adopter1_initials}} / {{adopter2_initials}}</li>
    <li><strong>Existing cat and permanent separation.</strong> The adopter confirms that a cat lives in or regularly occupies the household or property. The adopter agrees that {{animal_name}} and every cat must be kept permanently and completely separated, with no direct or barrier-to-barrier contact. The adopter shall not bring, adopt, foster, pet-sit, or board any additional cat while {{animal_name}} lives there.<br><strong>Adopter initials:</strong> {{adopter1_initials}} / {{adopter2_initials}}</li>
    <li><strong>Strict prevention duties.</strong> The adopter shall maintain a secure cat-only area that {{animal_name}} cannot enter and use at least two independent physical barriers whenever practical, such as a closed, latched door plus a secured gate or separate enclosure. {{animal_name}} must be leashed or securely confined during transitions. Gates, doors, crates, windows, screens, and fencing must be maintained in working condition. The adopter shall not rely on training, verbal recall, a single baby gate, a muzzle, or supervision alone. All household members, visitors, caretakers, trainers, veterinarians, boarding facilities, and pet sitters must be warned and follow the same separation plan.</li>
    <li><strong>No testing or introductions.</strong> The adopter shall never test {{animal_name}} with a resident cat, attempt an introduction, or permit nose-to-nose, fence-line, door-crack, crate-to-cat, muzzled, or off-leash contact. Any behavior assessment reflects only the circumstances observed and is not a guarantee of future behavior.<br><strong>Adopter initials:</strong> {{adopter1_initials}} / {{adopter2_initials}}</li>
    <li><strong>Responsibility after transfer.</strong> From the time possession is transferred, the adopter accepts full responsibility for {{animal_name}}'s custody, control, management, supervision, and compliance with applicable laws. The adopter agrees to pay losses, veterinary costs, property damage, claims, and reasonable expenses arising from failure to follow this agreement, to the fullest extent permitted by law.</li>
    <li><strong>Indemnity and release to the extent allowed by law.</strong> To the fullest extent permitted by applicable law, the adopter shall defend, indemnify, and hold harmless the rescue and its directors, officers, employees, volunteers, fosters, agents, and representatives from third-party claims, damages, losses, costs, and reasonable attorney fees arising after transfer from {{animal_name}}'s contact with a cat or from the adopter's breach of this agreement. This clause does not release or limit liability that cannot legally be waived.</li>
    <li><strong>Immediate notice and return.</strong> If the adopter cannot maintain permanent separation for any reason, or if {{animal_name}} escapes, reaches the cat's area, attempts to attack, injures, or kills a cat, the adopter shall immediately secure the dog, promptly notify {{organization_name}}, and cooperate in arranging the dog's return. The adopter shall not abandon, sell, give away, or transfer {{animal_name}} without the rescue's prior written approval, except as otherwise required by law or emergency authorities.<br><strong>Adopter initials:</strong> {{adopter1_initials}} / {{adopter2_initials}}</li>
    <li><strong>Breach and enforcement.</strong> A violation of this agreement is a material breach of the adoption agreement and may be grounds for immediate return or recovery of {{animal_name}}, subject to applicable law. The rescue's failure to enforce a provision once does not waive future enforcement.</li>
    <li><strong>No guarantee; entire acknowledgment.</strong> The adopter understands that animals can behave unpredictably and that the rescue makes no guarantee that {{animal_name}} will never harm an animal. This document supplements the parties' adoption agreement. If a provision is unenforceable, the remaining provisions remain effective to the fullest extent allowed by law.</li>
    <li><strong>Governing law.</strong> This agreement is governed by the law and venue provisions in the adoption agreement, except where applicable law requires otherwise.</li>
  </ol>
  <h2>Required Written Separation Plan</h2>
  <table>
    <tr><th>Where the resident cat will be securely housed</th><td>{{resident_cat_housing}}</td></tr>
    <tr><th>Primary physical barrier</th><td>{{primary_barrier}}</td></tr>
    <tr><th>Secondary physical barrier</th><td>{{secondary_barrier}}</td></tr>
    <tr><th>How transitions and doors will be managed</th><td>{{transitions_plan}}</td></tr>
    <tr><th>Who is responsible for daily separation</th><td>{{responsible_person}}</td></tr>
    <tr><th>Emergency plan if either animal escapes confinement</th><td>{{emergency_plan}}</td></tr>
  </table>
  <p><strong>By signing, each adopter confirms:</strong> I have read every page; I understand the specific danger to cats; I voluntarily accept the duties in this agreement; and I received a copy.</p>
  <p><em>Document note: This starting draft records a specific safety disclosure and the adopter's management obligations. It is not legal advice or a representation that counsel has approved it. Each organization should have local counsel review it together with the complete adoption agreement before routine use.</em></p>
</section>`;

const options = {
  ALLOWED_TAGS: ['div', 'section', 'span', 'p', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['class', 'colspan', 'rowspan'],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeCatSafetyAddendumHtml(html: string): string {
  return DOMPurify.sanitize(html, options);
}

export function hasMeaningfulCatSafetyAddendumHtml(html: string): boolean {
  return sanitizeCatSafetyAddendumHtml(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

export async function getOrCreateCatSafetyAddendum(tenantId: string) {
  let [setting] = await db.select().from(catSafetyAddendumSettings)
    .where(eq(catSafetyAddendumSettings.tenantId, tenantId)).limit(1);
  if (!setting) {
    await db.insert(catSafetyAddendumSettings).values({
      tenantId, enabled: false, htmlTemplate: DEFAULT_CAT_SAFETY_ADDENDUM_HTML,
    }).onConflictDoNothing();
    [setting] = await db.select().from(catSafetyAddendumSettings)
      .where(eq(catSafetyAddendumSettings.tenantId, tenantId)).limit(1);
  }
  return setting;
}

export function renderCatSafetyAddendum(
  snapshot: string,
  values: Record<string, string>,
  answers?: CatSafetyAddendumAnswers,
): string {
  const pending = 'To be completed at signing';
  const responseValues: Record<string, string> = answers ? {
    resident_cat_description: answers.residentCatDescription,
    resident_cat_housing: answers.residentCatHousing,
    primary_barrier: answers.primaryBarrier,
    secondary_barrier: answers.secondaryBarrier,
    transitions_plan: answers.transitionsPlan,
    responsible_person: answers.responsiblePerson,
    emergency_plan: answers.emergencyPlan,
    adopter1_initials: answers.adopter1Initials,
    adopter2_name: answers.coAdopter?.name || 'Not applicable',
    adopter2_phone: answers.coAdopter?.phone || 'Not applicable',
    adopter2_initials: answers.coAdopter?.initials || 'N/A',
  } : {
    resident_cat_description: pending,
    resident_cat_housing: pending,
    primary_barrier: pending,
    secondary_barrier: pending,
    transitions_plan: pending,
    responsible_person: pending,
    emergency_plan: pending,
    adopter1_initials: pending,
    adopter2_name: 'If applicable',
    adopter2_phone: 'If applicable',
    adopter2_initials: 'If applicable',
  };
  return sanitizeCatSafetyAddendumHtml(mergePlaceholders(snapshot, { ...responseValues, ...values }));
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function catSafetyEvidenceHtml(answers: CatSafetyAddendumAnswers, signedAt: Date, primarySignatureData?: string): string {
  const rows: Array<[string, string]> = [
    ['Resident cat name or description', answers.residentCatDescription],
    ['Resident cat secure housing', answers.residentCatHousing],
    ['Primary physical barrier', answers.primaryBarrier],
    ['Secondary barrier', answers.secondaryBarrier], ['Transition plan', answers.transitionsPlan],
    ['Responsible person', answers.responsiblePerson], ['Emergency plan', answers.emergencyPlan],
    ['Primary adopter initials (clauses 1, 2, 4, and 7)', answers.adopter1Initials],
  ];
  if (answers.coAdopter) rows.push(['Co-adopter', `${answers.coAdopter.name}; ${answers.coAdopter.phone}; initials for clauses 1, 2, 4, and 7: ${answers.coAdopter.initials}`]);
  const coSignature = answers.coAdopter ? `<p>Co-adopter signature:</p><img src="${answers.coAdopter.signatureImageData}" alt="Co-adopter signature" style="max-height:80px;max-width:300px">` : '';
  const primary = primarySignatureData ? `<p>Primary adopter signature:</p><img src="${primarySignatureData}" alt="Primary adopter signature" style="max-height:80px;max-width:300px">` : '';
  return `<section class="cat-safety-evidence" style="page-break-before:always"><h2>Cat Safety Addendum — Immutable Responses and Evidence</h2><table>${rows.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>${primary}${coSignature}<p>Electronically acknowledged: ${esc(signedAt.toISOString())}</p></section>`;
}