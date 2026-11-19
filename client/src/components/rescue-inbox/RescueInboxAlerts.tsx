import type { RescueInboxApi } from "@/hooks/use-rescue-inbox";
import { helpAlertStatus } from "@shared/rescue-help-alert-status";

const time = (value: string) => new Date(value).toLocaleString();

export function RescueInboxAlerts({ api }: { api: RescueInboxApi }) {
  const query = api.alerts;
  return <details className="ri-detail-head">
    <summary className="cursor-pointer font-medium">Volunteer SMS alerts · Admin only</summary>
    <p className="ri-muted mt-2">Latest alert per volunteer, not a delivery receipt or complete history. Personal-phone alerts contain only a generic notice and inbox link.</p>
    {query.isError ? <div role="alert" className="ri-error">Alert status could not load. <button className="ri-btn" onClick={() => void query.refetch()}>Retry status check</button></div> :
      !query.data ? <p role="status">Loading alert status…</p> :
      query.data.alerts.length === 0 ? <p className="ri-muted mt-2">No volunteer alerts recorded for this conversation. Alerts may be disabled or not required by the category settings.</p> :
      <ul className="space-y-3 mt-3">{query.data.alerts.map(alert => <li key={alert.userId}>
        <strong>{alert.recipientName || "Unavailable team member"}</strong>
        <p>{helpAlertStatus(alert.status, alert.reason)}</p>
        <small className="ri-muted">Event: {time(alert.eventAt)}{alert.attemptedAt ? ` · Last attempt: ${time(alert.attemptedAt)}` : ""}{alert.status === "pending" ? ` · Next check: ${time(alert.dueAt)}` : ""}</small>
      </li>)}</ul>}
    <p className="ri-muted mt-2">Uncertain attempts may have reached the provider. They are not retried automatically, including when new messages arrive. Check the inbox directly.</p>
  </details>;
}
