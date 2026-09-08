import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeDollarSign, Info } from "lucide-react";

type Totals = {
  chargeCount: number;
  grossCents: number;
  applicationFeeNetCents: number;
  rescueProceedsCents: number;
  iRescueRevenueCents: number;
  processingRecoveryCents: number;
  processingVarianceCents: number;
  stripeChargeFeesCents: number;
  stripeRefundFeesCents: number;
  stripeDisputeFeesCents: number;
  refundCents: number;
  disputeCents: number;
  disputeRestoredCents: number;
  platformNetCents: number;
  legacyUnclassifiedRetainedCents: number;
};

type ReportRow = {
  created: string;
  tenantLabel: string;
  tenantSubdomain: string | null;
  surface: string;
  cadence: "one-time" | "recurring";
  methodFamily: string;
  grossCents: number;
  transferGrossCents: number;
  transferReversedCents: number;
  transferNetCents: number;
  applicationFeeGrossCents: number;
  applicationFeeRefundedCents: number;
  applicationFeeNetCents: number;
  rescueProceedsCents: number;
  iRescueRevenueCents: number | null;
  processingRecoveryCents: number | null;
  processingVarianceCents: number | null;
  classification: "classified" | "legacy/unclassified";
  stripeChargeFeesCents: number;
  stripeRefundFeesCents: number;
  stripeDisputeFeesCents: number;
  refundCents: number;
  refundStatus: string;
  disputeCents: number;
  disputeRestoredCents: number;
  disputeStatus: string | null;
  platformNetCents: number;
};

type Report = {
  generatedAt: string;
  days: number;
  resultCount: number;
  displayedCount: number;
  totals: Totals;
  categories: Array<Totals & { category: string }>;
  rows: ReportRow[];
};

