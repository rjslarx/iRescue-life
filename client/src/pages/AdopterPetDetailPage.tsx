import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Shield, 
  Heart, 
  Camera, 
  Syringe, 
  Stethoscope, 
  Scale, 
  Pill, 
  Calendar,
  Check,
  Plus,
  Download,
  ExternalLink,
  Fingerprint,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bug,
  X,
  Loader2,
  Copy,
  ClipboardCheck,
  Upload,
  CheckCircle
} from "lucide-react";

interface AdoptedAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  photoUrls?: string[];
  adoptedAt: string;
  microchipNumber?: string;
  weight?: string;
  status?: string;
  deceasedDate?: string | null;
}

interface VaccineRecord {
  id: string;
  vaccineName: string;
  dateAdministered: string;
  expirationDate?: string;
  veterinarian?: string;
}

interface MedicalExam {
  id: string;
  examType: string;
  examDate: string;
  findings?: string;
  veterinarian?: string;
}

interface WeightLog {
  id: string;
  weight: string;
  weightUnit: string;
  weightValue?: number;
  loggedAt: string;
  notes?: string;
}

interface MedicationReminder {
  id: string;
  medicationName: string;
  frequency: string;
  nextDueDate: string;
  lastConfirmedDate?: string;
}

interface HappyTailUpdate {
  id: string;
  photoUrls?: string[];
  message?: string;
  isApproved: boolean;
  createdAt: string;
}

interface AdoptionDocument {
  id: number;
  contractPdfUrl: string | null;
  signerName: string;
  signedAt: string;
  sessionStatus: string;
}

interface DueCareItem {
  id: string;
  careName: string;
  careCategory: string;
  nextDueDate: string;
  dateAdministered: string;
  isOverdue: boolean;
}

interface ComplianceConfirmation {
  id: string;
  careName: string;
  careCategory: string;
  dateAdministered: string;
  clinicName?: string;
  status: string;
  createdAt: string;
}

interface ComplianceObligation {
  id: string;
  obligationType: string;
  contractualDueDate: string | null;
  status: string;
  proofDocumentUrl: string | null;
}

