import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Pill,
  Syringe,
  Stethoscope,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isToday } from "date-fns";

interface RosterMedication {
  id: string;
  animalId: string;
  animalName: string;
  medicationName: string;
  dosage: string;
  route: string;
  prescriptionId: string;
  dueDate: string | null;
  frequency: string | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface RosterPreventative {
  id: string;
  animalId: string;
  animalName: string;
  careName: string;
  careCategory: string;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface RosterExam {
  id: string;
  animalId: string;
  animalName: string;
  examType: string;
  reason: string;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface RosterProcedure {
  id: string;
  animalId: string;
  animalName: string;
  procedureName: string;
  veterinarian: string;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface RosterDiagnostic {
  id: string;
  animalId: string;
  animalName: string;
  testName: string;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface RosterData {
  medications: RosterMedication[];
  preventatives: RosterPreventative[];
  exams: RosterExam[];
  procedures: RosterProcedure[];
  diagnostics: RosterDiagnostic[];
}

interface CalendarData {
  dates: Record<string, { total: number }>;
}

const MULTI_DOSE_FREQUENCIES = ['BID', 'TID', 'QID'];

function getTimeBadge(dueDate: string | null, frequency: string | null): { label: string; className: string } | null {
  if (!frequency || !MULTI_DOSE_FREQUENCIES.includes(frequency)) return null;
  if (!dueDate) return null;
  try {
    const date = new Date(dueDate);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (hours < 12) {
      return { label: timeStr, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40" };
    }
    return { label: timeStr, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/40" };
  } catch {
    return null;
  }
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MiniCalendar({
  selectedDate,
  onDateSelect,
  calendarData,
}: {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  calendarData: CalendarData | undefined;
}) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(selectedDate));

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { allDays, startPadding };
  }, [viewMonth]);

  const hasTasks = (day: Date) => {
    const key = format(day, "yyyy-MM-dd");
    return calendarData?.dates?.[key]?.total > 0;
  };

  return (
    <div className="flex flex-col" data-testid="mini-calendar">
      <div className="flex items-center justify-between mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          className="h-7 w-7"
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium" data-testid="text-calendar-month">
          {format(viewMonth, "MMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          className="h-7 w-7"
          data-testid="button-next-month"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[10px] font-medium text-muted-foreground py-1"
          >
            {label}
          </div>
        ))}

        {Array.from({ length: days.startPadding }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.allDays.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          const inMonth = isSameMonth(day, viewMonth);
          const tasksExist = hasTasks(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateSelect(day)}
              className={`
                relative flex flex-col items-center justify-center h-7 w-full text-[11px] rounded-md transition-colors
                ${!inMonth ? "text-muted-foreground/40" : ""}
                ${selected ? "bg-primary text-primary-foreground font-semibold" : ""}
                ${today && !selected ? "font-bold text-primary" : ""}
                ${!selected ? "hover:bg-muted" : ""}
              `}
              data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
            >
              {day.getDate()}
              {tasksExist && (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    selected ? "bg-primary-foreground" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DailyExecutionWidget() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const monthStr = format(selectedDate, "yyyy-MM");

  const { data: rosterData, isLoading: rosterLoading } = useQuery<RosterData>({
    queryKey: ["/api/daily-roster", dateStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-roster?date=${dateStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
  });

  const { data: calendarData } = useQuery<CalendarData>({
    queryKey: ["/api/daily-roster/calendar", monthStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-roster/calendar?month=${monthStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json();
    },
  });

  const bulkMarkMutation = useMutation({
    mutationFn: async (items: Array<{ id: string; type: "dose" | "preventative" }>) => {
      const res = await apiRequest("POST", "/api/daily-roster/bulk-mark-given", { items });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Marked as Given",
        description: `${data.count} item(s) marked as given.`,
      });
      setCheckedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/medical-snapshot"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark items as given",
        variant: "destructive",
      });
    },
  });

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setCheckedItems(new Set());
  };

  const toggleItem = (key: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBulkMark = () => {
    const items = Array.from(checkedItems).map((key) => {
      const [type, id] = key.split(":");
      return { id, type: type as "dose" | "preventative" };
    });
    if (items.length > 0) {
      bulkMarkMutation.mutate(items);
    }
  };

  const meds = rosterData?.medications || [];
  const preventatives = rosterData?.preventatives || [];
  const exams = rosterData?.exams || [];
  const procedures = rosterData?.procedures || [];
  const diagnostics = rosterData?.diagnostics || [];

  const medsAndPreventatives = [
    ...meds.map((m) => ({ ...m, _type: "dose" as const, _label: m.medicationName, _detail: m.dosage ? `${m.dosage}${m.route ? ` (${m.route})` : ""}` : "", dueDate: m.dueDate, frequency: m.frequency, isQuarantined: m.isQuarantined, quarantineReason: m.quarantineReason })),
    ...preventatives.map((p) => ({ ...p, _type: "preventative" as const, _label: p.careName, _detail: p.careCategory || "", dueDate: null as string | null, frequency: null as string | null, isQuarantined: p.isQuarantined, quarantineReason: p.quarantineReason })),
  ];
  const vetVisits = [...exams.map((e) => ({ ...e, _label: e.examType, _detail: e.reason || "" })), ...procedures.map((p) => ({ ...p, _label: p.procedureName, _detail: p.veterinarian || "" }))];
  const labs = diagnostics.map((d) => ({ ...d, _label: d.testName }));

  const totalTasks = medsAndPreventatives.length + vetVisits.length + labs.length;
  const isFutureDate = dateStr > format(new Date(), "yyyy-MM-dd");

  return (
    <Card data-testid="card-daily-execution-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Daily Execution Board</CardTitle>
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="sm:w-[200px] shrink-0">
            <MiniCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              calendarData={calendarData}
            />
          </div>

          <div className="flex-1 min-w-0 max-h-[320px] overflow-y-auto">
            {rosterLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : totalTasks === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-center" data-testid="empty-roster">
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No pending tasks for {format(selectedDate, "MMM d, yyyy")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {format(selectedDate, "EEE, MMM d")} — {totalTasks} task{totalTasks !== 1 ? "s" : ""}
                  </p>
                  {checkedItems.size > 0 && !isFutureDate && (
                    <Button
                      size="sm"
                      onClick={handleBulkMark}
                      disabled={bulkMarkMutation.isPending}
                      data-testid="button-bulk-mark-given"
                    >
                      {bulkMarkMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Mark {checkedItems.size} Given
                    </Button>
                  )}
                </div>

                {medsAndPreventatives.length > 0 && (
                  <div data-testid="section-meds-preventatives">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Pill className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Meds & Preventatives
                      </h4>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {medsAndPreventatives.length}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {medsAndPreventatives.map((item) => {
                        const key = `${item._type}:${item.id}`;
                        const isChecked = checkedItems.has(key);
                        const timeBadge = item._type === "dose" ? getTimeBadge(item.dueDate, item.frequency) : null;
                        return (
                          <label
                            key={key}
                            className={`flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm transition-opacity ${isChecked ? "opacity-50" : ""} ${item.isQuarantined ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                            data-testid={`roster-item-${key}`}
                          >
                            {!isFutureDate && (
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleItem(key)}
                                data-testid={`checkbox-${key}`}
                              />
                            )}
                            {item.isQuarantined && (
                              <AlertTriangle className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
                            )}
                            <span className={`font-bold text-foreground truncate ${isChecked ? "line-through" : ""}`}>{item.animalName}</span>
                            <span className={`truncate ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                              {item._label}
                            </span>
                            {timeBadge && (
                              <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0 rounded-full border ${timeBadge.className}`} data-testid={`time-badge-${item.id}`}>
                                {timeBadge.label}
                              </span>
                            )}
                            {item._detail && (
                              <span className={`text-muted-foreground/70 text-xs truncate hidden sm:inline ${isChecked ? "line-through" : ""}`}>
                                {item._detail}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {vetVisits.length > 0 && (
                  <div data-testid="section-vet-visits">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Stethoscope className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vet Visits & Surgeries
                      </h4>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {vetVisits.length}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {vetVisits.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 py-1 px-1.5 rounded-md text-sm ${item.isQuarantined ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                          data-testid={`roster-vet-${item.id}`}
                        >
                          {item.isQuarantined && (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
                          )}
                          <span className="font-bold text-foreground truncate">{item.animalName}</span>
                          <span className="truncate">{item._label}</span>
                          {item._detail && (
                            <span className="text-muted-foreground/70 text-xs truncate hidden sm:inline">
                              {item._detail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {labs.length > 0 && (
                  <div data-testid="section-labs">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileSearch className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pending Labs
                      </h4>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {labs.length}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {labs.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 py-1 px-1.5 rounded-md text-sm"
                          data-testid={`roster-lab-${item.id}`}
                        >
                          <span className="font-bold text-foreground truncate">{item.animalName}</span>
                          <span className="truncate">{item._label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <Link href="/dashboard/daily-roster">
          <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-view-daily-roster">
            View Full Daily Roster
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
