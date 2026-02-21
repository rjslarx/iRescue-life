import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Pill, CheckCircle2, Clock, AlertCircle, Printer, XCircle, 
  Stethoscope, Scissors, Syringe, ClipboardCheck, Calendar,
  ArrowRight, Users, Dog, ChevronDown, ChevronRight, Phone, Mail, Shield, Sparkles, Loader2, Send,
  FileText, Eye, ExternalLink, MessageSquare, Building2, Home
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { AddVaccineDialog } from "@/components/AddVaccineDialog";
import { AddProcedureDialog } from "@/components/AddProcedureDialog";
import { AddExamDialog } from "@/components/AddExamDialog";
import { AddDiagnosticDialog } from "@/components/AddDiagnosticDialog";
import { AddPrescriptionDialog } from "@/components/AddPrescriptionDialog";

interface IntakeAnimal {
  id: string;
  animalId: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  sex: string | null;
  neuterStatus: string | null;
  photoUrls: string[] | null;
  intakeDate: string;
  intakeSource: string | null;
  medicalStatus: string | null;
  medicalAlertMemo: string | null;
  checklist: {
    intakeExam: boolean;
    vaccines: boolean;
    microchip: boolean;
    fecalTest: boolean;
    heartwormTest: boolean | null;
  };
}

interface SurgeryQueueAnimal {
  id: string;
  animalId: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  sex: string | null;
  weight: string | null;
  neuterStatus: string | null;
  photoUrls: string[] | null;
  medicalStatus: string | null;
  scheduledSurgeryDate: string | null;
  medicalAlertMemo: string | null;
  intakeDate: string;
}

