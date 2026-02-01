import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PipelineTab = "adoptions" | "fosters" | "volunteers" | "intake";

interface PipelineManagerProps {
  activeTab?: PipelineTab;
  onTabChange?: (tab: PipelineTab) => void;
  permissions?: {
    canViewAdoptions?: boolean;
    canViewFosters?: boolean;
    canViewVolunteers?: boolean;
    canViewIntake?: boolean;
  };
}
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Heart, 
  Home, 
  Users, 
  Dog,
  ArrowRight,
  ChevronRight,
  Zap
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useTenant } from "@/contexts/TenantContext";

// Tab-specific badge colors for count badges in tabs
const pipelineBadgeColors: Record<string, string> = {
  adoption: "bg-blue-600 dark:bg-blue-500 text-white",
  foster: "bg-amber-600 dark:bg-amber-500 text-white",
  volunteer: "bg-emerald-600 dark:bg-emerald-500 text-white",
  intake: "bg-red-600 dark:bg-red-500 text-white",
};
import { useAuth } from "@/contexts/AuthContext";
import ApplicationDetailSheet, { 
  ApplicationType, 
  ApplicationData 
} from "./ApplicationDetailSheet";

interface AdoptionApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  stage: "new" | "screening" | "vet_check" | "home_visit" | "approved" | "trial" | "adopted" | "denied" | "trial_failed";
  notes?: string;
  customResponses?: Record<string, any>;
  smsConsent?: boolean;
  createdAt: string;
  animal?: {
    id: string;
    name: string;
  };
}

interface FosterApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  address?: string;
  housingType?: string;
  hasYard?: boolean;
  hasOtherPets?: boolean;
  otherPetsDetails?: string;
  experience?: string;
  availability?: string;
  status: "pending" | "approved" | "rejected";
  pipelineStatus?: "new_app" | "interview" | "home_check" | "orientation" | "agreement" | "active_pool" | "rejected";
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

interface VolunteerApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  address?: string;
  experience?: string;
  availability?: string;
  interests?: string;
  skills?: string;
  status: "pending" | "approved" | "rejected";
  pipelineStatus?: string;
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

