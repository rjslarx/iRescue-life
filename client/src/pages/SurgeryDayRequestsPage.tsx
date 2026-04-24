import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Loader2, Calendar as CalendarIcon, Stethoscope, ExternalLink, Plus, Trash2, Edit, UserPlus, Mail, MailCheck, MessageSquare, MessageSquareText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

type RequestRow = {
  id: string;
  status: "pending" | "approved" | "scheduled" | "declined" | "completed" | "cancelled";
  organizationName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  partnerOrganizationId: string | null;
  requestedDate: string | null;
  scheduledDate: string | null;
  internalNotes: string | null;
  declinedReason: string | null;
  signatureDataUrl: string;
  signedByName: string;
  acknowledgmentText: string;
  signedAt: string;
  submittedAt: string;
  confirmationEmailSentAt?: string | null;
  confirmationEmailSentTo?: string | null;
  reminderSmsSentAt?: string | null;
  reminderSmsSentTo?: string | null;
  animalCount?: number;
  speciesCounts?: { dog: number; cat: number; other: number };
};

type AnimalRow = {
  id: string;
  sortIndex: number;
  name: string | null;
  species: string;
  breed: string | null;
  age: string | null;
  sex: string | null;
  color: string | null;
  weight: string | null;
  spayNeuterStatus: string;
  hasMedicalIssues: boolean;
  medicalIssues: string | null;
  heartwormStatus: string;
  needsRabies: string;
};

const STATUS_LABELS: Record<RequestRow["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  scheduled: "Scheduled",
  declined: "Declined",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANTS: Record<RequestRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  scheduled: "default",
  declined: "destructive",
  completed: "outline",
  cancelled: "outline",
};

