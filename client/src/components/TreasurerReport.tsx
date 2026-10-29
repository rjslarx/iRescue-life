import { useId, useMemo, useState } from "react";
import type { Donation } from "@shared/schema";
import { AlertCircle, Download, FileText } from "lucide-react";
import { buildTreasurerReport, treasurerReportCsv } from "@/lib/treasurer-report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TreasurerReportProps {
  donations: Donation[];
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function TreasurerReport({ donations }: TreasurerReportProps) {
  const id = useId();
  const [dates, setDates] = useState(() => {
    const today = new Date();
    return {
      startDate: localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: localDate(today),
    };
  });
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const result = useMemo(() => {
    try {
      return { report: buildTreasurerReport(donations, dates.startDate, dates.endDate), error: null };
    } catch (error) {
      return {
        report: null,
        error: error instanceof Error ? error.message : "Unable to build the report. Check your date range.",
      };
    }
  }, [donations, dates.startDate, dates.endDate]);
  const { report, error } = result;

  function changeDate(field: "startDate" | "endDate", value: string) {
    setDates(previous => ({ ...previous, [field]: value }));
    setDownloadError(null);
  }

  function downloadReport() {
    if (!report || report.rows.length === 0) return;
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      const blob = new Blob(["\uFEFF", treasurerReportCsv(report)], { type: "text/csv;charset=utf-8;" });
      url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `treasurer-report_${dates.startDate}_${dates.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      setDownloadError(null);
    } catch {
      setDownloadError("The CSV could not be downloaded. Please try downloading again.");
    } finally {
      link.remove();
      // Give the browser time to start the download before releasing the object URL.
      if (url) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  }

  return (
    <Card data-testid="card-treasurer-report">
      <CardHeader className="gap-3">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              Treasurer Report
            </CardTitle>
            <CardDescription>
              Summarize recorded donations for your board or bookkeeping records.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full shrink-0 md:w-auto"
            onClick={downloadReport}
            disabled={!report || report.rows.length === 0}
            data-testid="button-export-treasurer-report"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download itemized CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-start`}>Start date</Label>
              <Input
                id={`${id}-start`}
                type="date"
                value={dates.startDate}
                onChange={event => changeDate("startDate", event.target.value)}
                aria-describedby={`${id}-dates ${error ? `${id}-error` : ""}`}
                aria-invalid={!!error}
                data-testid="input-treasurer-start-date"
                className="min-w-0"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-end`}>End date</Label>
              <Input
                id={`${id}-end`}
                type="date"
                value={dates.endDate}
                onChange={event => changeDate("endDate", event.target.value)}
                aria-describedby={`${id}-dates ${error ? `${id}-error` : ""}`}
                aria-invalid={!!error}
                data-testid="input-treasurer-end-date"
                className="min-w-0"
              />
            </div>
          </div>
          <p id={`${id}-dates`} className="mt-3 text-xs text-muted-foreground">
            Both dates are included. Uses recorded donation calendar dates, matching Finance records.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" id={`${id}-error`} role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {downloadError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{downloadError}</AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-5" aria-live="polite">
            <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Monetary donations</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="text-treasurer-monetary-total">
                  {currency.format(report.monetaryTotalCents / 100)}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {(report.rows.length - report.inKindCount).toLocaleString()} monetary donation records
                </dd>
              </div>
              <div className="border-t pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <dt className="text-sm text-muted-foreground">In-kind donations</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="text-treasurer-in-kind-count">
                  {report.inKindCount.toLocaleString()}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">Records only; excluded from cash totals</dd>
              </div>
            </dl>
            {report.rows.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center" data-testid="empty-treasurer-report">
                <FileText className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No recorded donations in this date range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a wider date range or add a donation in Records to include it here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Category totals</h3>
                  <span className="text-xs text-muted-foreground">{report.rows.length.toLocaleString()} total records</span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <Table data-testid="table-treasurer-categories">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Records</TableHead>
                        <TableHead className="text-right">Monetary total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.groups.map((group, index) => (
                        <TableRow key={`${group.label}-${group.inKind}-${index}`}>
                          <TableCell className="font-medium">
                            <span>{group.label}</span>
                            {group.inKind && <Badge variant="secondary" className="ml-2">In-kind</Badge>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{group.count.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {group.inKind ? <span className="text-muted-foreground">Not included</span> : currency.format(group.amountCents / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          Recorded donations only—not bank deposits or Stripe payout reconciliation. In-kind donations are counted separately and excluded from all monetary totals. The CSV includes individual donation records for the selected range.
        </p>
      </CardContent>
    </Card>
  );
}
