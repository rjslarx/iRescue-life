import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import { decrypt, encrypt } from './encryption';
import { db } from '../db';
import { platformIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { EmailAttachment } from './email-service';

// Note: We use native raw MIME message construction instead of Nodemailer's MailComposer
// for better compatibility with gmail.send OAuth scope

// Determine the app URL for OAuth callbacks
const getAppUrl = (): string => {
  // For production deployments with custom domain
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    // Prefer non-replit domain for OAuth callback
    const customDomain = origins.find(o => !o.includes('replit'));
    if (customDomain) return customDomain;
  }
  
  // For Replit dev domain
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Legacy fallback for older Replit environments
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  return 'http://localhost:5000';
};

const APP_URL = getAppUrl();

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',  // Sensitive scope - send emails (no CASA required)
  'https://www.googleapis.com/auth/calendar',  // Full calendar access - required to create secondary calendars
  // Note: conferenceData access is included with calendar scope
  // Just set conferenceDataVersion=1 in API requests to create Meet links
  'https://www.googleapis.com/auth/drive.file',  // Per-file access - allows creating/managing files our app uploads (non-sensitive)
  'https://www.googleapis.com/auth/userinfo.email',  // Non-sensitive
];

export class GoogleWorkspaceService {
  private oauth2Client: OAuth2Client;
  private tenantId: string;
  private integrationId?: string;

