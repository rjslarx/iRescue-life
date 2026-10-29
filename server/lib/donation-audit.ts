/** Trusted server identity only. Never accept attribution from request bodies. */
export function donationRecorder(user: { id: string; fullName?: string | null }) {
  return {
    recordedByUserId: user.id,
    recordedByName: user.fullName?.trim() || "Staff member",
  };
}

// created_at is already the database-owned entry timestamp; date is the gift date.
export const donationAuditSchemaSql = `
ALTER TABLE donations ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS recorded_by_name text;
WITH evidence AS (
  SELECT d.id, min(a.user_id::text)::uuid AS user_id
  FROM donations d
  JOIN activity_logs a ON a.tenant_id = d.tenant_id
    AND a.entity_id = d.id::text AND a.entity_type = 'Donation' AND a.action = 'created'
  WHERE d.recorded_by_user_id IS NULL AND d.recorded_by_name IS NULL
    AND d.source = 'manual' AND a.user_id IS NOT NULL
  GROUP BY d.id HAVING count(DISTINCT a.user_id) = 1
)
UPDATE donations d SET recorded_by_user_id = e.user_id,
  recorded_by_name = coalesce(nullif(trim(u.full_name), ''), 'Staff member')
FROM evidence e JOIN users u ON u.id = e.user_id
WHERE d.id = e.id AND d.recorded_by_user_id IS NULL AND d.recorded_by_name IS NULL;
`;
