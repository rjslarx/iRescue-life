import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, FileText, ClipboardCheck, UserX, Clock, Search, CheckCircle, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface ContractObligation {
  sessionId: string;
  animalId: string;
  animalName: string;
  animalSpecies: string;
  obligationType: string;
  dueDate: string;
  daysOverdue: number;
  adopterName?: string;
  adopterEmail?: string;
}

interface MissedConfirmation {
  id: string;
  animalId: string;
  animalName: string;
  adopterName: string | null;
  adopterEmail: string;
  medicationName: string;
  frequency: string;
  nextDueDate: string;
  lastConfirmedDate: string | null;
  daysOverdue: number;
}

interface PendingConfirmation {
  id: string;
  animalId: string;
  careCategory: string;
  careName: string;
  dateAdministered: string;
  clinicName: string | null;
  notes: string | null;
  createdAt: string;
  animalName: string;
  adopterName: string | null;
  adopterEmail: string;
}

interface AtRiskAdopter {
  name: string;
  email: string;
  userId: string;
  missedCount: number;
  items: Array<{
    animalName: string;
    medicationName: string;
    dueDate: string;
    daysOverdue: number;
  }>;
}

interface AdopterComplianceResponse {
  stats: {
    totalActiveReminders: number;
    totalOverdue: number;
    confirmedToday: number;
    complianceRate: number;
    atRiskCount: number;
    pendingReviewCount: number;
  };
  contractObligations: ContractObligation[];
  missedConfirmations: MissedConfirmation[];
  pendingConfirmations: PendingConfirmation[];
  atRiskAdopters: AtRiskAdopter[];
  upcomingDeadlines: ContractObligation[];
}

interface AlumniResult {
  adoptionId: string;
  animalId: string;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  adoptionDate: string;
  adoptionFee: string | null;
  animalName: string;
  animalSpecies: string;
  animalBreed: string | null;
  animalPhotoUrls: string[] | null;
  animalAnimalId: string | null;
  neuterStatus: string | null;
  microchip: { number: string; manufacturer: string } | null;
  contract: { contractPdfUrl: string | null; signerName: string; signedAt: string; spayNeuterDate: string | null } | null;
}

