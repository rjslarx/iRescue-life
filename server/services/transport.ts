import { db } from "../db";
import { 
  transportEvents, 
  transportParticipants, 
  transportUpdates, 
  transferAlerts,
  transferAlertResponses,
  transportStops,
  transportManifestItems,
  transportTimelineEvents,
  pendingTransfers,
  animals,
  medicalExams,
  medicalFiles,
  tenants,
  users,
  type TransportEvent,
  type TransportParticipant,
  type TransportUpdate,
  type TransferAlert,
  type TransferAlertResponse,
  type TransportStop,
  type TransportManifestItem,
  type TransportTimelineEvent,
  type PendingTransfer,
  type Animal,
  type InsertTransportEvent,
  type InsertTransportParticipant,
  type InsertTransportUpdate,
  type InsertTransferAlert,
  type InsertTransferAlertResponse,
  type InsertTransportStop,
  type InsertTransportManifestItem,
  type InsertTransportTimelineEvent,
  type InsertPendingTransfer,
} from "@shared/schema";
import { eq, and, desc, sql, or, gte, lte, inArray, isNull, asc } from "drizzle-orm";
import { EmailService } from "../lib/email-service";

export class TransportService {
  static async createTransport(
    tenantId: string, 
    data: Omit<InsertTransportEvent, 'tenantId'>
  ): Promise<TransportEvent> {
    const [transport] = await db.insert(transportEvents)
      .values({
        ...data,
        tenantId,
      })
      .returning();

    await this.createUpdate(tenantId, transport.id, {
      tenantId,
      transportId: transport.id,
      updateType: 'status_change',
      title: 'Transport created',
      message: `Transport "${transport.name}" has been created`,
      createdBy: data.createdBy,
    });

    return transport;
  }

  static async getTransport(tenantId: string, id: string): Promise<TransportEvent | null> {
    const [transport] = await db.select()
      .from(transportEvents)
      .where(and(
        eq(transportEvents.id, id),
        eq(transportEvents.tenantId, tenantId)
      ))
      .limit(1);
    
    return transport || null;
  }

  static async listTransports(
    tenantId: string,
    filters?: {
      status?: string;
      transportType?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<TransportEvent[]> {
    let query = db.select()
      .from(transportEvents)
      .where(eq(transportEvents.tenantId, tenantId))
      .orderBy(desc(transportEvents.createdAt));

    if (filters?.status) {
      query = query.where(eq(transportEvents.status, filters.status as any));
    }
    if (filters?.transportType) {
      query = query.where(eq(transportEvents.transportType, filters.transportType as any));
    }

    return query;
  }

  static async updateTransport(
    tenantId: string,
    id: string,
    data: Partial<InsertTransportEvent>,
    userId?: string
  ): Promise<TransportEvent | null> {
    const existing = await this.getTransport(tenantId, id);
    if (!existing) return null;

    const [updated] = await db.update(transportEvents)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportEvents.id, id),
        eq(transportEvents.tenantId, tenantId)
      ))
      .returning();

    if (data.status && data.status !== existing.status) {
      await this.createUpdate(tenantId, id, {
        tenantId,
        transportId: id,
        updateType: 'status_change',
        title: `Status changed to ${data.status}`,
        message: `Transport status updated from "${existing.status}" to "${data.status}"`,
        createdBy: userId,
      });
    }

