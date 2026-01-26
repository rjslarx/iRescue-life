import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Heart, 
  Home, 
  Users, 
  Dog
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface AdoptionApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  stage: "new" | "screening" | "vet_check" | "home_visit" | "approved" | "trial" | "adopted" | "denied" | "trial_failed";
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
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface VolunteerApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface SurrenderRequest {
  id: string;
  ownerName: string;
  ownerEmail: string;
  dogName: string;
  status: "new" | "review" | "spacecheck" | "waitlist" | "scheduled" | "intaken" | "declined";
  createdAt: string;
}

const adoptionStages = ["new", "screening", "vet_check", "home_visit", "approved", "trial"] as const;
const fosterVolunteerStatuses = ["pending", "approved", "rejected"] as const;
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
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const stageVariants: Record<string, BadgeVariant> = {
  new: "default",
  screening: "secondary",
  vet_check: "secondary",
  home_visit: "secondary",
  approved: "default",
  trial: "secondary",
  adopted: "default",
  denied: "destructive",
  trial_failed: "destructive",
  pending: "secondary",
  rejected: "destructive",
  review: "secondary",
  spacecheck: "secondary",
  waitlist: "outline",
  scheduled: "default",
  intaken: "default",
  declined: "destructive",
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
}

function PipelineItem({ id, name, context, status, createdAt, pipelineType }: PipelineItemProps) {
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: false });
  
  return (
    <div 
      className="flex items-center justify-between p-3 rounded-lg border bg-card"
      data-testid={`pipeline-item-${pipelineType}-${id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm" data-testid={`text-name-${pipelineType}-${id}`}>{name}</span>
          {context && (
            <span className="text-sm text-muted-foreground" data-testid={`text-context-${pipelineType}-${id}`}>({context})</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-time-${pipelineType}-${id}`}>{timeAgo}</span>
        <Badge 
          variant={stageVariants[status] || "outline"} 
          data-testid={`badge-status-${pipelineType}-${id}`}
        >
          {stageLabels[status] || status}
        </Badge>
      </div>
    </div>
  );
}

interface StatusColumnProps {
  status: string;
  items: PipelineItemData[];
  pipelineType: string;
}

function StatusColumn({ status, items, pipelineType }: StatusColumnProps) {
  const filteredItems = items.filter(item => item.status === status);
  
  if (filteredItems.length === 0) return null;
  
  return (
    <div className="space-y-2" data-testid={`status-column-${pipelineType}-${status}`}>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={stageVariants[status] || "outline"}>
          {stageLabels[status] || status}
        </Badge>
        <span className="text-xs text-muted-foreground" data-testid={`text-count-${pipelineType}-${status}`}>
          ({filteredItems.length})
        </span>
      </div>
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <PipelineItem key={item.id} {...item} pipelineType={pipelineType} />
        ))}
      </div>
    </div>
  );
}

