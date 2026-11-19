// Fixed copy only: never expose provider errors, phone numbers, or caller content.
export function helpAlertStatus(status: string, reason: string | null): string {
  if (status === "accepted") return "Provider accepted — delivery not confirmed";
  if (status === "sending" || status === "unknown") return "Attempt uncertain — no automatic retry";
  if (status === "failed") return "Failed — provider acceptance not recorded";
  if (status === "pending") {
    if (reason === "quiet_hours") return "Deferred — quiet hours";
    if (reason === "communications_paused") return "Deferred — communications paused";
    if (reason === "line_inactive") return "Deferred — help line inactive";
    return "Pending — waiting for grouped alert";
  }
  if (status === "skipped") {
    if (reason === "opt_out") return "Not sent — SMS opt-out";
    if (reason === "missing_number") return "Not sent — missing or invalid phone number";
    if (reason === "inactive_user") return "Not sent — volunteer inactive or unavailable";
    if (reason === "alerts_disabled") return "Not sent — alerts disabled";
    if (reason === "not_recipient") return "Not sent — no longer a recipient";
    return "Not sent — reason not recorded";
  }
  return "Status unavailable";
}
