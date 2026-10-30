import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield,
  AlertCircle,
  Loader2,
  Upload,
  FileUp,
  Download,
  FileSpreadsheet,
  Info,
  CheckCircle2,
  PawPrint,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Tenant } from "@shared/schema";

function ImportResultAlert({ importResult }: { importResult: { imported: number; duplicates: number; imageErrors: number; totalRows: number; errors: string[] } }) {
  return (
    <Alert variant={importResult.errors.length > 0 ? "destructive" : "default"}>
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="font-medium">
          Import Complete: {importResult.imported} animals imported
        </p>
        {importResult.duplicates > 0 && (
          <p className="text-sm">
            {importResult.duplicates} duplicates skipped (already in database)
          </p>
        )}
        {importResult.imageErrors > 0 && (
          <p className="text-sm text-muted-foreground">
            {importResult.imageErrors} images could not be downloaded
          </p>
        )}
        {importResult.errors.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Errors:</p>
            <ul className="list-disc list-inside">
              {importResult.errors.slice(0, 5).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function RescueGroupsImporter() {
  const { toast } = useToast();
  const [isUploadingRG, setIsUploadingRG] = useState(false);
  const [isUploadingSimple, setIsUploadingSimple] = useState(false);
  const [rgResult, setRgResult] = useState<{
    imported: number;
    duplicates: number;
    imageErrors: number;
    totalRows: number;
    errors: string[];
  } | null>(null);
  const [simpleResult, setSimpleResult] = useState<{
    imported: number;
    duplicates: number;
    imageErrors: number;
    totalRows: number;
    errors: string[];
  } | null>(null);

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    endpoint: string,
    setLoading: (v: boolean) => void,
    setResult: (v: any) => void,
    label: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({ title: "Invalid file type", description: "Please upload a .csv file", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Import failed');

      setResult(result);
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });

      const hasWarnings = result.errors.length > 0 || result.imageErrors > 0 || result.duplicates > 0;
      toast({
        title: hasWarnings ? "Import Complete with Warnings" : "Import Complete",
        description: hasWarnings
          ? `Imported ${result.imported} animals. ${result.duplicates} duplicates skipped.`
          : `Successfully imported ${result.imported} animals from ${label}`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({ title: "Import Failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const downloadTemplate = async (endpoint: string, filename: string) => {
    try {
      const response = await fetch(endpoint, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to download template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Download Failed", description: "Could not download template", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          <CardTitle>Import Data</CardTitle>
        </div>
        <CardDescription>
          Import your animal data from a spreadsheet or from RescueGroups.org
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="simple" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2" data-testid="tabs-import-type">
            <TabsTrigger value="simple" data-testid="tab-simple-import">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import from Spreadsheet
            </TabsTrigger>
            <TabsTrigger value="rescuegroups" data-testid="tab-rescuegroups-import">
              <Upload className="h-4 w-4 mr-2" />
              RescueGroups.org
            </TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Use our simple template to import animals from any spreadsheet or paper records. Download the blank template, fill in your data, then upload it here.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => downloadTemplate('/api/import/simple/template', 'animal_import_template.csv')}
              className="w-full"
              data-testid="button-download-simple-template"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Blank Template (.csv)
            </Button>

            <div className="flex flex-col gap-4 p-4 border-2 border-dashed rounded-md bg-muted/30">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <FileUp className="h-8 w-8" />
                <div className="text-center">
                  <p className="font-medium">Upload Your Completed Spreadsheet</p>
                  <p className="text-xs">Accepts .csv files</p>
                </div>
              </div>

              <div className="flex justify-center">
                <input
                  id="simple-csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleUpload(e, '/api/import/simple', setIsUploadingSimple, setSimpleResult, 'spreadsheet')}
                  disabled={isUploadingSimple}
                  className="hidden"
                  data-testid="input-simple-csv-upload"
                />
                <Button
                  onClick={() => document.getElementById('simple-csv-upload')?.click()}
                  disabled={isUploadingSimple}
                  data-testid="button-upload-simple-csv"
                >
                  {isUploadingSimple ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload CSV
                    </>
                  )}
                </Button>
              </div>
            </div>

            {simpleResult && <ImportResultAlert importResult={simpleResult} />}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Template columns:</strong> name, breed, sex, age, color, microchip, intake_date, status.
                The template includes an example row to guide you.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="rescuegroups" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Export your animals from RescueGroups.org as a CSV file, then upload it here to import all your data including photos.
              </p>
            </div>

            <div className="flex flex-col gap-4 p-4 border-2 border-dashed rounded-md bg-muted/30">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <FileUp className="h-8 w-8" />
                <div className="text-center">
                  <p className="font-medium">Upload RescueGroups CSV</p>
                  <p className="text-xs">Photos will be automatically downloaded and stored</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate('/api/import/rescuegroups/template', 'rescuegroups_import_template.csv')}
                  data-testid="button-download-rg-template"
                >
                  Download Template
                </Button>

                <input
                  id="rg-csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleUpload(e, '/api/import/rescuegroups', setIsUploadingRG, setRgResult, 'RescueGroups')}
                  disabled={isUploadingRG}
                  className="hidden"
                  data-testid="input-rg-csv-upload"
                />
                <Button
                  onClick={() => document.getElementById('rg-csv-upload')?.click()}
                  disabled={isUploadingRG}
                  data-testid="button-upload-rg-csv"
                >
                  {isUploadingRG ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload CSV
                    </>
                  )}
                </Button>
              </div>
            </div>

            {rgResult && <ImportResultAlert importResult={rgResult} />}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Supported fields:</strong> Animal ID, Name, Breed, Sex, Birthdate, Description, Status, Species, Size, Age, and more.
                Photos are automatically downloaded from RescueGroups URLs.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

const SPECIES_OPTIONS = ["Dog", "Cat", "Rabbit", "Small & Furry", "Horse", "Bird", "Scales, Fins & Other", "Barnyard"];

const INITIAL_BACKFILL_FORM = {
  animalName: "",
  species: "",
  breed: "",
  age: "",
  sex: "",
  microchip: "",
  neuterStatus: "",
  adopterName: "",
  adopterEmail: "",
  adopterPhone: "",
  adoptionDate: new Date().toISOString().split("T")[0],
  rabiesDueDate: "",
  dhppDueDate: "",
  bordetellaDueDate: "",
  heartwormDueDate: "",
  fleaTickDueDate: "",
  spayNeuterDate: "",
};

function AdoptedAnimalBackfill() {
  const { toast } = useToast();
  const [form, setForm] = useState(INITIAL_BACKFILL_FORM);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/import/adopted-backfill", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Animal registered successfully",
        description: `${data.animalName} (${data.localShelterId}) has been registered with adopter ${data.adopterName}. A Pet Portal invite has been sent.`,
      });
      setForm(INITIAL_BACKFILL_FORM);
      queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to register animal",
        description: error.message || "Please check the form and try again.",
        variant: "destructive",
      });
    },
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.animalName || !form.species || !form.breed || !form.age || !form.adopterName || !form.adopterEmail || !form.adoptionDate) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({ ...form, dhppDueDate: /^(cat|cats|feline)$/i.test(form.species.trim()) ? "" : form.dhppDueDate });
  };

  return (
    <Card data-testid="card-adopted-backfill">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PawPrint className="h-5 w-5" />
          <CardTitle>Register Adopted Animals</CardTitle>
        </div>
        <CardDescription>
          Register animals that were adopted before you joined the platform. The adopter will receive a magic link to access their Pet Portal and be enrolled in vaccine reminder notifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Animal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="backfill-animal-name">Name *</Label>
                <Input
                  id="backfill-animal-name"
                  value={form.animalName}
                  onChange={(e) => updateField("animalName", e.target.value)}
                  placeholder="e.g. Buddy"
                  data-testid="input-backfill-animal-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-species">Species *</Label>
                <Select value={form.species} onValueChange={(v) => updateField("species", v)}>
                  <SelectTrigger id="backfill-species" data-testid="select-backfill-species">
                    <SelectValue placeholder="Select species" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIES_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-breed">Breed *</Label>
                <Input
                  id="backfill-breed"
                  value={form.breed}
                  onChange={(e) => updateField("breed", e.target.value)}
                  placeholder="e.g. Golden Retriever"
                  data-testid="input-backfill-breed"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-age">Age *</Label>
                <Input
                  id="backfill-age"
                  value={form.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  placeholder="e.g. 3 years"
                  data-testid="input-backfill-age"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-sex">Sex</Label>
                <Select value={form.sex} onValueChange={(v) => updateField("sex", v)}>
                  <SelectTrigger id="backfill-sex" data-testid="select-backfill-sex">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-neuter">Spay/Neuter Status</Label>
                <Select value={form.neuterStatus} onValueChange={(v) => updateField("neuterStatus", v)}>
                  <SelectTrigger id="backfill-neuter" data-testid="select-backfill-neuter">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="altered">Altered</SelectItem>
                    <SelectItem value="intact">Intact</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="backfill-microchip">Microchip Number</Label>
                <Input
                  id="backfill-microchip"
                  value={form.microchip}
                  onChange={(e) => updateField("microchip", e.target.value)}
                  placeholder="Optional"
                  data-testid="input-backfill-microchip"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Adopter Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="backfill-adopter-name">Full Name *</Label>
                <Input
                  id="backfill-adopter-name"
                  value={form.adopterName}
                  onChange={(e) => updateField("adopterName", e.target.value)}
                  placeholder="e.g. Jane Smith"
                  data-testid="input-backfill-adopter-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-adopter-email">Email *</Label>
                <Input
                  id="backfill-adopter-email"
                  type="email"
                  value={form.adopterEmail}
                  onChange={(e) => updateField("adopterEmail", e.target.value)}
                  placeholder="e.g. jane@example.com"
                  data-testid="input-backfill-adopter-email"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="backfill-adopter-phone">Phone</Label>
                <Input
                  id="backfill-adopter-phone"
                  type="tel"
                  value={form.adopterPhone}
                  onChange={(e) => updateField("adopterPhone", e.target.value)}
                  placeholder="Optional — enables SMS reminders"
                  data-testid="input-backfill-adopter-phone"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dates & Compliance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="backfill-adoption-date">Adoption Date *</Label>
                <Input
                  id="backfill-adoption-date"
                  type="date"
                  value={form.adoptionDate}
                  onChange={(e) => updateField("adoptionDate", e.target.value)}
                  data-testid="input-backfill-adoption-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-rabies">Rabies Due Date</Label>
                <Input
                  id="backfill-rabies"
                  type="date"
                  value={form.rabiesDueDate}
                  onChange={(e) => updateField("rabiesDueDate", e.target.value)}
                  data-testid="input-backfill-rabies-due"
                />
              </div>
              {!/^(cat|cats|feline)$/i.test(form.species.trim()) && <div className="space-y-1.5">
                <Label htmlFor="backfill-dhpp">DHPP Due Date</Label>
                <Input
                  id="backfill-dhpp"
                  type="date"
                  value={form.dhppDueDate}
                  onChange={(e) => updateField("dhppDueDate", e.target.value)}
                  data-testid="input-backfill-dhpp-due"
                />
              </div>}
              <div className="space-y-1.5">
                <Label htmlFor="backfill-bordetella">Bordetella Due Date</Label>
                <Input
                  id="backfill-bordetella"
                  type="date"
                  value={form.bordetellaDueDate}
                  onChange={(e) => updateField("bordetellaDueDate", e.target.value)}
                  data-testid="input-backfill-bordetella-due"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-heartworm">Heartworm Due Date</Label>
                <Input
                  id="backfill-heartworm"
                  type="date"
                  value={form.heartwormDueDate}
                  onChange={(e) => updateField("heartwormDueDate", e.target.value)}
                  data-testid="input-backfill-heartworm-due"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backfill-flea">Flea/Tick Due Date</Label>
                <Input
                  id="backfill-flea"
                  type="date"
                  value={form.fleaTickDueDate}
                  onChange={(e) => updateField("fleaTickDueDate", e.target.value)}
                  data-testid="input-backfill-flea-due"
                />
              </div>
              {form.neuterStatus === "intact" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="backfill-spay">Spay/Neuter Due Date</Label>
                  <Input
                    id="backfill-spay"
                    type="date"
                    value={form.spayNeuterDate}
                    onChange={(e) => updateField("spayNeuterDate", e.target.value)}
                    data-testid="input-backfill-spay-due"
                  />
                </div>
              )}
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              The adopter will receive an email with a magic link to access their Pet Portal. Rabies and DHPP due dates create compliance obligations that the adopter must verify. All other due dates create preventative care records for internal tracking and automated reminders.
            </AlertDescription>
          </Alert>

          <Button
            type="submit"
            disabled={mutation.isPending}
            data-testid="button-backfill-submit"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <PawPrint className="h-4 w-4 mr-2" />
                Register Adopted Animal
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: ownerData, isLoading: isOwnerLoading } = useQuery<{ isOwner: boolean }>({
    queryKey: ['/api/me/is-owner'],
  });

  const isOwner = ownerData?.isOwner === true;
  const isAdmin = user?.activeRole === 'admin';
  const canViewPage = isOwner || isAdmin;

  const { data, isLoading } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
    enabled: canViewPage,
  });

  const updateAdminRestrictionsMutation = useMutation({
    mutationFn: async (restrictions: { restrictAdminSettingsEdit?: boolean; restrictAdminIntegrationsEdit?: boolean }) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/admin-restrictions', restrictions);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      toast({
        title: "Admin restrictions updated",
        description: "Admin editing permissions have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update restrictions",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  if (isOwnerLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Security & Access" }]}>
        <div className="flex items-center justify-center h-64" data-testid="loading-security">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewPage) {
    return (
      <DashboardLayout breadcrumbs={[{ label: "Settings" }, { label: "Security & Access" }]}>
        <div className="max-w-2xl mx-auto py-12" data-testid="security-access-denied">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                <CardTitle>Access Restricted</CardTitle>
              </div>
              <CardDescription>
                Security settings can only be accessed by administrators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You don't have permission to view security settings.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }, { label: "Security & Access" }]}
      title="Security & Access"
      description="Manage administrator permissions and data import tools."
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64" data-testid="loading-security">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {isOwner && (
            <Card data-testid="card-owner-controls">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>Owner Controls</CardTitle>
                </div>
                <CardDescription>
                  Control what administrators can edit in your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label htmlFor="restrict-settings" className="text-base font-medium">
                        Restrict Settings Editing
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, administrators can view settings but cannot make changes
                      </p>
                    </div>
                    <Switch
                      id="restrict-settings"
                      checked={data?.tenant?.restrictAdminSettingsEdit === true}
                      onCheckedChange={(checked) => {
                        updateAdminRestrictionsMutation.mutate({ restrictAdminSettingsEdit: checked });
                      }}
                      disabled={updateAdminRestrictionsMutation.isPending}
                      data-testid="switch-restrict-settings"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label htmlFor="restrict-integrations" className="text-base font-medium">
                        Restrict Platform Integrations Editing
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, administrators can view but cannot modify platform integrations
                      </p>
                    </div>
                    <Switch
                      id="restrict-integrations"
                      checked={data?.tenant?.restrictAdminIntegrationsEdit === true}
                      onCheckedChange={(checked) => {
                        updateAdminRestrictionsMutation.mutate({ restrictAdminIntegrationsEdit: checked });
                      }}
                      disabled={updateAdminRestrictionsMutation.isPending}
                      data-testid="switch-restrict-integrations"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <RescueGroupsImporter />

          <AdoptedAnimalBackfill />
        </div>
      )}
    </DashboardLayout>
  );
}