export default function AdopterPetDetailPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("compliance");
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showConfirmCareDialog, setShowConfirmCareDialog] = useState(false);
  const [selectedCareItem, setSelectedCareItem] = useState<DueCareItem | null>(null);
  const [showHappyTailDialog, setShowHappyTailDialog] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const obligationReceiptInputRef = useRef<HTMLInputElement>(null);
  const [chipCopied, setChipCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [showObligationDialog, setShowObligationDialog] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<ComplianceObligation | null>(null);
  const [obligationReceiptFile, setObligationReceiptFile] = useState<File | null>(null);
  const [obligationReceiptUrl, setObligationReceiptUrl] = useState<string | null>(null);
  const [isUploadingObligationReceipt, setIsUploadingObligationReceipt] = useState(false);

  const { data: pet, isLoading: petLoading } = useQuery<AdoptedAnimal>({
    queryKey: ["/api/adopter/pets", animalId],
    enabled: !!animalId,
  });

  const { data: vaccinations } = useQuery<VaccineRecord[]>({
    queryKey: ["/api/adopter/pets", animalId, "vaccinations"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const { data: exams } = useQuery<MedicalExam[]>({
    queryKey: ["/api/adopter/pets", animalId, "medical-exams"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const { data: weightLogs } = useQuery<WeightLog[]>({
    queryKey: ["/api/adopter/pets", animalId, "weight-logs"],
    enabled: !!animalId && activeTab === "health",
  });

  const { data: reminders } = useQuery<MedicationReminder[]>({
    queryKey: ["/api/adopter/pets", animalId, "medication-reminders"],
    enabled: !!animalId && activeTab === "health",
  });

  const { data: happyTails } = useQuery<HappyTailUpdate[]>({
    queryKey: ["/api/adopter/pets", animalId, "happy-tails"],
    enabled: !!animalId && activeTab === "alumni",
  });

  const { data: adoptionDocuments } = useQuery<AdoptionDocument[]>({
    queryKey: ["/api/adopter/pets", animalId, "adoption-documents"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const { data: dueCareItems } = useQuery<DueCareItem[]>({
    queryKey: ["/api/adopter/pets", animalId, "due-care"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const { data: complianceConfirmations } = useQuery<ComplianceConfirmation[]>({
    queryKey: ["/api/adopter/pets", animalId, "compliance-confirmations"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const { data: complianceObligations } = useQuery<ComplianceObligation[]>({
    queryKey: ["/api/adopter/pets", animalId, "compliance-obligations"],
    enabled: !!animalId && activeTab === "compliance",
  });

  const submitObligationProofMutation = useMutation({
    mutationFn: async ({ obligationId, fileUrl }: { obligationId: string; fileUrl: string }) => {
      const res = await apiRequest("POST", `/api/adopter/pets/${animalId}/compliance-obligations/${obligationId}/submit-proof`, { fileUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "compliance-obligations"] });
      setShowObligationDialog(false);
      setSelectedObligation(null);
      setObligationReceiptFile(null);
      setObligationReceiptUrl(null);
      toast({ title: "Proof submitted! Your rescue will review it." });
    },
    onError: () => {
      toast({ title: "Failed to submit proof", variant: "destructive" });
    },
  });

  const addWeightMutation = useMutation({
    mutationFn: async (data: { weight: string; weightUnit: string; notes?: string }) => {
      return apiRequest("POST", `/api/adopter/pets/${animalId}/weight-logs`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "weight-logs"] });
      setShowWeightDialog(false);
      toast({ title: "Weight logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log weight", variant: "destructive" });
    },
  });

  const addReminderMutation = useMutation({
    mutationFn: async (data: { medicationName: string; frequency: string; nextDueDate: string }) => {
      return apiRequest("POST", `/api/adopter/pets/${animalId}/medication-reminders`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "medication-reminders"] });
      setShowReminderDialog(false);
      toast({ title: "Reminder created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create reminder", variant: "destructive" });
    },
  });

  const confirmCareMutation = useMutation({
    mutationFn: async (data: {
      animalId: string;
      preventativeCareRecordId: string;
      careCategory: string;
      careName: string;
      dateAdministered: string;
      clinicName?: string;
      notes?: string;
      fileUrl?: string;
    }) => {
      return apiRequest("POST", `/api/adopter/compliance-confirmations`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "due-care"] });
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "compliance-confirmations"] });
      setShowConfirmCareDialog(false);
      setSelectedCareItem(null);
      setReceiptFile(null);
      setReceiptUrl(null);
      toast({ title: "Confirmation submitted! Your rescue will review it." });
    },
    onError: () => {
      toast({ title: "Failed to submit confirmation", variant: "destructive" });
    },
  });

  const confirmMedicationMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      return apiRequest("POST", `/api/adopter/medication-reminders/${reminderId}/confirm`, { confirmedVia: "app" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "medication-reminders"] });
      toast({ title: "Medication confirmed!" });
    },
    onError: () => {
      toast({ title: "Failed to confirm", variant: "destructive" });
    },
  });

  const submitHappyTailMutation = useMutation({
    mutationFn: async (data: { message?: string; photoUrls?: string[] }) => {
      return apiRequest("POST", `/api/adopter/pets/${animalId}/happy-tails`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/pets", animalId, "happy-tails"] });
      setShowHappyTailDialog(false);
      setSelectedPhotos([]);
      setPhotoPreviews([]);
      toast({ title: "Update submitted! It will be reviewed by staff." });
    },
    onError: () => {
      toast({ title: "Failed to submit update", variant: "destructive" });
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxPhotos = 5;
    const remaining = maxPhotos - selectedPhotos.length;
    const newFiles = files.slice(0, remaining);

    if (files.length > remaining) {
      toast({ title: `You can upload up to ${maxPhotos} photos total.`, variant: "destructive" });
    }

    setSelectedPhotos(prev => [...prev, ...newFiles]);

    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadPhotosAndSubmit = async (message: string) => {
    let photoUrls: string[] = [];

    if (selectedPhotos.length > 0) {
      setIsUploadingPhotos(true);
      try {
        const formData = new FormData();
        selectedPhotos.forEach(file => formData.append('files', file));
        const response = await fetch('/api/adopter/photos/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Upload failed');
        }
        const result = await response.json();
        photoUrls = result.uploadedPaths || [];
      } catch (err: any) {
        setIsUploadingPhotos(false);
        toast({ title: err.message || "Failed to upload photos", variant: "destructive" });
        return;
      }
      setIsUploadingPhotos(false);
    }

    submitHappyTailMutation.mutate({ message, photoUrls });
  };

  if (petLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Pet not found</h2>
          <p className="text-muted-foreground mb-4">
            We couldn't find this pet in your records.
          </p>
          <Link href="/my-pets">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Pets
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Link href="/my-pets">
        <Button variant="ghost" className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Pets
        </Button>
      </Link>

      <Card className="mb-6 overflow-hidden">
        <div className="md:flex">
          {pet.photoUrls && pet.photoUrls.length > 0 ? (
            <div className="md:w-1/3">
              <img
                src={pet.photoUrls[0]}
                alt={pet.name}
                className="w-full h-48 md:h-full object-cover"
              />
            </div>
          ) : null}
          <CardContent className="flex-1 p-6">
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-pet-name">{pet.name}</h1>
            <p className="text-muted-foreground mb-4">
              {pet.breed} • {pet.species}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <Calendar className="h-3 w-3 mr-1" />
                Adopted {pet.adoptedAt ? new Date(pet.adoptedAt).toLocaleDateString() : 'Date unknown'}
              </Badge>
              {pet.microchipNumber && (
                <Badge variant="outline">
                  <Fingerprint className="h-3 w-3 mr-1" />
                  Chip: {pet.microchipNumber}
                </Badge>
              )}
              {pet.weight && (
                <Badge variant="outline">
                  <Scale className="h-3 w-3 mr-1" />
                  {pet.weight}
                </Badge>
              )}
            </div>
          </CardContent>
        </div>
      </Card>

      {pet.status === 'deceased' && (
        <Card className="mb-6 border-muted" data-testid="banner-memorial">
          <CardContent className="flex items-center gap-3 p-4">
            <Heart className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">In Loving Memory</p>
              <p className="text-sm text-muted-foreground">
                {pet.name}'s records are preserved here. Automated reminders have been stopped.
                {pet.deceasedDate && ` Passed on ${new Date(pet.deceasedDate).toLocaleDateString()}.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            <Shield className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <Heart className="h-4 w-4 mr-2" />
            Health
          </TabsTrigger>
          <TabsTrigger value="alumni" data-testid="tab-alumni">
            <Camera className="h-4 w-4 mr-2" />
            Alumni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliance" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(`/api/adopter/pets/${animalId}/adoption-packet`, '_blank')}
              data-testid="button-download-adoption-packet"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Adoption Packet
            </Button>
          </div>

          {pet.microchipNumber && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Fingerprint className="h-5 w-5" />
                  Microchip
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-mono text-lg">{pet.microchipNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Keep your contact info updated with the registry
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(pet.microchipNumber || '');
                        setChipCopied(true);
                        setTimeout(() => setChipCopied(false), 2000);
                      }}
                      data-testid="button-copy-microchip"
                    >
                      {chipCopied ? (
                        <><Check className="h-4 w-4 mr-2 text-green-600" />Copied</>
                      ) : (
                        <><Copy className="h-4 w-4 mr-2" />Copy</>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a 
                        href={`https://www.petmicrochiplookup.org/?microchip_id=${encodeURIComponent(pet.microchipNumber || '')}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        data-testid="link-microchip-registry"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Lookup Registry
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {complianceObligations && complianceObligations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Post-Adoption Requirements
                </CardTitle>
                <CardDescription>
                  These are contractual obligations from your adoption agreement. Upload proof when completed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {complianceObligations.map((obl) => {
                  const labelMap: Record<string, string> = {
                    spay_neuter: 'Spay/Neuter Certificate',
                    rabies_booster: 'Rabies Booster',
                    vet_checkup: 'Vet Check-Up',
                    microchip_registration: 'Microchip Registration',
                    heartworm_test: 'Heartworm Test',
                    flea_tick_prevention: 'Flea & Tick Prevention',
                  };
                  const label = labelMap[obl.obligationType] || obl.obligationType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div
                      key={obl.id}
                      className="flex items-center justify-between p-3 border rounded-lg flex-wrap gap-3"
                      data-testid={`obligation-${obl.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{label}</p>
                        {obl.contractualDueDate && (
                          <p className="text-sm text-muted-foreground">
                            Due by {new Date(obl.contractualDueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {obl.status === 'completed' && (
                          <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                        {obl.status === 'pending_review' && (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                            <Clock className="h-3 w-3 mr-1" />
                            Under Review
                          </Badge>
                        )}
                        {(obl.status === 'pending' || obl.status === 'overdue') && (
                          <>
                            {obl.status === 'overdue' && (
                              <Badge variant="destructive" className="text-xs">Overdue</Badge>
                            )}
                            <Button
                              size="sm"
                              variant={obl.status === 'overdue' ? 'default' : 'outline'}
                              onClick={() => {
                                setSelectedObligation(obl);
                                setObligationReceiptFile(null);
                                setObligationReceiptUrl(null);
                                setShowObligationDialog(true);
                              }}
                              data-testid={`button-upload-proof-${obl.id}`}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              Upload Proof
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Dialog open={showObligationDialog} onOpenChange={(open) => {
            setShowObligationDialog(open);
            if (!open) {
              setSelectedObligation(null);
              setObligationReceiptFile(null);
              setObligationReceiptUrl(null);
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Proof</DialogTitle>
                <DialogDescription>
                  Upload a photo or PDF of the documentation for this requirement. Your rescue will review and mark it as verified.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Document (required)</Label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    ref={obligationReceiptInputRef}
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setObligationReceiptFile(file);
                      setIsUploadingObligationReceipt(true);
                      try {
                        const form = new FormData();
                        form.append('photo', file);
                        const res = await fetch('/api/adopter/photos/upload', { method: 'POST', body: form });
                        const data = await res.json();
                        setObligationReceiptUrl(data.url || data.fileUrl || null);
                        toast({ title: "File uploaded successfully" });
                      } catch {
                        toast({ title: "Upload failed", variant: "destructive" });
                        setObligationReceiptFile(null);
                      } finally {
                        setIsUploadingObligationReceipt(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-1"
                    onClick={() => obligationReceiptInputRef.current?.click()}
                    disabled={isUploadingObligationReceipt}
                    data-testid="button-choose-obligation-file"
                  >
                    {isUploadingObligationReceipt ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                    ) : obligationReceiptFile ? (
                      <><Check className="h-4 w-4 mr-2 text-green-600" />{obligationReceiptFile.name}</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Choose File</>
                    )}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!obligationReceiptUrl || submitObligationProofMutation.isPending}
                  onClick={() => {
                    if (selectedObligation && obligationReceiptUrl) {
                      submitObligationProofMutation.mutate({ obligationId: selectedObligation.id, fileUrl: obligationReceiptUrl });
                    }
                  }}
                  data-testid="button-submit-obligation-proof"
                >
                  {submitObligationProofMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                  ) : "Submit Proof"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {pet.status !== 'deceased' && ((dueCareItems && dueCareItems.length > 0) || (complianceConfirmations && complianceConfirmations.some(c => c.status === 'pending_review'))) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Action Required
                </CardTitle>
                <CardDescription>
                  These items are due or overdue. Confirm when completed and your rescue will verify.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dueCareItems && dueCareItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      item.isOverdue
                        ? "border-destructive bg-destructive/5"
                        : "border-orange-500 bg-orange-50 dark:bg-orange-950"
                    }`}
                    data-testid={`due-care-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {item.careCategory === 'parasite_prevention' ? (
                        <Bug className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Syringe className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{item.careName}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.isOverdue ? (
                            <span className="text-destructive font-medium">
                              Overdue since {new Date(item.nextDueDate).toLocaleDateString()}
                            </span>
                          ) : (
                            <>Due: {new Date(item.nextDueDate).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={item.isOverdue ? "default" : "outline"}
                      onClick={() => {
                        setSelectedCareItem(item);
                        setShowConfirmCareDialog(true);
                      }}
                      data-testid={`button-confirm-care-${item.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Confirm Given
                    </Button>
                  </div>
                ))}

                {complianceConfirmations && complianceConfirmations.filter(c => c.status === 'pending_review').map((conf) => (
                  <div
                    key={conf.id}
                    className="flex items-center justify-between p-3 border rounded-lg border-blue-300 bg-blue-50 dark:bg-blue-950"
                    data-testid={`pending-confirmation-${conf.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{conf.careName}</p>
                        <p className="text-sm text-muted-foreground">
                          Given on {new Date(conf.dateAdministered).toLocaleDateString()}
                          {conf.clinicName && <> at {conf.clinicName}</>}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">Pending Review</Badge>
                  </div>
                ))}

                {complianceConfirmations && complianceConfirmations.filter(c => c.status === 'approved').length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Recently Approved</p>
                    {complianceConfirmations.filter(c => c.status === 'approved').slice(0, 3).map((conf) => (
                      <div key={conf.id} className="flex items-center gap-2 py-1" data-testid={`approved-confirmation-${conf.id}`}>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{conf.careName} - {new Date(conf.dateAdministered).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={showConfirmCareDialog} onOpenChange={(open) => {
            setShowConfirmCareDialog(open);
            if (!open) {
              setSelectedCareItem(null);
              setReceiptFile(null);
              setReceiptUrl(null);
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Care Completed</DialogTitle>
                <DialogDescription>
                  Let your rescue know that {selectedCareItem?.careName} has been administered to {pet?.name}. They'll review and update the records.
                </DialogDescription>
              </DialogHeader>
              <input
                type="file"
                accept="image/*,application/pdf"
                ref={receiptInputRef}
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReceiptFile(file);
                  setIsUploadingReceipt(true);
                  try {
                    const form = new FormData();
                    form.append('photo', file);
                    const res = await fetch('/api/adopter/photos/upload', { method: 'POST', body: form });
                    const data = await res.json();
                    setReceiptUrl(data.url || data.fileUrl || null);
                    toast({ title: "Receipt uploaded" });
                  } catch {
                    toast({ title: "Upload failed", variant: "destructive" });
                    setReceiptFile(null);
                  } finally {
                    setIsUploadingReceipt(false);
                  }
                }}
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedCareItem || !animalId) return;
                  const formData = new FormData(e.target as HTMLFormElement);
                  confirmCareMutation.mutate({
                    animalId,
                    preventativeCareRecordId: selectedCareItem.id,
                    careCategory: selectedCareItem.careCategory,
                    careName: selectedCareItem.careName,
                    dateAdministered: formData.get("dateAdministered") as string,
                    clinicName: (formData.get("clinicName") as string) || undefined,
                    notes: (formData.get("notes") as string) || undefined,
                    fileUrl: receiptUrl || undefined,
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="dateAdministered">Date Given</Label>
                  <Input
                    id="dateAdministered"
                    name="dateAdministered"
                    type="date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    required
                    data-testid="input-date-administered"
                  />
                </div>
                <div>
                  <Label htmlFor="clinicName">Vet / Clinic Name (optional)</Label>
                  <Input
                    id="clinicName"
                    name="clinicName"
                    placeholder="e.g., Main Street Animal Hospital"
                    data-testid="input-clinic-name"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmNotes">Notes (optional)</Label>
                  <Textarea
                    id="confirmNotes"
                    name="notes"
                    placeholder="Any details about the visit"
                    data-testid="input-confirm-notes"
                  />
                </div>
                <div>
                  <Label>Vet Receipt (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-1"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={isUploadingReceipt}
                    data-testid="button-choose-receipt"
                  >
                    {isUploadingReceipt ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                    ) : receiptFile ? (
                      <><Check className="h-4 w-4 mr-2 text-green-600" />{receiptFile.name}</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Attach Receipt or Photo</>
                    )}
                  </Button>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={confirmCareMutation.isPending || isUploadingReceipt} data-testid="button-submit-confirmation">
                    {confirmCareMutation.isPending ? "Submitting..." : "Submit Confirmation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Syringe className="h-5 w-5" />
                Vaccination Records
              </CardTitle>
              <CardDescription>
                Download your pet's vaccine certificates for boarding, grooming, or vet visits
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vaccinations && vaccinations.length > 0 ? (
                <div className="space-y-3">
                  {vaccinations.map((vax) => (
                    <div 
                      key={vax.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{vax.vaccineName}</p>
                        <p className="text-sm text-muted-foreground">
                          Given: {new Date(vax.dateAdministered).toLocaleDateString()}
                          {vax.expirationDate && (
                            <> • Expires: {new Date(vax.expirationDate).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No vaccination records available
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Medical Exams
              </CardTitle>
            </CardHeader>
            <CardContent>
              {exams && exams.length > 0 ? (
                <div className="space-y-3">
                  {exams.map((exam) => (
                    <div 
                      key={exam.id} 
                      className="p-3 border rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{exam.examType}</p>
                        <span className="text-sm text-muted-foreground">
                          {new Date(exam.examDate).toLocaleDateString()}
                        </span>
                      </div>
                      {exam.findings && (
                        <p className="text-sm text-muted-foreground">{exam.findings}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No exam records available
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Adoption Agreement
              </CardTitle>
              <CardDescription>
                Your signed adoption contract
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adoptionDocuments && adoptionDocuments.length > 0 ? (
                <div className="space-y-3">
                  {adoptionDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">Adoption Agreement</p>
                        <p className="text-sm text-muted-foreground">
                          Signed by {doc.signerName} on {new Date(doc.signedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {doc.contractPdfUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={doc.contractPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`button-download-contract-${doc.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No adoption documents available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Medication Reminders
                </CardTitle>
                <CardDescription>
                  Track when medications are due
                </CardDescription>
              </div>
              <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={pet.status === 'deceased'} data-testid="button-add-reminder">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Medication Reminder</DialogTitle>
                    <DialogDescription>
                      Set up a recurring reminder for {pet.name}'s medication
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.target as HTMLFormElement);
                      addReminderMutation.mutate({
                        medicationName: formData.get("medicationName") as string,
                        frequency: formData.get("frequency") as string,
                        nextDueDate: formData.get("nextDueDate") as string,
                      });
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="medicationName">Medication Name</Label>
                      <Input 
                        id="medicationName" 
                        name="medicationName" 
                        placeholder="e.g., Heartworm Prevention"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="frequency">Frequency</Label>
                      <Select name="frequency" defaultValue="monthly">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="nextDueDate">Next Due Date</Label>
                      <Input 
                        id="nextDueDate" 
                        name="nextDueDate" 
                        type="date"
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={addReminderMutation.isPending}>
                        {addReminderMutation.isPending ? "Creating..." : "Create Reminder"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {reminders && reminders.length > 0 ? (
                <div className="space-y-3">
                  {reminders.map((reminder) => {
                    const isDue = new Date(reminder.nextDueDate) <= new Date();
                    return (
                      <div 
                        key={reminder.id} 
                        className={`flex items-center justify-between p-3 border rounded-lg ${
                          isDue ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : ""
                        }`}
                      >
                        <div>
                          <p className="font-medium">{reminder.medicationName}</p>
                          <p className="text-sm text-muted-foreground">
                            {isDue ? "Due now!" : `Due: ${new Date(reminder.nextDueDate).toLocaleDateString()}`}
                            {" • "}{reminder.frequency}
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          variant={isDue ? "default" : "outline"}
                          onClick={() => confirmMedicationMutation.mutate(reminder.id)}
                          disabled={confirmMedicationMutation.isPending}
                          data-testid={`button-confirm-${reminder.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Done
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No medication reminders set up
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Weight Tracker
                </CardTitle>
                <CardDescription>
                  Track {pet.name}'s weight over time
                </CardDescription>
              </div>
              <Dialog open={showWeightDialog} onOpenChange={setShowWeightDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={pet.status === 'deceased'} data-testid="button-add-weight">
                    <Plus className="h-4 w-4 mr-1" />
                    Log Weight
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Weight</DialogTitle>
                    <DialogDescription>
                      Record {pet.name}'s current weight
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.target as HTMLFormElement);
                      addWeightMutation.mutate({
                        weight: formData.get("weight") as string,
                        weightUnit: formData.get("weightUnit") as string,
                        notes: formData.get("notes") as string || undefined,
                      });
                    }}
                    className="space-y-4"
                  >
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="weight">Weight</Label>
                        <Input 
                          id="weight" 
                          name="weight" 
                          placeholder="e.g., 25"
                          required
                        />
                      </div>
                      <div className="w-24">
                        <Label htmlFor="weightUnit">Unit</Label>
                        <Select name="weightUnit" defaultValue="lbs">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lbs">lbs</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea 
                        id="notes" 
                        name="notes" 
                        placeholder="Any notes about this weigh-in"
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={addWeightMutation.isPending}>
                        {addWeightMutation.isPending ? "Saving..." : "Save Weight"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {weightLogs && weightLogs.length > 0 ? (
                <div className="space-y-2">
                  {weightLogs.slice(0, 10).map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <span className="font-medium">{log.weight} {log.weightUnit}</span>
                        {log.notes && (
                          <span className="text-sm text-muted-foreground ml-2">
                            - {log.notes}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(log.loggedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No weight logs yet. Start tracking!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alumni" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Happy Tail Updates
                </CardTitle>
                <CardDescription>
                  Share updates about {pet.name}! We love seeing our alumni living their best lives.
                </CardDescription>
              </div>
              <Dialog open={showHappyTailDialog} onOpenChange={setShowHappyTailDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={pet.status === 'deceased'} data-testid="button-submit-update">
                    <Plus className="h-4 w-4 mr-1" />
                    Share Update
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share a Happy Tail Update</DialogTitle>
                    <DialogDescription>
                      Tell us how {pet.name} is doing! Your update may be shared on our social media (with your permission).
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.target as HTMLFormElement);
                      const message = formData.get("message") as string || "";
                      if (!message.trim() && selectedPhotos.length === 0) {
                        toast({ title: "Please add a message or photo", variant: "destructive" });
                        return;
                      }
                      uploadPhotosAndSubmit(message);
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="message">Your Update</Label>
                      <Textarea 
                        id="message" 
                        name="message" 
                        placeholder={`How is ${pet.name} doing? What's new?`}
                        className="min-h-[100px]"
                        data-testid="input-happy-tail-message"
                      />
                    </div>
                    <div>
                      <Label>Photos (up to 5)</Label>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                        data-testid="input-photo-file"
                      />
                      {photoPreviews.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {photoPreviews.map((preview, idx) => (
                            <div key={idx} className="relative group">
                              <img 
                                src={preview} 
                                alt={`Preview ${idx + 1}`} 
                                className="h-20 w-20 object-cover rounded-md border"
                                data-testid={`img-photo-preview-${idx}`}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                                onClick={() => removePhoto(idx)}
                                data-testid={`button-remove-photo-${idx}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedPhotos.length < 5 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => photoInputRef.current?.click()}
                          data-testid="button-add-photos"
                        >
                          <Camera className="h-4 w-4 mr-1" />
                          {selectedPhotos.length === 0 ? "Add Photos" : "Add More"}
                        </Button>
                      )}
                    </div>
                    <DialogFooter>
                      <Button 
                        type="submit" 
                        disabled={submitHappyTailMutation.isPending || isUploadingPhotos}
                        data-testid="button-submit-happy-tail"
                      >
                        {isUploadingPhotos ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading Photos...</>
                        ) : submitHappyTailMutation.isPending ? (
                          "Submitting..."
                        ) : (
                          "Submit Update"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {happyTails && happyTails.length > 0 ? (
                <div className="space-y-4">
                  {happyTails.map((update) => (
                    <div 
                      key={update.id} 
                      className="p-4 border rounded-lg"
                      data-testid={`card-happy-tail-${update.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">
                          {new Date(update.createdAt).toLocaleDateString()}
                        </span>
                        {update.isApproved ? (
                          <Badge variant="secondary">Approved</Badge>
                        ) : (
                          <Badge variant="outline">Pending Review</Badge>
                        )}
                      </div>
                      {update.photoUrls && update.photoUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {update.photoUrls.map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`Happy tail photo ${idx + 1}`}
                              className="h-32 w-32 object-cover rounded-md border"
                              data-testid={`img-happy-tail-photo-${update.id}-${idx}`}
                            />
                          ))}
                        </div>
                      )}
                      {update.message && <p>{update.message}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No updates yet. Share how {pet.name} is doing!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
