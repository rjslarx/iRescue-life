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
  Phone, 
  Home, 
  GraduationCap, 
  CheckCircle2, 
  UserCheck,
  XCircle,
  Send,
  Eye,
  ArrowRight
} from "lucide-react";

interface FosterAgreementStatus {
  status: string;
  sessionId?: string;
  expiresAt?: string;
}

interface FosterApplication {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  stage: string;
  hasYard?: boolean;
  hasFencedYard?: boolean;
  acceptsLargeDogs?: boolean;
  acceptsCats?: boolean;
  acceptsPuppies?: boolean;
  acceptsSeniors?: boolean;
  acceptsMedicalNeeds?: boolean;
  maxAnimals?: number;
  agreementStatus?: FosterAgreementStatus | null;
}

interface FosterKanbanBoardProps {
  applications: FosterApplication[];
  onMoveApplication?: (applicationId: string, newStage: string) => void;
  onSendAgreement?: (application: FosterApplication) => void;
  onViewApplication?: (application: FosterApplication) => void;
  sendingAgreementId?: string | null;
}

const stages = [
  { id: "new_app", label: "New App", color: "bg-blue-500", icon: Clock },
  { id: "interview", label: "Interview", color: "bg-yellow-500", icon: Phone },
  { id: "home_check", label: "Home Check", color: "bg-purple-500", icon: Home },
  { id: "orientation", label: "Orientation", color: "bg-orange-500", icon: GraduationCap },
  { id: "agreement", label: "Agreement", color: "bg-cyan-500", icon: FileSignature },
  { id: "active_pool", label: "Active Pool", color: "bg-green-500", icon: UserCheck },
  { id: "rejected", label: "Rejected", color: "bg-red-500", icon: XCircle },
];

function normalizeStage(status: string): string {
  switch (status) {
    case 'pending':
      return 'new_app';
    case 'approved':
      return 'active_pool';
    default:
      return status;
  }
}

function AgreementStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof FileSignature }> = {
    initiated: { label: "Link Sent", variant: "secondary", icon: Send },
    awaiting_signature: { label: "Awaiting Signature", variant: "outline", icon: FileSignature },
    completed: { label: "Signed", variant: "default", icon: CheckCircle2 },
    expired: { label: "Expired", variant: "secondary", icon: Clock },
    cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
  };

  const config = statusConfig[status] || { label: status, variant: "outline" as const, icon: Clock };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-xs gap-1 shrink-0" data-testid={`badge-agreement-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function FosterPreferenceBadges({ app }: { app: FosterApplication }) {
  const badges: { label: string; show: boolean }[] = [
    { label: "Fenced Yard", show: !!app.hasFencedYard },
    { label: "Large Dogs", show: !!app.acceptsLargeDogs },
    { label: "Cats OK", show: !!app.acceptsCats },
    { label: "Puppies", show: !!app.acceptsPuppies },
    { label: "Seniors", show: !!app.acceptsSeniors },
    { label: "Medical Needs", show: !!app.acceptsMedicalNeeds },
  ];

  const visibleBadges = badges.filter(b => b.show);
  if (visibleBadges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visibleBadges.map(badge => (
        <Badge key={badge.label} variant="outline" className="text-xs">
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}

export default function FosterKanbanBoard({ 
  applications, 
  onMoveApplication, 
  onSendAgreement,
  onViewApplication,
  sendingAgreementId 
}: FosterKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const getApplicationsByStage = (stageId: string) => {
    return applications.filter(app => normalizeStage(app.stage) === stageId);
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                  <div className="flex items-center justify-between">
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
                            data-testid={`card-foster-application-${app.id}`}
                          >
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">{app.applicantName}</p>
                                </div>
                                <div className="flex flex-col gap-1 items-end">
                                  {app.agreementStatus && (
                                    <AgreementStatusBadge status={app.agreementStatus.status} />
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>{app.email}</p>
                                <p>{app.phone}</p>
                              </div>
                              
                              {stage.id === "active_pool" && (
                                <FosterPreferenceBadges app={app} />
                              )}

                              {/* Mobile-friendly stage selector and view button */}
                              <div className="flex gap-2 mt-3 pt-2 border-t">
                                {onViewApplication && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewApplication(app);
                                    }}
                                    data-testid={`button-view-foster-application-${app.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                )}
                                {onMoveApplication && (
                                  <Select
                                    value={normalizeStage(app.stage)}
                                    onValueChange={(newStage) => {
                                      if (newStage !== normalizeStage(app.stage)) {
                                        onMoveApplication(app.id, newStage);
                                      }
                                    }}
                                  >
                                    <SelectTrigger 
                                      className="flex-1 h-8 text-xs"
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`select-foster-stage-${app.id}`}
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" />
                                      <SelectValue placeholder="Move to..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {stages.filter(s => s.id !== normalizeStage(app.stage)).map((s) => (
                                        <SelectItem key={s.id} value={s.id} data-testid={`option-foster-stage-${s.id}-${app.id}`}>
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

                              {stage.id === "agreement" && onSendAgreement && !app.agreementStatus && (
                                <Button
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSendAgreement(app);
                                  }}
                                  disabled={sendingAgreementId === app.id}
                                  data-testid={`button-send-agreement-${app.id}`}
                                >
                                  {sendingAgreementId === app.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <FileSignature className="h-4 w-4 mr-2" />
                                  )}
                                  Send Foster Agreement
                                </Button>
                              )}

                              {app.agreementStatus && app.agreementStatus.status === 'awaiting_signature' && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-2">
                                  <Clock className="h-3 w-3" />
                                  Awaiting foster signature
                                </div>
                              )}

                              {app.agreementStatus && app.agreementStatus.status === 'completed' && stage.id === "agreement" && (
                                <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-2">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Agreement signed - ready for Active Pool
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
