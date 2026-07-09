import { db } from '../db';
import { tenants, customForms } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const TRAP_LOAN_SLUG = 'cnr-trap-loan';
const TRAP_LOAN_FORM_NAME = 'CNR Trap Loan Agreement';

const TRAP_LOAN_FORM_HTML = `<div>
<h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">CNR Trap Loan Agreement</h1>
<p style="text-align: center;"><strong>{{organization_name}}</strong></p>

<h2>Borrower Information</h2>
<table style="width: 100%; border-collapse: collapse;">
  <tbody>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd; width: 35%;"><strong>Name</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{signer_name}}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Address</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{address}}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{signer_phone}}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{signer_email}}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Number of Traps Needed</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{traps_needed}}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Loan Duration</strong></td>
      <td style="padding: 8px; border: 1px solid #ddd;">{{loan_duration}}</td>
    </tr>
  </tbody>
</table>

<h2>Loan Terms &amp; Conditions</h2>
<ul>
  <li>The traps loaned under this agreement remain the property of {{organization_name}} at all times.</li>
  <li>The borrower agrees to use the traps solely for humane trapping as part of Community cat / Trap-Neuter-Return (CNR/TNR) efforts.</li>
  <li>Traps must be checked frequently and never left unattended for extended periods. Trapped animals must not be left in traps in extreme heat, cold, rain, or direct sunlight.</li>
  <li>The borrower agrees to return all traps clean and in good working condition by the end of the agreed loan duration.</li>
</ul>

<h2>Liability for Damaged or Missing Traps</h2>
<p><strong>If any trap is not returned, or is returned damaged beyond normal wear and tear, the borrower agrees to pay {{organization_name}} a fee of $125.00 (one hundred twenty-five dollars) per damaged or missing trap.</strong></p>

<h2>Acknowledgment &amp; Signature</h2>
<p>I, <strong>{{signer_name}}</strong>, have read, understand, and agree to the terms of this Trap Loan Agreement, including the $125.00 per-trap fee for damaged or missing traps.</p>

<div style="margin-top: 30px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc;">
  <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
    <img src="{{signature_image_url}}" alt="Signature" style="max-height: 80px;" />
  </div>
  <br>
  <strong>Signature</strong>
  <p>Date: {{date}}</p>
  <div style="font-size: 0.8em; color: #888; margin-top: 10px;">
    <p>Digitally Signed via iRescue.life</p>
    <p>Timestamp: {{signed_timestamp}}</p>
    <p>IP Address: {{signed_ip}}</p>
  </div>
</div>
</div>`;

const TRAP_LOAN_FORM_FIELDS = [
  {
    key: 'address',
    label: 'Home Address',
    type: 'text' as const,
    required: true,
    helpText: 'Street address, city, state, and ZIP',
  },
  {
    key: 'traps_needed',
    label: 'Number of Traps Needed',
    type: 'number' as const,
    required: true,
  },
  {
    key: 'loan_duration',
    label: 'How Long Do You Need the Traps?',
    type: 'text' as const,
    required: true,
    helpText: 'For example: 2 weeks',
  },
  {
    key: 'id_document',
    label: 'Upload a Photo of Your ID',
    type: 'file' as const,
    required: true,
    helpText: "A photo of your driver's license or other government-issued ID",
  },
];

/**
 * One-time idempotent seed: creates the public CNR Trap Loan Agreement form
 * for Southern Pets Animal Rescue. Safe to run on every boot — skips if the
 * form already exists (matched by tenant + public slug).
 */
export async function seedTrapLoanForm(): Promise<void> {
  try {
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.subdomain, 'southernpets'))
      .limit(1);

    if (!tenant) {
      return; // Tenant doesn't exist in this environment (e.g., fresh dev DB)
    }

    const [existing] = await db
      .select({ id: customForms.id })
      .from(customForms)
      .where(and(
        eq(customForms.tenantId, tenant.id),
        eq(customForms.publicSlug, TRAP_LOAN_SLUG)
      ))
      .limit(1);

    if (existing) {
      return; // Already seeded
    }

    const { sanitizeTemplate } = await import('../services/custom-form');

    await db.insert(customForms).values({
      tenantId: tenant.id,
      name: TRAP_LOAN_FORM_NAME,
      description: 'Borrow humane traps for Community cat / Trap-Neuter-Return (CNR/TNR) efforts. A valid photo ID is required, and a $125 fee applies per damaged or missing trap.',
      formType: 'standalone',
      htmlTemplate: sanitizeTemplate(TRAP_LOAN_FORM_HTML),
      requiresSignature: true,
      isActive: true,
      isPublic: true,
      publicSlug: TRAP_LOAN_SLUG,
      formFields: TRAP_LOAN_FORM_FIELDS,
    });

    console.log('[Startup] Seeded CNR Trap Loan Agreement form for southernpets');
  } catch (err) {
    console.error('[Startup] Trap loan form seed failed (will retry next boot):', err);
  }
}
