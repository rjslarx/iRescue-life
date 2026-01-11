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

  // Create default template
  const organizationName = tenantName || 'Animal Rescue Organization';
  const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adoption Contract</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #1a1a1a;
      font-size: 28px;
      margin-bottom: 10px;
      border-bottom: 3px solid #4F46E5;
      padding-bottom: 10px;
    }
    h2 {
      color: #2d2d2d;
      font-size: 20px;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    p {
      margin-bottom: 12px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .section {
      margin-bottom: 30px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin: 20px 0;
    }
    .info-label {
      font-weight: bold;
      color: #555;
    }
    .info-value {
      color: #333;
    }
    .terms {
      margin: 20px 0;
      padding: 20px;
      background: #f9f9f9;
      border-left: 4px solid #4F46E5;
    }
    .terms ol {
      margin-left: 20px;
    }
    .terms li {
      margin-bottom: 12px;
    }
    .signature-section {
      margin-top: 50px;
      border-top: 2px solid #ddd;
      padding-top: 30px;
    }
    .signature-box {
      margin: 20px 0;
      padding: 20px;
      border: 2px solid #ddd;
      background: white;
    }
    .signature-image {
      max-width: 400px;
      height: auto;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      font-size: 12px;
      color: #777;
      border-top: 1px solid #ddd;
      padding-top: 20px;
    }
    .fee-breakdown {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
    }
    .fee-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
    }
    .fee-total {
      font-weight: bold;
      font-size: 18px;
      border-top: 2px solid #333;
      margin-top: 10px;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{organization_name}} - Adoption Agreement</h1>
    <p>This Adoption Agreement is entered into on {{contract_date}}</p>
  </div>

  <div class="section">
    <h2>Adopter Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">{{adopter_name}}</div>
      <div class="info-label">Email:</div>
      <div class="info-value">{{adopter_email}}</div>
      <div class="info-label">Phone:</div>
      <div class="info-value">{{adopter_phone}}</div>
      <div class="info-label">Address:</div>
      <div class="info-value">{{adopter_address}}</div>
    </div>
  </div>

  <div class="section">
    <h2>Animal Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div class="info-value">{{animal_name}}</div>
      <div class="info-label">Species:</div>
      <div class="info-value">{{animal_species}}</div>
      <div class="info-label">Breed:</div>
      <div class="info-value">{{animal_breed}}</div>
      <div class="info-label">Age:</div>
      <div class="info-value">{{animal_age}}</div>
      <div class="info-label">Sex:</div>
      <div class="info-value">{{animal_sex}}</div>
    </div>
  </div>

  <div class="section">
    <h2>Adoption Fee</h2>
    <div class="fee-breakdown">
      <div class="fee-row">
        <span>Adoption Fee:</span>
        <span>$\{{adoption_fee}}</span>
      </div>
      <div class="fee-row">
        <span>Donation:</span>
        <span>$\{{donation_amount}}</span>
      </div>
      <div class="fee-row fee-total">
        <span>Total Paid:</span>
        <span>$\{{total_amount}}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Terms and Conditions</h2>
    <div class="terms">
      <p><strong>By signing this contract, the adopter agrees to the following terms:</strong></p>
      <ol>
        <li><strong>Veterinary Care:</strong> The adopter agrees to provide necessary veterinary care, including annual check-ups, vaccinations, and treatment for any illnesses or injuries.</li>
        <li><strong>Living Conditions:</strong> The animal will be kept as an indoor pet and provided with adequate food, water, shelter, exercise, and companionship.</li>
        <li><strong>Spay/Neuter:</strong> If the animal is not already spayed/neutered, the adopter agrees to have this procedure completed within 30 days of adoption.</li>
        <li><strong>Identification:</strong> The adopter agrees to ensure the animal wears identification tags and to update microchip registration with current contact information.</li>
        <li><strong>No Transfer:</strong> The adopter agrees not to sell, give away, or transfer ownership of the animal without written consent from {{organization_name}}.</li>
        <li><strong>Return Policy:</strong> If the adopter can no longer care for the animal, they agree to contact {{organization_name}} to arrange for the animal's return.</li>
        <li><strong>Home Visits:</strong> The adopter agrees to allow {{organization_name}} to conduct follow-up home visits to ensure the animal's welfare.</li>
        <li><strong>Non-Refundable Fee:</strong> The adoption fee is non-refundable and helps cover medical expenses, food, and shelter for animals in our care.</li>
      </ol>
    </div>
  </div>

  <div class="signature-section">
    <h2>Adopter Signature</h2>
    <p>By signing below, I acknowledge that I have read, understand, and agree to abide by all terms and conditions stated in this adoption contract.</p>
    
    <div class="signature-box">
      <img src="{{signature_image_url}}" alt="Signature" class="signature-image" />
      <p style="margin-top: 10px;"><strong>Name:</strong> {{adopter_name}}</p>
      <p><strong>Date:</strong> {{contract_date}}</p>
      <p><strong>Email:</strong> {{adopter_email}}</p>
    </div>
    
    <div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 11px; color: #666;">
      <p style="margin: 0;"><strong>Digital Signature Verification</strong></p>
      <p style="margin: 5px 0 0 0;">Signed: {{signed_timestamp}} | IP Address: {{signed_ip}}</p>
    </div>
  </div>

  <div class="footer">
    <p>This is a legal document. Please retain a copy for your records.</p>
    <p>{{organization_name}} - Committed to animal welfare</p>
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
