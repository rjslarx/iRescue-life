import { Router } from 'express';
import { requireTenant } from '../middleware/tenant';
import { requireAuth, requireRole } from '../middleware/auth';
import { TransportService } from '../services/transport';
import { 
  insertTransportEventSchema,
  insertTransportParticipantSchema,
  insertTransportUpdateSchema,
  insertTransferAlertSchema,
  insertTransferAlertResponseSchema,
  insertTransportStopSchema,
  insertTransportManifestItemSchema,
  users,
} from '@shared/schema';
import { z } from 'zod';
import { db } from '../db';
import { eq } from 'drizzle-orm';

const router = Router();

// ============================================================================
// Transport Events Routes
// ============================================================================

router.get('/events', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      transportType: req.query.transportType as string | undefined,
    };

    const transports = await TransportService.listTransports(req.tenant!.id, filters);
    res.json({ transports });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const transport = await TransportService.getTransport(req.tenant!.id, req.params.id);
    
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const participants = await TransportService.listParticipants(req.tenant!.id, req.params.id);
    const updates = await TransportService.listUpdates(req.tenant!.id, req.params.id);

    res.json({ 
      transport,
      participants,
      updates,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events', requireTenant, requireAuth, async (req, res, next) => {
  try {
    // Pre-process date fields from ISO strings to Date objects
    const body = { ...req.body };
    if (body.departureDate && typeof body.departureDate === 'string') {
      body.departureDate = new Date(body.departureDate);
    }
    if (body.estimatedArrivalDate && typeof body.estimatedArrivalDate === 'string') {
      body.estimatedArrivalDate = new Date(body.estimatedArrivalDate);
    }
    if (body.actualDepartureDate && typeof body.actualDepartureDate === 'string') {
      body.actualDepartureDate = new Date(body.actualDepartureDate);
    }
    if (body.actualArrivalDate && typeof body.actualArrivalDate === 'string') {
      body.actualArrivalDate = new Date(body.actualArrivalDate);
    }
    
    const createSchema = insertTransportEventSchema.omit({ tenantId: true }).extend({
      name: z.string().min(1, 'Name is required'),
      transportType: z.enum(['outbound', 'inbound', 'relay', 'internal']),
    });

    const data = createSchema.parse(body);
    const transport = await TransportService.createTransport(req.tenant!.id, {
      ...data,
      createdBy: req.user!.id,
    });

    res.status(201).json({ transport });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.patch('/events/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    // Pre-process date fields from ISO strings to Date objects
    const body = { ...req.body };
    if (body.departureDate && typeof body.departureDate === 'string') {
      body.departureDate = new Date(body.departureDate);
    }
    if (body.estimatedArrivalDate && typeof body.estimatedArrivalDate === 'string') {
      body.estimatedArrivalDate = new Date(body.estimatedArrivalDate);
    }
    if (body.actualDepartureDate && typeof body.actualDepartureDate === 'string') {
      body.actualDepartureDate = new Date(body.actualDepartureDate);
    }
    if (body.actualArrivalDate && typeof body.actualArrivalDate === 'string') {
      body.actualArrivalDate = new Date(body.actualArrivalDate);
    }
    
    const updateSchema = insertTransportEventSchema.omit({ tenantId: true }).partial();
    const data = updateSchema.parse(body);

    const transport = await TransportService.updateTransport(
      req.tenant!.id,
      req.params.id,
      data,
      req.user!.id
    );

    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    res.json({ transport });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/events/:id', requireTenant, requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const deleted = await TransportService.deleteTransport(req.tenant!.id, req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const stats = await TransportService.getTransportStats(req.tenant!.id);
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Transport Participants Routes
// ============================================================================

router.get('/events/:id/participants', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const participants = await TransportService.listParticipants(
      req.tenant!.id,
      req.params.id
    );
    res.json({ participants });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:id/participants', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const createSchema = insertTransportParticipantSchema
      .omit({ tenantId: true, transportId: true })
      .extend({
        role: z.enum(['coordinator', 'driver', 'volunteer', 'foster_pickup', 'foster_dropoff', 'vet', 'observer']),
      });

    const data = createSchema.parse(req.body);
    
    // If adding a team member (userId provided), look up their name
    if (data.userId && !data.externalName) {
      const [user] = await db.select().from(users).where(eq(users.id, data.userId));
      if (user) {
        data.externalName = user.name || user.email;
      }
    }
    
    const participant = await TransportService.addParticipant(
      req.tenant!.id,
      req.params.id,
      data
    );

    res.status(201).json({ participant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.patch('/participants/:participantId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const updateSchema = insertTransportParticipantSchema
      .omit({ tenantId: true, transportId: true })
      .partial();

    const data = updateSchema.parse(req.body);
    const participant = await TransportService.updateParticipant(
      req.tenant!.id,
      req.params.participantId,
      data
    );

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    res.json({ participant });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/participants/:participantId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const deleted = await TransportService.removeParticipant(
      req.tenant!.id,
      req.params.participantId
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Transport Updates/Timeline Routes
// ============================================================================

router.get('/events/:id/updates', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const updates = await TransportService.listUpdates(req.tenant!.id, req.params.id);
    res.json({ updates });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:id/updates', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const createSchema = insertTransportUpdateSchema
      .omit({ tenantId: true, transportId: true })
      .extend({
        updateType: z.enum([
          'status_change', 'location_update', 'participant_added', 
          'participant_confirmed', 'message', 'photo', 'eta_update', 'issue_reported'
        ]),
        title: z.string().min(1, 'Title is required'),
      });

    const data = createSchema.parse(req.body);
    const update = await TransportService.createUpdate(
      req.tenant!.id,
      req.params.id,
      {
        ...data,
        createdBy: req.user!.id,
        createdByName: req.user!.fullName,
      }
    );

    res.status(201).json({ update });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

// ============================================================================
// Google Chat Integration Routes
// ============================================================================

router.post('/events/:id/chat/create', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { memberEmails } = req.body;

    if (!memberEmails || !Array.isArray(memberEmails)) {
      return res.status(400).json({ error: 'memberEmails array is required' });
    }

    const result = await TransportService.createGoogleChatSpace(
      req.tenant!.id,
      req.params.id,
      memberEmails
    );

    if (!result) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    res.json(result);
  } catch (error: any) {
    if (error.message?.includes('not configured')) {
      return res.status(400).json({ 
        error: 'Google Workspace integration not configured',
        requiresSetup: true,
      });
    }
    next(error);
  }
});

// ============================================================================
// Transfer Alerts Routes
// ============================================================================

router.get('/alerts', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      alertType: req.query.alertType as string | undefined,
      urgencyLevel: req.query.urgencyLevel as string | undefined,
    };

    const alerts = await TransportService.listAlerts(req.tenant!.id, filters);
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const alert = await TransportService.getAlert(req.tenant!.id, req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const responses = await TransportService.listAlertResponses(req.tenant!.id, req.params.id);
    res.json({ alert, responses });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const createSchema = insertTransferAlertSchema.omit({ tenantId: true }).extend({
      title: z.string().min(1, 'Title is required'),
      message: z.string().min(1, 'Message is required'),
      urgencyLevel: z.enum(['low', 'medium', 'high', 'critical']),
      alertType: z.enum(['capacity', 'transport_needed', 'foster_needed', 'medical_emergency', 'general']),
    });

    const data = createSchema.parse(req.body);
    const alert = await TransportService.createAlert(req.tenant!.id, {
      ...data,
      createdBy: req.user!.id,
    });

    res.status(201).json({ alert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.patch('/alerts/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const updateSchema = insertTransferAlertSchema.omit({ tenantId: true }).partial();
    const data = updateSchema.parse(req.body);

    const alert = await TransportService.updateAlert(req.tenant!.id, req.params.id, data);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.post('/alerts/:id/resolve', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { notes } = req.body;

    const alert = await TransportService.resolveAlert(
      req.tenant!.id,
      req.params.id,
      req.user!.id,
      notes
    );

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:id/broadcast', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { webhookUrls } = req.body;

    if (!webhookUrls || !Array.isArray(webhookUrls) || webhookUrls.length === 0) {
      return res.status(400).json({ error: 'webhookUrls array is required' });
    }

    const result = await TransportService.broadcastAlert(
      req.tenant!.id,
      req.params.id,
      webhookUrls
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Alert Responses Routes
// ============================================================================

router.get('/alerts/:id/responses', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const responses = await TransportService.listAlertResponses(
      req.tenant!.id,
      req.params.id
    );
    res.json({ responses });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:id/responses', requireTenant, async (req, res, next) => {
  try {
    const createSchema = insertTransferAlertResponseSchema
      .omit({ tenantId: true, alertId: true })
      .extend({
        responderName: z.string().min(1, 'Name is required'),
        responderEmail: z.string().email('Valid email is required'),
      });

    const data = createSchema.parse(req.body);
    const response = await TransportService.createAlertResponse(
      req.tenant!.id,
      req.params.id,
      data
    );

    res.status(201).json({ response });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

// ============================================================================
// Transport Stops Routes
// ============================================================================

router.get('/events/:transportId/stops', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const stops = await TransportService.listStops(req.tenant!.id, req.params.transportId);
    res.json({ stops });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:transportId/stops', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const createSchema = insertTransportStopSchema.omit({ tenantId: true, transportId: true }).extend({
      locationName: z.string().min(1, 'Location name is required'),
    });

    const data = createSchema.parse(req.body);
    const stop = await TransportService.createStop(req.tenant!.id, req.params.transportId, data);

    res.status(201).json({ stop });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.patch('/stops/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const updateSchema = insertTransportStopSchema.omit({ tenantId: true, transportId: true }).partial();
    const data = updateSchema.parse(req.body);

    const stop = await TransportService.updateStop(req.tenant!.id, req.params.id, data);
    
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    res.json({ stop });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/stops/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const deleted = await TransportService.deleteStop(req.tenant!.id, req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/stops/:id/confirm-arrival', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { signatureDataUrl, signedByName } = req.body;
    
    const stop = await TransportService.confirmStopArrival(
      req.tenant!.id, 
      req.params.id,
      { signatureDataUrl, signedByName }
    );

    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    res.json({ stop });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Transport Manifest Items Routes
// ============================================================================

router.get('/events/:transportId/manifest', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const items = await TransportService.listManifestItems(req.tenant!.id, req.params.transportId);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:transportId/manifest', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const createSchema = insertTransportManifestItemSchema
      .omit({ tenantId: true, transportId: true, originOrgId: true })
      .extend({
        animalId: z.string().uuid('Animal ID is required'),
      });

    const data = createSchema.parse(req.body);
    const { item, validationErrors } = await TransportService.addManifestItem(
      req.tenant!.id, 
      req.params.transportId, 
      data
    );

    res.status(201).json({ item, validationErrors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error instanceof Error && error.message === 'Animal not found') {
      return res.status(404).json({ error: 'Animal not found' });
    }
    next(error);
  }
});

router.patch('/manifest/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const updateSchema = insertTransportManifestItemSchema
      .omit({ tenantId: true, transportId: true, originOrgId: true, animalId: true })
      .partial();
    const data = updateSchema.parse(req.body);

    const item = await TransportService.updateManifestItem(req.tenant!.id, req.params.id, data);
    
    if (!item) {
      return res.status(404).json({ error: 'Manifest item not found' });
    }

    res.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

router.delete('/manifest/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const deleted = await TransportService.removeManifestItem(req.tenant!.id, req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Manifest item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/manifest/:id/confirm-delivery', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { confirmedBy, notes, signatureDataUrl } = req.body;
    
    if (!confirmedBy) {
      return res.status(400).json({ error: 'confirmedBy is required' });
    }

    const item = await TransportService.confirmDelivery(
      req.tenant!.id,
      req.params.id,
      { confirmedBy, notes, signatureDataUrl }
    );

    if (!item) {
      return res.status(404).json({ error: 'Manifest item not found' });
    }

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

// Confirm handover for all animals at a stop (stop-level signature)
router.post('/stops/:stopId/confirm-handover', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { receiverName, signatureDataUrl, notes, locationCoords } = req.body;
    
    if (!receiverName || !signatureDataUrl) {
      return res.status(400).json({ error: 'receiverName and signatureDataUrl are required' });
    }

    const result = await TransportService.confirmStopHandover(
      req.tenant!.id,
      req.params.stopId,
      { receiverName, signatureDataUrl, notes, locationCoords }
    );

    if (!result) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    res.json({ 
      success: true, 
      stop: result.stop, 
      deliveredCount: result.deliveredItems.length 
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Transport Timeline Events (Mission Log / Communication Channel)
// ============================================================================

// Get timeline events for a transport (ordered oldest to newest)
router.get('/events/:transportId/timeline', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const events = await TransportService.getTimelineEvents(req.tenant!.id, req.params.transportId);
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

// Add a comment to the transport timeline
router.post('/events/:transportId/comment', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { message, metadata } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const event = await TransportService.addComment(
      req.tenant!.id,
      req.params.transportId,
      req.user!.id,
      message.trim(),
      metadata
    );

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

// Log a traffic/delay alert
router.post('/events/:transportId/timeline/delay', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { delayMinutes } = req.body;
    
    if (!delayMinutes || typeof delayMinutes !== 'number' || delayMinutes < 1) {
      return res.status(400).json({ error: 'delayMinutes must be a positive number' });
    }

    const user = req.user!;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;

    const event = await TransportService.logDelayAlert(
      req.tenant!.id,
      req.params.transportId,
      delayMinutes,
      user.id,
      userName
    );

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

// Log a potty break
router.post('/events/:transportId/timeline/potty-break', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    const user = req.user!;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;

    const event = await TransportService.logPottyBreak(
      req.tenant!.id,
      req.params.transportId,
      user.id,
      userName,
      latitude && longitude ? { latitude, longitude } : undefined
    );

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

// Log a stop completion (typically called after confirming arrival/handover)
router.post('/events/:transportId/timeline/stop-complete', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { stopId, stopName } = req.body;
    
    if (!stopId || !stopName) {
      return res.status(400).json({ error: 'stopId and stopName are required' });
    }

    const user = req.user!;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;

    const event = await TransportService.logStopComplete(
      req.tenant!.id,
      req.params.transportId,
      stopId,
      stopName,
      user.id,
      userName
    );

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

// Add a generic log entry (for emergency notes, etc.)
router.post('/events/:transportId/timeline/log', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { message, metadata } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const user = req.user!;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;

    const event = await TransportService.logTransportEvent(
      req.tenant!.id,
      req.params.transportId,
      'log',
      message.trim(),
      {
        userId: user.id,
        userName,
        metadata,
      }
    );

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:transportId/validate-manifest', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.validateManifest(req.tenant!.id, req.params.transportId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// CVI (Certificate of Veterinary Inspection) Compliance Validation
router.get('/events/:transportId/cvi-compliance', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.validateCviCompliance(req.tenant!.id, req.params.transportId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Medical Packet Generator - generate printable medical history for transfer
router.get('/events/:transportId/medical-packet/:animalId', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.generateMedicalPacket(
      req.tenant!.id, 
      req.params.transportId,
      req.params.animalId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Batch Medical Packet - generate for all animals on manifest
router.get('/events/:transportId/medical-packet', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.generateBatchMedicalPacket(
      req.tenant!.id, 
      req.params.transportId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Toggle microchip release status for a manifest item
router.patch('/manifest/:itemId/microchip-release', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { completed } = req.body;
    const result = await TransportService.toggleMicrochipRelease(
      req.tenant!.id,
      req.params.itemId,
      completed,
      req.user!.id
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Transfer Agreement Generator - generate printable transfer agreement for org-to-org transfers
router.get('/events/:transportId/transfer-agreement', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.generateTransferAgreement(
      req.tenant!.id, 
      req.params.transportId
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/events/:transportId/finalize-manifest', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.finalizeManifest(req.tenant!.id, req.params.transportId);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        validation: result.validation,
      });
    }
    
    res.json({ success: true, message: 'Manifest finalized successfully. Transport status updated to confirmed.' });
  } catch (error) {
    next(error);
  }
});

// Depart Transport (Stage 3: Hard Close)
// Batch updates all manifest animals to transferred_out and marks transport as in_transit
router.post('/events/:transportId/depart', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined;
    
    // Server-side CVI compliance enforcement - block departure if critical issues exist
    const cviCompliance = await TransportService.validateCviCompliance(req.tenant!.id, req.params.transportId);
    if (!cviCompliance.canDepart) {
      return res.status(400).json({ 
        error: `Cannot depart transport: ${cviCompliance.summary.nonCompliant} animal(s) have critical CVI compliance issues. Resolve all critical issues before departing.`,
        cviCompliance: cviCompliance.summary,
      });
    }
    
    const result = await TransportService.departTransport(
      req.tenant!.id, 
      req.params.transportId,
      user.id,
      userName
    );
    
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to depart transport. Ensure the transport has animals in its manifest.',
      });
    }
    
    res.json({ 
      success: true, 
      message: `Transport departed successfully. ${result.animalsUpdated} animal(s) marked as transferred.`,
      animalsUpdated: result.animalsUpdated,
      transport: result.transport,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Mobile Run Sheet Routes (Public Access)
// ============================================================================

router.post('/events/:transportId/run-sheet-token', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const token = await TransportService.generateRunSheetToken(req.tenant!.id, req.params.transportId);
    res.json({ token });
  } catch (error) {
    next(error);
  }
});

router.get('/run-sheet/:token', async (req, res, next) => {
  try {
    const result = await TransportService.getTransportByRunSheetToken(req.params.token);
    
    if (!result) {
      return res.status(404).json({ error: 'Run sheet not found or token expired' });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/run-sheet/:token/confirm-delivery/:itemId', async (req, res, next) => {
  try {
    const { confirmedBy, notes, signatureDataUrl } = req.body;
    
    if (!confirmedBy) {
      return res.status(400).json({ error: 'confirmedBy is required' });
    }

    const runSheetData = await TransportService.getTransportByRunSheetToken(req.params.token);
    if (!runSheetData) {
      return res.status(404).json({ error: 'Run sheet not found or token expired' });
    }

    const item = await TransportService.confirmDeliveryByToken(
      req.params.token,
      req.params.itemId,
      { confirmedBy, notes, signatureDataUrl }
    );

    if (!item) {
      return res.status(404).json({ error: 'Manifest item not found' });
    }

    res.json({ item });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Pending Transfers Routes
// ============================================================================

router.get('/pending-transfers', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const role = (req.query.role as 'sender' | 'receiver') || 'receiver';
    const transfers = await TransportService.listPendingTransfers(req.tenant!.id, role);
    res.json({ transfers });
  } catch (error) {
    next(error);
  }
});

router.get('/pending-transfers/:id', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const transfer = await TransportService.getPendingTransfer(req.tenant!.id, req.params.id);
    
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json({ transfer });
  } catch (error) {
    next(error);
  }
});

router.post('/pending-transfers/:id/accept', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const result = await TransportService.acceptTransfer(
      req.tenant!.id,
      req.params.id,
      req.user!.id
    );

    if (!result) {
      return res.status(404).json({ error: 'Transfer not found or not authorized' });
    }

    res.json({
      message: 'Transfer accepted successfully',
      newAnimal: result.newAnimal,
      transfer: result.transfer,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/pending-transfers/:id/decline', requireTenant, requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Decline reason is required' });
    }

    const transfer = await TransportService.declineTransfer(
      req.tenant!.id,
      req.params.id,
      reason
    );

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found or not authorized' });
    }

    res.json({ transfer });
  } catch (error) {
    next(error);
  }
});

export default router;
