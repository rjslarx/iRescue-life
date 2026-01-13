import DOMPurify from 'isomorphic-dompurify';
import { storage } from '../storage';
import { type InsertAdoptionContractTemplate, type AdoptionContractTemplate } from '@shared/schema';

// Available merge fields for templates
export const MERGE_FIELDS = {
  '{{organization_name}}': 'Organization name',
  '{{adopter_name}}': 'Adopter full name',
  '{{adopter_email}}': 'Adopter email',
  '{{adopter_phone}}': 'Adopter phone',
  '{{adopter_address}}': 'Adopter address',
  '{{animal_name}}': 'Animal name',
  '{{animal_species}}': 'Animal species',
  '{{animal_breed}}': 'Animal breed',
  '{{animal_age}}': 'Animal age',
  '{{animal_sex}}': 'Animal sex/gender',
  '{{adoption_fee}}': 'Adoption fee amount',
  '{{donation_amount}}': 'Donation amount (if any)',
  '{{total_amount}}': 'Total amount paid',
  '{{contract_date}}': 'Contract signing date',
  '{{signature_image_url}}': 'Signature image URL',
  '{{signed_timestamp}}': 'Signature timestamp (ISO format)',
  '{{signed_ip}}': 'Signer IP address (for legal verification)',
};

// Default adoption contract template HTML
export const DEFAULT_ADOPTION_CONTRACT_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2 { font-size: 1.2em; background-color: #f4f4f4; padding: 5px; border-left: 5px solid #333; margin-top: 30px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .terms-list { padding-left: 20px; }
  .terms-list li { margin-bottom: 10px; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
  .fee-summary { text-align: right; font-size: 1.2em; margin-top: 20px; }
</style>
</head>
<body>

  <h1>Adoption Agreement</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>1. The Parties</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Adopter Name:</span>
      <span class="value">{{adopter_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{contract_date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{adopter_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{adopter_phone}}</span>
    </div>
    <div class="info-item" style="grid-column: span 2;">
      <span class="label">Address:</span>
      <span class="value">{{adopter_address}}</span>
    </div>
  </div>

  <h2>2. The Animal</h2>
  <p>The Adopter agrees to adopt the animal described below (the "Animal"):</p>
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
      <span class="label">Age (Approx):</span>
      <span class="value">{{animal_age}}</span>
    </div>
  </div>

  <h2>3. Terms and Conditions</h2>
  <p>By signing this Agreement, the Adopter agrees to the following terms:</p>
  <ol class="terms-list">
    <li><strong>Standard of Care:</strong> The Adopter agrees to provide the Animal with fresh water, wholesome food, adequate exercise, and shelter at all times. The Animal will be treated as a family companion.</li>
    <li><strong>Medical Care:</strong> The Adopter agrees to provide veterinary care as needed, including annual vaccinations and heartworm prevention.</li>
    <li><strong>No Transfer of Ownership:</strong> The Adopter shall not sell, give away, or otherwise transfer the Animal to any third party, shelter, or research facility.</li>
    <li><strong>Return Policy:</strong> If, for any reason, the Adopter is unable to keep the Animal, the Adopter agrees to return the Animal to <strong>{{organization_name}}</strong>.</li>
    <li><strong>Liability Waiver:</strong> The Adopter assumes all responsibility for the Animal's actions and releases <strong>{{organization_name}}</strong> from any liability for damage or injury caused by the Animal after the date of this Agreement.</li>
  </ol>

  <h2>4. Adoption Fees</h2>
  <div class="fee-summary">
    <p>Adoption Fee: <strong>{{adoption_fee}}</strong></p>
    <p>Additional Donation: <strong>{{donation_amount}}</strong></p>
    <p style="border-top: 1px solid #ccc; padding-top: 5px;">Total Received: <strong>{{total_amount}}</strong></p>
  </div>

  <h2>5. Execution</h2>
  <div class="signature-block">
    <p>I, <strong>{{adopter_name}}</strong>, certify that the information provided is true and I understand and agree to the terms of this Adoption Agreement.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Adopter Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature of Adopter</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>

</body>
</html>`;

// Type for merge data (all fields optional to handle missing data gracefully)
export interface MergeData {
  organization_name?: string;
  adopter_name?: string;
  adopter_email?: string;
  adopter_phone?: string;
  adopter_address?: string;
  animal_name?: string;
  animal_species?: string;
  animal_breed?: string;
  animal_age?: string;
  animal_sex?: string;
  adoption_fee?: string;
  donation_amount?: string;
  total_amount?: string;
  contract_date?: string;
  signature_image_url?: string;
  signed_timestamp?: string;
  signed_ip?: string;
}

/**
 * Get the default template for a tenant
 */
export async function getDefaultTemplate(tenantId: string): Promise<AdoptionContractTemplate | null> {
  return await storage.getDefaultContractTemplate(tenantId);
}

/**
 * Get all templates for a tenant
 */
export async function getAllTemplates(tenantId: string): Promise<AdoptionContractTemplate[]> {
  return await storage.getAllContractTemplates(tenantId);
}

/**
 * Get a specific template by ID
 */
export async function getTemplateById(id: string, tenantId: string): Promise<AdoptionContractTemplate | null> {
  return await storage.getContractTemplateById(id, tenantId);
}

/**
 * Create a new template with sanitized HTML
 */
export async function createTemplate(data: InsertAdoptionContractTemplate): Promise<AdoptionContractTemplate> {
  // Sanitize HTML before storing to prevent XSS
  const sanitizedHtml = DOMPurify.sanitize(data.htmlTemplate, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });

  const sanitizedData = {
    ...data,
    htmlTemplate: sanitizedHtml,
  };

  return await storage.createContractTemplate(sanitizedData);
}

/**
 * Update an existing template with sanitized HTML and version incrementing
 */
export async function updateTemplate(
  id: string,
  tenantId: string,
  updates: Partial<InsertAdoptionContractTemplate>
): Promise<AdoptionContractTemplate | null> {
  // Sanitize HTML if being updated
  const sanitizedUpdates = { ...updates };
  
  if (updates.htmlTemplate) {
    sanitizedUpdates.htmlTemplate = DOMPurify.sanitize(updates.htmlTemplate, {
      ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
      ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false,
    });

    // Auto-increment version if htmlTemplate is being updated
    const current = await getTemplateById(id, tenantId);
    if (current) {
      const currentVersion = parseFloat(current.version) || 1.0;
      sanitizedUpdates.version = (currentVersion + 0.1).toFixed(1);
    }
  }

  return await storage.updateContractTemplate(id, tenantId, sanitizedUpdates);
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: string, tenantId: string): Promise<boolean> {
  // Check if it's the default template
  const template = await getTemplateById(id, tenantId);
  
  if (!template) {
    throw new Error('Template not found');
  }

  if (template.isDefault) {
    throw new Error('Cannot delete the default template. Set another template as default first.');
  }

  await storage.deleteContractTemplate(id, tenantId);
  return true;
}

/**
 * Set a template as the default for a tenant
 */
export async function setDefaultTemplate(id: string, tenantId: string): Promise<AdoptionContractTemplate | null> {
  return await storage.setDefaultContractTemplate(id, tenantId);
}

/**
 * HTML-escape a string to prevent XSS injection
 * Converts potentially dangerous HTML characters to their entity equivalents
 */
function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validate that a URL is safe (not javascript: or data: protocol)
 */
function isSafeUrl(url: string): boolean {
  if (!url) return false;
  
  const trimmedUrl = url.trim().toLowerCase();
  
  // Allow http, https, and relative URLs
  if (trimmedUrl.startsWith('http://') || 
      trimmedUrl.startsWith('https://') || 
      trimmedUrl.startsWith('/')) {
    return true;
  }
  
  // Block javascript:, data:, and other potentially dangerous protocols
  return false;
}

/**
 * Merge placeholders in HTML template with actual data
 * Handles missing optional data gracefully by replacing with empty string
 * 
 * SECURITY: All values are HTML-escaped to prevent XSS injection,
 * INCLUDING signature_image_url to prevent attribute injection attacks
 */
export function mergePlaceholders(htmlTemplate: string, data: Partial<MergeData>): string {
  let result = htmlTemplate;
  
  // Escape all regular merge fields
  const escapedData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip signature_image_url - handle separately
    if (key === 'signature_image_url') continue;
    
    escapedData[key] = escapeHtml(value?.toString() ?? '');
  }
  
  // Replace regular placeholders with escaped values
  for (const [field, escapedValue] of Object.entries(escapedData)) {
    const placeholder = `{{${field}}}`;
    result = result.replaceAll(placeholder, escapedValue);
  }
  
  // Special handling for signature URL - validate AND escape
  if (data.signature_image_url) {
    const url = data.signature_image_url;
    if (isSafeUrl(url)) {
      // URL is safe protocol-wise, but still escape it to prevent attribute injection
      const escapedUrl = escapeHtml(url);
      result = result.replaceAll('{{signature_image_url}}', escapedUrl);
    } else {
      // Malicious URL - remove completely
      result = result.replaceAll('{{signature_image_url}}', '');
    }
  } else {
    // No signature - remove placeholder
    result = result.replaceAll('{{signature_image_url}}', '');
  }
  
  // Remove any remaining unreplaced placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}

/**
 * Validate template HTML
 */
export function validateTemplateHtml(html: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for basic HTML structure
  if (!html.includes('<html') && !html.includes('<body')) {
    errors.push('Template should include basic HTML structure (<html> and <body> tags)');
  }

  // Check for balanced tags (basic validation)
  const openTags = html.match(/<([a-z]+)(?:\s|>)/gi) || [];
  const closeTags = html.match(/<\/([a-z]+)>/gi) || [];
  
  if (openTags.length > closeTags.length + 5) { // Allow some self-closing tags
    errors.push('Template may have unclosed HTML tags');
  }

  // Check for potentially dangerous scripts (should be caught by DOMPurify, but double-check)
  if (html.includes('<script')) {
    errors.push('Templates should not contain <script> tags for security reasons');
  }

  // Warn about missing common merge fields
  const hasOrganizationName = html.includes('{{organization_name}}');
  const hasAdopterName = html.includes('{{adopter_name}}');
  const hasAnimalName = html.includes('{{animal_name}}');

  if (!hasOrganizationName) {
    errors.push('Warning: Template does not include {{organization_name}}');
  }
  if (!hasAdopterName) {
    errors.push('Warning: Template does not include {{adopter_name}}');
  }
  if (!hasAnimalName) {
    errors.push('Warning: Template does not include {{animal_name}}');
  }

  return {
    valid: errors.filter(e => !e.startsWith('Warning:')).length === 0,
    errors
  };
}

/**
 * Get or create default template for a tenant
 * This ensures every tenant has at least one template
 * EXPORTED for use in contract-pdf.ts
 */
export async function ensureDefaultTemplate(tenantId: string, tenantName?: string): Promise<AdoptionContractTemplate> {
  // Check if tenant already has a default template
  const existing = await getDefaultTemplate(tenantId);
  
  if (existing) {
    return existing;
  }

  // Check if tenant has any templates at all
  const allTemplates = await getAllTemplates(tenantId);
  
  if (allTemplates.length > 0) {
    // Set the first one as default
    const defaultTemplate = await setDefaultTemplate(allTemplates[0].id.toString(), tenantId);
    if (defaultTemplate) {
      return defaultTemplate;
    }
  }

  // Create default template - Professional adoption contract
  const organizationName = tenantName || 'Animal Rescue Organization';
  const defaultHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2 { font-size: 1.2em; background-color: #f4f4f4; padding: 5px; border-left: 5px solid #333; margin-top: 30px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .terms-list { padding-left: 20px; }
  .terms-list li { margin-bottom: 10px; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
  .fee-summary { text-align: right; font-size: 1.2em; margin-top: 20px; }
</style>
</head>
<body>

  <h1>Adoption Agreement</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>1. The Parties</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Adopter Name:</span>
      <span class="value">{{adopter_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{contract_date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{adopter_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{adopter_phone}}</span>
    </div>
    <div class="info-item" style="grid-column: span 2;">
      <span class="label">Address:</span>
      <span class="value">{{adopter_address}}</span>
    </div>
  </div>

  <h2>2. The Animal</h2>
  <p>The Adopter agrees to adopt the animal described below (the "Animal"):</p>
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
      <span class="label">Age (Approx):</span>
      <span class="value">{{animal_age}}</span>
    </div>
  </div>

  <h2>3. Terms and Conditions</h2>
  <p>By signing this Agreement, the Adopter agrees to the following terms:</p>
  <ol class="terms-list">
    <li><strong>Standard of Care:</strong> The Adopter agrees to provide the Animal with fresh water, wholesome food, adequate exercise, and shelter at all times. The Animal will be treated as a family companion.</li>
    <li><strong>Medical Care:</strong> The Adopter agrees to provide veterinary care as needed, including annual vaccinations and heartworm prevention.</li>
    <li><strong>No Transfer of Ownership:</strong> The Adopter shall not sell, give away, or otherwise transfer the Animal to any third party, shelter, or research facility.</li>
    <li><strong>Return Policy:</strong> If, for any reason, the Adopter is unable to keep the Animal, the Adopter agrees to return the Animal to <strong>{{organization_name}}</strong>.</li>
    <li><strong>Liability Waiver:</strong> The Adopter assumes all responsibility for the Animal's actions and releases <strong>{{organization_name}}</strong> from any liability for damage or injury caused by the Animal after the date of this Agreement.</li>
  </ol>

  <h2>4. Adoption Fees</h2>
  <div class="fee-summary">
    <p>Adoption Fee: <strong>{{adoption_fee}}</strong></p>
    <p>Additional Donation: <strong>{{donation_amount}}</strong></p>
    <p style="border-top: 1px solid #ccc; padding-top: 5px;">Total Received: <strong>{{total_amount}}</strong></p>
  </div>

  <h2>5. Execution</h2>
  <div class="signature-block">
    <p>I, <strong>{{adopter_name}}</strong>, certify that the information provided is true and I understand and agree to the terms of this Adoption Agreement.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Adopter Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature of Adopter</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>

</body>
</html>`;

  const template = await createTemplate({
    tenantId,
    name: 'Standard Adoption Contract',
    version: '1.0',
    htmlTemplate: defaultHtml,
    isDefault: true,
  });

  return template;
}
