import { db } from '../db';
import { donations, animals, tenants, donors, type Animal, type Tenant } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { EmailService } from '../lib/email-service';

interface SponsorInfo {
  donorId: string | null;
  donorName: string;
  donorEmail: string;
  amount: number;
}

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fullName;
}

export async function selectBestPhoto(animal: Animal): Promise<string | null> {
  if (!animal.photoUrls || animal.photoUrls.length === 0) {
    return null;
  }
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const animalUpdatedRecently = animal.updatedAt && new Date(animal.updatedAt) > sevenDaysAgo;
  
  if (animalUpdatedRecently && animal.photoUrls.length > 0) {
    console.log(`[Adoption Success] Using first photo (updated ${animal.updatedAt?.toISOString()}) - likely "going home" photo`);
    return animal.photoUrls[0];
  }
  
  if (animal.photoUrls.length > 1) {
    console.log(`[Adoption Success] Animal not recently updated, using last photo (may be newer upload)`);
    return animal.photoUrls[animal.photoUrls.length - 1];
  }
  
  return animal.photoUrls[0];
}

export async function findSponsorsForAnimal(tenantId: string, animalId: string): Promise<SponsorInfo[]> {
  const sponsorDonations = await db
    .select({
      donorId: donations.donorId,
      donorName: donations.donorName,
      donorEmail: donations.donorEmail,
      amount: donations.amount,
    })
    .from(donations)
    .where(and(
      eq(donations.tenantId, tenantId),
      eq(donations.sponsoredAnimalId, animalId),
      isNotNull(donations.donorEmail)
    ));

  const uniqueSponsors = new Map<string, SponsorInfo>();
  
  for (const donation of sponsorDonations) {
    const email = donation.donorEmail.toLowerCase();
    const existing = uniqueSponsors.get(email);
    
    if (!existing || (donation.amount || 0) > (existing.amount || 0)) {
      uniqueSponsors.set(email, {
        donorId: donation.donorId,
        donorName: donation.donorName,
        donorEmail: donation.donorEmail,
        amount: donation.amount || 0,
      });
    }
  }
  
  return Array.from(uniqueSponsors.values());
}

export async function sendAdoptionSuccessEmails(
  tenantId: string,
  animalId: string,
  goingHomePhotoUrl?: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] };
  
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      results.errors.push('Tenant not found');
      return results;
    }

    const [animal] = await db
      .select()
      .from(animals)
      .where(and(
        eq(animals.tenantId, tenantId),
        eq(animals.id, animalId)
      ))
      .limit(1);

    if (!animal) {
      results.errors.push('Animal not found');
      return results;
    }

    const sponsors = await findSponsorsForAnimal(tenantId, animalId);
    
    if (sponsors.length === 0) {
      console.log(`[Adoption Success] No sponsors found for animal ${animal.name} (${animalId})`);
      return results;
    }

    console.log(`[Adoption Success] Found ${sponsors.length} sponsors for ${animal.name}`);

    const emailService = await EmailService.forTenant(tenantId);
    
    if (!emailService) {
      results.errors.push('Email service not configured for tenant');
      return results;
    }

    const photoUrl = goingHomePhotoUrl || await selectBestPhoto(animal);
    
    const baseUrl = tenant.customDomain 
      ? `https://${tenant.customDomain}`
      : `https://irescue.life/${tenant.subdomain}`;
    
    const availableAnimalsUrl = `${baseUrl}/animals`;

    for (const sponsor of sponsors) {
      try {
        const firstName = escapeHtml(getFirstName(sponsor.donorName));
        const animalName = escapeHtml(animal.name);
        const rescueName = escapeHtml(tenant.name);
        
        const isHighValueDonor = sponsor.amount >= 5000;
        
        const emailHtml = isHighValueDonor 
          ? generateImpactTemplate({
              firstName,
              animalName,
              rescueName,
              photoUrl,
              availableAnimalsUrl,
            })
          : generatePureJoyTemplate({
              firstName,
              animalName,
              rescueName,
              photoUrl,
              availableAnimalsUrl,
            });

        const subject = isHighValueDonor
          ? `Mission Accomplished: ${animalName} is going home`
          : `You helped ${animalName} find a home!`;

        await emailService.send({
          to: sponsor.donorEmail,
          subject,
          html: emailHtml,
        });

        console.log(`[Adoption Success] Sent email to ${sponsor.donorEmail} for ${animalName}`);
        results.sent++;
      } catch (emailError) {
        const errorMsg = emailError instanceof Error ? emailError.message : 'Unknown error';
        console.error(`[Adoption Success] Failed to send email to ${sponsor.donorEmail}:`, errorMsg);
        results.failed++;
        results.errors.push(`Failed to send to ${sponsor.donorEmail}: ${errorMsg}`);
      }
    }

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Adoption Success] Error sending adoption success emails:', errorMsg);
    results.errors.push(errorMsg);
    return results;
  }
}

