import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
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
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";

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

  // Frontend admin check - API also enforces this
  const isAdmin = user?.roles?.includes("admin");
  
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
    );
  }

  if (selectedAdopter) {
    return (
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
          <div className="grid gap-6 md:grid-cols-2">
            {pets.map((animal) => (
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
      </div>
    );
  }

  return (
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
  );
}