const money = (value: number | null | undefined) =>
  value == null
    ? "Unclassified"
    : (value / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function StripeEconomicsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery<Report>({
    queryKey: [`/api/platform/stripe-economics?days=${days}&limit=100`],
  });

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const stripeFees = data
    ? data.totals.stripeChargeFeesCents + data.totals.stripeRefundFeesCents + data.totals.stripeDisputeFeesCents
    : 0;
  const summaryCards = data ? [
    ["Gross volume", money(data.totals.grossCents), `${data.totals.chargeCount} destination charges`],
    ["iRescue fee revenue", money(data.totals.iRescueRevenueCents), "Business fee revenue, metadata-classified"],
    ["Processing recovery", money(data.totals.processingRecoveryCents), "Amount collected to offset processing"],
    ["Processing variance", money(data.totals.processingVarianceCents), "Recovery minus actual original charge fees"],
    ["Actual Stripe fees", money(stripeFees), "Charge, refund, and dispute fees"],
    ["Authoritative platform net", money(data.totals.platformNetCents), "Net of expanded platform balance cashflows"],
    ["Legacy / unclassified retained", money(data.totals.legacyUnclassifiedRetainedCents), "Net retained without new economics metadata"],
  ] : [];

  return (
    <SidebarProvider style={{ "--sidebar-width": "16rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <BadgeDollarSign className="h-6 w-6" /> Stripe Economics
              </h1>
              <p className="text-sm text-muted-foreground">Platform destination-charge economics without customer PII</p>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>How to read this report</AlertTitle>
                <AlertDescription>
                  iRescue fee revenue is the platform's business fee. Processing recovery is separately collected
                  to offset payment costs. Actual Stripe fees come from Stripe balance transactions, while platform
                  net is the authoritative sum of available charge, transfer, application-fee, refund, dispute,
                  and won-dispute restoration
                  cashflows. Processing variance compares the estimate collected with the actual original charge fee.
                  Older charges without the new economics classification appear as legacy/unclassified.
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 text-sm font-medium">Reporting period</span>
                {[7, 30, 90].map(option => (
                  <Button
                    key={option}
                    size="sm"
                    variant={days === option ? "default" : "outline"}
                    onClick={() => setDays(option)}
                  >
                    {option} days
                  </Button>
                ))}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Could not load Stripe economics</AlertTitle>
                  <AlertDescription>{error instanceof Error ? error.message : "Unexpected reporting error"}</AlertDescription>
                </Alert>
              )}

              {isLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[...Array(7)].map((_, index) => <Skeleton key={index} className="h-32 w-full" />)}
                </div>
              ) : data && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {summaryCards.map(([title, value, description]) => (
                      <Card key={title}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">{title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{value}</div>
                          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Economics by category</CardTitle>
                      <CardDescription>Safe payment-surface categories only</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead><TableHead>Charges</TableHead>
                            <TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">Rescue proceeds</TableHead>
                            <TableHead className="text-right">iRescue revenue</TableHead>
                            <TableHead className="text-right">Processing recovery</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                            <TableHead className="text-right">Stripe fees</TableHead>
                            <TableHead className="text-right">Platform net</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.categories.map(category => (
                            <TableRow key={category.category}>
                              <TableCell className="font-medium">{category.category}</TableCell>
                              <TableCell>{category.chargeCount}</TableCell>
                              <TableCell className="text-right">{money(category.grossCents)}</TableCell>
                              <TableCell className="text-right">{money(category.rescueProceedsCents)}</TableCell>
                              <TableCell className="text-right">{money(category.iRescueRevenueCents)}</TableCell>
                              <TableCell className="text-right">{money(category.processingRecoveryCents)}</TableCell>
                              <TableCell className="text-right">{money(category.processingVarianceCents)}</TableCell>
                              <TableCell className="text-right">{money(category.stripeChargeFeesCents + category.stripeRefundFeesCents + category.stripeDisputeFeesCents)}</TableCell>
                              <TableCell className="text-right font-medium">{money(category.platformNetCents)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent destination charges</CardTitle>
                      <CardDescription>
                        Showing {data.displayedCount} of {data.resultCount} destination charges; totals include the full period.
                        No donor, customer, or payment-method identifiers.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Created</TableHead><TableHead>Tenant</TableHead><TableHead>Category</TableHead>
                            <TableHead>Cadence / method</TableHead><TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">Rescue proceeds</TableHead><TableHead className="text-right">App fee net</TableHead>
                            <TableHead className="text-right">iRescue revenue</TableHead><TableHead className="text-right">Recovery</TableHead>
                            <TableHead className="text-right">Stripe fees</TableHead><TableHead className="text-right">Refund / dispute</TableHead>
                            <TableHead className="text-right">Platform net</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.rows.map((row, index) => (
                            <TableRow key={`${row.created}-${index}`}>
                              <TableCell className="whitespace-nowrap text-xs">{new Date(row.created).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="whitespace-nowrap font-medium">{row.tenantLabel}</div>
                                {row.tenantSubdomain && <div className="text-xs text-muted-foreground">{row.tenantSubdomain}</div>}
                              </TableCell>
                              <TableCell>{row.surface}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{row.cadence} · {row.methodFamily}</TableCell>
                              <TableCell className="text-right">{money(row.grossCents)}</TableCell>
                              <TableCell className="text-right">{money(row.rescueProceedsCents)}</TableCell>
                              <TableCell className="text-right">{money(row.applicationFeeNetCents)}</TableCell>
                              <TableCell className="text-right">
                                {money(row.iRescueRevenueCents)}
                                {row.classification !== "classified" && <Badge variant="outline" className="ml-2">Legacy</Badge>}
                              </TableCell>
                              <TableCell className="text-right">{money(row.processingRecoveryCents)}</TableCell>
                              <TableCell className="text-right">{money(row.stripeChargeFeesCents + row.stripeRefundFeesCents + row.stripeDisputeFeesCents)}</TableCell>
                              <TableCell className="whitespace-nowrap text-right text-xs">
                                {money(row.refundCents)} / {row.disputeCents ? `${money(row.disputeCents)} (${row.disputeStatus || "unknown"}, restored ${money(row.disputeRestoredCents)})` : "None"}
                              </TableCell>
                              <TableCell className="text-right font-medium">{money(row.platformNetCents)}</TableCell>
                            </TableRow>
                          ))}
                          {!data.rows.length && (
                            <TableRow><TableCell colSpan={12} className="h-24 text-center text-muted-foreground">No destination charges in this period.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}