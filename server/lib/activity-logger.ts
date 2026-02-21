import { db } from "../db";
import { activityLogs, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export type ActivityCategory = "intake" | "medical" | "movement" | "adoption" | "finance" | "user" | "system";

export interface LogActivityParams {
  tenantId: string;
  userId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  description: string;
  category: ActivityCategory;
  metadata?: Record<string, any>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      tenantId: params.tenantId,
      userId: params.userId || null,
      entityType: params.entityType,
      entityId: params.entityId || null,
      action: params.action,
      description: params.description,
      category: params.category,
      metadata: params.metadata || null,
    });
  } catch (error) {
    console.error("[Activity Logger] Failed to log activity:", error);
  }
}

export interface ActivityLogWithUser {
  id: string;
  tenantId: string;
  userId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  description: string;
  category: ActivityCategory;
  metadata: Record<string, any> | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

export async function getRecentActivity(tenantId: string, limit: number = 20): Promise<ActivityLogWithUser[]> {
  const logs = await db
    .select({
      id: activityLogs.id,
      tenantId: activityLogs.tenantId,
      userId: activityLogs.userId,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      action: activityLogs.action,
      description: activityLogs.description,
      category: activityLogs.category,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.tenantId, tenantId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return logs.map(log => ({
    id: log.id,
    tenantId: log.tenantId,
    userId: log.userId,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    description: log.description,
    category: log.category as ActivityCategory,
    metadata: log.metadata,
    createdAt: log.createdAt,
    user: log.userId ? {
      id: log.userId,
      name: log.userName || 'Unknown',
      email: log.userEmail || '',
      avatarUrl: null,
    } : null,
  }));
}

export function createActivityDescription(
  action: string,
  entityType: string,
  entityName?: string,
  details?: string
): string {
  const actionVerb = action.toLowerCase();
  const entity = entityType.toLowerCase();
  
  if (entityName && details) {
    return `${capitalizeFirst(actionVerb)} ${entity} "${entityName}": ${details}`;
  } else if (entityName) {
    return `${capitalizeFirst(actionVerb)} ${entity} "${entityName}"`;
  } else if (details) {
    return `${capitalizeFirst(actionVerb)} ${entity}: ${details}`;
  }
  return `${capitalizeFirst(actionVerb)} ${entity}`;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
