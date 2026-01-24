import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState } from "react";
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
  Fingerprint
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

export default function AdopterPetDetailPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("compliance");
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showHappyTailDialog, setShowHappyTailDialog] = useState(false);

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
      toast({ title: "Update submitted! It will be reviewed by staff." });
    },
    onError: () => {
      toast({ title: "Failed to submit update", variant: "destructive" });
    },
  });

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
                Adopted {new Date(pet.adoptedAt).toLocaleDateString()}
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
          {pet.microchipNumber && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Fingerprint className="h-5 w-5" />
                  Microchip
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-lg">{pet.microchipNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Keep your contact info updated with the registry
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href="https://www.petmicrochiplookup.org/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Lookup Registry
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
                  <Button size="sm" data-testid="button-add-reminder">
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
                  <Button size="sm" data-testid="button-add-weight">
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
                  <Button size="sm" data-testid="button-submit-update">
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
                      submitHappyTailMutation.mutate({
                        message: formData.get("message") as string || undefined,
                      });
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
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Photo upload coming soon! For now, you can describe how {pet.name} is doing.
                    </p>
                    <DialogFooter>
                      <Button type="submit" disabled={submitHappyTailMutation.isPending}>
                        {submitHappyTailMutation.isPending ? "Submitting..." : "Submit Update"}
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
