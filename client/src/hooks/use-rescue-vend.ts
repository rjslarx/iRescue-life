import { useMutation, useQuery } from "@tanstack/react-query";
import { tenantApiRequest } from "@/lib/tenantApi";
import { useTenant } from "@/contexts/TenantContext";

export interface VendItem {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  impactNote: string;
  badgeColor: string;
  imageUrl: string;
}
export interface VendSession {
  status: "paid" | "pending";
  items: Array<Pick<VendItem, "id" | "code" | "name" | "priceCents"> & { quantity: number }>;
  totalCents: number;
}
export function useRescueVend(sessionId: string | null) {
  const { tenantId } = useTenant();
  const catalog = useQuery<{ rescueName: string; items: VendItem[]; available: boolean }>({
    queryKey: ["rescue-vend", tenantId],
    queryFn: async () => (await tenantApiRequest("GET", "/api/public/rescue-vend")).json(),
    enabled: !!tenantId,
    retry: 1,
  });
  const session = useQuery<VendSession>({
    queryKey: ["rescue-vend-session", tenantId, sessionId],
    queryFn: async () => (await tenantApiRequest("GET", `/api/public/rescue-vend/session?session_id=${encodeURIComponent(sessionId!)}`)).json(),
    enabled: !!tenantId && !!sessionId,
    retry: 1,
    refetchInterval: (query) => query.state.data?.status === "pending" ? 4000 : false,
  });
  const checkout = useMutation({
    mutationFn: async (selection: { items: Array<{ id: string; quantity: number }>; checkoutKey: string }): Promise<{ url: string }> =>
      (await tenantApiRequest("POST", "/api/public/rescue-vend/checkout", selection)).json(),
  });
  return { catalog, session, checkout };
}
