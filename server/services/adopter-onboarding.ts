import { db } from '../db';
import { users, animalAdopters, magicLinks, tenants, animals } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

interface AdopterOnboardingResult {
  success: boolean;
  userId?: string;
  isNewUser?: boolean;
  magicLinkToken?: string;
  error?: string;
}

export async function createAdopterAccount(
  tenantId: string,
  animalId: string,
  adopterEmail: string,
  adopterName: string,
  adoptionDate?: Date
): Promise<AdopterOnboardingResult> {
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, adopterEmail.toLowerCase())))
      .limit(1);

    let userId: string;
    let isNewUser = false;

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      
      const currentRoles = existingUser[0].roles as string[] || ['adopter'];
      if (!currentRoles.includes('adopter')) {
        await db
          .update(users)
          .set({ roles: [...currentRoles, 'adopter'] })
          .where(eq(users.id, userId));
      }
    } else {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      const nameParts = adopterName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const [newUser] = await db
        .insert(users)
        .values({
          tenantId,
          email: adopterEmail.toLowerCase(),
          passwordHash: hashedPassword,
          firstName,
          lastName,
          roles: ['adopter'],
          isActive: true,
        })
        .returning();

      userId = newUser.id;
      isNewUser = true;
    }

    const existingLink = await db
      .select()
      .from(animalAdopters)
      .where(and(
        eq(animalAdopters.tenantId, tenantId),
        eq(animalAdopters.animalId, animalId),
        eq(animalAdopters.userId, userId)
      ))
      .limit(1);

    if (existingLink.length === 0) {
      await db.insert(animalAdopters).values({
        tenantId,
        animalId,
        userId,
        adoptedAt: adoptionDate || new Date(),
      });
    }

    const magicLinkToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(magicLinks).values({
      tenantId,
      userId,
      token: magicLinkToken,
      expiresAt,
      action: 'login',
    });

    return {
      success: true,
      userId,
      isNewUser,
      magicLinkToken,
    };
  } catch (error) {
    console.error('[Adopter Onboarding] Failed to create adopter account:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendAdopterWelcomeEmail(
  tenantId: string,
  animalId: string,
  userId: string,
  magicLinkToken: string
): Promise<boolean> {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const [animal] = await db
      .select()
      .from(animals)
      .where(eq(animals.id, animalId))
      .limit(1);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!tenant || !animal || !user) {
      console.error('[Adopter Onboarding] Missing data for welcome email');
      return false;
    }

    const baseUrl = process.env.REPLIT_SLUG 
      ? `https://${process.env.REPLIT_SLUG}.${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
    
    const tenantPath = tenant.subdomain ? `/${tenant.subdomain}` : '';
    const magicLinkUrl = `${baseUrl}${tenantPath}/my-pets/login?token=${magicLinkToken}`;

    const { EmailService } = await import('../lib/email-service');
    const emailService = new EmailService();

    const animalPhoto = (animal.photoUrls as string[])?.[0] || '';

    const subject = `Welcome to the ${tenant.name} Family - Meet ${animal.name} in Your Pet Portal`;
    
    const preheaderText = `Access ${animal.name}'s health records, vaccination certificates, and share happy tail updates`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <span style="display: none; max-height: 0; overflow: hidden;">${preheaderText}</span>
  <span style="display: none; max-height: 0; overflow: hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #8b5cf6; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to Your Pet Portal</h1>
            </td>
          </tr>
          
          <!-- Animal Photo -->
          ${animalPhoto ? `
          <tr>
            <td style="padding: 0;">
              <img src="${animalPhoto}" alt="${animal.name}" style="width: 100%; height: auto; display: block;">
            </td>
          </tr>
          ` : ''}
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px;">Congratulations on adopting ${animal.name}!</h2>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi ${user.firstName || 'there'},
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                We're thrilled that ${animal.name} has found their forever home with you! As part of the ${tenant.name} family, you now have access to your own <strong>Pet Portal</strong> where you can:
              </p>
              
              <ul style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 20px; padding-left: 20px;">
                <li><strong>Download vaccination certificates</strong> and medical records</li>
                <li><strong>Track ${animal.name}'s weight</strong> to ensure healthy growth</li>
                <li><strong>Receive medication reminders</strong> with one-click confirmations</li>
                <li><strong>Share Happy Tail updates</strong> - we love seeing how ${animal.name} is doing!</li>
              </ul>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                Click the button below to access your portal instantly - no password needed!
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLinkUrl}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  Access My Pet Portal
                </a>
              </div>
              
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px;">
                  <strong>Install the App for the Best Experience</strong>
                </p>
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  On iPhone: Tap the Share button <span style="font-family: 'Apple Symbols', sans-serif;">&#xFEFF;</span> in Safari, then "Add to Home Screen"<br>
                  On Android: Tap the menu, then "Install App"
                </p>
              </div>
              
              <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
                This link expires in 7 days. If you have any questions, just reply to this email!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0; text-align: center;">
                ${tenant.name}<br>
                <a href="${baseUrl}${tenantPath}" style="color: #8b5cf6;">${baseUrl}${tenantPath}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await emailService.sendEmail(
      tenantId,
      user.email,
      subject,
      html,
      {
        category: 'adopter_portal',
        tags: ['welcome', 'adopter'],
      }
    );

    console.log(`[Adopter Onboarding] Sent welcome email to ${user.email} for ${animal.name}`);
    return true;
  } catch (error) {
    console.error('[Adopter Onboarding] Failed to send welcome email:', error);
    return false;
  }
}

export async function onboardAdopter(
  tenantId: string,
  animalId: string,
  adopterEmail: string,
  adopterName: string,
  adoptionDate?: Date
): Promise<AdopterOnboardingResult> {
  const result = await createAdopterAccount(tenantId, animalId, adopterEmail, adopterName, adoptionDate);
  
  if (result.success && result.userId && result.magicLinkToken) {
    await sendAdopterWelcomeEmail(tenantId, animalId, result.userId, result.magicLinkToken);
  }
  
  return result;
}
