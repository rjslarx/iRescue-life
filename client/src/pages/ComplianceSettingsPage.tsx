import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { 
  FileText, 
  Download, 
  Settings, 
  TrendingUp, 
  Star, 
  Shield, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Clock,
} from "lucide-react";

interface SacSettings {
  enabled: boolean;
  autoCalculate: boolean;
  juvenileAgeDays: number;
  intakeMapping: Record<string, string>;
  outcomeMapping: Record<string, string>;
}

interface SacReport {
  id: string;
  reportMonth: number;
  reportYear: number;
  statistics: any;
  validationStatus: "pending" | "valid" | "errors";
  validationErrors: Array<{ field: string; message: string }> | null;
  generatedAt: string;
}

export default function ComplianceSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sac");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // SAC Settings Query
  const { data: sacData, isLoading: sacLoading } = useQuery({
    queryKey: ["/api/compliance/sac/settings"],
  });

  // SAC Reports Query
  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/compliance/sac/reports"],
  });

  // Impact Settings Query
  const { data: impactData, isLoading: impactLoading } = useQuery({
    queryKey: ["/api/compliance/impact/settings"],
  });

  // Impact Stats Query
  const { data: statsData } = useQuery({
    queryKey: ["/api/compliance/impact/stats"],
  });

  // Transparency Vault Settings Query
  const { data: vaultData } = useQuery({
    queryKey: ["/api/compliance/transparency-vault/settings"],
  });

  // GreatNonprofits Settings Query
  const { data: reviewsData } = useQuery({
    queryKey: ["/api/compliance/reviews/settings"],
  });

  // Update SAC Settings Mutation
  const updateSacSettings = useMutation({
    mutationFn: async (settings: Partial<SacSettings>) => {
      return apiRequest("/api/compliance/sac/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/sac/settings"] });
      toast({ title: "Settings saved", description: "SAC settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  // Generate SAC Report Mutation
  const generateReport = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      return apiRequest("/api/compliance/sac/generate", {
        method: "POST",
        body: JSON.stringify({ month, year }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/sac/reports"] });
      toast({ title: "Report generated", description: "SAC report has been generated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    },
  });

  // Update Impact Settings Mutation
  const updateImpactSettings = useMutation({
    mutationFn: async (settings: any) => {
      return apiRequest("/api/compliance/impact/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/impact/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  // Calculate Impact Stats Mutation
  const calculateStats = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/compliance/impact/calculate", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/impact/stats"] });
      toast({ title: "Stats calculated", description: "Impact statistics have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate stats.", variant: "destructive" });
    },
  });

  // Update Transparency Vault Settings Mutation
  const updateVaultSettings = useMutation({
    mutationFn: async (settings: any) => {
      return apiRequest("/api/compliance/transparency-vault/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/transparency-vault/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  // Update GreatNonprofits Settings Mutation
  const updateReviewSettings = useMutation({
    mutationFn: async (settings: any) => {
      return apiRequest("/api/compliance/reviews/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/reviews/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const settings = sacData?.settings as SacSettings | undefined;
  const intakeCategories = sacData?.intakeCategories || [];
  const outcomeCategories = sacData?.outcomeCategories || [];
  const reports = reportsData?.reports as SacReport[] || [];
  const impactSettings = impactData?.settings || {};
  const impactStats = statsData?.stats;
  const vaultSettings = vaultData?.settings || {};
  const reviewSettings = reviewsData?.settings || {};

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handleExportCSV = async (reportId: string) => {
    try {
      const response = await fetch(`/api/compliance/sac/export/${reportId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SAC_Report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Failed to export CSV.", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout title="Compliance & Watchdog" description="Manage compliance reporting for nonprofit watchdog organizations">
      <div className="max-w-6xl space-y-6 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 gap-1">
            <TabsTrigger value="sac" className="flex items-center gap-2" data-testid="tab-sac">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Shelter Animals Count</span>
              <span className="sm:hidden">SAC</span>
            </TabsTrigger>
            <TabsTrigger value="impact" className="flex items-center gap-2" data-testid="tab-impact">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Impact Dashboard</span>
              <span className="sm:hidden">Impact</span>
            </TabsTrigger>
            <TabsTrigger value="transparency" className="flex items-center gap-2" data-testid="tab-transparency">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Transparency Vault</span>
              <span className="sm:hidden">Vault</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2" data-testid="tab-reviews">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">GreatNonprofits</span>
              <span className="sm:hidden">Reviews</span>
            </TabsTrigger>
          </TabsList>

          {/* SAC Tab */}
          <TabsContent value="sac" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Shelter Animals Count (SAC)
                </CardTitle>
                <CardDescription>
                  Generate monthly reports in Shelter Animals Count format for nationwide shelter data submission.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable SAC Reporting</Label>
                    <p className="text-sm text-muted-foreground">
                      Track animals using SAC categories for national data collection
                    </p>
                  </div>
                  <Switch
                    checked={settings?.enabled || false}
                    onCheckedChange={(checked) => updateSacSettings.mutate({ enabled: checked })}
                    disabled={updateSacSettings.isPending}
                    data-testid="switch-sac-enabled"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Juvenile Age Threshold</h4>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      min={30}
                      max={365}
                      value={settings?.juvenileAgeDays || 180}
                      onChange={(e) => updateSacSettings.mutate({ juvenileAgeDays: parseInt(e.target.value) })}
                      className="w-24"
                      data-testid="input-juvenile-days"
                    />
                    <span className="text-sm text-muted-foreground">
                      days (animals under this age at intake are counted as juvenile)
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Intake Status Mapping</h4>
                  <p className="text-sm text-muted-foreground">
                    Map your intake sources to SAC standard categories
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {["stray", "owner_surrender", "transfer", "born_in_care", "other"].map((source) => (
                      <div key={source} className="flex items-center gap-4">
                        <Label className="w-32 capitalize">{source.replace(/_/g, " ")}</Label>
                        <Select
                          value={settings?.intakeMapping?.[source] || "other_intake"}
                          onValueChange={(value) => 
                            updateSacSettings.mutate({
                              intakeMapping: { ...settings?.intakeMapping, [source]: value }
                            })
                          }
                        >
                          <SelectTrigger className="flex-1" data-testid={`select-intake-${source}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {intakeCategories.map((cat: string) => (
                              <SelectItem key={cat} value={cat}>
                                {cat.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Outcome Status Mapping</h4>
                  <p className="text-sm text-muted-foreground">
                    Map your outcome statuses to SAC standard categories
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {["adopted", "return_to_owner", "transfer_out", "died", "euthanasia"].map((outcome) => (
                      <div key={outcome} className="flex items-center gap-4">
                        <Label className="w-32 capitalize">{outcome.replace(/_/g, " ")}</Label>
                        <Select
                          value={settings?.outcomeMapping?.[outcome] || "other_live_outcome"}
                          onValueChange={(value) => 
                            updateSacSettings.mutate({
                              outcomeMapping: { ...settings?.outcomeMapping, [outcome]: value }
                            })
                          }
                        >
                          <SelectTrigger className="flex-1" data-testid={`select-outcome-${outcome}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {outcomeCategories.map((cat: string) => (
                              <SelectItem key={cat} value={cat}>
                                {cat.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generate Monthly Report</CardTitle>
                <CardDescription>
                  Create a SAC-compliant CSV export for a specific month
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Select
                    value={String(selectedMonth)}
                    onValueChange={(v) => setSelectedMonth(parseInt(v))}
                  >
                    <SelectTrigger className="w-36" data-testid="select-report-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={String(selectedYear)}
                    onValueChange={(v) => setSelectedYear(parseInt(v))}
                  >
                    <SelectTrigger className="w-24" data-testid="select-report-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2023, 2024, 2025].map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={() => generateReport.mutate({ month: selectedMonth, year: selectedYear })}
                    disabled={generateReport.isPending}
                    data-testid="button-generate-report"
                  >
                    {generateReport.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generated Reports</CardTitle>
                <CardDescription>
                  View and download previously generated SAC reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reports generated yet. Generate your first monthly report above.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Generated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report: SacReport) => (
                        <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                          <TableCell className="font-medium">
                            {months[report.reportMonth - 1]} {report.reportYear}
                          </TableCell>
                          <TableCell>
                            {report.validationStatus === "valid" ? (
                              <Badge className="bg-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Valid
                              </Badge>
                            ) : report.validationStatus === "errors" ? (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Errors
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExportCSV(report.id)}
                              data-testid={`button-export-${report.id}`}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              CSV
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Impact Dashboard Tab */}
          <TabsContent value="impact" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Impact Dashboard (Charity Navigator)
                </CardTitle>
                <CardDescription>
                  Calculate and display your Live Release Rate for transparency and donor confidence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Impact Tracking</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically calculate Live Release Rate nightly
                    </p>
                  </div>
                  <Switch
                    checked={impactSettings.enabled || false}
                    onCheckedChange={(checked) => updateImpactSettings.mutate({ enabled: checked })}
                    data-testid="switch-impact-enabled"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show on Public Site</Label>
                    <p className="text-sm text-muted-foreground">
                      Display impact stats on your public-facing pages
                    </p>
                  </div>
                  <Switch
                    checked={impactSettings.showOnPublicSite || false}
                    onCheckedChange={(checked) => updateImpactSettings.mutate({ showOnPublicSite: checked })}
                    data-testid="switch-impact-public"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Exclude Owner-Requested Euthanasia</Label>
                    <p className="text-sm text-muted-foreground">
                      Following Asilomar Accords: exclude ORE from LRR denominator
                    </p>
                  </div>
                  <Switch
                    checked={impactSettings.excludeOre !== false}
                    onCheckedChange={(checked) => updateImpactSettings.mutate({ excludeOre: checked })}
                    data-testid="switch-exclude-ore"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Calculation Period</h4>
                  <Select
                    value={impactSettings.periodType || "rolling_12_months"}
                    onValueChange={(value) => updateImpactSettings.mutate({ periodType: value })}
                  >
                    <SelectTrigger className="w-48" data-testid="select-period-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="rolling_12_months">Rolling 12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => calculateStats.mutate()}
                  disabled={calculateStats.isPending}
                  data-testid="button-calculate-stats"
                >
                  {calculateStats.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Calculate Now
                </Button>
              </CardFooter>
            </Card>

            {impactStats && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Stats</CardTitle>
                  <CardDescription>
                    Last calculated: {impactStats.computedAt ? new Date(impactStats.computedAt).toLocaleString() : "Never"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                        {impactStats.liveReleaseRate}%
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Live Release Rate</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {impactStats.adoptionsCount || 0}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Adoptions</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {impactStats.totalIntakes || 0}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Total Intakes</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {impactStats.totalOutcomes || 0}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Total Outcomes</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transparency Vault Tab */}
          <TabsContent value="transparency" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Transparency Vault (Candid/GuideStar)
                </CardTitle>
                <CardDescription>
                  Store and share key nonprofit documents for Candid GuideStar Seal of Transparency.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Transparency Vault</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload and manage compliance documents
                    </p>
                  </div>
                  <Switch
                    checked={vaultSettings.enabled || false}
                    onCheckedChange={(checked) => updateVaultSettings.mutate({ enabled: checked })}
                    data-testid="switch-vault-enabled"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Public Documents Page</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow visitors to view your transparency documents
                    </p>
                  </div>
                  <Switch
                    checked={vaultSettings.publicPageEnabled || false}
                    onCheckedChange={(checked) => updateVaultSettings.mutate({ publicPageEnabled: checked })}
                    data-testid="switch-vault-public"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Organization Information</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>EIN (Tax ID)</Label>
                      <Input
                        value={vaultSettings.ein || ""}
                        onChange={(e) => updateVaultSettings.mutate({ ein: e.target.value })}
                        placeholder="XX-XXXXXXX"
                        data-testid="input-ein"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Candid Seal Level</Label>
                      <Select
                        value={vaultSettings.candidSealLevel || ""}
                        onValueChange={(value) => updateVaultSettings.mutate({ candidSealLevel: value || null })}
                      >
                        <SelectTrigger data-testid="select-seal-level">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bronze">Bronze</SelectItem>
                          <SelectItem value="silver">Silver</SelectItem>
                          <SelectItem value="gold">Gold</SelectItem>
                          <SelectItem value="platinum">Platinum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Upload your 501(c)(3) letter, Form 990, audited financials, and board list in the Documents section
                    to qualify for higher Candid seal levels.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* GreatNonprofits Tab */}
          <TabsContent value="reviews" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  GreatNonprofits Reviews
                </CardTitle>
                <CardDescription>
                  Automatically request reviews from adopters 7 days after adoption.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Review Requests</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically send review request emails to adopters
                    </p>
                  </div>
                  <Switch
                    checked={reviewSettings.enabled || false}
                    onCheckedChange={(checked) => updateReviewSettings.mutate({ enabled: checked })}
                    data-testid="switch-reviews-enabled"
                  />
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Delay After Adoption</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={reviewSettings.delayDays || 7}
                        onChange={(e) => updateReviewSettings.mutate({ delayDays: parseInt(e.target.value) })}
                        className="w-20"
                        data-testid="input-delay-days"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>GreatNonprofits Profile URL</Label>
                    <Input
                      value={reviewSettings.reviewUrl || ""}
                      onChange={(e) => updateReviewSettings.mutate({ reviewUrl: e.target.value })}
                      placeholder="https://greatnonprofits.org/org/..."
                      data-testid="input-review-url"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email Subject Line</Label>
                  <Input
                    value={reviewSettings.emailSubject || "Share your adoption experience!"}
                    onChange={(e) => updateReviewSettings.mutate({ emailSubject: e.target.value })}
                    data-testid="input-email-subject"
                  />
                </div>

                <Alert>
                  <Star className="h-4 w-4" />
                  <AlertDescription>
                    Reviews help build trust with potential adopters and donors. The more 5-star reviews
                    you have, the higher your organization ranks on GreatNonprofits.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
