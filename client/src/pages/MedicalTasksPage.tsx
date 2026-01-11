import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Pill, CheckCircle2, Clock, AlertCircle, Printer, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function MedicalTasksPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedDose, setSelectedDose] = useState<any>(null);
  const [administerNotes, setAdministerNotes] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Unable to administer state
  const [selectedUnableDose, setSelectedUnableDose] = useState<any>(null);
  const [isUnableDialogOpen, setIsUnableDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<"animal_sick" | "unable_to_swallow" | "other">("animal_sick");
  const [unableNotes, setUnableNotes] = useState("");

  // Fetch doses due today
  const { data: dosesData, isLoading: isLoadingToday } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/today'],
  });

  // Fetch overdue doses
  const { data: overdueDosesData, isLoading: isLoadingOverdue } = useQuery<{ doses: any[] }>({
    queryKey: ['/api/medical/doses/overdue'],
  });

  const doses = dosesData?.doses || [];
  const overdueDoses = overdueDosesData?.doses || [];
  const isLoading = isLoadingToday || isLoadingOverdue;

  // Helper function to calculate days overdue
  const getDaysOverdue = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = now.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Group doses by animal
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

  // Group overdue doses by animal
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

  // Administer dose mutation
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

  // Unable to administer mutation
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
      // Call window.print() directly without setTimeout to maintain user gesture chain on iOS
      window.print();
    } catch (error) {
      console.error('Print error:', error);
      // Detect iOS for better instructions
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

  if (isLoading) {
    return (
      <DashboardLayout title="Daily Medication Tasks" description={format(new Date(), 'EEEE, MMMM d, yyyy')}>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading medication tasks...</p>
        </div>
      </DashboardLayout>
    );
  }

  const totalDoses = doses.length;
  const completedDoses = doses.filter((d: any) => d.dose.status === 'given').length;
  const unableDoses = doses.filter((d: any) => d.dose.status === 'unable').length;
  const pendingDoses = totalDoses - completedDoses - unableDoses;

  return (
    <DashboardLayout title="Daily Medication Tasks" description={format(new Date(), 'EEEE, MMMM d, yyyy')}>
      <div className="h-full overflow-auto p-6 space-y-6">

        {/* Print Button */}
        <div className="flex justify-end no-print">
          <Button 
            variant="outline" 
            onClick={handlePrint}
            data-testid="button-print-tasks"
            className="flex items-center gap-2 touch-manipulation"
          >
            <Printer className="w-4 h-4" />
            Print Task List
          </Button>
        </div>

        {/* Summary Cards */}
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

        {/* Overdue Doses Section */}
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
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {prescription?.medicationName || 'Unknown Medication'}
                                  </p>
                                  {prescription?.controlledSubstance && (
                                    <Badge variant="destructive" className="text-xs">
                                      Controlled
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
                            <div className="no-print flex gap-2">
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
                                    Unable to Administer
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

        {/* Today's Doses Section */}
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
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {prescription?.medicationName || 'Unknown Medication'}
                                  </p>
                                  {prescription?.controlledSubstance && (
                                    <Badge variant="destructive" className="text-xs">
                                      Controlled
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
                            <div className="no-print flex gap-2">
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
                                    Unable to Administer
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

        {/* Administer Dialog */}
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

        {/* Unable to Administer Dialog */}
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
      </div>
    </DashboardLayout>
  );
}
