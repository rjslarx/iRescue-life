import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Package, RefreshCw } from "lucide-react";
import type { VendingResultsReport } from "@shared/rescue-vend-report";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = new Intl.NumberFormat("en-US");
const metrics = [
  { key: "grossCents", label: "Gross gifts" },
  { key: "refundCents", label: "Refunds" },
  { key: "netGiftCents", label: "Net gifts" },
  { key: "platformRevenueCents", label: "Platform revenue", detail: "Original assessed" },
  { key: "processingRecoveryCents", label: "Processing recovery", detail: "Original assessed" },
  { key: "rescueProceedsCents", label: "Actual rescue proceeds" },
] as const;

function formatMoney(cents: number | null) {
  return cents === null ? "Unknown" : money.format(cents / 100);
}

export default function VendingResults() {
  const { tenantId, basePath } = useTenant();
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const { data, isLoading, isError, isFetching, refetch } = useQuery<VendingResultsReport>({
    queryKey: ["/api/finance/vending-results", { days, tenantId, basePath }],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/finance/vending-results?days=${days}`);
      return response.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  return (
    <Card data-testid="card-vending-results">
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Vending results
            </CardTitle>
            <CardDescription>Supply gifts and rescue proceeds · All amounts in USD</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="vending-results-period" className="text-sm text-muted-foreground">Payment window</label>
            <select
              id="vending-results-period"
              value={days}
              onChange={(event) => setDays(Number(event.target.value) as 30 | 90 | 365)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="select-vending-results-period"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh vending results"
              data-testid="button-refresh-vending-results"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The window selects payment dates. Refund status is current, including refunds made after the selected window.
        </p>
      </CardHeader>
      <CardContent className="space-y-4" aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-4" role="status" data-testid="loading-vending-results">
            <span className="sr-only">Loading vending results</span>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              {metrics.map(({ key }) => (
                <div key={key} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-28" />
                </div>
              ))}
            </div>
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError || !data ? (
          <Alert variant="destructive" role="alert" data-testid="error-vending-results">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="space-y-3">
              <p>Unable to load vending results. Totals are unavailable until the report loads successfully.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-retry-vending-results"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                {isFetching ? "Retrying…" : "Retry loading results"}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{count.format(data.chargeCount)} {data.chargeCount === 1 ? "payment" : "payments"} · Last {data.days} days</span>
              <span>Report generated {new Date(data.generatedAt).toLocaleString("en-US")}</span>
            </div>
            <dl className="grid grid-cols-1 gap-4 rounded-md border bg-muted/30 p-4 md:grid-cols-2 xl:grid-cols-6">
              {metrics.map(({ key, label, ...rest }) => (
                <div key={key} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={`break-words text-lg tabular-nums ${key === "rescueProceedsCents" ? "font-bold" : "font-semibold"}`}>
                    {formatMoney(data.totals[key])}
                  </dd>
                  {"detail" in rest && <p className="text-xs text-muted-foreground">{rest.detail}</p>}
                </div>
              ))}
            </dl>
            {data.chargeCount === 0 && data.items.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-8 text-center" data-testid="empty-vending-results">
                <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No supply gifts in this payment window</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a longer window to see earlier payments.</p>
              </div>
            ) : (
              <Table>
                <caption className="sr-only">Supply results, ordered by net gifts from highest to lowest. Supply-level refunds and proceeds are allocated estimates for mixed carts.</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Supply</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    {metrics.map(({ key, label }) => (
                      <TableHead key={key} className="text-right whitespace-nowrap">{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id} data-testid={`vending-result-${item.id}`}>
                      <TableCell className="font-medium">{item.quantity === null ? "Unattributed supplies" : item.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity === null ? <span title="Quantity unknown">Unknown</span> : count.format(item.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count.format(item.chargeCount)}</TableCell>
                      {metrics.map(({ key }) => (
                        <TableCell key={key} className={`text-right whitespace-nowrap tabular-nums ${key === "rescueProceedsCents" ? "font-semibold" : ""}`}>
                          {formatMoney(item[key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.unattributedChargeCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {count.format(data.unattributedChargeCount)} {data.unattributedChargeCount === 1 ? "payment includes" : "payments include"} unknown catalog metadata, retained under Unattributed supplies. Quantity is unknown.
              </p>
            )}
            <div className="space-y-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
              <p><span className="font-medium text-foreground">Fees vs. proceeds.</span> Platform revenue and processing recovery are original assessed amounts, not refund-adjusted. Actual rescue proceeds reflect transfer reversals, application fee refunds, and dispute restorations. Unknown means unavailable, not zero.</p>
              <p><span className="font-medium text-foreground">Supply allocation.</span> Refunds and proceeds for mixed carts are proportionally allocated estimates, not actual supply earmarks. A gift toward a supply does not mean those funds were separately reserved for that item.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
