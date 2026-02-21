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

interface ComplianceObligation {
  id: string;
  animalId: string;
  adopterName: string;
  adopterEmail: string;
  obligationType: string;
  label: string;
  contractualDueDate: string;
  notes: string | null;
  status: string;
  animalName: string;
  animalSpecies: string;
  daysOverdue: number;
  daysUntilDue: number;
}

interface AtRiskAdopter {
  name: string;
  email: string;
  overdueCount: number;
  obligations: ComplianceObligation[];
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
  overdue: ComplianceObligation[];
  upcoming: ComplianceObligation[];
  ongoingTreatments: ComplianceObligation[];
  customObligations: ComplianceObligation[];
  completed: ComplianceObligation[];
  waived: ComplianceObligation[];
  atRiskAdopters: AtRiskAdopter[];
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
  const totalIssues = (stats?.totalOverdue || 0) + (stats?.atRiskCount || 0);
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
          <Tabs defaultValue="overdue" className="w-full">
            <TabsList className="w-full grid grid-cols-5 h-auto">
              <TabsTrigger value="overdue" className="text-xs py-1.5 px-1" data-testid="tab-overdue">
                <span className="flex items-center gap-0.5">
                  <FileText className="h-3 w-3" />
                  <span className="hidden sm:inline">Overdue</span>
                  {(data?.overdue.length || 0) > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.overdue.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="text-xs py-1.5 px-1" data-testid="tab-upcoming">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">Upcoming</span>
                  {(data?.upcoming.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.upcoming.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="ongoing" className="text-xs py-1.5 px-1" data-testid="tab-ongoing">
                <span className="flex items-center gap-0.5">
                  <ClipboardCheck className="h-3 w-3" />
                  <span className="hidden sm:inline">Ongoing</span>
                  {(data?.ongoingTreatments.length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-xs">
                      {data?.ongoingTreatments.length}
                    </Badge>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="at-risk" className="text-xs py-1.5 px-1" data-testid="tab-at-risk">
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
              <TabsTrigger value="alumni" className="text-xs py-1.5 px-1" data-testid="tab-alumni">
                <span className="flex items-center gap-0.5">
                  <Search className="h-3 w-3" />
                  <span className="hidden sm:inline">Alumni</span>
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overdue" className="mt-3 space-y-2">
              {(data?.overdue || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No overdue obligations</span>
                </div>
              ) : (
                (data?.overdue || []).slice(0, 3).map((obligation, idx) => (
                  <div key={obligation.id} className="p-2 border border-destructive/30 bg-destructive/5 rounded-md" data-testid={`alert-overdue-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{obligation.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {obligation.animalName} - {obligation.adopterName}
                        </p>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {obligation.daysOverdue}d overdue
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-3 space-y-2">
              {(data?.upcoming || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No upcoming obligations</span>
                </div>
              ) : (
                (data?.upcoming || []).slice(0, 3).map((obligation, idx) => (
                  <div key={obligation.id} className="p-2 border border-orange-300/50 bg-orange-50 dark:bg-orange-950/20 rounded-md" data-testid={`alert-upcoming-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{obligation.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {obligation.animalName} - {obligation.adopterName}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {obligation.daysUntilDue}d due
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="ongoing" className="mt-3 space-y-2">
              {(data?.ongoingTreatments || []).length === 0 ? (
                <div className="flex items-center justify-center py-4 text-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-muted-foreground">No ongoing treatments</span>
                </div>
              ) : (
                (data?.ongoingTreatments || []).slice(0, 3).map((obligation, idx) => (
                  <div key={obligation.id} className="p-2 border border-blue-300/50 bg-blue-50 dark:bg-blue-950/20 rounded-md" data-testid={`alert-ongoing-${idx}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{obligation.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {obligation.animalName} - {obligation.adopterName}
                        </p>
                      </div>
                      {obligation.daysUntilDue > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          {obligation.daysUntilDue}d due
                        </Badge>
                      )}
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
                          {adopter.obligations.slice(0, 2).map((obligation, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {obligation.animalName}: {obligation.label}
                            </Badge>
                          ))}
                          {adopter.obligations.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{adopter.obligations.length - 2} more</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {adopter.overdueCount} overdue
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
