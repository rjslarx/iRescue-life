import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Cat,
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  Pencil,
  Trash2,
  ArrowRightCircle,
  Check,
  X,
  Loader2,
  Paperclip,
  Download,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

interface TnrRecord {
  id: string;
  name: string;
  species: string;
  sex: string;
  breed: string;
  colors: string[];
  status: string;
  intakeDate: string | null;
  recordType: string;
  colonyLocation: string | null;
  earTipped: boolean;
  caretakerName: string | null;
  caretakerPhone: string | null;
  invoiceNumber: string | null;
  surgeryLocation: string | null;
  partnership: string | null;
  releaseLocation: string | null;
  trapNumber: string | null;
  tnrNotes: string | null;
  neuterStatus: string | null;
  localShelterId: string | null;
  createdAt: string | null;
  colonyName: string | null;
  trapperName: string | null;
  dateAltered: string | null;
  rabiesTagNumber: string | null;
  fvrcpVaxGiven: boolean;
  fivFelvResult: string | null;
  tnrOutcomeType: string | null;
  tnrOutcomeDate: string | null;
}

interface BatchRow {
  trapNumber: string;
  color: string;
  sex: string;
  breed: string;
  customBreed: string;
  ageGroup: string;
  snCompleted: boolean;
  earTipped: boolean;
  rabiesVaxGiven: boolean;
  fvrcpVaxGiven: boolean;
  rabiesTagNumber: string;
  fivFelvResult: string;
  invoiceNumber: string;
  tnrNotes: string;
}

const TNR_BREED_OPTIONS = [
  { value: "Domestic Short Hair", label: "DSH" },
  { value: "Domestic Medium Hair", label: "DMH" },
  { value: "Domestic Long Hair", label: "DLH" },
  { value: "Other", label: "Other" },
];

const TNR_OUTCOME_OPTIONS = [
  { value: "returned_to_colony", label: "Returned to Colony" },
  { value: "relocated", label: "Relocated" },
  { value: "transferred_to_rescue", label: "Transferred to Rescue" },
  { value: "euthanized", label: "Euthanized in Clinic" },
  { value: "died_in_care", label: "Died in Care" },
];

const FIV_FELV_OPTIONS = [
  { value: "negative", label: "Neg" },
  { value: "positive", label: "Pos" },
  { value: "not_tested", label: "N/T" },
];

const emptyRow = (): BatchRow => ({
  trapNumber: "",
  color: "",
  sex: "unknown",
  breed: "Domestic Short Hair",
  customBreed: "",
  ageGroup: "Adult",
  snCompleted: false,
  earTipped: false,
  rabiesVaxGiven: false,
  fvrcpVaxGiven: false,
  rabiesTagNumber: "",
  fivFelvResult: "not_tested",
  invoiceNumber: "",
  tnrNotes: "",
});

function getMonthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.split("T")[0];
}

function resolveFileUrl(fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  if (fileUrl.startsWith("/objects/")) return fileUrl;
  return fileUrl;
}

async function collectFilesForPrint(ids: string[]): Promise<Record<string, any[]>> {
  const map: Record<string, any[]> = {};
  await Promise.all(ids.map(async (id) => {
    const cached = queryClient.getQueryData<{ files: any[] }>(["/api/animals", id, "files"]);
    if (cached?.files?.length) {
      map[id] = cached.files;
    } else {
      try {
        const data = await queryClient.fetchQuery<{ files: any[] }>({
          queryKey: ["/api/animals", id, "files"],
        });
        if (data?.files?.length) map[id] = data.files;
      } catch {}
    }
  }));
  return map;
}

