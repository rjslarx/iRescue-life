import type { RequestHandler } from "express";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { fundraiserEvents, fundraiserOrders, fundraiserConfirmationDeliveries } from "../../shared/schema";

type Order = typeof fundraiserOrders.$inferSelect & { confirmationStatus: string };
export interface FundraiserOrderReader {
  listPaidOrders(eventId: string, tenantId: string): Promise<Order[]>;
}

/** Keep tenant ownership inside the order query, not a separate preflight check. */
export function createFundraiserOrderReader(db: Pick<NodePgDatabase, "select">): FundraiserOrderReader {
  return {
    async listPaidOrders(eventId, tenantId) {
      const tenantEvents = db.select({ id: fundraiserEvents.id }).from(fundraiserEvents)
        .where(eq(fundraiserEvents.tenantId, tenantId));
      const orders = await db
        .select({ order: fundraiserOrders, confirmationStatus: fundraiserConfirmationDeliveries.status })
        .from(fundraiserOrders)
        .leftJoin(fundraiserConfirmationDeliveries, eq(fundraiserConfirmationDeliveries.orderId, fundraiserOrders.id))
        .where(and(
          eq(fundraiserOrders.eventId, eventId),
          eq(fundraiserOrders.paymentStatus, "paid"),
          inArray(fundraiserOrders.eventId, tenantEvents),
        ))
        .orderBy(fundraiserOrders.createdAt);
      return orders.map(row => ({ ...row.order, confirmationStatus: row.confirmationStatus || "untracked" }));
    },
  };
}

/** Authentication and tenant resolution remain middleware on the production route. */
export function createFundraiserOrdersHandler(reader: FundraiserOrderReader): RequestHandler {
  return async (req, res, next) => {
    try {
      const { eventId } = req.query;
      if (eventId === undefined || eventId === "") {
        res.status(400).json({ error: "eventId query param required" });
        return;
      }
      if (typeof eventId !== "string" || !z.string().uuid().safeParse(eventId).success) {
        res.status(400).json({ error: "eventId must be a single valid UUID" });
        return;
      }
      const orders = await reader.listPaidOrders(eventId, req.tenant!.id);
      res.json({ orders });
    } catch (error) {
      next(error);
    }
  };
}
