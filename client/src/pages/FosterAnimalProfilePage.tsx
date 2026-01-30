import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Heart, ArrowLeft, AlertCircle, Phone, Mail, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export default function FosterAnimalProfilePage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { animalId } = useParams<{ animalId: string }>();

  const { data: fostersData, isLoading: fostersLoading } = useQuery<MyFostersData>({
    queryKey: ['/api/foster-animals'],
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<RescueContactsData>({
    queryKey: ['/api/rescue-contacts'],
  });

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
            <Link href={`${basePath}/dashboard/my-fosters`}>
              <Button>Back to My Fosters</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  const photoUrl = animal.photoUrls && animal.photoUrls.length > 0 ? animal.photoUrls[0] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b p-4 bg-background flex-wrap">
        <Link href={`${basePath}/dashboard/my-fosters`}>
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to My Fosters
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{animal.name}</h1>
          <p className="text-sm text-muted-foreground">
            {animal.species} • {animal.breed}
          </p>
        </div>
        <Link href={`/dashboard/my-fosters/${animal.id}/medical`}>
          <Button variant="default" data-testid="button-view-medical">
            View Medical Info
          </Button>
        </Link>
      </div>
      <main className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Animal Photo and Basic Info */}
              <Card>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
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

              {/* Foster Care Notes */}
              {fosterAnimal.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Care Instructions</CardTitle>
                    <CardDescription>Special instructions for fostering {animal.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-care-notes">
                      {fosterAnimal.notes}
                    </p>
                  </CardContent>
                </Card>
              )}

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
                          <div className="flex items-start justify-between gap-4 mb-2">
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
                                <span className="text-muted-foreground">{contact.availability}</span>
                              </div>
                            )}
                          </div>
                          {contact.notes && (
                            <p className="text-xs text-muted-foreground mt-2">{contact.notes}</p>
                          )}
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
