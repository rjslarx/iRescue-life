import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Radio, Mail, Search, XCircle, ChevronLeft, ChevronRight, MessageSquare, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";

interface CommMessage {
  id: string;
  channel: "sms" | "email";
  direction: string;
  recipientName: string | null;
  recipientAddress: string;
  subject: string | null;
  body: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  providerSid: string | null;
  errorLog: string | null;
  source: string;
  createdAt: string;
  queueId: string | null;
}

interface FeedResponse {
  messages: CommMessage[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface RecipientInfo {
  id: string;
  currentChannel: string;
  status: string;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientAddress: string;
  messageBody: string;
  subject: string | null;
  email: string | null;
  phone: string | null;
  canConvertToSms: boolean;
  canConvertToEmail: boolean;
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    received: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  };

  return (
    <Badge className={`no-default-hover-elevate no-default-active-elevate ${variants[status] || "bg-muted text-muted-foreground"}`} data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  if (channel === "sms") {
    return (
      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate gap-1" data-testid="badge-channel-sms">
        <MessageSquare className="w-3 h-3" />
        SMS
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate gap-1" data-testid="badge-channel-email">
      <Mail className="w-3 h-3" />
      Email
    </Badge>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function truncate(str: string, len: number) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}

function ConvertMessageDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  const recipientQuery = useQuery<RecipientInfo>({
    queryKey: ["/api/communications/queue", messageId, "recipient-info"],
    queryFn: async () => {
      const res = await fetch(`/api/communications/queue/${messageId}/recipient-info`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recipient info");
      return res.json();
    },
    enabled: open && !!messageId,
  });

  const info = recipientQuery.data;
  const targetChannel = info?.currentChannel === "sms" ? "email" : "sms";
  const canConvert = targetChannel === "sms" ? info?.canConvertToSms : info?.canConvertToEmail;
  const targetAddress = targetChannel === "sms" ? info?.phone : info?.email;

  useEffect(() => {
    if (info) {
      if (targetChannel === "sms") {
        setBody(stripHtml(info.messageBody));
      } else {
        setBody(info.messageBody);
      }
      setSubject(info.subject || "");
    }
  }, [info, targetChannel]);

  const convertMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/communications/queue/${messageId}/convert`, {
        channel: targetChannel,
        messageBody: body,
        subject: targetChannel === "email" ? subject : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/feed"] });
      toast({ title: "Channel converted", description: `Message will now be sent as ${targetChannel === "sms" ? "SMS" : "Email"}.` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Conversion failed", description: err?.message || "Failed to convert message channel", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-convert-message">
        <DialogHeader>
          <DialogTitle data-testid="text-convert-title">Convert Message Channel</DialogTitle>
          <DialogDescription>
            {info
              ? `Change this message from ${info.currentChannel === "sms" ? "SMS" : "Email"} to ${targetChannel === "sms" ? "SMS" : "Email"}`
              : "Loading message details..."}
          </DialogDescription>
        </DialogHeader>

        {recipientQuery.isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !info ? (
          <p className="text-sm text-destructive py-4" data-testid="text-convert-error">Failed to load message info.</p>
        ) : !info.recipientUserId ? (
          <p className="text-sm text-destructive py-4" data-testid="text-convert-no-user">
            Cannot convert: this message has no linked user record to look up alternate contact info.
          </p>
        ) : !canConvert ? (
          <div className="py-4" data-testid="text-convert-missing-contact">
            <p className="text-sm text-destructive">
              Cannot convert to {targetChannel === "sms" ? "SMS" : "Email"}: {info.recipientName || "recipient"} does not have a{" "}
              {targetChannel === "sms" ? "phone number" : "email address"} on file.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" data-testid="text-convert-recipient">{info.recipientName}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{info.recipientAddress}</span>
                  <ArrowLeftRight className="w-3 h-3" />
                  <span data-testid="text-convert-target-address">{targetAddress}</span>
                </div>
              </div>
            </div>

            {targetChannel === "email" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="convert-subject">Subject</Label>
                <Input
                  id="convert-subject"
                  data-testid="input-convert-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line..."
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="convert-body">Message Body</Label>
                {targetChannel === "sms" && (
                  <span
                    className={`text-xs ${body.length > 160 ? "text-destructive font-medium" : "text-muted-foreground"}`}
                    data-testid="text-convert-char-count"
                  >
                    {body.length}/160
                  </span>
                )}
              </div>
              <Textarea
                id="convert-body"
                data-testid="textarea-convert-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="resize-none"
              />
              {targetChannel === "sms" && body.length > 160 && (
                <p className="text-xs text-destructive" data-testid="text-convert-sms-warning">
                  SMS messages over 160 characters will be split into multiple segments and may cost more.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-convert-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => convertMutation.mutate()}
            disabled={!canConvert || !body.trim() || convertMutation.isPending || recipientQuery.isLoading}
            data-testid="button-convert-confirm"
          >
            {convertMutation.isPending ? "Converting..." : `Convert to ${targetChannel === "sms" ? "SMS" : "Email"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunicationsSwitchboardPage() {
  const { toast } = useToast();
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [convertMessageId, setConvertMessageId] = useState<string | null>(null);

  const feedQuery = useQuery<FeedResponse>({
    queryKey: ["/api/communications/feed", channelFilter, statusFilter, searchQuery, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("channel", channelFilter);
      params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", "30");
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/communications/feed?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch communications feed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const pauseQuery = useQuery<{ commsPaused: boolean }>({
    queryKey: ["/api/tenant/settings/comms-paused"],
  });

  const togglePause = useMutation({
    mutationFn: async (paused: boolean) => {
      await apiRequest("PATCH", "/api/tenant/settings/comms-paused", { commsPaused: paused });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings/comms-paused"] });
      toast({
        title: pauseQuery.data?.commsPaused ? "Outbound comms resumed" : "Outbound comms paused",
        description: pauseQuery.data?.commsPaused
          ? "All outbound messages will now be dispatched normally."
          : "All outbound SMS delivery and queued messages have been halted.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle communications pause", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/communications/queue/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/feed"] });
      toast({ title: "Message cancelled", description: "The scheduled message has been cancelled." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel message", variant: "destructive" });
    },
  });

  const isPaused = pauseQuery.data?.commsPaused ?? false;
  const messages = feedQuery.data?.messages ?? [];
  const pagination = feedQuery.data?.pagination;

  return (
    <DashboardLayout
      title="Communications Switchboard"
      description="Monitor all outbound SMS and email communications"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Communications Switchboard" },
      ]}
    >
    <div className="flex flex-col gap-4" data-testid="page-communications-switchboard">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Communications Switchboard</h1>
          <p className="text-sm text-muted-foreground">Monitor all outbound SMS and email communications</p>
        </div>
        <Card className={`${isPaused ? "border-destructive bg-destructive/5" : ""}`}>
          <CardContent className="flex items-center gap-3 p-3">
            {isPaused && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
            <div className="flex flex-col gap-0.5">
              <span className={`text-sm font-medium ${isPaused ? "text-destructive" : ""}`} data-testid="text-pause-label">
                {isPaused ? "Outbound Comms Paused" : "Outbound Comms Active"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isPaused ? "SMS delivery and queued messages halted" : "Messages are being delivered normally"}
              </span>
            </div>
            <Switch
              data-testid="switch-pause-comms"
              checked={isPaused}
              onCheckedChange={(checked) => togglePause.mutate(checked)}
              disabled={togglePause.isPending}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px]" data-testid="select-channel-filter">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                placeholder="Search by recipient or message..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {feedQuery.isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="text-empty-state">
              <Radio className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No messages found</p>
              <p className="text-xs">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Channel</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead className="hidden md:table-cell">Message</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="hidden lg:table-cell w-[160px]">Scheduled</TableHead>
                      <TableHead className="w-[160px]">Sent</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((msg) => (
                      <TableRow key={`${msg.channel}-${msg.id}`} data-testid={`row-message-${msg.id}`}>
                        <TableCell>
                          <ChannelBadge channel={msg.channel} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium" data-testid={`text-recipient-${msg.id}`}>
                              {msg.recipientName || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">{msg.recipientAddress}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col gap-0.5 max-w-sm">
                            {msg.subject && (
                              <span className="text-sm font-medium">{truncate(msg.subject, 50)}</span>
                            )}
                            <span className="text-xs text-muted-foreground">{truncate(msg.body, 80)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={msg.status} />
                          {msg.errorLog && (
                            <p className="text-xs text-destructive mt-1 max-w-[150px] truncate" title={msg.errorLog}>
                              {msg.errorLog}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(msg.scheduledFor)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(msg.sentAt)}
                        </TableCell>
                        <TableCell>
                          {msg.status === "scheduled" && msg.queueId && (
                            <div className="flex items-center gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setConvertMessageId(msg.queueId!)}
                                data-testid={`button-convert-${msg.id}`}
                                title="Convert channel"
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" data-testid={`button-cancel-${msg.id}`} title="Cancel message">
                                    <XCircle className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Cancel scheduled message?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will prevent this {msg.channel === "sms" ? "SMS" : "email"} from being sent to {msg.recipientName || msg.recipientAddress}. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="button-cancel-dialog-cancel">Keep</AlertDialogCancel>
                                    <AlertDialogAction
                                      data-testid="button-cancel-dialog-confirm"
                                      onClick={() => cancelMutation.mutate(msg.queueId!)}
                                    >
                                      Cancel Message
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 p-4 border-t">
                  <span className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                    {pagination.total} messages total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm px-2" data-testid="text-current-page">
                      Page {page} of {pagination.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage(p => p + 1)}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {convertMessageId && (
        <ConvertMessageDialog
          messageId={convertMessageId}
          open={!!convertMessageId}
          onOpenChange={(open) => { if (!open) setConvertMessageId(null); }}
        />
      )}
    </div>
    </DashboardLayout>
  );
}
