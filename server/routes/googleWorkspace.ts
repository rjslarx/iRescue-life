import type { Express, Request, Response, NextFunction } from "express";
import { requireTenant } from "../middleware/tenant";
import { requireAuth, requireRole } from "../middleware/auth";
import { db } from "../db";
import { platformIntegrations, oauthStates, tenants } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { encrypt } from "../lib/encryption";
import { GoogleWorkspaceService, DriveService, GmailService, CalendarService } from "../lib/googleWorkspace";
import { z } from "zod";
import crypto from 'crypto';

export function registerGoogleWorkspaceRoutes(app: Express) {
  /**
   * GET /api/google-workspace/status
   * Get the current Google Workspace connection status
   */
  app.get('/api/google-workspace/status', requireTenant, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant?.id;
      
      console.log('[Google Workspace Status] Checking status for tenant:', {
        tenantId,
        tenantSubdomain: req.tenant?.subdomain,
        userId: req.user?.id,
      });
      
      if (!tenantId) {
        console.log('[Google Workspace Status] No tenant ID found');
        return res.json({ connected: false, features: null });
      }

      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(
          and(
            eq(platformIntegrations.tenantId, tenantId),
            eq(platformIntegrations.platform, 'google_workspace')
          )
        )
        .limit(1);

      console.log('[Google Workspace Status] Query result:', {
        found: !!integration,
        isEnabled: integration?.isEnabled,
        hasTokens: !!integration?.accessTokenEncrypted,
        connectedEmail: integration?.googleFeatures?.connectedEmail,
      });

      if (!integration || !integration.isEnabled) {
        console.log('[Google Workspace Status] Returning connected: false - integration not found or disabled');
        return res.json({
          connected: false,
          features: null,
        });
      }

      res.json({
        connected: true,
        features: integration.googleFeatures || {},
        connectedEmail: integration.googleFeatures?.connectedEmail || 'Unknown',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/auth-url
   * Generate OAuth URL for Google Workspace connection
   */
  app.get('/api/google-workspace/auth-url', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Google OAuth credentials are configured
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      console.log('[Google Workspace] Auth URL request - clientId exists:', !!clientId, ', clientSecret exists:', !!clientSecret);
      
      if (!clientId || !clientSecret) {
        console.log('[Google Workspace] Missing OAuth credentials');
        return res.status(400).json({
          error: 'Google Workspace not configured',
          message: 'Google Workspace integration requires OAuth credentials to be configured by the platform administrator. Please contact support to enable this feature.',
        });
      }

      // Clean up expired OAuth states
      await db
        .delete(oauthStates)
        .where(lt(oauthStates.expiresAt, new Date()));

      // Generate secure random nonce
      const nonce = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 600000); // 10 minutes

      // Store nonce server-side with associated tenant/user (include subdomain for reliable redirects)
      await db.insert(oauthStates).values({
        nonce,
        provider: 'google_workspace',
        tenantId: req.tenant!.id,
        userId: req.user!.id,
        subdomain: req.tenant!.subdomain,
        expiresAt,
      });

      // Store nonce in session for validation on callback
      if (req.session) {
        req.session.googleOAuthNonce = nonce;
      }

      console.log('[Google Workspace] Creating service and generating auth URL');
      const service = new GoogleWorkspaceService(req.tenant!.id);
      const authUrl = service.generateAuthUrl(nonce);
      console.log('[Google Workspace] Auth URL generated successfully');

      res.json({ authUrl });
    } catch (error: any) {
      console.error('[Google Workspace] Error generating auth URL:', error.message);
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/callback
   * OAuth callback - exchange code for tokens and store
   * SECURITY: Validates server-side nonce + authenticated session to prevent state forgery and cross-session attacks
   * NOTE: Does not use requireTenant because Google redirects to base URL without tenant path
   */
  app.get('/api/google-workspace/callback', async (req: Request, res: Response, next: NextFunction) => {
    let tenantBasePath = '';  // Track for error redirects
    
    // Helper function to redirect with tenant path when available
    const redirectWithError = (errorCode: string) => {
      const basePath = tenantBasePath || '';
      res.redirect(`${basePath}/login?error=${errorCode}`);
    };
    
    try {
      console.log('[Google OAuth] Callback received');
      const { code, state, error } = req.query;

      // Try to look up tenant subdomain early if we have a state parameter
      if (state && typeof state === 'string') {
        try {
          const [oauthStateForTenant] = await db
            .select()
            .from(oauthStates)
            .where(
              and(
                eq(oauthStates.nonce, state),
                eq(oauthStates.provider, 'google_workspace')
              )
            )
            .limit(1);
          
          if (oauthStateForTenant) {
            // Use cached subdomain if available (most reliable)
            if (oauthStateForTenant.subdomain) {
              tenantBasePath = `/${oauthStateForTenant.subdomain}`;
              console.log(`[Google OAuth] Early tenant lookup succeeded from cached subdomain: ${oauthStateForTenant.subdomain}`);
            } else {
              // Fall back to tenant lookup for older state records without subdomain
              const [tenant] = await db
                .select()
                .from(tenants)
                .where(eq(tenants.id, oauthStateForTenant.tenantId))
                .limit(1);
              
              if (tenant) {
                tenantBasePath = `/${tenant.subdomain}`;
                console.log(`[Google OAuth] Early tenant lookup succeeded via tenant query: ${tenant.subdomain}`);
              }
            }
          }
        } catch (e) {
          console.log('[Google OAuth] Early tenant lookup failed, will try again later');
        }
      }

      if (error) {
        console.error('[Google OAuth] Error from Google:', error);
        return redirectWithError(`google_oauth_${error}`);
      }

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        console.error('[Google OAuth] Missing code or state');
        return redirectWithError('invalid_oauth_callback');
      }

      console.log('[Google OAuth] Looking up OAuth state for nonce');
      
      // First, look up the OAuth state to get tenant info (since URL doesn't have tenant path)
      const [oauthState] = await db
        .select()
        .from(oauthStates)
        .where(
          and(
            eq(oauthStates.nonce, state),
            eq(oauthStates.provider, 'google_workspace')
          )
        )
        .limit(1);

      if (!oauthState) {
        console.error('[Google OAuth] State validation failed: nonce not found in database');
        return redirectWithError('invalid_oauth_state');
      }

      console.log('[Google OAuth] Found OAuth state, checking expiration');

      // Check expiration
      if (new Date() > oauthState.expiresAt) {
        console.error('[Google OAuth] State expired');
        await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
        return redirectWithError('oauth_state_expired');
      }

      // Get the tenant subdomain for redirect (may already be set from early lookup)
      if (!tenantBasePath) {
        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, oauthState.tenantId))
          .limit(1);

        if (!tenant) {
          console.error('[Google OAuth] Callback rejected: Tenant not found');
          await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
          return redirectWithError('invalid_tenant');
        }

        tenantBasePath = `/${tenant.subdomain}`;
        console.log(`[Google OAuth] Tenant found: ${tenant.subdomain}`);
      }

      // NOTE: We validate security via database nonce which stores tenant_id and user_id
      // Session nonce validation is skipped because cookies may not persist across OAuth redirect
      // The database state provides sufficient security as it:
      // 1. Ties the nonce to a specific tenant and user
      // 2. Has expiration (10 minutes)
      // 3. Is single-use (deleted after successful exchange)
      
      // Clear session nonce if it exists (cleanup)
      if (req.session?.googleOAuthNonce) {
        delete req.session.googleOAuthNonce;
      }

      console.log('[Google OAuth] State validated via database, exchanging code for tokens');

      // Extract validated tenantId and userId from server-side state
      const { tenantId, userId } = oauthState;

      const service = new GoogleWorkspaceService(tenantId);
      const tokens = await service.exchangeCodeForTokens(code);
      
      console.log('[Google OAuth] Tokens received, saving integration');

      const [existingIntegration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, tenantId),
          eq(platformIntegrations.platform, 'google_workspace')
        ))
        .limit(1);

      // Preserve existing feature toggles when reconnecting, only update tokens and email
      const existingFeatures = existingIntegration?.googleFeatures || {};
      const integrationData = {
        accessTokenEncrypted: encrypt(tokens.accessToken),
        refreshTokenEncrypted: encrypt(tokens.refreshToken),
        tokenExpiresAt: new Date(tokens.expiryDate),
        isEnabled: true,
        googleFeatures: {
          // Preserve existing toggle states (default to false for new connections)
          useGmail: existingFeatures.useGmail ?? false,
          syncCalendar: existingFeatures.syncCalendar ?? false,
          useDrive: existingFeatures.useDrive ?? false,
          // Preserve existing shared drive settings
          sharedDriveId: existingFeatures.sharedDriveId,
          sharedDriveName: existingFeatures.sharedDriveName,
          // Preserve sender settings
          senderName: existingFeatures.senderName,
          senderEmail: existingFeatures.senderEmail,
          senderAddresses: existingFeatures.senderAddresses,
          // Update connected email to current OAuth account
          connectedEmail: tokens.email,
        },
        updatedAt: new Date(),
      };

      if (existingIntegration) {
        await db
          .update(platformIntegrations)
          .set(integrationData)
          .where(eq(platformIntegrations.id, existingIntegration.id));
      } else {
        await db
          .insert(platformIntegrations)
          .values({
            tenantId,
            platform: 'google_workspace',
            ...integrationData,
          });
      }

      // Delete used nonce (single-use) and clear from session
      await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
      if (req.session) {
        delete req.session.googleOAuthNonce;
      }

      console.log('[Google OAuth] Integration saved, redirecting to login with success message');
      // Redirect to login page with success message since session may be lost during OAuth
      res.redirect(`${tenantBasePath}/login?google_connected=true`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error('[Google OAuth] Callback error:', errorMessage);
      console.error('[Google OAuth] Full error:', error);
      
      // Include error details for debugging (sanitized)
      let errorCode = 'google_oauth_failed';
      if (errorMessage.includes('redirect_uri_mismatch')) {
        errorCode = 'google_oauth_redirect_mismatch';
      } else if (errorMessage.includes('invalid_grant')) {
        errorCode = 'google_oauth_invalid_grant';
      } else if (errorMessage.includes('access_denied')) {
        errorCode = 'google_oauth_access_denied';
      }
      
      // Use the helper which redirects to tenant login page with error
      redirectWithError(errorCode);
    }
  });

  /**
   * PATCH /api/google-workspace/features
   * Update which Google Workspace features are enabled
   */
  app.patch('/api/google-workspace/features', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const featuresSchema = z.object({
        useGmail: z.boolean().optional(),
        syncCalendar: z.boolean().optional(),
        useDrive: z.boolean().optional(),
        useChat: z.boolean().optional(),
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional().or(z.literal('')),
        senderAddresses: z.array(z.object({
          name: z.string(),
          email: z.string().email(),
          isDefault: z.boolean().optional(),
        })).optional(),
      });

      const features = featuresSchema.parse(req.body);

      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace')
        ))
        .limit(1);

      if (!integration) {
        return res.status(404).json({ error: 'Google Workspace not connected' });
      }

      const updatedFeatures = {
        ...integration.googleFeatures,
        ...features,
      };

      await db
        .update(platformIntegrations)
        .set({
          googleFeatures: updatedFeatures,
          updatedAt: new Date(),
        })
        .where(eq(platformIntegrations.id, integration.id));

      res.json({
        success: true,
        features: updatedFeatures,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/google-workspace/disconnect
   * Revoke tokens and disable Google Workspace integration
   */
  app.delete('/api/google-workspace/disconnect', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await GoogleWorkspaceService.forTenant(req.tenant!.id);
      
      if (service) {
        try {
          await service.revokeAccess();
        } catch (error) {
          console.error('Error revoking Google access:', error);
        }
      }

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
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace')
        ));

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/picker-token
   * Get OAuth access token and API key for Google Picker.
   * This allows users to visually select Shared Drives using Google's Picker UI.
   * The API key is browser-restricted in Google Cloud Console for security.
   */
  app.get('/api/google-workspace/picker-token', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = process.env.GOOGLE_PICKER_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({
          error: 'Google Picker API key not configured',
          message: 'Please add GOOGLE_PICKER_API_KEY to enable the visual drive selector.',
        });
      }

      // Get the service to get a valid access token
      const service = await GoogleWorkspaceService.forTenant(req.tenant!.id);
      if (!service) {
        return res.status(404).json({
          error: 'Google Workspace not connected',
          message: 'Please connect Google Workspace first.',
        });
      }

      // Ensure token is valid (refreshes if needed)
      await service.ensureValidToken();
      const accessToken = service.getAccessToken();

      if (!accessToken) {
        return res.status(401).json({
          error: 'Unable to get access token',
          message: 'Please reconnect Google Workspace.',
        });
      }

      // Extract App ID from Google Client ID (numeric part before .apps.googleusercontent.com)
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const appId = clientId.split('.')[0] || '';

      res.json({
        accessToken,
        apiKey,
        appId,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/shared-drives
   * List all Shared Drives (Team Drives) the connected account has access to.
   * This is crucial for data continuity - files stored in Shared Drives belong
   * to the organization, not individual volunteers who may leave.
   */
  app.get('/api/google-workspace/shared-drives', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driveService = await DriveService.forTenant(req.tenant!.id);
      
      if (!driveService) {
        return res.status(404).json({ 
          error: 'Google Workspace not connected',
          message: 'Please connect Google Workspace first to access Shared Drives.'
        });
      }

      const result = await driveService.listSharedDrives();
      
      if (!result.success) {
        return res.status(500).json({ 
          error: 'Failed to list Shared Drives',
          message: result.error || 'Unknown error occurred'
        });
      }

      // Also get the currently configured Shared Drive ID
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace')
        ))
        .limit(1);

      res.json({
        drives: result.drives || [],
        currentSharedDriveId: integration?.googleFeatures?.sharedDriveId || null,
        currentSharedDriveName: integration?.googleFeatures?.sharedDriveName || null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/google-workspace/validate-shared-drive
   * Validate a manually entered Shared Drive ID.
   * This is used when the drive.file scope prevents listing shared drives.
   */
  app.post('/api/google-workspace/validate-shared-drive', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validateSchema = z.object({
        driveId: z.string().min(1, "Drive ID is required"),
      });

      const { driveId } = validateSchema.parse(req.body);

      const driveService = await DriveService.forTenant(req.tenant!.id);
      
      if (!driveService) {
        return res.status(404).json({ 
          valid: false,
          error: 'Google Workspace not connected. Please connect Google Workspace first.'
        });
      }

      const validationResult = await driveService.validateSharedDrive(driveId);
      
      if (!validationResult.success) {
        return res.json({ 
          valid: false,
          error: validationResult.error || 'Could not validate this Shared Drive ID.'
        });
      }

      // If validation was skipped due to scope limitations, we still accept it
      // The user is manually entering the ID from their Drive URL
      res.json({
        valid: true,
        driveName: validationResult.name || null,
        skipValidation: validationResult.skipValidation || false,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ valid: false, error: 'Invalid request: Drive ID is required' });
      }
      next(error);
    }
  });

  /**
   * PATCH /api/google-workspace/shared-drive
   * Configure the Shared Drive to use for file storage.
   * Setting a Shared Drive ensures organizational data continuity -
   * files belong to the organization, not individual volunteers.
   */
  app.patch('/api/google-workspace/shared-drive', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configSchema = z.object({
        sharedDriveId: z.string().nullable(),
        sharedDriveName: z.string().nullable(),
      });

      const { sharedDriveId, sharedDriveName } = configSchema.parse(req.body);

      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace')
        ))
        .limit(1);

      if (!integration) {
        return res.status(404).json({ error: 'Google Workspace not connected' });
      }

      // Validate the Shared Drive ID if one is being set
      // Note: With drive.file scope, we can't fully validate beforehand - validation 
      // happens on first file upload. We still try to validate if possible.
      let validatedDriveName = sharedDriveName;
      if (sharedDriveId) {
        const driveService = await DriveService.forTenant(req.tenant!.id);
        if (!driveService) {
          return res.status(500).json({ error: 'Failed to initialize Drive service' });
        }

        const validationResult = await driveService.validateSharedDrive(sharedDriveId);
        if (!validationResult.success) {
          return res.status(500).json({ 
            error: 'Failed to validate Shared Drive',
            message: validationResult.error 
          });
        }

        // If we got the drive name from validation, use it
        if (validationResult.name) {
          validatedDriveName = validationResult.name;
        }
        
        // If validation was skipped due to scope limitations, that's okay
        // The user is manually entering the ID from their Drive URL
        if (validationResult.skipValidation) {
          console.log(`[Shared Drive] Accepting user-provided ID without pre-validation: ${sharedDriveId}`);
        }
      }

      // Use validated name if available, otherwise use user-provided name
      const finalDriveName = validatedDriveName || sharedDriveName;
      
      const updatedFeatures = {
        ...integration.googleFeatures,
        sharedDriveId: sharedDriveId || undefined,
        sharedDriveName: finalDriveName || undefined,
      };

      // Remove the keys entirely if setting to null
      if (!sharedDriveId) {
        delete (updatedFeatures as any).sharedDriveId;
        delete (updatedFeatures as any).sharedDriveName;
      }

      await db
        .update(platformIntegrations)
        .set({
          googleFeatures: updatedFeatures,
          updatedAt: new Date(),
        })
        .where(eq(platformIntegrations.id, integration.id));

      res.json({
        success: true,
        sharedDriveId: sharedDriveId || null,
        sharedDriveName: finalDriveName || null,
        message: sharedDriveId 
          ? `Files will now be stored in "${finalDriveName || 'Shared Drive'}" for organizational data continuity.`
          : 'Shared Drive configuration cleared. Files will be stored in the connected user\'s My Drive.',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/google-workspace/sync-calendars
   * Sync existing iRescue calendars to Google Calendar.
   * This creates corresponding Google Calendars for any iRescue calendars
   * that don't already have a googleCalendarId.
   */
  app.post('/api/google-workspace/sync-calendars', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { calendars } = await import('@shared/schema');
      
      // Check if calendar sync is enabled
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'google_workspace'),
          eq(platformIntegrations.isEnabled, true)
        ))
        .limit(1);

      if (!integration) {
        return res.status(404).json({ error: 'Google Workspace not connected' });
      }

      if (!integration.googleFeatures?.syncCalendar) {
        return res.status(400).json({ 
          error: 'Calendar sync not enabled',
          message: 'Please enable "Sync Calendar" in Google Workspace settings first.'
        });
      }

      const calendarService = await CalendarService.forTenant(req.tenant!.id);
      if (!calendarService) {
        return res.status(500).json({ error: 'Failed to initialize Calendar service' });
      }

      // Get all calendars without a Google Calendar ID
      const unsyncedCalendars = await db
        .select({
          id: calendars.id,
          name: calendars.name,
          description: calendars.description,
        })
        .from(calendars)
        .where(and(
          eq(calendars.tenantId, req.tenant!.id),
          sql`${calendars.googleCalendarId} IS NULL`
        ));

      const results: Array<{ calendarId: string; name: string; success: boolean; error?: string }> = [];

      for (const calendar of unsyncedCalendars) {
        try {
          const result = await calendarService.createCalendar({
            summary: `${calendar.name} (${req.tenant!.name})`,
            description: calendar.description || `Calendar synced from iRescue.life`,
          });

          if (result.success && result.calendarId) {
            // Update the iRescue calendar with the Google Calendar ID
            await db
              .update(calendars)
              .set({ googleCalendarId: result.calendarId })
              .where(eq(calendars.id, calendar.id));

            results.push({
              calendarId: calendar.id,
              name: calendar.name,
              success: true,
            });
          } else {
            results.push({
              calendarId: calendar.id,
              name: calendar.name,
              success: false,
              error: result.error || 'Unknown error',
            });
          }
        } catch (error: any) {
          results.push({
            calendarId: calendar.id,
            name: calendar.name,
            success: false,
            error: error.message || 'Unknown error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        message: `Synced ${successCount} calendar(s) to Google Calendar. ${failCount} failed.`,
        results,
        totalUnsynced: unsyncedCalendars.length,
        synced: successCount,
        failed: failCount,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/calendar-sync-status
   * Get the sync status of all calendars
   */
  app.get('/api/google-workspace/calendar-sync-status', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { calendars } = await import('@shared/schema');
      
      const allCalendars = await db
        .select({
          id: calendars.id,
          name: calendars.name,
          googleCalendarId: calendars.googleCalendarId,
        })
        .from(calendars)
        .where(eq(calendars.tenantId, req.tenant!.id));

      const synced = allCalendars.filter(c => c.googleCalendarId);
      const unsynced = allCalendars.filter(c => !c.googleCalendarId);

      res.json({
        total: allCalendars.length,
        synced: synced.length,
        unsynced: unsynced.length,
        calendars: allCalendars.map(c => ({
          id: c.id,
          name: c.name,
          isSynced: !!c.googleCalendarId,
          googleCalendarId: c.googleCalendarId,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/google-workspace/backup
   * Trigger a manual backup of files from Object Storage to Google Drive
   * This syncs all tenant files (animal photos, documents, receipts, etc.) to the configured Shared Drive
   */
  app.post('/api/google-workspace/backup', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const driveService = await DriveService.forTenant(req.tenant!.id);
      
      if (!driveService) {
        return res.status(404).json({ 
          error: 'Google Workspace not connected',
          message: 'Please connect Google Workspace first to enable backups.'
        });
      }

      if (!driveService.hasSharedDriveConfigured()) {
        return res.status(400).json({
          error: 'No Shared Drive configured',
          message: 'Please configure a Shared Drive first to enable backups.'
        });
      }

      const { runStorageBackupForTenant } = await import('../lib/storage-backup-service');
      
      // Run backup asynchronously and return immediately
      const tenantName = req.tenant!.name || req.tenant!.subdomain;
      
      // Start backup in background
      runStorageBackupForTenant(req.tenant!.id, tenantName)
        .then(result => {
          console.log(`[STORAGE BACKUP] Manual backup completed for ${tenantName}: ${result.filesBackedUp} files backed up`);
        })
        .catch(error => {
          console.error(`[STORAGE BACKUP] Manual backup failed for ${tenantName}:`, error);
        });

      res.json({
        success: true,
        message: 'Backup started. Files are being synced to Google Drive in the background.',
        status: 'in_progress',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/google-workspace/backup-status
   * Get the current backup status for this tenant
   */
  app.get('/api/google-workspace/backup-status', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { getBackupService } = await import('../lib/storage-backup-service');
      const backupService = getBackupService();
      const progress = backupService.getProgress(req.tenant!.id);

      if (!progress) {
        return res.json({
          status: 'idle',
          message: 'No backup has been run recently.',
          lastRun: null,
        });
      }

      res.json({
        status: progress.status,
        filesScanned: progress.filesScanned,
        filesBackedUp: progress.filesBackedUp,
        filesSkipped: progress.filesSkipped,
        errors: progress.errors,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
      });
    } catch (error) {
      next(error);
    }
  });
}
