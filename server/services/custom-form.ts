import DOMPurify from 'isomorphic-dompurify';
import { db } from '../db';
import { customForms, customFormSubmissions, animals, tenants } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { InsertCustomForm, CustomForm, InsertCustomFormSubmission, CustomFormSubmission } from '@shared/schema';
import crypto from 'crypto';

// Available merge fields for standalone forms
export const STANDALONE_MERGE_FIELDS = {
  '{{signer_name}}': 'Full name of the person signing',
  '{{signer_email}}': 'Email address of the signer',
  '{{signer_phone}}': 'Phone number of the signer',
  '{{date}}': 'Current date',
  '{{organization_name}}': 'Organization name',
  '{{signature_image_url}}': 'Signature image URL',
  '{{signed_timestamp}}': 'Signature timestamp (ISO format)',
  '{{signed_ip}}': 'Signer IP address (for legal verification)',
};

// Additional merge fields for animal-specific forms
export const ANIMAL_MERGE_FIELDS = {
  ...STANDALONE_MERGE_FIELDS,
  '{{animal_name}}': 'Animal name',
  '{{animal_species}}': 'Animal species (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Animal breed',
  '{{animal_age}}': 'Animal age',
  '{{animal_sex}}': 'Animal sex/gender',
  '{{animal_color}}': 'Animal color/markings',
  '{{animal_microchip}}': 'Microchip number',
  '{{animal_weight}}': 'Animal weight',
};

// Default standalone form template
export const DEFAULT_STANDALONE_FORM_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  <h1>Form Title</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>Participant Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Name:</span>
      <span class="value">{{signer_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{signer_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{signer_phone}}</span>
    </div>
  </div>

  <h2>Agreement Terms</h2>
  <p>Add your form content and terms here...</p>

  <div class="signature-block">
    <p>I, <strong>{{signer_name}}</strong>, have read and agree to the terms outlined above.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>
</body>
</html>`;

// Default animal-specific form template
export const DEFAULT_ANIMAL_FORM_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .info-item { background: #fafafa; padding: 10px; border: 1px solid #ddd; }
  .label { font-weight: bold; font-size: 0.9em; color: #666; display: block; }
  .value { font-size: 1.1em; }
  .signature-block { margin-top: 50px; background-color: #f9f9f9; padding: 20px; border: 1px dashed #ccc; }
  .digital-stamp { font-size: 0.8em; color: #888; margin-top: 10px; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  <h1>Animal Form</h1>
  <p style="text-align: center;"><strong>{{organization_name}}</strong></p>

  <h2>Animal Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Animal Name:</span>
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
      <span class="label">Age:</span>
      <span class="value">{{animal_age}}</span>
    </div>
  </div>

  <h2>Participant Information</h2>
  <div class="info-grid">
    <div class="info-item">
      <span class="label">Name:</span>
      <span class="value">{{signer_name}}</span>
    </div>
    <div class="info-item">
      <span class="label">Date:</span>
      <span class="value">{{date}}</span>
    </div>
    <div class="info-item">
      <span class="label">Email:</span>
      <span class="value">{{signer_email}}</span>
    </div>
    <div class="info-item">
      <span class="label">Phone:</span>
      <span class="value">{{signer_phone}}</span>
    </div>
  </div>

  <h2>Agreement Terms</h2>
  <p>Add your form content and terms here...</p>

  <div class="signature-block">
    <p>I, <strong>{{signer_name}}</strong>, have read and agree to the terms outlined above.</p>
    
    <div style="margin: 20px 0; border-bottom: 1px solid #000; display: inline-block; min-width: 300px;">
      <img src="{{signature_image_url}}" alt="Signature" style="max-height: 80px;" />
    </div>
    <br>
    <strong>Signature</strong>
    
    <div class="digital-stamp">
      <p>Digitally Signed via iRescue.life</p>
      <p>Timestamp: {{signed_timestamp}}</p>
      <p>IP Address: {{signed_ip}}</p>
    </div>
  </div>
</body>
</html>`;

// Validate HTML template
export function validateTemplateHtml(html: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!html || html.trim().length === 0) {
    errors.push('Template HTML cannot be empty');
  }
  
  if (html.length > 500000) {
    errors.push('Template HTML exceeds maximum size of 500KB');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Generate URL-safe slug from name
export function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  
  const uniqueSuffix = crypto.randomBytes(4).toString('hex');
  return `${baseSlug}-${uniqueSuffix}`;
}

// Sanitize HTML template for storage
export function sanitizeTemplate(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'style', 'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'a',
      'blockquote', 'pre', 'code',
    ],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'href', 'target', 'rel', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });
}

