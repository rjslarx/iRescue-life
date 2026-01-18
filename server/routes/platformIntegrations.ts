import type { Express, Request, Response, NextFunction } from "express";
import { requireTenant } from "../middleware/tenant";
import { requireAuth, requireRole } from "../middleware/auth";
import { db } from "../db";
import { platformIntegrations, animalPlatformSyncs, animals } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";
import { createPlatformClient, PetFinderClient } from "../lib/platformClients";
import { mapAnimalToPlatform } from "../lib/platformMappers";
import { z } from "zod";

/**
 * Register platform integration routes
 */
export function registerPlatformIntegrationRoutes(app: Express) {
  /**
   * GET /api/platform-integrations
   * Get all platform integrations for tenant
   */
  app.get('/api/platform-integrations', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const integrations = await db
        .select()
        .from(platformIntegrations)
        .where(eq(platformIntegrations.tenantId, req.tenant!.id));

      // Mask sensitive data
      const maskedIntegrations = integrations.map(integration => ({
        ...integration,
        clientIdEncrypted: integration.clientIdEncrypted ? '***' : null,
        clientSecretEncrypted: integration.clientSecretEncrypted ? '***' : null,
        accessTokenEncrypted: integration.accessTokenEncrypted ? '***' : null,
        ftpUsernameEncrypted: integration.ftpUsernameEncrypted ? '***' : null,
        ftpPasswordEncrypted: integration.ftpPasswordEncrypted ? '***' : null,
        hasFtpCredentials: !!(integration.ftpHost && integration.ftpUsernameEncrypted && integration.ftpPasswordEncrypted),
      }));

      res.json({ integrations: maskedIntegrations });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform-integrations
   * Create or update platform integration
   */
  app.post('/api/platform-integrations', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const baseSchema = z.object({
        platform: z.enum(['petfinder', 'rescuegroups', 'adoptapet']),
        clientId: z.string().min(1),
        clientSecret: z.string().optional(),
        organizationId: z.string().optional(),
        autoSync: z.boolean().default(false),
      });

      const data = baseSchema.parse(req.body);

      // Platform-specific validation
      if (data.platform === 'petfinder' && !data.clientSecret) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'PetFinder requires both Client ID and Client Secret',
        });
      }

      if (data.platform === 'rescuegroups' && !data.organizationId) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'RescueGroups requires an Organization ID',
        });
      }

      // Encrypt credentials
      const clientIdEncrypted = encrypt(data.clientId);
      const clientSecretEncrypted = data.clientSecret ? encrypt(data.clientSecret) : null;

      // Check if integration exists
      const existing = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, data.platform)
        ))
        .limit(1);

      let integration;

      if (existing.length > 0) {
        // Update existing
        [integration] = await db
          .update(platformIntegrations)
          .set({
            clientIdEncrypted,
            clientSecretEncrypted,
            organizationId: data.organizationId || null,
            autoSync: data.autoSync,
            isEnabled: true,
            updatedAt: new Date(),
          })
          .where(eq(platformIntegrations.id, existing[0].id))
          .returning();
      } else {
        // Create new
        [integration] = await db
          .insert(platformIntegrations)
          .values({
            tenantId: req.tenant!.id,
            platform: data.platform,
            clientIdEncrypted,
            clientSecretEncrypted,
            organizationId: data.organizationId || null,
            autoSync: data.autoSync,
            isEnabled: true,
          })
          .returning();
      }

      res.json({
        success: true,
        integration: {
          ...integration,
          clientIdEncrypted: '***',
          clientSecretEncrypted: '***',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform-integrations/:platform/test
   * Test connection to platform
   */
  app.post('/api/platform-integrations/:platform/test', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = req.params.platform as 'petfinder' | 'rescuegroups' | 'adoptapet';

      // Get integration
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, platform)
        ))
        .limit(1);

      if (!integration) {
        return res.status(404).json({ error: `${platform} integration not configured` });
      }

      // Test connection based on platform
      let result: any;

      if (platform === 'petfinder') {
        const { PetFinderClient } = await import('../lib/platformClients');
        const pfClient = new PetFinderClient(integration);
        const token = await pfClient.ensureAuthenticated();
        
        // Store refreshed token
        await db
          .update(platformIntegrations)
          .set({
            accessTokenEncrypted: encrypt(token),
            tokenExpiresAt: pfClient['tokenExpiresAt'] || undefined,
            lastSyncStatus: 'success',
            updatedAt: new Date(),
          })
          .where(eq(platformIntegrations.id, integration.id));

        result = { message: 'Successfully authenticated with PetFinder', tokenObtained: true };
      } else if (platform === 'rescuegroups') {
        const { RescueGroupsClient } = await import('../lib/platformClients');
        const rgClient = new RescueGroupsClient(integration);
        // Test by searching for animals
        const data = await rgClient.searchAnimals({ limit: 1 });
        result = { message: 'Successfully connected to RescueGroups', animalsFound: data.data?.length || 0 };
      } else if (platform === 'adoptapet') {
        const { AdoptAPetClient } = await import('../lib/platformClients');
        const aapClient = new AdoptAPetClient(integration);
        // Test by getting pets
        const data = await aapClient.getPets();
        result = { message: 'Successfully connected to Adopt-a-Pet', status: data.status };
      }

      await db
        .update(platformIntegrations)
        .set({
          lastSyncStatus: 'success',
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(platformIntegrations.id, integration.id));

      res.json({ success: true, ...result });
    } catch (error: any) {
      // Log error to integration
      const platform = req.params.platform as 'petfinder' | 'rescuegroups' | 'adoptapet';
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, platform)
        ))
        .limit(1);

      if (integration) {
        await db
          .update(platformIntegrations)
          .set({
            lastSyncStatus: 'error',
            lastSyncError: error.message,
            updatedAt: new Date(),
          })
          .where(eq(platformIntegrations.id, integration.id));
      }

      next(error);
    }
  });

  /**
   * GET /api/platform-integrations/:platform/syncs
   * Get sync history for a platform
   */
  app.get('/api/platform-integrations/:platform/syncs', requireTenant, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = req.params.platform as 'petfinder' | 'rescuegroups' | 'adoptapet';

      const syncResults = await db
        .select({
          id: animalPlatformSyncs.id,
          tenantId: animalPlatformSyncs.tenantId,
          animalId: animalPlatformSyncs.animalId,
          platform: animalPlatformSyncs.platform,
          platformId: animalPlatformSyncs.platformId,
          lastSyncedAt: animalPlatformSyncs.lastSyncedAt,
          syncStatus: animalPlatformSyncs.syncStatus,
          syncError: animalPlatformSyncs.syncError,
          createdAt: animalPlatformSyncs.createdAt,
          animalName: animals.name,
          animalStatus: animals.status,
          animalPhotos: animals.photos,
        })
        .from(animalPlatformSyncs)
        .leftJoin(animals, eq(animalPlatformSyncs.animalId, animals.id))
        .where(and(
          eq(animalPlatformSyncs.tenantId, req.tenant!.id),
          eq(animalPlatformSyncs.platform, platform)
        ))
        .orderBy(animalPlatformSyncs.lastSyncedAt);

      // Transform results to expected structure
      const syncs = syncResults.map(row => ({
        sync: {
          id: row.id,
          tenantId: row.tenantId,
          animalId: row.animalId,
          platform: row.platform,
          platformId: row.platformId,
          lastSyncedAt: row.lastSyncedAt,
          syncStatus: row.syncStatus,
          syncError: row.syncError,
          createdAt: row.createdAt,
        },
        animal: row.animalName ? {
          id: row.animalId,
          name: row.animalName,
          status: row.animalStatus,
          photos: row.animalPhotos,
        } : null,
      }));

      res.json({ syncs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/platform-integrations/:platform
   * Delete platform integration
   */
  app.delete('/api/platform-integrations/:platform', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platform = req.params.platform as 'petfinder' | 'rescuegroups' | 'adoptapet';

      await db
        .delete(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, platform)
        ));

      res.json({ success: true, message: `${platform} integration removed` });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform-integrations/petfinder/ftp
   * Save Petfinder FTP credentials
   */
  app.post('/api/platform-integrations/petfinder/ftp', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ftpSchema = z.object({
        ftpHost: z.string().min(1, 'FTP host is required'),
        ftpUsername: z.string().optional(),
        ftpPassword: z.string().optional(),
        ftpPath: z.string().optional(),
        autoSync: z.boolean().default(false),
        syncFrequency: z.enum(['manual', 'frequent', 'hourly', 'daily']).default('daily'),
      });

      const data = ftpSchema.parse(req.body);

      const existing = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'petfinder')
        ))
        .limit(1);

      let integration;

      if (existing.length > 0) {
        // Build update object, only updating credentials if provided
        const updateData: Record<string, any> = {
          ftpHost: data.ftpHost,
          ftpPath: data.ftpPath || null,
          autoSync: data.autoSync,
          syncFrequency: data.syncFrequency,
          isEnabled: true,
          updatedAt: new Date(),
        };
        
        // Only update credentials if provided (allows editing other settings without re-entering)
        if (data.ftpUsername) {
          updateData.ftpUsernameEncrypted = encrypt(data.ftpUsername);
        }
        if (data.ftpPassword) {
          updateData.ftpPasswordEncrypted = encrypt(data.ftpPassword);
        }
        
        [integration] = await db
          .update(platformIntegrations)
          .set(updateData)
          .where(eq(platformIntegrations.id, existing[0].id))
          .returning();
      } else {
        // For new integrations, require username and password
        if (!data.ftpUsername || !data.ftpPassword) {
          return res.status(400).json({
            success: false,
            message: 'FTP username and password are required for new integrations',
          });
        }
        
        const ftpUsernameEncrypted = encrypt(data.ftpUsername);
        const ftpPasswordEncrypted = encrypt(data.ftpPassword);
        
        [integration] = await db
          .insert(platformIntegrations)
          .values({
            tenantId: req.tenant!.id,
            platform: 'petfinder',
            ftpHost: data.ftpHost,
            ftpUsernameEncrypted,
            ftpPasswordEncrypted,
            ftpPath: data.ftpPath || null,
            autoSync: data.autoSync,
            syncFrequency: data.syncFrequency,
            isEnabled: true,
          })
          .returning();
      }

      res.json({
        success: true,
        message: 'Petfinder FTP credentials saved successfully',
        integration: {
          ...integration,
          ftpUsernameEncrypted: '***',
          ftpPasswordEncrypted: '***',
          hasFtpCredentials: true,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform-integrations/petfinder/sync
   * Trigger manual Petfinder FTP sync
   */
  app.post('/api/platform-integrations/petfinder/sync', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { syncToPetfinder } = await import('../services/petfinder-sync');
      
      const result = await syncToPetfinder(req.tenant!.id);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          animalsExported: result.animalsExported,
          imagesUploaded: result.imagesUploaded,
          errors: result.errors,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          errors: result.errors,
        });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/platform-integrations/petfinder/test-ftp
   * Test Petfinder FTP connection
   */
  app.post('/api/platform-integrations/petfinder/test-ftp', requireTenant, requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [integration] = await db
        .select()
        .from(platformIntegrations)
        .where(and(
          eq(platformIntegrations.tenantId, req.tenant!.id),
          eq(platformIntegrations.platform, 'petfinder')
        ))
        .limit(1);

      if (!integration || !integration.ftpHost || !integration.ftpUsernameEncrypted || !integration.ftpPasswordEncrypted) {
        return res.status(400).json({
          success: false,
          message: 'FTP credentials not configured',
        });
      }

      const { decrypt } = await import('../lib/encryption');
      const ftp = await import('basic-ftp');
      
      const client = new ftp.Client();
      client.ftp.verbose = false;
      
      try {
        await client.access({
          host: integration.ftpHost,
          user: decrypt(integration.ftpUsernameEncrypted),
          password: decrypt(integration.ftpPasswordEncrypted),
          secure: false,
        });
        
        const files = await client.list(integration.ftpPath || '/');
        client.close();
        
        res.json({
          success: true,
          message: 'FTP connection successful',
          filesFound: files.length,
        });
      } catch (ftpError: any) {
        client.close();
        res.status(400).json({
          success: false,
          message: `FTP connection failed: ${ftpError.message}`,
        });
      }
    } catch (error) {
      next(error);
    }
  });
}
