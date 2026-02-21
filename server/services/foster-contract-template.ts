import { storage } from '../storage';
import { type FosterContractTemplate, type InsertFosterContractTemplate } from '@shared/schema';

export const FOSTER_MERGE_FIELDS: Record<string, string> = {
  '{{tenant_name}}': 'Name of the rescue organization',
  '{{organization_name}}': 'Name of the rescue organization (alias)',
  '{{user.first_name}}': 'Foster parent first name',
  '{{user.last_name}}': 'Foster parent last name',
  '{{foster_parent_name}}': 'Full name of the foster parent (alias)',
  '{{foster_email}}': 'Email address of the foster parent',
  '{{foster_phone}}': 'Phone number of the foster parent',
  '{{foster_address}}': 'Full address of the foster parent',
  '{{date_today}}': 'Today\'s date',
  '{{contract_date}}': 'Date of contract signing (alias)',
  '{{foster_start_date}}': 'Date when foster care begins (alias)',
  '{{animal_name}}': 'Name of the foster animal',
  '{{animal_species}}': 'Species of the animal (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Breed of the animal',
  '{{animal_sex}}': 'Sex of the animal',
  '{{animal_age}}': 'Age of the animal',
  '{{animal_microchip}}': 'Microchip number for identification',
  '{{signature_image_url}}': 'Signature image (auto-inserted at signing)',
  '{{signed_timestamp}}': 'Timestamp when the contract was signed',
  '{{signed_ip}}': 'IP address of the signer',
};

export interface FosterMergeData {
  tenant_name?: string;
  organization_name?: string;
  'user.first_name'?: string;
  'user.last_name'?: string;
  foster_parent_name?: string;
  foster_email?: string;
  foster_phone?: string;
  foster_address?: string;
  date_today?: string;
  contract_date?: string;
  foster_start_date?: string;
  animal_name?: string;
  animal_species?: string;
  animal_breed?: string;
  animal_sex?: string;
  animal_age?: string;
  animal_microchip?: string;
  signature_image_url?: string;
  signed_timestamp?: string;
  signed_ip?: string;
}

export function buildFosterMergeData(options: {
  tenantName: string;
  fosterName: string;
  fosterEmail: string;
  fosterPhone?: string | null;
  fosterAddress?: string | null;
  signatureImageUrl?: string;
  signedTimestamp?: string;
  signedIp?: string;
}): FosterMergeData {
  const nameParts = (options.fosterName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    tenant_name: options.tenantName,
    organization_name: options.tenantName,
    'user.first_name': firstName,
    'user.last_name': lastName,
    foster_parent_name: options.fosterName,
    foster_email: options.fosterEmail,
    foster_phone: options.fosterPhone || '',
    foster_address: options.fosterAddress || '',
    date_today: todayStr,
    contract_date: todayStr,
    foster_start_date: todayStr,
    signature_image_url: options.signatureImageUrl || '',
    signed_timestamp: options.signedTimestamp || '',
    signed_ip: options.signedIp || '',
  };
}

export async function getDefaultFosterTemplate(tenantId: string): Promise<FosterContractTemplate | null> {
  return await storage.getDefaultFosterContractTemplate(tenantId);
}

export async function getAllFosterTemplates(tenantId: string): Promise<FosterContractTemplate[]> {
  return await storage.getAllFosterContractTemplates(tenantId);
}

export async function getFosterTemplateById(id: string, tenantId: string): Promise<FosterContractTemplate | null> {
  return await storage.getFosterContractTemplateById(id, tenantId);
}

export async function createFosterTemplate(data: InsertFosterContractTemplate): Promise<FosterContractTemplate> {
  return await storage.createFosterContractTemplate(data);
}

export async function updateFosterTemplate(
  id: string,
  tenantId: string,
  updates: Partial<InsertFosterContractTemplate>
): Promise<FosterContractTemplate | null> {
  return await storage.updateFosterContractTemplate(id, tenantId, updates);
}

export async function deleteFosterTemplate(id: string, tenantId: string): Promise<void> {
  return await storage.deleteFosterContractTemplate(id, tenantId);
}

