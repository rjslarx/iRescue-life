import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileSignature, 
  Clock, 
  Loader2, 
  Calendar, 
  CheckCircle2, 
  UserCheck,
  XCircle,
  Send,
  Users
} from "lucide-react";

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
}

interface VolunteerKanbanBoardProps {
  applications: VolunteerApplication[];
  onMoveApplication?: (applicationId: string, newStatus: string) => void;
  onSendWaiver?: (application: VolunteerApplication) => void;
  sendingWaiverId?: string | null;
}

const stages = [
  { id: "new_applicant", label: "New Applicant", color: "bg-blue-500", icon: Users },
  { id: "orientation_scheduled", label: "Orientation Scheduled", color: "bg-yellow-500", icon: Calendar },
  { id: "waiver_needed", label: "Waiver Needed", color: "bg-orange-500", icon: FileSignature },
  { id: "active_pool", label: "Active Pool", color: "bg-green-500", icon: UserCheck },
  { id: "rejected", label: "Rejected", color: "bg-red-500", icon: XCircle },
];

function WaiverStatusBadge({ signedAt }: { signedAt?: string | null }) {
  if (signedAt) {
    return (
      <Badge variant="default" className="text-xs gap-1 shrink-0" data-testid="badge-waiver-signed">
        <CheckCircle2 className="h-3 w-3" />
        Waiver Signed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1 shrink-0" data-testid="badge-waiver-pending">
      <FileSignature className="h-3 w-3" />
      Awaiting Waiver
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
  sendingWaiverId 
}: VolunteerKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const getApplicationsByStage = (stageId: string) => {
    return applications.filter(app => app.pipelineStatus === stageId);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${stage.color}`} />
                      <StageIcon className="h-4 w-4 text-muted-foreground" />
                      {stage.label}
                    </CardTitle>
                    <Badge variant="secondary">{stageApps.length}</Badge>
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
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">{app.applicantName}</p>
                                </div>
                                <div className="flex flex-col gap-1 items-end">
                                  {(stage.id === "waiver_needed" || stage.id === "active_pool") && app.holdHarmlessFormId && (
                                    <WaiverStatusBadge signedAt={app.holdHarmlessSignedAt} />
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>{app.applicantEmail}</p>
                                <p>{app.applicantPhone}</p>
                                {app.availability && (
                                  <p className="truncate">Available: {app.availability}</p>
                                )}
                              </div>
                              
                              {stage.id === "active_pool" && (
                                <VolunteerSkillsBadges app={app} />
                              )}

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