export default function ComplianceWidget() {
  const { user } = useAuth();
  const [alumniSearch, setAlumniSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery<AdopterComplianceResponse>({
    queryKey: ['/api/dashboard/adopter-compliance'],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: alumniData, isLoading: alumniLoading } = useQuery<{ results: AlumniResult[] }>({
    queryKey: ['/api/dashboard/adopter-compliance/alumni-search', searchTerm],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/adopter-compliance/alumni-search?q=${encodeURIComponent(searchTerm)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: !!user && searchTerm.length >= 2,
  });

  const handleAlumniSearch = () => {
    if (alumniSearch.trim().length >= 2) {
      setSearchTerm(alumniSearch.trim());
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="compliance-widget-skeleton">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const stats = data?.stats;
  const totalIssues = (stats?.totalOverdue || 0) + (stats?.atRiskCount || 0) + (stats?.pendingReviewCount || 0);
  const hasNoIssues = totalIssues === 0;

  return (
    <Card id="compliance-widget" className={hasNoIssues ? "" : "ring-2 ring-destructive/50"} data-testid="compliance-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className={`h-4 w-4 ${hasNoIssues ? 'text-green-500' : 'text-destructive'}`} />
            Adopter Compliance
          </CardTitle>
          {stats && (
            <Badge variant={stats.complianceRate >= 90 ? "secondary" : "destructive"}>
              {stats.complianceRate}%
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {hasNoIssues ? "All adopters are compliant!" : `${totalIssues} items need follow-up`}
        </p>
      </CardHeader>
      <CardContent>
        {hasNoIssues && !searchTerm ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">All adopter compliance checks passed</p>
              {stats && stats.confirmedToday > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{stats.confirmedToday} confirmed today</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search alumni by name or microchip..."
                value={alumniSearch}
                onChange={(e) => setAlumniSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAlumniSearch()}
                className="text-sm"
                data-testid="input-alumni-search-empty"
              />
              <Button size="icon" variant="ghost" onClick={handleAlumniSearch} data-testid="button-alumni-search-empty">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchTerm && renderAlumniResults(alumniData?.results || [], alumniLoading)}
          </div>
        ) : (
          <Tabs defaultValue="contracts" className="w-full">
            <TabsList className="w-full grid grid-cols-5 h-auto">
              <TabsTrigger value="contracts" className="text-xs py-1.5 px-1" data-testid="tab-contract-obligations">
                <span className="flex items-center gap-0.5">
                  <FileText className="h-3 w-3" />
                  <span className="hidden sm:inline">Contracts</span>
                  {(data?.contractObligations.length || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.contractObligations.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="missed" className="text-xs py-1.5 px-1" data-testid="tab-missed-confirmations">
                <span className="flex items-center gap-0.5">
                  <ClipboardCheck className="h-3 w-3" />
                  <span className="hidden sm:inline">Missed</span>
                  {(data?.missedConfirmations.length || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.missedConfirmations.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="at-risk" className="text-xs py-1.5 px-1" data-testid="tab-at-risk-adopters">
                <span className="flex items-center gap-0.5">
                  <UserX className="h-3 w-3" />
                  <span className="hidden sm:inline">At-Risk</span>
                  {(data?.atRiskAdopters.length || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.atRiskAdopters.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="text-xs py-1.5 px-1" data-testid="tab-upcoming-deadlines">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">Upcoming</span>
                  {(data?.upcomingDeadlines.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.upcomingDeadlines.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="alumni" className="text-xs py-1.5 px-1" data-testid="tab-alumni-lookup">
                <span className="flex items-center gap-0.5">
                  <Search className="h-3 w-3" />
                  <span className="hidden sm:inline">Alumni</span>
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contracts" className="mt-3 space-y-2">
              {(data?.contractObligations || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No overdue contract obligations</span>
                </div>
              ) : (
                <>
                  {data?.pendingConfirmations && data.pendingConfirmations.length > 0 && (
                    <div className="p-2 border border-blue-300/50 bg-blue-50 dark:bg-blue-950/20 rounded-md mb-2" data-testid="pending-review-notice">
                      <p className="text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-1">{data.pendingConfirmations.length}</Badge>
                        compliance submissions awaiting review
                      </p>
                    </div>
                  )}
                  {(data?.contractObligations || []).slice(0, 3).map((obligation, idx) => (
                    <div key={`${obligation.sessionId}-${obligation.obligationType}-${idx}`} className="p-2 border border-destructive/30 bg-destructive/5 rounded-md" data-testid={`alert-contract-${obligation.sessionId}-${idx}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{obligation.obligationType}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {obligation.animalName} {obligation.adopterName ? `- ${obligation.adopterName}` : ''}
                          </p>
                        </div>
                        <Badge variant="destructive" className="shrink-0">
                          {obligation.daysOverdue}d overdue
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="missed" className="mt-3 space-y-2">
              {(data?.missedConfirmations || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No missed confirmations</span>
                </div>
              ) : (
                (data?.missedConfirmations || []).slice(0, 3).map((missed) => (
                  <div key={missed.id} className="p-2 border border-destructive/30 bg-destructive/5 rounded-md" data-testid={`alert-missed-${missed.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{missed.medicationName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {missed.animalName} - {missed.adopterName || missed.adopterEmail}
                        </p>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {missed.daysOverdue}d overdue
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="at-risk" className="mt-3 space-y-2">
              {(data?.atRiskAdopters || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No at-risk adopters</span>
                </div>
              ) : (
                (data?.atRiskAdopters || []).slice(0, 3).map((adopter, idx) => (
                  <div key={adopter.email || idx} className="p-2 border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 rounded-md" data-testid={`alert-at-risk-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{adopter.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{adopter.email}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {adopter.items.slice(0, 2).map((item, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {item.animalName}: {item.medicationName}
                            </Badge>
                          ))}
                          {adopter.items.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{adopter.items.length - 2} more</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {adopter.missedCount} missed
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-3 space-y-2">
              {(data?.upcomingDeadlines || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No upcoming deadlines this week</span>
                </div>
              ) : (
                (data?.upcomingDeadlines || []).slice(0, 3).map((deadline, idx) => (
                  <div key={`${deadline.animalId}-${deadline.obligationType}-${idx}`} className="p-2 border border-orange-300/50 bg-orange-50 dark:bg-orange-950/20 rounded-md" data-testid={`alert-upcoming-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{deadline.obligationType}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {deadline.animalName} {deadline.adopterName ? `- ${deadline.adopterName}` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {new Date(deadline.dueDate).toLocaleDateString()}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="alumni" className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name, microchip, or email..."
                  value={alumniSearch}
                  onChange={(e) => setAlumniSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAlumniSearch()}
                  className="text-sm"
                  data-testid="input-alumni-search"
                />
                <Button size="icon" variant="ghost" onClick={handleAlumniSearch} data-testid="button-alumni-search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {renderAlumniResults(alumniData?.results || [], alumniLoading)}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link href="/dashboard/adopter-compliance" className="w-full">
          <Button variant="ghost" size="sm" className="w-full justify-between" data-testid="button-view-full-compliance">
            View Full Adopter Compliance
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

function renderAlumniResults(results: AlumniResult[], isLoading: boolean) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">No alumni found. Try a different search.</p>
    );
  }

  return results.slice(0, 3).map((result) => (
    <div key={result.adoptionId} className="p-2 border rounded-md" data-testid={`alumni-result-${result.adoptionId}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{result.animalName}</p>
          <p className="text-xs text-muted-foreground truncate">
            Adopted by {result.adopterName} on {new Date(result.adoptionDate).toLocaleDateString()}
          </p>
          {result.microchip && (
            <p className="text-xs text-muted-foreground">Microchip: {result.microchip.number}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="secondary" className="text-xs">{result.animalSpecies}</Badge>
          {result.contract?.contractPdfUrl && (
            <a
              href={result.contract.contractPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
              data-testid={`link-contract-pdf-${result.adoptionId}`}
            >
              View Contract
            </a>
          )}
        </div>
      </div>
    </div>
  ));
}
