import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Heart, FileText, AlertTriangle, CheckCircle2, Clock, ShieldAlert, User } from "lucide-react";
import { format } from "date-fns";
import { HeartwormTreatmentModal } from "@/components/HeartwormTreatmentModal";
import { HeartwormWatchHelp } from "@/components/dashboard/HeartwormWatchHelp";
import { apiRequest } from "@/lib/queryClient";

type HwStatus = 'on_track' | 'overdue' | 'restriction_window_active' | 'completed';

interface HwPlanRow {
  id: string;
  animalId: string;
  animalName: string;
  animalPhotoUrl: string | null;
  adopterName: string;
  adopterEmail: string;
  status: HwStatus;
  nextAppointment: { type: string; label: string; scheduledDate: string } | null;
  overdueAppointmentTypes: string[];
  overdueAppointmentLabels: string[];
  latestReceipt: { objectPath: string; appointmentLabel: string; completedDate: string } | null;
  hasUnverifiedAdopterCompletion: boolean;
  appointmentsTotal: number;
  appointmentsCompleted: number;
}

interface SummaryResponse {
  plans: HwPlanRow[];
  groups: Record<HwStatus, HwPlanRow[]>;
  counts: {
    overdue: number;
    restriction_window_active: number;
    on_track: number;
    completed: number;
    total: number;
    totalUnfiltered: number;
  };
}

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  start_doxy: 'Doxycycline',
  first_injection: '1st Injection',
  second_third_injection: '2nd/3rd Injection',
  recheck: 'Recheck',
  proheart: 'Proheart',
};

const STATUS_GROUP_ORDER: Array<{
  key: HwStatus;
  title: string;
  description: string;
  testId: string;
}> = [
  {
    key: 'overdue',
    title: 'Overdue',
    description: 'At least one missed appointment — needs follow-up',
    testId: 'group-hw-overdue',
  },
  {
    key: 'restriction_window_active',
    title: 'Strict Rest In Effect',
    description: 'Inside the post-injection rest window',
    testId: 'group-hw-restriction',
  },
  {
    key: 'on_track',
    title: 'On Track',
    description: 'No overdue appointments, treatment progressing',
    testId: 'group-hw-on-track',
  },
  {
    key: 'completed',
    title: 'Completed',
    description: 'Every appointment confirmed complete',
    testId: 'group-hw-completed',
  },
];

function StatusBadge({ status }: { status: HwStatus }) {
  if (status === 'completed') {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600" data-testid="badge-hw-status-completed">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
      </Badge>
    );
  }
  if (status === 'overdue') {
    return (
      <Badge variant="destructive" data-testid="badge-hw-status-overdue">
        <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
      </Badge>
    );
  }
  if (status === 'restriction_window_active') {
    return (
      <Badge variant="default" className="bg-amber-600 hover:bg-amber-600" data-testid="badge-hw-status-restriction">
        <ShieldAlert className="h-3 w-3 mr-1" /> Strict Rest
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="badge-hw-status-on-track">
      <Clock className="h-3 w-3 mr-1" /> On Track
    </Badge>
  );
}

