import { useMutation, useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { hasFreeSquaresAccess } from "@shared/free-squares";
import type { FreeSquareBoard, FreeSquareMessage, FreeSquareReservation } from "@shared/free-squares";

export const FREE_SQUARES_STAFF_ROLES = ["owner", "admin", "board_member", "staff", "platform_admin"] as const;
export function canManageFreeSquares(tenantId: string | null | undefined, role: string | null | undefined) {
  return hasFreeSquaresAccess(tenantId) && !!role && FREE_SQUARES_STAFF_ROLES.some(value => value === role);
}
export type BoardInput = Pick<FreeSquareBoard, "title" | "description" | "status" | "home_team" | "away_team" | "home_score" | "away_score" | "email_subject" | "email_template" | "sms_template">;
export type BoardDetail = { board: FreeSquareBoard; reservations: FreeSquareReservation[]; messages: FreeSquareMessage[] };
export type PublicBoardData = {
  board: Pick<FreeSquareBoard, "id" | "title" | "description" | "status" | "home_team" | "away_team" | "home_score" | "away_score">;
  claimedSquares: number[];
};
export async function squareRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await apiRequest(method, url, body);
  return response.json();
}
export function squareError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
export function squareErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
}
export function useFreeSquaresAccess() {
  const { tenantId } = useTenant();
  const { user, isLoading: authLoading } = useAuth();
  const tenant = useQuery<{ tenant: { id: string; name: string } }>({
    queryKey: ["/api/tenant"],
  });
  return {
    allowed: canManageFreeSquares(tenant.data?.tenant.id, user?.activeRole),
    publicAllowed: hasFreeSquaresAccess(tenant.data?.tenant.id),
    loading: authLoading || tenant.isLoading,
    tenantLoading: tenant.isLoading,
    error: tenant.error,
    retry: tenant.refetch,
    tenantId,
    tenant: tenant.data?.tenant,
    user,
  };
}
export function useFreeSquareBoards(enabled: boolean) {
  const { tenantId } = useTenant();
  return useQuery<{ boards: FreeSquareBoard[] }>({
    queryKey: ["/api/free-squares", tenantId],
    queryFn: () => squareRequest("GET", "/api/free-squares"),
    enabled,
  });
}
export function useFreeSquareDetail(id: string | null, enabled: boolean) {
  const { tenantId } = useTenant();
  return useQuery<BoardDetail>({
    queryKey: [`/api/free-squares/${id}`, tenantId],
    queryFn: () => squareRequest("GET", `/api/free-squares/${id}`),
    enabled: enabled && !!id,
    refetchInterval: enabled && !!id ? 10000 : false,
  });
}
export function usePublicFreeSquare(id: string, enabled: boolean) {
  const { tenantId } = useTenant();
  return useQuery<PublicBoardData>({
    queryKey: [`/api/free-squares/public/${id}`, tenantId],
    queryFn: () => squareRequest("GET", `/api/free-squares/public/${id}`),
    enabled: enabled && !!id,
    refetchInterval: enabled ? 10000 : false,
  });
}
export function useSaveFreeSquareBoard() {
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<BoardInput> }) =>
      squareRequest<{ board: FreeSquareBoard }>(id ? "PATCH" : "POST", id ? `/api/free-squares/${id}` : "/api/free-squares", data),
    onSuccess: ({ board }) => {
      queryClient.setQueryData<{ boards: FreeSquareBoard[] }>(["/api/free-squares", tenantId], old =>
        old ? { boards: old.boards.some(item => item.id === board.id) ? old.boards.map(item => item.id === board.id ? { ...item, ...board } : item) : [board, ...old.boards] } : { boards: [board] });
      queryClient.setQueryData<BoardDetail>([`/api/free-squares/${board.id}`, tenantId], old => old ? { ...old, board } : undefined);
      void queryClient.invalidateQueries({ queryKey: [`/api/free-squares/public/${board.id}`, tenantId] });
    },
  });
}
export function useReleaseFreeSquare(id: string) {
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (reservationId: string) => squareRequest<{ success: true }>("POST", `/api/free-squares/${id}/reservations/${reservationId}/cancel`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/free-squares/${id}`, tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/free-squares", tenantId] });
      void queryClient.invalidateQueries({ queryKey: [`/api/free-squares/public/${id}`, tenantId] });
    },
  });
}
export function useSendFreeSquareMessage(id: string) {
  const { tenantId } = useTenant();
  return useMutation({
    retry: false,
    mutationFn: ({ reservationId, data }: { reservationId: string; data: { requestKey: string; channel: "email" | "sms"; subject?: string; body: string } }) =>
      squareRequest<{ message: FreeSquareMessage }>("POST", `/api/free-squares/${id}/reservations/${reservationId}/messages`, data),
    onSuccess: ({ message }) => {
      queryClient.setQueryData<BoardDetail>([`/api/free-squares/${id}`, tenantId], old =>
        old ? { ...old, messages: [message, ...old.messages.filter(item => item.id !== message.id)] } : undefined);
    },
    onError: () => {
      // Fetch persisted sending/unknown/failed records; never retry a send automatically.
      void queryClient.invalidateQueries({ queryKey: [`/api/free-squares/${id}`, tenantId] });
    },
  });
}
