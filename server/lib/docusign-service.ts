import docusign from 'docusign-esign';
import { db } from '../db';
import { tenants, docusignEnvelopes, applications, animals } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt, encrypt } from './encryption';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache: Map<string, TokenCache> = new Map();

export async function isDocusignEnabled(tenantId: string): Promise<boolean> {
  const [tenant] = await db
    .select({
      docusignEnabled: tenants.docusignEnabled,
      docusignIntegrationKeyEncrypted: tenants.docusignIntegrationKeyEncrypted,
      docusignPrivateKeyEncrypted: tenants.docusignPrivateKeyEncrypted,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) return false;

  return (
    tenant.docusignEnabled &&
    !!tenant.docusignIntegrationKeyEncrypted &&
    !!tenant.docusignPrivateKeyEncrypted
  );
}

async function getDocusignCredentials(tenantId: string) {
  const [tenant] = await db
    .select({
      docusignIntegrationKeyEncrypted: tenants.docusignIntegrationKeyEncrypted,
      docusignUserIdEncrypted: tenants.docusignUserIdEncrypted,
      docusignAccountIdEncrypted: tenants.docusignAccountIdEncrypted,
      docusignPrivateKeyEncrypted: tenants.docusignPrivateKeyEncrypted,
      docusignEnvironment: tenants.docusignEnvironment,
      docusignEnabled: tenants.docusignEnabled,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant || !tenant.docusignEnabled) {
    throw new Error('DocuSign is not configured for this organization');
  }

  if (
    !tenant.docusignIntegrationKeyEncrypted ||
    !tenant.docusignUserIdEncrypted ||
    !tenant.docusignAccountIdEncrypted ||
    !tenant.docusignPrivateKeyEncrypted
  ) {
    throw new Error('DocuSign credentials are incomplete');
  }

  return {
    integrationKey: decrypt(tenant.docusignIntegrationKeyEncrypted),
    userId: decrypt(tenant.docusignUserIdEncrypted),
    accountId: decrypt(tenant.docusignAccountIdEncrypted),
    privateKey: decrypt(tenant.docusignPrivateKeyEncrypted),
    environment: tenant.docusignEnvironment || 'demo',
  };
}

function getBasePath(environment: string): string {
  return environment === 'production'
    ? 'https://na3.docusign.net/restapi'
    : 'https://demo.docusign.net/restapi';
}

function getOAuthBasePath(environment: string): string {
  return environment === 'production'
    ? 'account.docusign.com'
    : 'account-d.docusign.com';
}

async function getAccessToken(tenantId: string): Promise<string> {
  const cached = tokenCache.get(tenantId);
  const now = Date.now();

  if (cached && cached.expiresAt - now > 600000) {
    return cached.accessToken;
  }

  const credentials = await getDocusignCredentials(tenantId);
  const apiClient = new docusign.ApiClient();
  
  apiClient.setOAuthBasePath(getOAuthBasePath(credentials.environment));

  const jwtLifeSec = 3600;
  const scopes = ['signature', 'impersonation'];

  try {
    const tokenResponse = await apiClient.requestJWTUserToken(
      credentials.integrationKey,
      credentials.userId,
      scopes,
      Buffer.from(credentials.privateKey),
      jwtLifeSec
    );

    const accessToken = tokenResponse.body.access_token;
    const expiresIn = tokenResponse.body.expires_in || 3600;

    tokenCache.set(tenantId, {
      accessToken,
      expiresAt: now + expiresIn * 1000,
    });

    return accessToken;
  } catch (error: any) {
    console.error('DocuSign JWT token error:', error);
    
    if (error.response?.body?.error === 'consent_required') {
      throw new Error(
        'DocuSign consent required. Please grant consent for the application: ' +
        `https://${getOAuthBasePath(credentials.environment)}/oauth/auth?` +
        `response_type=code&scope=signature%20impersonation&` +
        `client_id=${credentials.integrationKey}&redirect_uri=https://www.docusign.com`
      );
    }
    
    throw new Error(`Failed to get DocuSign access token: ${error.message}`);
  }
}

export interface SendEnvelopeOptions {
  tenantId: string;
  applicationId: string;
  animalId: string;
  signerEmail: string;
  signerName: string;
  documentBase64: string;
  documentName: string;
  emailSubject: string;
  emailBody?: string;
  signHereTabs?: Array<{
    documentId: string;
    pageNumber: string;
    xPosition: string;
    yPosition: string;
  }>;
  dateSignedTabs?: Array<{
    documentId: string;
    pageNumber: string;
    xPosition: string;
    yPosition: string;
  }>;
  sentBy?: string;
  sentByName?: string;
  contractTemplateId?: string;
}

export async function sendEnvelope(options: SendEnvelopeOptions): Promise<{
  envelopeId: string;
  status: string;
}> {
  const credentials = await getDocusignCredentials(options.tenantId);
  const accessToken = await getAccessToken(options.tenantId);

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(getBasePath(credentials.environment));
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const document = new docusign.Document();
  document.documentBase64 = options.documentBase64;
  document.name = options.documentName;
  document.fileExtension = 'pdf';
  document.documentId = '1';

  const signHereTabs = options.signHereTabs?.map(tab => {
    const signHere = new docusign.SignHere();
    signHere.documentId = tab.documentId;
    signHere.pageNumber = tab.pageNumber;
    signHere.xPosition = tab.xPosition;
    signHere.yPosition = tab.yPosition;
    return signHere;
  }) || [{
    documentId: '1',
    pageNumber: '1',
    xPosition: '100',
    yPosition: '700',
  }];

  const dateSignedTabs = options.dateSignedTabs?.map(tab => {
    const dateSigned = new docusign.DateSigned();
    dateSigned.documentId = tab.documentId;
    dateSigned.pageNumber = tab.pageNumber;
    dateSigned.xPosition = tab.xPosition;
    dateSigned.yPosition = tab.yPosition;
    return dateSigned;
  });

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = signHereTabs;
  if (dateSignedTabs) {
    tabs.dateSignedTabs = dateSignedTabs;
  }

  const signer = new docusign.Signer();
  signer.email = options.signerEmail;
  signer.name = options.signerName;
  signer.recipientId = '1';
  signer.routingOrder = '1';
  signer.tabs = tabs;

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = options.emailSubject;
  if (options.emailBody) {
    envelopeDefinition.emailBlurb = options.emailBody;
  }
  envelopeDefinition.documents = [document];
  envelopeDefinition.recipients = recipients;
  envelopeDefinition.status = 'sent';

  try {
    const results = await envelopesApi.createEnvelope(credentials.accountId, {
      envelopeDefinition,
    });

    await db.insert(docusignEnvelopes).values({
      tenantId: options.tenantId,
      envelopeId: results.envelopeId!,
      applicationId: options.applicationId,
      animalId: options.animalId,
      signerEmail: options.signerEmail,
      signerName: options.signerName,
      status: 'sent',
      sentBy: options.sentBy,
      sentByName: options.sentByName,
      contractTemplateId: options.contractTemplateId,
    });

    return {
      envelopeId: results.envelopeId!,
      status: results.status!,
    };
  } catch (error: any) {
    console.error('DocuSign send envelope error:', error);
    throw new Error(`Failed to send envelope: ${error.message}`);
  }
}

export async function getEnvelopeStatus(
  tenantId: string,
  envelopeId: string
): Promise<{
  status: string;
  statusDateTime: string;
}> {
  const credentials = await getDocusignCredentials(tenantId);
  const accessToken = await getAccessToken(tenantId);

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(getBasePath(credentials.environment));
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const envelope = await envelopesApi.getEnvelope(credentials.accountId, envelopeId);

  return {
    status: envelope.status!,
    statusDateTime: envelope.statusChangedDateTime!,
  };
}

export async function downloadSignedDocument(
  tenantId: string,
  envelopeId: string
): Promise<Buffer> {
  const credentials = await getDocusignCredentials(tenantId);
  const accessToken = await getAccessToken(tenantId);

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(getBasePath(credentials.environment));
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const document = await envelopesApi.getDocument(
    credentials.accountId,
    envelopeId,
    'combined'
  );

  return Buffer.from(document as any, 'binary');
}

export async function handleWebhook(
  tenantId: string,
  envelopeId: string,
  status: string,
  statusDateTime: string
): Promise<void> {
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    completed: 'completed',
    declined: 'declined',
    voided: 'voided',
  };

  const mappedStatus = statusMap[status.toLowerCase()] || status.toLowerCase();

  const updates: Record<string, any> = {
    status: mappedStatus,
    updatedAt: new Date(),
  };

  if (mappedStatus === 'delivered') {
    updates.viewedAt = new Date(statusDateTime);
  } else if (mappedStatus === 'completed') {
    updates.signedAt = new Date(statusDateTime);
    updates.completedAt = new Date(statusDateTime);
  }

  await db
    .update(docusignEnvelopes)
    .set(updates)
    .where(
      and(
        eq(docusignEnvelopes.tenantId, tenantId),
        eq(docusignEnvelopes.envelopeId, envelopeId)
      )
    );

  if (mappedStatus === 'completed') {
    const [envelope] = await db
      .select()
      .from(docusignEnvelopes)
      .where(
        and(
          eq(docusignEnvelopes.tenantId, tenantId),
          eq(docusignEnvelopes.envelopeId, envelopeId)
        )
      );

    if (envelope) {
      await db
        .update(applications)
        .set({ status: 'adopted', updatedAt: new Date() })
        .where(eq(applications.id, envelope.applicationId));

      await db
        .update(animals)
        .set({ status: 'adopted', updatedAt: new Date() })
        .where(eq(animals.id, envelope.animalId));
    }
  }
}

export async function getEnvelopeByApplication(
  tenantId: string,
  applicationId: string
): Promise<typeof docusignEnvelopes.$inferSelect | null> {
  const [envelope] = await db
    .select()
    .from(docusignEnvelopes)
    .where(
      and(
        eq(docusignEnvelopes.tenantId, tenantId),
        eq(docusignEnvelopes.applicationId, applicationId)
      )
    );

  return envelope || null;
}

export async function listEnvelopes(
  tenantId: string,
  limit = 50
): Promise<Array<typeof docusignEnvelopes.$inferSelect>> {
  return db
    .select()
    .from(docusignEnvelopes)
    .where(eq(docusignEnvelopes.tenantId, tenantId))
    .orderBy(docusignEnvelopes.createdAt)
    .limit(limit);
}

export function clearTokenCache(tenantId: string): void {
  tokenCache.delete(tenantId);
}

/**
 * Get the DocuSign Connect Key for webhook signature verification
 */
export async function getConnectKey(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({
      docusignConnectKeyEncrypted: tenants.docusignConnectKeyEncrypted,
      docusignEnabled: tenants.docusignEnabled,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant || !tenant.docusignEnabled || !tenant.docusignConnectKeyEncrypted) {
    return null;
  }

  return decrypt(tenant.docusignConnectKeyEncrypted);
}

/**
 * Verify DocuSign Connect webhook signature using HMAC-SHA256
 * https://developers.docusign.com/platform/webhooks/connect/hmac/
 */
export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  tenantId: string
): Promise<boolean> {
  const crypto = await import('crypto');
  
  const connectKey = await getConnectKey(tenantId);
  if (!connectKey) {
    console.log('DocuSign webhook: Connect Key not configured for tenant', tenantId);
    return false;
  }

  // DocuSign uses HMAC-SHA256 with base64 encoding
  const hmac = crypto.createHmac('sha256', connectKey);
  const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');
  hmac.update(payloadStr);
  const expectedSignature = hmac.digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('DocuSign webhook signature verification error:', error);
    return false;
  }
}