function PlanRow({ plan, onOpen }: { plan: HwPlanRow; onOpen: (animalId: string, name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(plan.animalId, plan.animalName)}
      className="w-full text-left border rounded-md p-3 hover-elevate active-elevate-2"
      data-testid={`row-hw-plan-${plan.id}`}
    >
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {plan.animalPhotoUrl ? (
            <img
              src={plan.animalPhotoUrl}
              alt={plan.animalName}
              className="h-12 w-12 rounded-md object-cover flex-shrink-0"
              data-testid={`img-hw-animal-${plan.id}`}
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Heart className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" data-testid={`text-hw-animal-name-${plan.id}`}>
                {plan.animalName}
              </span>
              <StatusBadge status={plan.status} />
              {plan.hasUnverifiedAdopterCompletion && (
                <Badge variant="outline" data-testid={`badge-hw-unverified-${plan.id}`}>
                  <User className="h-3 w-3 mr-1" /> Adopter-reported
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Adopter: <span className="text-foreground">{plan.adopterName}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-hw-progress-${plan.id}`}>
              {plan.appointmentsCompleted} of {plan.appointmentsTotal} appointments complete
            </p>
            {plan.status === 'overdue' && plan.overdueAppointmentLabels.length > 0 && (
              <p className="text-xs text-destructive mt-0.5" data-testid={`text-hw-overdue-${plan.id}`}>
                Overdue: {plan.overdueAppointmentLabels.join(', ')}
              </p>
            )}
            {plan.status !== 'completed' && plan.nextAppointment && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-hw-next-${plan.id}`}>
                Next: {plan.nextAppointment.label} on{' '}
                {format(new Date(plan.nextAppointment.scheduledDate), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
        {plan.latestReceipt && (
          <a
            href={plan.latestReceipt.objectPath}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 border rounded-md overflow-hidden hover-elevate"
            data-testid={`link-hw-receipt-${plan.id}`}
            title={`Latest receipt: ${plan.latestReceipt.appointmentLabel}`}
          >
            <div className="relative w-16 h-16 bg-muted flex items-center justify-center">
              <img
                src={plan.latestReceipt.objectPath}
                alt="receipt"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const parent = (e.currentTarget as HTMLImageElement).parentElement;
                  if (parent) {
                    const fallback = parent.querySelector('[data-fallback]');
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div
                data-fallback
                className="absolute inset-0 hidden items-center justify-center text-muted-foreground"
                style={{ display: 'none' }}
              >
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </a>
        )}
      </div>
    </button>
  );
}

export default function HeartwormWatchWidget() {
  const [overdueType, setOverdueType] = useState<string>('any');
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<{ id: string; name: string } | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (overdueType !== 'any') p.set('overdueType', overdueType);
    if (unverifiedOnly) p.set('unverifiedOnly', 'true');
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [overdueType, unverifiedOnly]);

  const { data, isLoading } = useQuery<SummaryResponse>({
    queryKey: ['/api/heartworm-treatment-plans/summary', queryParams],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/heartworm-treatment-plans/summary${queryParams}`);
      return res.json();
    },
  });

  const groups = data?.groups;
  const counts = data?.counts;
  const handleOpen = (animalId: string, name: string) => setSelectedAnimal({ id: animalId, name });

  return (
    <>
      <Card data-testid="card-heartworm-watch-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Heart className="h-5 w-5 text-red-500 flex-shrink-0" />
            <CardTitle className="text-base">Heartworm Watch</CardTitle>
            <HeartwormWatchHelp />
            {counts && (
              <Badge variant="outline" data-testid="badge-hw-total-count">
                {counts.total} {counts.total === 1 ? 'plan' : 'plans'}
                {counts.totalUnfiltered !== counts.total && ` of ${counts.totalUnfiltered}`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-row flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 min-w-[14rem]">
              <Label htmlFor="hw-overdue-type" className="text-xs text-muted-foreground whitespace-nowrap">
                Overdue type
              </Label>
              <Select value={overdueType} onValueChange={setOverdueType}>
                <SelectTrigger id="hw-overdue-type" className="h-9" data-testid="select-hw-overdue-type">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any appointment type</SelectItem>
                  {Object.entries(APPOINTMENT_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="hw-unverified-only"
                checked={unverifiedOnly}
                onCheckedChange={setUnverifiedOnly}
                data-testid="switch-hw-unverified-only"
              />
              <Label htmlFor="hw-unverified-only" className="text-xs text-muted-foreground">
                Self-reported, not yet staff-verified
              </Label>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !groups || (counts && counts.total === 0) ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-hw-empty-state">
              No heartworm treatment plans match your filters. Tap the help icon above to learn how this widget works.
            </div>
          ) : (
            <div className="space-y-5">
              {STATUS_GROUP_ORDER.map(group => {
                const rows = groups[group.key] ?? [];
                if (rows.length === 0) return null;
                return (
                  <section key={group.key} data-testid={group.testId} className="space-y-2">
                    <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          {group.title}
                          <Badge variant="outline" className="text-xs" data-testid={`badge-${group.testId}-count`}>
                            {rows.length}
                          </Badge>
                        </h3>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {rows.map(plan => (
                        <PlanRow key={plan.id} plan={plan} onOpen={handleOpen} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAnimal && (
        <HeartwormTreatmentModal
          open={!!selectedAnimal}
          onOpenChange={(open) => {
            if (!open) setSelectedAnimal(null);
          }}
          animalId={selectedAnimal.id}
          animalName={selectedAnimal.name}
        />
      )}
    </>
  );
}
