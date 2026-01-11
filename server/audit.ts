import { db } from './db';
import { auditLogs, type InsertAuditLog } from '@shared/schema';
import type { Request } from 'express';

interface AuditLogParams {
  userId: string;
  tenantId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata?: Record<string, any>;
  req?: Request;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  const {
    userId,
    tenantId = null,
    action,
    entityType,
    entityId,
    changes,
    metadata,
    req,
  } = params;

  const auditEntry: InsertAuditLog = {
    userId,
    tenantId: tenantId || null,
    action,
    entityType: entityType || null,
    entityId: entityId || null,
    changes: changes as any || null,
    metadata: metadata as any || null,
    ipAddress: req ? getClientIp(req) : null,
    userAgent: req ? req.get('user-agent') : null,
  };

  await db.insert(auditLogs).values([auditEntry]);
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string | undefined {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}