/**
 * Verify webhook signature by looking up tenant from envelope first
 */
export async function verifyWebhookForEnvelope(
  envelopeId: string,
  payload: string | Buffer,
  signature: string | undefined
): Promise<{ valid: boolean; tenantId: string | null }> {
  // First, look up the tenant from the envelope
  const [envelope] = await db
    .select({ tenantId: docusignEnvelopes.tenantId })
    .from(docusignEnvelopes)
    .where(eq(docusignEnvelopes.envelopeId, envelopeId));

  if (!envelope) {
    return { valid: false, tenantId: null };
  }

  // Check if tenant has Connect Key configured - if not, accept webhook (legacy mode)
  const [tenant] = await db
    .select({
      docusignConnectKeyEncrypted: tenants.docusignConnectKeyEncrypted,
    })
    .from(tenants)
    .where(eq(tenants.id, envelope.tenantId));

  // If no Connect Key configured, allow webhook in legacy/testing mode
  // This is less secure but allows gradual migration
  if (!tenant?.docusignConnectKeyEncrypted) {
    console.warn('DocuSign webhook: Connect Key not configured for tenant', envelope.tenantId, '- accepting without verification (configure Connect Key for security)');
    return { valid: true, tenantId: envelope.tenantId };
  }

  // If signature not provided but Connect Key is configured, reject
  if (!signature) {
    console.error('DocuSign webhook: signature required but not provided');
    return { valid: false, tenantId: envelope.tenantId };
  }

  const isValid = await verifyWebhookSignature(payload, signature, envelope.tenantId);
  return { valid: isValid, tenantId: envelope.tenantId };
}
