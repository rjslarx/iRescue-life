import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenant } from "@/contexts/TenantContext";
import DashboardLayout from "@/components/DashboardLayout";
import { AnimalHudCard } from "@/components/AnimalHudCard";
import { AnimalDetailsDialog } from "@/components/AnimalDetailsDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Animal } from "@shared/schema";
import {
  Search,
  Dog,
  Cat,
  Heart,
  Calendar,
  User,
  Stethoscope,
  FileText,
  Clock,
  Mail,
  Phone,
  PawPrint,
  Loader2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

interface LookupAnimal {
  id: string;
  animalId: string;
  name: string;
  species: string;
  breed: string;
  age: string | null;
  status: string;
  photoUrls: string[];
  intakeDate: string | null;
  sex: string | null;
  petfinderBreed: string | null;
  petfinderType: string | null;
  fosterCount: number;
  adoptionInfo: { adopterName: string | null; adoptionDate: string | null } | null;
}

interface FosterHistoryEntry {
  id: string;
  fosterId: string;
  fosterName: string | null;
  fosterEmail: string | null;
  startDate: string | null;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  status: string;
  notes: string | null;
}

interface ApplicationEntry {
  id: string;
  applicantName: string;
  applicantEmail: string;
  stage: string;
  createdAt: string;
}

interface AdoptionRecord {
  id: string;
  applicationId: string | null;
  adopterName: string;
  adopterEmail: string | null;
  adopterPhone: string | null;
  adoptionDate: string | null;
  adoptionFee: string | null;
  notes: string | null;
}

interface AdoptionContractRecord {
  sessionId: string;
  applicationId: string | null;
  sessionStatus: string;
  baseFee: string | null;
  signedAt: string | null;
  paidAt: string | null;
  contractPdfUrl: string | null;
  signerName: string | null;
  signerEmail: string | null;
  contractSignedAt: string | null;
}

interface FullProfile {
  animal: any;
  fosterHistory: FosterHistoryEntry[];
  adoptionInfo: AdoptionRecord | null;
  adoptionRecords: AdoptionRecord[];
  adoptionContractRecords: AdoptionContractRecord[];
  medicalSummary: { examCount: number };
  placementAgreement: {
    status: string;
    contractPdfUrl: string | null;
    signedAt: string | null;
    fosterName: string;
  } | null;
  applicationHistory: ApplicationEntry[];
}

function getStatusBadge(status: string) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  switch (status) {
    case "available":
      return <Badge variant="default" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "in_trial":
      return (
        <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-transparent" data-testid={`badge-status-${status}`}>
          {label}
        </Badge>
      );
    case "adopted":
      return (
        <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border-transparent" data-testid={`badge-status-${status}`}>
          {label}
        </Badge>
      );
    case "deceased":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "medical_hold":
    case "bite_hold":
    case "stray_hold":
      return (
        <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-transparent" data-testid={`badge-status-${status}`}>
          {label}
        </Badge>
      );
    case "pending":
    case "adoption_pending":
    case "transfer_pending":
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{label}</Badge>;
    case "merged":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}><span className="line-through">{label}</span></Badge>;
    default:
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{label}</Badge>;
  }
}

function getSpeciesIcon(species: string) {
  const s = species?.toLowerCase();
  if (s === "cat" || s === "kitten") return <Cat className="h-5 w-5 text-muted-foreground" />;
  if (s === "dog" || s === "puppy") return <Dog className="h-5 w-5 text-muted-foreground" />;
  return <PawPrint className="h-5 w-5 text-muted-foreground" />;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "N/A";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "N/A";
  }
}

function getHudVariant(status: string): "active" | "adopted" | "transported" | "deceased" {
  if (status === "adopted") return "adopted";
  if (status === "transported") return "transported";
  if (status === "deceased") return "deceased";
  return "active";
}

