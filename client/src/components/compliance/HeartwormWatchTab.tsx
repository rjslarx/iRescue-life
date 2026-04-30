import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  Heart,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
}

interface WarningsResponse {
  candidates: WarningCandidate[];
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
  const { toast } = useToast();
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const { data, isLoading } = useQuery<WarningsResponse>({ queryKey: QUERY_KEY });

  const sendMutation = useMutation({
    mutationFn: async (input: {
      animalId: string;
      itemId: string;
      channels?: ("email" | "sms")[];
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/dashboard/adopter-compliance/heartworm-warnings/send",
        input,
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
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send warning",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => setSendingKey(null),
  });

  const eligible = (data?.candidates || []).filter((c) => c.warningsInLast30Days === 0);
  const recentlyWarned = (data?.candidates || []).filter((c) => c.warningsInLast30Days > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-destructive" />
              Heartworm & Parasite-Prevention Watch
            </CardTitle>
            <CardDescription>
              Adopters whose dog's parasite prevention is overdue by 14 days or more without proof of treatment.
              Warnings are auto-sent daily at 14:00 UTC and bypass the adopter's notification opt-outs because they are
              transactional contract-enforcement notices.
            </CardDescription>
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
                      sending={sendingKey === `${c.animalId}-${c.itemId}`}
                      onSend={(channels) => {
                        setSendingKey(`${c.animalId}-${c.itemId}`);
                        sendMutation.mutate({ animalId: c.animalId, itemId: c.itemId, channels });
                      }}
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
                      sending={sendingKey === `${c.animalId}-${c.itemId}`}
                      onSend={(channels) => {
                        setSendingKey(`${c.animalId}-${c.itemId}`);
                        sendMutation.mutate({ animalId: c.animalId, itemId: c.itemId, channels });
                      }}
                      recentlyWarned
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateRow({
  candidate,
  sending,
  onSend,
  recentlyWarned,
}: {
  candidate: WarningCandidate;
  sending: boolean;
  onSend: (channels?: ("email" | "sms")[]) => void;
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
            Locked for 30 days after last warning
          </p>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => onSend()}
            disabled={sending}
            data-testid={`button-send-warning-${candidate.animalId}-${candidate.itemId}`}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Warning Now
          </Button>
        )}
      </div>
    </div>
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
