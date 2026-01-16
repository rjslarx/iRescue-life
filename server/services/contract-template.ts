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

// Haseya's New Beginning Adoption Contract Template
export const HASEYAS_NEW_BEGINNING_CONTRACT_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.8; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; font-size: 2em; margin-bottom: 5px; }
  h2 { text-align: center; font-size: 1.4em; color: #666; margin-top: 0; padding-bottom: 20px; border-bottom: 2px solid #8B4513; }
  .header-section { text-align: center; margin-bottom: 30px; }
  .info-section { background: #faf8f5; border: 1px solid #ddd; padding: 20px; margin-bottom: 25px; border-radius: 5px; }
  .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; }
  .info-label { font-weight: bold; color: #555; }
  .info-value { color: #333; }
  .notice { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; font-style: italic; }
  .terms-section { margin: 25px 0; }
  .terms-section p { margin-bottom: 15px; text-align: justify; }
  .terms-section .term-item { margin-bottom: 18px; padding-left: 10px; }
  .highlight { color: #8B4513; font-weight: bold; }
  .important { font-weight: bold; }
  .signature-block { margin-top: 40px; background-color: #f9f9f9; padding: 25px; border: 1px solid #ddd; border-radius: 5px; }
  .signature-line { margin: 20px 0; border-bottom: 2px solid #333; display: inline-block; min-width: 350px; }
  .digital-stamp { font-size: 0.85em; color: #666; margin-top: 15px; font-family: 'Courier New', monospace; background: #f0f0f0; padding: 10px; border-radius: 3px; }
  .fee-box { text-align: right; background: #f5f5f5; padding: 15px; border: 1px solid #ddd; margin: 20px 0; }
  .fee-total { font-size: 1.2em; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px; }
  .contact-info { font-size: 0.9em; color: #666; text-align: center; margin-top: 30px; }
</style>
</head>
<body>

  <div class="header-section">
    <h1>Haseya's New Beginning</h1>
    <h2>Adoption Agreement</h2>
  </div>

  <div class="info-section">
    <div class="info-grid">
      <span class="info-label">Adopter Name:</span>
      <span class="info-value">{{adopter_name}}</span>
      
      <span class="info-label">Email:</span>
      <span class="info-value">{{adopter_email}}</span>
      
      <span class="info-label">Phone:</span>
      <span class="info-value">{{adopter_phone}}</span>
      
      <span class="info-label">Address:</span>
      <span class="info-value">{{adopter_address}}</span>
      
      <span class="info-label">Animal Name:</span>
      <span class="info-value highlight">{{animal_name}}</span>
      
      <span class="info-label">Species/Breed:</span>
      <span class="info-value">{{animal_species}} / {{animal_breed}}</span>
      
      <span class="info-label">Date:</span>
      <span class="info-value">{{contract_date}}</span>
    </div>
  </div>

  <div class="notice">
    Please read this carefully because you are signing a legally binding document. If you are adopting a puppy under the age of six months who has not yet been altered, you will also be required to sign the Spay/Neuter Agreement.
  </div>

  <div class="terms-section">
    <p><strong>The parties hereto agree that the owners shall abide by the following conditions:</strong></p>

    <p class="term-item"><span class="highlight">{{animal_name}}</span>, hereinafter referred to as "the dog," is being transferred to the adopting owner with the understanding that the adopter is taking possession of the dog to treat and to be responsible for it as their own dog.</p>

    <p class="term-item">The dog will be treated as a family member with loving care and affection. I will do my best to ensure the dog's safety and well-being.</p>

    <p class="term-item">I/we will feed the dog at least twice a day and will provide a fresh supply of water at all times.</p>

    <p class="term-item">The dog will live inside my home and will not be isolated from the family.</p>

    <p class="term-item">I will walk my dog on a leash or exercise my dog in a fenced yard, which must be provided unless waived by HNB.</p>

    <p class="term-item">I will <span class="important">never</span> let my dog run loose or roam, keep my dog chained or tied up, keep it continuously in a yard, garage, patio, balcony, or pen, or leave my dog outdoors, even in a fenced yard when no one is at home.</p>

    <p class="term-item">I will not have the dog attack-trained nor will I use it for any purpose other than companionship.</p>

    <p class="term-item">I will not have the dog's ears cropped nor will I have its tail docked. I will never allow any physical, mental, or emotional abuse of the dog.</p>

    <p class="term-item">I will take the dog to a licensed veterinarian when shots are due but in no event later than one year from the last vet visit. I will provide all required and/or needed veterinary care, including: rabies shots as required every one or three years; yearly booster shots for DHLPPC; yearly fecal checks for internal parasites (worms); and prompt treatment by a licensed veterinarian for any illness or injury.</p>

    <p class="term-item">The dog will be given heartworm preventative tablets every month, all year long. I will have a heartworm test given every year. If there is any break in dispensing heartworm tablets, I must retest for heartworm and restart tablets immediately.</p>

    <p class="term-item">If not already done, I will have the dog spayed/neutered and will immediately forward proof to the HNB office. (E-mail to haseyasnewbeginninghr@yahoo.com or mail to 1321 Section Ave Rayne, LA 70578). <span class="important">Failure to comply with this requirement will result in the immediate return of the dog to HNB with no refund.</span></p>

    <p class="term-item">I/we affirm that no member of my household has been convicted of an animal welfare law violation such as neglect, cruelty, abandonment, etc.</p>

    <p class="term-item">I will ensure proper licensing of the dog and will attach the appropriate license tags, rabies tag, HNB tag, and personal identification tag to a non-choke collar to be worn at all times. I will ensure compliance with all applicable local and state statutes.</p>

    <p class="term-item">I will not use a choke-type collar at any time, except for training under the guidance of a qualified dog trainer.</p>

    <p class="term-item">I am adopting the dog for myself and I agree to not give away, sell, or trade my dog, even as a gift to a friend or family member.</p>

    <p class="term-item">I will neither take the dog to a shelter nor abandon the dog. I understand that I must notify HNB without delay if I can no longer care for or keep my dog and agree to give HNB reasonable time to rehome my dog or place my dog in an approved foster home, if available. I must notify HNB of any behavioral problems that have occurred at any time before I return my dog and I agree to pay for a professional trainer's evaluation in case of biting or aggression.</p>

    <p class="term-item">I agree to accept responsibility and ownership of the dog at my own risk and I release HNB and its agents from any and all liability arising out of possession and ownership of my dog.</p>

    <p class="term-item">I agree that I am assuming total financial responsibility for my pet as of the date of this contract. HNB and its agents will not be held responsible for any damages or expenses (veterinary or other) incurred during my ownership of the dog.</p>

    <p class="term-item">I agree to take the dog to obedience training classes as a puppy, and/or as an adult.</p>

    <p class="term-item"><span class="important">**In the event the dog becomes lost or dies, I will immediately notify HNB. I will also immediately notify HNB of any change of contact information (address, phone number, or email address).</span></p>

    <p class="term-item"><span class="important">**This dog's known background and medical history have been discussed with me. I understand that HNB has made no representation concerning the health, condition, training, behavior, or temperament of the dog.</span></p>

    <p class="term-item"><span class="important">**I agree to permit HNB to make inquiry about and enforce any of the above conditions and requirements at any time after adoption. This can include visits to my home and contact with my veterinarian. I UNDERSTAND THAT FAILURE TO COMPLY WITH ANY OF THE ABOVE PROVISIONS WILL RESULT IN FORFEITURE OF THE DOG TO HNB WITH NO REFUND.</span></p>

    <p class="term-item"><span class="important">**I understand that by voluntarily signing this agreement, I am entering into a legal and binding contract with Haseya's New Beginning. Breach of any term(s) of this agreement is deemed actionable by HNB. In the event there is a violation of the agreement, I agree to pay a minimum of $500.00 in damages.</span></p>
  </div>

  <div class="fee-box">
    <p>Adoption Fee: <strong>{{adoption_fee}}</strong></p>
    <p>Additional Donation: <strong>{{donation_amount}}</strong></p>
    <div class="fee-total">Total Paid: <strong>{{total_amount}}</strong></div>
  </div>

  <div class="signature-block">
    <p>I, <strong>{{adopter_name}}</strong>, certify that the information provided is true and I understand and agree to all terms of this Adoption Agreement.</p>
    
    <div class="signature-line">
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

  <div class="contact-info">
    <p>Haseya's New Beginning<br>
    1321 Section Ave, Rayne, LA 70578<br>
    haseyasnewbeginninghr@yahoo.com</p>
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
 * Returns warnings for missing structure/fields, but only blocks on security issues
 */
export function validateTemplateHtml(html: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for basic HTML structure - just a warning, templates can work without full structure
  if (!html.includes('<html') && !html.includes('<body')) {
    warnings.push('Template does not include full HTML structure (<html> and <body> tags). Consider adding them for best results.');
  }

  // HTML5 void elements that don't require closing tags
  const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  
  // Count open tags (excluding void elements)
  const openTagMatches = html.match(/<([a-z]+)(?:\s[^>]*)?>/gi) || [];
  const openTags = openTagMatches.filter(tag => {
    const tagName = tag.match(/<([a-z]+)/i)?.[1]?.toLowerCase();
    return tagName && !voidElements.includes(tagName);
  });
  
  const closeTags = html.match(/<\/([a-z]+)>/gi) || [];
  
  // More lenient check - only warn if significantly unbalanced
  if (openTags.length > closeTags.length + 10) {
    warnings.push('Template may have unclosed HTML tags');
  }

  // Check for potentially dangerous scripts - this IS an error
  if (html.includes('<script')) {
    errors.push('Templates cannot contain <script> tags for security reasons');
  }

  // Warn about missing common merge fields (optional, informational only)
  if (!html.includes('{{organization_name}}')) {
    warnings.push('Template does not include {{organization_name}}');
  }
  if (!html.includes('{{adopter_name}}')) {
    warnings.push('Template does not include {{adopter_name}}');
  }
  if (!html.includes('{{animal_name}}')) {
    warnings.push('Template does not include {{animal_name}}');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
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
