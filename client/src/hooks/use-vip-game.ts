import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VipGameId } from "@shared/vip-games";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

export const pilotPath = "/api/platform/vip-game-pilot";

// Platform requests deliberately bypass tenant URL rewriting.
export async function pilotRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "same-origin", signal,
    headers: { ...getTenantHeaders(), ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    // Express req.is() checks for a body as well as Content-Type. Send an
    // explicit JSON body for preview/revoke too, including DELETE requests.
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return readResponse<T>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || data.message || `Request failed (${response.status}). Please try again.`), { status: response.status });
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function donorGameRequest<T>(token: string, action: "access" | "launch" | "start", signal?: AbortSignal, gameId?: VipGameId): Promise<T> {
  const query = action !== "access" && gameId ? `?gameId=${encodeURIComponent(gameId)}` : "";
  const response = await fetch(buildTenantUrl(`/api/vip-portal/game/${action}${query}`), {
    method: action === "access" ? "GET" : "POST",
    credentials: "same-origin", signal,
    headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` },
  });
  return readResponse<T>(response);
}

// Team sessions never send donor tokens or use donor activity endpoints.
export async function teamGameRequest<T>(action: "access" | "launch" | "start", signal?: AbortSignal, gameId?: VipGameId): Promise<T> {
  const isGet = action === "access";
  const query = !isGet && gameId ? `?gameId=${encodeURIComponent(gameId)}` : "";
  const response = await fetch(buildTenantUrl(`/api/team-games/${action}${query}`), {
    method: isGet ? "GET" : "POST",
    credentials: "same-origin",
    signal,
    headers: { ...getTenantHeaders(), ...(!isGet ? { "Content-Type": "application/json" } : {}) },
    body: isGet ? undefined : JSON.stringify({}),
  });
  return readResponse<T>(response);
}

export function useTeamGameAccess() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { tenantId } = useTenant();
  return useQuery<{ eligible: boolean }, Error & { status?: number }>({
    queryKey: ["/api/team-games/access", tenantId, user?.tenantId, user?.id, user?.activeRole, user?.roles],
    queryFn: ({ signal }) => teamGameRequest("access", signal),
    enabled: !isLoading && isAuthenticated && !!user,
    refetchOnWindowFocus: "always",
    refetchInterval: 60000,
    staleTime: 0,
    retry: false,
  });
}

export interface PilotTenant {
  id: string;
  name: string;
  enabled: boolean;
  invitedCount: number;
  starts: number;
  players: number;
  returningPlayers: number;
}
export interface PilotInvitation { donorId: string; name: string; email: string; eligible: boolean }
export interface PilotDetails { enabled: boolean; invitations: PilotInvitation[] }

export function usePilotTenants(enabled: boolean) {
  return useQuery({
    queryKey: [pilotPath],
    queryFn: ({ signal }) => pilotRequest<{ tenants: PilotTenant[] }>(pilotPath, "GET", undefined, signal),
    enabled,
  });
}

export function usePilotDetails(tenantId: string, enabled: boolean) {
  return useQuery({
    queryKey: [pilotPath, tenantId],
    queryFn: ({ signal }) => pilotRequest<PilotDetails>(`${pilotPath}/${encodeURIComponent(tenantId)}`, "GET", undefined, signal),
    enabled: enabled && !!tenantId,
  });
}

type PilotUpdate =
  | { tenantId: string; action: "toggle"; enabled: boolean }
  | { tenantId: string; action: "invite"; email: string }
  | { tenantId: string; action: "revoke"; donorId: string };

export function usePilotUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (update: PilotUpdate) => {
      const path = `${pilotPath}/${encodeURIComponent(update.tenantId)}`;
      if (update.action === "toggle") {
        await pilotRequest(path, "PUT", { enabled: update.enabled });
        return { message: update.enabled ? "Pilot enabled. Rescue staff, volunteers, and invited Rescue Pack members can play." : "Pilot disabled. Team and invited Rescue Pack access is paused." };
      }
      if (update.action === "invite") {
        const result = await pilotRequest<{ sent: boolean; message: string }>(`${path}/invitations`, "POST", { email: update.email });
        return { message: result.message || (result.sent ? "Invitation sent." : "Access granted, but the invitation email was not sent.") };
      }
      await pilotRequest(`${path}/invitations/${encodeURIComponent(update.donorId)}`, "DELETE");
      return { message: "Invitation revoked. This donor no longer has pilot access." };
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: [pilotPath] }); },
  });
}
