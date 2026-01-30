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
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

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
  const validTabs = ["treatments", "intake", "surgery"];
  const [activeTab, setActiveTab] = useState("treatments");
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  
  // Read tab and section from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const tab = params.get('tab');
    const section = params.get('section');
    
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    }
    
    // Store section for later scrolling after tab content renders
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
  const [selectedDose, setSelectedDose] = useState<any>(null);
  const [administerNotes, setAdministerNotes] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [selectedUnableDose, setSelectedUnableDose] = useState<any>(null);
  const [isUnableDialogOpen, setIsUnableDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<"animal_sick" | "unable_to_swallow" | "other">("animal_sick");
  const [unableNotes, setUnableNotes] = useState("");

  const [schedulingAnimal, setSchedulingAnimal] = useState<SurgeryQueueAnimal | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");

  const { data: dosesData, isLoading: isLoadingToday } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/today'],
  });

  const { data: overdueDosesData, isLoading: isLoadingOverdue } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/overdue'],
  });

  const { data: intakeAnimalsData, isLoading: isLoadingIntake } = useQuery<{ animals: IntakeAnimal[] }>({
    queryKey: ['/api/medical/intake-animals'],
  });

  const { data: surgeryQueueData, isLoading: isLoadingSurgery } = useQuery<{ 
    scheduled: SurgeryQueueAnimal[];
    unscheduled: SurgeryQueueAnimal[];
    total: number;
  }>({
    queryKey: ['/api/medical/surgery-queue'],
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
      <div className="h-full overflow-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="grid w-full sm:w-auto grid-cols-3">
              <TabsTrigger value="intake" className="flex items-center gap-2" data-testid="tab-intake">
                <ClipboardCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Intake Protocol</span>
                <span className="sm:hidden">Intake</span>
                {needsIntakeCount > 0 && (
                  <Badge variant="secondary" className="ml-1">{needsIntakeCount}</Badge>
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
                          <div className={`flex items-center gap-2 p-3 rounded-lg border ${animal.checklist.intakeExam ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}>
                            {animal.checklist.intakeExam ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium">Intake Exam</span>
                          </div>
                          <div className={`flex items-center gap-2 p-3 rounded-lg border ${animal.checklist.vaccines ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}>
                            {animal.checklist.vaccines ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium">Vaccines</span>
                          </div>
                          <div className={`flex items-center gap-2 p-3 rounded-lg border ${animal.checklist.microchip ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}>
                            {animal.checklist.microchip ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium">Microchip</span>
                          </div>
                          <div className={`flex items-center gap-2 p-3 rounded-lg border ${animal.checklist.fecalTest ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}>
                            {animal.checklist.fecalTest ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="text-sm font-medium">Fecal Test</span>
                          </div>
                          {animal.checklist.heartwormTest !== null && (
                            <div className={`flex items-center gap-2 p-3 rounded-lg border ${animal.checklist.heartwormTest ? 'bg-green-50 dark:bg-green-950 border-green-500/50' : 'bg-muted/50'}`}>
                              {animal.checklist.heartwormTest ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <Clock className="w-5 h-5 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium">Heartworm</span>
                            </div>
                          )}
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

            {(isLoadingToday || isLoadingOverdue) ? (
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
            )}
          </TabsContent>
        </Tabs>

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
