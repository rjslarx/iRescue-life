import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  TrendingUp,
  TrendingDown,
  Users,
  PawPrint,
  Mail,
  Calendar,
  AlertTriangle,
  Loader2,
  Shield,
  FileCheck,
  XCircle,
  ClipboardList,
  Link as LinkIcon,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import HeartwormWatchTab from "@/components/compliance/HeartwormWatchTab";

const OBLIGATION_LABELS: Record<string, string> = {
  spay_neuter: "Spay/Neuter",
  rabies: "Rabies",
  dhpp_booster: "DHPP Booster",
  ongoing_treatment: "Ongoing Treatment",
  heartworm_prevention_proof: "HW Prevention Proof",
  obedience_training: "Obedience Training",
  fecal_test: "Fecal Test",
  custom: "Custom",
};

function getObligationLabel(type: string): string {
  return OBLIGATION_LABELS[type] || type;
}

interface Obligation {
  id: string;
  animalId: string;
  sessionId: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  obligationType: string;
  label: string;
  suggestedDueDate: string | null;
  contractualDueDate: string;
  notes: string | null;
  status: string;
  animalName: string;
  animalSpecies: string;
  daysOverdue: number;
  daysUntilDue: number;
  completedAt?: string;
  proofDocumentUrl?: string;
}

interface AtRiskAdopter {
  name: string;
  email: string;
  overdueCount: number;
  obligations: Obligation[];
}

interface AdopterComplianceResponse {
  stats: {
    totalActiveReminders: number;
    totalOverdue: number;
    confirmedToday: number;
    complianceRate: number;
    atRiskCount: number;
    pendingReviewCount: number;
  };
  overdue: Obligation[];
  upcoming: Obligation[];
  ongoingTreatments: Obligation[];
  customObligations: Obligation[];
  completed: Obligation[];
  waived: Obligation[];
  atRiskAdopters: AtRiskAdopter[];
}

interface AlumniResult {
  adoptionId: string;
  animalId: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  adoptionDate: string;
  adoptionFee: string | null;
  animalName: string;
  animalSpecies: string;
  animalBreed: string | null;
  animalPhotoUrls: string[] | null;
  animalAnimalId: string | null;
  neuterStatus: string | null;
  microchip: { number: string; manufacturer: string } | null;
  contract: { contractPdfUrl: string | null; signerName: string; signedAt: string; spayNeuterDate: string | null } | null;
}

function AddObligationDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [animalSearch, setAnimalSearch] = useState("");
  const [animalSearchTerm, setAnimalSearchTerm] = useState("");
  const [selectedAnimal, setSelectedAnimal] = useState<AlumniResult | null>(null);
  const [obligationType, setObligationType] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: searchResults, isLoading: searching } = useQuery<{ results: AlumniResult[] }>({
    queryKey: ["/api/dashboard/adopter-compliance/alumni-search", animalSearchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/adopter-compliance/alumni-search?q=${encodeURIComponent(animalSearchTerm)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: animalSearchTerm.length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: async (body: {
      animalId: string;
      adopterName: string;
      adopterEmail: string;
      adopterPhone: string | null;
      obligationType: string;
      label: string;
      contractualDueDate: string;
      notes: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/dashboard/adopter-compliance", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Compliance obligation created" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/adopter-compliance"] });
      onCreated();
      resetForm();
      setOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create obligation", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setAnimalSearch("");
    setAnimalSearchTerm("");
    setSelectedAnimal(null);
    setObligationType("");
    setCustomLabel("");
    setDueDate("");
    setNotes("");
  };

  const handleSearch = () => {
    if (animalSearch.trim().length >= 2) {
      setAnimalSearchTerm(animalSearch.trim());
    }
  };

  const handleSubmit = () => {
    if (!selectedAnimal || !obligationType || !dueDate) return;

    const label = obligationType === "custom"
      ? customLabel || "Custom Obligation"
      : OBLIGATION_LABELS[obligationType] || obligationType;

    createMutation.mutate({
      animalId: selectedAnimal.animalId,
      adopterName: selectedAnimal.adopterName,
      adopterEmail: selectedAnimal.adopterEmail,
      adopterPhone: selectedAnimal.adopterPhone,
      obligationType,
      label,
      contractualDueDate: dueDate,
      notes: notes || null,
    });
  };

  const canSubmit = selectedAnimal && obligationType && dueDate && (obligationType !== "custom" || customLabel.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-obligation">
          <Plus className="h-4 w-4 mr-1" />
          Add Obligation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Compliance Obligation</DialogTitle>
          <DialogDescription>
            Create a compliance obligation for a previously adopted animal that didn't go through the standard checkout process.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!selectedAnimal ? (
            <div className="space-y-3">
              <Label>Search for Adopted Animal</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by animal name, adopter name, or email..."
                  value={animalSearch}
                  onChange={(e) => setAnimalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  data-testid="input-add-obligation-search"
                />
                <Button size="icon" variant="ghost" onClick={handleSearch} data-testid="button-add-obligation-search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {searching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {searchResults && searchResults.results.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.results.map((result) => (
                    <div
                      key={`${result.adoptionId}-${result.animalId}`}
                      className="p-3 rounded-md border hover-elevate cursor-pointer"
                      onClick={() => setSelectedAnimal(result)}
                      data-testid={`search-result-${result.animalId}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{result.animalName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {result.animalSpecies} {result.animalBreed ? `- ${result.animalBreed}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Adopter: {result.adopterName} ({result.adopterEmail})
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {new Date(result.adoptionDate).toLocaleDateString()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults && searchResults.results.length === 0 && animalSearchTerm.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No adopted animals found matching your search.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Selected Animal & Adopter</Label>
                <div className="p-3 rounded-md border mt-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{selectedAnimal.animalName}</p>
                    <p className="text-sm text-muted-foreground">
                      Adopter: {selectedAnimal.adopterName} ({selectedAnimal.adopterEmail})
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setSelectedAnimal(null); setAnimalSearch(""); setAnimalSearchTerm(""); }}
                    data-testid="button-change-animal"
                  >
                    Change
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="obligationType">Obligation Type</Label>
                <Select value={obligationType} onValueChange={setObligationType}>
                  <SelectTrigger data-testid="select-obligation-type">
                    <SelectValue placeholder="Select obligation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spay_neuter">Spay/Neuter</SelectItem>
                    <SelectItem value="rabies">Rabies Vaccine</SelectItem>
                    <SelectItem value="dhpp_booster">DHPP Booster</SelectItem>
                    <SelectItem value="ongoing_treatment">Ongoing Medical Treatment</SelectItem>
                    <SelectItem value="heartworm_prevention_proof">Heartworm Prevention Proof</SelectItem>
                    <SelectItem value="obedience_training">Obedience Training</SelectItem>
                    <SelectItem value="fecal_test">Fecal Test</SelectItem>
                    <SelectItem value="custom">Custom Obligation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {obligationType === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="customLabel">Custom Label</Label>
                  <Input
                    id="customLabel"
                    placeholder="e.g., Annual wellness exam, heartworm test..."
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    data-testid="input-custom-label"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="input-due-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about this obligation..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none"
                  data-testid="input-obligation-notes"
                />
              </div>
            </div>
          )}
        </div>

        {selectedAnimal && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setOpen(false); }} data-testid="button-cancel-add-obligation">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
              data-testid="button-submit-obligation"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Obligation
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdopterCompliancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [alumniSearch, setAlumniSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery<AdopterComplianceResponse>({
    queryKey: ["/api/dashboard/adopter-compliance"],
    enabled: !!user,
  });

  const { data: alumniData, isLoading: alumniLoading } = useQuery<{ results: AlumniResult[] }>({
    queryKey: ["/api/dashboard/adopter-compliance/alumni-search", searchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/adopter-compliance/alumni-search?q=${encodeURIComponent(searchTerm)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: !!user && searchTerm.length >= 2,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, proofDocumentUrl }: { id: string; proofDocumentUrl?: string }) => {
      const res = await apiRequest("PATCH", `/api/dashboard/adopter-compliance/${id}/complete`, { proofDocumentUrl });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Obligation marked complete" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/adopter-compliance"] });
      setCompletingId(null);
      setProofUrl("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to mark complete", description: error.message, variant: "destructive" });
    },
  });

  const waiveMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/dashboard/adopter-compliance/${id}/waive`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Obligation waived" });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/adopter-compliance"] });
      setWaivingId(null);
      setWaiveReason("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to waive obligation", description: error.message, variant: "destructive" });
    },
  });

  const handleAlumniSearch = () => {
    if (alumniSearch.trim().length >= 2) {
      setSearchTerm(alumniSearch.trim());
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout
        title="Adopter Compliance Monitor"
        description="Track post-adoption compliance obligations"
      >
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </DashboardLayout>
    );
  }

  const stats = data?.stats;

  function renderObligationCard(obligation: Obligation, variant: "overdue" | "upcoming" | "neutral") {
    const isOverdue = variant === "overdue";
    const borderClass = isOverdue
      ? "border-destructive/30 bg-destructive/5"
      : variant === "upcoming"
        ? "border-orange-300/50 bg-orange-50 dark:bg-orange-950/20"
        : "border";

    return (
      <div
        key={obligation.id}
        className={`p-4 rounded-md ${borderClass}`}
        data-testid={`obligation-card-${obligation.id}`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <PawPrint className={`h-5 w-5 mt-0.5 shrink-0 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className="font-medium" data-testid={`obligation-animal-${obligation.id}`}>{obligation.animalName}</p>
              <p className="text-sm text-muted-foreground">{obligation.animalSpecies}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={isOverdue ? "destructive" : "secondary"} data-testid={`obligation-type-${obligation.id}`}>
                  {getObligationLabel(obligation.obligationType)}
                </Badge>
                {obligation.label && obligation.label !== getObligationLabel(obligation.obligationType) && (
                  <span className="text-xs text-muted-foreground">{obligation.label}</span>
                )}
              </div>
              <p className="text-sm mt-1">
                <span className="text-muted-foreground">Adopter:</span> {obligation.adopterName}
              </p>
              <p className="text-xs text-muted-foreground">
                Due: {new Date(obligation.contractualDueDate).toLocaleDateString()}
              </p>
              {isOverdue && obligation.daysOverdue > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {obligation.daysOverdue} days overdue
                </Badge>
              )}
              {!isOverdue && obligation.daysUntilDue >= 0 && (
                <span className="text-xs text-muted-foreground mt-1 block">
                  {obligation.daysUntilDue} days until due
                </span>
              )}
              {obligation.notes && (
                <p className="text-xs text-muted-foreground mt-1 italic">{obligation.notes}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0">
            {obligation.status === "pending" && (
              <>
                {completingId === obligation.id ? (
                  <div className="flex flex-col gap-2 items-end" data-testid={`complete-form-${obligation.id}`}>
                    <Input
                      placeholder="Proof URL (optional)"
                      value={proofUrl}
                      onChange={(e) => setProofUrl(e.target.value)}
                      className="w-48 text-sm"
                      data-testid={`input-proof-url-${obligation.id}`}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => completeMutation.mutate({ id: obligation.id, proofDocumentUrl: proofUrl || undefined })}
                        disabled={completeMutation.isPending}
                        data-testid={`button-confirm-complete-${obligation.id}`}
                      >
                        {completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCompletingId(null); setProofUrl(""); }} data-testid={`button-cancel-complete-${obligation.id}`}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : waivingId === obligation.id ? (
                  <div className="flex flex-col gap-2 items-end" data-testid={`waive-form-${obligation.id}`}>
                    <Input
                      placeholder="Reason (optional)"
                      value={waiveReason}
                      onChange={(e) => setWaiveReason(e.target.value)}
                      className="w-48 text-sm"
                      data-testid={`input-waive-reason-${obligation.id}`}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => waiveMutation.mutate({ id: obligation.id, reason: waiveReason || undefined })}
                        disabled={waiveMutation.isPending}
                        data-testid={`button-confirm-waive-${obligation.id}`}
                      >
                        {waiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Waive"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setWaivingId(null); setWaiveReason(""); }} data-testid={`button-cancel-waive-${obligation.id}`}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => { setCompletingId(obligation.id); setWaivingId(null); }}
                      data-testid={`button-mark-complete-${obligation.id}`}
                    >
                      <FileCheck className="h-4 w-4 mr-1" />
                      Mark Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setWaivingId(obligation.id); setCompletingId(null); }}
                      data-testid={`button-waive-${obligation.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Waive
                    </Button>
                  </div>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(`mailto:${obligation.adopterEmail}`)}
              data-testid={`button-contact-${obligation.id}`}
            >
              <Mail className="h-4 w-4 mr-1" />
              Contact
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderObligationList(obligations: Obligation[], variant: "overdue" | "upcoming" | "neutral", emptyMessage: string) {
    if (obligations.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground" data-testid="empty-list-message">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-600" />
          <p>{emptyMessage}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {obligations.map((o) => renderObligationCard(o, variant))}
      </div>
    );
  }

  const isAdminOrOwner = user?.activeRole === "admin" || user?.activeRole === "owner" || user?.activeRole === "manager";

  return (
    <DashboardLayout
      title="Adopter Compliance Monitor"
      description="Track post-adoption compliance obligations"
      actions={isAdminOrOwner ? <AddObligationDialog onCreated={() => {}} /> : undefined}
    >
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card data-testid="stat-card-total">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total Obligations</p>
                <p className="text-3xl font-bold" data-testid="stat-total-obligations">
                  {stats?.totalActiveReminders || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-overdue">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-3xl font-bold text-destructive" data-testid="stat-overdue">
                  {stats?.totalOverdue || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-upcoming">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Upcoming</p>
                <p className="text-3xl font-bold text-orange-600" data-testid="stat-upcoming">
                  {data?.upcoming?.length || 0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-compliance-rate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Compliance Rate</p>
                <p className="text-3xl font-bold" data-testid="stat-compliance-rate">
                  {stats?.complianceRate || 0}%
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${(stats?.complianceRate || 0) >= 80 ? "bg-green-100 dark:bg-green-950/30" : "bg-orange-100 dark:bg-orange-950/30"}`}>
                {(stats?.complianceRate || 0) >= 80 ? (
                  <TrendingUp className="h-6 w-6 text-green-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-orange-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">
            Overdue ({data?.overdue?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming ({data?.upcoming?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="ongoing" data-testid="tab-ongoing">
            Ongoing Treatments ({data?.ongoingTreatments?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="custom" data-testid="tab-custom">
            Custom Requirements ({data?.customObligations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({data?.completed?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="heartworm" data-testid="tab-heartworm">Heartworm Watch</TabsTrigger>
          <TabsTrigger value="alumni" data-testid="tab-alumni">Alumni</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Overdue Obligations
                </CardTitle>
                <CardDescription>Obligations past their due date</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.overdue?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                    <p>No overdue obligations</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data!.overdue.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-md border border-destructive/30 bg-destructive/5"
                        data-testid={`overview-overdue-${o.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PawPrint className="h-5 w-5 text-destructive shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{o.animalName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {getObligationLabel(o.obligationType)} - {o.adopterName}
                            </p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="shrink-0">
                          {o.daysOverdue}d overdue
                        </Badge>
                      </div>
                    ))}
                    {data!.overdue.length > 5 && (
                      <Button variant="ghost" className="w-full" onClick={() => setActiveTab("overdue")} data-testid="button-view-all-overdue">
                        View all {data!.overdue.length} overdue
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  At-Risk Adopters
                </CardTitle>
                <CardDescription>Adopters with multiple overdue obligations</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.atRiskAdopters?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                    <p>No at-risk adopters</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data!.atRiskAdopters.slice(0, 5).map((adopter, idx) => (
                      <div
                        key={adopter.email || idx}
                        className="p-3 rounded-md border border-orange-300/50 bg-orange-50 dark:bg-orange-950/20"
                        data-testid={`at-risk-adopter-${idx}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{adopter.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{adopter.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {adopter.obligations.slice(0, 2).map((o, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {o.animalName}: {getObligationLabel(o.obligationType)}
                                </Badge>
                              ))}
                              {adopter.obligations.length > 2 && (
                                <Badge variant="outline" className="text-xs">+{adopter.obligations.length - 2} more</Badge>
                              )}
                            </div>
                          </div>
                          <Badge variant="destructive" className="shrink-0">
                            {adopter.overdueCount} overdue
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Obligations</CardTitle>
              <CardDescription>These obligations are past their contractual due date</CardDescription>
            </CardHeader>
            <CardContent>
              {renderObligationList(data?.overdue || [], "overdue", "No overdue obligations!")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upcoming">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Obligations</CardTitle>
              <CardDescription>Obligations due soon</CardDescription>
            </CardHeader>
            <CardContent>
              {renderObligationList(data?.upcoming || [], "upcoming", "No upcoming obligations")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ongoing">
          <Card>
            <CardHeader>
              <CardTitle>Ongoing Treatments</CardTitle>
              <CardDescription>Recurring treatment obligations</CardDescription>
            </CardHeader>
            <CardContent>
              {renderObligationList(data?.ongoingTreatments || [], "neutral", "No ongoing treatment obligations")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom">
          <Card>
            <CardHeader>
              <CardTitle>Custom Requirements</CardTitle>
              <CardDescription>Custom compliance obligations</CardDescription>
            </CardHeader>
            <CardContent>
              {renderObligationList(data?.customObligations || [], "neutral", "No custom obligations")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Obligations</CardTitle>
              <CardDescription>Obligations that have been fulfilled</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.completed?.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="empty-completed">
                  <Clock className="h-10 w-10 mx-auto mb-2" />
                  <p>No completed obligations yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data!.completed.map((o) => (
                    <div key={o.id} className="p-4 rounded-md border" data-testid={`completed-card-${o.id}`}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                          <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium">{o.animalName}</p>
                            <Badge variant="secondary">{getObligationLabel(o.obligationType)}</Badge>
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Adopter:</span> {o.adopterName}
                            </p>
                            {o.completedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Completed: {new Date(o.completedAt).toLocaleDateString()}
                              </p>
                            )}
                            {o.proofDocumentUrl && (
                              <a
                                href={o.proofDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                                data-testid={`link-proof-${o.id}`}
                              >
                                <LinkIcon className="h-3 w-3" />
                                View Proof
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heartworm">
          <HeartwormWatchTab />
        </TabsContent>

        <TabsContent value="alumni">
          <Card>
            <CardHeader>
              <CardTitle>Alumni Search</CardTitle>
              <CardDescription>Search adopted animals by name, email, or microchip</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  placeholder="Search by name, microchip, or email..."
                  value={alumniSearch}
                  onChange={(e) => setAlumniSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAlumniSearch()}
                  data-testid="input-alumni-search"
                />
                <Button size="icon" variant="ghost" onClick={handleAlumniSearch} data-testid="button-alumni-search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {alumniLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchTerm.length < 2 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-2" />
                  <p>Enter at least 2 characters to search</p>
                </div>
              ) : (alumniData?.results?.length || 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No alumni found. Try a different search.</p>
              ) : (
                <div className="space-y-3">
                  {alumniData!.results.map((result) => (
                    <div key={result.adoptionId} className="p-3 border rounded-md" data-testid={`alumni-result-${result.adoptionId}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{result.animalName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            Adopted by {result.adopterName} on {new Date(result.adoptionDate).toLocaleDateString()}
                          </p>
                          {result.microchip && (
                            <p className="text-xs text-muted-foreground">Microchip: {result.microchip.number}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant="secondary">{result.animalSpecies}</Badge>
                          {result.contract?.contractPdfUrl && (
                            <a
                              href={result.contract.contractPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                              data-testid={`link-contract-pdf-${result.adoptionId}`}
                            >
                              View Contract
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
