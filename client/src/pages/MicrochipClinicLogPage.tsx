import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, ScanLine, Download, Search } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

const SERVICES: { key: keyof FormValues; label: string; short: string }[] = [
  { key: "dhppGiven", label: "DHPP", short: "DHPP" },
  { key: "bordetellaGiven", label: "Bordetella", short: "Bord" },
  { key: "rabiesGiven", label: "Rabies", short: "Rab" },
  { key: "painMedsGiven", label: "Pain Meds", short: "Pain" },
  { key: "nailTrimDone", label: "Nail Trim", short: "Nail" },
  { key: "fleaMedsGiven", label: "Flea Meds", short: "Flea" },
];

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

function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function MicrochipClinicLogPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MicrochipClinicRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
  });

  const records = data?.records || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
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
  }, [records, search]);

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
          values.dogLitters === null || values.dogLitters === undefined || (values.dogLitters as any) === ""
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
    onError: (err: any) => {
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
    onError: (err: any) => {
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

  return (
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
                  <TableHead>Date</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Dog</TableHead>
                  <TableHead>Microchip #</TableHead>
                  <TableHead>Services</TableHead>
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
                    <TableCell>
                      <div className="font-medium" data-testid={`text-dog-${r.id}`}>
                        {r.dogName || <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[r.dogColor, r.dogGender, r.dogAge].filter(Boolean).join(" • ")}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-chip-${r.id}`}>
                      {r.microchipNumber || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {SERVICES.filter((s) => (r as any)[s.key]).map((s) => (
                          <Badge key={s.key} variant="secondary" className="text-xs">
                            {s.short}
                          </Badge>
                        ))}
                      </div>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(r.id)}
                        data-testid={`button-delete-${r.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                      name={s.key as any}
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
  );
}
