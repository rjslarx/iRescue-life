export const helpCallLabels: Record<string, string> = {
  starting: "Starting callback", ringing_staff: "Ringing your phone",
  awaiting_confirmation: "Waiting for you to press 1", connecting: "Connecting caller",
  ringing_caller: "Ringing caller", in_progress: "Call in progress", completed: "Call ended",
  busy: "Busy", no_answer: "No answer", failed: "Call failed", canceled: "Canceled",
  declined: "Declined", no_confirmation: "No confirmation", blocked: "Connection blocked",
  expired: "Confirmation expired", unknown: "Call status unknown",
};
export type HelpCallView = {
  id: string; initiatedBy: string; status: string; active: boolean; createdAt: string;
};
export type HelpCallsResponse = {
  calls: HelpCallView[]; canCall: boolean; staffPhone: string | null; reason: string | null;
};