    return updated;
  }

  static async deleteTransport(tenantId: string, id: string): Promise<boolean> {
    const result = await db.delete(transportEvents)
      .where(and(
        eq(transportEvents.id, id),
        eq(transportEvents.tenantId, tenantId)
      ))
      .returning();

    return result.length > 0;
  }

  static async addParticipant(
    tenantId: string,
    transportId: string,
    data: Omit<InsertTransportParticipant, 'tenantId' | 'transportId'>
  ): Promise<TransportParticipant> {
    const [participant] = await db.insert(transportParticipants)
      .values({
        ...data,
        tenantId,
        transportId,
      })
      .returning();

    const participantName = data.externalName || 'A participant';
    await this.createUpdate(tenantId, transportId, {
      tenantId,
      transportId,
      updateType: 'participant_added',
      title: 'Participant added',
      message: `${participantName} was added as ${data.role}`,
    });

    // Get transport and tenant info for notifications
    const transport = await this.getTransport(tenantId, transportId);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    
    // Get the participant's email (from user or external email)
    let participantEmail: string | null = null;
    
    if (data.userId) {
      // Fetch user email
      const [user] = await db.select().from(users).where(eq(users.id, data.userId));
      if (user?.email) {
        participantEmail = user.email;
      }
    } else if (data.externalEmail) {
      participantEmail = data.externalEmail;
    }

    // Send email notification to participant
    if (participantEmail && transport && tenant) {
      try {
        const emailService = await EmailService.forTenant(tenantId);
        if (emailService) {
          await emailService.sendTransportParticipantNotification({
            participantName: participantName,
            participantEmail: participantEmail,
            transportName: transport.name,
            role: data.role,
            departureDate: transport.departureDate,
            origin: transport.origin,
            destination: transport.destination,
            transportId: transportId,
            tenantSubdomain: tenant.subdomain || 'demo',
            rescueName: tenant.name || 'Animal Rescue',
          });
          console.log(`[Transport] Email notification sent to ${participantName} <${participantEmail}>`);
        }
      } catch (error) {
        // Log but don't fail - participant is still added even if email fails
        console.error('[Transport] Failed to send participant email notification:', error);
      }
    }

    return participant;
  }

  static async listParticipants(
    tenantId: string,
    transportId: string
  ): Promise<TransportParticipant[]> {
    return db.select()
      .from(transportParticipants)
      .where(and(
        eq(transportParticipants.transportId, transportId),
        eq(transportParticipants.tenantId, tenantId)
      ));
  }

  static async updateParticipant(
    tenantId: string,
    participantId: string,
    data: Partial<InsertTransportParticipant>
  ): Promise<TransportParticipant | null> {
    const [updated] = await db.update(transportParticipants)
      .set(data)
      .where(and(
        eq(transportParticipants.id, participantId),
        eq(transportParticipants.tenantId, tenantId)
      ))
      .returning();

    if (updated && data.status === 'confirmed') {
      await this.createUpdate(tenantId, updated.transportId, {
        tenantId,
        transportId: updated.transportId,
        updateType: 'participant_confirmed',
        title: 'Participant confirmed',
        message: `${updated.externalName || 'A participant'} confirmed their participation`,
      });
    }

    return updated || null;
  }

  static async removeParticipant(
    tenantId: string,
    participantId: string
  ): Promise<boolean> {
    const result = await db.delete(transportParticipants)
      .where(and(
        eq(transportParticipants.id, participantId),
        eq(transportParticipants.tenantId, tenantId)
      ))
      .returning();

    return result.length > 0;
  }

  static async createUpdate(
    tenantId: string,
    transportId: string,
    data: Omit<InsertTransportUpdate, 'tenantId' | 'transportId'> & { tenantId?: string; transportId?: string }
  ): Promise<TransportUpdate> {
    const [update] = await db.insert(transportUpdates)
      .values({
        ...data,
        tenantId,
        transportId,
      })
      .returning();

    return update;
  }

  static async listUpdates(
    tenantId: string,
    transportId: string
  ): Promise<TransportUpdate[]> {
    return db.select()
      .from(transportUpdates)
      .where(and(
        eq(transportUpdates.transportId, transportId),
        eq(transportUpdates.tenantId, tenantId)
      ))
      .orderBy(desc(transportUpdates.createdAt));
  }


  static async createAlert(
    tenantId: string,
    data: Omit<InsertTransferAlert, 'tenantId'>
  ): Promise<TransferAlert> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [alert] = await db.insert(transferAlerts)
      .values({
        ...data,
        tenantId,
        expiresAt: data.expiresAt || expiresAt,
      })
      .returning();

    return alert;
  }

  static async getAlert(tenantId: string, id: string): Promise<TransferAlert | null> {
    const [alert] = await db.select()
      .from(transferAlerts)
      .where(and(
        eq(transferAlerts.id, id),
        eq(transferAlerts.tenantId, tenantId)
      ))
      .limit(1);

    return alert || null;
  }

  static async listAlerts(
    tenantId: string,
    filters?: {
      status?: string;
      alertType?: string;
      urgencyLevel?: string;
    }
  ): Promise<TransferAlert[]> {
    let conditions = [eq(transferAlerts.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(transferAlerts.status, filters.status as any));
    }
    if (filters?.alertType) {
      conditions.push(eq(transferAlerts.alertType, filters.alertType as any));
    }
    if (filters?.urgencyLevel) {
      conditions.push(eq(transferAlerts.urgencyLevel, filters.urgencyLevel as any));
    }

    return db.select()
      .from(transferAlerts)
      .where(and(...conditions))
      .orderBy(desc(transferAlerts.createdAt));
  }

  static async updateAlert(
    tenantId: string,
    id: string,
    data: Partial<InsertTransferAlert>
  ): Promise<TransferAlert | null> {
    const [updated] = await db.update(transferAlerts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transferAlerts.id, id),
        eq(transferAlerts.tenantId, tenantId)
      ))
      .returning();

    return updated || null;
  }

  static async resolveAlert(
    tenantId: string,
    id: string,
    userId: string,
    notes?: string
  ): Promise<TransferAlert | null> {
    const [resolved] = await db.update(transferAlerts)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transferAlerts.id, id),
        eq(transferAlerts.tenantId, tenantId)
      ))
      .returning();

    return resolved || null;
  }

  static async broadcastAlert(
    tenantId: string,
    alertId: string,
    webhookUrls: string[]
  ): Promise<{ sent: number; failed: number }> {
    const alert = await this.getAlert(tenantId, alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    const result = await broadcastTransferAlert(webhookUrls, {
      title: alert.title,
      message: alert.message,
      urgencyLevel: alert.urgencyLevel,
      location: alert.location || undefined,
      animalCount: alert.animalCount || undefined,
      species: alert.species || undefined,
      contactEmail: alert.contactEmail || undefined,
      publicLink: alert.publicLink || undefined,
    });

    await db.update(transferAlerts)
      .set({
        broadcastedVia: sql`array_cat(${transferAlerts.broadcastedVia}, ${['webhook']})`,
        lastBroadcastAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transferAlerts.id, alertId));

    return { sent: result.sent, failed: result.failed };
  }

  static async createAlertResponse(
    tenantId: string,
    alertId: string,
    data: Omit<InsertTransferAlertResponse, 'tenantId' | 'alertId'>
  ): Promise<TransferAlertResponse> {
    const [response] = await db.insert(transferAlertResponses)
      .values({
        ...data,
        tenantId,
        alertId,
      })
      .returning();

    await db.update(transferAlerts)
      .set({
        responseCount: sql`${transferAlerts.responseCount} + 1`,
        status: 'responded',
        updatedAt: new Date(),
      })
      .where(eq(transferAlerts.id, alertId));

    return response;
  }

  static async listAlertResponses(
    tenantId: string,
    alertId: string
  ): Promise<TransferAlertResponse[]> {
    return db.select()
      .from(transferAlertResponses)
      .where(and(
        eq(transferAlertResponses.alertId, alertId),
        eq(transferAlertResponses.tenantId, tenantId)
      ))
      .orderBy(desc(transferAlertResponses.createdAt));
  }

  static async getTransportStats(tenantId: string): Promise<{
    total: number;
    planning: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    activeAlerts: number;
  }> {
    const transports = await db.select()
      .from(transportEvents)
      .where(eq(transportEvents.tenantId, tenantId));

    const alerts = await db.select()
      .from(transferAlerts)
      .where(and(
        eq(transferAlerts.tenantId, tenantId),
        eq(transferAlerts.status, 'active')
      ));

    const stats = {
      total: transports.length,
      planning: 0,
      confirmed: 0,
      inProgress: 0,
      completed: 0,
      activeAlerts: alerts.length,
    };

    transports.forEach(t => {
      switch (t.status) {
        case 'planning': stats.planning++; break;
        case 'confirmed': stats.confirmed++; break;
        case 'in_progress': stats.inProgress++; break;
        case 'completed': stats.completed++; break;
      }
    });

    return stats;
  }

  // ============================================================================
  // Transport Stops Management
  // ============================================================================

  static async createStop(
    tenantId: string,
    transportId: string,
    data: Omit<InsertTransportStop, 'tenantId' | 'transportId'>
  ): Promise<TransportStop> {
    const existingStops = await this.listStops(tenantId, transportId);
    const orderIndex = data.orderIndex ?? existingStops.length;

    const [stop] = await db.insert(transportStops)
      .values({
        ...data,
        tenantId,
        transportId,
        orderIndex,
      })
      .returning();

    return stop;
  }

  static async getStop(tenantId: string, stopId: string): Promise<TransportStop | null> {
    const [stop] = await db.select()
      .from(transportStops)
      .where(and(
        eq(transportStops.id, stopId),
        eq(transportStops.tenantId, tenantId)
      ))
      .limit(1);

    return stop || null;
  }

  static async listStops(tenantId: string, transportId: string): Promise<TransportStop[]> {
    return db.select()
      .from(transportStops)
      .where(and(
        eq(transportStops.transportId, transportId),
        eq(transportStops.tenantId, tenantId)
      ))
      .orderBy(asc(transportStops.orderIndex));
  }

  static async updateStop(
    tenantId: string,
    stopId: string,
    data: Partial<InsertTransportStop>
  ): Promise<TransportStop | null> {
    const [updated] = await db.update(transportStops)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportStops.id, stopId),
        eq(transportStops.tenantId, tenantId)
      ))
      .returning();

    return updated || null;
  }

  static async deleteStop(tenantId: string, stopId: string): Promise<boolean> {
    const result = await db.delete(transportStops)
      .where(and(
        eq(transportStops.id, stopId),
        eq(transportStops.tenantId, tenantId)
      ))
      .returning();

    return result.length > 0;
  }

  static async confirmStopArrival(
    tenantId: string,
    stopId: string,
    data: { signatureDataUrl?: string; signedByName?: string }
  ): Promise<TransportStop | null> {
    const [updated] = await db.update(transportStops)
      .set({
        status: 'arrived',
        actualArrival: new Date(),
        signatureDataUrl: data.signatureDataUrl,
        signedByName: data.signedByName,
        signedAt: data.signatureDataUrl ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportStops.id, stopId),
        eq(transportStops.tenantId, tenantId)
      ))
      .returning();

    return updated || null;
  }

  // ============================================================================
  // Transport Manifest Items Management
  // ============================================================================

  static async addManifestItem(
    tenantId: string,
    transportId: string,
    data: Omit<InsertTransportManifestItem, 'tenantId' | 'transportId' | 'originOrgId'>
  ): Promise<{ item: TransportManifestItem; validationErrors: string[] }> {
    const validationErrors: string[] = [];

    const [animal] = await db.select()
      .from(animals)
      .where(and(
        eq(animals.id, data.animalId),
        eq(animals.tenantId, tenantId)
      ))
      .limit(1);

    if (!animal) {
      throw new Error('Animal not found');
    }

    const animalDocs = await db.select()
      .from(medicalFiles)
      .where(and(
        eq(medicalFiles.animalId, data.animalId),
        eq(medicalFiles.tenantId, tenantId)
      ));

    const healthCertDoc = animalDocs.find(d => 
      d.fileName?.toLowerCase().includes('health certificate') || 
      d.description?.toLowerCase().includes('health certificate')
    );
    const cviDoc = animalDocs.find(d => 
      d.fileName?.toLowerCase().includes('cvi') || 
      d.fileName?.toLowerCase().includes('certificate of veterinary inspection') ||
      d.description?.toLowerCase().includes('cvi') ||
      d.description?.toLowerCase().includes('certificate of veterinary inspection')
    );

    if (!healthCertDoc && !cviDoc) {
      validationErrors.push(`${animal.name} is missing a Health Certificate or CVI document`);
    }

    const tenant = await db.select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    // Build insert values explicitly to avoid spreading undefined fields
    const insertData: any = {
      animalId: data.animalId,
      tenantId,
      transportId,
      originOrgId: tenantId,
      originOrgName: tenant[0]?.name || 'Unknown Organization',
      hasHealthCertificate: !!healthCertDoc,
      hasCvi: !!cviDoc,
      // Store the animal's current status so we can restore it if removed from manifest
      previousAnimalStatus: animal.status,
    };
    
    // Add optional fields only if they have values
    if (data.destinationOrgName) insertData.destinationOrgName = data.destinationOrgName;
    if (data.specialInstructions) insertData.specialInstructions = data.specialInstructions;
    if (data.needsMedication !== undefined) insertData.needsMedication = data.needsMedication;
    if (data.isFlightRisk !== undefined) insertData.isFlightRisk = data.isFlightRisk;
    if (data.isAggressive !== undefined) insertData.isAggressive = data.isAggressive;
    if (healthCertDoc?.id) insertData.healthCertificateDocId = healthCertDoc.id;
    if (cviDoc?.id) insertData.cviDocId = cviDoc.id;
    
    const [item] = await db.insert(transportManifestItems)
      .values(insertData)
      .returning();

    // Update animal status to pending_transport (Stage 1: Soft Lock)
    await db.update(animals)
      .set({
        status: 'pending_transport',
        updatedAt: new Date(),
      })
      .where(eq(animals.id, data.animalId));

    return { item, validationErrors };
  }

  static async getManifestItem(tenantId: string, itemId: string): Promise<TransportManifestItem | null> {
    const [item] = await db.select()
      .from(transportManifestItems)
      .where(and(
        eq(transportManifestItems.id, itemId),
        eq(transportManifestItems.tenantId, tenantId)
      ))
      .limit(1);

    return item || null;
  }

  static async listManifestItems(
    tenantId: string,
    transportId: string
  ): Promise<(TransportManifestItem & { animal?: Animal })[]> {
    const items = await db.select()
      .from(transportManifestItems)
      .where(and(
        eq(transportManifestItems.transportId, transportId),
        eq(transportManifestItems.tenantId, tenantId)
      ))
      .orderBy(asc(transportManifestItems.createdAt));

    const itemsWithAnimals = await Promise.all(
      items.map(async (item) => {
        const [animal] = await db.select()
          .from(animals)
          .where(eq(animals.id, item.animalId))
          .limit(1);
        return { ...item, animal };
      })
    );

    return itemsWithAnimals;
  }

  static async updateManifestItem(
    tenantId: string,
    itemId: string,
    data: Partial<InsertTransportManifestItem>
  ): Promise<TransportManifestItem | null> {
    const [updated] = await db.update(transportManifestItems)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportManifestItems.id, itemId),
        eq(transportManifestItems.tenantId, tenantId)
      ))
      .returning();

    return updated || null;
  }

  static async removeManifestItem(tenantId: string, itemId: string): Promise<boolean> {
    // First get the manifest item to restore the animal's previous status
    const item = await this.getManifestItem(tenantId, itemId);
    if (!item) return false;

    const result = await db.delete(transportManifestItems)
      .where(and(
        eq(transportManifestItems.id, itemId),
        eq(transportManifestItems.tenantId, tenantId)
      ))
      .returning();

    if (result.length > 0 && item.previousAnimalStatus) {
      // Restore animal to previous status (Rollback from Soft Lock)
      await db.update(animals)
        .set({
          status: item.previousAnimalStatus,
          updatedAt: new Date(),
        })
        .where(eq(animals.id, item.animalId));
    }

    return result.length > 0;
  }

  static async confirmDelivery(
    tenantId: string,
    itemId: string,
    data: { confirmedBy: string; notes?: string; signatureDataUrl?: string }
  ): Promise<TransportManifestItem | null> {
    const item = await this.getManifestItem(tenantId, itemId);
    if (!item) return null;

    const [updated] = await db.update(transportManifestItems)
      .set({
        isDelivered: true,
        deliveredAt: new Date(),
        deliveryConfirmedBy: data.confirmedBy,
        deliveryNotes: data.notes,
        deliverySignatureUrl: data.signatureDataUrl,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportManifestItems.id, itemId),
        eq(transportManifestItems.tenantId, tenantId)
      ))
      .returning();

    if (item.destinationOrgId) {
      await this.createPendingTransfer(item, updated);
    }

    // Log the delivery event to the timeline
    try {
      // Get animal name for the log message
      const [animal] = await db.select()
        .from(animals)
        .where(eq(animals.id, item.animalId))
        .limit(1);

      const animalName = animal?.name || 'Unknown animal';
      await this.logTransportEvent(
        tenantId,
        item.transportId,
        'status_change',
        `${animalName} delivered - confirmed by ${data.confirmedBy}`,
        {
          userName: 'System',
          metadata: {
            animalId: item.animalId,
            animalName: animalName,
          },
        }
      );
    } catch (logError) {
      console.error('Failed to log delivery event:', logError);
    }

    return updated || null;
  }

  static async confirmDeliveryByToken(
    token: string,
    itemId: string,
    data: { confirmedBy: string; notes?: string; signatureDataUrl?: string }
  ): Promise<TransportManifestItem | null> {
    const runSheetData = await this.getTransportByRunSheetToken(token);
    if (!runSheetData) return null;

    const item = runSheetData.manifest.find((m) => m.id === itemId);
    if (!item) return null;

    const [updated] = await db.update(transportManifestItems)
      .set({
        isDelivered: true,
        deliveredAt: new Date(),
        deliveryConfirmedBy: data.confirmedBy,
        deliveryNotes: data.notes,
        deliverySignatureUrl: data.signatureDataUrl,
        updatedAt: new Date(),
      })
      .where(eq(transportManifestItems.id, itemId))
      .returning();

    if (item.destinationOrgId && updated) {
      await this.createPendingTransfer(item, updated);
    }

    return updated || null;
  }

  // ============================================================================
  // Stop-Level Handover Confirmation
  // ============================================================================

  static async confirmStopHandover(
    tenantId: string,
    stopId: string,
    data: {
      receiverName: string;
      signatureDataUrl: string;
      notes?: string;
      locationCoords?: string; // "lat,lng" format
    }
  ): Promise<{ stop: TransportStop; deliveredItems: TransportManifestItem[] } | null> {
    // Get the stop
    const [stop] = await db.select()
      .from(transportStops)
      .where(and(
        eq(transportStops.id, stopId),
        eq(transportStops.tenantId, tenantId)
      ))
      .limit(1);

    if (!stop) return null;

    const now = new Date();

    // Update the stop with signature info
    const [updatedStop] = await db.update(transportStops)
      .set({
        signatureDataUrl: data.signatureDataUrl,
        signedByName: data.receiverName,
        signedAt: now,
        deliveryLocationCoords: data.locationCoords,
        status: 'departed',
        actualArrival: stop.actualArrival || now,
        updatedAt: now,
      })
      .where(eq(transportStops.id, stopId))
      .returning();

    // Get all manifest items for this stop
    const stopAnimals = await db.select()
      .from(transportManifestItems)
      .where(and(
        eq(transportManifestItems.dropoffStopId, stopId),
        eq(transportManifestItems.tenantId, tenantId)
      ));

    // Mark all animals at this stop as delivered
    const deliveredItems: TransportManifestItem[] = [];
    for (const item of stopAnimals) {
      if (!item.isDelivered) {
        const [updated] = await db.update(transportManifestItems)
          .set({
            isDelivered: true,
            deliveredAt: now,
            deliveryConfirmedBy: data.receiverName,
            deliveryNotes: data.notes,
            deliverySignatureUrl: data.signatureDataUrl,
            updatedAt: now,
          })
          .where(eq(transportManifestItems.id, item.id))
          .returning();

        if (updated) {
          deliveredItems.push(updated);
          // Create pending transfer if needed
          if (item.destinationOrgId) {
            await this.createPendingTransfer(item, updated);
          }
        }
      } else {
        deliveredItems.push(item);
      }
    }

    // Log the stop completion event to the timeline
    try {
      const animalCount = deliveredItems.filter(i => i.isDelivered).length;
      await this.logTransportEvent(
        tenantId,
        stop.transportId,
        'status_change',
        `Stop "${stop.locationName || 'Unnamed'}" completed - ${animalCount} animal${animalCount !== 1 ? 's' : ''} delivered to ${data.receiverName}`,
        {
          userName: 'System',
          metadata: {
            stopId: stopId,
            stopName: stop.locationName || 'Unnamed',
          },
        }
      );
    } catch (logError) {
      console.error('Failed to log stop completion event:', logError);
    }

    return { stop: updatedStop, deliveredItems };
  }

  // ============================================================================
  // Pending Transfers Management
  // ============================================================================

  static async createPendingTransfer(
    manifestItem: TransportManifestItem,
    deliveredItem: TransportManifestItem
  ): Promise<PendingTransfer | null> {
    if (!manifestItem.destinationOrgId) return null;

    const [animal] = await db.select()
      .from(animals)
      .where(eq(animals.id, manifestItem.animalId))
      .limit(1);

    if (!animal) return null;

    const [senderTenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, manifestItem.originOrgId))
      .limit(1);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const [transfer] = await db.insert(pendingTransfers)
      .values({
        senderTenantId: manifestItem.originOrgId,
        senderOrgName: manifestItem.originOrgName || senderTenant?.name || 'Unknown',
        receiverTenantId: manifestItem.destinationOrgId,
        transportId: manifestItem.transportId,
        manifestItemId: manifestItem.id,
        originalAnimalId: animal.id,
        animalName: animal.name,
        animalSpecies: animal.species,
        animalBreed: animal.breed,
        animalAge: animal.age,
        animalPhotoUrl: animal.photoUrls?.[0],
        expiresAt,
        notificationSentAt: new Date(),
      })
      .returning();

    return transfer;
  }

  static async listPendingTransfers(
    tenantId: string,
    role: 'sender' | 'receiver'
  ): Promise<PendingTransfer[]> {
    const column = role === 'sender' ? pendingTransfers.senderTenantId : pendingTransfers.receiverTenantId;
    
    return db.select()
      .from(pendingTransfers)
      .where(and(
        eq(column, tenantId),
        eq(pendingTransfers.status, 'pending')
      ))
      .orderBy(desc(pendingTransfers.createdAt));
  }

  static async getPendingTransfer(
    tenantId: string,
    transferId: string
  ): Promise<PendingTransfer | null> {
    const [transfer] = await db.select()
      .from(pendingTransfers)
      .where(and(
        eq(pendingTransfers.id, transferId),
        or(
          eq(pendingTransfers.senderTenantId, tenantId),
          eq(pendingTransfers.receiverTenantId, tenantId)
        )
      ))
      .limit(1);

    return transfer || null;
  }

  static async acceptTransfer(
    receiverTenantId: string,
    transferId: string,
    userId: string
  ): Promise<{ newAnimal: Animal; transfer: PendingTransfer } | null> {
    const transfer = await this.getPendingTransfer(receiverTenantId, transferId);
    if (!transfer || transfer.receiverTenantId !== receiverTenantId) {
      return null;
    }

    const [originalAnimal] = await db.select()
      .from(animals)
      .where(eq(animals.id, transfer.originalAnimalId))
      .limit(1);

    if (!originalAnimal) {
      throw new Error('Original animal record not found');
    }

    const { id, tenantId, createdAt, updatedAt, petfinderId, petfinderSyncedAt, ...animalData } = originalAnimal;

    const [newAnimal] = await db.insert(animals)
      .values({
        ...animalData,
        tenantId: receiverTenantId,
        status: 'available',
        intakeType: 'transfer',
        intakeDate: new Date(),
        notes: `Transferred from ${transfer.senderOrgName}. Original notes: ${originalAnimal.notes || 'None'}`,
      })
      .returning();

    const originalMedicalExams = await db.select()
      .from(medicalExams)
      .where(eq(medicalExams.animalId, originalAnimal.id));

    if (originalMedicalExams.length > 0) {
      await Promise.all(
        originalMedicalExams.map(async (record) => {
          const { id, animalId, tenantId, createdAt, updatedAt, ...recordData } = record;
          return db.insert(medicalExams)
            .values({
              ...recordData,
              animalId: newAnimal.id,
              tenantId: receiverTenantId,
            });
        })
      );
    }

    await db.update(animals)
      .set({
        status: 'transferred',
        outcomeType: 'transferred',
        outcomeDate: new Date(),
        notes: `${originalAnimal.notes || ''}\n\nTransferred to ${transfer.receiverTenantId} on ${new Date().toLocaleDateString()}`,
        updatedAt: new Date(),
      })
      .where(eq(animals.id, originalAnimal.id));

    const [updatedTransfer] = await db.update(pendingTransfers)
      .set({
        status: 'accepted',
        importedAnimalId: newAnimal.id,
        importedAt: new Date(),
        importedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(pendingTransfers.id, transferId))
      .returning();

    if (transfer.manifestItemId) {
      await db.update(transportManifestItems)
        .set({
          importStatus: 'imported',
          importedAt: new Date(),
          importedAnimalId: newAnimal.id,
          importedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(transportManifestItems.id, transfer.manifestItemId));
    }

    return { newAnimal, transfer: updatedTransfer };
  }

  static async declineTransfer(
    receiverTenantId: string,
    transferId: string,
    reason: string
  ): Promise<PendingTransfer | null> {
    const [updated] = await db.update(pendingTransfers)
      .set({
        status: 'declined',
        declineReason: reason,
        updatedAt: new Date(),
      })
      .where(and(
        eq(pendingTransfers.id, transferId),
        eq(pendingTransfers.receiverTenantId, receiverTenantId)
      ))
      .returning();

    if (updated?.manifestItemId) {
      await db.update(transportManifestItems)
        .set({
          importStatus: 'declined',
          importDeclineReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(transportManifestItems.id, updated.manifestItemId));
    }

    return updated || null;
  }

  // ============================================================================
  // Mobile Run Sheet (Public Access Token)
  // ============================================================================

  static async generateRunSheetToken(
    tenantId: string,
    transportId: string
  ): Promise<string> {
    const token = `runsheet_${transportId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await db.update(transportEvents)
      .set({
        runSheetToken: token,
        runSheetTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportEvents.id, transportId),
        eq(transportEvents.tenantId, tenantId)
      ));

    return token;
  }

  static async getTransportByRunSheetToken(
    token: string
  ): Promise<{ transport: TransportEvent; stops: TransportStop[]; manifestItems: (TransportManifestItem & { animal?: Animal })[] } | null> {
    const [transport] = await db.select()
      .from(transportEvents)
      .where(eq(transportEvents.runSheetToken, token))
      .limit(1);

    if (!transport) return null;

    if (transport.runSheetTokenExpiresAt && new Date(transport.runSheetTokenExpiresAt) < new Date()) {
      return null;
    }

    const stops = await db.select()
      .from(transportStops)
      .where(eq(transportStops.transportId, transport.id))
      .orderBy(asc(transportStops.orderIndex));

    const items = await db.select()
      .from(transportManifestItems)
      .where(eq(transportManifestItems.transportId, transport.id));

    const manifestItems = await Promise.all(
      items.map(async (item) => {
        const [animal] = await db.select()
          .from(animals)
          .where(eq(animals.id, item.animalId))
          .limit(1);
        return { ...item, animal };
      })
    );

    return { transport, stops, manifestItems };
  }

  // ============================================================================
  // Validate All Manifest Items
  // ============================================================================

  static async validateManifest(
    tenantId: string,
    transportId: string
  ): Promise<{ 
    isValid: boolean; 
    canFinalize: boolean;
    summary: { total: number; valid: number; invalid: number; missingCvi: number };
    items: Array<{ animalId: string; animalName: string; errors: string[]; hasCvi: boolean }> 
  }> {
    const manifestItems = await this.listManifestItems(tenantId, transportId);
    const items: Array<{ animalId: string; animalName: string; errors: string[]; hasCvi: boolean }> = [];
    
    let missingCviCount = 0;
    let invalidCount = 0;

    for (const item of manifestItems) {
      const itemErrors: string[] = [];
      
      // Check for CVI (Certificate of Veterinary Inspection / Health Cert) - CRITICAL
      if (!item.hasCvi && !item.hasHealthCertificate) {
        itemErrors.push('Missing CVI / Health Certificate (Required for transport)');
        missingCviCount++;
      }
      
      // Include any existing validation errors
      if (item.documentValidationErrors && item.documentValidationErrors.length > 0) {
        itemErrors.push(...item.documentValidationErrors);
      }

      // Check for photos (recommended but not blocking)
      if (item.animal && (!item.animal.photoUrls || item.animal.photoUrls.length === 0)) {
        itemErrors.push('No photos on file (recommended for identification)');
      }

      if (itemErrors.length > 0) {
        invalidCount++;
      }

      items.push({
        animalId: item.animalId,
        animalName: item.animal?.name || item.animalName || 'Unknown',
        errors: itemErrors,
        hasCvi: item.hasCvi || item.hasHealthCertificate || false,
      });
    }

    // canFinalize = false if ANY animal is missing CVI (blocking validation)
    const canFinalize = missingCviCount === 0;

    return {
      isValid: invalidCount === 0,
      canFinalize,
      summary: {
        total: items.length,
        valid: items.length - invalidCount,
        invalid: invalidCount,
        missingCvi: missingCviCount,
      },
      items,
    };
  }

  // ============================================================================
  // Finalize Manifest (with blocking CVI check)
  // ============================================================================

  static async finalizeManifest(
    tenantId: string,
    transportId: string
  ): Promise<{ success: boolean; error?: string; validation?: any }> {
    // First validate the manifest
    const validation = await this.validateManifest(tenantId, transportId);
    
    if (!validation.canFinalize) {
      return {
        success: false,
        error: `Cannot finalize manifest: ${validation.summary.missingCvi} animal(s) missing CVI/Health Certificate. All animals must have valid health documentation before transport.`,
        validation,
      };
    }

    // Update transport status to confirmed if validation passes
    await db.update(transportEvents)
      .set({ 
        status: 'confirmed',
        updatedAt: new Date(),
      })
      .where(and(
        eq(transportEvents.id, transportId),
        eq(transportEvents.tenantId, tenantId)
      ));

    return { success: true };
  }

  // ============================================================================
  // Transport Timeline Events - Unified Activity Log & Communication
  // ============================================================================

  /**
   * Log a transport event - reusable helper for system and user events
   */
  static async logTransportEvent(
    tenantId: string,
    transportId: string,
    eventType: 'comment' | 'status_change' | 'alert' | 'log',
    message: string,
    options?: {
      userId?: string;
      userName?: string;
      metadata?: {
        stopId?: string;
        stopName?: string;
        latitude?: string;
        longitude?: string;
        delayMinutes?: number;
        previousStatus?: string;
        newStatus?: string;
        animalId?: string;
        animalName?: string;
      };
    }
  ): Promise<TransportTimelineEvent> {
    const [event] = await db.insert(transportTimelineEvents)
      .values({
        tenantId,
        transportId,
        eventType,
        message,
        userId: options?.userId || null,
        userName: options?.userName || null,
        metadata: options?.metadata || null,
      })
      .returning();

    return event;
  }

  /**
   * Get all timeline events for a transport, ordered oldest to newest
   */
  static async getTimelineEvents(
    tenantId: string,
    transportId: string
  ): Promise<(TransportTimelineEvent & { userFullName?: string | null })[]> {
    const events = await db.select({
      id: transportTimelineEvents.id,
      transportId: transportTimelineEvents.transportId,
      tenantId: transportTimelineEvents.tenantId,
      userId: transportTimelineEvents.userId,
      userName: transportTimelineEvents.userName,
      eventType: transportTimelineEvents.eventType,
      message: transportTimelineEvents.message,
      metadata: transportTimelineEvents.metadata,
      createdAt: transportTimelineEvents.createdAt,
      userFullName: users.fullName,
    })
      .from(transportTimelineEvents)
      .leftJoin(users, eq(transportTimelineEvents.userId, users.id))
      .where(and(
        eq(transportTimelineEvents.transportId, transportId),
        eq(transportTimelineEvents.tenantId, tenantId)
      ))
      .orderBy(asc(transportTimelineEvents.createdAt));

    return events;
  }

  /**
   * Add a user comment to the transport timeline
   */
  static async addComment(
    tenantId: string,
    transportId: string,
    userId: string,
    message: string,
    metadata?: { stopId?: string; stopName?: string; latitude?: string; longitude?: string }
  ): Promise<TransportTimelineEvent> {
    // Get user name for caching
    const [user] = await db.select({
      fullName: users.fullName,
    })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userName = user?.fullName || null;

    return this.logTransportEvent(tenantId, transportId, 'comment', message, {
      userId,
      userName: userName || undefined,
      metadata,
    });
  }

  /**
   * Log a traffic/delay alert
   */
  static async logDelayAlert(
    tenantId: string,
    transportId: string,
    delayMinutes: number,
    userId?: string,
    userName?: string
  ): Promise<TransportTimelineEvent> {
    const message = `Reported ${delayMinutes} minute delay due to traffic`;
    return this.logTransportEvent(tenantId, transportId, 'alert', message, {
      userId,
      userName,
      metadata: { delayMinutes },
    });
  }

  /**
   * Log a potty break
   */
  static async logPottyBreak(
    tenantId: string,
    transportId: string,
    userId?: string,
    userName?: string,
    location?: { latitude?: string; longitude?: string }
  ): Promise<TransportTimelineEvent> {
    return this.logTransportEvent(tenantId, transportId, 'log', 'Potty break started', {
      userId,
      userName,
      metadata: location,
    });
  }

  /**
   * Log a stop completion
   */
  static async logStopComplete(
    tenantId: string,
    transportId: string,
    stopId: string,
    stopName: string,
    userId?: string,
    userName?: string
  ): Promise<TransportTimelineEvent> {
    return this.logTransportEvent(tenantId, transportId, 'status_change', `Completed stop: ${stopName}`, {
      userId,
      userName,
      metadata: { stopId, stopName },
    });
  }

  /**
   * Log transport status change
   */
  static async logStatusChange(
    tenantId: string,
    transportId: string,
    previousStatus: string,
    newStatus: string,
    userId?: string,
    userName?: string
  ): Promise<TransportTimelineEvent> {
    return this.logTransportEvent(tenantId, transportId, 'status_change', `Status changed from ${previousStatus} to ${newStatus}`, {
      userId,
      userName,
      metadata: { previousStatus, newStatus },
    });
  }

  /**
   * Depart Transport (Stage 3: Hard Close)
   * Updates transport status to 'in_transit' and batch updates all manifest animals to 'transferred_out'
   */
  static async departTransport(
    tenantId: string,
    transportId: string,
    userId?: string,
    userName?: string
  ): Promise<{ success: boolean; animalsUpdated: number; transport: TransportEvent | null }> {
    const transport = await this.getTransport(tenantId, transportId);
    if (!transport) {
      return { success: false, animalsUpdated: 0, transport: null };
    }

    // Get all manifest items for this transport
    const manifestItems = await this.listManifestItems(tenantId, transportId);
    
    if (manifestItems.length === 0) {
      return { success: false, animalsUpdated: 0, transport: null };
    }

    // Batch update all animals to transferred_out status
    const animalIds = manifestItems.map(item => item.animalId);
    const now = new Date();

    // Get the destination org name from transport
    const destinationOrg = transport.partnerOrganizationName || 'Partner Organization';

    await db.update(animals)
      .set({
        status: 'transferred_out',
        notes: sql`COALESCE(notes, '') || '\n\nTransferred to ' || ${destinationOrg} || ' on ' || ${now.toLocaleDateString()}`,
        updatedAt: now,
      })
      .where(inArray(animals.id, animalIds));

    // Update transport status to in_transit
    const [updatedTransport] = await db.update(transportEvents)
      .set({
        status: 'in_transit',
        departureDate: now,
        updatedAt: now,
      })
      .where(and(
        eq(transportEvents.id, transportId),
        eq(transportEvents.tenantId, tenantId)
      ))
      .returning();

    // Log the departure
    await this.logTransportEvent(tenantId, transportId, 'status_change', `Transport departed with ${animalIds.length} animal(s)`, {
      userId,
      userName,
      metadata: { animalsUpdated: animalIds.length, destination: destinationOrg },
    });

    return { success: true, animalsUpdated: animalIds.length, transport: updatedTransport };
  }
}

export default TransportService;
