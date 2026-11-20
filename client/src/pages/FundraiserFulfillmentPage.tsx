import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fundraiserOrderReference, matchesFundraiserOrder } from "@shared/fundraiser-order-reference";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, PackageCheck, Users, DollarSign, CheckSquare } from "lucide-react";
import type { FundraiserEvent, FundraiserOrder } from "@shared/schema";

type Filter = "all" | "pending" | "picked-up";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function FundraiserFulfillmentPage() {
  const [, params] = useRoute("/dashboard/fundraisers/:eventId");
  const eventId = params?.eventId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [optimisticPickups, setOptimisticPickups] = useState<Record<string, boolean>>({});

  const { data: eventData, isLoading: eventLoading } = useQuery<{ event: FundraiserEvent & { soldCount: number } }>({
    queryKey: ["/api/fundraiser-events", eventId, "public"],
    queryFn: async () => {
      const res = await fetch(`/api/fundraiser-events/${eventId}/public`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!eventId,
    refetchInterval: 30000,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ orders: (FundraiserOrder & { confirmationStatus: string })[] }>({
    queryKey: ["/api/fundraiser-orders", eventId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/fundraiser-orders?eventId=${eventId}`);
      return await res.json();
    },
    enabled: !!eventId,
    refetchInterval: 30000,
  });

  const retryConfirmation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/fundraiser-orders/${orderId}/retry-confirmation`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/fundraiser-orders", eventId] });
      toast({ title: "Retry processed", description: "Check the email status for the result." });
    },
    onError: () => toast({ title: "Could not retry confirmation", description: "Refresh the order status and try again.", variant: "destructive" }),
  });

  const pickupMutation = useMutation({
    mutationFn: async ({ orderId, pickedUp }: { orderId: string; pickedUp: boolean }) => {
      const res = await apiRequest("PATCH", `/api/fundraiser-orders/${orderId}/pickup`, { pickedUp });
      return await res.json() as { order: FundraiserOrder };
    },
    onMutate: async ({ orderId, pickedUp }) => {
      await qc.cancelQueries({ queryKey: ["/api/fundraiser-orders", eventId] });
      setOptimisticPickups((prev) => ({ ...prev, [orderId]: pickedUp }));
    },
    onSuccess: ({ order }) => {
      qc.setQueryData<{ orders: FundraiserOrder[] }>(["/api/fundraiser-orders", eventId], (data) =>
        data ? { ...data, orders: data.orders.map((existing) => existing.id === order.id ? order : existing) } : data);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update pickup status.", variant: "destructive" });
    },
    onSettled: async (_, __, { orderId }) => {
      // Never leave an optimistic override masking another volunteer's changes.
      setOptimisticPickups((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["/api/fundraiser-orders", eventId] });
    },
  });

  const event = eventData?.event;
  const orders = ordersData?.orders ?? [];

  const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
  const totalRevenue = event ? totalQty * event.priceCents : 0;
  const pickedUpCount = orders.filter((o) => (optimisticPickups[o.id] !== undefined ? optimisticPickups[o.id] : o.pickedUp)).length;

  const filteredOrders = orders.filter((o) => {
    if (!matchesFundraiserOrder(o, search)) return false;
    const isPickedUp = optimisticPickups[o.id] !== undefined ? optimisticPickups[o.id] : o.pickedUp;
    if (filter === "pending") return !isPickedUp;
    if (filter === "picked-up") return isPickedUp;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/fundraisers">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Events & Products
            </Link>
          </Button>
        </div>

        {eventLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold">{event?.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCents(event?.priceCents ?? 0)} per item
              {event?.inventoryCap != null && ` · ${event.inventoryCap} cap`}
            </p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2 flex-wrap">
              <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2 flex-wrap">
              <CardTitle className="text-sm font-medium text-muted-foreground">Items Sold</CardTitle>
              <PackageCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalQty}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2 flex-wrap">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCents(totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2 flex-wrap">
              <CardTitle className="text-sm font-medium text-muted-foreground">Picked Up</CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pickedUpCount} / {orders.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter tabs */}
        <Input aria-label="Search orders by number, name, or email" placeholder="Search order number, name, or email" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-2 flex-wrap">
          {(["all", "pending", "picked-up"] as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`tab-${f}`}
            >
              {f === "all" ? "All" : f === "pending" ? "Pending Pickup" : "Picked Up"}
              <Badge variant="secondary" className="ml-2">
                {f === "all" ? orders.length : f === "pending"
                  ? orders.filter((o) => !(optimisticPickups[o.id] !== undefined ? optimisticPickups[o.id] : o.pickedUp)).length
                  : orders.filter((o) => (optimisticPickups[o.id] !== undefined ? optimisticPickups[o.id] : o.pickedUp)).length}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Orders table */}
        {ordersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => <Skeleton key={n} className="h-10 w-full" />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-2">
              <PackageCheck className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">{orders.length ? "No matching orders" : "No orders yet"}</p>
              <p className="text-sm text-muted-foreground">
                {filter === "all" ? "Paid orders will appear here once customers complete checkout." : "No orders match this filter."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Pickup Time</TableHead>
                    <TableHead>Order Time</TableHead>
                    <TableHead className="text-center">Picked Up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const isPickedUp = optimisticPickups[order.id] !== undefined
                      ? optimisticPickups[order.id]
                      : order.pickedUp;
                    return (
                      <TableRow key={order.id} className={isPickedUp ? "opacity-60" : undefined}>
                        <TableCell className="font-semibold whitespace-nowrap">#{fundraiserOrderReference(order.orderNumber)}</TableCell>
                        <TableCell className="font-medium">{order.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.customerEmail}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.customerPhone ?? "—"}</TableCell>
                        <TableCell className="text-center">{order.quantity}</TableCell>
                        <TableCell className="text-sm">{order.pickupTime ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(order.createdAt)}
                          <div className="mt-1 text-xs">
                            Email: {({ sent: "Sent", pending: "Queued", sending: "Sending", failed: "Failed — will retry", review: "Needs provider review", untracked: "No delivery history" } as Record<string, string>)[order.confirmationStatus] || "Unknown"}
                          </div>
                          {order.confirmationStatus === "failed" && (
                            <Button size="sm" variant="outline" disabled={retryConfirmation.isPending}
                              onClick={() => retryConfirmation.mutate(order.id)}>
                              Retry email
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            data-testid={`checkbox-pickup-${order.id}`}
                            checked={isPickedUp}
                            onCheckedChange={(checked) => {
                              if (typeof checked === "boolean") pickupMutation.mutate({ orderId: order.id, pickedUp: checked });
                            }}
                            disabled={pickupMutation.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
