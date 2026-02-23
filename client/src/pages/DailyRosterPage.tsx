import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Pill,
  Stethoscope,
  FlaskConical,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { format, isSameDay, parse } from "date-fns";

interface RosterMedication {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  medicationName: string;
  dosage: string;
  route: string;
  prescriptionId: string;
}

interface RosterPreventative {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  careName: string;
  careCategory: string;
  clinicName: string | null;
}

type TaggedMedication = RosterMedication & { _type: "dose" };
type TaggedPreventative = RosterPreventative & { _type: "preventative" };
type MedOrPrev = TaggedMedication | TaggedPreventative;

interface RosterExam {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  examType: string;
  performedBy: string;
  reason: string | null;
}

interface RosterProcedure {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  procedureName: string;
  veterinarian: string | null;
}

interface RosterDiagnostic {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  testName: string;
}

interface RosterData {
  medications: RosterMedication[];
  preventatives: RosterPreventative[];
  exams: RosterExam[];
  procedures: RosterProcedure[];
  diagnostics: RosterDiagnostic[];
}

interface CalendarData {
  dates: Record<string, { total: number; medications: number; preventatives: number; exams: number; procedures: number; diagnostics: number }>;
}

type CompletionItem = { type: "exam"; item: RosterExam } | { type: "procedure"; item: RosterProcedure };

