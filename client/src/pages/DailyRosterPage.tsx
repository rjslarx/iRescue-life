import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Syringe,
  Stethoscope,
  FlaskConical,
  CheckCircle2,
  ClipboardList,
  Calendar as CalendarIcon,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Building2,
  Home,
  MapPin,
  Printer,
  Undo2,
} from "lucide-react";
import { format, isSameDay, parse, addDays } from "date-fns";

interface RosterMedication {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  medicationName: string;
  dosage: string;
  route: string;
  prescriptionId: string;
  dueDate: string | null;
  frequency: string | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
  locationType?: string | null;
  locationName?: string | null;
}

interface RosterPreventative {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  careName: string;
  careCategory: string;
  clinicName: string | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
  locationType?: string | null;
  locationName?: string | null;
  source?: 'preventativeCare' | 'vaccineRecord';
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
  isQuarantined: boolean;
  quarantineReason: string | null;
  locationType?: string | null;
  locationName?: string | null;
}

interface RosterProcedure {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  procedureName: string;
  veterinarian: string | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
  locationType?: string | null;
  locationName?: string | null;
}

interface RosterDiagnostic {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  testName: string;
  isQuarantined: boolean;
  quarantineReason: string | null;
  locationType?: string | null;
  locationName?: string | null;
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

function isRabiesVaccine(careName: string): boolean {
  return /rabies/i.test(careName);
}

function getItemSortTime(item: { _type: string; dueDate?: string | null }): number {
  if (item._type === 'dose' && item.dueDate) {
    try {
      const d = new Date(item.dueDate);
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    } catch {
      return Infinity;
    }
  }
  return Infinity;
}

function getTimeBadge(dueDate: string | null, _frequency: string | null): { label: string; className: string } | null {
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

function VaccineLogModal({
  open,
  onOpenChange,
  vaccineItem,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaccineItem: { id: string; animalName: string; careName: string } | null;
  onSubmit: (data: { id: string; manufacturer: string; lotNumber: string }) => void;
  isPending: boolean;
}) {
  const [manufacturer, setManufacturer] = useState("");
  const [lotNumber, setLotNumber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaccineItem || !manufacturer.trim() || !lotNumber.trim()) return;
    onSubmit({ id: vaccineItem.id, manufacturer: manufacturer.trim(), lotNumber: lotNumber.trim() });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setManufacturer("");
      setLotNumber("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid="dialog-vaccine-log">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Syringe className="h-4 w-4" />
            Log Vaccine Administration
          </DialogTitle>
          <DialogDescription>
            Record manufacturer and lot number from the vaccine vial sticker for{" "}
            <strong>{vaccineItem?.animalName}</strong> — <strong>{vaccineItem?.careName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="roster-vaccine-manufacturer">Manufacturer</Label>
              <Input
                id="roster-vaccine-manufacturer"
                placeholder="e.g. Zoetis, Merck, Boehringer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                data-testid="input-roster-vaccine-manufacturer"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roster-vaccine-lot-number">Lot Number</Label>
              <Input
                id="roster-vaccine-lot-number"
                placeholder="From vial sticker"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                data-testid="input-roster-vaccine-lot-number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              data-testid="button-roster-vaccine-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!manufacturer.trim() || !lotNumber.trim() || isPending}
              data-testid="button-roster-vaccine-submit"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Mark Given
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DailyRosterPage() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [locationFilter, setLocationFilter] = useState<"all" | "shelter" | "foster">("shelter");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [vaccineModalOpen, setVaccineModalOpen] = useState(false);
  const [pendingVaccine, setPendingVaccine] = useState<{ id: string; animalName: string; careName: string } | null>(null);
  const [completedVaccines, setCompletedVaccines] = useState<Set<string>>(new Set());
  const [completionItem, setCompletionItem] = useState<CompletionItem | null>(null);
  const [completionCost, setCompletionCost] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [resultsItem, setResultsItem] = useState<RosterDiagnostic | null>(null);
  const [resultValue, setResultValue] = useState("");
  const [resultNotes, setResultNotes] = useState("");

  // Undo window state — tracks dose IDs that can still be undone (within 30 s)
  const [undoableIds, setUndoableIds] = useState<Map<string, number>>(new Map()); // doseId → markedAt timestamp
  const [renderTick, setRenderTick] = useState(0); // incremented every second to drive countdown display
  const dateStrRef = useRef('');
  const monthStrRef = useRef('');

  const { data: tenantData } = useQuery<{ tenant: { name: string } }>({
    queryKey: ["/api/tenant"],
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const monthStr = format(calendarMonth, "yyyy-MM");
  const isFutureDate = dateStr > format(new Date(), "yyyy-MM-dd");

  const locationParam = locationFilter !== "all" ? `&location=${locationFilter}` : "";
  const { data: roster, isLoading: rosterLoading } = useQuery<RosterData>({
    queryKey: ["/api/daily-roster", dateStr, locationFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/daily-roster?date=${dateStr}${locationParam}`);
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

  const vaccineMarkMutation = useMutation({
    mutationFn: async (data: { id: string; manufacturer: string; lotNumber: string }) => {
      const res = await apiRequest("POST", "/api/daily-roster/mark-vaccine-given", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Vaccine Recorded", description: "Vaccine administration logged with manufacturer and lot number." });
      setCompletedVaccines((prev) => new Set(prev).add(variables.id));
      setVaccineModalOpen(false);
      setPendingVaccine(null);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/medical-snapshot"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const medsAndPreventatives = useMemo((): (MedOrPrev & { _isVaccine: boolean })[] => {
    if (!roster) return [];
    const inHousePreventatives = roster.preventatives.filter(
      (p) => !(p.careCategory === "vaccine" && isRabiesVaccine(p.careName))
    );
    const combined: (MedOrPrev & { _isVaccine: boolean })[] = [
      ...roster.medications.map((m): TaggedMedication & { _isVaccine: boolean } => ({ ...m, _type: "dose", _isVaccine: false })),
      ...inHousePreventatives.map((p): TaggedPreventative & { _isVaccine: boolean } => ({
        ...p,
        _type: "preventative",
        _isVaccine: p.careCategory === "vaccine",
      })),
    ];
    return combined.sort((a, b) => {
      const tA = getItemSortTime(a);
      const tB = getItemSortTime(b);
      if (tA !== tB) return tA - tB;
      return a.animalName.localeCompare(b.animalName);
    });
  }, [roster]);

  const rabiesVaccines = useMemo(() => {
    if (!roster) return [];
    return roster.preventatives.filter((p) => p.careCategory === "vaccine" && isRabiesVaccine(p.careName));
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

  const nonVaccineItems = useMemo(
    () => medsAndPreventatives.filter((item) => !item._isVaccine),
    [medsAndPreventatives]
  );

  const individualMarkMutation = useMutation({
    mutationFn: async (payload: { id: string; type: string; key: string }) => {
      await apiRequest("POST", "/api/daily-roster/bulk-mark-given", { items: [{ id: payload.id, type: payload.type }] });
    },
    onSuccess: (_data, variables) => {
      if (variables.type === 'dose') {
        // Keep row visible during the 30-second undo window — do NOT invalidate or remove from selectedItems yet
        setUndoableIds((prev) => new Map(prev).set(variables.id, Date.now()));
        toast({ title: "Marked as given", description: "Click Undo on the row within 30 seconds to reverse." });
      } else {
        // Preventatives/vaccines: normal immediate behaviour
        toast({ title: "Marked as given", description: "Item updated successfully." });
        setSelectedItems((prev) => {
          const next = new Set(prev);
          next.delete(variables.key);
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStrRef.current] });
        queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStrRef.current] });
      }
    },
    onError: (err: Error, variables) => {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.delete(variables.key);
        return next;
      });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (doseId: string) => {
      const res = await apiRequest("POST", "/api/daily-roster/undo-mark-given", { doseId });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Undo failed");
      }
      return doseId;
    },
    onSuccess: (doseId) => {
      setUndoableIds((prev) => { const next = new Map(prev); next.delete(doseId); return next; });
      setSelectedItems((prev) => { const next = new Set(prev); next.delete(`dose:${doseId}`); return next; });
      // Refetch so the dose reappears as pending
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStrRef.current] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStrRef.current] });
      toast({ title: "Undone", description: "Medication restored to the pending list." });
    },
    onError: (err: Error, doseId) => {
      // Undo window expired — clean up local state and let the query resync
      setUndoableIds((prev) => { const next = new Map(prev); next.delete(doseId); return next; });
      setSelectedItems((prev) => { const next = new Set(prev); next.delete(`dose:${doseId}`); return next; });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStrRef.current] });
      toast({ title: "Undo unavailable", description: "The undo window has expired. Edit from the animal's medical page.", variant: "destructive" });
    },
  });

  // Keep date refs current so interval callbacks reference the latest values
  useEffect(() => { dateStrRef.current = dateStr; }, [dateStr]);
  useEffect(() => { monthStrRef.current = monthStr; }, [monthStr]);

  // 1-second ticker: drives countdown display and expires undo windows after 30 s
  useEffect(() => {
    if (undoableIds.size === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setRenderTick((t) => t + 1);
      setUndoableIds((prev) => {
        const next = new Map(prev);
        for (const [id, ts] of next) {
          if (now - ts > 30000) {
            next.delete(id);
            // Remove from checked state and refresh list now that undo window is closed
            setSelectedItems((si) => { const n = new Set(si); n.delete(`dose:${id}`); return n; });
            queryClient.invalidateQueries({ queryKey: ["/api/daily-roster", dateStrRef.current] });
            queryClient.invalidateQueries({ queryKey: ["/api/daily-roster/calendar", monthStrRef.current] });
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [undoableIds.size]);

  function getItemType(item: MedOrPrev & { _isVaccine: boolean }): string {
    if (item._type === 'dose') return 'dose';
    const prev = item as TaggedPreventative & { _isVaccine: boolean };
    return prev.source === 'vaccineRecord' ? 'vaccine' : 'preventative';
  }

  function handleItemClick(item: MedOrPrev & { _isVaccine: boolean }) {
    const key = `${item._type}:${item.id}`;
    if (item._isVaccine) {
      if (completedVaccines.has(item.id)) return;
      const prevItem = item as TaggedPreventative & { _isVaccine: boolean };
      setPendingVaccine({ id: prevItem.id, animalName: prevItem.animalName, careName: prevItem.careName });
      setVaccineModalOpen(true);
    } else {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      individualMarkMutation.mutate({ id: item.id, type: getItemType(item), key });
    }
  }

  function toggleAll() {
    if (selectedItems.size === nonVaccineItems.length && nonVaccineItems.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(nonVaccineItems.map((item) => `${item._type}:${item.id}`)));
    }
  }

  function handleBulkMark() {
    const sourceById = new Map<string, string>();
    for (const item of medsAndPreventatives) {
      if (item._type === "preventative") {
        const prev = item as TaggedPreventative & { _isVaccine: boolean };
        sourceById.set(prev.id, prev.source === 'vaccineRecord' ? 'vaccine' : 'preventative');
      }
    }
    const items = Array.from(selectedItems).map((key) => {
      const [_type, id] = key.split(":");
      const type = sourceById.get(id) ?? _type;
      return { id, type };
    });
    bulkMarkMutation.mutate(items);
  }

  function formatExamType(type: string) {
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  }

  function goToPrevDay() {
    setSelectedDate(d => addDays(d, -1));
    setSelectedItems(new Set());
    setCompletedVaccines(new Set());
  }

  function goToNextDay() {
    setSelectedDate(d => addDays(d, 1));
    setSelectedItems(new Set());
    setCompletedVaccines(new Set());
  }

  return (
    <DashboardLayout title="Daily Medical Roster" description="Aggregated daily view of all pending medical tasks">
    <div className="flex flex-col h-full overflow-auto" data-testid="page-daily-roster">
      {/* Print-only header — hidden on screen, visible when printing */}
      <div className="hidden print:block print:mb-4 print:pb-3 print:border-b print:border-gray-300">
        <p className="text-sm text-gray-500">{tenantData?.tenant?.name}</p>
        <h1 className="text-xl font-bold">Daily Medical Roster</h1>
        <p className="text-base">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
        {totalItems > 0 && <p className="text-sm text-gray-500 mt-0.5">{totalItems} pending task{totalItems !== 1 ? "s" : ""}</p>}
      </div>

      <div className="border-b px-4 py-3 lg:px-6 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold" data-testid="text-page-title">Daily Medical Roster</h1>
            <Badge variant="secondary" data-testid="badge-date" className="hidden lg:inline-flex">{format(selectedDate, "EEEE, MMMM d, yyyy")}</Badge>
            {totalItems > 0 && (
              <Badge data-testid="badge-total-items" className="hidden lg:inline-flex">{totalItems} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="button-print">
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
            <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40" data-testid="toggle-location-filter">
            <Button
              size="sm"
              variant={locationFilter === "all" ? "default" : "ghost"}
              className="h-7 px-2 gap-1"
              onClick={() => { setLocationFilter("all"); setSelectedItems(new Set()); }}
              data-testid="button-filter-all"
            >
              <MapPin className="h-3 w-3" />
              <span className="text-xs">All</span>
            </Button>
            <Button
              size="sm"
              variant={locationFilter === "shelter" ? "default" : "ghost"}
              className="h-7 px-2 gap-1"
              onClick={() => { setLocationFilter("shelter"); setSelectedItems(new Set()); }}
              data-testid="button-filter-shelter"
            >
              <Building2 className="h-3 w-3" />
              <span className="text-xs">In Shelter</span>
            </Button>
            <Button
              size="sm"
              variant={locationFilter === "foster" ? "default" : "ghost"}
              className="h-7 px-2 gap-1"
              onClick={() => { setLocationFilter("foster"); setSelectedItems(new Set()); }}
              data-testid="button-filter-foster"
            >
              <Home className="h-3 w-3" />
              <span className="text-xs">In Foster</span>
            </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile compact date navigation — hidden on desktop, hidden when printing */}
      <div className="lg:hidden print:hidden sticky top-0 z-50 bg-background border-b px-3 py-2 flex items-center justify-between gap-2">
        <Button size="icon" variant="ghost" onClick={goToPrevDay} data-testid="button-prev-day">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium">{format(selectedDate, "EEE, MMM d")}</span>
          {totalItems > 0 && <span className="text-xs text-muted-foreground">{totalItems} pending</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setSelectedDate(new Date()); setSelectedItems(new Set()); setCompletedVaccines(new Set()); }} data-testid="button-today">
            Today
          </Button>
          <Button size="icon" variant="ghost" onClick={goToNextDay} data-testid="button-next-day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-auto lg:overflow-hidden">
        <div className="hidden lg:flex print:!hidden lg:flex-col lg:w-80 lg:min-w-80 lg:border-r p-4 lg:overflow-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => { if (d) { setSelectedDate(d); setSelectedItems(new Set()); setCompletedVaccines(new Set()); } }}
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
                      onClick={() => { setSelectedDate(d); setSelectedItems(new Set()); setCompletedVaccines(new Set()); }}
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
              {isFutureDate && (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-future-date">
                  <CalendarIcon className="h-4 w-4 shrink-0" />
                  <span>Viewing future date — items cannot be completed until their scheduled date.</span>
                </div>
              )}
              {medsAndPreventatives.length > 0 && (
                <Card data-testid="card-meds-section">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Meds, Preventatives & Vaccines</CardTitle>
                      <Badge variant="secondary">{medsAndPreventatives.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2 print:hidden">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          checked={selectedItems.size === nonVaccineItems.length && nonVaccineItems.length > 0}
                          onCheckedChange={toggleAll}
                          disabled={isFutureDate}
                          data-testid="checkbox-select-all"
                        />
                        <span className="text-xs text-muted-foreground">All</span>
                      </div>
                      {isFutureDate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                disabled
                                data-testid="button-bulk-mark-given"
                              >
                                Mark Given (0)
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Future orders cannot be marked as given until their scheduled date</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleBulkMark}
                          disabled={selectedItems.size === 0 || bulkMarkMutation.isPending}
                          data-testid="button-bulk-mark-given"
                        >
                          {bulkMarkMutation.isPending ? "Updating..." : `Mark Given (${selectedItems.size})`}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {medsAndPreventatives.map((item) => {
                      const key = `${item._type}:${item.id}`;
                      const isVaccineCompleted = item._isVaccine && completedVaccines.has(item.id);
                      const isChecked = isVaccineCompleted || selectedItems.has(key);
                      const isUndoable = item._type === 'dose' && undoableIds.has(item.id);
                      const secondsLeft = isUndoable
                        ? Math.max(0, 30 - Math.floor((Date.now() - undoableIds.get(item.id)!) / 1000))
                        : 0;
                      void renderTick; // consumed to force re-render each second
                      return (
                        <div key={key} className={`flex items-start gap-3 py-2 px-2 rounded-md transition-opacity ${isChecked && !isUndoable ? "opacity-50 hover-elevate" : isChecked ? "opacity-70" : "hover-elevate"} ${item.isQuarantined ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40" : ""}`} data-testid={`row-med-${item.id}`}>
                          {!isFutureDate && (
                            <Checkbox
                              checked={isChecked}
                              disabled={isVaccineCompleted}
                              onCheckedChange={() => handleItemClick(item)}
                              className="mt-0.5 shrink-0 print:hidden"
                              data-testid={`checkbox-med-${item.id}`}
                            />
                          )}
                          <Avatar className="h-7 w-7 shrink-0">
                            {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                            <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.isQuarantined && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" data-testid={`icon-quarantine-${item.id}`} />
                                  </TooltipTrigger>
                                  <TooltipContent><p>Quarantine: {item.quarantineReason || "Active"}</p></TooltipContent>
                                </Tooltip>
                              )}
                              {item._isVaccine && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Syringe className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" data-testid={`icon-vaccine-${item.id}`} />
                                  </TooltipTrigger>
                                  <TooltipContent><p>Vaccine — requires manufacturer & lot number</p></TooltipContent>
                                </Tooltip>
                              )}
                              <Link href={`/dashboard/animals/${item.animalId}/medical`} className="font-medium text-sm hover:underline" data-testid={`link-animal-${item.animalId}`}>
                                {item.animalName}
                              </Link>
                              {locationFilter === "all" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center text-muted-foreground" data-testid={`icon-location-${item.id}`}>
                                      {item.locationType === "foster" ? <Home className="h-3 w-3" /> : item.locationType === "shelter" ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent><p>{item.locationType === "foster" ? `In Foster${item.locationName ? `: ${item.locationName}` : ""}` : item.locationName || item.locationType || "Shelter"}</p></TooltipContent>
                                </Tooltip>
                              )}
                              <span className="text-muted-foreground text-sm hidden sm:inline">—</span>
                              <span className="text-sm" data-testid={`text-drug-${item.id}`}>
                                {item._type === "dose" ? (item as TaggedMedication).medicationName : (item as TaggedPreventative).careName}
                              </span>
                              {item._type === "dose" && (() => {
                                const med = item as TaggedMedication;
                                const tb = getTimeBadge(med.dueDate, med.frequency);
                                return tb ? (
                                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0 rounded-full border ${tb.className}`} data-testid={`time-badge-${item.id}`}>
                                    {tb.label}
                                  </span>
                                ) : null;
                              })()}
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
                          {isUndoable && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 print:hidden gap-1.5"
                              disabled={undoMutation.isPending}
                              onClick={() => undoMutation.mutate(item.id)}
                              data-testid={`button-undo-med-${item.id}`}
                            >
                              {undoMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5" />
                              )}
                              Undo ({secondsLeft}s)
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {(vetAndSurgery.length > 0 || rabiesVaccines.length > 0) && (
                <Card data-testid="card-vet-section">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Stethoscope className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Vet Visits & Surgeries</CardTitle>
                      <Badge variant="secondary">{vetAndSurgery.length + rabiesVaccines.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {rabiesVaccines.map((rv) => {
                      const isRabiesCompleted = completedVaccines.has(rv.id);
                      return (
                        <div key={`rabies-${rv.id}`} className={`flex items-start gap-3 py-2 px-2 rounded-md hover-elevate transition-opacity ${isRabiesCompleted ? "opacity-50" : ""} ${rv.isQuarantined ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40" : ""}`} data-testid={`row-rabies-${rv.id}`}>
                          <Avatar className="h-7 w-7 shrink-0">
                            {rv.animalPhoto ? <AvatarImage src={rv.animalPhoto} alt={rv.animalName} /> : null}
                            <AvatarFallback className="text-xs">{rv.animalName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {rv.isQuarantined && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                                  </TooltipTrigger>
                                  <TooltipContent><p>Quarantine: {rv.quarantineReason || "Active"}</p></TooltipContent>
                                </Tooltip>
                              )}
                              <Syringe className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                              <Link href={`/dashboard/animals/${rv.animalId}/medical`} className="font-medium text-sm hover:underline">
                                {rv.animalName}
                              </Link>
                              <span className="text-muted-foreground text-sm hidden sm:inline">—</span>
                              <span className="text-sm">{rv.careName}</span>
                            </div>
                            <Badge variant="outline" className="text-xs mt-0.5">Rabies — Vet Required</Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 print:hidden"
                            disabled={isFutureDate || isRabiesCompleted}
                            onClick={() => {
                              if (isRabiesCompleted) return;
                              setPendingVaccine({ id: rv.id, animalName: rv.animalName, careName: rv.careName });
                              setVaccineModalOpen(true);
                            }}
                            data-testid={`button-rabies-log-${rv.id}`}
                          >
                            {isRabiesCompleted ? "Recorded" : isFutureDate ? "Scheduled" : "Log Vaccine"}
                          </Button>
                        </div>
                      );
                    })}
                    {vetAndSurgery.map((item) => (
                      <div key={`${item.itemType}-${item.id}`} className={`flex items-start gap-3 py-2 px-2 rounded-md hover-elevate ${item.isQuarantined ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40" : ""}`} data-testid={`row-vet-${item.id}`}>
                        <Avatar className="h-7 w-7 shrink-0">
                          {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                          <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.isQuarantined && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" data-testid={`icon-quarantine-vet-${item.id}`} />
                                </TooltipTrigger>
                                <TooltipContent><p>Quarantine: {item.quarantineReason || "Active"}</p></TooltipContent>
                              </Tooltip>
                            )}
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
                          className="shrink-0 print:hidden"
                          onClick={() => {
                            if (item.itemType === "exam") {
                              setCompletionItem({ type: "exam", item: item as RosterExam & { itemType: "exam" } });
                            } else {
                              setCompletionItem({ type: "procedure", item: item as RosterProcedure & { itemType: "procedure" } });
                            }
                          }}
                          disabled={isFutureDate}
                          data-testid={`button-complete-${item.id}`}
                        >
                          {isFutureDate ? "Scheduled" : "Log Completion"}
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
                      <div key={item.id} className={`flex items-start gap-3 py-2 px-2 rounded-md hover-elevate ${item.isQuarantined ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40" : ""}`} data-testid={`row-lab-${item.id}`}>
                        <Avatar className="h-7 w-7 shrink-0">
                          {item.animalPhoto ? <AvatarImage src={item.animalPhoto} alt={item.animalName} /> : null}
                          <AvatarFallback className="text-xs">{item.animalName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.isQuarantined && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" data-testid={`icon-quarantine-lab-${item.id}`} />
                                </TooltipTrigger>
                                <TooltipContent><p>Quarantine: {item.quarantineReason || "Active"}</p></TooltipContent>
                              </Tooltip>
                            )}
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
                          className="shrink-0 print:hidden"
                          onClick={() => setResultsItem(item)}
                          disabled={isFutureDate}
                          data-testid={`button-results-${item.id}`}
                        >
                          {isFutureDate ? "Scheduled" : "Enter Results"}
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

      <VaccineLogModal
        open={vaccineModalOpen}
        onOpenChange={setVaccineModalOpen}
        vaccineItem={pendingVaccine}
        onSubmit={(data) => vaccineMarkMutation.mutate(data)}
        isPending={vaccineMarkMutation.isPending}
      />

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

        @page {
          margin: 1.5cm;
        }

        @media print {
          body, html {
            background: white !important;
            color: black !important;
            font-size: 11px !important;
          }

          /* Hide the entire sidebar (DashboardLayout renders it outside this component) */
          [data-sidebar], aside, nav {
            display: none !important;
          }

          /* Ensure content fills the full width — no overflow clipping */
          .flex-1, [data-testid="page-daily-roster"] {
            overflow: visible !important;
            height: auto !important;
          }

          /* Remove card shadows and borders for cleaner print */
          [data-testid="card-meds-section"],
          [data-testid="card-vet-section"],
          [data-testid="card-labs-section"] {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 6px !important;
          }

          /* Compact card headers */
          [data-testid="card-meds-section"] > div:first-child,
          [data-testid="card-vet-section"] > div:first-child,
          [data-testid="card-labs-section"] > div:first-child {
            padding: 6px 10px !important;
          }

          /* Compact card content */
          [data-testid="card-meds-section"] > div:last-child,
          [data-testid="card-vet-section"] > div:last-child,
          [data-testid="card-labs-section"] > div:last-child {
            padding: 4px 8px 6px !important;
            gap: 0 !important;
          }

          /* Compact individual rows — tighter vertical padding */
          [data-testid^="row-med-"],
          [data-testid^="row-vet-"],
          [data-testid^="row-lab-"],
          [data-testid^="row-rabies-"] {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
            padding-left: 4px !important;
            padding-right: 4px !important;
            gap: 6px !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Hide avatars in print — they waste horizontal and vertical space */
          [data-testid^="row-med-"] .h-7.w-7,
          [data-testid^="row-vet-"] .h-7.w-7,
          [data-testid^="row-lab-"] .h-7.w-7,
          [data-testid^="row-rabies-"] .h-7.w-7 {
            display: none !important;
          }

          /* Tighter subtext lines */
          [data-testid^="row-med-"] p,
          [data-testid^="row-vet-"] p,
          [data-testid^="row-lab-"] p,
          [data-testid^="row-rabies-"] p {
            margin-top: 0 !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
          }

          /* Smaller badges */
          [data-testid^="row-med-"] .text-xs,
          [data-testid^="row-vet-"] .text-xs,
          [data-testid^="row-lab-"] .text-xs,
          [data-testid^="row-rabies-"] .text-xs {
            font-size: 9px !important;
            padding: 0 3px !important;
          }

          /* Compact section wrapper spacing */
          .space-y-4 > * + * {
            margin-top: 6px !important;
          }

          /* Force black text everywhere for clean output */
          * {
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          a {
            text-decoration: none !important;
          }
        }
      `}</style>
    </div>
    </DashboardLayout>
  );
}
