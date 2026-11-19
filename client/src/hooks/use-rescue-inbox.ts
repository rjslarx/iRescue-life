import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { tenantApiRequest } from "@/lib/tenantApi";

export type RescueTeamMember = { id: string; name: string };
export type RescueTopic = { id: string; label: string; keywords: string[]; answer: string; assigneeId: string | null; assigneeIds?: string[]; notificationMode?: "always" | "answer_first" };
export type RescueHelpSettings = { generalAssigneeId?: string | null; weeklyHours?: ({ openHour: number; closeHour: number } | null)[]; smsAlerts?: boolean; voice?: "default" | "man" | "woman"; phone: string; timezone: string; openHour: number; closeHour: number; days: number[]; greeting: string; afterHours: string; handoff: string; emergency: string; teamIds: string[]; topics: RescueTopic[] };
export type RescueSettingsResponse = { admin: boolean; enabled: boolean; number: string | null; settings: RescueHelpSettings; team: RescueTeamMember[]; webhookBase: string };
export type RescueThread = { id: string; phone: string; status: "bot" | "waiting" | "human" | "resolved"; topic: string | null; assigneeId: string | null; updatedAt: string; preview: string };
export type RescueMessage = { id: string; kind: "inbound" | "outbound" | "note" | "voicemail"; body: string; status: string; createdAt: string; authorName: string | null; hasRecording: boolean; mediaCount?: number };
export type RescueThreadDetail = { thread: RescueThread; messages: RescueMessage[] };
export class RescueHelpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function rescueHelpError(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed. Please try again."; }
async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  try {
    const response = await tenantApiRequest(method, `/api/rescue-help${path}`, data);
    if (response.status === 204) return undefined as T;
    return await response.json();
  } catch (error) {
    const match = error instanceof Error ? error.message.match(/^(\d{3}):\s*([\s\S]*)$/) : null;
    if (!match) throw error;
    let message = match[2];
    try { const parsed = JSON.parse(message); message = parsed.error || parsed.message || message; } catch { /* Preserve a plain-text server response. */ }
    throw new RescueHelpError(Number(match[1]), message);
  }
}
export function useRescueHelpAccess() {
  const { tenantId, basePath } = useTenant();
  const { user } = useAuth();
  return useQuery<{ allowed: boolean; admin: boolean }, RescueHelpError>({
    queryKey: ["rescue-help", tenantId, basePath, user?.id, user?.activeRole, "access"],
    queryFn: () => request("GET", "/access"), enabled: !!tenantId && !!user,
    retry: false, refetchInterval: 20000,
  });
}
export function useRescueInbox(selectedId: string | null) {
  const { tenantId, basePath } = useTenant();
  const { user } = useAuth();
  const cache = useQueryClient();
  const key = ["rescue-help", tenantId, basePath, user?.id, user?.activeRole];
  const access = useRescueHelpAccess();
  const enabled = !!tenantId && !!user && access.data?.allowed === true && !access.isError;
  const settings = useQuery<RescueSettingsResponse, RescueHelpError>({ queryKey: [...key, "settings"], queryFn: () => request("GET", "/settings"), enabled, retry: false, refetchInterval: 20000 });
  const threads = useQuery<{ threads: RescueThread[]; team: RescueTeamMember[]; userId: string; admin: boolean }, RescueHelpError>({ queryKey: [...key, "threads"], queryFn: () => request("GET", "/threads"), enabled, retry: false, refetchInterval: 20000 });
  const detail = useQuery<RescueThreadDetail, RescueHelpError>({ queryKey: [...key, "thread", selectedId], queryFn: () => request("GET", `/threads/${encodeURIComponent(selectedId!)}`), enabled: enabled && !!selectedId, retry: false, refetchInterval: 20000 });
  const refresh = () => { void cache.invalidateQueries({ queryKey: key }); };
  const saveSettings = useMutation({ mutationFn: (data: RescueHelpSettings) => request("PUT", "/settings", data), retry: false, onSuccess: refresh });
  const activate = useMutation({ mutationFn: () => request("POST", "/activate", {}), retry: false, onSuccess: refresh });
  const disable = useMutation({ mutationFn: () => request("POST", "/disable", {}), retry: false, onSuccess: refresh });
  const claim = useMutation({ mutationFn: (id: string) => request("POST", `/threads/${encodeURIComponent(id)}/claim`, {}), retry: false, onSuccess: refresh, onError: refresh });
  const update = useMutation({ mutationFn: ({ id, ...data }: { id: string; status?: "waiting" | "human" | "resolved"; assigneeId?: string | null }) => request("POST", `/threads/${encodeURIComponent(id)}/update`, data), retry: false, onSuccess: refresh });
  const send = useMutation({ mutationFn: ({ id, ...data }: { id: string; body: string; requestId: string; kind: "outbound" | "note" }) => request("POST", `/threads/${encodeURIComponent(id)}/messages`, data), retry: false, onSuccess: refresh });
  const deleteVoicemail = useMutation({ mutationFn: (id: string) => request("DELETE", `/messages/${encodeURIComponent(id)}/audio`), retry: false, onSuccess: refresh, onError: refresh });
  return { scope: key.join(":"), access, settings, threads, detail, saveSettings, activate, disable, claim, update, send, deleteVoicemail };
}
export type RescueInboxApi = ReturnType<typeof useRescueInbox>;
