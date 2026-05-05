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
  Calendar,
  CheckCircle2,
  Eye,
  FileText,
  Heart,
  ImageIcon,
  Loader2,
  Lock,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Shield,
  Stethoscope,
} from "lucide-react";
import { HeartwormTreatmentModal } from "@/components/HeartwormTreatmentModal";
import { HeartwormWatchHelp } from "@/components/dashboard/HeartwormWatchHelp";
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

type EngagementStatus =
  | "no_response"
  | "email_opened"
  | "link_clicked"
  | "proof_uploaded";

interface RecentlyWarnedItem {
  warningId: string;
  animalId: string;
  animalName: string;
  itemId: string;
  careName: string;
  dueDate: string;
  daysOverdue: number;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  sentAt: string;
  deadlineDate: string;
  emailOpenedAt: string | null;
  linkClickedAt: string | null;
  proofUploadedAt: string | null;
  engagementStatus: EngagementStatus;
}

interface MonthlyWarningStats {
  warningsSent: number;
  proofUploaded: number;
  emailsOpened: number;
  linksClicked: number;
  monthLabel: string;
}

interface WarningsResponse {
  candidates: WarningCandidate[];
  recentlyWarned?: RecentlyWarnedItem[];
  monthlyStats?: MonthlyWarningStats;
  deadlineDays: number;
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

  // Eligible = currently overdue items with no warning in the last 30 days.
  // We dedupe against the dedicated recently-warned list (which is sourced
  // from the warnings audit, so it is authoritative for engagement status).
  const eligible = (data?.candidates || []).filter((c) => c.warningsInLast30Days === 0);
  const recentlyWarned = data?.recentlyWarned || [];
  const stats = data?.monthlyStats;

