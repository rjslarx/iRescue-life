import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileSignature, 
  Clock, 
  Loader2, 
  Calendar, 
  CheckCircle2, 
  UserCheck,
  XCircle,
  Send,
  Users,
  Eye,
  ArrowRight,
  Zap
} from "lucide-react";
import MobilePipelineView, { PipelineStage, PipelineCard } from "./MobilePipelineView";
import { useIsMobile } from "@/hooks/use-mobile";

interface WaiverStatus {
  formId?: string;
  signedAt?: string;
}

interface VolunteerApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  pipelineStatus: string;
  availability?: string;
  interests?: string;
  skills?: string;
  holdHarmlessFormId?: string | null;
  holdHarmlessSignedAt?: string | null;
  createdAt?: string;
}

interface VolunteerKanbanBoardProps {
  applications: VolunteerApplication[];
  onMoveApplication?: (applicationId: string, newStatus: string) => void;
  onSendWaiver?: (application: VolunteerApplication) => void;
  onViewApplication?: (application: VolunteerApplication) => void;
  sendingWaiverId?: string | null;
}

const stages: PipelineStage[] = [
  { id: "new_applicant", label: "New Applicant", color: "bg-blue-500", icon: Users },
  { id: "orientation_scheduled", label: "Orientation Scheduled", color: "bg-yellow-500", icon: Calendar },
  { id: "waiver_needed", label: "Waiver Needed", color: "bg-orange-500", icon: FileSignature },
  { id: "active_pool", label: "Active Pool", color: "bg-green-500", icon: UserCheck },
  { id: "rejected", label: "Rejected", color: "bg-red-500", icon: XCircle },
];

// Stages that trigger email automation when moving from them to the next stage
const automationTriggerStages = ["orientation_scheduled"];