// Get all custom forms for a tenant
export async function getAllForms(tenantId: string): Promise<CustomForm[]> {
  return db
    .select()
    .from(customForms)
    .where(eq(customForms.tenantId, tenantId))
    .orderBy(desc(customForms.createdAt));
}

// Get active custom forms for a tenant
export async function getActiveForms(tenantId: string): Promise<CustomForm[]> {
  return db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.tenantId, tenantId),
      eq(customForms.isActive, true)
    ))
    .orderBy(customForms.name);
}

// Get a single form by ID
export async function getFormById(formId: string, tenantId: string): Promise<CustomForm | null> {
  const [form] = await db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ))
    .limit(1);
  
  return form || null;
}

// Get a form by public slug
export async function getFormBySlug(slug: string, tenantId: string): Promise<CustomForm | null> {
  const [form] = await db
    .select()
    .from(customForms)
    .where(and(
      eq(customForms.publicSlug, slug),
      eq(customForms.tenantId, tenantId),
      eq(customForms.isActive, true),
      eq(customForms.isPublic, true)
    ))
    .limit(1);
  
  return form || null;
}

// Create a new custom form
export async function createForm(data: InsertCustomForm): Promise<CustomForm> {
  const sanitizedHtml = sanitizeTemplate(data.htmlTemplate);
  const slug = data.isPublic ? generateSlug(data.name) : null;
  
  const [form] = await db
    .insert(customForms)
    .values({
      ...data,
      htmlTemplate: sanitizedHtml,
      publicSlug: slug,
    })
    .returning();
  
  return form;
}

// Update a custom form
export async function updateForm(
  formId: string,
  tenantId: string,
  updates: Partial<InsertCustomForm>
): Promise<CustomForm | null> {
  const updateData: any = {
    ...updates,
    updatedAt: new Date(),
  };
  
  if (updates.htmlTemplate) {
    updateData.htmlTemplate = sanitizeTemplate(updates.htmlTemplate);
  }
  
  // Generate new slug if isPublic changed to true and no slug exists
  if (updates.isPublic === true && updates.name) {
    const existingForm = await getFormById(formId, tenantId);
    if (existingForm && !existingForm.publicSlug) {
      updateData.publicSlug = generateSlug(updates.name || existingForm.name);
    }
  }
  
  const [form] = await db
    .update(customForms)
    .set(updateData)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ))
    .returning();
  
  return form || null;
}

// Delete a custom form
export async function deleteForm(formId: string, tenantId: string): Promise<void> {
  await db
    .delete(customForms)
    .where(and(
      eq(customForms.id, formId),
      eq(customForms.tenantId, tenantId)
    ));
}