function AnimalProfilePanel({ animalId }: { animalId: string }) {
  const { basePath } = useTenant();
  const [, navigate] = useLocation();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Record<string, number>>({});
  const [detailsAnimal, setDetailsAnimal] = useState<Animal | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<FullProfile>({
    queryKey: ['/api/animals', animalId, 'full-profile'],
    enabled: !!animalId,
  });

  const nextPhoto = (aid: string, maxIndex: number) => {
    setCurrentPhotoIndex((prev) => ({
      ...prev,
      [aid]: ((prev[aid] || 0) + 1) % maxIndex,
    }));
  };

  const prevPhoto = (aid: string, maxIndex: number) => {
    setCurrentPhotoIndex((prev) => ({
      ...prev,
      [aid]: ((prev[aid] || 0) - 1 + maxIndex) % maxIndex,
    }));
  };

  const calculateDaysInCare = (animal: Animal): number => {
    if (!animal.intakeDate) return 0;
    const startDate = new Date(animal.intakeDate);
    if (isNaN(startDate.getTime())) return 0;
    const endDate = animal.adoptionDate
      ? new Date(animal.adoptionDate)
      : animal.deceasedDate
        ? new Date(animal.deceasedDate)
        : new Date();
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="profile-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground" data-testid="profile-empty">
        <p>Could not load animal profile.</p>
      </div>
    );
  }

  const { animal, fosterHistory, adoptionInfo, adoptionRecords, adoptionContractRecords, medicalSummary, placementAgreement, applicationHistory } = data;

  return (
    <div className="space-y-6" data-testid="animal-profile-panel">
      <div data-testid="section-hud-card">
        <AnimalHudCard
          animal={animal as Animal}
          currentPhotoIndex={currentPhotoIndex}
          onNextPhoto={nextPhoto}
          onPrevPhoto={prevPhoto}
          onViewDetails={(a) => {
            setDetailsAnimal(a);
            setDetailsDialogOpen(true);
          }}
          onEditAnimal={(a) => navigate(`${basePath}/animals?edit=${a.id}`)}
          calculateDaysInCare={calculateDaysInCare}
          basePath={basePath}
          navigate={navigate}
          variant={getHudVariant(animal.status)}
        />
      </div>

      {detailsAnimal && (
        <AnimalDetailsDialog
          animal={detailsAnimal}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      )}

      <Tabs defaultValue="foster" className="w-full">
        <TabsList className="w-full flex-wrap" data-testid="profile-tabs">
          <TabsTrigger value="foster" data-testid="tab-foster">
            <PawPrint className="h-4 w-4 mr-1" /> Foster ({fosterHistory.length})
          </TabsTrigger>
          <TabsTrigger value="adoption" data-testid="tab-adoption">
            <Heart className="h-4 w-4 mr-1" /> Adoption ({adoptionRecords?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="medical" data-testid="tab-medical">
            <Stethoscope className="h-4 w-4 mr-1" /> Medical
          </TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-applications">
            <FileText className="h-4 w-4 mr-1" /> Apps ({applicationHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="foster" className="mt-4" data-testid="section-foster-history">
          {fosterHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No foster history.</p>
          ) : (
            <div className="space-y-3">
              {fosterHistory.map((f) => (
                <Card key={f.id} data-testid={`foster-entry-${f.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium" data-testid="text-foster-name">{f.fosterName || "Unknown"}</span>
                          <Badge variant={f.status === "active" ? "default" : "secondary"} data-testid={`badge-foster-status-${f.id}`}>
                            {f.status}
                          </Badge>
                        </div>
                        {f.fosterEmail && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Mail className="h-3 w-3" />
                            <span data-testid="text-foster-email">{f.fosterEmail}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground text-right">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(f.startDate)}</span>
                          <span>—</span>
                          <span>{f.actualReturnDate ? formatDate(f.actualReturnDate) : "Present"}</span>
                        </div>
                      </div>
                    </div>
                    {f.notes && <p className="text-sm text-muted-foreground mt-2">{f.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {placementAgreement && (
            <Card className="mt-3" data-testid="placement-agreement-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Latest Placement Agreement</span>
                  <Badge variant="default">{placementAgreement.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Foster: {placementAgreement.fosterName} — Signed: {formatDate(placementAgreement.signedAt)}
                </p>
                {placementAgreement.contractPdfUrl && (
                  <a
                    href={placementAgreement.contractPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline mt-1 inline-block"
                    data-testid="link-agreement-pdf"
                  >
                    View Agreement PDF
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="adoption" className="mt-4" data-testid="section-adoption-info">
          {(!adoptionRecords || adoptionRecords.length === 0) && (!adoptionContractRecords || adoptionContractRecords.length === 0) ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-adoption">No adoption record.</p>
          ) : (
            <div className="space-y-4">
              {adoptionRecords && adoptionRecords.map((record, idx) => {
                const matchingContract = adoptionContractRecords?.find(c =>
                  (record.applicationId && c.applicationId && record.applicationId === c.applicationId) ||
                  (c.signerEmail?.toLowerCase() === record.adopterEmail?.toLowerCase())
                );
                return (
                  <Card key={record.id} data-testid={`adoption-record-${record.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Heart className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium" data-testid={`text-adopter-name-${idx}`}>{record.adopterName}</span>
                        </div>
                        <Badge variant="default" data-testid={`badge-adopted-${idx}`}>Adopted</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        {record.adopterEmail && (
                          <>
                            <div className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</div>
                            <div data-testid={`text-adopter-email-${idx}`}>
                              <a href={`mailto:${record.adopterEmail}`} className="text-primary underline">{record.adopterEmail}</a>
                            </div>
                          </>
                        )}
                        {record.adopterPhone && (
                          <>
                            <div className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</div>
                            <div data-testid={`text-adopter-phone-${idx}`}>
                              <a href={`tel:${record.adopterPhone}`} className="text-primary underline">{record.adopterPhone}</a>
                            </div>
                          </>
                        )}
                        <div className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Date</div>
                        <div data-testid={`text-adoption-date-${idx}`}>{formatDate(record.adoptionDate)}</div>
                        {record.adoptionFee && Number(record.adoptionFee) > 0 && (
                          <>
                            <div className="text-muted-foreground">Fee</div>
                            <div data-testid={`text-adoption-fee-${idx}`}>${record.adoptionFee}</div>
                          </>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-adoption-notes-${idx}`}>{record.notes}</p>
                      )}
                      {matchingContract?.contractPdfUrl && (
                        <a
                          href={matchingContract.contractPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-adoption-contract-${idx}`}
                        >
                          <Button variant="outline" className="gap-2 mt-1">
                            <FileText className="h-4 w-4" />
                            View Adoption Contract
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {adoptionContractRecords && adoptionContractRecords.filter(c =>
                !adoptionRecords?.some(r =>
                  (r.applicationId && c.applicationId && r.applicationId === c.applicationId) ||
                  (r.adopterEmail?.toLowerCase() === c.signerEmail?.toLowerCase())
                )
              ).map((contract, idx) => (
                <Card key={contract.sessionId} data-testid={`adoption-contract-only-${contract.sessionId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium" data-testid={`text-contract-signer-${idx}`}>{contract.signerName || "Unknown"}</span>
                      </div>
                      <Badge variant="default">Completed</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {contract.signerEmail && (
                        <>
                          <div className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</div>
                          <div>
                            <a href={`mailto:${contract.signerEmail}`} className="text-primary underline">{contract.signerEmail}</a>
                          </div>
                        </>
                      )}
                      <div className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Signed</div>
                      <div>{formatDate(contract.contractSignedAt)}</div>
                      {contract.baseFee && Number(contract.baseFee) > 0 && (
                        <>
                          <div className="text-muted-foreground">Fee</div>
                          <div>${contract.baseFee}</div>
                        </>
                      )}
                    </div>
                    {contract.contractPdfUrl && (
                      <a
                        href={contract.contractPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-contract-pdf-${idx}`}
                      >
                        <Button variant="outline" className="gap-2 mt-1">
                          <FileText className="h-4 w-4" />
                          View Adoption Contract
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="medical" className="mt-4" data-testid="section-medical-summary">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Medical Summary</span>
              </div>
              <p className="text-sm" data-testid="text-exam-count">
                <span className="text-muted-foreground">Exams on record:</span> {medicalSummary.examCount}
              </p>
              <Link href={`/dashboard/animals/${animal.id}/medical`}>
                <Button variant="outline" className="mt-3 gap-2" data-testid="link-full-medical">
                  <Stethoscope className="h-4 w-4" />
                  View Full Medical Record
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="mt-4" data-testid="section-applications">
          {applicationHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications.</p>
          ) : (
            <div className="space-y-3">
              {applicationHistory.map((app) => (
                <Card key={app.id} data-testid={`application-entry-${app.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-medium" data-testid="text-applicant-name">{app.applicantName}</span>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <Mail className="h-3 w-3" />
                          <span data-testid="text-applicant-email">{app.applicantEmail}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" data-testid={`badge-app-stage-${app.id}`}>
                          {app.stage?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Unknown"}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(app.createdAt)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AnimalLookupPage() {
  const [searchInput, setSearchInput] = useState("");
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const debouncedSearch = useDebounce(searchInput, 300);
  const searchTerm = debouncedSearch.trim();

  const { data: searchData, isLoading: searchLoading } = useQuery<{ animals: LookupAnimal[] }>({
    queryKey: ['/api/animals/lookup', searchTerm],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/animals/lookup?q=${encodeURIComponent(searchTerm)}`);
      return res.json();
    },
    enabled: searchTerm.length >= 2,
  });

  const animals = searchData?.animals || [];

  return (
    <DashboardLayout
      title="Animal Lookup"
      description="Search for any animal by name, microchip, or ID"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Animal Lookup" },
      ]}
    >
      <div className="p-4 lg:p-6 h-full overflow-auto">
        <div className="flex flex-col lg:flex-row gap-6 h-full">
          <div className={`${selectedAnimalId && !isMobile ? "lg:w-1/3 lg:min-w-[300px]" : "w-full lg:max-w-2xl lg:mx-auto"} flex flex-col gap-4`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, microchip, or ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                data-testid="input-animal-search"
              />
            </div>

            {searchTerm.length < 2 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="search-prompt">
                <Search className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Type at least 2 characters to search</p>
              </div>
            )}

            {searchLoading && searchTerm.length >= 2 && (
              <div className="flex items-center justify-center py-12" data-testid="search-loading">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searchLoading && searchTerm.length >= 2 && animals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="search-no-results">
                <PawPrint className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No animals found matching "{searchTerm}"</p>
              </div>
            )}

            {animals.length > 0 && (
              <div className="space-y-2 overflow-auto" data-testid="search-results-list">
                {animals.map((animal) => (
                  <Card
                    key={animal.id}
                    className={`cursor-pointer hover-elevate transition-colors ${selectedAnimalId === animal.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedAnimalId(animal.id)}
                    data-testid={`card-animal-${animal.id}`}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      {animal.photoUrls && animal.photoUrls.length > 0 ? (
                        <img
                          src={animal.photoUrls[0]}
                          alt={animal.name}
                          className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          data-testid={`img-animal-thumb-${animal.id}`}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0" data-testid={`img-animal-placeholder-${animal.id}`}>
                          {getSpeciesIcon(animal.species)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate" data-testid={`text-name-${animal.id}`}>{animal.name}</span>
                          {getStatusBadge(animal.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {animal.petfinderBreed || animal.breed || animal.species}
                          {animal.animalId && <span className="ml-2">#{animal.animalId}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {selectedAnimalId && (
            <div className="flex-1 min-w-0 overflow-auto" data-testid="profile-panel">
              {isMobile && (
                <div className="flex justify-end flex-wrap mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAnimalId(null)}
                    data-testid="button-back-to-results"
                  >
                    Back to Results
                  </Button>
                </div>
              )}
              <AnimalProfilePanel animalId={selectedAnimalId} />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
