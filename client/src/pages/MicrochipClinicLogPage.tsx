import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  ScanLine,
  Download,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/not-found";
import type { MicrochipClinicRecord } from "@shared/schema";

const formSchema = z.object({
  clinicDate: z.string().min(1, "Clinic date is required"),
  ownerName: z.string().optional().nullable(),
  ownerAddress: z.string().optional().nullable(),
  ownerEmail: z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  ownerPhone1: z.string().optional().nullable(),
  ownerPhone2: z.string().optional().nullable(),
  dogName: z.string().optional().nullable(),
  dogAge: z.string().optional().nullable(),
  dogGender: z.string().optional().nullable(),
  dogColor: z.string().optional().nullable(),
  dogLitters: z.coerce.number().int().min(0).optional().nullable(),
  microchipNumber: z.string().optional().nullable(),
  invoiceOrNotes: z.string().optional().nullable(),
  dhppGiven: z.boolean().default(false),
  bordetellaGiven: z.boolean().default(false),
  rabiesGiven: z.boolean().default(false),
  painMedsGiven: z.boolean().default(false),
  nailTrimDone: z.boolean().default(false),
  fleaMedsGiven: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

type ServiceKey =
  | "dhppGiven"
  | "bordetellaGiven"
  | "rabiesGiven"
  | "painMedsGiven"
  | "nailTrimDone"
  | "fleaMedsGiven";

const SERVICES: { key: ServiceKey; label: string; short: string }[] = [
  { key: "dhppGiven", label: "DHPP Vaccine", short: "DHPP" },
  { key: "bordetellaGiven", label: "Bordetella Vaccine", short: "Bord" },
  { key: "rabiesGiven", label: "Rabies Vaccine", short: "Rab" },
  { key: "painMedsGiven", label: "Pain Medication", short: "Pain" },
  { key: "nailTrimDone", label: "Nail Trim", short: "Nail" },
  { key: "fleaMedsGiven", label: "Flea Medication", short: "Flea" },
];

type SortKey =
  | "clinicDate"
  | "ownerName"
  | "dogName"
  | "microchipNumber"
  | "dogLitters";
type SortDir = "asc" | "desc";

function emptyDefaults(): FormValues {
  return {
    clinicDate: format(new Date(), "yyyy-MM-dd"),
    ownerName: "",
    ownerAddress: "",
    ownerEmail: "",
    ownerPhone1: "",
    ownerPhone2: "",
    dogName: "",
    dogAge: "",
    dogGender: "",
    dogColor: "",
    dogLitters: null,
    microchipNumber: "",
    invoiceOrNotes: "",
    dhppGiven: false,
    bordetellaGiven: false,
    rabiesGiven: false,
    painMedsGiven: false,
    nailTrimDone: false,
    fleaMedsGiven: false,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface SortableHeadProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}

function SortableHead({ label, sortKey, current, direction, onSort, className }: SortableHeadProps) {
  const isActive = current === sortKey;
  const Icon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground font-medium"
        data-testid={`sort-${sortKey}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

export default function MicrochipClinicLogPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.activeRole;
  const canDelete = role === "admin" || role === "owner";

  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MicrochipClinicRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("clinicDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: tenantData, isLoading: tenantLoading } = useQuery<{
    tenant: { microchipClinicEnabled?: boolean };
  }>({
    queryKey: ["/api/tenant"],
  });

  const featureEnabled = tenantData?.tenant?.microchipClinicEnabled === true;

  const { data, isLoading } = useQuery<{ records: MicrochipClinicRecord[] }>({
    queryKey: ["/api/microchip-clinic-records", monthFilter],
    queryFn: async () => {
      const url = monthFilter
        ? `/api/microchip-clinic-records?month=${monthFilter}`
        : "/api/microchip-clinic-records";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: featureEnabled,
  });

  const records = data?.records || [];

  const filtered = useMemo(() => {
    let list = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        [
          r.ownerName,
          r.dogName,
          r.microchipNumber,
          r.ownerPhone1,
          r.ownerPhone2,
          r.ownerEmail,
          r.dogColor,
          r.invoiceOrNotes,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [records, search, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "clinicDate" ? "desc" : "asc");
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyDefaults(),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(emptyDefaults());
    setDialogOpen(true);
  };

  const openEdit = (record: MicrochipClinicRecord) => {
    setEditing(record);
    form.reset({
      clinicDate: record.clinicDate,
      ownerName: record.ownerName ?? "",
      ownerAddress: record.ownerAddress ?? "",
      ownerEmail: record.ownerEmail ?? "",
      ownerPhone1: record.ownerPhone1 ?? "",
      ownerPhone2: record.ownerPhone2 ?? "",
      dogName: record.dogName ?? "",
      dogAge: record.dogAge ?? "",
      dogGender: record.dogGender ?? "",
      dogColor: record.dogColor ?? "",
      dogLitters: record.dogLitters,
      microchipNumber: record.microchipNumber ?? "",
      invoiceOrNotes: record.invoiceOrNotes ?? "",
      dhppGiven: record.dhppGiven,
      bordetellaGiven: record.bordetellaGiven,
      rabiesGiven: record.rabiesGiven,
      painMedsGiven: record.painMedsGiven,
      nailTrimDone: record.nailTrimDone,
      fleaMedsGiven: record.fleaMedsGiven,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        ownerEmail: values.ownerEmail || null,
        dogLitters:
          values.dogLitters === null ||
          values.dogLitters === undefined ||
          Number.isNaN(values.dogLitters as number)
            ? null
            : Number(values.dogLitters),
      };
      if (editing) {
        const res = await apiRequest("PATCH", `/api/microchip-clinic-records/${editing.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/microchip-clinic-records", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/microchip-clinic-records"] });
      toast({
        title: editing ? "Record updated" : "Record added",
        description: editing
          ? "Microchip clinic record updated successfully."
          : "Microchip clinic record added successfully.",
      });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save record",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/microchip-clinic-records/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/microchip-clinic-records"] });
      toast({ title: "Record deleted" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => saveMutation.mutate(values);

  const handleExportCsv = () => {
    const headers = [
      "Clinic Date",
      "Owner Name",
      "Owner Address",
      "Owner Email",
      "Owner Phone 1",
      "Owner Phone 2",
      "Dog Name",
      "Dog Age",
      "Dog Gender",
      "Dog Color",
      "# Litters",
      "Microchip #",
      "Invoice / Notes",
      "DHPP",
      "Bordetella",
      "Rabies",
      "Pain Meds",
      "Nail Trim",
      "Flea Meds",
    ];
    const rows = filtered.map((r) => [
      r.clinicDate,
      r.ownerName,
      r.ownerAddress,
      r.ownerEmail,
      r.ownerPhone1,
      r.ownerPhone2,
      r.dogName,
      r.dogAge,
      r.dogGender,
      r.dogColor,
      r.dogLitters,
      r.microchipNumber,
      r.invoiceOrNotes,
      r.dhppGiven ? "Yes" : "No",
      r.bordetellaGiven ? "Yes" : "No",
      r.rabiesGiven ? "Yes" : "No",
      r.painMedsGiven ? "Yes" : "No",
      r.nailTrimDone ? "Yes" : "No",
      r.fleaMedsGiven ? "Yes" : "No",
    ]);
    const csv =
      headers.map(csvEscape).join(",") +
      "\n" +
      rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `microchip-clinic-log-${monthFilter || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Direct-URL guard: when the feature is disabled for this tenant, render 404.
  if (tenantLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-sm text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }
  if (!featureEnabled) {
    return <NotFound />;
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ScanLine className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
                Microchip Clinic Log
              </h1>
              <p className="text-sm text-muted-foreground">
                Track dogs and owners served at community microchip clinics. Records are kept
                separate from the rescue's animal database.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleExportCsv} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={openCreate} data-testid="button-add-record">
              <Plus className="h-4 w-4 mr-2" />
              Add Record
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by owner, dog, microchip #, phone..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                data-testid="input-month-filter"
              />
            </div>
            {monthFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMonthFilter("")}
                data-testid="button-clear-month-filter"
              >
                Clear month filter
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-3">
              <span>Records</span>
              <Badge variant="secondary" data-testid="badge-record-count">
                {filtered.length} {filtered.length === 1 ? "record" : "records"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <div className="text-sm text-muted-foreground p-4">Loading records...</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground p-8 text-center">
                No records yet. Click "Add Record" to log your first microchip clinic entry.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Date" sortKey="clinicDate" current={sortKey} direction={sortDir} onSort={onSort} />
                    <SortableHead label="Owner" sortKey="ownerName" current={sortKey} direction={sortDir} onSort={onSort} />
                    <TableHead>Phone</TableHead>
                    <SortableHead label="Dog" sortKey="dogName" current={sortKey} direction={sortDir} onSort={onSort} />
                    <TableHead>Age</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Color</TableHead>
                    <SortableHead label="# Litters" sortKey="dogLitters" current={sortKey} direction={sortDir} onSort={onSort} />
                    <SortableHead label="Microchip #" sortKey="microchipNumber" current={sortKey} direction={sortDir} onSort={onSort} />
                    <TableHead>Services</TableHead>
                    <TableHead>Invoice / Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} data-testid={`row-record-${r.id}`}>
                      <TableCell className="whitespace-nowrap" data-testid={`text-date-${r.id}`}>
                        {r.clinicDate}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium" data-testid={`text-owner-${r.id}`}>
                          {r.ownerName || <span className="text-muted-foreground">—</span>}
                        </div>
                        {r.ownerEmail && (
                          <div className="text-xs text-muted-foreground">{r.ownerEmail}</div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {r.ownerPhone1 || <span className="text-muted-foreground">—</span>}
                        {r.ownerPhone2 && (
                          <div className="text-xs text-muted-foreground">{r.ownerPhone2}</div>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-dog-${r.id}`}>
                        {r.dogName || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.dogAge || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.dogGender || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.dogColor || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-center" data-testid={`text-litters-${r.id}`}>
                        {r.dogLitters ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs" data-testid={`text-chip-${r.id}`}>
                        {r.microchipNumber || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {SERVICES.map((s) => {
                            const given = r[s.key];
                            return (
                              <Tooltip key={s.key}>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant={given ? "default" : "outline"}
                                    className={
                                      given
                                        ? "text-xs"
                                        : "text-xs opacity-40 text-muted-foreground"
                                    }
                                    data-testid={`badge-service-${s.key}-${r.id}`}
                                  >
                                    {s.short}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {s.label}: {given ? "Given" : "Not given"}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-sm max-w-xs truncate"
                        title={r.invoiceOrNotes ?? undefined}
                        data-testid={`text-notes-${r.id}`}
                      >
                        {r.invoiceOrNotes || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(r)}
                          data-testid={`button-edit-${r.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteId(r.id)}
                            data-testid={`button-delete-${r.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Record" : "Add Microchip Clinic Record"}</DialogTitle>
              <DialogDescription>
                Log a dog and owner served at a community microchip clinic.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="clinicDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinic Date *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-clinic-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="microchipNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Microchip #</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-microchip"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Owner
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="ownerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Owner Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-owner-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ownerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-owner-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ownerPhone1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone 1</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-owner-phone1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ownerPhone2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone 2</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-owner-phone2"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ownerAddress"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-owner-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Dog
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="dogName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dog Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-dog-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dogAge"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 3 years"
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-dog-age"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dogGender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ""}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-dog-gender">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Male (Neutered)">Male (Neutered)</SelectItem>
                              <SelectItem value="Female (Spayed)">Female (Spayed)</SelectItem>
                              <SelectItem value="Unknown">Unknown</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dogColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              data-testid="input-dog-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dogLitters"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel># of Litters</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? null : Number(e.target.value))
                              }
                              data-testid="input-dog-litters"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Services Provided
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {SERVICES.map((s) => (
                      <FormField
                        key={s.key}
                        control={form.control}
                        name={s.key}
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0 rounded-md border p-3">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                data-testid={`checkbox-${s.key}`}
                              />
                            </FormControl>
                            <Label className="cursor-pointer font-normal">{s.label}</Label>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="invoiceOrNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice # / Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    data-testid="button-save"
                  >
                    {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Add Record"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this record?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The microchip clinic record will be permanently
                removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
