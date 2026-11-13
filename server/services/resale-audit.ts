import { z } from "zod";

export const resaleAuditFilter = z.enum(["all", "attention", "undelivered", "failed", "not_sent", "unknown"]);
export const resaleAuditOffset = z.string().regex(/^(0|[1-9]\d*)$/).transform(Number)
  .pipe(z.number().int().min(0).max(2147483647));
export const resaleMessageAuditQuery = `
  SELECT m.body,m.sender,m.status,m.created_at AS "createdAt",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('recipient',d.recipient,'status',d.status,
      'errorCode',d.error_code,'updatedAt',d.updated_at) ORDER BY d.created_at,d.id)
      FROM rescue_resale_deliveries d WHERE d.message_id=m.id AND d.tenant_id=$2),'[]'::jsonb) AS deliveries
  FROM rescue_resale_messages m
  JOIN rescue_resale_conversations c ON c.id=m.conversation_id AND c.tenant_id=$2
  WHERE m.conversation_id=$1 ORDER BY m.created_at,m.id LIMIT 301 OFFSET $3`;

// Aggregate the entire history before limiting conversations. Never select phone
// numbers, provider IDs, or message bodies into the overview.
export const resaleAuditQuery = `
  SELECT c.*,i.data->>'title' AS item_title,a.outcomes AS delivery_summary
  FROM rescue_resale_conversations c
  JOIN rescue_resale_items i ON i.id=c.item_id AND i.tenant_id=c.tenant_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'recipient',s.recipient,'status',s.status,'count',s.count)), '[]'::jsonb) AS outcomes
    FROM (
      SELECT o.recipient,o.status,count(*)::int AS count FROM (
        SELECT CASE WHEN d.recipient IN ('buyer','donor') THEN d.recipient ELSE 'unknown' END AS recipient,d.status
        FROM rescue_resale_messages m JOIN rescue_resale_deliveries d
          ON d.message_id=m.id AND d.tenant_id=c.tenant_id
        WHERE m.conversation_id=c.id
        UNION ALL
        SELECT 'unknown',m.status FROM rescue_resale_messages m
        WHERE m.conversation_id=c.id AND m.status IN ('undelivered','failed','not_sent','unknown')
          AND NOT EXISTS (SELECT 1 FROM rescue_resale_deliveries d WHERE d.message_id=m.id AND d.tenant_id=c.tenant_id)
      ) o WHERE o.status IN ('undelivered','failed','not_sent','unknown')
      GROUP BY o.recipient,o.status
    ) s
  ) a
  WHERE c.tenant_id=$1 AND (
    $2='all' OR ($2='attention' AND jsonb_array_length(a.outcomes)>0)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(a.outcomes) o WHERE o->>'status'=$2)
  )
  ORDER BY c.updated_at DESC,c.id LIMIT 101 OFFSET $3`;
