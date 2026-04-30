import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Heart,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type WarningEngagementStatus =
  | "proof_uploaded"
  | "link_clicked"
  | "email_opened"
  | "no_response"
  | "sms_only"
  | "never_warned";

interface WarningEngagement {
  emailOpenedAt: string | null;
  linkClickedAt: string | null;
  proofUploadedAt: string | null;
  status: WarningEngagementStatus;
}

interface WarningCandidate {
  animalId: string;
  animalName: string;
  itemId: string;
  careName: string;
  careCategory: string;
  dueDate: string;
  daysOverdue: number;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  lastWarningAt: string | null;
  lastWarningDeadline: string | null;
  warningsInLast30Days: number;
  engagement: WarningEngagement | null;
}

interface WarningMonthlyStats {
  warningsSent: number;
  proofUploaded: number;
  emailOpened: number;
  linkClicked: number;
  monthLabel: string;
}

interface WarningsResponse {
  candidates: WarningCandidate[];
  deadlineDays: number;
  monthlyStats?: WarningMonthlyStats;
}

interface TemplateResponse {
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  isCustom: boolean;
  defaults: { emailSubject: string; emailBody: string; smsBody: string };
  deadlineDays: number;
}

const QUERY_KEY = ["/api/dashboard/adopter-compliance/heartworm-warnings"];
const TEMPLATE_KEY = ["/api/dashboard/adopter-compliance/warning-template"];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HeartwormWatchTab() {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmingCandidate, setConfirmingCandidate] = useState<WarningCandidate | null>(null);

  const { data, isLoading } = useQuery<WarningsResponse>({ queryKey: QUERY_KEY });

  const eligible = (data?.candidates || []).filter((c) => c.warningsInLast30Days === 0);
  const recentlyWarned = (data?.candidates || []).filter((c) => c.warningsInLast30Days > 0);
  const monthlyStats = data?.monthlyStats;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-destructive" />
              Heartworm & Parasite-Prevention Watch
            </CardTitle>
            <CardDescription>
              Adopters whose dog's parasite prevention is overdue by 14 days or more without proof of treatment.
              Warnings are auto-sent daily at 14:00 UTC and bypass the adopter's notification opt-outs because they are
              transactional contract-enforcement notices.
            </CardDescription>
            {monthlyStats && monthlyStats.warningsSent > 0 && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-monthly-warning-stats"
              >
                <span className="font-medium text-foreground">{monthlyStats.warningsSent}</span>{" "}
                {monthlyStats.warningsSent === 1 ? "warning" : "warnings"} sent in {monthlyStats.monthLabel} ·{" "}
                <span className="font-medium text-foreground">{monthlyStats.proofUploaded}</span> resulted in proof uploaded
                {monthlyStats.warningsSent > 0 && (
                  <span className="text-muted-foreground/80">
                    {" "}
                    ({Math.round((monthlyStats.proofUploaded / monthlyStats.warningsSent) * 100)}%)
                  </span>
                )}
              </p>
            )}
          </div>
          <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : eligible.length === 0 && recentlyWarned.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2" />
              <p className="font-medium">All adopters are current</p>
              <p className="text-sm">No parasite-prevention items are overdue by 14 days or more.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {eligible.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Eligible to warn ({eligible.length})
                  </p>
                  {eligible.map((c) => (
                    <CandidateRow
                      key={`${c.animalId}-${c.itemId}`}
                      candidate={c}
                      onSend={() => setConfirmingCandidate(c)}
                    />
                  ))}
                </div>
              )}

              {recentlyWarned.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recently warned ({recentlyWarned.length})
                  </p>
                  {recentlyWarned.map((c) => (
                    <CandidateRow
                      key={`${c.animalId}-${c.itemId}`}
                      candidate={c}
                      onSend={() => setConfirmingCandidate(c)}
                      recentlyWarned
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmSendDialog
        candidate={confirmingCandidate}
        onClose={() => setConfirmingCandidate(null)}
      />
    </div>
  );
}

function CandidateRow({
  candidate,
  onSend,
  recentlyWarned,
}: {
  candidate: WarningCandidate;
  onSend: () => void;
  recentlyWarned?: boolean;
}) {
  const lastWarnedDays = daysSince(candidate.lastWarningAt);
  const daysUntilDeadline = candidate.lastWarningDeadline
    ? Math.max(
        0,
        Math.ceil(
          (new Date(candidate.lastWarningDeadline + "T00:00:00").getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  return (
    <div
      className="p-3 border rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3"
      data-testid={`heartworm-row-${candidate.animalId}-${candidate.itemId}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium" data-testid={`text-animal-${candidate.animalId}`}>
            {candidate.animalName}
          </p>
          <Badge variant="outline" className="text-xs">{candidate.careName}</Badge>
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />
            {candidate.daysOverdue}d overdue
          </Badge>
          {recentlyWarned && (
            <Badge variant="secondary" className="text-xs">
              Warned {lastWarnedDays}d ago
              {daysUntilDeadline !== null && ` · ${daysUntilDeadline}d to deadline`}
            </Badge>
          )}
          {recentlyWarned && candidate.engagement && (
            <EngagementBadge
              engagement={candidate.engagement}
              testIdSuffix={`${candidate.animalId}-${candidate.itemId}`}
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Adopter: <span className="font-medium text-foreground">{candidate.adopterName}</span> · Due{" "}
          {formatDate(candidate.dueDate)}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {candidate.adopterEmail}
          </span>
          {candidate.adopterPhone && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {candidate.adopterPhone}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {recentlyWarned ? (
          <p
            className="text-xs text-muted-foreground italic max-w-[14rem] text-right"
            data-testid={`text-warning-locked-${candidate.animalId}-${candidate.itemId}`}
          >
            {candidate.engagement?.status === "proof_uploaded"
              ? "Resolved — proof uploaded"
              : "Locked for 30 days after last warning"}
          </p>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={onSend}
            data-testid={`button-send-warning-${candidate.animalId}-${candidate.itemId}`}
          >
            <Eye className="h-4 w-4 mr-2" />
            Review &amp; Send
          </Button>
        )}
      </div>
    </div>
  );
}

function EngagementBadge({
  engagement,
  testIdSuffix,
}: {
  engagement: WarningEngagement;
  testIdSuffix: string;
}) {
  // Render a single status badge representing the highest engagement signal we
  // have on the most recent warning. The order mirrors the backend logic in
  // `buildEngagement` so what staff see matches what we record.
  let label: string;
  let icon: React.ReactNode;
  let className: string;
  let tooltip: string | undefined;
  switch (engagement.status) {
    case "proof_uploaded":
      label = "Proof uploaded";
      icon = <CheckCircle2 className="h-3 w-3" />;
      className = "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/50";
      tooltip = engagement.proofUploadedAt
        ? `Uploaded ${new Date(engagement.proofUploadedAt).toLocaleDateString()}`
        : undefined;
      break;
    case "link_clicked":
      label = "Link clicked";
      icon = <MousePointerClick className="h-3 w-3" />;
      className = "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50";
      tooltip = engagement.linkClickedAt
        ? `Clicked ${new Date(engagement.linkClickedAt).toLocaleString()}`
        : undefined;
      break;
    case "email_opened":
      label = "Email opened";
      icon = <MailOpen className="h-3 w-3" />;
      className = "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50";
      tooltip = engagement.emailOpenedAt
        ? `Opened ${new Date(engagement.emailOpenedAt).toLocaleString()}`
        : undefined;
      break;
    case "sms_only":
      label = "SMS-only (not tracked)";
      icon = <MessageSquare className="h-3 w-3" />;
      className = "border-muted bg-muted/40 text-muted-foreground";
      break;
    case "no_response":
    default:
      label = "No response";
      icon = <AlertCircle className="h-3 w-3" />;
      className = "border-muted bg-muted/40 text-muted-foreground";
      break;
  }
  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 ${className}`}
      title={tooltip}
      data-testid={`badge-engagement-${engagement.status}-${testIdSuffix}`}
    >
      {icon}
      {label}
    </Badge>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: template, isLoading } = useQuery<TemplateResponse>({
    queryKey: TEMPLATE_KEY,
    enabled: open,
  });

  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailBody, setEmailBody] = useState<string>("");
  const [smsBody, setSmsBody] = useState<string>("");

  // Re-hydrate form whenever the dialog re-opens or the loaded template changes
  useEffect(() => {
    if (open && template) {
      setEmailSubject(template.emailSubject);
      setEmailBody(template.emailBody);
      setSmsBody(template.smsBody);
    }
  }, [open, template]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      emailSubject: string | null;
      emailBody: string | null;
      smsBody: string | null;
    }) => {
      const res = await apiRequest(
        "PUT",
        "/api/dashboard/adopter-compliance/warning-template",
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved", description: "New warnings will use the updated wording." });
      queryClient.invalidateQueries({ queryKey: TEMPLATE_KEY });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save template",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const resetToDefaults = () => {
    if (!template) return;
    // Update the form to show the defaults...
    setEmailSubject(template.defaults.emailSubject);
    setEmailBody(template.defaults.emailBody);
    setSmsBody(template.defaults.smsBody);
    // ...and persist nulls so the tenant truly falls back to defaults (so future
    // wording updates we ship in code automatically apply).
    saveMutation.mutate({ emailSubject: null, emailBody: null, smsBody: null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="button-customize-warning-template">
          <SettingsIcon className="h-4 w-4 mr-2" />
          Customize Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Heartworm Warning Template</DialogTitle>
          <DialogDescription>
            Wording sent to adopters when their dog's parasite prevention is overdue. Use the merge tokens{" "}
            <code className="text-xs">{`{{rescueName}}`}</code>,{" "}
            <code className="text-xs">{`{{adopterFirstName}}`}</code>,{" "}
            <code className="text-xs">{`{{dogName}}`}</code>,{" "}
            <code className="text-xs">{`{{deadlineDate}}`}</code>, and{" "}
            <code className="text-xs">{`{{portalLink}}`}</code> — they're filled in automatically.
            The 7-day deadline is fixed and cannot be changed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                These messages bypass the adopter's email/SMS opt-out preferences because they enforce a signed
                contract. Keep the wording firm but professional.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warning-email-subject">Email subject</Label>
              <Input
                id="warning-email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                data-testid="input-warning-email-subject"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warning-email-body">Email body</Label>
              <Textarea
                id="warning-email-body"
                rows={14}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="font-mono text-xs"
                data-testid="textarea-warning-email-body"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="warning-sms-body">SMS body</Label>
              <Textarea
                id="warning-sms-body"
                rows={4}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                className="font-mono text-xs"
                data-testid="textarea-warning-sms-body"
              />
              <p className="text-xs text-muted-foreground">
                Keep under 320 characters to avoid multi-segment SMS billing.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={resetToDefaults}
            disabled={!template || saveMutation.isPending}
            data-testid="button-reset-template-defaults"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to defaults
          </Button>
          <Button
            onClick={() =>
              saveMutation.mutate({
                emailSubject: emailSubject.trim() || null,
                emailBody: emailBody.trim() || null,
                smsBody: smsBody.trim() || null,
              })
            }
            disabled={!template || saveMutation.isPending}
            data-testid="button-save-warning-template"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PreviewResponse {
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  deadlineDate: string;
  candidate: {
    animalName: string;
    careName: string;
    dueDate: string;
    daysOverdue: number;
    adopterName: string;
    adopterEmail: string;
    adopterPhone: string | null;
    warningsInLast30Days: number;
    lastWarningAt: string | null;
  };
  availableChannels: { email: boolean; sms: boolean };
}

function ConfirmSendDialog({
  candidate,
  onClose,
}: {
  candidate: WarningCandidate | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const open = !!candidate;

  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);

  // Reset channel checkboxes whenever a new candidate is opened
  useEffect(() => {
    if (candidate) {
      setSendEmail(!!candidate.adopterEmail);
      setSendSms(!!candidate.adopterPhone);
    }
  }, [candidate?.animalId, candidate?.itemId]);

  const previewQuery = useQuery<PreviewResponse>({
    queryKey: [
      "/api/dashboard/adopter-compliance/heartworm-warnings/preview",
      candidate?.animalId,
      candidate?.itemId,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/dashboard/adopter-compliance/heartworm-warnings/preview",
        { animalId: candidate!.animalId, itemId: candidate!.itemId },
      );
      return res.json();
    },
    enabled: !!candidate,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const channels: ("email" | "sms")[] = [];
      if (sendEmail) channels.push("email");
      if (sendSms) channels.push("sms");
      const res = await apiRequest(
        "POST",
        "/api/dashboard/adopter-compliance/heartworm-warnings/send",
        { animalId: candidate!.animalId, itemId: candidate!.itemId, channels },
      );
      return res.json();
    },
    onSuccess: (result) => {
      const channels: string[] = result.channelsSent || [];
      const labelMap: Record<string, string> = { email: "Email", sms: "SMS" };
      const label = channels.map((c) => labelMap[c] || c).join(" & ");
      toast({
        title: "Warning sent",
        description: `Sent via ${label || "configured channels"}. Adopter has until ${formatDate(result.deadlineDate)} to comply.`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send warning",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const preview = previewQuery.data;
  const noChannelSelected = !sendEmail && !sendSms;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-confirm-warning">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Review &amp; Send Compliance Warning
          </DialogTitle>
          <DialogDescription>
            Review the message below, choose which channels to send through, then confirm. This message bypasses the
            adopter's notification opt-outs because it is a transactional contract-enforcement notice.
          </DialogDescription>
        </DialogHeader>

        {previewQuery.isLoading || !preview ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-muted/40">
              <p className="text-sm">
                <span className="font-medium">{preview.candidate.animalName}</span>
                {" · "}
                <span className="text-muted-foreground">{preview.candidate.careName}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Adopter: <span className="font-medium text-foreground">{preview.candidate.adopterName}</span>
                {" · "}Due {formatDate(preview.candidate.dueDate)}
                {" · "}{preview.candidate.daysOverdue} days overdue
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Compliance deadline (after sending):{" "}
                <span className="font-medium text-foreground">{formatDate(preview.deadlineDate)}</span>
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Channels
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <label
                  className={`flex items-center gap-2 ${preview.availableChannels.email ? "" : "opacity-50"}`}
                >
                  <Checkbox
                    checked={sendEmail}
                    disabled={!preview.availableChannels.email}
                    onCheckedChange={(v) => setSendEmail(v === true)}
                    data-testid="checkbox-channel-email"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email{" "}
                    <span className="text-muted-foreground text-xs">
                      ({preview.candidate.adopterEmail || "no email on file"})
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-center gap-2 ${preview.availableChannels.sms ? "" : "opacity-50"}`}
                >
                  <Checkbox
                    checked={sendSms}
                    disabled={!preview.availableChannels.sms}
                    onCheckedChange={(v) => setSendSms(v === true)}
                    data-testid="checkbox-channel-sms"
                  />
                  <span className="text-sm flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    SMS{" "}
                    <span className="text-muted-foreground text-xs">
                      ({preview.candidate.adopterPhone || "no phone on file"})
                    </span>
                  </span>
                </label>
              </div>
              {noChannelSelected && (
                <p className="text-xs text-destructive">Select at least one channel.</p>
              )}
            </div>

            {sendEmail && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email preview
                </p>
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-medium" data-testid="text-preview-email-subject">
                    {preview.emailSubject}
                  </p>
                  <pre
                    className="text-xs whitespace-pre-wrap font-sans text-foreground/90 max-h-64 overflow-y-auto"
                    data-testid="text-preview-email-body"
                  >
                    {preview.emailBody}
                  </pre>
                </div>
              </div>
            )}

            {sendSms && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SMS preview
                </p>
                <div className="rounded-md border p-3">
                  <pre
                    className="text-xs whitespace-pre-wrap font-sans text-foreground/90"
                    data-testid="text-preview-sms-body"
                  >
                    {preview.smsBody}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={sendMutation.isPending}
            data-testid="button-cancel-warning"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => sendMutation.mutate()}
            disabled={!preview || noChannelSelected || sendMutation.isPending}
            data-testid="button-confirm-send-warning"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Warning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
