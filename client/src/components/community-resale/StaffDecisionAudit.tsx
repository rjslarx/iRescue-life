import { date, human } from "./CommunityUI";

type AuditEntry = {
  auditId?: string;
  action: string;
  actor: string | null;
  createdAt: string;
  data: unknown;
};

export function StaffDecisionAudit({ entries }: { entries?: AuditEntry[] }) {
  return <details><summary>Staff decision audit</summary>
    {entries?.length ? entries.map((entry, index) =>
      <div className="cr-safeguard-record" key={entry.auditId || `${entry.createdAt}:${index}`}>
        <strong>{human(entry.action)}</strong>
        <p>{human(entry.actor)} · {date(entry.createdAt)}</p>
        {entry.auditId && <p className="cr-safeguard-audit">Receipt reference: <code>{entry.auditId}</code></p>}
        <pre className="cr-safeguard-audit">{JSON.stringify(entry.data, null, 2)}</pre>
      </div>
    ) : <p className="cr-muted">No staff decision audit entries reported.</p>}
  </details>;
}