export default function MedicalPipelinePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [locationContext, setLocationContext] = useState<'facility' | 'foster'>('facility');
  const facilityTabs = ["intake", "surgery", "treatments", "preventative"];
  const fosterTabs = ["triage", "treatments", "surgery", "preventative"];
  const validTabs = ["treatments", "intake", "surgery", "preventative", "triage"];
  const [activeTab, setActiveTab] = useState("treatments");
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  
  // Read tab, location, and section from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const tab = params.get('tab');
    const section = params.get('section');
    const loc = params.get('location');

    const normalizedLoc = loc === 'shelter' ? 'facility' : loc;
    if (normalizedLoc === 'foster' || normalizedLoc === 'facility') {
      setLocationContext(normalizedLoc);
      const allowed = normalizedLoc === 'facility' ? facilityTabs : fosterTabs;
      if (tab && allowed.includes(tab)) {
        setActiveTab(tab);
      } else if (tab && !allowed.includes(tab)) {
        setActiveTab(allowed[0]);
      }
    } else if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    }
    
    if (section) {
      setPendingSection(section);
    }
  }, [searchString]);
  
  // Scroll to section after tab content has rendered
  useEffect(() => {
    if (pendingSection) {
      let retryCount = 0;
      const maxRetries = 5;
      
      const scrollToSection = () => {
        const element = document.getElementById(pendingSection);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setPendingSection(null);
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(scrollToSection, 100);
        } else {
          // Give up after max retries - section may not exist
          setPendingSection(null);
        }
      };
      
      requestAnimationFrame(() => {
        setTimeout(scrollToSection, 150);
      });
    }
  }, [activeTab, pendingSection]);

  const handleLocationContextChange = (context: 'facility' | 'foster') => {
    setLocationContext(context);
    const allowedTabs = context === 'facility' ? facilityTabs : fosterTabs;
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  };

  const locationParam = locationContext === 'facility' ? 'shelter' : 'foster';

  const [selectedDose, setSelectedDose] = useState<any>(null);
  const [administerNotes, setAdministerNotes] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [selectedUnableDose, setSelectedUnableDose] = useState<any>(null);
  const [isUnableDialogOpen, setIsUnableDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<"animal_sick" | "unable_to_swallow" | "other">("animal_sick");
  const [unableNotes, setUnableNotes] = useState("");

  const [schedulingAnimal, setSchedulingAnimal] = useState<SurgeryQueueAnimal | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [treatmentViewMode, setTreatmentViewMode] = useState<"byAnimal" | "byFoster">("byAnimal");
  const [expandedFosters, setExpandedFosters] = useState<Set<string>>(new Set());

  const { data: dosesData, isLoading: isLoadingToday } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/today', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/medical/doses/today?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: overdueDosesData, isLoading: isLoadingOverdue } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/overdue', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/medical/doses/overdue?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: intakeAnimalsData, isLoading: isLoadingIntake } = useQuery<{ animals: IntakeAnimal[] }>({
    queryKey: ['/api/medical/intake-animals', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/medical/intake-animals?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  // Foster-grouped medication doses
  interface FosterAnimalDose {
    id: string;
    prescriptionId: string;
    dueDate: string;
    status: string;
    givenAt: string | null;
    notes: string | null;
    medicationName: string;
    dosage: string | null;
    route: string | null;
    frequency: string | null;
    isControlledSubstance: boolean | null;
    requiresRefill: boolean | null;
    animalId: string;
  }

  interface FosterAnimalGroup {
    animalId: string;
    animalName: string;
    animalSpecies: string;
    animalPhotoUrl: string | null;
    doses: FosterAnimalDose[];
  }

  interface FosterGroup {
    fosterId: string;
    fosterName: string;
    fosterEmail: string;
    fosterPhone: string | null;
    animals: FosterAnimalGroup[];
    totalDoses: number;
  }

  const { data: fosterGroupedData, isLoading: isLoadingFosterGrouped } = useQuery<{ fosterGroups: FosterGroup[] }>({
    queryKey: ['/api/medical/doses/by-foster'],
    enabled: treatmentViewMode === 'byFoster',
  });

  const fosterGroups = fosterGroupedData?.fosterGroups || [];

  const toggleFosterExpanded = (fosterId: string) => {
    setExpandedFosters(prev => {
      const next = new Set(prev);
      if (next.has(fosterId)) {
        next.delete(fosterId);
      } else {
        next.add(fosterId);
      }
      return next;
    });
  };

  const { data: surgeryQueueData, isLoading: isLoadingSurgery } = useQuery<{ 
    scheduled: SurgeryQueueAnimal[];
    unscheduled: SurgeryQueueAnimal[];
    total: number;
  }>({
    queryKey: ['/api/medical/surgery-queue', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/medical/surgery-queue?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  // Preventative care query
  interface PreventativeCareRecord {
    id: string;
    animalId: string;
    careName: string;
    careCategory: string;
    nextDueDate: string;
    dateAdministered: string;
  }
  interface PreventativeCareItem {
    record: PreventativeCareRecord;
    animal: {
      id: string;
      name: string;
      species: string;
      breed: string;
      photoUrls: string[] | null;
      status: string;
      location: string | null;
    };
  }
  const { data: preventativeCareData, isLoading: isLoadingPreventative } = useQuery<{
    overdue: PreventativeCareItem[];
    dueToday: PreventativeCareItem[];
    comingSoon: PreventativeCareItem[];
  }>({
    queryKey: ['/api/medical/preventative-care/coming-due', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/medical/preventative-care/coming-due?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: activeTab === 'preventative',
  });

  const preventativeOverdue = preventativeCareData?.overdue || [];
  const preventativeDueToday = preventativeCareData?.dueToday || [];
  const preventativeComingSoon = preventativeCareData?.comingSoon || [];
  const preventativeTotalCount = preventativeOverdue.length + preventativeDueToday.length + preventativeComingSoon.length;

  interface VetVisitItem {
    id: string;
    animalId: string;
    submittedBy: string;
    submittedByName: string;
    visitDate: string;
    clinicName: string | null;
    reason: string;
    documentUrls: string[];
    status: string;
    processedBy: string | null;
    processedAt: string | null;
    processedNotes: string | null;
    createdAt: string;
    animalName: string | null;
    animalSpecies: string | null;
    animalBreed: string | null;
    animalPhotoUrls: string[] | null;
    animalAnimalId: string | null;
  }

  const { data: vetVisitsData, isLoading: isLoadingVetVisits } = useQuery<{ vetVisits: VetVisitItem[] }>({
    queryKey: ['/api/vet-visits', locationParam],
    queryFn: async () => {
      const res = await fetch(`/api/vet-visits?location=${locationParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const vetVisits = vetVisitsData?.vetVisits || [];
  const pendingVetVisits = vetVisits.filter(v => v.status === 'pending');
  const processedVetVisits = vetVisits.filter(v => v.status === 'processed');

  const [selectedVetVisit, setSelectedVetVisit] = useState<VetVisitItem | null>(null);
  const [processNotes, setProcessNotes] = useState("");
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [quickAddType, setQuickAddType] = useState<"vaccine" | "procedure" | "exam" | "diagnostic" | "prescription" | null>(null);

  const processVetVisitMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const response = await apiRequest('PATCH', `/api/vet-visits/${id}/process`, { notes });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Visit processed", description: "The vet visit has been marked as reviewed." });
      setSelectedVetVisit(null);
      setProcessNotes("");
      queryClient.invalidateQueries({ queryKey: ['/api/vet-visits'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to process visit.", variant: "destructive" });
    },
  });

  const doses = dosesData?.doses || [];
  const overdueDoses = overdueDosesData?.doses || [];
  const intakeAnimals = intakeAnimalsData?.animals || [];
  const scheduledSurgeries = surgeryQueueData?.scheduled || [];
  const unscheduledSurgeries = surgeryQueueData?.unscheduled || [];

  const getDaysOverdue = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = now.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const dosesByAnimal = doses.reduce((acc: any, item: any) => {
    const animalId = item.animal?.id;
    if (!animalId) return acc;
    
    if (!acc[animalId]) {
      acc[animalId] = {
        animal: item.animal,
        doses: []
      };
    }
    acc[animalId].doses.push({
      ...item.dose,
      prescription: item.prescription
    });
    return acc;
  }, {});

  const overdueDosesByAnimal = overdueDoses.reduce((acc: any, item: any) => {
    const animalId = item.animal?.id;
    if (!animalId) return acc;
    
    if (!acc[animalId]) {
      acc[animalId] = {
        animal: item.animal,
        doses: []
      };
    }
    acc[animalId].doses.push({
      ...item.dose,
      prescription: item.prescription
    });
    return acc;
  }, {});

  const administerMutation = useMutation({
    mutationFn: async ({ doseId, notes }: { doseId: string; notes?: string }) => {
      return await apiRequest('PATCH', '/api/medical/doses/' + doseId + '/administer', { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/overdue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/urgent-items'] });
      toast({
        title: "Dose administered",
        description: "The medication dose has been marked as given.",
      });
      setSelectedDose(null);
      setAdministerNotes("");
      setIsDialogOpen(false);
    },
    onError: (error) => {
      console.error('Administer error:', error);
      toast({
        title: "Error",
        description: "Failed to administer dose. Please try again.",
        variant: "destructive",
      });
    },
  });

  const unableMutation = useMutation({
    mutationFn: async ({ doseId, reason, notes }: { doseId: string; reason: "animal_sick" | "unable_to_swallow" | "other"; notes?: string }) => {
      return await apiRequest('PATCH', '/api/medical/doses/' + doseId + '/unable', { reason, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/medical/doses/overdue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/urgent-items'] });
      toast({
        title: "Dose marked as unable to administer",
        description: "The medication dose has been marked as unable to administer.",
      });
      setSelectedUnableDose(null);
      setSelectedReason("animal_sick");
      setUnableNotes("");
      setIsUnableDialogOpen(false);
    },
    onError: (error) => {
      console.error('Unable error:', error);
      toast({
        title: "Error",
        description: "Failed to mark dose as unable. Please try again.",
        variant: "destructive",
      });
    },
  });

  const scheduleSurgeryMutation = useMutation({
    mutationFn: async ({ animalId, scheduledSurgeryDate, medicalStatus }: { 
      animalId: string; 
      scheduledSurgeryDate: string | null;
      medicalStatus?: string;
    }) => {
      return await apiRequest('PATCH', '/api/medical/surgery-schedule/' + animalId, { 
        scheduledSurgeryDate,
        medicalStatus 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/surgery-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Surgery scheduled",
        description: "The surgery date has been updated.",
      });
      setSchedulingAnimal(null);
      setScheduledDate("");
    },
    onError: (error) => {
      console.error('Schedule surgery error:', error);
      toast({
        title: "Error",
        description: "Failed to schedule surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markSurgeryCompleteMutation = useMutation({
    mutationFn: async ({ animalId, neuterStatus }: { animalId: string; neuterStatus: string }) => {
      return await apiRequest('PATCH', '/api/medical/update-status/' + animalId, { 
        medicalStatus: 'recovering',
        neuterStatus
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/surgery-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Surgery completed",
        description: "The animal has been marked as recovering.",
      });
    },
    onError: (error) => {
      console.error('Complete surgery error:', error);
      toast({
        title: "Error",
        description: "Failed to mark surgery complete. Please try again.",
        variant: "destructive",
      });
    },
  });

  const backfillPreventativeCareMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/preventative-care/backfill-all', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/coming-due'] });
      toast({
        title: "Preventative care tasks generated",
        description: data.message || `Created ${data.summary?.totalRecordsCreated || 0} tasks for ${data.summary?.animalsWithNewRecords || 0} animals.`,
      });
    },
    onError: (error) => {
      console.error('Backfill preventative care error:', error);
      toast({
        title: "Error",
        description: "Failed to generate preventative care tasks. Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendOverdueRemindersMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/compliance/foster/test-trigger', { action: 'run_all' });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/medical/preventative-care/coming-due'] });
      toast({
        title: "Reminders sent",
        description: data.message || "Overdue care reminders have been sent to fosters and adopters.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send reminders",
        description: error.message || "Could not send overdue care reminders. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAdminister = (dose: any, animal: any) => {
    setSelectedDose({ ...dose, animal });
    setIsDialogOpen(true);
  };

  const confirmAdminister = () => {
    if (selectedDose) {
      administerMutation.mutate({
        doseId: selectedDose.id,
        notes: administerNotes,
      });
    }
  };

  const handleUnable = (dose: any, animal: any) => {
    setSelectedUnableDose({ ...dose, animal });
    setSelectedReason("animal_sick");
    setUnableNotes("");
    setIsUnableDialogOpen(true);
  };

  const confirmUnable = () => {
    if (selectedUnableDose) {
      unableMutation.mutate({
        doseId: selectedUnableDose.id,
        reason: selectedReason,
        notes: unableNotes,
      });
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (error) {
      console.error('Print error:', error);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      toast({
        title: "Unable to print",
        description: isIOS 
          ? "Please tap the Share button (square with arrow) in Safari and select Print."
          : "Please try again or use your browser's print function (Ctrl/Cmd+P).",
        variant: "default",
      });
    }
  };

  const handleScheduleSurgery = (animal: SurgeryQueueAnimal) => {
    setSchedulingAnimal(animal);
    setScheduledDate(animal.scheduledSurgeryDate 
      ? format(new Date(animal.scheduledSurgeryDate), 'yyyy-MM-dd')
      : ""
    );
  };

  const confirmScheduleSurgery = () => {
    if (schedulingAnimal) {
      scheduleSurgeryMutation.mutate({
        animalId: schedulingAnimal.id,
        scheduledSurgeryDate: scheduledDate || null,
        medicalStatus: scheduledDate ? 'surgery_pending' : undefined,
      });
    }
  };

  const handleMarkSurgeryComplete = (animal: SurgeryQueueAnimal) => {
    const neuterStatus = animal.sex === 'female' ? 'spayed' : 'neutered';
    markSurgeryCompleteMutation.mutate({
      animalId: animal.id,
      neuterStatus,
    });
  };

  const totalDoses = doses.length;
  const completedDoses = doses.filter((d: any) => d.dose.status === 'given').length;
  const unableDosesCount = doses.filter((d: any) => d.dose.status === 'unable').length;
  const pendingDoses = totalDoses - completedDoses - unableDosesCount;

  const needsIntakeCount = intakeAnimals.filter(a => 
    !a.checklist.intakeExam || !a.checklist.vaccines
  ).length;

  return (
    <DashboardLayout 
      title="Medical Pipeline" 
      description="Centralized medical operations dashboard"
    >
      <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
        {/* Master Context Switch */}
        <div className="flex items-center justify-center sm:justify-start" data-testid="location-context-switch">
          <div className="inline-flex rounded-md border bg-muted p-1 gap-1">
            <Button
              variant={locationContext === 'facility' ? 'default' : 'ghost'}
              onClick={() => handleLocationContextChange('facility')}
              className="gap-2"
              data-testid="button-context-facility"
            >
              <Building2 className="w-4 h-4" />
              <span>In Shelter</span>
            </Button>
            <Button
              variant={locationContext === 'foster' ? 'default' : 'ghost'}
              onClick={() => handleLocationContextChange('foster')}
              className="gap-2"
              data-testid="button-context-foster"
            >
              <Home className="w-4 h-4" />
              <span>In Foster</span>
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className={`grid w-full sm:w-auto grid-cols-4`}>
              {locationContext === 'facility' && (
                <TabsTrigger value="intake" className="flex items-center gap-2" data-testid="tab-intake">
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Intake Protocol</span>
                  <span className="sm:hidden">Intake</span>
                  {needsIntakeCount > 0 && (
                    <Badge variant="secondary" className="ml-1">{needsIntakeCount}</Badge>
                  )}
                </TabsTrigger>
              )}
              {locationContext === 'foster' && (
                <TabsTrigger value="triage" className="flex items-center gap-2" data-testid="tab-triage">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Vet Visit Triage</span>
                  <span className="sm:hidden">Triage</span>
                  {pendingVetVisits.length > 0 && (
                    <Badge variant="destructive" className="ml-1">{pendingVetVisits.length}</Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="treatments" className="flex items-center gap-2" data-testid="tab-treatments">
                <Pill className="w-4 h-4" />
                <span className="hidden sm:inline">Active Treatments</span>
                <span className="sm:hidden">Meds</span>
                {(pendingDoses + overdueDoses.length) > 0 && (
                  <Badge variant={overdueDoses.length > 0 ? "destructive" : "secondary"} className="ml-1">
                    {pendingDoses + overdueDoses.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="surgery" className="flex items-center gap-2" data-testid="tab-surgery">
                <Scissors className="w-4 h-4" />
                <span className="hidden sm:inline">Surgery Queue</span>
                <span className="sm:hidden">Surgery</span>
                {(surgeryQueueData?.total || 0) > 0 && (
                  <Badge variant="secondary" className="ml-1">{surgeryQueueData?.total}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="preventative" className="flex items-center gap-2" data-testid="tab-preventative">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Preventative Care</span>
                <span className="sm:hidden">Prevent</span>
                {preventativeOverdue.length > 0 && (
                  <Badge variant="destructive" className="ml-1">{preventativeOverdue.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="no-print flex gap-2">
              <Button 
                variant="outline" 
                onClick={handlePrint}
                data-testid="button-print-tasks"
                className="flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </div>
          </div>

          <TabsContent value="intake" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent Intakes (30 days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-testid="text-total-intakes">
                    {intakeAnimals.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Needs Vetting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    <span className="text-3xl font-bold text-orange-600" data-testid="text-needs-vetting">
                      {needsIntakeCount}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Fully Vetted
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-3xl font-bold text-green-600" data-testid="text-fully-vetted">
                      {intakeAnimals.length - needsIntakeCount}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {isLoadingIntake ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Loading intake animals...</p>
                </CardContent>
              </Card>
            ) : intakeAnimals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">No recent intakes</p>
                  <p className="text-muted-foreground">
                    Animals intaken in the last 30 days will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {intakeAnimals.map((animal) => {
                  const completedItems = [
                    animal.checklist.intakeExam,
                    animal.checklist.vaccines,
                    animal.checklist.microchip,
                    animal.checklist.fecalTest,
                    animal.checklist.heartwormTest,
                  ].filter(Boolean).length;
                  const totalItems = animal.checklist.heartwormTest === null ? 4 : 5;
                  const isComplete = completedItems === totalItems;

                  return (
                    <Card key={animal.id} className={isComplete ? "border-green-500/50" : ""}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                              {animal.name}
                              <Badge variant={isComplete ? "default" : "secondary"}>
                                {completedItems}/{totalItems} complete
                              </Badge>
                              {animal.medicalAlertMemo && (
                                <Badge variant="destructive" className="flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Alert
                                </Badge>
                              )}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {animal.species} • {animal.breed} • Intaken {format(new Date(animal.intakeDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                            data-testid={`button-view-intake-${animal.id}`}
                            className="no-print"
                          >
                            View Medical Record
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {[
                            { key: 'intakeExam', label: 'Intake Exam', completed: animal.checklist.intakeExam, tab: 'exams', show: true },
                            { key: 'vaccines', label: 'Vaccines', completed: animal.checklist.vaccines, tab: 'vaccines', show: true },
                            { key: 'microchip', label: 'Microchip', completed: animal.checklist.microchip, tab: 'glance', show: true },
                            { key: 'fecalTest', label: 'Fecal Test', completed: animal.checklist.fecalTest, tab: 'diagnostics', show: true },
                            { key: 'heartworm', label: 'Heartworm', completed: animal.checklist.heartwormTest, tab: 'diagnostics', show: animal.checklist.heartwormTest !== null },
                          ].filter(item => item.show).map(item => (
                            <div
                              key={item.key}
                              role="button"
                              tabIndex={0}
                              className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.completed ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}
                              onClick={() => navigate(`/dashboard/animals/${animal.id}/medical?tab=${item.tab}`)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/dashboard/animals/${animal.id}/medical?tab=${item.tab}`); } }}
                              data-testid={`checklist-${item.key}-${animal.id}`}
                            >
                              {item.completed ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <Clock className="w-5 h-5 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="surgery" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Awaiting Surgery
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-testid="text-total-surgery">
                    {surgeryQueueData?.total || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Scheduled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-600" />
                    <span className="text-3xl font-bold text-green-600" data-testid="text-scheduled-surgery">
                      {scheduledSurgeries.length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Needs Scheduling
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    <span className="text-3xl font-bold text-orange-600" data-testid="text-unscheduled-surgery">
                      {unscheduledSurgeries.length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {isLoadingSurgery ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Loading surgery queue...</p>
                </CardContent>
              </Card>
            ) : (surgeryQueueData?.total || 0) === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Scissors className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">No animals awaiting surgery</p>
                  <p className="text-muted-foreground">
                    Intact animals will appear here for spay/neuter scheduling
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {scheduledSurgeries.length > 0 && (
                  <div id="scheduled-surgeries" className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-green-600" />
                      Scheduled Surgeries
                    </h3>
                    {scheduledSurgeries.map((animal) => (
                      <Card key={animal.id} className="border-green-500/50">
                        <CardHeader>
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                            <div>
                              <CardTitle className="text-xl flex flex-wrap items-center gap-2">
                                {animal.name}
                                <Badge variant="default" className="bg-green-600">
                                  {format(new Date(animal.scheduledSurgeryDate!), 'MMM d, yyyy')}
                                </Badge>
                                {animal.sex === 'male' ? (
                                  <Badge variant="outline">Neuter</Badge>
                                ) : (
                                  <Badge variant="outline">Spay</Badge>
                                )}
                                {animal.medicalAlertMemo && (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Alert
                                  </Badge>
                                )}
                              </CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {animal.species} • {animal.breed} • {animal.sex} • {animal.weight || 'Weight not recorded'}
                              </p>
                            </div>
                            <div className="flex gap-2 no-print">
                              <Button
                                size="sm"
                                onClick={() => handleMarkSurgeryComplete(animal)}
                                disabled={markSurgeryCompleteMutation.isPending}
                                data-testid={`button-complete-surgery-${animal.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Mark Complete
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleScheduleSurgery(animal)}
                                data-testid={`button-reschedule-${animal.id}`}
                              >
                                Reschedule
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}

                {unscheduledSurgeries.length > 0 && (
                  <div id="needs-scheduling" className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-orange-600" />
                      Needs Scheduling
                    </h3>
                    {unscheduledSurgeries.map((animal) => (
                      <Card key={animal.id}>
                        <CardHeader>
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                            <div>
                              <CardTitle className="text-xl flex flex-wrap items-center gap-2">
                                {animal.name}
                                {animal.sex === 'male' ? (
                                  <Badge variant="secondary">Neuter needed</Badge>
                                ) : (
                                  <Badge variant="secondary">Spay needed</Badge>
                                )}
                                {animal.medicalAlertMemo && (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Alert
                                  </Badge>
                                )}
                              </CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {animal.species} • {animal.breed} • {animal.sex} • {animal.weight || 'Weight not recorded'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                In care since {format(new Date(animal.intakeDate), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <div className="flex gap-2 no-print">
                              <Button
                                size="sm"
                                onClick={() => handleScheduleSurgery(animal)}
                                data-testid={`button-schedule-surgery-${animal.id}`}
                              >
                                <Calendar className="w-4 h-4 mr-1" />
                                Schedule
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                                data-testid={`button-view-surgery-animal-${animal.id}`}
                              >
                                View Record
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="treatments" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Doses Today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-testid="text-total-doses">
                    {totalDoses}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-3xl font-bold text-green-600" data-testid="text-completed-doses">
                      {completedDoses}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Pending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    <span className="text-3xl font-bold text-orange-600" data-testid="text-pending-doses">
                      {pendingDoses}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* View Mode Toggle - only show when viewing foster animals */}
            {locationContext !== 'facility' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">View:</span>
                  <div className="flex rounded-lg border overflow-hidden">
                    <Button
                      variant={treatmentViewMode === "byAnimal" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setTreatmentViewMode("byAnimal")}
                      className="rounded-none gap-1"
                      data-testid="button-view-by-animal"
                    >
                      <Dog className="w-4 h-4" />
                      By Animal
                    </Button>
                    <Button
                      variant={treatmentViewMode === "byFoster" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setTreatmentViewMode("byFoster")}
                      className="rounded-none gap-1"
                      data-testid="button-view-by-foster"
                    >
                      <Users className="w-4 h-4" />
                      By Foster
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {treatmentViewMode === "byFoster" && locationContext !== 'facility' ? (
              /* Foster Grouped View */
              isLoadingFosterGrouped ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">Loading foster medication tasks...</p>
                  </CardContent>
                </Card>
              ) : fosterGroups.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">No Foster Medications</p>
                    <p className="text-muted-foreground">
                      There are no medications due today for fostered animals
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Foster Households with Medications
                  </h2>
                  {fosterGroups.map((fosterGroup) => {
                    const isExpanded = expandedFosters.has(fosterGroup.fosterId);
                    
                    return (
                      <Collapsible
                        key={fosterGroup.fosterId}
                        open={isExpanded}
                        onOpenChange={() => toggleFosterExpanded(fosterGroup.fosterId)}
                      >
                        <Card>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover-elevate">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                  )}
                                  <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                      {fosterGroup.fosterName}
                                      <Badge variant="secondary">
                                        {fosterGroup.totalDoses} {fosterGroup.totalDoses === 1 ? 'dose' : 'doses'}
                                      </Badge>
                                      <Badge variant="outline">
                                        {fosterGroup.animals.length} {fosterGroup.animals.length === 1 ? 'animal' : 'animals'}
                                      </Badge>
                                    </CardTitle>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Mail className="w-3 h-3" />
                                        {fosterGroup.fosterEmail}
                                      </span>
                                      {fosterGroup.fosterPhone && (
                                        <span className="flex items-center gap-1">
                                          <Phone className="w-3 h-3" />
                                          {fosterGroup.fosterPhone}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-0 space-y-4">
                              {fosterGroup.animals.map((animal) => (
                                <div key={animal.animalId} className="border rounded-lg p-4">
                                  <div className="flex items-center gap-3 mb-3">
                                    {animal.animalPhotoUrl ? (
                                      <img
                                        src={animal.animalPhotoUrl}
                                        alt={animal.animalName}
                                        className="w-10 h-10 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                        <Dog className="w-5 h-5 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div>
                                      <p className="font-medium">{animal.animalName}</p>
                                      <p className="text-sm text-muted-foreground">{animal.animalSpecies}</p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="ml-auto no-print"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/dashboard/animals/${animal.animalId}/medical`);
                                      }}
                                      data-testid={`button-view-foster-animal-${animal.animalId}`}
                                    >
                                      View Medical Record
                                    </Button>
                                  </div>
                                  <div className="space-y-2">
                                    {animal.doses.map((dose) => {
                                      const isOverdue = new Date(dose.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                                      
                                      return (
                                        <div
                                          key={dose.id}
                                          className={`flex items-center justify-between p-3 rounded-lg border ${
                                            isOverdue ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'
                                          }`}
                                          data-testid={`foster-dose-${dose.id}`}
                                        >
                                          <div className="flex items-center gap-3">
                                            <Pill className={`w-4 h-4 ${isOverdue ? 'text-destructive' : 'text-primary'}`} />
                                            <div>
                                              <p className="font-medium text-sm flex items-center gap-2">
                                                {dose.medicationName}
                                                {dose.isControlledSubstance && (
                                                  <Badge variant="destructive" className="text-xs">Controlled</Badge>
                                                )}
                                                {isOverdue && (
                                                  <Badge variant="destructive" className="text-xs">Overdue</Badge>
                                                )}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {dose.dosage} • Due {format(new Date(dose.dueDate), 'h:mm a')}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex gap-2 no-print">
                                            <Button
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAdminister({ id: dose.id, prescription: dose }, { id: animal.animalId, name: animal.animalName });
                                              }}
                                              data-testid={`button-administer-foster-${dose.id}`}
                                            >
                                              Administer
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleUnable({ id: dose.id, prescription: dose }, { id: animal.animalId, name: animal.animalName });
                                              }}
                                              data-testid={`button-unable-foster-${dose.id}`}
                                            >
                                              Unable
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              )
            ) : (
              /* Original By Animal View */
              (isLoadingToday || isLoadingOverdue) ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">Loading medication tasks...</p>
                  </CardContent>
                </Card>
              ) : (
              <>
                {Object.values(overdueDosesByAnimal).length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-destructive" />
                      <h2 className="text-xl font-semibold text-destructive">
                        Overdue Medications ({overdueDoses.length})
                      </h2>
                    </div>
                    {Object.values(overdueDosesByAnimal).map((group: any) => {
                      const animal = group.animal;
                      const animalDoses = group.doses;
                      const animalPending = animalDoses.filter((d: any) => d.status === 'due').length;

                      return (
                        <Card key={animal.id} className="border-destructive/50">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-xl flex items-center gap-2">
                                  {animal.name}
                                  {animalPending > 0 && (
                                    <Badge variant="destructive">{animalPending} overdue</Badge>
                                  )}
                                  {animal.medicalAlertMemo && (
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Alert
                                    </Badge>
                                  )}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                  {animal.species} • {animal.breed}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                                data-testid={`button-view-animal-${animal.id}`}
                                className="no-print"
                              >
                                View Medical Record
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {animalDoses.map((dose: any) => {
                                const prescription = dose.prescription;
                                const isGiven = dose.status === 'given';
                                const isUnable = dose.status === 'unable';
                                const isPending = dose.status === 'due';
                                const daysOverdue = getDaysOverdue(dose.dueDate);

                                return (
                                  <div
                                    key={dose.id}
                                    className={`flex items-start gap-4 p-4 rounded-lg border border-destructive/30 ${
                                      isGiven || isUnable ? 'bg-muted/50' : 'bg-destructive/5'
                                    }`}
                                    data-testid={`overdue-dose-${dose.id}`}
                                  >
                                    <div className="pt-1">
                                      {isGiven ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                      ) : isUnable ? (
                                        <XCircle className="w-5 h-5 text-orange-600" />
                                      ) : (
                                        <AlertCircle className="w-5 h-5 text-destructive" />
                                      )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium">
                                            {prescription?.medicationName || 'Unknown Medication'}
                                          </p>
                                          {prescription?.controlledSubstance && (
                                            <Badge variant="destructive" className="text-xs">
                                              Controlled
                                            </Badge>
                                          )}
                                          {prescription?.requiresRefill && (
                                            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400" data-testid="badge-refill-needed">
                                              REFILL NEEDED
                                            </Badge>
                                          )}
                                          {isPending && (
                                            <Badge variant="destructive" className="text-xs">
                                              {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} overdue
                                            </Badge>
                                          )}
                                          {isGiven && (
                                            <Badge variant="outline" className="text-xs text-green-600">
                                              Given
                                            </Badge>
                                          )}
                                          {isUnable && (
                                            <Badge variant="outline" className="text-xs text-orange-600">
                                              Unable to administer
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          {prescription?.dosage} • Due {format(new Date(dose.dueDate), 'MMM d')} at {format(new Date(dose.dueDate), 'h:mm a')}
                                        </p>
                                      </div>
                                      {dose.notes && (
                                        <div className="text-sm">
                                          <p className="font-medium">Notes:</p>
                                          <p className="text-muted-foreground">{dose.notes}</p>
                                        </div>
                                      )}
                                      {dose.administeredBy && dose.givenAt && (
                                        <p className="text-xs text-muted-foreground">
                                          {isGiven ? 'Administered' : 'Marked'} at {format(new Date(dose.givenAt), 'h:mm a')}
                                        </p>
                                      )}
                                    </div>
                                    <div className="no-print flex gap-2 flex-wrap">
                                      {isPending && (
                                        <>
                                          <Button
                                            size="sm"
                                            onClick={() => handleAdminister(dose, animal)}
                                            data-testid={`button-administer-overdue-${dose.id}`}
                                          >
                                            Administer
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleUnable(dose, animal)}
                                            data-testid={`button-unable-overdue-${dose.id}`}
                                          >
                                            Unable
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-4">
                  {Object.values(overdueDosesByAnimal).length > 0 && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">
                        Today's Medications ({doses.length})
                      </h2>
                    </div>
                  )}
                  {Object.values(dosesByAnimal).length > 0 ? (
                    Object.values(dosesByAnimal).map((group: any) => {
                      const animal = group.animal;
                      const animalDoses = group.doses;
                      const animalPending = animalDoses.filter((d: any) => d.status === 'due').length;

                      return (
                        <Card key={animal.id}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-xl flex items-center gap-2">
                                  {animal.name}
                                  {animalPending > 0 && (
                                    <Badge variant="secondary">{animalPending} pending</Badge>
                                  )}
                                  {animal.medicalAlertMemo && (
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Alert
                                    </Badge>
                                  )}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                  {animal.species} • {animal.breed}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                                data-testid={`button-view-animal-${animal.id}`}
                                className="no-print"
                              >
                                View Medical Record
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {animalDoses.map((dose: any) => {
                                const prescription = dose.prescription;
                                const isGiven = dose.status === 'given';
                                const isUnable = dose.status === 'unable';
                                const isPending = dose.status === 'due';

                                return (
                                  <div
                                    key={dose.id}
                                    className={`flex items-start gap-4 p-4 rounded-lg border ${
                                      isGiven || isUnable ? 'bg-muted/50' : 'bg-background'
                                    }`}
                                    data-testid={`dose-${dose.id}`}
                                  >
                                    <div className="pt-1">
                                      {isGiven ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                      ) : isUnable ? (
                                        <XCircle className="w-5 h-5 text-orange-600" />
                                      ) : (
                                        <Pill className="w-5 h-5 text-primary" />
                                      )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium">
                                            {prescription?.medicationName || 'Unknown Medication'}
                                          </p>
                                          {prescription?.controlledSubstance && (
                                            <Badge variant="destructive" className="text-xs">
                                              Controlled
                                            </Badge>
                                          )}
                                          {prescription?.requiresRefill && (
                                            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400" data-testid="badge-refill-needed">
                                              REFILL NEEDED
                                            </Badge>
                                          )}
                                          {isGiven && (
                                            <Badge variant="outline" className="text-xs text-green-600">
                                              Given
                                            </Badge>
                                          )}
                                          {isUnable && (
                                            <Badge variant="outline" className="text-xs text-orange-600">
                                              Unable to administer
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          {prescription?.dosage} • {format(new Date(dose.dueDate), 'h:mm a')}
                                        </p>
                                      </div>
                                      {dose.notes && (
                                        <div className="text-sm">
                                          <p className="font-medium">Notes:</p>
                                          <p className="text-muted-foreground">{dose.notes}</p>
                                        </div>
                                      )}
                                      {dose.administeredBy && dose.givenAt && (
                                        <p className="text-xs text-muted-foreground">
                                          {isGiven ? 'Administered' : 'Marked'} at {format(new Date(dose.givenAt), 'h:mm a')}
                                        </p>
                                      )}
                                    </div>
                                    <div className="no-print flex gap-2 flex-wrap">
                                      {isPending && (
                                        <>
                                          <Button
                                            size="sm"
                                            onClick={() => handleAdminister(dose, animal)}
                                            data-testid={`button-administer-${dose.id}`}
                                          >
                                            Administer
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleUnable(dose, animal)}
                                            data-testid={`button-unable-${dose.id}`}
                                          >
                                            Unable
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium mb-2">No medication tasks for today</p>
                        <p className="text-muted-foreground">
                          All animals are up to date with their medications!
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
              )
            )}
          </TabsContent>

          {/* Preventative Care Tab */}
          <TabsContent value="preventative" className="space-y-6">
            {isLoadingPreventative ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                {/* Header with Backfill Button */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">Preventative Care Dashboard</h2>
                    <p className="text-sm text-muted-foreground">Track vaccines, heartworm prevention, and other core care items</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {preventativeOverdue.length > 0 && (
                      <Button
                        variant="default"
                        onClick={() => sendOverdueRemindersMutation.mutate()}
                        disabled={sendOverdueRemindersMutation.isPending}
                        data-testid="button-send-overdue-reminders"
                      >
                        {sendOverdueRemindersMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Send All Reminders
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => backfillPreventativeCareMutation.mutate()}
                      disabled={backfillPreventativeCareMutation.isPending}
                      data-testid="button-generate-missing-tasks"
                    >
                      {backfillPreventativeCareMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Generate Missing Tasks
                    </Button>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className={preventativeOverdue.length > 0 ? "border-destructive" : ""}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Overdue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <AlertCircle className={`w-5 h-5 ${preventativeOverdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                        <span className={`text-3xl font-bold ${preventativeOverdue.length > 0 ? "text-destructive" : ""}`} data-testid="text-preventative-overdue">
                          {preventativeOverdue.length}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Due Today
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-500" />
                        <span className="text-3xl font-bold" data-testid="text-preventative-today">
                          {preventativeDueToday.length}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Coming Due (7 days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <span className="text-3xl font-bold" data-testid="text-preventative-upcoming">
                          {preventativeComingSoon.length}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Overdue Section */}
                {preventativeOverdue.length > 0 && (
                  <Card className="border-destructive" id="section-overdue-preventative">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-5 h-5" />
                        Overdue ({preventativeOverdue.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {preventativeOverdue.map((item) => {
                          const daysOverdue = Math.floor((new Date().getTime() - new Date(item.record.nextDueDate).getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div 
                              key={item.record.id} 
                              className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20 hover-elevate cursor-pointer"
                              onClick={() => navigate(`/animals/${item.animal.id}`)}
                              data-testid={`card-preventative-overdue-${item.record.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                  {item.animal.photoUrls?.[0] ? (
                                    <img src={item.animal.photoUrls[0]} alt={item.animal.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Dog className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">{item.animal.name}</p>
                                  <p className="text-sm text-muted-foreground">{item.record.careName}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="destructive">{daysOverdue} days overdue</Badge>
                                {item.animal.location === 'foster' && (
                                  <Badge variant="outline" className="ml-2">Foster</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Due Today Section */}
                {preventativeDueToday.length > 0 && (
                  <Card id="section-today-preventative">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-orange-600">
                        <Clock className="w-5 h-5" />
                        Due Today ({preventativeDueToday.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {preventativeDueToday.map((item) => (
                          <div 
                            key={item.record.id} 
                            className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 hover-elevate cursor-pointer"
                            onClick={() => navigate(`/animals/${item.animal.id}`)}
                            data-testid={`card-preventative-today-${item.record.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                {item.animal.photoUrls?.[0] ? (
                                  <img src={item.animal.photoUrls[0]} alt={item.animal.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Dog className="w-5 h-5 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{item.animal.name}</p>
                                <p className="text-sm text-muted-foreground">{item.record.careName}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className="bg-orange-500">Due Today</Badge>
                              {item.animal.location === 'foster' && (
                                <Badge variant="outline" className="ml-2">Foster</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Coming Soon Section */}
                {preventativeComingSoon.length > 0 && (
                  <Card id="section-upcoming-preventative">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        Coming Due ({preventativeComingSoon.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {preventativeComingSoon.map((item) => {
                          const daysUntil = Math.ceil((new Date(item.record.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div 
                              key={item.record.id} 
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border hover-elevate cursor-pointer"
                              onClick={() => navigate(`/animals/${item.animal.id}`)}
                              data-testid={`card-preventative-upcoming-${item.record.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                  {item.animal.photoUrls?.[0] ? (
                                    <img src={item.animal.photoUrls[0]} alt={item.animal.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Dog className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">{item.animal.name}</p>
                                  <p className="text-sm text-muted-foreground">{item.record.careName}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="secondary">In {daysUntil} days</Badge>
                                {item.animal.location === 'foster' && (
                                  <Badge variant="outline" className="ml-2">Foster</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Empty State */}
                {preventativeTotalCount === 0 && (
                  <Card>
                    <CardContent className="py-8">
                      <div className="text-center">
                        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Preventative Care Due</h3>
                        <p className="text-muted-foreground">
                          All animals are up to date on their preventative care.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Vet Visit Triage Queue ── */}
          <TabsContent value="triage" className="space-y-6">
            {isLoadingVetVisits ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-pending-visits-count">{pendingVetVisits.length}</p>
                          <p className="text-sm text-muted-foreground">Pending Review</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-processed-visits-count">{processedVetVisits.length}</p>
                          <p className="text-sm text-muted-foreground">Processed</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-primary/10 p-2">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-total-visits-count">{vetVisits.length}</p>
                          <p className="text-sm text-muted-foreground">Total Visits</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {pendingVetVisits.length === 0 && processedVetVisits.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                      <h3 className="text-lg font-semibold mb-2">No Vet Visits Yet</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        When foster parents upload vet visit records, they will appear here for staff to review and process.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {pendingVetVisits.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Clock className="h-5 w-5 text-amber-500" />
                          Pending Review
                        </h3>
                        <div className="grid gap-3">
                          {pendingVetVisits.map(visit => (
                            <Card key={visit.id} className="hover-elevate" data-testid={`card-vet-visit-${visit.id}`}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3 sm:gap-4">
                                  <div className="shrink-0">
                                    {visit.animalPhotoUrls && visit.animalPhotoUrls.length > 0 ? (
                                      <img
                                        src={visit.animalPhotoUrls[0]}
                                        alt={visit.animalName || 'Animal'}
                                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-md object-cover"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-md bg-muted flex items-center justify-center">
                                        <Dog className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-sm sm:text-base">{visit.animalName || 'Unknown Animal'}</span>
                                      {visit.animalAnimalId && (
                                        <Badge variant="outline" className="text-xs">#{visit.animalAnimalId}</Badge>
                                      )}
                                      <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                                        {visit.animalSpecies} {visit.animalBreed ? `• ${visit.animalBreed}` : ''}
                                      </Badge>
                                    </div>
                                    <p className="text-xs sm:text-sm text-muted-foreground">
                                      Visit: {format(new Date(visit.visitDate), 'MMM d, yyyy')}
                                      {visit.clinicName && ` at ${visit.clinicName}`}
                                    </p>
                                    <p className="text-xs sm:text-sm line-clamp-2">{visit.reason}</p>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                                      <span>Submitted by {visit.submittedByName}</span>
                                      <span className="hidden sm:inline">{format(new Date(visit.createdAt), 'MMM d, h:mm a')}</span>
                                      {visit.documentUrls && visit.documentUrls.length > 0 && (
                                        <Badge variant="outline" className="text-xs gap-1">
                                          <FileText className="h-3 w-3" />
                                          {visit.documentUrls.length} doc{visit.documentUrls.length > 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="sm:hidden pt-1">
                                      <Button
                                        variant="default"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                          setSelectedVetVisit(visit);
                                          setProcessNotes("");
                                        }}
                                        data-testid={`button-review-visit-mobile-${visit.id}`}
                                      >
                                        <Eye className="h-4 w-4 mr-1" />
                                        Review
                                      </Button>
                                    </div>
                                  </div>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="hidden sm:inline-flex shrink-0"
                                    onClick={() => {
                                      setSelectedVetVisit(visit);
                                      setProcessNotes("");
                                    }}
                                    data-testid={`button-review-visit-${visit.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Review
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {processedVetVisits.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-lg font-semibold w-full text-left">
                          <ChevronRight className="h-5 w-5 transition-transform data-[state=open]:rotate-90" />
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          Processed ({processedVetVisits.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-3">
                          {processedVetVisits.map(visit => (
                            <Card key={visit.id} className="opacity-75" data-testid={`card-vet-visit-processed-${visit.id}`}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                  <div className="shrink-0">
                                    {visit.animalPhotoUrls && visit.animalPhotoUrls.length > 0 ? (
                                      <img
                                        src={visit.animalPhotoUrls[0]}
                                        alt={visit.animalName || 'Animal'}
                                        className="w-12 h-12 rounded-md object-cover"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                                        <Dog className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold">{visit.animalName || 'Unknown Animal'}</span>
                                      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs">Processed</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      Visit: {format(new Date(visit.visitDate), 'MMM d, yyyy')}
                                      {visit.clinicName && ` at ${visit.clinicName}`}
                                    </p>
                                    <p className="text-sm">{visit.reason}</p>
                                    {visit.processedNotes && (
                                      <p className="text-xs text-muted-foreground italic">Staff notes: {visit.processedNotes}</p>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Split-Screen Process Vet Visit Dialog */}
        <Dialog open={!!selectedVetVisit} onOpenChange={(open) => { if (!open) { setSelectedVetVisit(null); setActiveDocIndex(0); } }}>
          <DialogContent className="sm:max-w-5xl max-h-[95vh] md:max-h-[90vh] overflow-hidden p-0">
            {selectedVetVisit && (
              <div className="flex flex-col h-[95vh] md:h-[85vh] w-full">
                {/* Header — compact on mobile */}
                <div className="p-3 md:p-4 border-b flex items-center gap-2 md:gap-4 flex-wrap shrink-0">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 flex-wrap">
                    {selectedVetVisit.animalPhotoUrls && selectedVetVisit.animalPhotoUrls.length > 0 ? (
                      <img src={selectedVetVisit.animalPhotoUrls[0]} alt="" className="w-8 h-8 md:w-10 md:h-10 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Dog className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm md:text-base flex items-center gap-1.5 md:gap-2 flex-wrap">
                        <Stethoscope className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                        <span className="truncate">{selectedVetVisit.animalName}</span>
                        <Badge variant="outline" className="text-xs hidden sm:inline-flex">{selectedVetVisit.animalSpecies}</Badge>
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {format(new Date(selectedVetVisit.visitDate), 'MMM d, yyyy')}
                        {selectedVetVisit.clinicName && ` · ${selectedVetVisit.clinicName}`}
                        <span className="inline md:hidden"> · {selectedVetVisit.submittedByName}</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="hidden md:inline-flex shrink-0">Submitted by {selectedVetVisit.submittedByName}</Badge>
                </div>

                {/* Main content — column on mobile, row on desktop */}
                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                  {/* Document Viewer — top on mobile (fixed height), left on desktop (flex half) */}
                  <div className="w-full md:w-1/2 h-[40vh] md:h-full bg-muted/30 border-b md:border-b-0 md:border-r flex flex-col shrink-0 md:shrink relative">
                    {selectedVetVisit.documentUrls && selectedVetVisit.documentUrls.length > 0 ? (
                      <>
                        <div className="flex-1 overflow-auto flex items-center justify-center p-3 md:p-4">
                          {(() => {
                            const url = selectedVetVisit.documentUrls[activeDocIndex];
                            const isPdf = url?.endsWith('.pdf');
                            const serveUrl = `/api/vet-visits/documents/serve?path=${encodeURIComponent(url || '')}`;
                            if (isPdf) {
                              return (
                                <div className="text-center space-y-3">
                                  <FileText className="h-12 w-12 md:h-16 md:w-16 mx-auto text-muted-foreground" />
                                  <p className="text-sm text-muted-foreground">PDF Document</p>
                                  <a href={serveUrl} target="_blank" rel="noopener noreferrer">
                                    <Button variant="outline" size="sm" className="gap-2" data-testid="button-open-pdf">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Open PDF in New Tab
                                    </Button>
                                  </a>
                                </div>
                              );
                            }
                            return (
                              <a href={serveUrl} target="_blank" rel="noopener noreferrer" className="block max-h-full">
                                <img
                                  src={serveUrl}
                                  alt={`Document ${activeDocIndex + 1}`}
                                  className="max-w-full max-h-full object-contain rounded-md cursor-pointer"
                                  data-testid="img-active-document"
                                />
                              </a>
                            );
                          })()}
                        </div>
                        {selectedVetVisit.documentUrls.length > 1 && (
                          <div className="p-1.5 md:p-2 border-t flex items-center gap-1.5 md:gap-2 overflow-x-auto shrink-0">
                            {selectedVetVisit.documentUrls.map((url, idx) => {
                              const isPdf = url.endsWith('.pdf');
                              const serveUrl = `/api/vet-visits/documents/serve?path=${encodeURIComponent(url)}`;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => setActiveDocIndex(idx)}
                                  className={`shrink-0 w-12 h-12 md:w-16 md:h-16 rounded-md border-2 overflow-hidden ${idx === activeDocIndex ? 'border-primary' : 'border-transparent opacity-60'}`}
                                  data-testid={`button-doc-thumb-${idx}`}
                                >
                                  {isPdf ? (
                                    <div className="w-full h-full bg-muted flex items-center justify-center">
                                      <FileText className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                                    </div>
                                  ) : (
                                    <img src={serveUrl} alt="" className="w-full h-full object-cover" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center p-4">
                        <div>
                          <FileText className="h-10 w-10 md:h-12 md:w-12 mx-auto text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground">No documents attached</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Data Entry Panel — bottom on mobile (scrollable), right on desktop */}
                  <div className="w-full md:w-1/2 flex-1 md:h-full flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-20 md:pb-4 space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Reason for Visit</p>
                        <p className="text-sm bg-muted p-2.5 md:p-3 rounded-md">{selectedVetVisit.reason}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Visit Date</p>
                          <p className="font-medium">{format(new Date(selectedVetVisit.visitDate), 'MMM d, yyyy')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Submitted</p>
                          <p className="font-medium">{format(new Date(selectedVetVisit.createdAt), 'MMM d, h:mm a')}</p>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">Quick-Add Medical Record</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => setQuickAddType("vaccine")}
                            data-testid="button-quick-add-vaccine"
                          >
                            <Syringe className="h-3.5 w-3.5" />
                            Vaccine
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => setQuickAddType("exam")}
                            data-testid="button-quick-add-exam"
                          >
                            <Stethoscope className="h-3.5 w-3.5" />
                            Exam
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => setQuickAddType("procedure")}
                            data-testid="button-quick-add-procedure"
                          >
                            <Scissors className="h-3.5 w-3.5" />
                            Procedure
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => setQuickAddType("diagnostic")}
                            data-testid="button-quick-add-diagnostic"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            Diagnostic
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2 col-span-2"
                            onClick={() => setQuickAddType("prescription")}
                            data-testid="button-quick-add-prescription"
                          >
                            <Pill className="h-3.5 w-3.5" />
                            Prescription
                          </Button>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => {
                            if (selectedVetVisit) {
                              navigate(`/dashboard/animals/${selectedVetVisit.animalId}/medical`);
                            }
                          }}
                          data-testid="button-go-to-medical"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Open Full Medical Records
                        </Button>
                      </div>

                      <div className="border-t pt-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="process-notes" className="text-sm font-medium">Staff Notes</Label>
                        </div>
                        <Textarea
                          id="process-notes"
                          placeholder="e.g., Added rabies vaccine record, updated spay status..."
                          value={processNotes}
                          onChange={(e) => setProcessNotes(e.target.value)}
                          className="min-h-[60px]"
                          data-testid="input-process-notes"
                        />
                      </div>
                    </div>

                    {/* Action footer — pinned at bottom of panel */}
                    <div className="p-3 md:p-4 border-t bg-background flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedVetVisit(null)}
                        data-testid="button-cancel-process"
                      >
                        Cancel
                      </Button>
                      <div className="flex-1" />
                      <Button
                        onClick={() => {
                          if (selectedVetVisit) {
                            processVetVisitMutation.mutate({ id: selectedVetVisit.id, notes: processNotes });
                          }
                        }}
                        disabled={processVetVisitMutation.isPending}
                        data-testid="button-mark-processed"
                      >
                        {processVetVisitMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Mark as Processed
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Quick-Add Medical Dialogs */}
        {selectedVetVisit && (
          <>
            <AddVaccineDialog
              animalId={selectedVetVisit.animalId}
              open={quickAddType === "vaccine"}
              onOpenChange={(open) => { if (!open) setQuickAddType(null); }}
            />
            <AddExamDialog
              animalId={selectedVetVisit.animalId}
              open={quickAddType === "exam"}
              onOpenChange={(open) => { if (!open) setQuickAddType(null); }}
            />
            <AddProcedureDialog
              animalId={selectedVetVisit.animalId}
              open={quickAddType === "procedure"}
              onOpenChange={(open) => { if (!open) setQuickAddType(null); }}
            />
            <AddDiagnosticDialog
              animalId={selectedVetVisit.animalId}
              open={quickAddType === "diagnostic"}
              onOpenChange={(open) => { if (!open) setQuickAddType(null); }}
            />
            <AddPrescriptionDialog
              animalId={selectedVetVisit.animalId}
              open={quickAddType === "prescription"}
              onOpenChange={(open) => { if (!open) setQuickAddType(null); }}
            />
          </>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Administer Medication</DialogTitle>
              <DialogDescription>
                Confirm administration of this medication dose
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedDose && (
                <>
                  <div>
                    <p className="font-medium">{selectedDose.animal?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedDose.prescription?.medicationName} - {selectedDose.prescription?.dosage}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Due at {format(new Date(selectedDose.dueDate), 'h:mm a')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Add any notes about administration..."
                      value={administerNotes}
                      onChange={(e) => setAdministerNotes(e.target.value)}
                      data-testid="input-administer-notes"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsDialogOpen(false)}
                      disabled={administerMutation.isPending}
                      data-testid="button-cancel-administer"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmAdminister}
                      disabled={administerMutation.isPending}
                      data-testid="button-confirm-administer"
                    >
                      {administerMutation.isPending ? "Administering..." : "Confirm Administration"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isUnableDialogOpen} onOpenChange={setIsUnableDialogOpen}>
          <DialogContent data-testid="dialog-unable-administer">
            <DialogHeader>
              <DialogTitle>Unable to Administer Medication</DialogTitle>
              <DialogDescription>
                Mark this medication dose as unable to administer
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedUnableDose && (
                <>
                  <div>
                    <p className="font-medium" data-testid="text-unable-animal-name">
                      {selectedUnableDose.animal?.name}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid="text-unable-medication-name">
                      {selectedUnableDose.prescription?.medicationName} - {selectedUnableDose.prescription?.dosage}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Due at {format(new Date(selectedUnableDose.dueDate), 'h:mm a')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <RadioGroup
                      value={selectedReason}
                      onValueChange={(value) => setSelectedReason(value as "animal_sick" | "unable_to_swallow" | "other")}
                      data-testid="radio-group-reason"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="animal_sick" id="animal_sick" data-testid="radio-animal-sick" />
                        <Label htmlFor="animal_sick" className="font-normal cursor-pointer">
                          Animal Sick
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="unable_to_swallow" id="unable_to_swallow" data-testid="radio-unable-swallow" />
                        <Label htmlFor="unable_to_swallow" className="font-normal cursor-pointer">
                          Unable to Swallow
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="other" id="other" data-testid="radio-other" />
                        <Label htmlFor="other" className="font-normal cursor-pointer">
                          Other
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unable-notes">Notes (optional)</Label>
                    <Textarea
                      id="unable-notes"
                      placeholder="Add any additional notes..."
                      value={unableNotes}
                      onChange={(e) => setUnableNotes(e.target.value)}
                      data-testid="input-unable-notes"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsUnableDialogOpen(false)}
                      disabled={unableMutation.isPending}
                      data-testid="button-cancel-unable"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmUnable}
                      disabled={unableMutation.isPending}
                      data-testid="button-confirm-unable"
                    >
                      {unableMutation.isPending ? "Saving..." : "Confirm"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!schedulingAnimal} onOpenChange={(open) => !open && setSchedulingAnimal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Surgery</DialogTitle>
              <DialogDescription>
                Set a surgery date for {schedulingAnimal?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="surgery-date">Surgery Date</Label>
                <input
                  type="date"
                  id="surgery-date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  data-testid="input-surgery-date"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setSchedulingAnimal(null)}
                  disabled={scheduleSurgeryMutation.isPending}
                  data-testid="button-cancel-schedule"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmScheduleSurgery}
                  disabled={scheduleSurgeryMutation.isPending}
                  data-testid="button-confirm-schedule"
                >
                  {scheduleSurgeryMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