export default function TnrLogPage() {
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<TnrRecord | null>(null);
  const [printRowId, setPrintRowId] = useState<string | null>(null);
  const [printFileMap, setPrintFileMap] = useState<Record<string, any[]>>({});
  const [attachmentAnimalId, setAttachmentAnimalId] = useState<string | null>(null);
  const [attachmentAnimalName, setAttachmentAnimalName] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fmtSex = (s: string | null) => s === 'male' ? 'M' : s === 'female' ? 'F' : s || '—';

  const monthStr = getMonthString(currentDate);
  const monthLabel = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const { data, isLoading } = useQuery<{ records: TnrRecord[] }>({
    queryKey: ["/api/tnr-records", monthStr],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tnr-records?month=${monthStr}`);
      return res.json();
    },
  });
  const records = data?.records ?? [];

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/tnr-records/${id}/convert`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Converted to rescue intake", description: "The animal is now in your standard rescue pipeline." });
      queryClient.invalidateQueries({ queryKey: ["/api/tnr-records"] });
      setConvertId(null);
    },
    onError: (e: any) => toast({ title: "Conversion failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/tnr-records/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Record deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/tnr-records"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  function setSelected(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  }

  function prevMonth() {
    setSelectedIds(new Set());
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setSelectedIds(new Set());
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  async function doPrintMonth() {
    const fileMap = await collectFilesForPrint(records.map(r => r.id));
    setPrintFileMap(fileMap);
    document.body.classList.remove("tnr-printing-row");
    document.body.classList.remove("tnr-printing-selected");
    setTimeout(() => {
      window.print();
      setPrintFileMap({});
    }, 400);
  }

  async function doPrintSelected() {
    const ids = records.filter(r => selectedIds.has(r.id)).map(r => r.id);
    const fileMap = await collectFilesForPrint(ids);
    setPrintFileMap(fileMap);
    document.body.classList.add("tnr-printing-selected");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("tnr-printing-selected");
      setPrintFileMap({});
    }, 400);
  }

  async function doPrintRow(id: string) {
    const fileMap = await collectFilesForPrint([id]);
    setPrintFileMap(fileMap);
    setPrintRowId(id);
    document.body.classList.add("tnr-printing-row");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("tnr-printing-row");
      setPrintRowId(null);
      setPrintFileMap({});
    }, 400);
  }

  const printRow = records.find(r => r.id === printRowId) ?? null;

  return (
    <DashboardLayout>
      <style>{`
        @media print {
          @page { size: landscape; margin: 1cm; }
          html, body { overflow: hidden !important; }
          .print-hidden { display: none !important; }
          .print-only { display: none !important; }
          .tnr-table-wrapper { overflow: visible !important; }
          body.tnr-printing-row .tnr-main-content { display: none !important; }
          body.tnr-printing-row .print-only { display: block !important; }
          body.tnr-printing-selected .tnr-main-content tr[data-tnr-selected="false"] { display: none !important; }
          [data-slot="sidebar-wrapper"] { --sidebar-width: 0px !important; }
          [data-sidebar="sidebar"],
          [data-sidebar="trigger"],
          [data-sidebar="rail"] { display: none !important; }
          header { display: none !important; }
          [data-slot="sidebar-wrapper"] > div,
          [data-slot="sidebar-wrapper"] > div > div:last-child {
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }
          .tnr-main-content table {
            font-size: 9.5px !important;
            width: 100% !important;
            table-layout: auto !important;
          }
          .tnr-main-content th,
          .tnr-main-content td {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            max-width: none !important;
            padding: 3px 5px !important;
            word-break: break-word !important;
          }
          .tnr-print-attachments { display: block !important; }
        }
        .print-only { display: none; }
        .tnr-print-attachments { display: none; }
      `}</style>

      {printRow && (
        <div className="print-only">
          <div style={{ marginBottom: 16 }}>
            <strong>TNR Record — {monthLabel}</strong>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px", width: 160 }}>Date</td><td style={{ padding: "4px 8px" }}>{formatDate(printRow.intakeDate)}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Trap #</td><td style={{ padding: "4px 8px" }}>{printRow.trapNumber || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Color</td><td style={{ padding: "4px 8px" }}>{printRow.colors?.join(", ") || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Sex</td><td style={{ padding: "4px 8px" }}>{fmtSex(printRow.sex)}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Breed</td><td style={{ padding: "4px 8px" }}>{printRow.breed || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Colony Name</td><td style={{ padding: "4px 8px" }}>{printRow.colonyName || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Colony Location</td><td style={{ padding: "4px 8px" }}>{printRow.colonyLocation || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Trapper Name</td><td style={{ padding: "4px 8px" }}>{printRow.trapperName || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Surgery Location</td><td style={{ padding: "4px 8px" }}>{printRow.surgeryLocation || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Surgery Date</td><td style={{ padding: "4px 8px" }}>{printRow.dateAltered ? formatDate(printRow.dateAltered) : "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Invoice #</td><td style={{ padding: "4px 8px" }}>{printRow.invoiceNumber || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Partnership</td><td style={{ padding: "4px 8px" }}>{printRow.partnership || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>S/N</td><td style={{ padding: "4px 8px" }}>{printRow.neuterStatus && printRow.neuterStatus !== "unknown" ? "Yes" : "No"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Ear Tipped</td><td style={{ padding: "4px 8px" }}>{printRow.earTipped ? "Yes" : "No"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Rabies Tag #</td><td style={{ padding: "4px 8px" }}>{printRow.rabiesTagNumber || "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>FVRCP Given</td><td style={{ padding: "4px 8px" }}>{printRow.fvrcpVaxGiven ? "Yes" : "No"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>FIV/FeLV</td><td style={{ padding: "4px 8px" }}>{printRow.fivFelvResult === "positive" ? "Positive" : printRow.fivFelvResult === "negative" ? "Negative" : "Not Tested"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Outcome</td><td style={{ padding: "4px 8px" }}>{printRow.tnrOutcomeType ? (TNR_OUTCOME_OPTIONS.find(o => o.value === printRow.tnrOutcomeType)?.label || printRow.tnrOutcomeType) : "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Outcome Date</td><td style={{ padding: "4px 8px" }}>{printRow.tnrOutcomeDate ? formatDate(printRow.tnrOutcomeDate) : "—"}</td></tr>
              <tr><td style={{ fontWeight: "bold", padding: "4px 8px" }}>Notes</td><td style={{ padding: "4px 8px" }}>{printRow.tnrNotes || "—"}</td></tr>
            </tbody>
          </table>
          {(printFileMap[printRow.id] ?? []).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: "bold", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 12 }}>
                Attachments
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {(printFileMap[printRow.id] ?? []).map((file: any) => (
                  <div key={file.id} style={{ textAlign: "center", maxWidth: 200 }}>
                    {file.mimeType?.startsWith("image/") ? (
                      <img
                        src={resolveFileUrl(file.fileUrl)}
                        alt={file.fileName}
                        style={{ maxWidth: 200, maxHeight: 200, border: "1px solid #ddd", display: "block" }}
                      />
                    ) : (
                      <div style={{ padding: "8px 12px", border: "1px solid #ddd", fontSize: 11, textAlign: "left" }}>
                        {file.fileName}
                      </div>
                    )}
                    {file.description && (
                      <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{file.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print-hidden">
          <div className="flex items-center gap-2">
            <Cat className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">TNR Log</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={prevMonth} data-testid="button-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-base font-medium min-w-36 text-center">{monthLabel}</span>
            <Button size="icon" variant="ghost" onClick={nextMonth} data-testid="button-next-month"><ChevronRight className="h-4 w-4" /></Button>
            {selectedIds.size > 0 && (
              <Button variant="outline" onClick={doPrintSelected} data-testid="button-print-selected">
                <Printer className="h-4 w-4 mr-2" /> Print Selected ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" onClick={doPrintMonth} data-testid="button-print-month">
              <Printer className="h-4 w-4 mr-2" /> Print Month
            </Button>
            <Button onClick={() => setShowBatchDialog(true)} data-testid="button-new-batch">
              <Plus className="h-4 w-4 mr-2" /> New Batch
            </Button>
          </div>
        </div>

        <div className="tnr-main-content">
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
              <Cat className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-lg font-medium">No TNR records for {monthLabel}</p>
                <p className="text-sm text-muted-foreground">Start a new batch to log trapped cats for this month.</p>
              </div>
              <Button onClick={() => setShowBatchDialog(true)} data-testid="button-start-batch">
                <Plus className="h-4 w-4 mr-2" /> Start Batch
              </Button>
            </div>
          ) : (
            <div className="tnr-table-wrapper overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 print-hidden w-10">
                      <Checkbox
                        checked={records.length > 0 && selectedIds.size === records.length}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                        aria-label="Select all"
                      />
                    </th>
                    {["Date","Trap #","Color","Sex","Breed","Age","Colony","Location","Trapper","Clinic","S/N","Surgery Date","Ear Tip","Rabies Tag","FVRCP","FIV/FeLV","Invoice #","Outcome","Notes"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">{h}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap print-hidden">Files</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap print-hidden">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0"
                      data-testid={`row-tnr-${r.id}`}
                      data-tnr-selected={selectedIds.has(r.id) ? "true" : "false"}
                    >
                      <td className="px-3 py-2 print-hidden">
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={(checked) => setSelected(r.id, checked === true)}
                          data-testid={`checkbox-select-${r.id}`}
                          aria-label={`Select ${r.name}`}
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{formatDate(r.intakeDate)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.trapNumber || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.colors?.join(", ") || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{fmtSex(r.sex)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.breed || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.name?.includes("Kitten") ? "Kitten" : "Adult"}</td>
                      <td className="px-2 py-2 max-w-28 truncate text-xs">{r.colonyName || "—"}</td>
                      <td className="px-2 py-2 max-w-28 truncate text-xs">{r.colonyLocation || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.trapperName || "—"}</td>
                      <td className="px-2 py-2 max-w-28 truncate text-xs">{r.surgeryLocation || "—"}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {r.neuterStatus && r.neuterStatus !== "unknown" ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.dateAltered ? formatDate(r.dateAltered) : "—"}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {r.earTipped ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.rabiesTagNumber || "—"}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {r.fvrcpVaxGiven ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {r.fivFelvResult === "positive" ? <span className="text-red-600 font-medium">Pos</span> : r.fivFelvResult === "negative" ? <span className="text-green-600">Neg</span> : "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">{r.invoiceNumber || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {r.tnrOutcomeType ? TNR_OUTCOME_OPTIONS.find(o => o.value === r.tnrOutcomeType)?.label || r.tnrOutcomeType : "—"}
                      </td>
                      <td className="px-2 py-2 max-w-32 truncate text-xs text-muted-foreground">{r.tnrNotes || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap print-hidden">
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-attachments-${r.id}`}
                          onClick={() => { setAttachmentAnimalId(r.id); setAttachmentAnimalName(r.name); }}
                          title="View/upload attachments"
                          className="flex items-center gap-1 w-auto px-2"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <AttachmentCount animalId={r.id} />
                        </Button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap print-hidden">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditRecord(r)} data-testid={`button-edit-${r.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => doPrintRow(r.id)} data-testid={`button-print-row-${r.id}`}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setConvertId(r.id)} data-testid={`button-convert-${r.id}`}>
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} data-testid={`button-delete-${r.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-sm text-muted-foreground border-t print-hidden">
                {records.length} {records.length === 1 ? "cat" : "cats"} logged in {monthLabel}
              </div>
            </div>
          )}
          {Object.keys(printFileMap).length > 0 && (
            <div className="tnr-print-attachments" style={{ marginTop: 24 }}>
              <div style={{ fontWeight: "bold", fontSize: 13, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 16 }}>
                Attachments
              </div>
              {records
                .filter(r => (printFileMap[r.id] ?? []).length > 0)
                .map(r => (
                  <div key={r.id} style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: "bold", fontSize: 11, color: "#444", marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 3 }}>
                      {r.colors?.join(", ") || "Unknown"} — Trap #{r.trapNumber || "—"} — {formatDate(r.intakeDate)}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {(printFileMap[r.id] ?? []).map((file: any) => (
                        <div key={file.id} style={{ textAlign: "center", maxWidth: 180 }}>
                          {file.mimeType?.startsWith("image/") ? (
                            <img
                              src={resolveFileUrl(file.fileUrl)}
                              alt={file.fileName}
                              style={{ maxWidth: 180, maxHeight: 180, border: "1px solid #ddd", display: "block" }}
                            />
                          ) : (
                            <div style={{ padding: "8px 12px", border: "1px solid #ddd", fontSize: 10, textAlign: "left" }}>
                              {file.fileName}
                            </div>
                          )}
                          {file.description && (
                            <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{file.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>

      <BatchEntryDialog
        open={showBatchDialog}
        onClose={() => setShowBatchDialog(false)}
        onSuccess={() => {
          setShowBatchDialog(false);
          queryClient.invalidateQueries({ queryKey: ["/api/tnr-records"] });
        }}
      />

      {editRecord && (
        <EditRecordDialog
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSuccess={() => {
            setEditRecord(null);
            queryClient.invalidateQueries({ queryKey: ["/api/tnr-records"] });
          }}
        />
      )}

      <AlertDialog open={!!convertId} onOpenChange={(o) => !o && setConvertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Rescue Intake?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the cat into your standard rescue pipeline with status "Stray Hold". You can then manage it as a regular animal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => convertId && convertMutation.mutate(convertId)}
              disabled={convertMutation.isPending}
              data-testid="button-confirm-convert"
            >
              {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Convert to Rescue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete TNR Record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TnrAttachmentsDrawer
        animalId={attachmentAnimalId}
        animalName={attachmentAnimalName}
        open={attachmentAnimalId !== null}
        onClose={() => setAttachmentAnimalId(null)}
      />
    </DashboardLayout>
  );
}

interface BatchEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function BatchEntryDialog({ open, onClose, onSuccess }: BatchEntryDialogProps) {
  const { toast } = useToast();
  const [trappingDate, setTrappingDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [colonyLocation, setColonyLocation] = useState("");
  const [colonyName, setColonyName] = useState("");
  const [trapperName, setTrapperName] = useState("");
  const [caretakerName, setCaretakerName] = useState("");
  const [caretakerPhone, setCaretakerPhone] = useState("");
  const [surgeryLocation, setSurgeryLocation] = useState("");
  const [partnership, setPartnership] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([emptyRow(), emptyRow(), emptyRow()]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const validRows = rows.filter(r => r.color || r.trapNumber);
      if (validRows.length === 0) throw new Error("At least one row must have a color or trap number.");
      const mappedRows = validRows.map(r => ({
        ...r,
        breed: r.breed === "Other" ? (r.customBreed || "Domestic Short Hair") : r.breed,
      }));
      const res = await apiRequest("POST", "/api/tnr-records/batch", {
        trappingDate,
        colonyLocation,
        colonyName,
        trapperName,
        caretakerName,
        caretakerPhone,
        surgeryLocation,
        partnership,
        rows: mappedRows,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save batch");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.created} ${data.created === 1 ? "cat" : "cats"} logged successfully.` });
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      setColonyLocation(""); setColonyName(""); setTrapperName(""); setCaretakerName(""); setCaretakerPhone(""); setSurgeryLocation(""); setPartnership("");
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Failed to save batch", description: e.message, variant: "destructive" }),
  });

  function updateRow(i: number, field: keyof BatchRow, value: any) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }
  function addRow() { setRows(prev => [...prev, emptyRow()]); }
  function removeRow(i: number) { setRows(prev => prev.filter((_, idx) => idx !== i)); }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New TNR Batch Entry</DialogTitle>
          <DialogDescription>Enter trapping session details and individual cat information below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="batch-date">Trapping Date</Label>
              <Input id="batch-date" type="date" value={trappingDate} onChange={e => setTrappingDate(e.target.value)} data-testid="input-batch-date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-colony-name">Colony Name</Label>
              <Input id="batch-colony-name" placeholder="e.g. Elm Street Colony" value={colonyName} onChange={e => setColonyName(e.target.value)} data-testid="input-colony-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-colony">Colony Location</Label>
              <Input id="batch-colony" placeholder="Address or description" value={colonyLocation} onChange={e => setColonyLocation(e.target.value)} data-testid="input-colony-location" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-trapper">Trapper Name</Label>
              <Input id="batch-trapper" placeholder="Person who trapped" value={trapperName} onChange={e => setTrapperName(e.target.value)} data-testid="input-trapper-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-surgery">Surgery Location</Label>
              <Input id="batch-surgery" placeholder="Clinic / facility name" value={surgeryLocation} onChange={e => setSurgeryLocation(e.target.value)} data-testid="input-surgery-location" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-caretaker">Caretaker Name</Label>
              <Input id="batch-caretaker" placeholder="Contact name" value={caretakerName} onChange={e => setCaretakerName(e.target.value)} data-testid="input-caretaker-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-phone">Caretaker Phone</Label>
              <Input id="batch-phone" placeholder="Phone number" value={caretakerPhone} onChange={e => setCaretakerPhone(e.target.value)} data-testid="input-caretaker-phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-partner">Partnership / Grant</Label>
              <Input id="batch-partner" placeholder="Org or grant name" value={partnership} onChange={e => setPartnership(e.target.value)} data-testid="input-partnership" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Trap #</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Color</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Sex</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Breed</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Age</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap text-xs">S/N</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap text-xs">Ear Tip</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap text-xs">Rabies</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Rabies Tag</th>
                  <th className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap text-xs">FVRCP</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">FIV/FeLV</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Invoice #</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">Notes</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0" data-testid={`batch-row-${i}`}>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-20" value={row.trapNumber} onChange={e => updateRow(i, "trapNumber", e.target.value)} placeholder={`#${i+1}`} data-testid={`input-trap-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-32" value={row.color} onChange={e => updateRow(i, "color", e.target.value)} placeholder="e.g. gray tabby" data-testid={`input-color-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={row.sex} onValueChange={v => updateRow(i, "sex", v)}>
                        <SelectTrigger className="h-8 w-24" data-testid={`select-sex-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">M</SelectItem>
                          <SelectItem value="female">F</SelectItem>
                          <SelectItem value="unknown">?</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <Select value={row.breed === "Other" || !TNR_BREED_OPTIONS.some(o => o.value === row.breed) ? "Other" : row.breed} onValueChange={v => { updateRow(i, "breed", v); if (v !== "Other") updateRow(i, "customBreed", ""); }}>
                          <SelectTrigger className="h-8 w-24" data-testid={`select-breed-${i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TNR_BREED_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(row.breed === "Other" || !TNR_BREED_OPTIONS.some(o => o.value === row.breed)) && (
                          <Input className="h-8 w-28" value={row.customBreed} onChange={e => updateRow(i, "customBreed", e.target.value)} placeholder="Breed" data-testid={`input-custom-breed-${i}`} />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={row.ageGroup} onValueChange={v => updateRow(i, "ageGroup", v)}>
                        <SelectTrigger className="h-8 w-24" data-testid={`select-age-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Adult">Adult</SelectItem>
                          <SelectItem value="Kitten">Kitten</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Checkbox checked={row.snCompleted} onCheckedChange={v => updateRow(i, "snCompleted", !!v)} data-testid={`checkbox-sn-${i}`} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Checkbox checked={row.earTipped} onCheckedChange={v => updateRow(i, "earTipped", !!v)} data-testid={`checkbox-eartip-${i}`} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Checkbox checked={row.rabiesVaxGiven} onCheckedChange={v => updateRow(i, "rabiesVaxGiven", !!v)} data-testid={`checkbox-rabies-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-24" value={row.rabiesTagNumber} onChange={e => updateRow(i, "rabiesTagNumber", e.target.value)} placeholder="Tag #" data-testid={`input-rabies-tag-${i}`} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Checkbox checked={row.fvrcpVaxGiven} onCheckedChange={v => updateRow(i, "fvrcpVaxGiven", !!v)} data-testid={`checkbox-fvrcp-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={row.fivFelvResult} onValueChange={v => updateRow(i, "fivFelvResult", v)}>
                        <SelectTrigger className="h-8 w-20" data-testid={`select-fiv-felv-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIV_FELV_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-24" value={row.invoiceNumber} onChange={e => updateRow(i, "invoiceNumber", e.target.value)} placeholder="Inv #" data-testid={`input-invoice-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-36" value={row.tnrNotes} onChange={e => updateRow(i, "tnrNotes", e.target.value)} placeholder="Notes" data-testid={`input-notes-${i}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      {rows.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => removeRow(i)} data-testid={`button-remove-row-${i}`}>
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button variant="outline" onClick={addRow} size="sm" data-testid="button-add-row">
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitMutation.isPending}>Cancel</Button>
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} data-testid="button-save-batch">
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentCount({ animalId }: { animalId: string }) {
  const { data } = useQuery<{ files: any[] }>({
    queryKey: ["/api/animals", animalId, "files"],
    staleTime: 30_000,
  });
  const count = data?.files?.length ?? 0;
  if (count === 0) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px] no-default-active-elevate">
      {count}
    </Badge>
  );
}

interface TnrAttachmentsDrawerProps {
  animalId: string | null;
  animalName: string;
  open: boolean;
  onClose: () => void;
}

const TNR_CATEGORIES = ["Photo", "Rabies Certificate", "Medical Note"] as const;

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return <Paperclip className="h-4 w-4 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function TnrAttachmentsDrawer({ animalId, animalName, open, onClose }: TnrAttachmentsDrawerProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("Photo");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading } = useQuery<{ files: any[] }>({
    queryKey: ["/api/animals", animalId, "files"],
    enabled: !!animalId,
    staleTime: 30_000,
  });
  const files = data?.files ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest("DELETE", `/api/animals/${animalId}/files/${fileId}`);
      if (!res.ok) throw new Error("Failed to delete file");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/animals", animalId, "files"] });
      toast({ title: "File deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  async function handleUpload() {
    if (!selectedFile || !animalId) return;
    setIsUploading(true);
    try {
      const urlRes = await fetch(`/api/animals/${animalId}/upload-url`, {
        method: "POST",
        credentials: "include",
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const uploadInfo = await urlRes.json();

      if (uploadInfo.useServerUpload) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("description", category);
        const uploadRes = await fetch(`/api/animals/${animalId}/upload-file`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Failed to upload file");
      } else {
        const { uploadUrl, objectPath } = uploadInfo;
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: selectedFile,
          headers: { "Content-Type": selectedFile.type },
        });
        if (!putRes.ok) throw new Error("Failed to upload file");
        const saveRes = await fetch(`/api/animals/${animalId}/files`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileUrl: objectPath,
            mimeType: selectedFile.type,
            fileSize: selectedFile.size,
            description: category,
          }),
        });
        if (!saveRes.ok) throw new Error("Failed to save file record");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/animals", animalId, "files"] });
      toast({ title: "File uploaded", description: `${selectedFile.name} saved as ${category}` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Attachments
          </SheetTitle>
          <SheetDescription>
            Files attached to <span className="font-medium text-foreground">{animalName}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <Paperclip className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No files attached yet.</p>
              <p className="text-xs text-muted-foreground">Upload a photo, rabies certificate, or medical note below.</p>
            </div>
          ) : (
            files.map((file: any) => (
              <div key={file.id} className="flex items-center gap-3 rounded-md border p-3">
                <div className="shrink-0">{getFileIcon(file.mimeType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {file.description && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {file.description}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(file.uploadDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={resolveFileUrl(file.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-download-${file.id}`}
                  >
                    <Button size="icon" variant="ghost" type="button" title="Download / view">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    onClick={() => deleteMutation.mutate(file.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-file-${file.id}`}
                    title="Delete file"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t px-6 py-4 space-y-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upload New File</p>
          <div className="space-y-2">
            <Label htmlFor="tnr-file-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="tnr-file-category" data-testid="select-file-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TNR_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tnr-file-input">File</Label>
            <Input
              id="tnr-file-input"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              data-testid="input-tnr-file"
              ref={fileInputRef}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            data-testid="button-upload-tnr-file"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Paperclip className="h-4 w-4 mr-2" />}
            {isUploading ? "Uploading…" : "Upload File"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface EditRecordDialogProps {
  record: TnrRecord;
  onClose: () => void;
  onSuccess: () => void;
}

function EditRecordDialog({ record, onClose, onSuccess }: EditRecordDialogProps) {
  const { toast } = useToast();
  const [intakeDate, setIntakeDate] = useState(toDateInputValue(record.intakeDate));
  const [colonyLocation, setColonyLocation] = useState(record.colonyLocation || "");
  const [colonyName, setColonyName] = useState(record.colonyName || "");
  const [trapperName, setTrapperName] = useState(record.trapperName || "");
  const [trapNumber, setTrapNumber] = useState(record.trapNumber || "");
  const [invoiceNumber, setInvoiceNumber] = useState(record.invoiceNumber || "");
  const [surgeryLocation, setSurgeryLocation] = useState(record.surgeryLocation || "");
  const [partnership, setPartnership] = useState(record.partnership || "");
  const [earTipped, setEarTipped] = useState(record.earTipped);
  const [dateAltered, setDateAltered] = useState(toDateInputValue(record.dateAltered));
  const [rabiesTagNumber, setRabiesTagNumber] = useState(record.rabiesTagNumber || "");
  const [fvrcpVaxGiven, setFvrcpVaxGiven] = useState(record.fvrcpVaxGiven || false);
  const [fivFelvResult, setFivFelvResult] = useState(record.fivFelvResult || "not_tested");
  const [tnrOutcomeType, setTnrOutcomeType] = useState(record.tnrOutcomeType || "returned_to_colony");
  const [tnrOutcomeDate, setTnrOutcomeDate] = useState(toDateInputValue(record.tnrOutcomeDate));
  const [tnrNotes, setTnrNotes] = useState(record.tnrNotes || "");
  const initialBreed = record.breed || "Domestic Short Hair";
  const isStandardBreed = TNR_BREED_OPTIONS.some(o => o.value === initialBreed && o.value !== "Other");
  const [breed, setBreed] = useState(isStandardBreed ? initialBreed : "Other");
  const [customBreed, setCustomBreed] = useState(isStandardBreed ? "" : initialBreed);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const resolvedBreed = breed === "Other" ? (customBreed || "Domestic Short Hair") : breed;
      const res = await apiRequest("PATCH", `/api/tnr-records/${record.id}`, {
        intakeDate: intakeDate || null,
        colonyLocation, colonyName, trapperName, trapNumber, invoiceNumber, surgeryLocation, partnership, earTipped, tnrNotes,
        dateAltered: dateAltered || null,
        rabiesTagNumber, fvrcpVaxGiven, fivFelvResult,
        tnrOutcomeType, tnrOutcomeDate: tnrOutcomeDate || null,
        breed: resolvedBreed,
      });
      if (!res.ok) throw new Error("Failed to update record");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Record updated" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit TNR Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Trapping Date</Label>
              <Input id="edit-date" type="date" value={intakeDate} onChange={e => setIntakeDate(e.target.value)} data-testid="input-edit-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Trap #</Label>
              <Input value={trapNumber} onChange={e => setTrapNumber(e.target.value)} data-testid="input-edit-trap" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Colony Name</Label>
              <Input value={colonyName} onChange={e => setColonyName(e.target.value)} placeholder="e.g. Elm Street Colony" data-testid="input-edit-colony-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Colony Location</Label>
              <Input value={colonyLocation} onChange={e => setColonyLocation(e.target.value)} data-testid="input-edit-colony" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trapper Name</Label>
              <Input value={trapperName} onChange={e => setTrapperName(e.target.value)} data-testid="input-edit-trapper" />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice #</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} data-testid="input-edit-invoice" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Breed</Label>
            <div className="flex items-center gap-2">
              <Select value={breed} onValueChange={v => { setBreed(v); if (v !== "Other") setCustomBreed(""); }}>
                <SelectTrigger data-testid="select-edit-breed"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TNR_BREED_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {breed === "Other" && (
                <Input value={customBreed} onChange={e => setCustomBreed(e.target.value)} placeholder="Enter breed" data-testid="input-edit-custom-breed" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Surgery Location</Label>
              <Input value={surgeryLocation} onChange={e => setSurgeryLocation(e.target.value)} data-testid="input-edit-surgery" />
            </div>
            <div className="space-y-1.5">
              <Label>Surgery Date</Label>
              <Input type="date" value={dateAltered} onChange={e => setDateAltered(e.target.value)} data-testid="input-edit-date-altered" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Partnership / Grant</Label>
            <Input value={partnership} onChange={e => setPartnership(e.target.value)} data-testid="input-edit-partnership" />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox id="edit-ear-tipped" checked={earTipped} onCheckedChange={v => setEarTipped(!!v)} data-testid="checkbox-edit-eartip" />
              <Label htmlFor="edit-ear-tipped">Ear Tipped</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="edit-fvrcp" checked={fvrcpVaxGiven} onCheckedChange={v => setFvrcpVaxGiven(!!v)} data-testid="checkbox-edit-fvrcp" />
              <Label htmlFor="edit-fvrcp">FVRCP Given</Label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rabies Tag #</Label>
              <Input value={rabiesTagNumber} onChange={e => setRabiesTagNumber(e.target.value)} data-testid="input-edit-rabies-tag" />
            </div>
            <div className="space-y-1.5">
              <Label>FIV/FeLV Result</Label>
              <Select value={fivFelvResult} onValueChange={setFivFelvResult}>
                <SelectTrigger data-testid="select-edit-fiv-felv"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIV_FELV_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select value={tnrOutcomeType} onValueChange={setTnrOutcomeType}>
                <SelectTrigger data-testid="select-edit-outcome"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TNR_OUTCOME_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Outcome Date</Label>
              <Input type="date" value={tnrOutcomeDate} onChange={e => setTnrOutcomeDate(e.target.value)} data-testid="input-edit-outcome-date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={tnrNotes} onChange={e => setTnrNotes(e.target.value)} rows={3} data-testid="textarea-edit-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>Cancel</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-edit">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
