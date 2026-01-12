import { storage } from '../storage';
import { type FosterContractTemplate, type InsertFosterContractTemplate } from '@shared/schema';

export const FOSTER_MERGE_FIELDS: Record<string, string> = {
  '{{organization_name}}': 'Name of the rescue organization',
  '{{foster_parent_name}}': 'Full name of the foster parent',
  '{{foster_email}}': 'Email address of the foster parent',
  '{{foster_phone}}': 'Phone number of the foster parent',
  '{{foster_address}}': 'Full address of the foster parent',
  '{{foster_start_date}}': 'Date when foster care begins',
  '{{animal_name}}': 'Name of the foster animal',
  '{{animal_species}}': 'Species of the animal (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Breed of the animal',
  '{{animal_sex}}': 'Sex of the animal',
  '{{animal_age}}': 'Age of the animal',
  '{{animal_microchip}}': 'Microchip number for identification',
  '{{contract_date}}': 'Date of contract signing',
  '{{signature_image_url}}': 'URL to the signature image',
  '{{signed_timestamp}}': 'Timestamp when the contract was signed',
  '{{signed_ip}}': 'IP address of the signer',
};

export interface FosterMergeData {
  organization_name?: string;
  foster_parent_name?: string;
  foster_email?: string;
  foster_phone?: string;
  foster_address?: string;
  foster_start_date?: string;
  animal_name?: string;
  animal_species?: string;
  animal_breed?: string;
  animal_sex?: string;
  animal_age?: string;
  animal_microchip?: string;
  contract_date?: string;
  signature_image_url?: string;
  signed_timestamp?: string;
  signed_ip?: string;
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
  
  const escapedData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'signature_image_url') continue;
    escapedData[key] = escapeHtml(value?.toString() ?? '');
  }
  
  for (const [field, escapedValue] of Object.entries(escapedData)) {
    const placeholder = `{{${field}}}`;
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
  
  const requiredFields = [
    '{{foster_parent_name}}',
    '{{signature_image_url}}',
  ];
  
  for (const field of requiredFields) {
    if (!html.includes(field)) {
      errors.push(`Warning: Missing recommended field ${field}`);
    }
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

  const organizationName = tenantName || 'Animal Rescue Organization';
  const defaultHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2 { font-size: 1.2em; background-color: #e8f4f8; padding: 5px; border-left: 5px solid #007bff; margin-top: 30px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .terms-list { padding-left: 20px; }
  .terms-list li { margin-bottom: 10px; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
  .warning-box { background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin: 20px 0; border-left: 5px solid #ffc107; }
</style>
</head>
<body>

  <h1>Foster Care Agreement</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>1. The Parties</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Foster Parent Name:</span>
      <span class="value">{{foster_parent_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Start Date:</span>
      <span class="value">{{foster_start_date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{foster_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{foster_phone}}</span>
    </div>
    <div class="info-item" style="grid-column: span 2;">
      <span class="label">Address:</span>
      <span class="value">{{foster_address}}</span>
    </div>
  </div>

  <h2>2. The Foster Animal</h2>
  <p>The Foster Parent agrees to provide temporary care for:</p>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Name:</span>
      <span class="value">{{animal_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Species/Breed:</span>
      <span class="value">{{animal_species}} / {{animal_breed}}</span>
    </div>
    <div class="info-item">
      <span class="label">Sex:</span>
      <span class="value">{{animal_sex}}</span>
    </div>
    <div class="info-item">
      <span class="label">ID / Microchip:</span>
      <span class="value">{{animal_microchip}}</span>
    </div>
  </div>

  <h2>3. Terms of Foster Care</h2>
  <div class="warning-box">
    <strong>IMPORTANT:</strong> The Animal remains the sole property of <strong>{{organization_name}}</strong>. The Foster Parent has no authority to adopt out, sell, or transfer the Animal to any third party.
  </div>
  <ol class="terms-list">
    <li><strong>Temporary Custody:</strong> I understand that I am providing temporary care for the Animal and that ownership remains with the Rescue. I agree to return the Animal immediately upon request.</li>
    <li><strong>Medical Authorization:</strong> I will not arrange for veterinary care without prior approval from the Rescue, except in a life-threatening emergency. I understand the Rescue is responsible for authorized medical expenses, but I am responsible for unauthorized expenses.</li>
    <li><strong>Adoption Process:</strong> I understand that I cannot "promise" the Animal to friends or family. All potential adopters must go through the Rescue's official application process.</li>
    <li><strong>Care Standards:</strong> I agree to keep the Animal indoors as a household pet and will never leave the Animal outdoors unsupervised or off-leash in an unfenced area.</li>
  </ol>

  <h2>4. Liability Waiver</h2>
  <p>I acknowledge that animals can be unpredictable. By signing below, I voluntarily release <strong>{{organization_name}}</strong> from any and all liability for:</p>
  <ul class="terms-list">
    <li>Personal injury (bites, scratches, etc.) to myself or household members.</li>
    <li>Damage to personal property (furniture, carpets, vehicles, etc.).</li>
    <li>Injury or illness transmitted to my own personal pets.</li>
  </ul>
  <p><em>I confirm my own pets are up-to-date on vaccinations and spayed/neutered.</em></p>

  <h2>5. Execution</h2>
  <div class="signature-block">
    <p>I, <strong>{{foster_parent_name}}</strong>, have read and understood this Agreement. I agree to act as a volunteer Foster Parent under these terms.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Foster Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature of Foster Parent</strong>
    
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
    name: 'Standard Foster Care Agreement',
    version: '1.0',
    htmlTemplate: defaultHtml,
    isDefault: true,
  });

  return template;
}