  constructor(tenantId: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    this.tenantId = tenantId;
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      `${APP_URL}/api/google-workspace/callback`
    );
  }

  static async forTenant(tenantId: string): Promise<GoogleWorkspaceService | null> {
    const [integration] = await db
      .select()
      .from(platformIntegrations)
      .where(and(
        eq(platformIntegrations.tenantId, tenantId),
        eq(platformIntegrations.platform, 'google_workspace'),
        eq(platformIntegrations.isEnabled, true)
      ))
      .limit(1);

    if (!integration) {
      return null;
    }

    const service = new GoogleWorkspaceService(tenantId);
    service.integrationId = integration.id;

    const accessToken = integration.accessTokenEncrypted ? decrypt(integration.accessTokenEncrypted) : null;
    const refreshToken = integration.refreshTokenEncrypted ? decrypt(integration.refreshTokenEncrypted) : null;

    if (accessToken && refreshToken) {
      service.oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: integration.tokenExpiresAt?.getTime(),
      });
    }

    return service;
  }

  generateAuthUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      state,
      prompt: 'consent',
    });
  }

  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
    email: string;
  }> {
    const { tokens } = await this.oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain tokens from Google');
    }

    this.oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
      email: data.email || '',
    };
  }

  async refreshAccessToken(): Promise<void> {
    console.log(`[GoogleWorkspace] Attempting to refresh access token for integration ${this.integrationId}`);
    
    if (!this.integrationId) {
      console.error(`[GoogleWorkspace] Cannot refresh token: Integration ID not set`);
      throw new Error('Integration ID not set');
    }

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token) {
        console.error(`[GoogleWorkspace] Token refresh returned no access token`);
        throw new Error('Failed to refresh access token');
      }

      console.log(`[GoogleWorkspace] ✅ Token refreshed successfully, new expiry: ${new Date(credentials.expiry_date || 0).toISOString()}`);

      await db
        .update(platformIntegrations)
        .set({
          accessTokenEncrypted: encrypt(credentials.access_token),
          tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(platformIntegrations.id, this.integrationId));

      this.oauth2Client.setCredentials(credentials);
    } catch (error: any) {
      console.error(`[GoogleWorkspace] ❌ Token refresh failed:`, error.message || error);
      if (error.response?.data) {
        console.error(`[GoogleWorkspace] Token refresh error details:`, JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  async ensureValidToken(): Promise<void> {
    const credentials = this.oauth2Client.credentials;
    
    if (!credentials.expiry_date) {
      console.log(`[GoogleWorkspace] No expiry_date set, skipping token refresh check`);
      return;
    }

    const now = Date.now();
    const expiresIn = credentials.expiry_date - now;
    
    if (now >= credentials.expiry_date - 60000) {
      console.log(`[GoogleWorkspace] Token expired or expiring soon (${Math.round(expiresIn / 1000)}s remaining), refreshing...`);
      await this.refreshAccessToken();
    } else {
      console.log(`[GoogleWorkspace] Token still valid (${Math.round(expiresIn / 1000)}s remaining)`);
    }
  }

  getOAuth2Client(): OAuth2Client {
    return this.oauth2Client;
  }

  getAccessToken(): string | null {
    return this.oauth2Client.credentials.access_token || null;
  }

  async revokeAccess(): Promise<void> {
    await this.oauth2Client.revokeCredentials();
    
    if (this.integrationId) {
      await db
        .update(platformIntegrations)
        .set({
          isEnabled: false,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenExpiresAt: null,
          googleFeatures: null,
          updatedAt: new Date(),
        })
        .where(eq(platformIntegrations.id, this.integrationId));
    }
  }
}

export class GmailService {
  private service: GoogleWorkspaceService;

  constructor(service: GoogleWorkspaceService) {
    this.service = service;
  }

  static async forTenant(tenantId: string): Promise<GmailService | null> {
    console.log(`[GmailService] forTenant called for: ${tenantId}`);
    const service = await GoogleWorkspaceService.forTenant(tenantId);
    if (!service) {
      console.log(`[GmailService] No GoogleWorkspaceService found for tenant: ${tenantId}`);
      return null;
    }
    console.log(`[GmailService] GoogleWorkspaceService found, creating GmailService`);
    return new GmailService(service);
  }

  /**
   * Build raw MIME message for Gmail API
   * Uses native string construction instead of Nodemailer for better compatibility with gmail.send scope
   */
  private makeRawMessage(options: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const plainText = options.text || this.htmlToPlainText(options.html);
    
    // Build RFC 2822 compliant MIME message with proper CRLF line endings
    let message = '';
    message += `From: ${options.from}\r\n`;
    message += `To: ${options.to}\r\n`;
    if (options.replyTo) {
      message += `Reply-To: ${options.replyTo}\r\n`;
    }
    message += `Subject: ${this.encodeSubject(options.subject)}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    message += `\r\n`;
    
    // Plain text part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n`;
    message += `Content-Transfer-Encoding: quoted-printable\r\n`;
    message += `\r\n`;
    message += `${this.encodeQuotedPrintable(plainText)}\r\n`;
    
    // HTML part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n`;
    message += `Content-Transfer-Encoding: quoted-printable\r\n`;
    message += `\r\n`;
    message += `${this.encodeQuotedPrintable(options.html)}\r\n`;
    
    // Close boundary
    message += `--${boundary}--\r\n`;
    
    return message;
  }
  
  /**
   * Encode subject line for proper handling of non-ASCII characters
   */
  private encodeSubject(subject: string): string {
    // Check if subject contains non-ASCII characters
    if (/[^\x00-\x7F]/.test(subject)) {
      const base64Subject = Buffer.from(subject, 'utf-8').toString('base64');
      return `=?UTF-8?B?${base64Subject}?=`;
    }
    return subject;
  }
  
  /**
   * Encode content as quoted-printable for proper email transmission
   */
  private encodeQuotedPrintable(str: string): string {
    return str
      .replace(/[^\x20-\x7E\r\n\t]/g, (char) => {
        const code = char.charCodeAt(0);
        if (code < 256) {
          return '=' + code.toString(16).toUpperCase().padStart(2, '0');
        }
        // For multi-byte UTF-8 characters
        const bytes = Buffer.from(char, 'utf-8');
        return Array.from(bytes).map(b => '=' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
      })
      .replace(/=$/gm, '=3D'); // Escape trailing equals
  }
  
  /**
   * Base64URL encode for Gmail API (RFC 4648 section 5)
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async sendEmail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`[GmailService] sendEmail called with to=${Array.isArray(options.to) ? options.to.join(',') : options.to}, from=${options.from}, subject=${options.subject}`);
      
      await this.service.ensureValidToken();
      console.log(`[GmailService] Token validated successfully`);

      const gmail = google.gmail({ version: 'v1', auth: this.service.getOAuth2Client() });

      const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      const fromAddress = options.from || 'me';
      
      console.log(`[GmailService] Building raw MIME message for recipients: ${recipients}, from: ${fromAddress}`);
      
      // Build raw MIME message using native string construction
      // This is more compatible with gmail.send scope than Nodemailer
      const rawMessage = this.makeRawMessage({
        to: recipients,
        from: fromAddress,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });
      
      // Base64URL encode the message (Gmail API requirement)
      const encodedMessage = this.base64UrlEncode(rawMessage);
      
      console.log(`[GmailService] Sending email via Gmail API...`);

      // Send via Gmail API - this automatically adds message to Sent folder
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log(`[GmailService] ✅ Email sent successfully, messageId: ${response.data.id}`);

      return {
        success: true,
        messageId: response.data.id || undefined,
      };
    } catch (error: any) {
      console.error(`[GmailService] ❌ Send error:`, error.message || error);
      if (error.response?.data) {
        console.error(`[GmailService] API error details:`, JSON.stringify(error.response.data));
      }
      return {
        success: false,
        error: error.message || 'Failed to send email via Gmail',
      };
    }
  }
  
  /**
   * Convert HTML to plain text for multipart email
   */
  private htmlToPlainText(html: string): string {
    let text = html;
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    return text.trim();
  }
}

export class CalendarService {
  private service: GoogleWorkspaceService;

  constructor(service: GoogleWorkspaceService) {
    this.service = service;
  }

  static async forTenant(tenantId: string): Promise<CalendarService | null> {
    const service = await GoogleWorkspaceService.forTenant(tenantId);
    if (!service) {
      return null;
    }
    return new CalendarService(service);
  }

  async createEvent(eventData: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    includeMeetLink?: boolean;
  }): Promise<{ success: boolean; eventId?: string; meetLink?: string; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      const event: any = {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: eventData.end.toISOString(),
          timeZone: 'America/New_York',
        },
        attendees: eventData.attendees?.map(email => ({ email })),
      };

      // Add Google Meet conference if requested
      if (eventData.includeMeetLink) {
        event.conferenceData = {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        };
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: eventData.includeMeetLink ? 1 : 0,
        requestBody: event,
      });

      const meetLink = response.data.conferenceData?.entryPoints?.find(
        (entry: any) => entry.entryPointType === 'video'
      )?.uri;

      return {
        success: true,
        eventId: response.data.id,
        meetLink,
      };
    } catch (error: any) {
      console.error('Calendar create event error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create calendar event',
      };
    }
  }

  /**
   * Update an existing Google Calendar event
   */
  async updateEvent(calendarId: string, eventId: string, eventData: {
    summary?: string;
    description?: string;
    start?: Date;
    end?: Date;
    attendees?: string[];
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      const event: any = {};
      
      if (eventData.summary !== undefined) event.summary = eventData.summary;
      if (eventData.description !== undefined) event.description = eventData.description;
      if (eventData.start) {
        event.start = {
          dateTime: eventData.start.toISOString(),
          timeZone: 'America/New_York',
        };
      }
      if (eventData.end) {
        event.end = {
          dateTime: eventData.end.toISOString(),
          timeZone: 'America/New_York',
        };
      }
      if (eventData.attendees) {
        event.attendees = eventData.attendees.map(email => ({ email }));
      }

      await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: event,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Calendar update event error:', error);
      return {
        success: false,
        error: error.message || 'Failed to update calendar event',
      };
    }
  }

  /**
   * Delete a Google Calendar event
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      await calendar.events.delete({
        calendarId,
        eventId,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Calendar delete event error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete calendar event',
      };
    }
  }

  /**
   * Create a new Google Calendar (the calendar itself, not an event)
   * This creates a secondary calendar in the tenant's Google Calendar account
   */
  async createCalendar(calendarData: {
    summary: string;
    description?: string;
    color?: string;
  }): Promise<{ success: boolean; calendarId?: string; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      const response = await calendar.calendars.insert({
        requestBody: {
          summary: calendarData.summary,
          description: calendarData.description || `Synced from iRescue.life`,
          timeZone: 'America/New_York',
        },
      });

      console.log(`Successfully created Google Calendar: ${response.data.id} for "${calendarData.summary}"`);
      return {
        success: true,
        calendarId: response.data.id || undefined,
      };
    } catch (error: any) {
      // Extract detailed error information from Google API errors
      const errorMessage = error.response?.data?.error?.message 
        || error.errors?.[0]?.message 
        || error.message 
        || 'Failed to create Google Calendar';
      const errorCode = error.response?.status || error.code || 'unknown';
      
      console.error('Calendar create error:', {
        message: errorMessage,
        code: errorCode,
        calendarSummary: calendarData.summary,
        fullError: JSON.stringify(error.response?.data || error.message, null, 2),
      });
      
      // Check for common issues
      if (errorCode === 403 || errorMessage.includes('insufficient')) {
        return {
          success: false,
          error: 'Insufficient permissions. Please disconnect and reconnect Google Workspace to grant calendar access.',
        };
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update an existing Google Calendar (the calendar itself, not an event)
   */
  async updateCalendar(calendarId: string, calendarData: {
    summary?: string;
    description?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      await calendar.calendars.patch({
        calendarId,
        requestBody: {
          summary: calendarData.summary,
          description: calendarData.description,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error('Calendar update error:', error);
      return {
        success: false,
        error: error.message || 'Failed to update Google Calendar',
      };
    }
  }

  /**
   * Delete a Google Calendar (the calendar itself, not an event)
   */
  async deleteCalendar(calendarId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      await calendar.calendars.delete({
        calendarId,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Calendar delete error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete Google Calendar',
      };
    }
  }

  /**
   * Create an event in a specific Google Calendar
   */
  async createEventInCalendar(googleCalendarId: string, eventData: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    includeMeetLink?: boolean;
  }): Promise<{ success: boolean; eventId?: string; meetLink?: string; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const calendar = google.calendar({ version: 'v3', auth: this.service.getOAuth2Client() });

      const event: any = {
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: eventData.end.toISOString(),
          timeZone: 'America/New_York',
        },
        attendees: eventData.attendees?.map(email => ({ email })),
      };

      // Add Google Meet conference if requested
      if (eventData.includeMeetLink) {
        event.conferenceData = {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        };
      }

      const response = await calendar.events.insert({
        calendarId: googleCalendarId,
        conferenceDataVersion: eventData.includeMeetLink ? 1 : 0,
        requestBody: event,
      });

      const meetLink = response.data.conferenceData?.entryPoints?.find(
        (entry: any) => entry.entryPointType === 'video'
      )?.uri;

      return {
        success: true,
        eventId: response.data.id || undefined,
        meetLink,
      };
    } catch (error: any) {
      console.error('Calendar create event in calendar error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create calendar event',
      };
    }
  }
}

export class DriveService {
  private service: GoogleWorkspaceService;
  private tenantId: string;
  private sharedDriveId?: string;

  constructor(service: GoogleWorkspaceService, tenantId: string, sharedDriveId?: string) {
    this.service = service;
    this.tenantId = tenantId;
    this.sharedDriveId = sharedDriveId;
  }

  static async forTenant(tenantId: string): Promise<DriveService | null> {
    const service = await GoogleWorkspaceService.forTenant(tenantId);
    if (!service) {
      return null;
    }

    // Get the configured Shared Drive ID from the integration settings
    const [integration] = await db
      .select()
      .from(platformIntegrations)
      .where(and(
        eq(platformIntegrations.tenantId, tenantId),
        eq(platformIntegrations.platform, 'google_workspace')
      ))
      .limit(1);

    const sharedDriveId = integration?.googleFeatures?.sharedDriveId;
    return new DriveService(service, tenantId, sharedDriveId);
  }

  /**
   * List all Shared Drives (Team Drives) the connected account has access to.
   * Returns drives where the organization can store files that belong to
   * the organization, not individual volunteers.
   * 
   * NOTE: This method requires the full 'drive' scope. With 'drive.file' scope,
   * this will fail and return an empty list. In that case, users should manually
   * enter their Shared Drive ID in the settings UI.
   */
  async listSharedDrives(): Promise<{ 
    success: boolean; 
    drives?: Array<{ id: string; name: string }>; 
    error?: string 
  }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const response = await drive.drives.list({
        pageSize: 100,
        fields: 'drives(id, name)',
      });

      const drives = response.data.drives?.map(d => ({
        id: d.id || '',
        name: d.name || 'Unnamed Drive',
      })) || [];

      return {
        success: true,
        drives,
      };
    } catch (error: any) {
      // With drive.file scope, this will fail - this is expected
      // Users should manually enter their Shared Drive ID instead
      console.log('Drive list shared drives not available (expected with drive.file scope):', error.message);
      return {
        success: true,
        drives: [],
      };
    }
  }

  /**
   * Validate a Shared Drive ID by attempting to access it directly.
   * With drive.file scope, we cannot list drives, so we try to get drive metadata.
   * If that fails, we try to create a temporary test file to verify write access.
   * 
   * Note: With drive.file scope, even drives.get may fail. In that case, we trust
   * the user-provided ID and validation will happen on first file upload.
   */
  async validateSharedDrive(driveId: string): Promise<{
    success: boolean;
    name?: string;
    error?: string;
    skipValidation?: boolean;
  }> {
    try {
      await this.service.ensureValidToken();
      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      // First try to get the drive metadata directly
      try {
        const driveInfo = await drive.drives.get({
          driveId: driveId,
          fields: 'id, name',
        });
        
        if (driveInfo.data.id === driveId) {
          return {
            success: true,
            name: driveInfo.data.name || 'Shared Drive',
          };
        }
      } catch (getError: any) {
        // drives.get requires the 'drive' scope, not just 'drive.file'
        // This is expected to fail with CASA-optimized scopes
        console.log('[Drive] drives.get not available with drive.file scope:', getError.message);
      }

      // With drive.file scope, we can't verify the drive exists beforehand
      // The validation will happen naturally on the first file upload attempt
      // We'll trust the user-provided ID and let them know
      console.log(`[Drive] Skipping validation for Shared Drive ${driveId} (drive.file scope limitation)`);
      return {
        success: true,
        skipValidation: true,
      };
    } catch (error: any) {
      console.error('[Drive] Error validating Shared Drive:', error);
      return {
        success: false,
        error: error.message || 'Failed to validate Shared Drive',
      };
    }
  }

  /**
   * Upload a file to Google Drive. If a Shared Drive is configured for the tenant,
   * the file will be uploaded there to ensure organizational data continuity.
   * Otherwise, falls back to the connected user's My Drive.
   * 
   * @param visibility - 'public' sets anyoneWithLink viewer access; 'private' keeps default Drive permissions
   */
  async uploadFile(fileData: {
    name: string;
    mimeType: string;
    content: Buffer | string;
    folderId?: string;
    visibility?: 'public' | 'private';
  }): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const fileMetadata: any = {
        name: fileData.name,
      };

      // Determine where to upload: specified folder > Shared Drive root > My Drive
      if (fileData.folderId) {
        fileMetadata.parents = [fileData.folderId];
      } else if (this.sharedDriveId) {
        // Upload to the root of the configured Shared Drive
        fileMetadata.parents = [this.sharedDriveId];
      }

      // Convert content to Buffer then to Readable stream for Google Drive API
      const contentBuffer = typeof fileData.content === 'string' 
        ? Buffer.from(fileData.content) 
        : fileData.content;
      
      console.log(`[DRIVE UPLOAD] Starting upload: name=${fileData.name}, mimeType=${fileData.mimeType}, size=${contentBuffer.length} bytes, folderId=${fileData.folderId || 'none'}, sharedDriveId=${this.sharedDriveId || 'none'}`);
      
      const media = {
        mimeType: fileData.mimeType,
        body: Readable.from(contentBuffer),
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink, size',
        // CRITICAL: Enable Shared Drive support for all operations
        supportsAllDrives: true,
      });

      console.log(`[DRIVE UPLOAD] Upload complete: fileId=${response.data.id}, webViewLink=${response.data.webViewLink}, size=${response.data.size}`);

      const fileId = response.data.id;

      // Set permissions based on visibility
      if (fileId && fileData.visibility === 'public') {
        try {
          await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          });
        } catch (permError: any) {
          console.warn('Failed to set public permission on Drive file:', permError.message);
          // Continue - file is uploaded but may not be public
        }
      }

      return {
        success: true,
        fileId: fileId || undefined,
        webViewLink: response.data.webViewLink || undefined,
      };
    } catch (error: any) {
      console.error('Drive upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload file to Drive',
      };
    }
  }

  /**
   * Create a folder in Google Drive. Uses Shared Drive if configured.
   */
  async createFolder(folderData: {
    name: string;
    parentId?: string;
  }): Promise<{ success: boolean; folderId?: string; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const fileMetadata: any = {
        name: folderData.name,
        mimeType: 'application/vnd.google-apps.folder',
      };

      // Determine parent: specified parent > Shared Drive root > My Drive root
      if (folderData.parentId) {
        fileMetadata.parents = [folderData.parentId];
      } else if (this.sharedDriveId) {
        fileMetadata.parents = [this.sharedDriveId];
      }

      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
        supportsAllDrives: true,
      });

      return {
        success: true,
        folderId: response.data.id || undefined,
      };
    } catch (error: any) {
      console.error('Drive create folder error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create folder in Drive',
      };
    }
  }

  /**
   * List files in a folder (or root). Supports Shared Drives.
   */
  async listFiles(options?: {
    folderId?: string;
    mimeType?: string;
    pageSize?: number;
  }): Promise<{ 
    success: boolean; 
    files?: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }>;
    error?: string 
  }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      // Build query
      const queryParts: string[] = ['trashed = false'];
      
      if (options?.folderId) {
        queryParts.push(`'${options.folderId}' in parents`);
      } else if (this.sharedDriveId) {
        queryParts.push(`'${this.sharedDriveId}' in parents`);
      }

      if (options?.mimeType) {
        queryParts.push(`mimeType = '${options.mimeType}'`);
      }

      const response = await drive.files.list({
        q: queryParts.join(' and '),
        pageSize: options?.pageSize || 100,
        fields: 'files(id, name, mimeType, webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(this.sharedDriveId ? {
          corpora: 'drive',
          driveId: this.sharedDriveId,
        } : {}),
      });

      const files = response.data.files?.map(f => ({
        id: f.id || '',
        name: f.name || '',
        mimeType: f.mimeType || '',
        webViewLink: f.webViewLink || undefined,
      })) || [];

      return {
        success: true,
        files,
      };
    } catch (error: any) {
      console.error('Drive list files error:', error);
      return {
        success: false,
        error: error.message || 'Failed to list files',
      };
    }
  }

  /**
   * Find a folder by name in the Shared Drive or My Drive
   */
  async findFolder(folderName: string, parentId?: string): Promise<{
    success: boolean;
    folderId?: string;
    error?: string;
  }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const queryParts: string[] = [
        'trashed = false',
        `mimeType = 'application/vnd.google-apps.folder'`,
        `name = '${folderName.replace(/'/g, "\\'")}'`,
      ];

      if (parentId) {
        queryParts.push(`'${parentId}' in parents`);
      } else if (this.sharedDriveId) {
        queryParts.push(`'${this.sharedDriveId}' in parents`);
      }

      const response = await drive.files.list({
        q: queryParts.join(' and '),
        pageSize: 1,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(this.sharedDriveId ? {
          corpora: 'drive',
          driveId: this.sharedDriveId,
        } : {}),
      });

      const folder = response.data.files?.[0];
      if (folder?.id) {
        return {
          success: true,
          folderId: folder.id,
        };
      }

      return {
        success: false,
        error: 'Folder not found',
      };
    } catch (error: any) {
      console.error('Drive find folder error:', error);
      return {
        success: false,
        error: error.message || 'Failed to find folder',
      };
    }
  }

  /**
   * Find a folder by pattern match in the name (useful for finding folders with IDs like "Bella (ID_1042)")
   */
  async findFolderByPattern(pattern: string, parentId?: string): Promise<{
    success: boolean;
    folderId?: string;
    folderName?: string;
    error?: string;
  }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const queryParts: string[] = [
        'trashed = false',
        `mimeType = 'application/vnd.google-apps.folder'`,
        `name contains '${pattern.replace(/'/g, "\\'")}'`,
      ];

      if (parentId) {
        queryParts.push(`'${parentId}' in parents`);
      } else if (this.sharedDriveId) {
        queryParts.push(`'${this.sharedDriveId}' in parents`);
      }

      const response = await drive.files.list({
        q: queryParts.join(' and '),
        pageSize: 1,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(this.sharedDriveId ? {
          corpora: 'drive',
          driveId: this.sharedDriveId,
        } : {}),
      });

      const folder = response.data.files?.[0];
      if (folder?.id) {
        return {
          success: true,
          folderId: folder.id,
          folderName: folder.name || undefined,
        };
      }

      return {
        success: false,
        error: 'Folder not found',
      };
    } catch (error: any) {
      console.error('Drive find folder by pattern error:', error);
      return {
        success: false,
        error: error.message || 'Failed to find folder',
      };
    }
  }

  /**
   * Move a file or folder to a new parent folder
   */
  async moveFile(fileId: string, newParentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      const file = await drive.files.get({
        fileId,
        fields: 'parents',
        supportsAllDrives: true,
      });

      const previousParents = file.data.parents?.join(',') || '';

      await drive.files.update({
        fileId,
        addParents: newParentId,
        removeParents: previousParents,
        supportsAllDrives: true,
        fields: 'id, parents',
      });

      return { success: true };
    } catch (error: any) {
      console.error('Drive move file error:', error);
      return {
        success: false,
        error: error.message || 'Failed to move file',
      };
    }
  }

  /**
   * Delete a file from Google Drive
   */
  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.service.ensureValidToken();

      const drive = google.drive({ version: 'v3', auth: this.service.getOAuth2Client() });

      console.log(`[DriveService] Attempting to delete file: ${fileId}`);
      
      await drive.files.delete({
        fileId,
        supportsAllDrives: true,
      });

      console.log(`[DriveService] Successfully deleted file: ${fileId}`);
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message 
        || error.errors?.[0]?.message 
        || error.message 
        || 'Failed to delete file from Google Drive';
      const errorCode = error.response?.status || error.code || 'unknown';
      
      console.error('Drive delete file error:', {
        message: errorMessage,
        code: errorCode,
        fileId,
      });
      
      // 404 means file already doesn't exist, which is fine for deletion
      if (errorCode === 404) {
        console.log(`[DriveService] File ${fileId} not found (already deleted or doesn't exist)`);
        return { success: true };
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the currently configured Shared Drive ID for this tenant
   */
  getSharedDriveId(): string | undefined {
    return this.sharedDriveId;
  }

  /**
   * Check if a Shared Drive is configured for organizational data continuity
   */
  hasSharedDriveConfigured(): boolean {
    return !!this.sharedDriveId;
  }
}
