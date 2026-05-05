import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Eye, 
  Search, 
  PawPrint, 
  Calendar, 
  Heart, 
  ChevronRight, 
  ArrowLeft,
  User,
  Mail,
  Phone,
  Shield,
  Syringe,
  Stethoscope,
  Scale,
  Pill,
  Camera,
  Check,
  AlertCircle,
  AlertTriangle,
  ClipboardCheck,
  Bug,
  Upload,
  Clock,
  CheckCircle,
  CheckCircle2,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import {
  type DueCareItem,
  type ComplianceConfirmation,
  type ComplianceObligation,
  type HeartwormAppointment,
  type HeartwormTreatmentPlan,
  HW_INJECTION_REST_DAYS,
  parseISODate,
  obligationDisplayLabel,
  obligationDaysOverdue,
  getHwApptStatus,
  getExerciseRestriction,
} from "@/lib/compliance";

interface Adopter {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  adoptedAnimals: Array<{ id: string; name: string; adoptedAt: string }>;
}

interface AdoptedAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  photoUrls?: string[];
  adoptedAt: string;
  microchipNumber?: string;
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

export default function AdopterPortalPreviewPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAdopter, setSelectedAdopter] = useState<Adopter | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("compliance");

  // Frontend admin check - API also enforces this (admin or owner)
  const isAdmin = user?.roles?.some((r: string) => ['admin', 'owner'].includes(r));
  
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            This feature is only available to administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: adopters, isLoading: adoptersLoading } = useQuery<Adopter[]>({
    queryKey: ["/api/adopter/admin/adopters"],
  });

  const { data: pets, isLoading: petsLoading } = useQuery<AdoptedAnimal[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets`],
    enabled: !!selectedAdopter,
  });

  const { data: pet } = useQuery<AdoptedAnimal>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}`],
    enabled: !!selectedAdopter && !!selectedAnimalId,
  });

  const { data: vaccinations } = useQuery<VaccineRecord[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/vaccinations`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const { data: exams } = useQuery<MedicalExam[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/medical-exams`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const { data: weightLogs } = useQuery<WeightLog[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/weight-logs`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "health",
  });

  const { data: reminders } = useQuery<MedicationReminder[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/medication-reminders`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "health",
  });

  const { data: happyTails } = useQuery<HappyTailUpdate[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/happy-tails`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "alumni",
  });

  const { data: dueCareItems } = useQuery<DueCareItem[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/due-care`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const { data: complianceConfirmations } = useQuery<ComplianceConfirmation[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/compliance-confirmations`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const { data: complianceObligations } = useQuery<ComplianceObligation[]>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/compliance-obligations`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const { data: heartwormPlan } = useQuery<HeartwormTreatmentPlan | null>({
    queryKey: [`/api/adopter/admin/adopter-preview/${selectedAdopter?.id}/pets/${selectedAnimalId}/heartworm-treatment-plan`],
    enabled: !!selectedAdopter && !!selectedAnimalId && activeTab === "compliance",
  });

  const filteredAdopters = adopters?.filter(adopter => 
    adopter.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    adopter.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBack = () => {
    if (selectedAnimalId) {
      setSelectedAnimalId(null);
      setActiveTab("compliance");
    } else if (selectedAdopter) {
      setSelectedAdopter(null);
    }
  };

  const PreviewBanner = () => (
    <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <Eye className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">Admin Preview Mode</AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        {selectedAnimalId 
          ? `Viewing ${pet?.name}'s portal as ${selectedAdopter?.fullName}` 
          : selectedAdopter 
            ? `Viewing My Pets portal as ${selectedAdopter.fullName}` 
            : "Select an adopter to preview their portal experience"}
      </AlertDescription>
    </Alert>
  );

  if (selectedAnimalId && selectedAdopter) {
    return (
      <DashboardLayout title="Adopter Portal Preview">
        <div className="container mx-auto p-6 max-w-4xl">
        <PreviewBanner />
        
        <Button 
          variant="ghost" 
          onClick={handleBack} 
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {selectedAdopter.fullName}'s Pets
        </Button>

        {!pet ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-6 mb-6">
              {pet.photoUrls && pet.photoUrls.length > 0 ? (
                <img
                  src={pet.photoUrls[0]}
                  alt={pet.name}
                  className="w-32 h-32 rounded-lg object-cover"
                />
              ) : (
                <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center">
                  <PawPrint className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-pet-name">{pet.name}</h1>
                <p className="text-muted-foreground">{pet.breed} • {pet.species}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">
                    <Calendar className="h-3 w-3 mr-1" />
                    Adopted {format(new Date(pet.adoptedAt), "PPP")}
                  </Badge>
                  {pet.microchipNumber && (
                    <Badge variant="outline">Chip: {pet.microchipNumber}</Badge>
                  )}
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
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

              <TabsContent value="compliance" className="space-y-4 mt-4">
                {(() => {
                  // Action Required card — mirrors AdopterPetDetailPage. Shows
                  // actionable obligations (pending/overdue) + due-care items +
                  // pending confirmations. Read-only in preview: action buttons
                  // (Upload Proof, Confirm Given) are replaced with a disabled
                  // affordance so staff see exactly what the adopter sees but
                  // cannot mutate adopter state from this preview.
                  const actionableObligations = (complianceObligations ?? []).filter(
                    o => o.status === 'pending' || o.status === 'overdue'
                  );
                  const hasAnything =
                    (dueCareItems && dueCareItems.length > 0) ||
                    actionableObligations.length > 0 ||
                    (complianceConfirmations && complianceConfirmations.some(c => c.status === 'pending_review'));
                  if (pet.status === 'deceased' || !hasAnything) return null;
                  return (
                    <Card data-testid="card-action-required">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Action Required
                        </CardTitle>
                        <CardDescription>
                          These items are due or overdue. Read-only in preview mode.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {actionableObligations.map((obl) => {
                          const label = obligationDisplayLabel(obl);
                          const { daysOverdue, isOverdue, isDueSoon, dueDate } = obligationDaysOverdue(obl);
                          const isHeartwormType = obl.obligationType === 'heartworm_prevention_proof' || obl.obligationType === 'heartworm_test';
                          const isParasiteType = isHeartwormType || obl.obligationType === 'flea_tick_prevention' || obl.obligationType === 'fecal_test';
                          return (
                            <div
                              key={`obl-${obl.id}`}
                              className={`flex items-center justify-between p-3 border rounded-lg flex-wrap gap-3 ${
                                isOverdue
                                  ? 'border-destructive bg-destructive/5'
                                  : isDueSoon
                                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950'
                                    : ''
                              }`}
                              data-testid={`obligation-${obl.id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {isParasiteType ? (
                                  <Bug className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div>
                                  <p className="font-medium">{label}</p>
                                  {dueDate && (
                                    <p className="text-sm text-muted-foreground">
                                      {isOverdue ? (
                                        <span
                                          className="text-destructive font-medium"
                                          data-testid={`text-obligation-overdue-${obl.id}`}
                                        >
                                          {daysOverdue}d overdue (was due {dueDate.toLocaleDateString()})
                                        </span>
                                      ) : (
                                        <>Due by {dueDate.toLocaleDateString()}</>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isOverdue && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                    data-testid={`badge-obligation-overdue-${obl.id}`}
                                  >
                                    {daysOverdue}d overdue
                                  </Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  title="Read-only in preview mode"
                                  data-testid={`button-upload-proof-${obl.id}`}
                                >
                                  <Upload className="h-4 w-4 mr-1" />
                                  Upload Proof
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                        {dueCareItems && dueCareItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 border rounded-lg ${
                              item.isOverdue
                                ? 'border-destructive bg-destructive/5'
                                : 'border-orange-500 bg-orange-50 dark:bg-orange-950'
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
                              variant="outline"
                              disabled
                              title="Read-only in preview mode"
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
                  );
                })()}

                {(() => {
                  // Heartworm Treatment plan card — mirrors AdopterPetDetailPage.
                  // Renders only when a published plan exists. Read-only: the
                  // "Mark completed" button on each appointment is disabled.
                  if (!heartwormPlan || !Array.isArray(heartwormPlan.appointments) || heartwormPlan.appointments.length === 0) {
                    return null;
                  }
                  const restriction = getExerciseRestriction(heartwormPlan.appointments);
                  return (
                    <Card data-testid="card-heartworm-treatment">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Heart className="h-5 w-5 text-red-600" />
                          Heartworm Treatment
                        </CardTitle>
                        <CardDescription>
                          {pet.name}'s heartworm treatment plan. Read-only in preview mode.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div
                          className={`rounded-md p-4 border ${
                            restriction.active
                              ? 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900'
                              : 'border-border bg-muted/40'
                          }`}
                          data-testid="panel-exercise-restriction"
                        >
                          <div className="flex items-start gap-3">
                            {restriction.active ? (
                              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold flex flex-wrap items-center gap-2" data-testid="text-exercise-restriction-headline">
                                <span>{restriction.active ? 'Strict rest in effect' : 'No exercise restriction in effect'}</span>
                                {restriction.active && restriction.daysRemaining > 0 && (
                                  <Badge variant="destructive" data-testid="badge-restriction-days-remaining">
                                    {restriction.daysRemaining} {restriction.daysRemaining === 1 ? 'day' : 'days'} left
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {restriction.active && restriction.endDate ? (
                                  <>
                                    Keep {pet.name} crate-rested and on a leash for short potty breaks only — through{' '}
                                    <span className="font-semibold text-foreground" data-testid="text-restriction-end-date">
                                      {restriction.endDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {restriction.startedFromLabel ? <> (following the {restriction.startedFromLabel}).</> : '.'}{' '}
                                    Vigorous activity can be life-threatening during this window.
                                  </>
                                ) : (
                                  <>Activity restrictions begin on the day of each immiticide injection and last {HW_INJECTION_REST_DAYS} days.</>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {heartwormPlan.appointments.map((appt, idx) => {
                            const status = getHwApptStatus(appt);
                            const scheduled = parseISODate(appt.scheduledDate);
                            const completed = parseISODate(appt.completedDate);
                            const statusBadge =
                              status === 'completed' ? (
                                <Badge variant="default" className="bg-green-600 hover:bg-green-600" data-testid={`badge-hw-status-${idx}`}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                                </Badge>
                              ) : status === 'overdue' ? (
                                <Badge variant="destructive" data-testid={`badge-hw-status-${idx}`}>
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                </Badge>
                              ) : status === 'today' ? (
                                <Badge variant="default" data-testid={`badge-hw-status-${idx}`}>
                                  <Clock className="h-3 w-3 mr-1" /> Today
                                </Badge>
                              ) : (
                                <Badge variant="secondary" data-testid={`badge-hw-status-${idx}`}>
                                  <Calendar className="h-3 w-3 mr-1" /> Upcoming
                                </Badge>
                              );

                            return (
                              <div
                                key={`${appt.type}-${idx}`}
                                className="border rounded-md p-3 flex flex-row flex-wrap items-start justify-between gap-3"
                                data-testid={`row-hw-appt-${idx}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium" data-testid={`text-hw-appt-label-${idx}`}>{appt.label}</p>
                                    {statusBadge}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-hw-appt-scheduled-${idx}`}>
                                    Scheduled: {scheduled ? scheduled.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : appt.scheduledDate}
                                  </p>
                                  {completed && (
                                    <p className="text-sm text-green-700 dark:text-green-400 mt-0.5" data-testid={`text-hw-appt-completed-${idx}`}>
                                      Completed: {completed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  )}
                                  {appt.notes && (
                                    <p className="text-sm text-muted-foreground mt-0.5">Rescue notes: {appt.notes}</p>
                                  )}
                                  {appt.adopterNotes && (
                                    <p className="text-sm text-muted-foreground mt-0.5">Adopter notes: {appt.adopterNotes}</p>
                                  )}
                                  {appt.receiptObjectPath && (
                                    <Button
                                      asChild
                                      variant="link"
                                      size="sm"
                                      className="px-0 h-auto mt-1"
                                      data-testid={`link-hw-receipt-${idx}`}
                                    >
                                      <a href={appt.receiptObjectPath} target="_blank" rel="noopener noreferrer">
                                        <FileText className="h-3 w-3 mr-1" /> View uploaded receipt
                                      </a>
                                    </Button>
                                  )}
                                </div>
                                {!appt.completedDate && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled
                                    title="Read-only in preview mode"
                                    data-testid={`button-mark-hw-completed-${idx}`}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" /> Mark completed
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-md bg-muted/40 p-3" data-testid="panel-hw-location">
                          <p className="text-sm font-medium">Treatment Location</p>
                          <p className="text-sm text-muted-foreground">{heartwormPlan.locationName}</p>
                          <p className="text-sm text-muted-foreground">{heartwormPlan.locationAddress}</p>
                          <p className="text-sm text-muted-foreground">Phone: {heartwormPlan.locationPhone}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {(() => {
                  // Contract Requirements history card — mirrors
                  // AdopterPetDetailPage. Lists completed/waived/pending_review
                  // obligations as a permanent record.
                  const historyObligations = (complianceObligations ?? []).filter(
                    o => o.status === 'completed' || o.status === 'waived' || o.status === 'pending_review'
                  );
                  if (historyObligations.length === 0) return null;
                  return (
                    <Card data-testid="card-contract-requirements">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ClipboardCheck className="h-5 w-5" />
                          Contract Requirements
                        </CardTitle>
                        <CardDescription>
                          Verified or waived obligations from the adoption agreement.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {historyObligations.map((obl) => {
                          const label = obligationDisplayLabel(obl);
                          const { dueDate } = obligationDaysOverdue(obl);
                          return (
                            <div
                              key={obl.id}
                              className="flex items-center justify-between p-3 border rounded-lg flex-wrap gap-3"
                              data-testid={`obligation-history-${obl.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{label}</p>
                                {dueDate && (
                                  <p className="text-sm text-muted-foreground">
                                    Due by {dueDate.toLocaleDateString()}
                                    {obl.status === 'completed' && obl.completedAt && (
                                      <> · Verified {new Date(obl.completedAt).toLocaleDateString()}</>
                                    )}
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
                                {obl.status === 'waived' && (
                                  <Badge variant="secondary">Waived</Badge>
                                )}
                                {obl.status === 'pending_review' && (
                                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Under Review
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })()}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Syringe className="h-5 w-5" />
                      Vaccinations
                    </CardTitle>
                    <CardDescription>Read-only in preview mode</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!vaccinations || vaccinations.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No vaccination records</p>
                    ) : (
                      <div className="space-y-2">
                        {vaccinations.map((v) => (
                          <div key={v.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                            <div>
                              <p className="font-medium">{v.vaccineName}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(v.dateAdministered), "PPP")}
                              </p>
                            </div>
                            {v.expirationDate && (
                              <Badge variant={new Date(v.expirationDate) < new Date() ? "destructive" : "secondary"}>
                                Expires: {format(new Date(v.expirationDate), "PP")}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Stethoscope className="h-5 w-5" />
                      Medical Exams
                    </CardTitle>
                    <CardDescription>Read-only in preview mode</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!exams || exams.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No exam records</p>
                    ) : (
                      <div className="space-y-2">
                        {exams.map((e) => (
                          <div key={e.id} className="p-2 bg-muted/50 rounded">
                            <div className="flex justify-between">
                              <p className="font-medium">{e.examType}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(e.examDate), "PPP")}
                              </p>
                            </div>
                            {e.findings && (
                              <p className="text-sm text-muted-foreground mt-1">{e.findings}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="health" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Scale className="h-5 w-5" />
                      Weight Log
                    </CardTitle>
                    <CardDescription>Read-only in preview mode</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!weightLogs || weightLogs.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No weight logs</p>
                    ) : (
                      <div className="space-y-2">
                        {weightLogs.map((log) => (
                          <div key={log.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                            <div>
                              <p className="font-medium">{log.weight} {log.weightUnit}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(log.loggedAt), "PPP")}
                              </p>
                            </div>
                            {log.notes && (
                              <p className="text-sm text-muted-foreground">{log.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5" />
                      Medication Reminders
                    </CardTitle>
                    <CardDescription>Read-only in preview mode</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!reminders || reminders.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No medication reminders</p>
                    ) : (
                      <div className="space-y-2">
                        {reminders.map((r) => (
                          <div key={r.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                            <div>
                              <p className="font-medium">{r.medicationName}</p>
                              <p className="text-sm text-muted-foreground">{r.frequency}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm">Next: {format(new Date(r.nextDueDate), "PP")}</p>
                              {r.lastConfirmedDate && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Check className="h-3 w-3 text-green-500" />
                                  Last: {format(new Date(r.lastConfirmedDate), "PP")}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="alumni" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Happy Tail Updates
                    </CardTitle>
                    <CardDescription>Read-only in preview mode</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!happyTails || happyTails.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No happy tail updates submitted</p>
                    ) : (
                      <div className="space-y-4">
                        {happyTails.map((update) => (
                          <div key={update.id} className="p-3 bg-muted/50 rounded">
                            <div className="flex justify-between mb-2">
                              <Badge variant={update.isApproved ? "default" : "secondary"}>
                                {update.isApproved ? "Approved" : "Pending Review"}
                              </Badge>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(update.createdAt), "PPP")}
                              </p>
                            </div>
                            {update.message && <p className="text-sm">{update.message}</p>}
                            {update.photoUrls && update.photoUrls.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {update.photoUrls.map((url, i) => (
                                  <img key={i} src={url} alt="Happy tail" className="h-16 w-16 rounded object-cover" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
    );
  }

  if (selectedAdopter) {
    return (
      <DashboardLayout title="Adopter Portal Preview">
        <div className="container mx-auto p-6 max-w-4xl">
        <PreviewBanner />
        
        <Button 
          variant="ghost" 
          onClick={handleBack} 
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Adopter List
        </Button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">My Pets</h1>
          <p className="text-muted-foreground mt-1">
            Access your pet's medical records, set reminders, and share updates
          </p>
        </div>

        {petsLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !pets || pets.length === 0 ? (
          <Card className="p-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">No adopted pets found</h2>
              <p className="text-muted-foreground">This adopter has no associated pet records.</p>
            </div>
          </Card>
        ) : (
          <>
          {(() => {
            const activePets = pets.filter(p => p.status !== 'deceased');
            const deceasedPets = pets.filter(p => p.status === 'deceased');
            return (
              <>
                {activePets.length === 0 && deceasedPets.length > 0 && (
                  <p className="text-muted-foreground text-sm mb-6">
                    This adopter has no active pets at this time.
                  </p>
                )}
                {activePets.length > 0 && (
                  <div className="grid gap-6 md:grid-cols-2">
                    {activePets.map((animal) => (
                      <Card 
                        key={animal.id}
                        className="overflow-hidden cursor-pointer hover-elevate transition-all"
                        onClick={() => setSelectedAnimalId(animal.id)}
                        data-testid={`card-pet-${animal.id}`}
                      >
                        {animal.photoUrls && animal.photoUrls.length > 0 ? (
                          <div className="aspect-video relative overflow-hidden">
                            <img
                              src={animal.photoUrls[0]}
                              alt={animal.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-muted flex items-center justify-center">
                            <PawPrint className="h-16 w-16 text-muted-foreground" />
                          </div>
                        )}
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-xl font-semibold">{animal.name}</h3>
                              <p className="text-muted-foreground text-sm">
                                {animal.breed} • {animal.species}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <Badge variant="secondary" className="text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              Adopted {format(new Date(animal.adoptedAt), "PP")}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {deceasedPets.length > 0 && (
                  <div className="mt-12" data-testid="section-in-loving-memory">
                    <div className="flex items-center gap-2 mb-4">
                      <Heart className="h-5 w-5 text-muted-foreground" />
                      <h2 className="text-xl font-semibold text-muted-foreground">In Loving Memory</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                      {deceasedPets.map((animal) => (
                        <Card
                          key={animal.id}
                          className="overflow-hidden cursor-pointer hover-elevate transition-all opacity-80"
                          onClick={() => setSelectedAnimalId(animal.id)}
                          data-testid={`card-pet-deceased-${animal.id}`}
                        >
                          {animal.photoUrls && animal.photoUrls.length > 0 ? (
                            <div className="aspect-video relative overflow-hidden">
                              <img
                                src={animal.photoUrls[0]}
                                alt={animal.name}
                                className="w-full h-full object-cover grayscale"
                              />
                            </div>
                          ) : (
                            <div className="aspect-video bg-muted flex items-center justify-center">
                              <PawPrint className="h-16 w-16 text-muted-foreground" />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="text-xl font-semibold">{animal.name}</h3>
                                <p className="text-muted-foreground text-sm">
                                  {animal.breed} • {animal.species}
                                </p>
                              </div>
                              <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <Badge variant="secondary" className="text-xs">
                                <Calendar className="h-3 w-3 mr-1" />
                                Adopted {format(new Date(animal.adoptedAt), "PP")}
                              </Badge>
                              {animal.deceasedDate && (
                                <Badge variant="outline" className="text-xs">
                                  <Heart className="h-3 w-3 mr-1" />
                                  {format(new Date(animal.deceasedDate), "PP")}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          </>
        )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Adopter Portal Preview">
      <div className="container mx-auto p-6 max-w-4xl">
      <PreviewBanner />

      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="heading-adopter-preview">Adopter Portal Preview</h1>
        <p className="text-muted-foreground mt-1">
          Select an adopter to see exactly what they see in their My Pets portal
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {adoptersLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-40 mb-2" />
                    <Skeleton className="h-4 w-60" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !filteredAdopters || filteredAdopters.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">
              {searchTerm ? "No matching adopters" : "No adopters yet"}
            </h2>
            <p className="text-muted-foreground">
              {searchTerm 
                ? "Try a different search term" 
                : "Adopters will appear here once they have completed adoptions"}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAdopters.map((adopter) => (
            <Card 
              key={adopter.id}
              className="cursor-pointer hover-elevate transition-all"
              onClick={() => setSelectedAdopter(adopter)}
              data-testid={`card-adopter-${adopter.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold" data-testid={`text-adopter-name-${adopter.id}`}>
                        {adopter.fullName}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {adopter.email}
                        </span>
                        {adopter.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {adopter.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <PawPrint className="h-3 w-3 mr-1" />
                      {adopter.adoptedAnimals.length} pet{adopter.adoptedAnimals.length !== 1 ? 's' : ''}
                    </Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                {adopter.adoptedAnimals.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {adopter.adoptedAnimals.map((animal) => (
                      <Badge key={animal.id} variant="outline" className="text-xs">
                        {animal.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
