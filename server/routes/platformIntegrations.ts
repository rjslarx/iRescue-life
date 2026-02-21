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
}
