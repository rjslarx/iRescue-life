import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '../db';
import { donations, tenants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';
import { TenantFileStorage } from '../lib/tenantFileStorage';

// IRS compliance: Vehicle-related keywords that require Form 1098-C
const VEHICLE_KEYWORDS = ['car', 'boat', 'vehicle', 'trailer', 'automobile', 'truck', 'motorcycle', 'aircraft', 'airplane'];

export interface DonationReceiptData {
  donationId: string;
  tenantId: string;
}

export interface ReceiptGenerationResult {
  success: boolean;
  message: string;
  receiptNumber?: string;
  requiresManualReview?: boolean;
  pdfBuffer?: Buffer;
}

/**
 * Generates a unique receipt number for IRS tracking
 */
function generateReceiptNumber(tenantIdentifier?: string | null): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  // Use tenant identifier prefix, or 'RCPT' as fallback
  const prefix = tenantIdentifier && tenantIdentifier.length >= 4 
    ? tenantIdentifier.substring(0, 4).toUpperCase()
    : tenantIdentifier && tenantIdentifier.length > 0
      ? tenantIdentifier.toUpperCase().padEnd(4, 'X')
      : 'RCPT';
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Checks if the donation description contains vehicle-related keywords
 * Vehicle donations require Form 1098-C and cannot use standard receipts
 */
function requiresVehicleForm(description: string | null): boolean {
  if (!description) return false;
  const lowerDesc = description.toLowerCase();
  return VEHICLE_KEYWORDS.some(keyword => lowerDesc.includes(keyword));
}

/**
 * Formats a date for display on the receipt
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Formats currency amount for display (amount is in cents)
 */
function formatCurrency(amountInCents: string | number | null): string {
  if (amountInCents === null || amountInCents === undefined) return '$0.00';
  const numAmount = typeof amountInCents === 'string' ? parseFloat(amountInCents) : amountInCents;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(numAmount / 100); // Convert cents to dollars
}

/**
 * Generates an IRS-compliant PDF donation receipt
 */
export async function generateDonationReceipt(
  data: DonationReceiptData
): Promise<ReceiptGenerationResult> {
  try {
    // Fetch donation with tenant info
    const [donation] = await db
      .select()
      .from(donations)
      .where(and(
        eq(donations.id, data.donationId),
        eq(donations.tenantId, data.tenantId)
      ));

    if (!donation) {
      return { success: false, message: 'Donation not found' };
    }

    // Fetch tenant info for org details
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, data.tenantId));

    if (!tenant) {
      return { success: false, message: 'Organization not found' };
    }

    // IRS Safety Check: Vehicle donations require Form 1098-C
    if (requiresVehicleForm(donation.description)) {
      return {
        success: false,
        message: 'Vehicle donations require Form 1098-C. This receipt cannot be automatically generated. Please process this donation manually.',
        requiresManualReview: true
      };
    }

    // IRS Safety Check: In-kind donations require email, address, and donor-stated value
    const donationTypeForCheck = donation.donationType || 'cash';
    const inKindTypesForCheck = ['in_kind', 'in_kind_goods', 'in_kind_services'];
    if (inKindTypesForCheck.includes(donationTypeForCheck)) {
      if (!donation.donorEmail) {
        return {
          success: false,
          message: 'In-kind donation receipts require donor email for IRS compliance. Please update the donation record.',
          requiresManualReview: true
        };
      }
      if (!donation.donorAddress || !(donation as any).donorCity || !(donation as any).donorState || !(donation as any).donorZip) {
        return {
          success: false,
          message: 'In-kind donation receipts require full donor mailing address for IRS compliance. Please update the donation record.',
          requiresManualReview: true
        };
      }
      if (!(donation as any).donorStatedValue) {
        return {
          success: false,
          message: 'In-kind donation receipts require donor-stated value for IRS compliance. Please update the donation record.',
          requiresManualReview: true
        };
      }
    }

    // Generate receipt number if not already assigned
    const receiptNumber = donation.receiptNumber || generateReceiptNumber(tenant.subdomain);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    // Load fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const primaryColor = rgb(0.2, 0.4, 0.6);
    const textColor = rgb(0.1, 0.1, 0.1);
    const mutedColor = rgb(0.4, 0.4, 0.4);

    let y = height - 60;
    const leftMargin = 50;
    const rightMargin = width - 50;

    // Header - Organization Name
    page.drawText(tenant.name.toUpperCase(), {
      x: leftMargin,
      y,
      size: 24,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 25;

    // Tax ID / EIN
    if (tenant.ein) {
      page.drawText(`EIN: ${tenant.ein}`, {
        x: leftMargin,
        y,
        size: 10,
        font: helvetica,
        color: mutedColor,
      });
      y -= 15;
    }

    // Organization Address
    if (tenant.address) {
      page.drawText(tenant.address, {
        x: leftMargin,
        y,
        size: 10,
        font: helvetica,
        color: mutedColor,
      });
      y -= 15;
    }

    // Contact info
    if (tenant.email || tenant.phone) {
      const contactInfo = [tenant.email, tenant.phone].filter(Boolean).join(' | ');
      page.drawText(contactInfo, {
        x: leftMargin,
        y,
        size: 10,
        font: helvetica,
        color: mutedColor,
      });
      y -= 15;
    }

    // Divider line
    y -= 10;
    page.drawLine({
      start: { x: leftMargin, y },
      end: { x: rightMargin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 30;

    // Title
    page.drawText('OFFICIAL DONATION RECEIPT', {
      x: leftMargin,
      y,
      size: 18,
      font: helveticaBold,
      color: textColor,
    });
    y -= 15;

    page.drawText('For Tax Deduction Purposes', {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: mutedColor,
    });
    y -= 40;

    // Receipt Number and Date (right-aligned)
    const receiptDateText = `Receipt #: ${receiptNumber}`;
    const dateText = `Date: ${formatDate(donation.date)}`;
    
    page.drawText(receiptDateText, {
      x: rightMargin - helvetica.widthOfTextAtSize(receiptDateText, 10),
      y: height - 60,
      size: 10,
      font: helvetica,
      color: mutedColor,
    });
    
    page.drawText(dateText, {
      x: rightMargin - helvetica.widthOfTextAtSize(dateText, 10),
      y: height - 75,
      size: 10,
      font: helvetica,
      color: mutedColor,
    });

    // Donor Information Section
    page.drawText('DONOR INFORMATION', {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 20;

    page.drawText(`Name: ${donation.donorName}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: textColor,
    });
    y -= 18;

    // Build full address from components
    const addressParts: string[] = [];
    if (donation.donorAddress) addressParts.push(donation.donorAddress);
    const cityStateZip = [
      (donation as any).donorCity,
      (donation as any).donorState,
      (donation as any).donorZip
    ].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1'); // Format: "City, State ZIP"
    if (cityStateZip) addressParts.push(cityStateZip);
    
    if (addressParts.length > 0) {
      for (const line of addressParts) {
        page.drawText(`Address: ${line}`, {
          x: leftMargin,
          y,
          size: 11,
          font: helvetica,
          color: textColor,
        });
        y -= 18;
      }
    }

    if (donation.donorEmail) {
      page.drawText(`Email: ${donation.donorEmail}`, {
        x: leftMargin,
        y,
        size: 11,
        font: helvetica,
        color: textColor,
      });
      y -= 18;
    }
    y -= 17;

    // Donation Details Section
    page.drawText('DONATION DETAILS', {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 20;

    page.drawText(`Donation Date: ${formatDate(donation.date)}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: textColor,
    });
    y -= 18;

    // IRS Compliance: Different display for Cash vs In-Kind donations
    const donationType = donation.donationType || 'cash';
    const inKindTypes = ['in_kind', 'in_kind_goods', 'in_kind_services'];
    const isMonetary = !inKindTypes.includes(donationType);
    
    if (isMonetary) {
      // Cash/Check/Online donation: Show the dollar amount
      const typeLabels: Record<string, string> = {
        cash: 'Cash Contribution',
        check: 'Check Contribution',
        online: 'Online Contribution',
      };
      page.drawText(`Donation Type: ${typeLabels[donationType] || 'Monetary Contribution'}`, {
        x: leftMargin,
        y,
        size: 11,
        font: helvetica,
        color: textColor,
      });
      y -= 18;

      // Show check number if applicable
      if (donationType === 'check' && donation.checkNumber) {
        page.drawText(`Check Number: ${donation.checkNumber}`, {
          x: leftMargin,
          y,
          size: 11,
          font: helvetica,
          color: textColor,
        });
        y -= 18;
      }

      page.drawText(`Amount: ${formatCurrency(donation.amount)}`, {
        x: leftMargin,
        y,
        size: 14,
        font: helveticaBold,
        color: textColor,
      });
      y -= 25;
    } else {
      // In-Kind donation: Show description only, NO dollar value (IRS requirement)
      const inKindLabels: Record<string, string> = {
        in_kind: 'In-Kind Contribution (Non-Cash)',
        in_kind_goods: 'In-Kind Goods (Non-Cash)',
        in_kind_services: 'In-Kind Services (Non-Cash)',
      };
      page.drawText(`Donation Type: ${inKindLabels[donationType] || 'In-Kind Contribution (Non-Cash)'}`, {
        x: leftMargin,
        y,
        size: 11,
        font: helvetica,
        color: textColor,
      });
      y -= 18;

      page.drawText('Description of Items Donated:', {
        x: leftMargin,
        y,
        size: 11,
        font: helvetica,
        color: textColor,
      });
      y -= 18;

      // Wrap long descriptions
      const description = donation.description || 'Items donated';
      const maxWidth = rightMargin - leftMargin - 20;
      const words = description.split(' ');
      let line = '';
      
      for (const word of words) {
        const testLine = line + (line ? ' ' : '') + word;
        if (helvetica.widthOfTextAtSize(testLine, 11) < maxWidth) {
          line = testLine;
        } else {
          page.drawText(`  ${line}`, {
            x: leftMargin,
            y,
            size: 11,
            font: helvetica,
            color: textColor,
          });
          y -= 16;
          line = word;
        }
      }
      if (line) {
        page.drawText(`  ${line}`, {
          x: leftMargin,
          y,
          size: 11,
          font: helvetica,
          color: textColor,
        });
        y -= 25;
      }

      // Show donor-stated value if provided (IRS requirement - use donor's valuation, not org estimate)
      const donorStatedValue = (donation as any).donorStatedValue;
      if (donorStatedValue) {
        page.drawText(`Donor-Stated Value: ${formatCurrency(donorStatedValue)}`, {
          x: leftMargin,
          y,
          size: 11,
          font: helveticaBold,
          color: textColor,
        });
        y -= 18;
      }

      // Note about valuation (IRS requirement for in-kind)
      page.drawText('Note: The value of in-kind donations is determined by the donor.', {
        x: leftMargin,
        y,
        size: 9,
        font: helvetica,
        color: mutedColor,
      });
      y -= 12;
      page.drawText('Please consult your tax advisor for valuation guidance.', {
        x: leftMargin,
        y,
        size: 9,
        font: helvetica,
        color: mutedColor,
      });
      y -= 25;
    }

    // IRS REQUIRED "Magic Language" - Critical for compliance
    y -= 20;
    page.drawLine({
      start: { x: leftMargin, y: y + 10 },
      end: { x: rightMargin, y: y + 10 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 10;

    page.drawText('IRS DISCLOSURE STATEMENT', {
      x: leftMargin,
      y,
      size: 10,
      font: helveticaBold,
      color: textColor,
    });
    y -= 18;

    // THE MAGIC LANGUAGE - Required by IRS for deductions over $250
    const magicLanguage = 'No goods or services were provided in exchange for this contribution.';
    page.drawText(magicLanguage, {
      x: leftMargin,
      y,
      size: 11,
      font: helveticaBold,
      color: textColor,
    });
    y -= 25;

    // 501(c)(3) statement
    const nonprofitStatement = `${tenant.name} is a registered 501(c)(3) nonprofit organization.`;
    page.drawText(nonprofitStatement, {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 15;

    page.drawText('Your contribution is tax-deductible to the extent allowed by law.', {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 15;

    page.drawText('Please retain this receipt for your tax records.', {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 40;

    // Thank you message
    page.drawText('Thank you for your generous support!', {
      x: leftMargin,
      y,
      size: 14,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 25;

    page.drawText('Your donation helps us continue our mission of rescuing and caring for animals in need.', {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });

    // Footer
    const footerY = 50;
    page.drawLine({
      start: { x: leftMargin, y: footerY + 20 },
      end: { x: rightMargin, y: footerY + 20 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const footerText = `Generated on ${formatDate(new Date())} | Receipt ID: ${receiptNumber}`;
    page.drawText(footerText, {
      x: leftMargin,
      y: footerY,
      size: 8,
      font: helvetica,
      color: mutedColor,
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // Update donation record with receipt number
    await db
      .update(donations)
      .set({ receiptNumber })
      .where(eq(donations.id, data.donationId));

    // Backup receipt to Google Drive if tenant has it configured
    try {
      const fileStorage = new TenantFileStorage(data.tenantId);
      const donationDate = formatDate(donation.date).replace(/ /g, '_');
      const fileName = `Receipt_${receiptNumber}_${donationDate}.pdf`;
      
      const uploadResult = await fileStorage.uploadFile({
        tenantId: data.tenantId,
        userId: 'system', // System-generated receipt
        category: 'donation-receipts',
        visibility: 'private',
        fileName,
        mimeType: 'application/pdf',
        content: pdfBuffer,
      });
      
      if (uploadResult.success) {
        console.log(`[RECEIPT] Backed up receipt ${receiptNumber} to ${uploadResult.storageType}: ${uploadResult.fileUrl}`);
      } else {
        console.log(`[RECEIPT] Could not backup receipt ${receiptNumber} to storage:`, uploadResult.error);
      }
    } catch (backupErr) {
      // Don't fail the receipt generation if backup fails
      console.error(`[RECEIPT] Error backing up receipt ${receiptNumber}:`, backupErr);
    }

    return {
      success: true,
      message: 'Receipt generated successfully',
      receiptNumber,
      pdfBuffer
    };
  } catch (error) {
    console.error('Error generating donation receipt:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate receipt'
    };
  }
}

/**
 * Generates and emails the donation receipt to the donor
 */
export async function generateAndEmailReceipt(
  data: DonationReceiptData
): Promise<ReceiptGenerationResult> {
  try {
    // Generate the receipt
    const result = await generateDonationReceipt(data);
    
    if (!result.success || !result.pdfBuffer) {
      return result;
    }

    // Fetch donation and tenant for email
    const [donation] = await db
      .select()
      .from(donations)
      .where(eq(donations.id, data.donationId));

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, data.tenantId));

    if (!donation || !tenant) {
      return { success: false, message: 'Could not retrieve donation or organization details' };
    }

    // Send email with PDF attachment
    const emailSubject = `Official Tax Receipt - ${formatDate(donation.date)} - ${tenant.name}`;
    const donationType = (donation as any).donationType || 'cash';
    const inKindTypes = ['in_kind', 'in_kind_goods', 'in_kind_services'];
    const isInKind = inKindTypes.includes(donationType);
    
    const emailBodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>Dear ${donation.donorName},</p>
  
  <p>Thank you for your generous ${isInKind ? 'in-kind contribution' : 'donation'} to ${tenant.name}!</p>
  
  <p>Please find attached your official tax receipt for your records. This document serves as proof of your charitable contribution for tax purposes.</p>
  
  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Receipt Number:</strong> ${result.receiptNumber}</p>
    <p style="margin: 5px 0;"><strong>Donation Date:</strong> ${formatDate(donation.date)}</p>
    ${!isInKind 
      ? `<p style="margin: 5px 0;"><strong>Amount:</strong> ${formatCurrency(donation.amount)}</p>` 
      : `<p style="margin: 5px 0;"><strong>Items:</strong> ${donation.description || 'In-kind donation'}</p>
         ${(donation as any).donorStatedValue ? `<p style="margin: 5px 0;"><strong>Donor-Stated Value:</strong> ${formatCurrency((donation as any).donorStatedValue)}</p>` : ''}`}
  </div>
  
  <p>Your support makes a real difference in the lives of the animals we rescue and care for. Thank you for being part of our mission!</p>
  
  <p>With gratitude,<br/>
  The ${tenant.name} Team</p>
  
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #666;">
    This is an official tax receipt. Please retain for your records.<br/>
    ${tenant.name} is a registered 501(c)(3) nonprofit organization.
    ${tenant.ein ? `<br/>EIN: ${tenant.ein}` : ''}
  </p>
</div>
    `.trim();

    // Get email service for tenant
    const emailService = await EmailService.forTenant(data.tenantId);
    if (!emailService) {
      return {
        success: true,
        message: 'Receipt generated but email could not be sent (no email service configured)',
        receiptNumber: result.receiptNumber,
        pdfBuffer: result.pdfBuffer
      };
    }

    await emailService.send({
      to: donation.donorEmail,
      subject: emailSubject,
      html: emailBodyHtml,
      attachments: [
        {
          filename: `Receipt_${result.receiptNumber}.pdf`,
          content: result.pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    // Update donation with receipt sent timestamp
    await db
      .update(donations)
      .set({ receiptSentAt: new Date() })
      .where(eq(donations.id, data.donationId));

    return {
      success: true,
      message: 'Receipt generated and emailed successfully',
      receiptNumber: result.receiptNumber,
      pdfBuffer: result.pdfBuffer
    };
  } catch (error) {
    console.error('Error sending donation receipt email:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send receipt email'
    };
  }
}