// Get form submissions for a form
export async function getFormSubmissions(
  formId: string,
  tenantId: string
): Promise<CustomFormSubmission[]> {
  return db
    .select()
    .from(customFormSubmissions)
    .where(and(
      eq(customFormSubmissions.formId, formId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .orderBy(desc(customFormSubmissions.createdAt));
}

// Get a single submission by ID
export async function getSubmissionById(
  submissionId: string,
  tenantId: string
): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .select()
    .from(customFormSubmissions)
    .where(and(
      eq(customFormSubmissions.id, submissionId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .limit(1);
  
  return submission || null;
}

// Get submission by secure token
export async function getSubmissionByToken(tokenHash: string): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .select()
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.secureTokenHash, tokenHash))
    .limit(1);
  
  return submission || null;
}

// Create a new form submission
export async function createSubmission(
  data: InsertCustomFormSubmission
): Promise<CustomFormSubmission> {
  const [submission] = await db
    .insert(customFormSubmissions)
    .values(data)
    .returning();
  
  return submission;
}

// Update a form submission
export async function updateSubmission(
  submissionId: string,
  tenantId: string,
  updates: Partial<InsertCustomFormSubmission>
): Promise<CustomFormSubmission | null> {
  const [submission] = await db
    .update(customFormSubmissions)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(customFormSubmissions.id, submissionId),
      eq(customFormSubmissions.tenantId, tenantId)
    ))
    .returning();
  
  return submission || null;
}

// Helper to escape HTML for XSS prevention
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Generate HTML for question_builder mode forms
function generateQuestionBuilderHtml(
  form: CustomForm,
  submission: CustomFormSubmission,
  tenantName: string,
  animal?: any
): string {
  const questions = (form.questions || []).sort((a, b) => a.order - b.order);
  const formData = (submission.formData || {}) as Record<string, any>;
  const dateStr = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let html = `<div class="question-builder-form">`;
  
  // Add intro text if present
  if (form.introText) {
    html += `<div class="intro-text" style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px;">${escapeHtml(form.introText)}</div>`;
  }
  
  // Signer information section
  html += `<div class="signer-info" style="margin-bottom: 20px;">
    <h3 style="margin-bottom: 10px;">Submitted By</h3>
    <p><strong>Name:</strong> ${escapeHtml(submission.signerName || '')}</p>
    <p><strong>Email:</strong> ${escapeHtml(submission.signerEmail || '')}</p>
    ${submission.signerPhone ? `<p><strong>Phone:</strong> ${escapeHtml(submission.signerPhone)}</p>` : ''}
    <p><strong>Date:</strong> ${dateStr}</p>
  </div>`;
  
  // Animal info for animal-specific forms
  if (form.formType === 'animal_specific' && animal) {
    html += `<div class="animal-info" style="margin-bottom: 20px; padding: 15px; background: #f0f8ff; border-radius: 5px;">
      <h3 style="margin-bottom: 10px;">Animal Information</h3>
      <p><strong>Name:</strong> ${escapeHtml(animal.name || '')}</p>
      <p><strong>Species:</strong> ${escapeHtml(animal.species || '')}</p>
      ${animal.breed ? `<p><strong>Breed:</strong> ${escapeHtml(animal.breed)}</p>` : ''}
      ${animal.age ? `<p><strong>Age:</strong> ${escapeHtml(animal.age)}</p>` : ''}
    </div>`;
  }
  
  // Questions and answers
  html += `<div class="questions" style="margin-bottom: 20px;">`;
  for (const question of questions) {
    const answer = formData[question.id];
    let displayAnswer = '';
    
    if (question.type === 'checkbox') {
      // Checkbox values are stored as strings 'true' or 'false'
      displayAnswer = answer === 'true' || answer === true ? 'Yes' : 'No';
    } else if (answer !== undefined && answer !== null && answer !== '') {
      displayAnswer = escapeHtml(String(answer));
    } else {
      displayAnswer = '<em style="color: #999;">Not provided</em>';
    }
    
    html += `<div class="question-item" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
      <p style="font-weight: bold; margin-bottom: 5px;">${escapeHtml(question.question)}${question.required ? ' <span style="color: red;">*</span>' : ''}</p>
      <p style="margin-left: 10px;">${displayAnswer}</p>
    </div>`;
  }
  html += `</div>`;
  
  html += `</div>`;
  return html;
}