  return (
    <div className="space-y-4">
      <HeartwormTreatmentProgressCard />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1 space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-destructive" />
              Heartworm & Parasite-Prevention Watch
            </CardTitle>
            <CardDescription>
              Adopters whose dog's parasite prevention is overdue by 14 days or more without proof of treatment.
              Warnings are auto-sent daily at 14:00 UTC and bypass the adopter's notification opt-outs because they are
              transactional contract-enforcement notices.
            </CardDescription>
            {stats && stats.warningsSent > 0 && (
              <div
                className="mt-3 flex items-center gap-2 flex-wrap text-xs"
                data-testid="text-monthly-warning-stats"
              >
                <Badge variant="secondary" className="gap-1">
                  <Send className="h-3 w-3" />
                  {stats.warningsSent} warning{stats.warningsSent === 1 ? "" : "s"} sent in {stats.monthLabel}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  {stats.proofUploaded} proof upload{stats.proofUploaded === 1 ? "" : "s"}
                  {stats.warningsSent > 0 && (
                    <span className="text-muted-foreground">
                      {" "}({Math.round((stats.proofUploaded / stats.warningsSent) * 100)}%)
                    </span>
                  )}
                </Badge>
                {stats.emailsOpened > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <MailOpen className="h-3 w-3" />
                    {stats.emailsOpened} opened
                  </Badge>
                )}
                {stats.linksClicked > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <MousePointerClick className="h-3 w-3" />
                    {stats.linksClicked} clicked
                  </Badge>
                )}
              </div>
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
                  {recentlyWarned.map((w) => (
                    <RecentlyWarnedRow key={w.warningId} item={w} />
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

const ENGAGEMENT_BADGE: Record<
  EngagementStatus,
  { label: string; icon: typeof MailOpen; className: string }
> = {
  proof_uploaded: {
    label: "Proof uploaded",
    icon: CheckCircle2,
    className:
      "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/50",
  },
  link_clicked: {
    label: "Link clicked",
    icon: MousePointerClick,
    className:
      "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50",
  },
  email_opened: {
    label: "Email opened",
    icon: MailOpen,
    className:
      "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50",
  },
  no_response: {
    label: "No response",
    icon: AlertCircle,
    className:
      "bg-muted text-muted-foreground border-border",
  },
};

function RecentlyWarnedRow({ item }: { item: RecentlyWarnedItem }) {
  const sentDaysAgo = daysSince(item.sentAt);
  const daysUntilDeadline = item.deadlineDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(item.deadlineDate + "T00:00:00").getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const status = ENGAGEMENT_BADGE[item.engagementStatus];
  const StatusIcon = status.icon;

  return (
    <div
      className="p-3 border rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3"
      data-testid={`heartworm-warned-row-${item.animalId}-${item.itemId}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium" data-testid={`text-warned-animal-${item.animalId}`}>
            {item.animalName}
          </p>
          <Badge variant="outline" className="text-xs">{item.careName}</Badge>
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />
            {item.daysOverdue}d overdue
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs gap-1 ${status.className}`}
            data-testid={`badge-engagement-${item.engagementStatus}-${item.warningId}`}
          >
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Adopter: <span className="font-medium text-foreground">{item.adopterName}</span> · Due{" "}
          {formatDate(item.dueDate)}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Send className="h-3 w-3" />
            Warned {sentDaysAgo}d ago
            {daysUntilDeadline !== null && ` · ${daysUntilDeadline}d to deadline`}
          </span>
          {item.emailOpenedAt && (
            <span
              className="flex items-center gap-1"
              data-testid={`text-opened-at-${item.warningId}`}
            >
              <MailOpen className="h-3 w-3" />
              Opened {formatDate(item.emailOpenedAt)}
            </span>
          )}
          {item.linkClickedAt && (
            <span
              className="flex items-center gap-1"
              data-testid={`text-clicked-at-${item.warningId}`}
            >
              <MousePointerClick className="h-3 w-3" />
              Clicked {formatDate(item.linkClickedAt)}
            </span>
          )}
          {item.proofUploadedAt && (
            <span
              className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
              data-testid={`text-proof-uploaded-at-${item.warningId}`}
            >
              <CheckCircle2 className="h-3 w-3" />
              Proof {formatDate(item.proofUploadedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p
          className="text-xs text-muted-foreground italic max-w-[14rem] text-right"
          data-testid={`text-warning-locked-${item.animalId}-${item.itemId}`}
        >
          Locked for 30 days after last warning
        </p>
      </div>
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

// ============================================================================
// Heartworm Treatment Progress Card (Task #152)
// ============================================================================
//
// Staff Command Center widget that surfaces every active heartworm treatment
// plan grouped by derived status. Reads from
// GET /api/heartworm-treatment-plans/summary which already does the status
// derivation server-side; this component is a thin presentational layer with
// filter chips, receipt thumbnails, and a launcher that opens the existing
// HeartwormTreatmentModal for the selected animal.

type TreatmentStatus = "overdue" | "restriction_window_active" | "on_track" | "completed";

interface TreatmentSummaryRow {
  id: string;
  animalId: string;
  animalName: string;
  animalPhotoUrl: string | null;
  adopterName: string;
  adopterEmail: string;
  adopterPhone: string | null;
  adoptionId: string | null;
  contractSentAt: string | null;
  status: TreatmentStatus;
  nextAppointment: { type: string; label: string; scheduledDate: string } | null;
  overdueAppointmentTypes: string[];
  overdueAppointmentLabels: string[];
  latestReceipt: { objectPath: string; appointmentLabel: string; completedDate: string } | null;
  hasUnverifiedAdopterCompletion: boolean;
  appointmentsTotal: number;
  appointmentsCompleted: number;
}

interface TreatmentSummaryResponse {
  plans: TreatmentSummaryRow[];
  groups: Record<TreatmentStatus, TreatmentSummaryRow[]>;
  counts: {
    overdue: number;
    restriction_window_active: number;
    on_track: number;
    completed: number;
    total: number;
    totalUnfiltered: number;
  };
}

const STATUS_META: Record<TreatmentStatus, {
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badgeVariant: "destructive" | "secondary" | "default" | "outline";
}> = {
  overdue: {
    label: "Overdue",
    description: "Plans with at least one missed appointment past its scheduled date.",
    Icon: AlertCircle,
    iconClass: "text-destructive",
    badgeVariant: "destructive",
  },
  restriction_window_active: {
    label: "Restriction window active",
    description: "First injection completed — adopter is in the strict crate-rest period until the second injection.",
    Icon: Lock,
    iconClass: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  on_track: {
    label: "On track",
    description: "All scheduled appointments are upcoming or recently completed.",
    Icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "secondary",
  },
  completed: {
    label: "Completed",
    description: "Every appointment in the plan has been logged as completed.",
    Icon: Shield,
    iconClass: "text-muted-foreground",
    badgeVariant: "outline",
  },
};

function HeartwormTreatmentProgressCard() {
  const [activeStatus, setActiveStatus] = useState<TreatmentStatus | "all">("all");
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<TreatmentSummaryRow | null>(null);

  // Always fetch the full set; filter client-side so the chips can show counts
  // without firing four separate requests.
  const { data, isLoading, error } = useQuery<TreatmentSummaryResponse>({
    queryKey: ["/api/heartworm-treatment-plans/summary"],
  });

  const plans = data?.plans ?? [];
  const counts = data?.counts;

  const filtered = plans.filter((p) => {
    if (activeStatus !== "all" && p.status !== activeStatus) return false;
    if (unverifiedOnly && !p.hasUnverifiedAdopterCompletion) return false;
    return true;
  });

  // Group filtered results by status so each section's count reflects the
  // current filter selection.
  const groupOrder: TreatmentStatus[] = [
    "overdue",
    "restriction_window_active",
    "on_track",
    "completed",
  ];
  const grouped: Record<TreatmentStatus, TreatmentSummaryRow[]> = {
    overdue: [],
    restriction_window_active: [],
    on_track: [],
    completed: [],
  };
  for (const p of filtered) grouped[p.status].push(p);

  return (
    <Card data-testid="card-heartworm-treatment-progress">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-destructive" />
              Heartworm Treatment Progress
              <HeartwormWatchHelp />
            </CardTitle>
            <CardDescription>
              All active immiticide treatment plans grouped by status. Click any plan to
              review or update appointments.
            </CardDescription>
          </div>
          {counts && (
            <Badge
              variant="outline"
              className="gap-1 shrink-0"
              data-testid="badge-treatment-total"
            >
              {counts.totalUnfiltered} active plan{counts.totalUnfiltered === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        {/* Filter chips */}
        {counts && counts.totalUnfiltered > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant={activeStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveStatus("all")}
              data-testid="button-filter-status-all"
            >
              All ({counts.total})
            </Button>
            {groupOrder.map((status) => {
              const meta = STATUS_META[status];
              const count = counts[status];
              const Icon = meta.Icon;
              return (
                <Button
                  key={status}
                  variant={activeStatus === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveStatus(status)}
                  data-testid={`button-filter-status-${status}`}
                >
                  <Icon className={`h-3.5 w-3.5 mr-1 ${activeStatus === status ? "" : meta.iconClass}`} />
                  {meta.label} ({count})
                </Button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <Checkbox
                id="filter-unverified-only"
                checked={unverifiedOnly}
                onCheckedChange={(v) => setUnverifiedOnly(v === true)}
                data-testid="checkbox-filter-unverified-only"
              />
              <Label
                htmlFor="filter-unverified-only"
                className="text-xs font-normal text-muted-foreground cursor-pointer"
              >
                Adopter-marked, not yet verified
              </Label>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive" data-testid="text-treatment-error">
            Could not load heartworm treatment plans. Please try again.
          </div>
        ) : !counts || counts.totalUnfiltered === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Stethoscope className="h-10 w-10 mx-auto mb-2" />
            <p className="font-medium">No active heartworm treatment plans</p>
            <p className="text-sm">Plans appear here once a contract is sent to the adopter.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="text-no-treatment-results">
            <p className="text-sm">No plans match the current filter.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupOrder.map((status) => {
              const rows = grouped[status];
              if (rows.length === 0) return null;
              const meta = STATUS_META[status];
              const Icon = meta.Icon;
              return (
                <div key={status} className="space-y-2" data-testid={`group-treatment-${status}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.iconClass}`} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label} ({rows.length})
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1 pl-6">
                    {meta.description}
                  </p>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <TreatmentRow
                        key={row.id}
                        row={row}
                        onOpen={() => setSelectedRow(row)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {selectedRow && (
        <HeartwormTreatmentModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedRow(null);
          }}
          animalId={selectedRow.animalId}
          animalName={selectedRow.animalName}
          adopterName={selectedRow.adopterName}
          adopterEmail={selectedRow.adopterEmail}
          adopterPhone={selectedRow.adopterPhone || undefined}
          adoptionId={selectedRow.adoptionId || undefined}
          onComplete={() => {
            setSelectedRow(null);
            queryClient.invalidateQueries({ queryKey: ["/api/heartworm-treatment-plans/summary"] });
          }}
        />
      )}
    </Card>
  );
}

function TreatmentRow({
  row,
  onOpen,
}: {
  row: TreatmentSummaryRow;
  onOpen: () => void;
}) {
  const meta = STATUS_META[row.status];
  const isImage = row.latestReceipt
    ? !/\.pdf$/i.test(row.latestReceipt.objectPath)
    : false;

  return (
    <div
      className="border rounded-md p-3 hover-elevate cursor-pointer"
      onClick={onOpen}
      data-testid={`row-treatment-plan-${row.id}`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        {/* Receipt thumbnail (or placeholder) */}
        <div className="shrink-0">
          {row.latestReceipt ? (
            isImage ? (
              <a
                href={row.latestReceipt.objectPath}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block"
                data-testid={`link-receipt-${row.id}`}
              >
                <img
                  src={row.latestReceipt.objectPath}
                  alt={`Receipt for ${row.latestReceipt.appointmentLabel}`}
                  className="h-16 w-16 rounded-md object-cover border"
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                href={row.latestReceipt.objectPath}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted text-muted-foreground"
                data-testid={`link-receipt-${row.id}`}
                title={`PDF receipt for ${row.latestReceipt.appointmentLabel}`}
              >
                <FileText className="h-6 w-6" />
              </a>
            )
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
              <ImageIcon className="h-5 w-5 opacity-40" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate" data-testid={`text-animal-name-${row.id}`}>
              {row.animalName}
            </p>
            <Badge variant={meta.badgeVariant} className="gap-1">
              <meta.Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
            {row.hasUnverifiedAdopterCompletion && (
              <Badge variant="secondary" className="gap-1" data-testid={`badge-unverified-${row.id}`}>
                <Eye className="h-3 w-3" />
                Adopter marked complete
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 text-xs">
              {row.appointmentsCompleted}/{row.appointmentsTotal} appts
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground/80">{row.adopterName}</span>
            {" · "}
            {row.adopterEmail}
            {row.adopterPhone ? ` · ${row.adopterPhone}` : ""}
          </p>

          {row.status === "overdue" && row.overdueAppointmentLabels.length > 0 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Overdue: {row.overdueAppointmentLabels.join(", ")}
              </span>
            </p>
          )}

          {row.nextAppointment && row.status !== "completed" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              Next: {row.nextAppointment.label} on {row.nextAppointment.scheduledDate}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            data-testid={`button-open-treatment-${row.id}`}
          >
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}