interface TemplateParams {
  firstName: string;
  animalName: string;
  rescueName: string;
  photoUrl: string | null;
  availableAnimalsUrl: string;
}

function generatePureJoyTemplate(params: TemplateParams): string {
  const { firstName, animalName, rescueName, photoUrl, availableAnimalsUrl } = params;
  
  const photoHtml = photoUrl 
    ? `<div style="text-align: center; margin: 25px 0;">
        <img src="${escapeHtml(photoUrl)}" alt="${animalName}" style="max-width: 100%; max-height: 400px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h1 style="color: #059669; font-size: 28px; margin-bottom: 20px; text-align: center;">
      We have incredible news!
    </h1>
    
    <p style="font-size: 18px;">Hi ${firstName},</p>
    
    <p style="font-size: 16px;"><strong>${animalName} has been adopted!</strong></p>
    
    <p style="font-size: 16px;">Because of generous sponsors like you, ${animalName} received the care, food, and medical attention needed to be ready for this day. While we will miss having those paws around the rescue, we are thrilled to see them start their new life.</p>
    
    <p style="font-size: 16px; font-weight: 600; text-align: center; color: #059669;">Here is the face you helped save:</p>
    
    ${photoHtml}
    
    <p style="font-size: 16px;">Thank you for being part of ${animalName}'s journey. You didn't just donate; you helped rewrite a story.</p>
    
    <div style="background-color: #ecfdf5; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 15px 0; font-size: 16px; color: #065f46;">
        <strong>Not ready to say goodbye?</strong><br/>
        There are still tails wagging in our kennels waiting for a hero like you.
      </p>
      <a href="${escapeHtml(availableAnimalsUrl)}" style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Transfer Your Love to Another Dog
      </a>
    </div>
    
    <p style="font-size: 16px;">With gratitude,<br/>
    <strong>The Team at ${rescueName}</strong></p>
  </div>
</body>
</html>
  `.trim();
}

function generateImpactTemplate(params: TemplateParams): string {
  const { firstName, animalName, rescueName, photoUrl, availableAnimalsUrl } = params;
  
  const photoHtml = photoUrl 
    ? `<div style="text-align: center; margin: 25px 0;">
        <img src="${escapeHtml(photoUrl)}" alt="${animalName}" style="max-width: 100%; max-height: 400px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h1 style="color: #059669; font-size: 26px; margin-bottom: 20px; text-align: center;">
      Mission Accomplished
    </h1>
    
    <p style="font-size: 18px;">Dear ${firstName},</p>
    
    <p style="font-size: 16px;">Do you remember when you sponsored ${animalName}?</p>
    
    <p style="font-size: 16px;">At that time, we were hoping for the best but needed help to get there. Today, we are writing to tell you that <strong>you made it happen</strong>.</p>
    
    <p style="font-size: 16px; color: #059669; font-weight: 600;">${animalName} has officially been adopted and is leaving ${rescueName} for a forever home.</p>
    
    <p style="font-size: 16px;">Your donation didn't just buy supplies—it bought time. It gave us the resources to keep ${animalName} safe, healthy, and loved until the right family walked through the door.</p>
    
    ${photoHtml}
    
    <p style="font-size: 16px;">We often say "it takes a village" to save a dog. Thank you for being a leader in ours.</p>
    
    <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
      <p style="margin: 0 0 15px 0; font-size: 16px; color: #92400e;">
        <strong>Want to help another underdog beat the odds?</strong>
      </p>
      <a href="${escapeHtml(availableAnimalsUrl)}" style="display: inline-block; background-color: #d97706; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Dogs Looking for Sponsors
      </a>
    </div>
    
    <p style="font-size: 16px;">Sincerely,<br/>
    <strong>${rescueName}</strong></p>
  </div>
</body>
</html>
  `.trim();
}