// Replace merge fields in template with actual values
export async function renderFormHtml(
  form: CustomForm,
  submission: CustomFormSubmission,
  tenantName: string,
  animal?: any
): Promise<string> {
  // Handle question_builder mode
  if (form.creationMode === 'question_builder') {
    return generateQuestionBuilderHtml(form, submission, tenantName, animal);
  }
  
  // Template mode - use HTML template with merge fields
  let html = form.htmlTemplate || '';
  
  // Common replacements
  const replacements: Record<string, string> = {
    '{{signer_name}}': submission.signerName || '',
    '{{signer_email}}': submission.signerEmail || '',
    '{{signer_phone}}': submission.signerPhone || '',
    '{{date}}': new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    '{{organization_name}}': tenantName,
    '{{signed_timestamp}}': submission.signedAt?.toISOString() || '',
    '{{signed_ip}}': submission.signerIpAddress || '',
  };
  
  // Add animal fields if animal-specific
  if (form.formType === 'animal_specific' && animal) {
    replacements['{{animal_name}}'] = animal.name || '';
    replacements['{{animal_species}}'] = animal.species || '';
    replacements['{{animal_breed}}'] = animal.breed || '';
    replacements['{{animal_age}}'] = animal.age || '';
    replacements['{{animal_sex}}'] = animal.sex || '';
    replacements['{{animal_color}}'] = animal.color || '';
    replacements['{{animal_microchip}}'] = animal.microchipNumber || '';
    replacements['{{animal_weight}}'] = animal.weight ? `${animal.weight} lbs` : '';
  }
  
  // Handle signature image
  if (submission.signatureData) {
    replacements['{{signature_image_url}}'] = submission.signatureData;
  } else {
    replacements['{{signature_image_url}}'] = '';
  }
  
  // Apply all replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // Replace any custom form data fields (escape HTML to prevent XSS)
  if (submission.formData) {
    for (const [key, value] of Object.entries(submission.formData)) {
      const placeholder = `{{${key}}}`;
      // HTML-escape user-provided values to prevent XSS
      const escapedValue = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      html = html.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), escapedValue);
    }
  }
  
  return html;
}

// Generate secure token for form submission
export function generateSecureToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

