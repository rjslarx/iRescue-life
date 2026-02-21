import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, HardDrive, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function DataBackupsPage() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/settings/export-data", {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to generate export");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || "irescue_backup.zip";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Backup downloaded",
        description: "Your full database backup has been saved to your device.",
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardLayout title="Data & Backups">
      <div className="max-w-2xl mx-auto space-y-6 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <HardDrive className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle>Full Database Backup</CardTitle>
                <CardDescription>
                  Export all your rescue data as a downloadable ZIP file
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This backup includes your complete animal records, vaccine and
              preventative care history, team members, and transport logs — all
              bundled into CSV files inside a single ZIP archive.
            </p>

            <Button
              onClick={handleExport}
              disabled={isExporting}
              data-testid="button-download-backup"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExporting
                ? "Generating backup..."
                : "Download Full Database Backup (.zip)"}
            </Button>

            <p className="text-xs text-muted-foreground">
              Download your complete rescue records for your own secure backups.
              We recommend doing this monthly.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle>What's Included</CardTitle>
                <CardDescription>
                  Five CSV files covering your core rescue data
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">animals.csv</span>
                — All animal profiles including status, location, and behavioral
                flags
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">
                  vaccine_records.csv
                </span>
                — Vaccine and treatment history
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">
                  preventative_care_records.csv
                </span>
                — Preventative care and parasite prevention records
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">users.csv</span>
                — Staff, fosters, and volunteers (no passwords)
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">
                  transport_events.csv
                </span>
                — Transport manifests and logistics
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