function WaiverStatusBadge({ signedAt }: { signedAt?: string | null }) {
  if (signedAt) {
    return (
      <Badge variant="default" className="text-xs gap-1" data-testid="badge-waiver-signed">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span className="truncate">Signed</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1" data-testid="badge-waiver-pending">
      <FileSignature className="h-3 w-3 shrink-0" />
      <span className="truncate">Pending</span>
    </Badge>
  );
}

function VolunteerSkillsBadges({ app }: { app: VolunteerApplication }) {
  if (!app.interests && !app.skills) return null;

  const items: string[] = [];
  if (app.interests) items.push(...app.interests.split(',').map(s => s.trim()).slice(0, 2));
  if (app.skills) items.push(...app.skills.split(',').map(s => s.trim()).slice(0, 2));
  
  const uniqueItems = [...new Set(items)].slice(0, 3);
  if (uniqueItems.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {uniqueItems.map(item => (
        <Badge key={item} variant="outline" className="text-xs">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export default function VolunteerKanbanBoard({ 
  applications, 
  onMoveApplication, 
  onSendWaiver,
  onViewApplication,
  sendingWaiverId 
}: VolunteerKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const getApplicationsByStage = (stageId: string) => {
    return applications.filter(app => app.pipelineStatus === stageId);
  };

  const appToCard = (app: VolunteerApplication): PipelineCard => {
    const badges: Array<{ label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = [];
    
    if (app.holdHarmlessFormId) {
      if (app.holdHarmlessSignedAt) {
        badges.push({ label: "Waiver Signed", variant: "default" });
      } else {
        badges.push({ label: "Awaiting Waiver", variant: "outline" });
      }
    }

    if (app.pipelineStatus === "active_pool") {
      if (app.interests) {
        const firstInterest = app.interests.split(',')[0]?.trim();
        if (firstInterest) badges.push({ label: firstInterest, variant: "outline" });
      }
    }

    return {
      id: app.id,
      title: app.applicantName,
      subtitle: app.availability ? `Available: ${app.availability}` : app.applicantEmail,
      createdAt: app.createdAt,
      badges: badges.slice(0, 3),
    };
  };

  const getCardsByStage = (stageId: string): PipelineCard[] => {
    return getApplicationsByStage(stageId).map(appToCard);
  };

  const handleViewCard = (card: PipelineCard) => {
    const app = applications.find(a => a.id === card.id);
    if (app && onViewApplication) {
      onViewApplication(app);
    }
  };

  const handleMoveCard = (cardId: string, newStageId: string) => {
    if (onMoveApplication) {
      onMoveApplication(cardId, newStageId);
    }
  };

  if (isMobile) {
    return (
      <MobilePipelineView
        stages={stages}
        cards={applications.map(appToCard)}
        getCardsByStage={getCardsByStage}
        onMoveCard={onMoveApplication ? handleMoveCard : undefined}
        onViewCard={onViewApplication ? handleViewCard : undefined}
        emptyStateText="No applications"
      />
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div 
        className="grid gap-3"
        style={{ 
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        }}
      >
        {stages.map((stage) => {
          const stageApps = getApplicationsByStage(stage.id);
          const StageIcon = stage.icon;
          return (
            <div
              key={stage.id}
              className="flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) {
                  onMoveApplication?.(draggedId, stage.id);
                  setDraggedId(null);
                }
              }}
            >
              <Card>
                <CardHeader className="pb-3 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-1.5 min-w-0 flex-1">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${stage.color}`} />
                      <StageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{stage.label}</span>
                      {automationTriggerStages.includes(stage.id) && (
                        <Zap 
                          className="h-4 w-4 text-amber-500 shrink-0" 
                          title="Moving to next stage triggers email automation"
                          data-testid={`icon-automation-trigger-${stage.id}`}
                        />
                      )}
                    </CardTitle>
                    <Badge variant="secondary" className="shrink-0">{stageApps.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScrollArea className="h-[400px] pr-4">
                    {stageApps.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-md border-2 border-dashed text-sm text-muted-foreground">
                        No applications
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stageApps.map((app) => (
                          <Card
                            key={app.id}
                            draggable
                            onDragStart={() => setDraggedId(app.id)}
                            onDragEnd={() => setDraggedId(null)}
                            className="cursor-move hover-elevate"
                            data-testid={`card-volunteer-application-${app.id}`}
                          >
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{app.applicantName}</p>
                                </div>
                                <div className="flex flex-col gap-1 items-end shrink-0">
                                  {(stage.id === "waiver_needed" || stage.id === "active_pool") && app.holdHarmlessFormId && (
                                    <WaiverStatusBadge signedAt={app.holdHarmlessSignedAt} />
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p className="truncate">{app.applicantEmail}</p>
                                <p className="truncate">{app.applicantPhone}</p>
                                {app.availability && (
                                  <p className="truncate">Available: {app.availability}</p>
                                )}
                              </div>
                              
                              {stage.id === "active_pool" && (
                                <VolunteerSkillsBadges app={app} />
                              )}

                              {/* Stacked action buttons for reliable fit in narrow columns */}
                              <div className="flex flex-col gap-1.5 mt-3 pt-2 border-t">
                                {onViewApplication && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full justify-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewApplication(app);
                                    }}
                                    data-testid={`button-view-volunteer-application-${app.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                )}
                                {onMoveApplication && (
                                  <Select
                                    value={app.pipelineStatus}
                                    onValueChange={(newStage) => {
                                      if (newStage !== app.pipelineStatus) {
                                        onMoveApplication(app.id, newStage);
                                      }
                                    }}
                                  >
                                    <SelectTrigger 
                                      className="h-8 text-xs w-full"
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`select-volunteer-stage-${app.id}`}
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" />
                                      <span className="truncate">Move to...</span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {stages.filter(s => s.id !== app.pipelineStatus).map((s) => (
                                        <SelectItem key={s.id} value={s.id} data-testid={`option-volunteer-stage-${s.id}-${app.id}`}>
                                          <div className="flex items-center gap-2">
                                            <div className={`h-2 w-2 rounded-full ${s.color}`} />
                                            {s.label}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>

                              {stage.id === "waiver_needed" && onSendWaiver && !app.holdHarmlessFormId && (
                                <Button
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSendWaiver(app);
                                  }}
                                  disabled={sendingWaiverId === app.id}
                                  data-testid={`button-send-waiver-${app.id}`}
                                >
                                  {sendingWaiverId === app.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <FileSignature className="h-4 w-4 mr-2" />
                                  )}
                                  Send Hold Harmless Form
                                </Button>
                              )}

                              {app.holdHarmlessFormId && !app.holdHarmlessSignedAt && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-2">
                                  <Clock className="h-3 w-3" />
                                  Awaiting volunteer signature
                                </div>
                              )}

                              {app.holdHarmlessSignedAt && stage.id === "waiver_needed" && (
                                <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Waiver signed - ready for Active Pool
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
