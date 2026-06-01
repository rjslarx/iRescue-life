import { storage } from '../storage';
import type { SurrenderContractTemplate, InsertSurrenderContractTemplate } from '@shared/schema';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SurrenderAgreementData {
  tenantName: string;
  ownerName: string;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  animalName?: string | null;
  animalAge?: string | null;
  animalBreed?: string | null;
  animalSex?: string | null;
  signatureImageUrl?: string;
  signedTimestamp?: string;
}

/**
 * Builds the HTML for an owner surrender (relinquishment) agreement.
 * The legal text is parametrized with the tenant's organization name so it
 * works for any rescue. When a signature image is supplied the document is
 * rendered in its signed form (signature shown), otherwise it is rendered for
 * review with a blank signature line.
 */
export function buildSurrenderAgreementHtml(data: SurrenderAgreementData): string {
  const org = escapeHtml(data.tenantName) || 'the rescue organization';
  const ownerName = escapeHtml(data.ownerName);
  const ownerPhone = escapeHtml(data.ownerPhone);
  const ownerAddress = escapeHtml(data.ownerAddress);
  const animalName = escapeHtml(data.animalName);
  const animalAge = escapeHtml(data.animalAge);
  const animalBreed = escapeHtml(data.animalBreed);
  const animalSex = escapeHtml(data.animalSex);

  const dateStr = data.signedTimestamp
    ? new Date(data.signedTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const animalRows = [
    animalName ? `<tr><th>Pet's Name</th><td>${animalName}</td></tr>` : '',
    animalAge ? `<tr><th>Age</th><td>${animalAge}</td></tr>` : '',
    animalBreed ? `<tr><th>Breed</th><td>${animalBreed}</td></tr>` : '',
    animalSex ? `<tr><th>Sex</th><td>${animalSex}</td></tr>` : '',
  ].filter(Boolean).join('');

  const ownerRows = [
    ownerName ? `<tr><th>Name</th><td>${ownerName}</td></tr>` : '',
    ownerAddress ? `<tr><th>Address</th><td>${ownerAddress}</td></tr>` : '',
    ownerPhone ? `<tr><th>Phone</th><td>${ownerPhone}</td></tr>` : '',
  ].filter(Boolean).join('');

  const signatureBlock = data.signatureImageUrl
    ? `<img src="${data.signatureImageUrl}" alt="Signature" style="max-width:300px;max-height:120px;display:block;margin:8px 0;" />`
    : `<div style="border-bottom:1px solid #333;width:300px;height:48px;margin:8px 0;"></div>`;

  return `
    <div class="surrender-agreement">
      <h2 style="text-align:center;margin-bottom:4px;">Owner Surrender Agreement</h2>
      <p style="text-align:center;color:#555;margin-top:0;">${org}</p>

      ${ownerRows ? `<h3>Owner Information</h3><table>${ownerRows}</table>` : ''}
      ${animalRows ? `<h3>Animal Information</h3><table>${animalRows}</table>` : ''}

      <h3>Relinquishment of Ownership</h3>
      <p>You are the legal owner of the animal you are relinquishing.</p>
      <p>${org} will assess the physical and behavioral health of the animal's adoptability. If you subsequently call about the animal's status, you may not be given any follow up information about the animal except whether it is or is not at the shelter.</p>
      <p>I, the undersigned, owner or having control of the animal described above, hereby give ownership of said animal to ${org} to be placed for adoption or rescue.</p>
      <p>I assume all responsibility for damages caused during my ownership of said animal. I agree to make all veterinarian records for said animal available to the shelter and/or adopter of said animal.</p>
      <p>I certify, to my knowledge, that this animal has not bitten anyone in the last 10 days, nor has been exposed to rabies.</p>
      <p>I understand and agree that the shelter reserves the right to place this animal in a foster home, or for adoption.</p>

      <div class="signature-section" style="margin-top:32px;">
        <p><strong>Print Name:</strong> ${ownerName}</p>
        <p><strong>Signature:</strong></p>
        ${signatureBlock}
        <p><strong>Date:</strong> ${dateStr}</p>
      </div>
    </div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Tenant-editable surrender contract templates (mirrors foster-contract-template)
// ---------------------------------------------------------------------------

export const SURRENDER_MERGE_FIELDS: Record<string, string> = {
  '{{tenant_name}}': 'Name of the rescue organization',
  '{{organization_name}}': 'Name of the rescue organization (alias)',
  '{{owner_name}}': 'Full name of the surrendering owner',
  '{{owner_email}}': 'Email address of the owner',
  '{{owner_phone}}': 'Phone number of the owner',
  '{{owner_address}}': 'Full address of the owner',
  '{{animal_name}}': 'Name of the animal being surrendered',
  '{{animal_species}}': 'Species of the animal (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Breed of the animal',
  '{{animal_sex}}': 'Sex of the animal',
  '{{animal_age}}': 'Age of the animal',
  '{{surrender_reason}}': 'Reason the owner is surrendering the animal',
  '{{contract_date}}': 'Date of agreement signing',
  '{{today}}': "Today's date",
  '{{signature_image_url}}': 'Signature image (auto-inserted at signing)',
  '{{signed_timestamp}}': 'Timestamp when the agreement was signed',
  '{{signed_ip}}': 'IP address of the signer',
};

export interface SurrenderMergeData {
  tenant_name?: string;
  organization_name?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  owner_address?: string;
  animal_name?: string;
  animal_species?: string;
  animal_breed?: string;
  animal_sex?: string;
  animal_age?: string;
  surrender_reason?: string;
  contract_date?: string;
  today?: string;
  signature_image_url?: string;
  signed_timestamp?: string;
  signed_ip?: string;
}

export function buildSurrenderMergeData(options: {
  tenantName: string;
  ownerName: string;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  animalName?: string | null;
  animalSpecies?: string | null;
  animalBreed?: string | null;
  animalSex?: string | null;
  animalAge?: string | null;
  surrenderReason?: string | null;
  signatureImageUrl?: string;
  signedTimestamp?: string;
  signedIp?: string;
}): SurrenderMergeData {
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateStr = options.signedTimestamp
    ? new Date(options.signedTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : todayStr;

  return {
    tenant_name: options.tenantName,
    organization_name: options.tenantName,
    owner_name: options.ownerName,
    owner_email: options.ownerEmail || '',
    owner_phone: options.ownerPhone || '',
    owner_address: options.ownerAddress || '',
    animal_name: options.animalName || '',
    animal_species: options.animalSpecies || '',
    animal_breed: options.animalBreed || '',
    animal_sex: options.animalSex || '',
    animal_age: options.animalAge || '',
    surrender_reason: options.surrenderReason || '',
    contract_date: dateStr,
    today: todayStr,
    signature_image_url: options.signatureImageUrl || '',
    signed_timestamp: options.signedTimestamp || '',
    signed_ip: options.signedIp || '',
  };
}

export function mergeSurrenderPlaceholders(html: string, data: SurrenderMergeData): string {
  let result = html;

  for (const [key, value] of Object.entries(data)) {
    if (key === 'signature_image_url') continue;
    const placeholder = `{{${key}}}`;
    const escapedValue = escapeHtml(value?.toString() ?? '');
    result = result.replaceAll(placeholder, escapedValue);
  }

  if (data.signature_image_url) {
    const url = data.signature_image_url;
    const isValidUrl = url.startsWith('data:image/') ||
                       url.startsWith('https://') ||
                       url.startsWith('/');
    if (isValidUrl) {
      result = result.replaceAll('{{signature_image_url}}', escapeHtml(url));
    }
  }

  return result;
}

export function validateSurrenderTemplate(html: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!html || html.trim().length === 0) {
    errors.push('Template HTML cannot be empty');
    return { valid: false, errors };
  }

  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(html)) {
      errors.push('Template contains potentially dangerous content (scripts or event handlers)');
      break;
    }
  }

  return {
    valid: errors.filter(e => !e.startsWith('Warning:')).length === 0,
    errors,
  };
}

export async function getDefaultSurrenderTemplate(tenantId: string): Promise<SurrenderContractTemplate | null> {
  return await storage.getDefaultSurrenderContractTemplate(tenantId);
}

export async function getAllSurrenderTemplates(tenantId: string): Promise<SurrenderContractTemplate[]> {
  return await storage.getAllSurrenderContractTemplates(tenantId);
}

export async function getSurrenderTemplateById(id: string, tenantId: string): Promise<SurrenderContractTemplate | null> {
  return await storage.getSurrenderContractTemplateById(id, tenantId);
}

export async function createSurrenderTemplate(data: InsertSurrenderContractTemplate): Promise<SurrenderContractTemplate> {
  return await storage.createSurrenderContractTemplate(data);
}

export async function updateSurrenderTemplate(
  id: string,
  tenantId: string,
  updates: Partial<InsertSurrenderContractTemplate>
): Promise<SurrenderContractTemplate | null> {
  return await storage.updateSurrenderContractTemplate(id, tenantId, updates);
}

export async function deleteSurrenderTemplate(id: string, tenantId: string): Promise<void> {
  return await storage.deleteSurrenderContractTemplate(id, tenantId);
}

export async function setDefaultSurrenderTemplate(id: string, tenantId: string): Promise<SurrenderContractTemplate | null> {
  return await storage.setDefaultSurrenderContractTemplate(id, tenantId);
}

export async function ensureDefaultSurrenderTemplate(tenantId: string, tenantName?: string): Promise<SurrenderContractTemplate> {
  const existing = await getDefaultSurrenderTemplate(tenantId);

  if (existing) {
    return existing;
  }

  const allTemplates = await getAllSurrenderTemplates(tenantId);

  if (allTemplates.length > 0) {
    const defaultTemplate = await setDefaultSurrenderTemplate(allTemplates[0].id.toString(), tenantId);
    if (defaultTemplate) {
      return defaultTemplate;
    }
  }

  const defaultHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Georgia', serif; line-height: 1.7; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { text-align: center; color: #1a1a2e; border-bottom: 2px solid #2B8CA3; padding-bottom: 10px; margin-bottom: 5px; }
  h3 { color: #1a1a2e; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 6px 10px; border: 1px solid #ddd; }
  th { width: 180px; background-color: #f5f5f5; }
  .org-name { text-align: center; font-size: 1.1em; color: #555; margin-bottom: 30px; }
  .intro { font-style: italic; margin-bottom: 24px; }
  .clause { margin-bottom: 12px; }
  .signature-block { margin-top: 40px; padding: 20px; border-top: 2px solid #333; }
  .signature-line { margin: 16px 0; }
  .signature-label { font-weight: bold; display: inline-block; min-width: 160px; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 16px; font-family: 'Courier New', monospace; }
  hr { border: none; border-top: 1px solid #ccc; margin: 30px 0; }
</style>
</head>
<body>

<h1>OWNER SURRENDER AGREEMENT</h1>
<p class="org-name">{{organization_name}}</p>

<p class="intro">This Agreement is made between <strong>{{organization_name}}</strong> (hereinafter "The Rescue") and the undersigned owner relinquishing the animal described below.</p>

<h3>Owner Information</h3>
<table>
  <tr><th>Name</th><td>{{owner_name}}</td></tr>
  <tr><th>Email</th><td>{{owner_email}}</td></tr>
  <tr><th>Phone</th><td>{{owner_phone}}</td></tr>
  <tr><th>Address</th><td>{{owner_address}}</td></tr>
</table>

<h3>Animal Information</h3>
<table>
  <tr><th>Pet's Name</th><td>{{animal_name}}</td></tr>
  <tr><th>Species</th><td>{{animal_species}}</td></tr>
  <tr><th>Breed</th><td>{{animal_breed}}</td></tr>
  <tr><th>Sex</th><td>{{animal_sex}}</td></tr>
  <tr><th>Age</th><td>{{animal_age}}</td></tr>
  <tr><th>Reason for Surrender</th><td>{{surrender_reason}}</td></tr>
</table>

<h3>Relinquishment of Ownership</h3>
<p class="clause">You are the legal owner of the animal you are relinquishing.</p>
<p class="clause"><strong>{{organization_name}}</strong> will assess the physical and behavioral health of the animal's adoptability. If you subsequently call about the animal's status, you may not be given any follow up information about the animal except whether it is or is not at the shelter.</p>
<p class="clause">I, the undersigned, owner or having control of the animal described above, hereby give ownership of said animal to <strong>{{organization_name}}</strong> to be placed for adoption or rescue.</p>
<p class="clause">I assume all responsibility for damages caused during my ownership of said animal. I agree to make all veterinarian records for said animal available to the shelter and/or adopter of said animal.</p>
<p class="clause">I certify, to my knowledge, that this animal has not bitten anyone in the last 10 days, nor has been exposed to rabies.</p>
<p class="clause">I understand and agree that the shelter reserves the right to place this animal in a foster home, or for adoption.</p>

<hr>

<div class="signature-block">
<p><strong>AGREED AND ACCEPTED:</strong></p>

<div class="signature-line">
  <span class="signature-label">Print Name:</span> {{owner_name}}
</div>
<div class="signature-line">
  <span class="signature-label">Date:</span> {{contract_date}}
</div>

<div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
  <img src="{{signature_image_url}}" alt="Owner Signature" style="max-height: 80px;" />
</div>
<br>
<strong>Digital Signature of Owner</strong>

<div class="digital-stamp">
  <p>Digitally Signed via iRescue.life</p>
  <p>Timestamp: {{signed_timestamp}}</p>
  <p>IP Address: {{signed_ip}}</p>
</div>
</div>

</body>
</html>`;

  const template = await createSurrenderTemplate({
    tenantId,
    name: 'Standard Owner Surrender Agreement',
    version: '1.0',
    htmlTemplate: defaultHtml,
    isDefault: true,
  });

  return template;
}

/**
 * Renders the owner surrender agreement for a tenant. Uses the tenant's default
 * editable surrender template (merging placeholders) when one exists, otherwise
 * falls back to the legacy hard-coded builder so existing flows keep working.
 */
export async function renderSurrenderAgreement(options: {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  animalName?: string | null;
  animalSpecies?: string | null;
  animalBreed?: string | null;
  animalSex?: string | null;
  animalAge?: string | null;
  surrenderReason?: string | null;
  signatureImageUrl?: string;
  signedTimestamp?: string;
  signedIp?: string;
}): Promise<string> {
  const template = await getDefaultSurrenderTemplate(options.tenantId);

  if (template?.htmlTemplate) {
    const mergeData = buildSurrenderMergeData(options);
    return mergeSurrenderPlaceholders(template.htmlTemplate, mergeData);
  }

  // Legacy fallback — no editable template configured yet.
  return buildSurrenderAgreementHtml({
    tenantName: options.tenantName,
    ownerName: options.ownerName,
    ownerPhone: options.ownerPhone,
    ownerAddress: options.ownerAddress,
    animalName: options.animalName,
    animalAge: options.animalAge,
    animalBreed: options.animalBreed,
    animalSex: options.animalSex,
    signatureImageUrl: options.signatureImageUrl,
    signedTimestamp: options.signedTimestamp,
  });
}