function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SurgeryDayRequestsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [partnersDialogOpen, setPartnersDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ requests: RequestRow[] }>({
    queryKey: ["/api/surgery-day-requests", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/surgery-day-requests" : `/api/surgery-day-requests?status=${statusFilter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const requests = data?.requests || [];
  const counts = requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <DashboardLayout
      title="Surgery Day Requests"
      description="Review and schedule surgery day requests submitted by partner rescues."
      actions={
        <Button variant="outline" onClick={() => setPartnersDialogOpen(true)} data-testid="button-manage-partners">
          <UserPlus className="w-4 h-4 mr-1" /> Manage Surgery Day Partners
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5" /> Requests
            </CardTitle>
            <CardDescription>
              Public submissions appear here. Click a row to view details and schedule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all" data-testid="tab-status-all">All ({requests.length})</TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-status-pending">Pending ({counts.pending || 0})</TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-status-approved">Approved ({counts.approved || 0})</TabsTrigger>
                <TabsTrigger value="scheduled" data-testid="tab-status-scheduled">Scheduled ({counts.scheduled || 0})</TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-status-completed">Completed ({counts.completed || 0})</TabsTrigger>
                <TabsTrigger value="declined" data-testid="tab-status-declined">Declined ({counts.declined || 0})</TabsTrigger>
                <TabsTrigger value="cancelled" data-testid="tab-status-cancelled">Cancelled ({counts.cancelled || 0})</TabsTrigger>
              </TabsList>
            </Tabs>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-empty-requests">
                <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No surgery day requests yet.</p>
                <p className="text-sm">Share your <code className="text-xs">/surgery-day-request</code> page with partner rescues to receive submissions.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Animals</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Scheduled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setSelectedId(r.id)}
                        data-testid={`row-request-${r.id}`}
                      >
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.submittedAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <div className="font-medium" data-testid={`text-row-org-${r.id}`}>{r.organizationName}</div>
                          {!r.partnerOrganizationId && (
                            <Badge variant="outline" className="mt-1 text-xs">Free-text</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{r.contactName}</div>
                          <div className="text-muted-foreground">{r.contactPhone}</div>
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-row-animals-${r.id}`}>
                          {(() => {
                            const total = r.animalCount ?? 0;
                            const sc = r.speciesCounts || { dog: 0, cat: 0, other: 0 };
                            const parts: string[] = [];
                            if (sc.dog) parts.push(`${sc.dog} dog${sc.dog === 1 ? "" : "s"}`);
                            if (sc.cat) parts.push(`${sc.cat} cat${sc.cat === 1 ? "" : "s"}`);
                            if (sc.other) parts.push(`${sc.other} other`);
                            const summary = parts.join(", ");
                            return (
                              <div>
                                <div className="font-medium">{total} animal{total === 1 ? "" : "s"}</div>
                                {summary && (
                                  <div className="text-xs text-muted-foreground" data-testid={`text-row-species-${r.id}`}>{summary}</div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[r.status]} data-testid={`badge-row-status-${r.id}`}>
                            {STATUS_LABELS[r.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-row-requested-${r.id}`}>
                          {r.requestedDate ? format(new Date(r.requestedDate), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.scheduledDate ? format(new Date(r.scheduledDate), "MMM d, yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedId && (
        <RequestDetailSheet
          requestId={selectedId}
          open={!!selectedId}
          onOpenChange={(o) => !o && setSelectedId(null)}
        />
      )}

      <SurgeryPartnersDialog open={partnersDialogOpen} onOpenChange={setPartnersDialogOpen} />
    </DashboardLayout>
  );
}

function RequestDetailSheet({ requestId, open, onOpenChange }: { requestId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ request: RequestRow; animals: AnimalRow[]; partner: { id: string; name: string } | null }>({
    queryKey: ["/api/surgery-day-requests", requestId, "detail"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/surgery-day-requests/${requestId}`);
      return res.json();
    },
    enabled: open,
  });

  const [status, setStatus] = useState<RequestRow["status"] | undefined>();
  const [scheduledDate, setScheduledDate] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [declinedReason, setDeclinedReason] = useState("");

  // Initialize form state when data loads. If staff hasn't set a scheduled date yet,
  // pre-fill it with the date the partner provided so they only need to click Save.
  if (data && status === undefined) {
    setStatus(data.request.status);
    setScheduledDate(data.request.scheduledDate || data.request.requestedDate || "");
    setInternalNotes(data.request.internalNotes || "");
    setDeclinedReason(data.request.declinedReason || "");
  }

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/surgery-day-requests/${requestId}`, {
        status,
        scheduledDate: scheduledDate || null,
        internalNotes,
        declinedReason: declinedReason || null,
      });
      return res.json() as Promise<{ request: RequestRow; confirmationEmail?: { sent: boolean; recipientEmail?: string; reason?: string } }>;
    },
    onSuccess: (result) => {
      if (result?.confirmationEmail?.sent) {
        toast({
          title: "Updated & email sent",
          description: `Confirmation email sent to ${result.confirmationEmail.recipientEmail}.`,
        });
      } else if (result?.confirmationEmail && result.confirmationEmail.sent === false) {
        toast({
          title: "Updated",
          description: `Request saved, but confirmation email did not send: ${result.confirmationEmail.reason || "unknown error"}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Updated", description: "Request updated" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-day-requests"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const resendEmailMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/surgery-day-requests/${requestId}/send-confirmation`);
      return res.json() as Promise<{ request: RequestRow; confirmationEmail: { sent: boolean; recipientEmail?: string } }>;
    },
    onSuccess: (result) => {
      toast({
        title: "Confirmation email sent",
        description: `Sent to ${result?.confirmationEmail?.recipientEmail || data?.request.contactEmail}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-day-requests"] });
    },
    onError: (e: any) => toast({ title: "Send failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const sendReminderSmsMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/surgery-day-requests/${requestId}/send-reminder-sms`);
      return res.json() as Promise<{ request: RequestRow; reminderSms: { sent: boolean; recipientPhone?: string } }>;
    },
    onSuccess: (result) => {
      toast({
        title: "Reminder text sent",
        description: `Sent to ${result?.reminderSms?.recipientPhone || data?.request.contactPhone}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-day-requests"] });
    },
    onError: (e: any) => toast({ title: "Send failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const saveAsPartnerMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/surgery-day-requests/${requestId}/save-as-partner`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved as partner", description: "Organization added to Surgery Day Partners list." });
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-day-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-organizations"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Surgery Day Request</SheetTitle>
          <SheetDescription>Review submission and schedule.</SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Submitter */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Submitter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="font-medium text-right" data-testid="text-detail-org">{data.request.organizationName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Contact</span>
                  <span className="text-right">{data.request.contactName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{data.request.contactPhone}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Email</span>
                  <span>{data.request.contactEmail || "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Submitted</span>
                  <span>{format(new Date(data.request.submittedAt), "PPpp")}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Date partner was told</span>
                  <span data-testid="text-detail-requested-date">
                    {data.request.requestedDate
                      ? format(new Date(data.request.requestedDate), "PPP")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4 items-center flex-wrap">
                  <span className="text-muted-foreground">Confirmation email</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {data.request.confirmationEmailSentAt ? (
                      <Badge variant="outline" className="gap-1" data-testid="badge-email-sent">
                        <MailCheck className="w-3 h-3" />
                        Sent {format(new Date(data.request.confirmationEmailSentAt), "MMM d, h:mm a")}
                        {data.request.confirmationEmailSentTo ? ` to ${data.request.confirmationEmailSentTo}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1" data-testid="badge-email-not-sent">
                        <Mail className="w-3 h-3" />
                        Not sent
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendEmailMut.mutate()}
                      disabled={
                        resendEmailMut.isPending ||
                        !data.request.contactEmail ||
                        !data.request.scheduledDate
                      }
                      title={
                        !data.request.contactEmail
                          ? "No contact email on file"
                          : !data.request.scheduledDate
                          ? "Set a scheduled date first"
                          : data.request.confirmationEmailSentAt
                          ? "Resend confirmation email"
                          : "Send confirmation email"
                      }
                      data-testid="button-resend-confirmation-email"
                    >
                      {resendEmailMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <Mail className="w-3 h-3 mr-1" />
                      {data.request.confirmationEmailSentAt ? "Resend" : "Send"}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between gap-4 items-center flex-wrap">
                  <span className="text-muted-foreground">Reminder text (day before)</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {data.request.reminderSmsSentAt ? (
                      <Badge variant="outline" className="gap-1" data-testid="badge-sms-sent">
                        <MessageSquareText className="w-3 h-3" />
                        Sent {format(new Date(data.request.reminderSmsSentAt), "MMM d, h:mm a")}
                        {data.request.reminderSmsSentTo ? ` to ${data.request.reminderSmsSentTo}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1" data-testid="badge-sms-not-sent">
                        <MessageSquare className="w-3 h-3" />
                        Not sent
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendReminderSmsMut.mutate()}
                      disabled={
                        sendReminderSmsMut.isPending ||
                        !data.request.contactPhone ||
                        !data.request.scheduledDate
                      }
                      title={
                        !data.request.contactPhone
                          ? "No contact phone on file"
                          : !data.request.scheduledDate
                          ? "Set a scheduled date first"
                          : data.request.reminderSmsSentAt
                          ? "Resend reminder text"
                          : "Send reminder text now"
                      }
                      data-testid="button-send-reminder-sms"
                    >
                      {sendReminderSmsMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {data.request.reminderSmsSentAt ? "Resend" : "Send"}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="text-muted-foreground">Linked partner</span>
                  {data.partner ? (
                    <Badge variant="outline" data-testid="badge-linked-partner">{data.partner.name}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveAsPartnerMut.mutate()}
                      disabled={saveAsPartnerMut.isPending}
                      data-testid="button-save-as-partner"
                    >
                      {saveAsPartnerMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      <Plus className="w-3 h-3 mr-1" /> Save as partner rescue
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Animals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Animals ({data.animals.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.animals.map((a, i) => (
                  <div key={a.id} className="rounded-md border p-3 text-sm space-y-1" data-testid={`detail-animal-${i}`}>
                    <div className="font-medium">#{i + 1} {a.name || "(unnamed)"} <span className="text-muted-foreground font-normal">— {humanize(a.species)}</span></div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Breed:</span> {a.breed || "—"}</div>
                      <div><span className="text-muted-foreground">Age:</span> {a.age || "—"}</div>
                      <div><span className="text-muted-foreground">Sex:</span> {humanize(a.sex)}</div>
                      <div><span className="text-muted-foreground">Weight:</span> {a.weight || "—"}</div>
                      <div><span className="text-muted-foreground">Color:</span> {a.color || "—"}</div>
                      <div><span className="text-muted-foreground">Spay/Neuter:</span> {humanize(a.spayNeuterStatus)}</div>
                      <div><span className="text-muted-foreground">Heartworm:</span> {humanize(a.heartwormStatus)}</div>
                      <div><span className="text-muted-foreground">Rabies needed:</span> {humanize(a.needsRabies)}</div>
                    </div>
                    {a.hasMedicalIssues && a.medicalIssues && (
                      <div className="text-xs mt-1">
                        <span className="text-muted-foreground">Medical issues:</span> {a.medicalIssues}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Signature */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Signature</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Signed by:</span> <span className="font-medium">{data.request.signedByName}</span></div>
                <div><span className="text-muted-foreground">Signed at:</span> {format(new Date(data.request.signedAt), "PPpp")}</div>
                <div className="rounded-md border bg-muted p-2">
                  <img src={data.request.signatureDataUrl} alt="Signature" className="max-h-32 mx-auto" data-testid="img-signature" />
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">View acknowledgment text</summary>
                  <pre className="whitespace-pre-wrap font-sans mt-2 p-2 bg-muted rounded">{data.request.acknowledgmentText}</pre>
                </details>
              </CardContent>
            </Card>

            {/* Staff actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Status & Scheduling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger data-testid="select-detail-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as RequestRow["status"][]).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled-date">Scheduled date</Label>
                  <Input id="scheduled-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} data-testid="input-detail-scheduled-date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-notes">Internal notes</Label>
                  <Textarea id="internal-notes" rows={3} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} data-testid="textarea-detail-notes" />
                </div>
                {status === "declined" && (
                  <div className="space-y-2">
                    <Label htmlFor="declined-reason">Reason for declining</Label>
                    <Textarea id="declined-reason" rows={2} value={declinedReason} onChange={(e) => setDeclinedReason(e.target.value)} data-testid="textarea-detail-declined" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-detail-close">Close</Button>
          <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !data} data-testid="button-detail-save">
            {updateMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type PartnerOrg = {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  tags: string[] | null;
};

function SurgeryPartnersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const TAG = "surgery_day_partner";
  const { data, isLoading } = useQuery<{ organizations: PartnerOrg[] }>({
    queryKey: ["/api/partner-organizations/by-tag", TAG],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/partner-organizations/by-tag/${TAG}`);
      return res.json();
    },
    enabled: open,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const resetForm = () => {
    setName(""); setContactName(""); setContactPhone(""); setContactEmail("");
    setShowAdd(false); setEditingId(null);
  };

  const startEdit = (org: PartnerOrg) => {
    setEditingId(org.id);
    setName(org.name);
    setContactName(org.contactName || "");
    setContactPhone(org.contactPhone || "");
    setContactEmail(org.contactEmail || "");
    setShowAdd(true);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/partner-organizations/by-tag", TAG] });
    queryClient.invalidateQueries({ queryKey: ["/api/partner-organizations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/public/surgery-day-partners"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/partner-organizations", {
        name,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        tags: [TAG],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Partner added" });
      resetForm();
      invalidateAll();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No partner to update");
      const res = await apiRequest("PATCH", `/api/partner-organizations/${editingId}`, {
        name,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Partner updated" });
      resetForm();
      invalidateAll();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: async (org: PartnerOrg) => {
      const res = await apiRequest("DELETE", `/api/partner-organizations/${org.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Partner archived", description: "Removed from the surgery day partner list." });
      invalidateAll();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Surgery Day Partners</DialogTitle>
          <DialogDescription>
            These rescues appear in the Surgery Day Request form's partner dropdown. Add, edit, or archive them here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center mb-2">
          <div className="text-sm text-muted-foreground">
            {data?.organizations?.length || 0} partner{data?.organizations?.length === 1 ? "" : "s"}
          </div>
          {!showAdd && (
            <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }} data-testid="button-add-surgery-partner">
              <Plus className="w-3 h-3 mr-1" /> Add partner
            </Button>
          )}
        </div>

        {showAdd && (
          <div className="rounded-md border p-3 space-y-2 mb-2" data-testid="card-partner-form">
            <div className="text-sm font-medium">{editingId ? "Edit partner" : "Add partner"}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="add-name">Name *</Label>
                <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-add-partner-name" />
              </div>
              <div>
                <Label htmlFor="add-contact">Contact name</Label>
                <Input id="add-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="input-add-partner-contact" />
              </div>
              <div>
                <Label htmlFor="add-phone">Phone</Label>
                <Input id="add-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} data-testid="input-add-partner-phone" />
              </div>
              <div>
                <Label htmlFor="add-email">Email</Label>
                <Input id="add-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} data-testid="input-add-partner-email" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={resetForm} data-testid="button-cancel-add-partner">Cancel</Button>
              {editingId ? (
                <Button
                  size="sm"
                  onClick={() => updateMut.mutate()}
                  disabled={updateMut.isPending || !name.trim()}
                  data-testid="button-save-partner"
                >
                  {updateMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Save
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || !name.trim()}
                  data-testid="button-confirm-add-partner"
                >
                  {createMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Add
                </Button>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.organizations || []).length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-empty-partners">
            No surgery day partners yet.
          </div>
        ) : (
          <div className="rounded-md border max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.organizations || []).map((org) => (
                  <TableRow key={org.id} data-testid={`row-partner-${org.id}`}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-sm">
                      {org.contactName || "—"}
                      {org.contactPhone && <div className="text-muted-foreground text-xs">{org.contactPhone}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(org)}
                          data-testid={`button-edit-partner-${org.id}`}
                          title="Edit partner"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Archive "${org.name}"? This removes them from the surgery day program.`)) {
                              archiveMut.mutate(org);
                            }
                          }}
                          disabled={archiveMut.isPending}
                          data-testid={`button-remove-partner-${org.id}`}
                          title="Archive partner"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-partners">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
