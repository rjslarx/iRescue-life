import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { 
  ClipboardList, 
  Heart, 
  Home, 
  Users,
  Mail,
  Phone,
  ChevronRight,
  Clock,
  PawPrint,
  HandHeart,
  FileText
} from "lucide-react";
import { useState } from "react";
import { ApplicationDetailsDialog } from "./ApplicationDetailsDialog";

export interface PendingApplication {
  id: string;
  type: 'adoption' | 'foster' | 'volunteer' | 'surrender' | 'custom';
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  status: string;
  createdAt: string;
  animalName?: string;
  animalId?: string;
  formData?: Record<string, any>;
  formName?: string;
}

interface PendingApplicationsResponse {
  applications: PendingApplication[];
  counts: {
    adoption: number;
    foster: number;
    volunteer: number;
    surrender: number;
    custom: number;
    total: number;
  };
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'adoption':
      return <Heart className="h-4 w-4 text-pink-500" />;
    case 'foster':
      return <Home className="h-4 w-4 text-blue-500" />;
    case 'volunteer':
      return <Users className="h-4 w-4 text-green-500" />;
    case 'surrender':
      return <HandHeart className="h-4 w-4 text-orange-500" />;
    case 'custom':
      return <FileText className="h-4 w-4 text-purple-500" />;
    default:
      return <ClipboardList className="h-4 w-4 text-muted-foreground" />;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'adoption':
      return 'Adoption';
    case 'foster':
      return 'Foster';
    case 'volunteer':
      return 'Volunteer';
    case 'surrender':
      return 'Surrender';
    case 'custom':
      return 'Form';
    default:
      return type;
  }
}

function getTypeBadgeVariant(type: string): "default" | "secondary" | "outline" {
  switch (type) {
    case 'adoption':
      return 'default';
    case 'foster':
      return 'secondary';
    case 'volunteer':
      return 'outline';
    case 'surrender':
      return 'secondary';
    case 'custom':
      return 'outline';
    default:
      return 'outline';
  }
}

function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    new: 'New',
    pending: 'New',
    new_app: 'New',
    screening: 'Screening',
    vet_check: 'Vet Check',
    home_visit: 'Home Visit',
    home_check: 'Home Check',
    interview: 'Interview',
    orientation: 'Orientation',
    agreement: 'Agreement',
    new_applicant: 'New',
    orientation_scheduled: 'Orientation',
    waiver_needed: 'Waiver',
  };
  return statusMap[status] || status;
}

export default function PendingApplicationsWidget() {
  const [selectedApplication, setSelectedApplication] = useState<PendingApplication | null>(null);
  const [filter, setFilter] = useState<'all' | 'adoption' | 'foster' | 'volunteer' | 'surrender' | 'custom'>('all');

  const { data, isLoading, error } = useQuery<PendingApplicationsResponse>({
    queryKey: ['/api/dashboard/pending-applications'],
  });

  const filteredApplications = data?.applications.filter(app => 
    filter === 'all' || app.type === filter
  ) || [];

  if (isLoading) {
    return (
      <Card data-testid="card-pending-applications-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-pending-applications-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Pending Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load applications</p>
        </CardContent>
      </Card>
    );
  }

  const counts = data?.counts || { adoption: 0, foster: 0, volunteer: 0, surrender: 0, custom: 0, total: 0 };

  return (
    <>
      <Card data-testid="card-pending-applications">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Pending Applications
              </CardTitle>
              <CardDescription>Review and manage incoming applications</CardDescription>
            </div>
            {counts.total > 0 && (
              <Badge variant="secondary" className="text-base" data-testid="badge-total-count">
                {counts.total}
              </Badge>
            )}
          </div>
          
          {counts.total > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
                data-testid="button-filter-all"
              >
                All ({counts.total})
              </Button>
              {counts.adoption > 0 && (
                <Button
                  variant={filter === 'adoption' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('adoption')}
                  data-testid="button-filter-adoption"
                >
                  <Heart className="h-3 w-3 mr-1" />
                  Adoptions ({counts.adoption})
                </Button>
              )}
              {counts.foster > 0 && (
                <Button
                  variant={filter === 'foster' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('foster')}
                  data-testid="button-filter-foster"
                >
                  <Home className="h-3 w-3 mr-1" />
                  Fosters ({counts.foster})
                </Button>
              )}
              {counts.volunteer > 0 && (
                <Button
                  variant={filter === 'volunteer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('volunteer')}
                  data-testid="button-filter-volunteer"
                >
                  <Users className="h-3 w-3 mr-1" />
                  Volunteers ({counts.volunteer})
                </Button>
              )}
              {counts.surrender > 0 && (
                <Button
                  variant={filter === 'surrender' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('surrender')}
                  data-testid="button-filter-surrender"
                >
                  <HandHeart className="h-3 w-3 mr-1" />
                  Surrenders ({counts.surrender})
                </Button>
              )}
              {counts.custom > 0 && (
                <Button
                  variant={filter === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('custom')}
                  data-testid="button-filter-custom"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Forms ({counts.custom})
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {filteredApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {counts.total === 0 
                  ? "No pending applications" 
                  : `No ${filter} applications`}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-3">
                {filteredApplications.map((app) => (
                  <div
                    key={`${app.type}-${app.id}`}
                    className="p-3 rounded-lg border hover-elevate cursor-pointer"
                    onClick={() => setSelectedApplication(app)}
                    data-testid={`application-row-${app.type}-${app.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getTypeIcon(app.type)}
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-applicant-name-${app.id}`}>
                            {app.applicantName}
                          </p>
                          {(app.type === 'adoption' || app.type === 'surrender') && app.animalName && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <PawPrint className="h-3 w-3" />
                              {app.type === 'surrender' ? 'Pet: ' : 'For: '}{app.animalName}
                            </p>
                          )}
                          {app.type === 'custom' && app.formName && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {app.formName}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={getTypeBadgeVariant(app.type)} data-testid={`badge-type-${app.id}`}>
                          {getTypeLabel(app.type)}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1" data-testid={`text-time-${app.id}`}>
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true })}
                      </span>
                      <Badge variant="outline" className="text-xs" data-testid={`badge-status-${app.id}`}>
                        {getStatusLabel(app.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <ApplicationDetailsDialog
        application={selectedApplication}
        open={!!selectedApplication}
        onOpenChange={(open) => !open && setSelectedApplication(null)}
      />
    </>
  );
}