export default function DailyRosterPage() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [completionItem, setCompletionItem] = useState<CompletionItem | null>(null);
  const [completionCost, setCompletionCost] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [resultsItem, setResultsItem] = useState<RosterDiagnostic | null>(null);
  const [resultValue, setResultValue] = useState("");
  const [resultNotes, setResultNotes] = useState("");

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const monthStr = format(calendarMonth, "yyyy-MM");

  const { data: roster, isLoading: rosterLoading } = useQuery<RosterData>({
    queryKey: ["/api/daily-roster", dateStr],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/daily-roster?date=${dateStr}`);
      return res.json();
    },
  });

  const { data: calendarData } = useQuery<CalendarData>({
    queryKey: ["/api/daily-roster/calendar", monthStr],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/daily-roster/calendar?month=${monthStr}`);
      return res.json();
    },
  });

  const bulkMarkMutation = useMutation({
    mutationFn: async (items: { id: string; type: string }[]) => {
      await apiRequest("POST", "/api/daily-roster/bulk-mark-given", { items });
    },
    onSuccess: () => {
      toast({ title: "Items marked as given", description: `${selectedItems.size} item(s) updated successfully.` });
      setSelectedItems(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStr] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const completionMutation = useMutation({
    mutationFn: async () => {
      if (!completionItem) return;
      const { type, item } = completionItem;
      if (type === "procedure") {
        await apiRequest("PATCH", `/api/medical/procedures/${item.id}`, {
          status: "completed",
          completedDate: new Date().toISOString(),
          completionNotes: completionNotes || undefined,
          billAmount: completionCost || undefined,
        });
      } else {
        await apiRequest("PATCH", `/api/medical/exams/${item.id}`, {
          status: "completed",
          completedDate: new Date().toISOString(),
          completionNotes: completionNotes || undefined,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Completed", description: `${completionItem?.type === "procedure" ? "Procedure" : "Exam"} logged as completed.` });
      setCompletionItem(null);
      setCompletionCost("");
      setCompletionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStr] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resultsMutation = useMutation({
    mutationFn: async () => {
      if (!resultsItem) return;
      await apiRequest("PATCH", `/api/medical/diagnostics/${resultsItem.id}`, {
        result: resultValue,
        notes: resultNotes || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Results recorded", description: "Diagnostic test results saved." });
      setResultsItem(null);
      setResultValue("");
      setResultNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStr] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const medsAndPreventatives = useMemo((): MedOrPrev[] => {
    if (!roster) return [];
    return [
      ...roster.medications.map((m): TaggedMedication => ({ ...m, _type: "dose" })),
      ...roster.preventatives.map((p): TaggedPreventative => ({ ...p, _type: "preventative" })),
    ];
  }, [roster]);

  const vetAndSurgery = useMemo(() => {
    if (!roster) return [];
    return [
      ...roster.exams.map((e) => ({ ...e, itemType: "exam" as const })),
      ...roster.procedures.map((p) => ({ ...p, itemType: "procedure" as const })),
    ];
  }, [roster]);

  const totalItems = roster
    ? roster.medications.length + roster.preventatives.length + roster.exams.length + roster.procedures.length + roster.diagnostics.length
    : 0;

  const calendarDaysWithItems = useMemo(() => {
    if (!calendarData?.dates) return [];
    return Object.keys(calendarData.dates).map((d) => parse(d, "yyyy-MM-dd", new Date()));
  }, [calendarData]);

  function toggleItem(key: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selectedItems.size === medsAndPreventatives.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(medsAndPreventatives.map((item) => `${item._type}:${item.id}`)));
    }
  }

  function handleBulkMark() {
    const items = Array.from(selectedItems).map((key) => {
      const [type, id] = key.split(":");
      return { id, type };
    });
    bulkMarkMutation.mutate(items);
  }

  function formatExamType(type: string) {
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  }

  return (
    <div className="flex flex-col h-full overflow-auto" data-testid="page-daily-roster">
      <div className="border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Daily Medical Roster</h1>
          <Badge variant="secondary" data-testid="badge-date">{format(selectedDate, "EEEE, MMMM d, yyyy")}</Badge>
          {totalItems > 0 && (
            <Badge data-testid="badge-total-items">{totalItems} pending</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        <div className="lg:w-80 lg:min-w-80 border-b lg:border-b-0 lg:border-r p-4 lg:overflow-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && setSelectedDate(d)}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            modifiers={{ hasItems: calendarDaysWithItems }}
            modifiersClassNames={{ hasItems: "roster-day-dot" }}
            className="w-full"
            data-testid="calendar-roster"
          />
          {calendarData?.dates && (
            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Month</p>
              {Object.entries(calendarData.dates)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 7)
                .map(([date, counts]) => {
                  const d = parse(date, "yyyy-MM-dd", new Date());
                  const isSelected = isSameDay(d, selectedDate);
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(d)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover-elevate ${isSelected ? "bg-accent" : ""}`}
                      data-testid={`button-calendar-day-${date}`}
                    >
                      <span className={isSelected ? "font-medium" : ""}>{format(d, "EEE, MMM d")}</span>
                      <Badge variant="secondary" className="text-xs">{counts.total}</Badge>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
          {rosterLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : totalItems === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium" data-testid="text-empty-state">All Clear</h3>
              <p className="text-sm text-muted-foreground mt-1">No pending medical tasks for {format(selectedDate, "MMMM d, yyyy")}.</p>
            </div>
          ) : (
            <>
              {medsAndPreventatives.length > 0 && (
                <Card data-testid="card-meds-section">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">In-House Meds & Preventatives</CardTitle>
                      <Badge variant="secondary">{medsAndPreventatives.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          checked={selectedItems.size === medsAndPreventatives.length && medsAndPreventatives.length > 0}
                          onCheckedChange={toggleAll}
                          data-testid="checkbox-select-all"
                        />
                        <span className="text-xs text-muted-foreground">All</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleBulkMark}
                        disabled={selectedItems.size === 0 || bulkMarkMutation.isPending}
                        data-testid="button-bulk-mark-given"
                      >
                        {bulkMarkMutation.isPending ? "Updating..." : `Mark Given (${selectedItems.size})`}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {medsAndPreventatives.map((item) => {
                      const key = `${item._type}:${item.id}`;
                      return (
                        <div key={key} className="flex items-start gap-3 py-2 px-2 rounded-md hover-elevate" data-testid={`row-med-${item.id}`}>
                          <Checkbox
                            checked={selectedItems.has(key)}
                            onCheckedChange={() => toggleItem(key)}
                            className="mt-0.5 shrink-0"
                            data-testid={`checkbox-med-${item.id}`}
                          />
                          <Avatar className="h-7 w-7 shrink-0">
                            {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                            <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link href={`/dashboard/animals/${item.animalId}/medical`} className="font-medium text-sm hover:underline" data-testid={`link-animal-${item.animalId}`}>
                                {item.animalName}
                              </Link>
                              <span className="text-muted-foreground text-sm hidden sm:inline">—</span>
                              <span className="text-sm" data-testid={`text-drug-${item.id}`}>
                                {item._type === "dose" ? (item as TaggedMedication).medicationName : (item as TaggedPreventative).careName}
                              </span>
                            </div>
                            {item._type === "dose" && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(item as TaggedMedication).dosage} {(item as TaggedMedication).route}
                              </p>
                            )}
                            {item._type === "preventative" && (item as TaggedPreventative).careCategory && (
                              <Badge variant="outline" className="text-xs mt-0.5">{(item as TaggedPreventative).careCategory}</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {vetAndSurgery.length > 0 && (
                <Card data-testid="card-vet-section">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Stethoscope className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Vet Visits & Surgeries</CardTitle>
                      <Badge variant="secondary">{vetAndSurgery.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {vetAndSurgery.map((item) => (
                      <div key={`${item.itemType}-${item.id}`} className="flex items-start gap-3 py-2 px-2 rounded-md hover-elevate" data-testid={`row-vet-${item.id}`}>
                        <Avatar className="h-7 w-7 shrink-0">
                          {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                          <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link href={`/dashboard/animals/${item.animalId}/medical`} className="font-medium text-sm hover:underline" data-testid={`link-vet-animal-${item.animalId}`}>
                              {item.animalName}
                            </Link>
                            <span className="text-muted-foreground text-sm hidden sm:inline">—</span>
                            <span className="text-sm" data-testid={`text-visit-${item.id}`}>
                              {item.itemType === "exam" ? `${formatExamType((item as RosterExam & { itemType: "exam" }).examType)} Exam` : (item as RosterProcedure & { itemType: "procedure" }).procedureName}
                            </span>
                          </div>
                          {item.itemType === "exam" && (item as RosterExam & { itemType: "exam" }).performedBy && (
                            <p className="text-xs text-muted-foreground mt-0.5">with {(item as RosterExam & { itemType: "exam" }).performedBy}</p>
                          )}
                          {item.itemType === "procedure" && (item as RosterProcedure & { itemType: "procedure" }).veterinarian && (
                            <p className="text-xs text-muted-foreground mt-0.5">Dr. {(item as RosterProcedure & { itemType: "procedure" }).veterinarian}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => {
                            if (item.itemType === "exam") {
                              setCompletionItem({ type: "exam", item: item as RosterExam & { itemType: "exam" } });
                            } else {
                              setCompletionItem({ type: "procedure", item: item as RosterProcedure & { itemType: "procedure" } });
                            }
                          }}
                          data-testid={`button-complete-${item.id}`}
                        >
                          Log Completion
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {roster!.diagnostics.length > 0 && (
                <Card data-testid="card-labs-section">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FlaskConical className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Labs & Diagnostics</CardTitle>
                      <Badge variant="secondary">{roster!.diagnostics.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {roster!.diagnostics.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 py-2 px-2 rounded-md hover-elevate" data-testid={`row-lab-${item.id}`}>
                        <Avatar className="h-7 w-7 shrink-0">
                          {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                          <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link href={`/dashboard/animals/${item.animalId}/medical`} className="font-medium text-sm hover:underline" data-testid={`link-lab-animal-${item.animalId}`}>
                              {item.animalName}
                            </Link>
                            <span className="text-muted-foreground text-sm hidden sm:inline">—</span>
                            <span className="text-sm" data-testid={`text-lab-${item.id}`}>{item.testName}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => setResultsItem(item)}
                          data-testid={`button-results-${item.id}`}
                        >
                          Enter Results
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={!!completionItem} onOpenChange={(open) => { if (!open) { setCompletionItem(null); setCompletionCost(""); setCompletionNotes(""); } }}>
        <DialogContent data-testid="dialog-log-completion">
          <DialogHeader>
            <DialogTitle>Log Completion</DialogTitle>
            <DialogDescription>
              {completionItem && (
                <>
                  {completionItem.type === "procedure"
                    ? `${(completionItem.item as RosterProcedure).animalName} — ${(completionItem.item as RosterProcedure).procedureName}`
                    : `${(completionItem.item as RosterExam).animalName} — ${formatExamType((completionItem.item as RosterExam).examType)} Exam`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {completionItem?.type === "procedure" && (
              <div className="space-y-2">
                <Label htmlFor="completion-cost">Actual Cost</Label>
                <Input
                  id="completion-cost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={completionCost}
                  onChange={(e) => setCompletionCost(e.target.value)}
                  data-testid="input-completion-cost"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="completion-notes">Notes</Label>
              <Textarea
                id="completion-notes"
                placeholder="Add any notes about this visit..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                data-testid="textarea-completion-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCompletionItem(null); setCompletionCost(""); setCompletionNotes(""); }} data-testid="button-cancel-completion">Cancel</Button>
            <Button onClick={() => completionMutation.mutate()} disabled={completionMutation.isPending} data-testid="button-save-completion">
              {completionMutation.isPending ? "Saving..." : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultsItem} onOpenChange={(open) => { if (!open) { setResultsItem(null); setResultValue(""); setResultNotes(""); } }}>
        <DialogContent data-testid="dialog-enter-results">
          <DialogHeader>
            <DialogTitle>Enter Results</DialogTitle>
            <DialogDescription>
              {resultsItem && `${resultsItem.animalName} — ${resultsItem.testName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Result</Label>
              <Select value={resultValue} onValueChange={setResultValue}>
                <SelectTrigger data-testid="select-result-value">
                  <SelectValue placeholder="Select result..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Positive">Positive</SelectItem>
                  <SelectItem value="Negative">Negative</SelectItem>
                  <SelectItem value="Inconclusive">Inconclusive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="result-notes">Notes</Label>
              <Textarea
                id="result-notes"
                placeholder="Additional notes..."
                value={resultNotes}
                onChange={(e) => setResultNotes(e.target.value)}
                data-testid="textarea-result-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResultsItem(null); setResultValue(""); setResultNotes(""); }} data-testid="button-cancel-results">Cancel</Button>
            <Button onClick={() => resultsMutation.mutate()} disabled={resultsMutation.isPending || !resultValue} data-testid="button-save-results">
              {resultsMutation.isPending ? "Saving..." : "Save Results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .roster-day-dot {
          position: relative;
        }
        .roster-day-dot::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: hsl(var(--primary));
        }
      `}</style>
    </div>
  );
}
