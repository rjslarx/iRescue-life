import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { tenantApiRequest, tenantFetch } from "@/lib/tenantApi";
import type { ResaleItemInput, ResalePickup } from "@shared/rescue-resale";

export type ResaleItem = {
  id: string; title: string; description: string; category: string; zip: string;
  askingCents: number; photos: string[]; fulfillment: string[]; status: string; createdAt: string;
  reviewNote?: string | null; donorName?: string; donorEmail?: string; donorPhone?: string;
};
export type ResaleConversation = {
  deliverySummary?: { recipient: string; status: string; count: number }[];
  id: string; code: string; itemId: string; itemTitle: string; role: "buyer" | "donor";
  offerCents: number | null; offerStatus: "none" | "pending" | "accepted" | "declined" | "countered" | "expired" | "paid";
  expiresAt: string | null; updatedAt: string;
  messages: { body: string; sender: string; createdAt: string; status: string;
    deliveries?: { recipient: string; status: string; errorCode: string | null; updatedAt: string }[] }[];
};
export type ResaleOrder = {
  id: string; itemTitle: string; amountCents: number; status: string;
  pickup: ResalePickup | null; createdAt: string; buyerPhone?: string;
  stripeSessionId?: string | null; stripePaymentIntentId?: string | null;
  stripeFeeCents?: number | null; platformFeeCents?: number | null;
  rescueProceedsCents?: number | null; refundedCents?: number;
  notificationStatus?: { buyer: string; donor: string };
};
export type ResaleConfig = { enabled: boolean; checkoutEnabled: boolean; rescueName: string; pickupOptions: ResalePickup[] };
export type ResaleActivity = { items: ResaleItem[]; conversations: ResaleConversation[]; orders: ResaleOrder[] };
export type ResaleAdmin = { settings: { pickupOptions: ResalePickup[] }; items: ResaleItem[]; conversations: ResaleConversation[]; orders: ResaleOrder[] };
const prefix = "/api/rescue-resale";
export const resaleMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
export function resaleCents(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter a dollar amount with no more than two decimal places.");
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 500000) throw new Error("Amounts must be between $1 and $5,000.");
  return cents;
}
export function resaleError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";
  const issues = (error as Error & { issues?: { message: string; path?: (string | number)[] }[] }).issues;
  if (issues?.length) return issues.map(issue => `${issue.path?.length ? `${issue.path.join(" ")}: ` : ""}${issue.message}`).join(" · ");
  const json = error.message.match(/^\d{3}:\s*([\s\S]+)$/)?.[1];
  if (json) {
    try { const parsed = JSON.parse(json); return typeof parsed.error === "string" ? parsed.error : typeof parsed.message === "string" ? parsed.message : "The request could not be completed. Please review your details and try again."; } catch { /* Plain-text errors remain readable. */ }
  }
  if (/\b401\b/.test(error.message)) return "Your verification has expired. Sign out below and verify your phone again.";
  return error.message;
}
export function useResaleConfig() {
  const { tenantId, basePath } = useTenant();
  return useQuery<ResaleConfig>({
    queryKey: ["rescue-resale", tenantId, basePath, "config"],
    queryFn: async () => (await tenantApiRequest("GET", `${prefix}/config`)).json(),
    enabled: !!tenantId, retry: 1,
  });
}
export function useRescueResale({ admin = false, orderId = null, activityOpen = false, deliveryStatus = "all" }: { admin?: boolean; orderId?: string | null; activityOpen?: boolean; deliveryStatus?: string } = {}) {
  const { tenantId, basePath } = useTenant();
  const cache = useQueryClient();
  const scope = `${window.location.host}:${tenantId || ""}:${basePath}`;
  const storageKey = `rescue-resale-token:${scope}`;
  const [saved, setSaved] = useState<{ scope: string; token: string }>(() => {
    try { return { scope, token: sessionStorage.getItem(storageKey) || "" }; }
    catch { return { scope, token: "" }; }
  });
  // Never reuse a token when navigating between tenants in the same React tree.
  const token = saved.scope === scope ? saved.token : "";
  const key = ["rescue-resale", tenantId, basePath];
  const saveToken = (next: string) => {
    try { next ? sessionStorage.setItem(storageKey, next) : sessionStorage.removeItem(storageKey); } catch { /* In-memory verification still works. */ }
    setSaved({ scope, token: next });
    cache.removeQueries({ queryKey: [...key, "me"] });
    cache.removeQueries({ queryKey: [...key, "order"] });
  };
  const request = async <T,>(method: string, path: string, data?: unknown, verified = false): Promise<T> => {
    // tenantApiRequest has no custom-header argument. Verified requests use the
    // same tenant-aware fetch layer so the token never enters a URL or JSON log.
    const response = verified
      ? await tenantFetch(`${prefix}${path}`, { method, headers: { "Content-Type": "application/json", "X-Resale-Token": token }, body: data === undefined ? undefined : JSON.stringify(data) })
      : await tenantApiRequest(method, `${prefix}${path}`, data);
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    return response.json();
  };
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: key });
  };
  const config = useResaleConfig();
  const items = useQuery<{ items: ResaleItem[] }>({
    queryKey: [...key, "items"], queryFn: () => request("GET", "/items"),
    enabled: !!tenantId && !admin && !!config.data?.enabled, retry: 1,
  });
  const me = useQuery<ResaleActivity>({
    queryKey: [...key, "me", !!token], queryFn: () => request("GET", "/me", undefined, true),
    enabled: !!tenantId && !!token && !admin, retry: false,
    refetchInterval: activityOpen && !!token ? 12000 : false,
  });
  const adminData = useQuery<ResaleAdmin>({
    queryKey: [...key, "admin", deliveryStatus], queryFn: () => request("GET", `/admin?deliveryStatus=${encodeURIComponent(deliveryStatus)}`),
    enabled: !!tenantId && admin, retry: 1,
  });
  const order = useQuery<ResaleOrder>({
    queryKey: [...key, "order", orderId, !!token],
    queryFn: () => request("GET", `/orders/${encodeURIComponent(orderId!)}`, undefined, true),
    enabled: !!tenantId && !!token && !!orderId && !admin, retry: false,
  });
  const requestCode = useMutation({
    mutationFn: (data: { phone: string; consent: true }) => request<{ challengeId: string }>("POST", "/auth/request", data),
  });
  const verifyCode = useMutation({
    mutationFn: (data: { challengeId: string; code: string }) => request<{ token: string }>("POST", "/auth/verify", data),
    onSuccess: (data) => saveToken(data.token),
  });
  const upload = useMutation({
    mutationFn: async (file: File): Promise<{ imageUrl: string }> => {
      const form = new FormData(); form.append("file", file);
      const response = await tenantFetch(`${prefix}/images`, { method: "POST", headers: { "X-Resale-Token": token }, body: form });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return response.json();
    },
  });
  const createItem = useMutation({
    mutationFn: (data: ResaleItemInput) => request<{ id: string }>("POST", "/items", data, true), onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => request("POST", `/items/${encodeURIComponent(id)}/withdraw`, {}, true), onSuccess: refresh,
  });
  const startMessage = useMutation({
    mutationFn: ({ id, ...data }: { id: string; body: string; offerCents?: number }) => request<{ id: string }>("POST", `/items/${encodeURIComponent(id)}/messages`, data, true), onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => request("POST", `/conversations/${encodeURIComponent(id)}/messages`, { body }, true), onSuccess: refresh,
  });
  const offer = useMutation({
    mutationFn: ({ id, ...data }: { id: string; action: "accept" | "decline" | "counter"; amountCents?: number }) => request("POST", `/conversations/${encodeURIComponent(id)}/offer`, data, true), onSuccess: refresh,
  });
  const checkout = useMutation({
    mutationFn: (data: { itemId: string; conversationId?: string; pickupId: string }) => request<{ url: string }>("POST", "/checkout", data, true),
    onSuccess: ({ url }) => {
      const destination = new URL(url);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com") throw new Error("Checkout returned an invalid destination. Please try again.");
      window.location.assign(destination.href);
    },
  });
  const cancelOrder = useMutation({
    mutationFn: (id: string) => request<{ ok: boolean }>("POST", `/orders/${encodeURIComponent(id)}/cancel`, {}, true),
    onSuccess: refresh,
  });
  const settings = useMutation({
    mutationFn: (data: { pickupOptions: ResalePickup[] }) => request("PUT", "/admin/settings", data), onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: "active" | "rejected"; note: string }) => request("POST", `/admin/items/${encodeURIComponent(id)}/review`, data), onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (id: string) => request("POST", `/admin/orders/${encodeURIComponent(id)}/complete`, {}), onSuccess: refresh,
  });
  const sync = useMutation({
    mutationFn: (id: string) => request("POST", `/admin/orders/${encodeURIComponent(id)}/sync`, {}), onSuccess: refresh,
  });
  const ledger = useMutation({
    mutationFn: async () => {
      const response = await tenantApiRequest("GET", `${prefix}/admin/ledger.csv`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "rescue-resale-ledger.csv"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return { config, items, me, adminData, order, token, signOut: () => saveToken(""), requestCode, verifyCode, upload, createItem, withdraw, startMessage, reply, offer, checkout, cancelOrder, settings, review, complete, sync, ledger };
}
export type ResaleClient = ReturnType<typeof useRescueResale>;