export default function PipelineManager() {
  const { user } = useAuth();

  const { data: adoptions, isLoading: adoptionsLoading } = useQuery<AdoptionApplication[]>({
    queryKey: ['/api/applications'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const { data: fosters, isLoading: fostersLoading } = useQuery<FosterApplication[]>({
    queryKey: ['/api/foster-applications'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const { data: volunteers, isLoading: volunteersLoading } = useQuery<VolunteerApplication[]>({
    queryKey: ['/api/volunteer-applications'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const { data: intakes, isLoading: intakesLoading } = useQuery<SurrenderRequest[]>({
    queryKey: ['/api/surrender-requests'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const isLoading = adoptionsLoading || fostersLoading || volunteersLoading || intakesLoading;

  const adoptionItems: PipelineItemData[] = (adoptions || [])
    .filter(a => !['adopted', 'denied', 'trial_failed'].includes(a.stage))
    .map(a => ({
      id: a.id,
      name: a.applicantName,
      context: a.animal?.name ? `for ${a.animal.name}` : undefined,
      status: a.stage,
      createdAt: a.createdAt,
    }));

  const fosterItems: PipelineItemData[] = (fosters || []).map(f => ({
    id: f.id,
    name: f.applicantName,
    status: f.status,
    createdAt: f.createdAt,
  }));

  const volunteerItems: PipelineItemData[] = (volunteers || []).map(v => ({
    id: v.id,
    name: v.applicantName,
    status: v.status,
    createdAt: v.createdAt,
  }));

  const intakeItems: PipelineItemData[] = (intakes || [])
    .filter(i => !['intaken', 'declined'].includes(i.status))
    .map(i => ({
      id: i.id,
      name: i.ownerName,
      context: i.dogName,
      status: i.status,
      createdAt: i.createdAt,
    }));

  const activeAdoptions = adoptionItems.length;
  const activeFosters = fosterItems.filter(f => f.status === 'pending').length;
  const activeVolunteers = volunteerItems.filter(v => v.status === 'pending').length;
  const activeIntakes = intakeItems.length;

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
    <Card data-testid="pipeline-manager">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Pipeline Manager
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="adoptions" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4" data-testid="pipeline-tabs">
            <TabsTrigger value="adoptions" className="text-xs sm:text-sm" data-testid="tab-adoptions">
              <Heart className="h-3 w-3 mr-1 hidden sm:inline" />
              Adoptions
              {activeAdoptions > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs" data-testid="badge-count-adoptions">
                  {activeAdoptions}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="fosters" className="text-xs sm:text-sm" data-testid="tab-fosters">
              <Home className="h-3 w-3 mr-1 hidden sm:inline" />
              Fosters
              {activeFosters > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs" data-testid="badge-count-fosters">
                  {activeFosters}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="volunteers" className="text-xs sm:text-sm" data-testid="tab-volunteers">
              <Users className="h-3 w-3 mr-1 hidden sm:inline" />
              Volunteers
              {activeVolunteers > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs" data-testid="badge-count-volunteers">
                  {activeVolunteers}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="intake" className="text-xs sm:text-sm" data-testid="tab-intake">
              <Dog className="h-3 w-3 mr-1 hidden sm:inline" />
              Intake
              {activeIntakes > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs" data-testid="badge-count-intake">
                  {activeIntakes}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adoptions" data-testid="content-adoptions">
            <ScrollArea className="h-[300px]">
              {adoptionItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-adoptions">
                  <Heart className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-adoptions">No active adoption applications</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {adoptionItems.map((item) => (
                      <PipelineItem key={item.id} {...item} pipelineType="adoption" />
                    ))}
                  </div>
                  <div className="hidden lg:flex lg:flex-wrap lg:gap-4">
                    {adoptionStages.map(stage => (
                      <div key={stage} className="min-w-[200px] flex-1">
                        <StatusColumn status={stage} items={adoptionItems} pipelineType="adoption" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="fosters" data-testid="content-fosters">
            <ScrollArea className="h-[300px]">
              {fosterItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-fosters">
                  <Home className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-fosters">No foster applications</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {fosterItems.map((item) => (
                      <PipelineItem key={item.id} {...item} pipelineType="foster" />
                    ))}
                  </div>
                  <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
                    {fosterVolunteerStatuses.map(status => (
                      <StatusColumn key={status} status={status} items={fosterItems} pipelineType="foster" />
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="volunteers" data-testid="content-volunteers">
            <ScrollArea className="h-[300px]">
              {volunteerItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-volunteers">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-volunteers">No volunteer applications</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {volunteerItems.map((item) => (
                      <PipelineItem key={item.id} {...item} pipelineType="volunteer" />
                    ))}
                  </div>
                  <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
                    {fosterVolunteerStatuses.map(status => (
                      <StatusColumn key={status} status={status} items={volunteerItems} pipelineType="volunteer" />
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="intake" data-testid="content-intake">
            <ScrollArea className="h-[300px]">
              {intakeItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="empty-state-intake">
                  <Dog className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-intake">No active intake requests</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {intakeItems.map((item) => (
                      <PipelineItem key={item.id} {...item} pipelineType="intake" />
                    ))}
                  </div>
                  <div className="hidden lg:flex lg:flex-wrap lg:gap-4">
                    {surrenderStatuses.map(status => (
                      <div key={status} className="min-w-[180px] flex-1">
                        <StatusColumn status={status} items={intakeItems} pipelineType="intake" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
