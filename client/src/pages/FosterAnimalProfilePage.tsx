import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import {
  Loader2, Heart, ArrowLeft, AlertCircle, Phone, Mail, Clock, ShieldAlert, Pill, Upload, FileText, X, CheckCircle2,
  Scale, NotebookPen, Package, TrendingUp, TrendingDown, Minus, Activity, UtensilsCrossed, Home, Dog, Cat, Baby, Fence
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
import type { FosterAnimal, Animal, User, RescueContact } from "@shared/schema";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface MyFostersData {
  fosterAnimals: FosterAnimalWithDetails[];
}

interface RescueContactsData {
  rescueContacts: RescueContact[];
}

interface CareInfo {
  dietaryRestrictions: string | null;
  weight: string | null;
  specialNeeds: boolean | null;
  medicalAlertMemo: string | null;
  medicalStatus: string | null;
  activityLevel: string | null;
  needsFence: boolean | null;
  houseTrained: boolean | null;
  childFriendly: boolean | null;
  catFriendly: boolean | null;
  dogFriendly: boolean | null;
}

interface CareInfoData {
  careInfo: CareInfo;
  fosterNotes: string | null;
}

interface WeightLog {
  id: string;
  weight: string;
  weightUnit: string;
  notes: string | null;
  loggedAt: string;
}

interface WeightLogsData {
  weightLogs: WeightLog[];
}

interface BehaviorNote {
  id: string;
  noteType: string;
  content: string;
  createdAt: string;
}

interface BehaviorNotesData {
  behaviorNotes: BehaviorNote[];
}

interface SupplyRequest {
  id: string;
  animalId: string | null;
  category: string;
  item: string;
  quantity: string;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  animalName: string | null;
}

interface SupplyRequestsData {
  supplyRequests: SupplyRequest[];
}

export default function FosterAnimalProfilePage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const [, setLocation] = useLocation();
  const { animalId } = useParams<{ animalId: string }>();
  const { toast } = useToast();

  const [showVetVisitDialog, setShowVetVisitDialog] = useState(false);
  const [vetVisitDate, setVetVisitDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [vetClinicName, setVetClinicName] = useState('');
  const [vetReason, setVetReason] = useState('');
  const [vetFiles, setVetFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newWeight, setNewWeight] = useState('');
  const [newWeightUnit, setNewWeightUnit] = useState('lbs');
  const [newWeightNotes, setNewWeightNotes] = useState('');

  const [newNoteType, setNewNoteType] = useState('observation');
  const [newNoteContent, setNewNoteContent] = useState('');

  const { data: fostersData, isLoading: fostersLoading } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals'],
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<RescueContactsData>({
    queryKey: ['/api/rescue-contacts'],
  });

  const { data: careInfoData, isLoading: careInfoLoading } = useQuery<CareInfoData>({
    queryKey: ['/api/foster-animals', animalId, 'care-info'],
    enabled: !!animalId,
  });

  const { data: weightLogsData, isLoading: weightLogsLoading } = useQuery<WeightLogsData>({
    queryKey: ['/api/foster-animals', animalId, 'weight-logs'],
    enabled: !!animalId,
  });

  const { data: behaviorNotesData, isLoading: behaviorNotesLoading } = useQuery<BehaviorNotesData>({
    queryKey: ['/api/foster-animals', animalId, 'behavior-notes'],
    enabled: !!animalId,
  });

  const { data: supplyRequestsData, isLoading: supplyRequestsLoading } = useQuery<SupplyRequestsData>({
    queryKey: ['/api/foster-animals/my-supply-requests'],
  });

  const submitVetVisitMutation = useMutation({
    mutationFn: async (data: { animalId: string; visitDate: string; clinicName: string; reason: string; documentUrls: string[] }) => {
      const response = await apiRequest('POST', '/api/vet-visits', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Vet visit submitted", description: "Your rescue team has been notified and will review the records." });
      setShowVetVisitDialog(false);
      setVetVisitDate(new Date().toISOString().split('T')[0]);
      setVetClinicName('');
      setVetReason('');
      setVetFiles([]);
      queryClient.invalidateQueries({ queryKey: ['/api/vet-visits'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to submit", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const addWeightLogMutation = useMutation({
    mutationFn: async (data: { weight: number; weightUnit: string; notes?: string }) => {
      const response = await apiRequest('POST', `/api/foster-animals/${animalId}/weight-logs`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Weight logged", description: "Weight entry has been recorded." });
      setNewWeight('');
      setNewWeightNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals', animalId, 'weight-logs'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to log weight", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const addBehaviorNoteMutation = useMutation({
    mutationFn: async (data: { noteType: string; content: string }) => {
      const response = await apiRequest('POST', `/api/foster-animals/${animalId}/behavior-notes`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Note added", description: "Your note has been saved." });
      setNewNoteContent('');
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals', animalId, 'behavior-notes'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add note", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleVetVisitSubmit = async () => {
    if (!animalId || !vetReason.trim()) return;

    setUploading(true);
    try {
      let documentUrls: string[] = [];

      if (vetFiles.length > 0) {
        const formData = new FormData();
        vetFiles.forEach(file => formData.append('files', file));

        const uploadRes = await fetch('/api/vet-visits/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || 'Upload failed');
        }

        const uploadData = await uploadRes.json();
        documentUrls = uploadData.uploadedPaths;
      }

      submitVetVisitMutation.mutate({
        animalId,
        visitDate: vetVisitDate,
        clinicName: vetClinicName,
        reason: vetReason,
        documentUrls,
      });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setVetFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setVetFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleWeightSubmit = () => {
    const weightVal = parseFloat(newWeight);
    if (isNaN(weightVal) || weightVal <= 0) return;
    addWeightLogMutation.mutate({
      weight: weightVal,
      weightUnit: newWeightUnit,
      notes: newWeightNotes.trim() || undefined,
    });
  };

  const handleBehaviorNoteSubmit = () => {
    if (!newNoteContent.trim()) return;
    addBehaviorNoteMutation.mutate({
      noteType: newNoteType,
      content: newNoteContent.trim(),
    });
  };

  const fosterAnimal = fostersData?.fosterAnimals.find(
    (fa) => fa.animal?.id === animalId
  );

  const animal = fosterAnimal?.animal;
  const contacts = contactsData?.rescueContacts || [];

  if (fostersLoading || contactsLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!animal || !fosterAnimal) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <Card className="p-12 text-center">
            <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Animal Not Found</h3>
            <p className="text-muted-foreground mb-6">
              This animal is not assigned to you or does not exist.
            </p>
            <Link href="/dashboard/my-fosters">
              <Button>Back to My Fosters</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;
  const careInfo = careInfoData?.careInfo;
  const fosterNotes = careInfoData?.fosterNotes;
  const weightLogs = weightLogsData?.weightLogs || [];
  const behaviorNotes = behaviorNotesData?.behaviorNotes || [];
  const allSupplyRequests = supplyRequestsData?.supplyRequests || [];
  const animalSupplyRequests = allSupplyRequests.filter(
    (r) => r.animalId === animalId || r.animalId === null
  );

  const getWeightTrend = () => {
    if (weightLogs.length < 2) return null;
    const latest = parseFloat(weightLogs[0].weight);
    const previous = parseFloat(weightLogs[1].weight);
    if (latest > previous) return 'up';
    if (latest < previous) return 'down';
    return 'same';
  };

  const weightTrend = getWeightTrend();

  const getNoteTypeBadgeVariant = (noteType: string) => {
    switch (noteType) {
      case 'concern': return 'destructive' as const;
      case 'medical': return 'destructive' as const;
      case 'milestone': return 'default' as const;
      default: return 'secondary' as const;
    }
  };

  const getSupplyStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 no-default-hover-elevate no-default-active-elevate">{status}</Badge>;
      case 'approved': return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 no-default-hover-elevate no-default-active-elevate">{status}</Badge>;
      case 'fulfilled': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 no-default-hover-elevate no-default-active-elevate">{status}</Badge>;
      case 'denied': return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 no-default-hover-elevate no-default-active-elevate">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b p-4 bg-background flex-wrap">
        <Link href="/dashboard/my-fosters">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to My Fosters
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold">{animal.name}</h1>
          <p className="text-sm text-muted-foreground">
            {animal.species} • {animal.breed}
          </p>
        </div>
        <Button variant="default" onClick={() => setLocation(`/dashboard/my-fosters/${animal.id}/medical`)} data-testid="button-view-medical">
          View Medical Info
        </Button>
      </div>
      <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
              {animal.medicalHold && (
                <Card className="bg-amber-50 dark:bg-amber-950/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-semibold text-amber-800 dark:text-amber-200" data-testid="text-medical-hold-title">
                          Medical Hold Active
                        </h4>
                        {animal.medicalAlertMemo ? (
                          <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="text-medical-hold-memo">
                            {animal.medicalAlertMemo}
                          </p>
                        ) : (
                          <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="text-medical-hold-default">
                            This animal is currently on medical hold. Please follow any special care instructions from the rescue.
                          </p>
                        )}
                        <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setLocation(`/dashboard/my-fosters/${animal.id}/medical`)} data-testid="button-view-meds-hold">
                          <Pill className="h-3.5 w-3.5" />
                          View Medications
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* Animal Photo and Basic Info */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      {photoUrl ? (
                        <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                          <img 
                            src={photoUrl} 
                            alt={animal.name}
                            className="w-full h-full object-cover"
                            data-testid="img-animal-photo"
                          />
                        </div>
                      ) : (
                        <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                          <Heart className="h-24 w-24 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Species:</dt>
                            <dd className="font-medium">{animal.species}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Breed:</dt>
                            <dd className="font-medium">{animal.breed}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Age:</dt>
                            <dd className="font-medium">{animal.age}</dd>
                          </div>
                          {animal.petfinderGender && (
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Gender:</dt>
                              <dd className="font-medium">{animal.petfinderGender}</dd>
                            </div>
                          )}
                          {animal.neuterStatus && (
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Spay/Neuter:</dt>
                              <dd className="font-medium capitalize">{animal.neuterStatus}</dd>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Status:</dt>
                            <dd>
                              <Badge variant="default" className="capitalize">
                                {fosterAnimal.status}
                              </Badge>
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Medical Alert */}
              {animal.medicalAlertMemo && (
                <Card className="border-destructive bg-destructive/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <CardTitle className="text-destructive">Medical Alert</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm" data-testid="text-medical-alert">
                      {animal.medicalAlertMemo}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* About / Bio */}
              <Card>
                <CardHeader>
                  <CardTitle>About {animal.name}</CardTitle>
                  <CardDescription>Personality, history, and special notes</CardDescription>
                </CardHeader>
                <CardContent>
                  {animal.bio ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-bio">
                      {animal.bio}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No bio information available yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Upload Vet Visit */}
              <Card className="bg-primary/5">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="rounded-full bg-primary/10 p-2.5 sm:p-3 shrink-0">
                      <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <h3 className="font-semibold text-base sm:text-lg">Upload Vet Visit / Records</h3>
                      <p className="text-sm text-muted-foreground">
                        Took {animal.name} to the vet? Upload the invoice, discharge papers, or vaccine certificates
                        and your rescue team will update the medical records.
                      </p>
                      <Button onClick={() => setShowVetVisitDialog(true)} data-testid="button-upload-vet-visit">
                        <FileText className="h-4 w-4 mr-2" />
                        Upload Vet Visit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vet Visit Upload Dialog */}
              <Dialog open={showVetVisitDialog} onOpenChange={setShowVetVisitDialog}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Upload Vet Visit</DialogTitle>
                    <DialogDescription>
                      Upload records from {animal.name}'s vet visit. Your rescue team will review and update the medical records.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label htmlFor="vet-visit-date">Visit Date</Label>
                      <Input
                        id="vet-visit-date"
                        type="date"
                        value={vetVisitDate}
                        onChange={(e) => setVetVisitDate(e.target.value)}
                        data-testid="input-vet-visit-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vet-clinic">Clinic Name (optional)</Label>
                      <Input
                        id="vet-clinic"
                        placeholder="e.g., Happy Paws Veterinary"
                        value={vetClinicName}
                        onChange={(e) => setVetClinicName(e.target.value)}
                        data-testid="input-vet-clinic"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vet-reason">Why did they go to the vet?</Label>
                      <Textarea
                        id="vet-reason"
                        placeholder="e.g., Annual vaccines, spay surgery follow-up, limping on back left leg..."
                        value={vetReason}
                        onChange={(e) => setVetReason(e.target.value)}
                        className="min-h-[80px]"
                        data-testid="input-vet-reason"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Documents (invoices, certificates, discharge papers)</Label>
                      <div
                        className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover-elevate"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="dropzone-vet-files"
                      >
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Tap to select photos or PDFs
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Images and PDF files up to 15MB each
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                          data-testid="input-vet-files"
                        />
                      </div>
                      {vetFiles.length > 0 && (
                        <div className="space-y-2 mt-2">
                          {vetFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 min-w-0 truncate">{file.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {(file.size / 1024).toFixed(0)}KB
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFile(idx)}
                                data-testid={`button-remove-file-${idx}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleVetVisitSubmit}
                      disabled={!vetReason.trim() || uploading || submitVetVisitMutation.isPending}
                      data-testid="button-submit-vet-visit"
                    >
                      {(uploading || submitVetVisitMutation.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {uploading ? 'Uploading files...' : 'Submitting...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Submit Vet Visit
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Care & Feeding Instructions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        <UtensilsCrossed className="h-5 w-5" />
                        Care & Feeding Instructions
                      </CardTitle>
                      <CardDescription>Diet, compatibility, and special care info for {animal.name}</CardDescription>
                    </div>
                    {careInfo?.specialNeeds && (
                      <Badge variant="destructive" data-testid="badge-special-needs">Special Needs</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {careInfoLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {careInfo?.dietaryRestrictions && (
                        <div className="flex items-start gap-2" data-testid="text-dietary-restrictions">
                          <UtensilsCrossed className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Dietary Restrictions</p>
                            <p className="text-sm">{careInfo.dietaryRestrictions}</p>
                          </div>
                        </div>
                      )}
                      {careInfo?.activityLevel && (
                        <div className="flex items-start gap-2" data-testid="text-activity-level">
                          <Activity className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Activity Level</p>
                            <p className="text-sm capitalize">{careInfo.activityLevel}</p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {careInfo?.houseTrained !== null && careInfo?.houseTrained !== undefined && (
                          <div className="flex items-center gap-2 text-sm" data-testid="text-house-trained">
                            <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>House Trained: {careInfo.houseTrained ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                        {careInfo?.needsFence !== null && careInfo?.needsFence !== undefined && (
                          <div className="flex items-center gap-2 text-sm" data-testid="text-needs-fence">
                            <Fence className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>Needs Fence: {careInfo.needsFence ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                        {careInfo?.childFriendly !== null && careInfo?.childFriendly !== undefined && (
                          <div className="flex items-center gap-2 text-sm" data-testid="text-child-friendly">
                            <Baby className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>Child Friendly: {careInfo.childFriendly ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                        {careInfo?.catFriendly !== null && careInfo?.catFriendly !== undefined && (
                          <div className="flex items-center gap-2 text-sm" data-testid="text-cat-friendly">
                            <Cat className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>Cat Friendly: {careInfo.catFriendly ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                        {careInfo?.dogFriendly !== null && careInfo?.dogFriendly !== undefined && (
                          <div className="flex items-center gap-2 text-sm" data-testid="text-dog-friendly">
                            <Dog className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>Dog Friendly: {careInfo.dogFriendly ? 'Yes' : 'No'}</span>
                          </div>
                        )}
                      </div>
                      {fosterNotes && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-semibold mb-2">Foster Care Notes</h4>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-care-notes">
                            {fosterNotes}
                          </p>
                        </div>
                      )}
                      {!careInfo?.dietaryRestrictions && !careInfo?.activityLevel && !fosterNotes && (
                        <p className="text-sm text-muted-foreground italic">
                          No care instructions have been set for this animal yet.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Weight Tracking */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Scale className="h-5 w-5" />
                    Weight Tracking
                    {weightTrend && (
                      <span className="ml-1">
                        {weightTrend === 'up' && <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400 inline" />}
                        {weightTrend === 'down' && <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400 inline" />}
                        {weightTrend === 'same' && <Minus className="h-4 w-4 text-muted-foreground inline" />}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>Track {animal.name}'s weight over time</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="space-y-4">
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="weight-value" className="text-xs">Weight</Label>
                          <Input
                            id="weight-value"
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="e.g., 12.5"
                            value={newWeight}
                            onChange={(e) => setNewWeight(e.target.value)}
                            data-testid="input-weight-value"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="weight-unit" className="text-xs">Unit</Label>
                          <Select value={newWeightUnit} onValueChange={setNewWeightUnit}>
                            <SelectTrigger data-testid="select-weight-unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lbs">lbs</SelectItem>
                              <SelectItem value="kg">kg</SelectItem>
                              <SelectItem value="oz">oz</SelectItem>
                              <SelectItem value="g">g</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <Label htmlFor="weight-notes" className="text-xs">Notes (optional)</Label>
                        <Textarea
                          id="weight-notes"
                          placeholder="Any notes about this weigh-in..."
                          value={newWeightNotes}
                          onChange={(e) => setNewWeightNotes(e.target.value)}
                          className="min-h-[60px]"
                          data-testid="input-weight-notes"
                        />
                      </div>
                      <Button
                        className="mt-3 w-full sm:w-auto"
                        size="sm"
                        onClick={handleWeightSubmit}
                        disabled={!newWeight || addWeightLogMutation.isPending}
                        data-testid="button-log-weight"
                      >
                        {addWeightLogMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Scale className="h-4 w-4 mr-2" />
                        )}
                        Log Weight
                      </Button>
                    </div>

                    {weightLogsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : weightLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">
                        No weight entries recorded yet. Log your first weigh-in above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {weightLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0"
                            data-testid={`weight-log-${log.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                {log.weight} {log.weightUnit}
                              </p>
                              {log.notes && (
                                <p className="text-xs text-muted-foreground truncate">{log.notes}</p>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground shrink-0">
                              {new Date(log.loggedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Daily Log / Behavior Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <NotebookPen className="h-5 w-5" />
                    Daily Log / Behavior Notes
                  </CardTitle>
                  <CardDescription>Record observations, milestones, and concerns for {animal.name}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="space-y-4">
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="note-type" className="text-xs">Note Type</Label>
                          <Select value={newNoteType} onValueChange={setNewNoteType}>
                            <SelectTrigger data-testid="select-note-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="observation">Observation</SelectItem>
                              <SelectItem value="concern">Concern</SelectItem>
                              <SelectItem value="milestone">Milestone</SelectItem>
                              <SelectItem value="medical">Medical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <Label htmlFor="note-content" className="text-xs">Note</Label>
                        <Textarea
                          id="note-content"
                          placeholder="What did you observe today?"
                          value={newNoteContent}
                          onChange={(e) => setNewNoteContent(e.target.value)}
                          className="min-h-[80px]"
                          data-testid="input-note-content"
                        />
                      </div>
                      <Button
                        className="mt-3 w-full sm:w-auto"
                        size="sm"
                        onClick={handleBehaviorNoteSubmit}
                        disabled={!newNoteContent.trim() || addBehaviorNoteMutation.isPending}
                        data-testid="button-add-note"
                      >
                        {addBehaviorNoteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <NotebookPen className="h-4 w-4 mr-2" />
                        )}
                        Add Note
                      </Button>
                    </div>

                    {behaviorNotesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : behaviorNotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">
                        No notes recorded yet. Add your first observation above.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {behaviorNotes.map((note) => (
                          <div
                            key={note.id}
                            className={`p-3 rounded-md border ${
                              note.noteType === 'concern' || note.noteType === 'medical'
                                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                                : 'bg-background'
                            }`}
                            data-testid={`behavior-note-${note.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <Badge variant={getNoteTypeBadgeVariant(note.noteType)} className="capitalize" data-testid={`badge-note-type-${note.id}`}>
                                {note.noteType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(note.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Supply Request Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Package className="h-5 w-5" />
                    Supply Requests
                  </CardTitle>
                  <CardDescription>Status of supply requests for {animal.name}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {supplyRequestsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : animalSupplyRequests.length === 0 ? (
                    <div className="text-center py-6">
                      <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        No supply requests for this animal yet.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Contact your rescue coordinator if you need supplies.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {animalSupplyRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-start justify-between gap-3 p-3 rounded-md border flex-wrap"
                          data-testid={`supply-request-${req.id}`}
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{req.item}</p>
                              {getSupplyStatusBadge(req.status)}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span>Qty: {req.quantity}</span>
                              <span className="capitalize">{req.category}</span>
                              <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                            </div>
                            {req.notes && (
                              <p className="text-xs text-muted-foreground">{req.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rescue Contacts */}
              <Card>
                <CardHeader>
                  <CardTitle>Who to Contact</CardTitle>
                  <CardDescription>Important contacts for different situations</CardDescription>
                </CardHeader>
                <CardContent>
                  {contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No rescue contacts have been configured yet. Please contact your coordinator.
                    </p>
                  ) : (
                    <div className="grid gap-4">
                      {contacts.map((contact) => (
                        <div 
                          key={contact.id} 
                          className="p-4 border rounded-lg"
                          data-testid={`contact-${contact.contactType}`}
                        >
                          <div className="flex items-start justify-between gap-2 sm:gap-4 mb-2 flex-wrap">
                            <div className="flex-1">
                              <h4 className="font-semibold text-sm capitalize mb-1">
                                {contact.contactType.replace('_', ' ')}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {contact.name} - {contact.role}
                              </p>
                            </div>
                            {contact.contactType === 'medical_emergency' && (
                              <Badge variant="destructive">Emergency</Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-sm">
                            {contact.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <a 
                                  href={`tel:${contact.phone}`} 
                                  className="text-primary hover:underline"
                                  data-testid={`link-phone-${contact.contactType}`}
                                >
                                  {contact.phone}
                                </a>
                              </div>
                            )}
                            {contact.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <a 
                                  href={`mailto:${contact.email}`} 
                                  className="text-primary hover:underline"
                                  data-testid={`link-email-${contact.contactType}`}
                                >
                                  {contact.email}
                                </a>
                              </div>
                            )}
                            {contact.availability && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground" data-testid={`text-availability-${contact.contactType}`}>
                                  {contact.availability}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
      </main>
    </div>
  );
}
