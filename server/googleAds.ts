import { GoogleAdsApi } from 'google-ads-api';
import { db } from './db';
import { tenants, applications } from '@shared/schema';
import { eq } from 'drizzle-orm';

function decryptValue(encryptedValue: string | null): string | null {
  if (!encryptedValue) return null;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return null;
  
  try {
    const crypto = require('crypto');
    const [ivHex, encrypted] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const authTagLength = 16;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength });
    const encryptedBuffer = Buffer.from(encrypted, 'hex');
    const authTag = encryptedBuffer.slice(-authTagLength);
    const encryptedText = encryptedBuffer.slice(0, -authTagLength);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt value:', error);
    return null;
  }
}

export async function uploadConversionToGoogleAds(
  tenantId: string,
  applicationId: string,
  gclid: string
): Promise<{ success: boolean; error?: string }> {
  if (!gclid) {
    console.log('No GCLID provided. Skipping Google Ads upload (Organic traffic).');
    return { success: false, error: 'No GCLID provided' };
  }

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    if (!tenant.googleAdsEnabled) {
      console.log('Google Ads not enabled for tenant:', tenant.subdomain);
      return { success: false, error: 'Google Ads not enabled' };
    }

    const clientId = decryptValue(tenant.googleAdsClientIdEncrypted);
    const clientSecret = decryptValue(tenant.googleAdsClientSecretEncrypted);
    const refreshToken = decryptValue(tenant.googleAdsRefreshTokenEncrypted);
    const customerId = tenant.googleAdsCustomerId;
    const developerToken = tenant.googleAdsDeveloperToken;
    const conversionActionId = tenant.googleAdsConversionActionId;

    if (!clientId || !clientSecret || !refreshToken || !customerId || !developerToken || !conversionActionId) {
      console.error('Missing Google Ads credentials for tenant:', tenant.subdomain);
      return { success: false, error: 'Missing Google Ads credentials' };
    }

    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const customer = client.Customer({
      customer_id: customerId.replace(/-/g, ''),
      refresh_token: refreshToken,
    });

    const conversionDateTime = new Date().toISOString().replace('T', ' ').slice(0, 19) + '+00:00';

    const clickConversion = {
      gclid: gclid,
      conversion_action: `customers/${customerId.replace(/-/g, '')}/conversionActions/${conversionActionId}`,
      conversion_date_time: conversionDateTime,
      conversion_value: 1.0,
      currency_code: 'USD',
    };

    const result = await customer.conversionUploads.uploadClickConversions([
      clickConversion,
    ]);

    if (result.partial_failure_error) {
      console.error('Google Ads Partial Error:', result.partial_failure_error);
      return { success: false, error: result.partial_failure_error.message || 'Partial failure' };
    }

    await db
      .update(applications)
      .set({
        conversionSentToGoogle: true,
        conversionSentAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    console.log(`Successfully uploaded conversion for GCLID: ${gclid}`);
    return { success: true };

  } catch (error: any) {
    console.error('Failed to upload conversion to Google Ads:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

export async function getTenantGoogleAdsStatus(tenantId: string): Promise<{
  enabled: boolean;
  configured: boolean;
  customerId?: string;
  conversionActionId?: string;
}> {
  try {
    const [tenant] = await db
      .select({
        googleAdsEnabled: tenants.googleAdsEnabled,
        googleAdsCustomerId: tenants.googleAdsCustomerId,
        googleAdsClientIdEncrypted: tenants.googleAdsClientIdEncrypted,
        googleAdsRefreshTokenEncrypted: tenants.googleAdsRefreshTokenEncrypted,
        googleAdsConversionActionId: tenants.googleAdsConversionActionId,
        googleAdsDeveloperToken: tenants.googleAdsDeveloperToken,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return { enabled: false, configured: false };
    }

    const configured = !!(
      tenant.googleAdsClientIdEncrypted &&
      tenant.googleAdsRefreshTokenEncrypted &&
      tenant.googleAdsCustomerId &&
      tenant.googleAdsDeveloperToken &&
      tenant.googleAdsConversionActionId
    );

    return {
      enabled: tenant.googleAdsEnabled,
      configured,
      customerId: tenant.googleAdsCustomerId || undefined,
      conversionActionId: tenant.googleAdsConversionActionId || undefined,
    };
  } catch (error) {
    console.error('Error getting Google Ads status:', error);
    return { enabled: false, configured: false };
  }
}