export async function setDefaultFosterTemplate(id: string, tenantId: string): Promise<FosterContractTemplate | null> {
  return await storage.setDefaultFosterContractTemplate(id, tenantId);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function mergeFosterPlaceholders(html: string, data: FosterMergeData): string {
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

export function validateFosterTemplate(html: string): { valid: boolean; errors: string[] } {
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
    errors
  };
}

export async function ensureDefaultFosterTemplate(tenantId: string, tenantName?: string): Promise<FosterContractTemplate> {
  const existing = await getDefaultFosterTemplate(tenantId);
  
  if (existing) {
    return existing;
  }

  const allTemplates = await getAllFosterTemplates(tenantId);
  
  if (allTemplates.length > 0) {
    const defaultTemplate = await setDefaultFosterTemplate(allTemplates[0].id.toString(), tenantId);
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
  ul { padding-left: 20px; }
  ul li { margin-bottom: 8px; }
  .org-name { text-align: center; font-size: 1.1em; color: #555; margin-bottom: 30px; }
  .intro { font-style: italic; margin-bottom: 24px; }
  .section-content { margin-left: 8px; }
  .waiver { background-color: #f9f9f9; padding: 16px; border-left: 4px solid #2B8CA3; margin: 20px 0; }
  .signature-block { margin-top: 40px; padding: 20px; border-top: 2px solid #333; }
  .signature-line { margin: 16px 0; }
  .signature-label { font-weight: bold; display: inline-block; min-width: 220px; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 16px; font-family: 'Courier New', monospace; }
  hr { border: none; border-top: 1px solid #ccc; margin: 30px 0; }
</style>
</head>
<body>

<h1>MASTER FOSTER CARE AGREEMENT</h1>
<p class="org-name">{{tenant_name}}</p>

<p class="intro"><strong>This Agreement</strong> is made between <strong>{{tenant_name}}</strong> (hereinafter referred to as "The Rescue") and the undersigned Volunteer (hereinafter referred to as "Foster Caretaker").</p>

<h3>1. OWNERSHIP &amp; CUSTODY</h3>
<div class="section-content">
<ul>
  <li><strong>Rescue Property:</strong> I understand that all animals placed in my care are the sole property of <strong>{{tenant_name}}</strong>. I have no ownership rights to any foster animal.</li>
  <li><strong>No Unauthorized Transfer:</strong> I agree strictly NOT to give, sell, or transfer custody of the foster animal to any other person, rescue, or shelter without prior written consent from The Rescue's Director.</li>
  <li><strong>Return on Demand:</strong> I agree to return the animal to The Rescue immediately upon request. If I refuse, I authorize The Rescue to take legal or other action to recover the animal, and I agree to pay all costs associated with such recovery.</li>
</ul>
</div>

<h3>2. MEDICAL CARE &amp; VETERINARY PROTOCOLS</h3>
<div class="section-content">
<ul>
  <li><strong>Authorization:</strong> I understand that <strong>{{tenant_name}}</strong> covers all medical expenses <strong>ONLY IF</strong> approved in advance and performed at our authorized veterinary partners.</li>
  <li><strong>Unauthorized Care:</strong> If I choose to take the animal to my own veterinarian without prior approval, or for a non-emergency, I assume full financial responsibility for the bill. The Rescue will not reimburse me.</li>
  <li><strong>Medications:</strong> I agree to administer all medications strictly as directed by The Rescue's medical staff and to document all doses given.</li>
  <li><strong>Emergency Protocol:</strong> In the event of a medical emergency, I agree to contact the <strong>{{tenant_name}}</strong> Medical Hotline immediately before seeking treatment, unless the animal's life is in immediate danger.</li>
</ul>
</div>

<h3>3. SAFETY &amp; HOME CARE</h3>
<div class="section-content">
<ul>
  <li><strong>Indoors Only:</strong> All foster dogs must be kept indoors as family pets. They may not be left outdoors unattended, chained, or used as guard dogs.</li>
  <li><strong>Leash Policy:</strong> Foster dogs must be on a leash at all times when outside a securely fenced area. Off-leash dog parks are <strong>strictly prohibited</strong> due to the unknown medical and behavioral history of rescue animals.</li>
  <li><strong>Children &amp; Other Pets:</strong> I agree to supervise all interactions between the foster animal and children or other pets. I understand that The Rescue cannot guarantee the behavior of any animal.</li>
</ul>
</div>

<h3>4. BEHAVIOR &amp; BITE PROTOCOL</h3>
<div class="section-content">
<ul>
  <li><strong>Disclosure:</strong> I understand that many rescue animals come with unknown histories. The Rescue makes no representations or warranties regarding the temperament, health, or age of any animal.</li>
  <li><strong>Bite Reporting:</strong> If the foster animal bites a human or another animal, I agree to report it to The Rescue <strong>IMMEDIATELY</strong> (within 1 hour). This is critical for insurance and rabies quarantine laws.</li>
</ul>
</div>

<h3>5. ADOPTION</h3>
<div class="section-content">
<ul>
  <li><strong>Priority:</strong> While I may express interest in adopting my foster animal ("Foster Fail"), I understand that The Rescue has the final authority on all placement decisions.</li>
  <li><strong>Marketing:</strong> I agree to assist in finding the animal a home by providing updated photos, bios, and making the animal available for meet-and-greets with potential adopters vetted by The Rescue.</li>
</ul>
</div>

<h3>6. WAIVER OF LIABILITY &amp; INDEMNIFICATION</h3>
<div class="waiver">
<p>I, the undersigned, hereby release, indemnify, and hold harmless <strong>{{tenant_name}}</strong>, its directors, officers, volunteers, and agents from any and all claims, liability, demands, or causes of action arising out of my participation in the Foster Program.</p>
<p>I understand that working with animals carries inherent risks, including but not limited to bites, scratches, property damage, or illness transmission to resident pets. I knowingly assume these risks.</p>
</div>

<hr>

<div class="signature-block">
<p><strong>AGREED AND ACCEPTED:</strong></p>

<div class="signature-line">
  <span class="signature-label">Foster Caretaker Name:</span> {{user.first_name}} {{user.last_name}}
</div>
<div class="signature-line">
  <span class="signature-label">Date:</span> {{date_today}}
</div>

<div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
  <img src="{{signature_image_url}}" alt="Foster Signature" style="max-height: 80px;" />
</div>
<br>
<strong>Digital Signature of Foster Caretaker</strong>

<div class="digital-stamp">
  <p>Digitally Signed via iRescue.life</p>
  <p>Timestamp: {{signed_timestamp}}</p>
  <p>IP Address: {{signed_ip}}</p>
</div>
</div>

</body>
</html>`;

  const template = await createFosterTemplate({
    tenantId,
    name: 'Master Foster Care Agreement',
    version: '1.0',
    htmlTemplate: defaultHtml,
    isDefault: true,
  });

  return template;
}