// Hash a token for lookup
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper to strip HTML tags and extract text content
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Generate PDF for a completed custom form submission using pdf-lib
export async function generateCustomFormPdf(
  submissionId: string,
  tenantId: string
): Promise<{ pdfUrl: string } | null> {
  const submission = await getSubmissionById(submissionId, tenantId);
  
  if (!submission || submission.status !== 'completed' || !submission.renderedHtml) {
    console.error(`[CustomFormPdf] Cannot generate PDF: submission not found or not completed`);
    return null;
  }

  const form = await getFormById(submission.formId, tenantId);
  if (!form) {
    console.error(`[CustomFormPdf] Cannot generate PDF: form not found`);
    return null;
  }

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Page dimensions (Letter size)
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;
    const lineHeight = 14;
    const paragraphSpacing = 20;
    
    // Helper to add new page if needed
    const ensureSpace = (needed: number) => {
      if (yPosition - needed < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = pageHeight - margin;
      }
    };
    
    // Helper to wrap text
    const wrapText = (text: string, maxWidth: number, font: typeof helvetica, fontSize: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };
    
    // Draw form title
    ensureSpace(30);
    page.drawText(form.name, {
      x: margin,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    yPosition -= 30;
    
    // Extract and draw form content
    const textContent = stripHtml(submission.renderedHtml);
    const paragraphs = textContent.split('\n\n').filter(p => p.trim());
    
    for (const paragraph of paragraphs) {
      const lines = paragraph.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        const wrappedLines = wrapText(line.trim(), contentWidth, helvetica, 11);
        
        for (const wrappedLine of wrappedLines) {
          ensureSpace(lineHeight);
          page.drawText(wrappedLine, {
            x: margin,
            y: yPosition,
            size: 11,
            font: helvetica,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight;
        }
      }
      yPosition -= paragraphSpacing / 2;
    }
    
    // Add signature if present
    if (submission.signatureData) {
      ensureSpace(120);
      yPosition -= 20;
      
      // Draw separator line
      page.drawLine({
        start: { x: margin, y: yPosition + 10 },
        end: { x: pageWidth - margin, y: yPosition + 10 },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
      
      page.drawText('Signature:', {
        x: margin,
        y: yPosition - 5,
        size: 12,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      yPosition -= 25;
      
      // Embed signature image
      try {
        const signatureBase64 = submission.signatureData.replace(/^data:image\/\w+;base64,/, '');
        const signatureBytes = Buffer.from(signatureBase64, 'base64');
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        
        const sigDims = signatureImage.scale(0.5);
        const maxSigWidth = 200;
        const maxSigHeight = 60;
        const scale = Math.min(maxSigWidth / sigDims.width, maxSigHeight / sigDims.height, 1);
        
        ensureSpace(sigDims.height * scale + 20);
        page.drawImage(signatureImage, {
          x: margin,
          y: yPosition - (sigDims.height * scale),
          width: sigDims.width * scale,
          height: sigDims.height * scale,
        });
        yPosition -= (sigDims.height * scale) + 20;
      } catch (sigError) {
        console.warn('[CustomFormPdf] Could not embed signature image:', sigError);
        page.drawText('[Signature on file]', {
          x: margin,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });
        yPosition -= 20;
      }
    }
    
    // Add metadata footer
    ensureSpace(80);
    yPosition -= 20;
    
    page.drawLine({
      start: { x: margin, y: yPosition + 10 },
      end: { x: pageWidth - margin, y: yPosition + 10 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    
    const metaFontSize = 9;
    page.drawText(`Signed by: ${submission.signerName} (${submission.signerEmail})`, {
      x: margin,
      y: yPosition - 5,
      size: metaFontSize,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    yPosition -= 14;
    
    page.drawText(`Date: ${submission.signedAt ? new Date(submission.signedAt).toLocaleString() : 'N/A'}`, {
      x: margin,
      y: yPosition,
      size: metaFontSize,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    yPosition -= 14;
    
    page.drawText(`IP Address: ${submission.signerIpAddress || 'N/A'}`, {
      x: margin,
      y: yPosition,
      size: metaFontSize,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    // Save PDF to buffer
    const pdfBytes = await pdfDoc.save();

    // Upload to object storage
    const { objectStorageClient } = await import('../objectStorage');
    
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const objectPath = `${privateObjectDir}/forms/form_${timestamp}_${randomId}.pdf`;
    const pathParts = objectPath.split('/');
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join('/');

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(Buffer.from(pdfBytes), {
      metadata: {
        contentType: 'application/pdf',
      },
    });

    // Return the object path (not a signed URL) for permanent storage
    const pdfPath = `/objects/forms/${file.name.split('/').pop()}`;
    
    console.log(`[CustomFormPdf] PDF generated for submission ${submissionId} at ${pdfPath}`);
    return { pdfUrl: pdfPath };
  } catch (error) {
    console.error(`[CustomFormPdf] Error generating PDF:`, error);
    return null;
  }
}

// Generate a time-limited signed URL for downloading a custom form PDF
// Uses Replit's sidecar for URL signing
export async function generateSignedFormUrl(pdfPath: string, signerName: string, ttlSec: number = 900): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not configured');
  }

  // Parse the path to get filename - pdfPath is like /objects/forms/form_123_abc.pdf
  const filename = pdfPath.split('/').pop();
  if (!filename) {
    throw new Error('Invalid PDF path');
  }

  const objectPath = `${privateObjectDir}/forms/${filename}`;
  const pathParts = objectPath.split('/');
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  const { objectStorageClient } = await import('../objectStorage');
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('Form PDF file not found');
  }

  // Use Replit sidecar to generate signed URL (required in Replit environment)
  const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method: "GET",
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }

  const { signed_url: signedUrl } = await response.json();
  return signedUrl;
}