interface SurrenderRequest {
  id: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
  dogBreed?: string;
  dogAge?: string;
  dogGender?: string;
  spayedNeutered?: boolean;
  goodWithKids?: string;
  goodWithDogs?: string;
  goodWithCats?: string;
  reasonForSurrender: string;
  medicalIssues?: string;
  behavioralIssues?: string;
  status: "new" | "review" | "spacecheck" | "waitlist" | "scheduled" | "intaken" | "declined";
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

const adoptionStages = ["new", "screening", "vet_check", "home_visit", "approved", "trial"] as const;
const fosterPipelineStatuses = ["new_app", "interview", "home_check", "orientation", "agreement", "active_pool"] as const;
const volunteerPipelineStatuses = ["new_applicant", "orientation_scheduled", "waiver_needed", "active_pool"] as const;
const surrenderStatuses = ["new", "review", "spacecheck", "waitlist", "scheduled"] as const;

const stageLabels: Record<string, string> = {
  new: "New",
  screening: "Screening",
  vet_check: "Vet Check",
  home_visit: "Home Visit",
  approved: "Approved",
  trial: "Trial",
  adopted: "Adopted",
  denied: "Denied",
  trial_failed: "Trial Failed",
  pending: "Pending",
  rejected: "Rejected",
  review: "Review",
  spacecheck: "Space Check",
  waitlist: "Waitlist",
  scheduled: "Scheduled",
  intaken: "Intaken",
  declined: "Declined",
  // Foster pipeline stages
  new_app: "New App",
  interview: "Interview",
  home_check: "Home Check",
  orientation: "Orientation",
  agreement: "Agreement",
  active_pool: "Active Pool",
  // Volunteer pipeline stages
  new_applicant: "New Applicant",
  orientation_scheduled: "Orientation Scheduled",
  waiver_needed: "Waiver Needed",
};


interface PipelineItemData {
  id: string;
  name: string;
  context?: string;
  status: string;
  createdAt: string;
}

interface PipelineItemProps extends PipelineItemData {
  pipelineType: string;
  onClick: () => void;
}

function PipelineItem({ id, name, context, status, createdAt, pipelineType, onClick }: PipelineItemProps) {
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: false });
  const statusLabel = stageLabels[status] || status;
  
  return (
    <div 
      className="p-3 rounded-md bg-card border shadow-sm hover-elevate cursor-pointer flex items-center justify-between gap-2"
      data-testid={`pipeline-item-${pipelineType}-${id}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate" data-testid={`text-name-${pipelineType}-${id}`}>{name}</div>
        <div className="flex items-center gap-2 mt-1">
          <Badge 
            variant="secondary" 
            className={`text-xs ${pipelineBadgeColors[pipelineType] || ''}`}
            data-testid={`badge-status-${pipelineType}-${id}`}
          >
            {statusLabel}
          </Badge>
          <span className="text-xs text-muted-foreground" data-testid={`text-context-${pipelineType}-${id}`}>
            {context || `${timeAgo} ago`}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </div>
  );
}

interface StatusColumnProps {
  status: string;
  items: PipelineItemData[];
  pipelineType: string;
  onItemClick: (id: string) => void;
}

interface StatusColumnWithChevronProps extends StatusColumnProps {
  showChevron: boolean;
  triggersAutomation?: boolean;
}

function StatusColumn({ status, items, pipelineType, onItemClick, showChevron, triggersAutomation }: StatusColumnWithChevronProps) {
  const filteredItems = items.filter(item => item.status === status);
  
  return (
    <div className="flex items-stretch" data-testid={`status-column-wrapper-${pipelineType}-${status}`}>
      <div 
        className="flex-1 flex flex-col rounded-lg overflow-hidden border bg-card" 
        data-testid={`status-column-${pipelineType}-${status}`}
      >
        {/* Dark header matching reference image */}
        <div className="bg-slate-700 dark:bg-slate-800 text-white px-3 py-2 text-sm font-medium">
          {stageLabels[status] || status} <span className="opacity-80" data-testid={`text-count-${pipelineType}-${status}`}>({filteredItems.length})</span>
        </div>
        {/* Column body */}
        <div className="flex-1 p-2 space-y-2 min-h-[180px] bg-muted/20">
          {filteredItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6" data-testid={`empty-column-${pipelineType}-${status}`}>
              No applications
            </p>
          ) : (
            filteredItems.map((item) => (
              <PipelineItem 
                key={item.id} 
                {...item} 
                pipelineType={pipelineType} 
                onClick={() => onItemClick(item.id)}
              />
            ))
          )}
        </div>
      </div>
      {/* Chevron/automation indicator between columns */}
      {showChevron && (
        <div className="flex items-center justify-center px-1" title={triggersAutomation ? "Email automation triggers here" : undefined}>
          {triggersAutomation ? (
            <Zap className="h-5 w-5 text-amber-500" data-testid={`icon-automation-${pipelineType}-${status}`} />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}

export default function PipelineManager({ activeTab, onTabChange, permissions }: PipelineManagerProps) {
  const { user } = useAuth();
  const { basePath } = useTenant();
  
  // Extract permissions with defaults (all true if not specified for backwards compatibility)
  const canViewAdoptions = permissions?.canViewAdoptions ?? true;
  const canViewFosters = permissions?.canViewFosters ?? true;
  const canViewVolunteers = permissions?.canViewVolunteers ?? true;
  const canViewIntake = permissions?.canViewIntake ?? true;
  
  // Determine available tabs based on permissions
  const availableTabs: PipelineTab[] = [];
  if (canViewAdoptions) availableTabs.push("adoptions");
  if (canViewFosters) availableTabs.push("fosters");
  if (canViewVolunteers) availableTabs.push("volunteers");
  if (canViewIntake) availableTabs.push("intake");
  
  // Default to first available tab
  const defaultTab = activeTab && availableTabs.includes(activeTab) ? activeTab : availableTabs[0] || "adoptions";
  const [currentTab, setCurrentTab] = useState<PipelineTab>(defaultTab);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ApplicationType>("adoption");
  const [selectedData, setSelectedData] = useState<ApplicationData | null>(null);

  // Sync internal state with prop when it changes
  useEffect(() => {
    if (activeTab && activeTab !== currentTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    const tab = value as PipelineTab;
    setCurrentTab(tab);
    onTabChange?.(tab);
  };

  // Standard admin/staff roles that always have access
  const hasAdminLikeRole = !!user && ['admin', 'owner', 'board_member', 'staff', 'intake_coordinator'].includes(user.activeRole || '');
  
  const { data: adoptionsData, isLoading: adoptionsLoading } = useQuery<{ applications: AdoptionApplication[] }>({
    queryKey: ['/api/applications'],
    enabled: hasAdminLikeRole || canViewAdoptions,
  });

  const { data: fostersData, isLoading: fostersLoading } = useQuery<{ applications: FosterApplication[] }>({
    queryKey: ['/api/foster-applications'],
    enabled: hasAdminLikeRole || canViewFosters,
  });

  const { data: volunteersData, isLoading: volunteersLoading } = useQuery<{ applications: VolunteerApplication[] }>({
    queryKey: ['/api/volunteer-applications'],
    enabled: hasAdminLikeRole || canViewVolunteers,
  });

  const { data: intakes, isLoading: intakesLoading } = useQuery<SurrenderRequest[]>({
    queryKey: ['/api/surrender-requests'],
    enabled: hasAdminLikeRole || canViewIntake,
  });

  // Extract arrays from wrapped responses
  const adoptions = adoptionsData?.applications;
  const fosters = fostersData?.applications;
  const volunteers = volunteersData?.applications;

  const isLoading = adoptionsLoading || fostersLoading || volunteersLoading || intakesLoading;

  const handleItemClick = (type: ApplicationType, id: string) => {
    let data: ApplicationData | null = null;
    
    if (type === "adoption") {
      const app = adoptions?.find(a => a.id === id);
      if (app) {
        data = {
          id: app.id,
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          stage: app.stage,
          notes: app.notes,
          customResponses: app.customResponses,
          smsConsent: app.smsConsent,
          createdAt: app.createdAt,
          animal: app.animal,
        };
      }
    } else if (type === "foster") {
      const app = fosters?.find(f => f.id === id);
      if (app) {
        data = {
          id: app.id,
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          address: app.address,
          housingType: app.housingType,
          hasYard: app.hasYard,
          hasOtherPets: app.hasOtherPets,
          otherPetsDetails: app.otherPetsDetails,
          experience: app.experience,
          availability: app.availability,
          status: app.status,
          pipelineStatus: app.pipelineStatus,
          notes: app.notes,
          smsConsent: app.smsConsent,
          createdAt: app.createdAt,
        };
      }
    } else if (type === "volunteer") {
      const app = volunteers?.find(v => v.id === id);
      if (app) {
        data = {
          id: app.id,
          applicantName: app.applicantName,
          applicantEmail: app.applicantEmail,
          applicantPhone: app.applicantPhone,
          address: app.address,
          experience: app.experience,
          availability: app.availability,
          interests: app.interests,
          skills: app.skills,
          status: app.status,
          pipelineStatus: app.pipelineStatus,
          notes: app.notes,
          smsConsent: app.smsConsent,
          createdAt: app.createdAt,
        };
      }
    } else if (type === "intake") {
      const app = intakes?.find(i => i.id === id);
      if (app) {
        data = {
          id: app.id,
          ownerName: app.ownerName,
          ownerEmail: app.ownerEmail,
          ownerPhone: app.ownerPhone,
          dogName: app.dogName,
          dogBreed: app.dogBreed,
          dogAge: app.dogAge,
          dogGender: app.dogGender,
          spayedNeutered: app.spayedNeutered,
          goodWithKids: app.goodWithKids,
          goodWithDogs: app.goodWithDogs,
          goodWithCats: app.goodWithCats,
          reasonForSurrender: app.reasonForSurrender,
          medicalIssues: app.medicalIssues,
          behavioralIssues: app.behavioralIssues,
          status: app.status,
          notes: app.notes,
          smsConsent: app.smsConsent,
          createdAt: app.createdAt,
        };
      }
    }

    if (data) {
      setSelectedType(type);
      setSelectedData(data);
      setSheetOpen(true);
    }
  };

  const activeAdoptions = (adoptions || [])
    .filter(a => !['adopted', 'denied', 'trial_failed'].includes(a.stage));

  const adoptionItems: PipelineItemData[] = activeAdoptions.map(a => ({
    id: a.id,
    name: a.applicantName,
    context: a.animal?.name ? `for ${a.animal.name}` : undefined,
    status: a.stage,
    createdAt: a.createdAt,
  }));

  // Valid foster pipeline stages - unrecognized statuses default to 'new_app' to prevent vanishing
  const validFosterStages = ['new_app', 'interview', 'home_check', 'orientation', 'agreement', 'active_pool', 'rejected'];
  const fosterItems: PipelineItemData[] = (fosters || []).map(f => {
    let status = f.pipelineStatus || (f.status === 'pending' ? 'new_app' : f.status === 'approved' ? 'active_pool' : f.status);
    // Fallback unrecognized statuses to 'new_app' so they don't disappear
    if (!validFosterStages.includes(status)) {
      status = 'new_app';
    }
    return {
      id: f.id,
      name: f.applicantName,
      status,
      createdAt: f.createdAt,
    };
  });

  const volunteerItems: PipelineItemData[] = (volunteers || []).map(v => ({
    id: v.id,
    name: v.applicantName,
    status: v.pipelineStatus || (v.status === 'pending' ? 'new_applicant' : v.status === 'approved' ? 'active_pool' : v.status),
    createdAt: v.createdAt,
  }));

  const activeIntakes = (intakes || [])
    .filter(i => !['intaken', 'declined'].includes(i.status));

  const intakeItems: PipelineItemData[] = activeIntakes.map(i => ({
    id: i.id,
    name: i.ownerName,
    context: i.dogName,
    status: i.status,
    createdAt: i.createdAt,
  }));

  // Count ALL active workload items for each pipeline (excludes only completed/final statuses)
  // These must match the KPI endpoint logic in /api/dashboard/action-items-count
  const completedAdoptionStatuses = ['adopted', 'denied', 'trial_failed'];
  const completedIntakeStatuses = ['intaken'];
  
  const activeAdoptionsCount = adoptionItems.filter(a => !completedAdoptionStatuses.includes(a.status)).length;
  const activeFostersCount = fosterItems.filter(f => f.status !== 'rejected' && f.status !== 'active_pool').length;
  const activeVolunteersCount = volunteerItems.filter(v => v.status !== 'rejected' && v.status !== 'active_pool').length;
  const activeIntakesCount = intakeItems.filter(i => !completedIntakeStatuses.includes(i.status)).length;

  if (isLoading) {
    return (
      <Card data-testid="pipeline-manager-skeleton">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="pipeline-manager">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Pipeline Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`w-full h-auto flex flex-wrap ${availableTabs.length === 1 ? '' : availableTabs.length === 2 ? 'sm:grid sm:grid-cols-2' : availableTabs.length === 3 ? 'sm:grid sm:grid-cols-3' : 'sm:grid sm:grid-cols-4'} mb-4 gap-1`} data-testid="pipeline-tabs">
              {canViewAdoptions && (
                <TabsTrigger value="adoptions" className="text-xs sm:text-sm" data-testid="tab-adoptions">
                  <Heart className="h-3 w-3 mr-1 hidden sm:inline" />
                  Adoptions
                  {activeAdoptionsCount > 0 ? (
                    <Badge className={`ml-1 h-5 px-1.5 text-xs ${pipelineBadgeColors.adoption}`} data-testid="badge-count-adoptions">
                      ({activeAdoptionsCount})
                    </Badge>
                  ) : (
                    <span className="ml-1 text-xs text-muted-foreground" data-testid="badge-count-adoptions">(0)</span>
                  )}
                </TabsTrigger>
              )}
              {canViewFosters && (
                <TabsTrigger value="fosters" className="text-xs sm:text-sm" data-testid="tab-fosters">
                  <Home className="h-3 w-3 mr-1 hidden sm:inline" />
                  Fosters
                  {activeFostersCount > 0 ? (
                    <Badge className={`ml-1 h-5 px-1.5 text-xs ${pipelineBadgeColors.foster}`} data-testid="badge-count-fosters">
                      ({activeFostersCount})
                    </Badge>
                  ) : (
                    <span className="ml-1 text-xs text-muted-foreground" data-testid="badge-count-fosters">(0)</span>
                  )}
                </TabsTrigger>
              )}
              {canViewVolunteers && (
                <TabsTrigger value="volunteers" className="text-xs sm:text-sm" data-testid="tab-volunteers">
                  <Users className="h-3 w-3 mr-1 hidden sm:inline" />
                  Volunteers
                  {activeVolunteersCount > 0 ? (
                    <Badge className={`ml-1 h-5 px-1.5 text-xs ${pipelineBadgeColors.volunteer}`} data-testid="badge-count-volunteers">
                      ({activeVolunteersCount})
                    </Badge>
                  ) : (
                    <span className="ml-1 text-xs text-muted-foreground" data-testid="badge-count-volunteers">(0)</span>
                  )}
                </TabsTrigger>
              )}
              {canViewIntake && (
                <TabsTrigger value="intake" className="text-xs sm:text-sm" data-testid="tab-intake">
                  <Dog className="h-3 w-3 mr-1 hidden sm:inline" />
                  Intake
                  {activeIntakesCount > 0 ? (
                    <Badge className={`ml-1 h-5 px-1.5 text-xs ${pipelineBadgeColors.intake}`} data-testid="badge-count-intake">
                      ({activeIntakesCount})
                    </Badge>
                  ) : (
                    <span className="ml-1 text-xs text-muted-foreground" data-testid="badge-count-intake">(0)</span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {canViewAdoptions && (
              <TabsContent value="adoptions" data-testid="content-adoptions">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-muted-foreground">Adoption Applications</span>
                <Link href="/dashboard/applications" className="text-xs text-muted-foreground hover-elevate flex items-center gap-1" data-testid="link-view-all-adoptions">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <ScrollArea className="h-[280px]">
                {adoptionItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-adoptions">
                    <Heart className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-adoptions">No active adoption applications</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 lg:hidden">
                      {adoptionItems.map((item) => (
                        <PipelineItem 
                          key={item.id} 
                          {...item} 
                          pipelineType="adoption" 
                          onClick={() => handleItemClick("adoption", item.id)}
                        />
                      ))}
                    </div>
                    <div className="hidden lg:flex lg:items-stretch">
                      {adoptionStages.map((stage, index) => (
                        <div key={stage} className="min-w-[160px] flex-1">
                          <StatusColumn 
                            status={stage} 
                            items={adoptionItems} 
                            pipelineType="adoption"
                            onItemClick={(id) => handleItemClick("adoption", id)}
                            showChevron={index < adoptionStages.length - 1}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {canViewFosters && (
              <TabsContent value="fosters" data-testid="content-fosters">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-muted-foreground">Foster Applications</span>
                <Link href="/dashboard/foster-pipeline" className="text-xs text-muted-foreground hover-elevate flex items-center gap-1" data-testid="link-view-all-fosters">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <ScrollArea className="h-[280px]">
                {fosterItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-fosters">
                    <Home className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-fosters">No foster applications</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 lg:hidden">
                      {fosterItems.map((item) => (
                        <PipelineItem 
                          key={item.id} 
                          {...item} 
                          pipelineType="foster"
                          onClick={() => handleItemClick("foster", item.id)}
                        />
                      ))}
                    </div>
                    <div className="hidden lg:flex lg:items-stretch">
                      {fosterPipelineStatuses.map((status, index) => (
                        <div key={status} className="min-w-[140px] flex-1">
                          <StatusColumn 
                            status={status} 
                            items={fosterItems} 
                            pipelineType="foster"
                            onItemClick={(id) => handleItemClick("foster", id)}
                            showChevron={index < fosterPipelineStatuses.length - 1}
                            triggersAutomation={status === "orientation"}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {canViewVolunteers && (
              <TabsContent value="volunteers" data-testid="content-volunteers">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-muted-foreground">Volunteer Applications</span>
                <Link href="/dashboard/volunteer-pipeline" className="text-xs text-muted-foreground hover-elevate flex items-center gap-1" data-testid="link-view-all-volunteers">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <ScrollArea className="h-[280px]">
                {volunteerItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-volunteers">
                    <Users className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-volunteers">No volunteer applications</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 lg:hidden">
                      {volunteerItems.map((item) => (
                        <PipelineItem 
                          key={item.id} 
                          {...item} 
                          pipelineType="volunteer"
                          onClick={() => handleItemClick("volunteer", item.id)}
                        />
                      ))}
                    </div>
                    <div className="hidden lg:flex lg:items-stretch">
                      {volunteerPipelineStatuses.map((status, index) => (
                        <div key={status} className="min-w-[180px] flex-1">
                          <StatusColumn 
                            status={status} 
                            items={volunteerItems} 
                            pipelineType="volunteer"
                            onItemClick={(id) => handleItemClick("volunteer", id)}
                            showChevron={index < volunteerPipelineStatuses.length - 1}
                            triggersAutomation={status === "orientation_scheduled"}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>
            )}

            {canViewIntake && (
              <TabsContent value="intake" data-testid="content-intake">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-muted-foreground">Intake Requests</span>
                <Link href="/dashboard/intake" className="text-xs text-muted-foreground hover-elevate flex items-center gap-1" data-testid="link-view-all-intake">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <ScrollArea className="h-[280px]">
                {intakeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-intake">
                    <Dog className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-intake">No active intake requests</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 lg:hidden">
                      {intakeItems.map((item) => (
                        <PipelineItem 
                          key={item.id} 
                          {...item} 
                          pipelineType="intake"
                          onClick={() => handleItemClick("intake", item.id)}
                        />
                      ))}
                    </div>
                    <div className="hidden lg:flex lg:items-stretch">
                      {surrenderStatuses.map((status, index) => (
                        <div key={status} className="min-w-[160px] flex-1">
                          <StatusColumn 
                            status={status} 
                            items={intakeItems} 
                            pipelineType="intake"
                            onItemClick={(id) => handleItemClick("intake", id)}
                            showChevron={index < surrenderStatuses.length - 1}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ScrollArea>
            </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <ApplicationDetailSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        type={selectedType}
        data={selectedData}
      />
    </>
  );
}
