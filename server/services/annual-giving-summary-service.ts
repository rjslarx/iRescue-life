import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '../db';
import { donations, tenants } from '@shared/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';
import { isPaidSubscriptionTier } from '../config/platform';

export interface EligibleDonor {
  donorName: string;
  donorEmail: string;
  donorAddress: string | null;
  totalAmount: number;
  donationCount: number;
  donations: Array<{
    id: string;
    date: Date;
    amount: number;
    donationType: string;
    description: string | null;
  }>;
}

export interface AnnualSummaryResult {
  success: boolean;
  message: string;
  pdfBuffer?: Buffer;
  receiptNumber?: string;
}

export interface BulkSendResult {
  success: boolean;
  message: string;
  totalEligible: number;
  sent: number;
  failed: number;
  errors: string[];
}

const IRS_THRESHOLD_CENTS = 25000;

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatCurrency(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amountInCents / 100);
}

function generateSummaryNumber(tenantSlug: string, year: number): string {
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${tenantSlug.substring(0, 4).toUpperCase()}-${year}-ANN-${random}`;
}

export async function getEligibleDonors(
  tenantId: string,
  year: number
): Promise<EligibleDonor[]> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const yearDonations = await db
    .select()
    .from(donations)
    .where(and(
      eq(donations.tenantId, tenantId),
      gte(donations.date, startDate),
      lt(donations.date, endDate)
    ));

  const donorMap = new Map<string, EligibleDonor>();

  for (const donation of yearDonations) {
    const donationType = (donation as any).donationType || 'cash';
    if (donationType !== 'cash') continue;

    // Skip donations without valid email addresses
    // IRS summaries must be sent to donors, so email is required
    const email = donation.donorEmail?.trim();
    if (!email || email === '') continue;

    const key = email.toLowerCase();
    
    if (!donorMap.has(key)) {
      donorMap.set(key, {
        donorName: donation.donorName,
        donorEmail: email,
        donorAddress: donation.donorAddress,
        totalAmount: 0,
        donationCount: 0,
        donations: []
      });
    }

    const donor = donorMap.get(key)!;
    const amount = typeof donation.amount === 'string' 
      ? parseInt(donation.amount, 10) 
      : donation.amount;
    
    donor.totalAmount += amount;
    donor.donationCount++;
    donor.donations.push({
      id: donation.id,
      date: donation.date,
      amount: amount,
      donationType: donationType,
      description: donation.description
    });

    if (donation.donorName && donation.donorName.length > donor.donorName.length) {
      donor.donorName = donation.donorName;
    }
    if (donation.donorAddress && !donor.donorAddress) {
      donor.donorAddress = donation.donorAddress;
    }
  }

  const eligibleDonors: EligibleDonor[] = [];
  for (const donor of donorMap.values()) {
    if (donor.totalAmount >= IRS_THRESHOLD_CENTS) {
      donor.donations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      eligibleDonors.push(donor);
    }
  }

  eligibleDonors.sort((a, b) => b.totalAmount - a.totalAmount);

  return eligibleDonors;
}

export async function generateAnnualSummaryPdf(
  tenantId: string,
  donor: EligibleDonor,
  year: number
): Promise<AnnualSummaryResult> {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      return { success: false, message: 'Organization not found' };
    }

    const summaryNumber = generateSummaryNumber(tenant.slug, year);
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const primaryColor = rgb(0.2, 0.4, 0.6);
    const textColor = rgb(0.1, 0.1, 0.1);
    const mutedColor = rgb(0.4, 0.4, 0.4);

    let y = height - 60;
    const leftMargin = 50;
    const rightMargin = width - 50;

    page.drawText(tenant.name.toUpperCase(), {
      x: leftMargin,
      y,
      size: 24,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 25;

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

    y -= 10;
    page.drawLine({
      start: { x: leftMargin, y },
      end: { x: rightMargin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 30;

    page.drawText(`ANNUAL GIVING SUMMARY - ${year}`, {
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

    const summaryText = `Summary #: ${summaryNumber}`;
    const dateText = `Generated: ${formatDate(new Date())}`;
    
    page.drawText(summaryText, {
      x: rightMargin - helvetica.widthOfTextAtSize(summaryText, 10),
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

    page.drawText('DONOR INFORMATION', {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 20;

    page.drawText(`Name: ${donor.donorName}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: textColor,
    });
    y -= 18;

    if (donor.donorAddress) {
      page.drawText(`Address: ${donor.donorAddress}`, {
        x: leftMargin,
        y,
        size: 11,
        font: helvetica,
        color: textColor,
      });
      y -= 18;
    }

    page.drawText(`Email: ${donor.donorEmail}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: textColor,
    });
    y -= 35;

    page.drawText('DONATION SUMMARY', {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 20;

    page.drawText(`Total Contributions for ${year}: ${formatCurrency(donor.totalAmount)}`, {
      x: leftMargin,
      y,
      size: 14,
      font: helveticaBold,
      color: textColor,
    });
    y -= 20;

    page.drawText(`Number of Donations: ${donor.donationCount}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: textColor,
    });
    y -= 30;

    page.drawText('DONATION DETAILS', {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });
    y -= 20;

    page.drawText('Date', { x: leftMargin, y, size: 10, font: helveticaBold, color: textColor });
    page.drawText('Amount', { x: leftMargin + 150, y, size: 10, font: helveticaBold, color: textColor });
    page.drawText('Description', { x: leftMargin + 250, y, size: 10, font: helveticaBold, color: textColor });
    y -= 5;
    
    page.drawLine({
      start: { x: leftMargin, y },
      end: { x: rightMargin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 15;

    const maxDonationsToShow = Math.min(donor.donations.length, 15);
    for (let i = 0; i < maxDonationsToShow; i++) {
      const d = donor.donations[i];
      page.drawText(formatDate(d.date), {
        x: leftMargin,
        y,
        size: 10,
        font: helvetica,
        color: textColor,
      });
      page.drawText(formatCurrency(d.amount), {
        x: leftMargin + 150,
        y,
        size: 10,
        font: helvetica,
        color: textColor,
      });
      const desc = (d.description || 'General donation').substring(0, 35);
      page.drawText(desc, {
        x: leftMargin + 250,
        y,
        size: 10,
        font: helvetica,
        color: textColor,
      });
      y -= 15;
    }

    if (donor.donations.length > 15) {
      page.drawText(`... and ${donor.donations.length - 15} more donations`, {
        x: leftMargin,
        y,
        size: 10,
        font: helvetica,
        color: mutedColor,
      });
      y -= 15;
    }

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

    page.drawText('No goods or services were provided in exchange for these contributions.', {
      x: leftMargin,
      y,
      size: 11,
      font: helveticaBold,
      color: textColor,
    });
    y -= 25;

    const nonprofitStatement = `${tenant.name} is a registered 501(c)(3) nonprofit organization.`;
    page.drawText(nonprofitStatement, {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 15;

    page.drawText('Your contributions are tax-deductible to the extent allowed by law.', {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 15;

    page.drawText('Please retain this summary for your tax records.', {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: textColor,
    });
    y -= 40;

    page.drawText('Thank you for your generous support!', {
      x: leftMargin,
      y,
      size: 14,
      font: helveticaBold,
      color: primaryColor,
    });

    const footerY = 50;
    page.drawLine({
      start: { x: leftMargin, y: footerY + 20 },
      end: { x: rightMargin, y: footerY + 20 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const footerText = `Generated on ${formatDate(new Date())} | Summary ID: ${summaryNumber}`;
    page.drawText(footerText, {
      x: leftMargin,
      y: footerY,
      size: 8,
      font: helvetica,
      color: mutedColor,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return {
      success: true,
      message: 'Annual summary generated successfully',
      pdfBuffer,
      receiptNumber: summaryNumber
    };
  } catch (error) {
    console.error('Error generating annual summary:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate summary'
    };
  }
}

export async function sendAnnualSummary(
  tenantId: string,
  donor: EligibleDonor,
  year: number
): Promise<AnnualSummaryResult> {
  try {
    const result = await generateAnnualSummaryPdf(tenantId, donor, year);
    
    if (!result.success || !result.pdfBuffer) {
      return result;
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      return { success: false, message: 'Organization not found' };
    }

    const emailSubject = `Your ${year} Annual Giving Summary - ${tenant.name}`;
    
    const emailBodyHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>Dear ${donor.donorName},</p>
  
  <p>Thank you for your generous support of ${tenant.name} during ${year}!</p>
  
  <p>Please find attached your Annual Giving Summary for tax purposes. This document provides a comprehensive record of all your contributions during the calendar year.</p>
  
  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Summary ID:</strong> ${result.receiptNumber}</p>
    <p style="margin: 5px 0;"><strong>Tax Year:</strong> ${year}</p>
    <p style="margin: 5px 0;"><strong>Total Contributions:</strong> ${formatCurrency(donor.totalAmount)}</p>
    <p style="margin: 5px 0;"><strong>Number of Donations:</strong> ${donor.donationCount}</p>
  </div>
  
  <p>Your support makes a real difference in the lives of the animals we rescue and care for. Thank you for being part of our mission!</p>
  
  <p>With gratitude,<br/>
  The ${tenant.name} Team</p>
  
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
  
  <p style="font-size: 12px; color: #666;">
    This is an official annual giving summary for tax purposes. Please retain for your records.<br/>
    ${tenant.name} is a registered 501(c)(3) nonprofit organization.
    ${tenant.ein ? `<br/>EIN: ${tenant.ein}` : ''}
  </p>
</div>
    `.trim();

    const emailService = await EmailService.forTenant(tenantId);
    if (!emailService) {
      return {
        success: false,
        message: 'Email service not configured for this organization'
      };
    }

    await emailService.send({
      to: donor.donorEmail,
      subject: emailSubject,
      html: emailBodyHtml,
      attachments: [
        {
          filename: `Annual_Giving_Summary_${year}_${result.receiptNumber}.pdf`,
          content: result.pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    return {
      success: true,
      message: 'Annual summary sent successfully',
      receiptNumber: result.receiptNumber,
      pdfBuffer: result.pdfBuffer
    };
  } catch (error) {
    console.error('Error sending annual summary:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send summary'
    };
  }
}

export async function sendAllAnnualSummaries(
  tenantId: string,
  year: number
): Promise<BulkSendResult> {
  const result: BulkSendResult = {
    success: false,
    message: '',
    totalEligible: 0,
    sent: 0,
    failed: 0,
    errors: []
  };

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      result.message = 'Organization not found';
      return result;
    }

    if (!isPaidSubscriptionTier(tenant.subscriptionTier)) {
      result.message = 'Bulk sending annual summaries requires a Professional subscription';
      return result;
    }

    const eligibleDonors = await getEligibleDonors(tenantId, year);
    result.totalEligible = eligibleDonors.length;

    if (eligibleDonors.length === 0) {
      result.success = true;
      result.message = 'No eligible donors found for this year';
      return result;
    }

    for (const donor of eligibleDonors) {
      const sendResult = await sendAnnualSummary(tenantId, donor, year);
      
      if (sendResult.success) {
        result.sent++;
      } else {
        result.failed++;
        result.errors.push(`${donor.donorEmail}: ${sendResult.message}`);
      }
    }

    result.success = result.failed === 0;
    result.message = `Sent ${result.sent} of ${result.totalEligible} annual summaries`;
    
    if (result.failed > 0) {
      result.message += ` (${result.failed} failed)`;
    }

    return result;
  } catch (error) {
    console.error('Error in bulk send:', error);
    result.message = error instanceof Error ? error.message : 'Failed to send summaries';
    return result;
  }
}

export function checkProTierRequired(subscriptionTier?: string): boolean {
  return !isPaidSubscriptionTier(subscriptionTier);
}
