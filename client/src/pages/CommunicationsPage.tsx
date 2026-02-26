import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Mail, AlertCircle, Users, DollarSign, BookOpen, CheckCircle2, Sparkles, FileText, Inbox, Archive, Paperclip, ExternalLink, Newspaper, MessageSquare, ArrowUpRight, ArrowDownLeft, Phone } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import { formatDistanceToNow, format } from "date-fns";

type RecipientType = 'team' | 'donors' | 'newsletter' | 'custom';
type EmailStatus = "unprocessed" | "processed" | "archived";

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: 'animal' | 'event' | 'newsletter' | 'donation';
  variables: string[];
}

export default function CommunicationsPage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  
  // Email Campaigns state
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientType[]>([]);
  const [customEmails, setCustomEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // Email Inbox state
  const [selectedStatus, setSelectedStatus] = useState<EmailStatus | "all">("all");
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");

  // SMS Log state
  const [smsDirection, setSmsDirection] = useState("");
  const [smsStatus, setSmsStatus] = useState("");
  const [smsMessageType, setSmsMessageType] = useState("");
  const [smsSearch, setSmsSearch] = useState("");
  const [selectedSmsLog, setSelectedSmsLog] = useState<any>(null);
  const [smsDetailOpen, setSmsDetailOpen] = useState(false);
  const [linkedAnimalId, setLinkedAnimalId] = useState<string | null>(null);

  // Fetch tenant settings
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

  // State for selected sender address
  const [selectedSenderEmail, setSelectedSenderEmail] = useState<string>("");

  // Fetch email sender configuration (Google Workspace or Resend)
  const { data: emailSenderData, isLoading: senderLoading, error: senderError } = useQuery<{ 
    provider: 'gmail' | 'resend' | 'platform';
    senderName: string;
    senderEmail: string;
    senderAddresses?: Array<{ name: string; email: string; isDefault?: boolean }>;
  }>({
    queryKey: ['/api/emails/sender-info'],
  });

  // Fetch newsletter subscribers
  const { data: subscribersData } = useQuery<{ activeCount: number }>({
    queryKey: ['/api/newsletter/subscribers'],
  });

  // Fetch email templates
  const { data: templatesData } = useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ['/api/email-templates'],
  });

  // Fetch inbound emails
  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ['/api/inbound-emails', selectedStatus !== "all" ? selectedStatus : undefined],
    queryFn: selectedStatus === "all" 
      ? undefined 
      : () => fetch(`/api/inbound-emails?status=${selectedStatus}`).then(r => r.json()),
  });

  // Fetch all animals for linking
  const { data: animalsData } = useQuery<{ animals: any[] }>({
    queryKey: ['/api/animals'],
  });

  // Build SMS log query params
  const smsQueryParams = new URLSearchParams();
  if (smsDirection) smsQueryParams.set('direction', smsDirection);
  if (smsStatus) smsQueryParams.set('status', smsStatus);
  if (smsMessageType) smsQueryParams.set('messageType', smsMessageType);
  if (smsSearch) smsQueryParams.set('search', smsSearch);
  const smsQueryString = smsQueryParams.toString();

  // Fetch SMS logs
  const { data: smsLogsRaw, isLoading: smsLoading } = useQuery<any>({
    queryKey: ['/api/sms/logs', smsDirection, smsStatus, smsMessageType, smsSearch],
    queryFn: () => fetch(`/api/sms/logs${smsQueryString ? `?${smsQueryString}` : ''}`).then(r => r.json()),
  });
  const smsLogs: any[] = Array.isArray(smsLogsRaw) ? smsLogsRaw : [];

  // Admin-only access check
  if (!user || user.activeRole !== 'admin') {
    return (
      <DashboardLayout
        title="Access Denied"
        description=""
      >
        <div className="flex-1 overflow-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Access Denied: Communications are only available to administrators.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      // Get sender info for the payload
      const senderAddress = emailSenderData?.senderAddresses?.find(a => a.email === selectedSenderEmail) || 
                           emailSenderData?.senderAddresses?.find(a => a.isDefault);
      
      const basePayload = {
        recipientTypes: selectedRecipients,
        customEmails: customEmails ? customEmails.split(',').map(e => e.trim()).filter(Boolean) : undefined,
        subject,
        // Include selected sender if available
        ...(senderAddress ? { fromName: senderAddress.name, fromEmail: senderAddress.email } : {}),
      };

      const payload = useTemplate ? {
        ...basePayload,
        templateId: selectedTemplateId,
        templateVariables,
      } : {
        ...basePayload,
        htmlBody: body.replace(/\n/g, '<br>'),
      };

      const response = await apiRequest('POST', '/api/emails/send', payload);
      return response.json();
    },
    onSuccess: (data) => {
      setShowSuccess(true);
      toast({
        title: "Email campaign sent!",
        description: `Successfully sent ${data.sent} email${data.sent !== 1 ? 's' : ''} to recipients.`,
      });
      setSelectedRecipients([]);
      setCustomEmails("");
      setSubject("");
      setBody("");
      setSelectedTemplateId("");
      setTemplateVariables({});
      setTimeout(() => setShowSuccess(false), 10000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send campaign",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('PATCH', `/api/inbound-emails/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbound-emails'] });
      setViewDialogOpen(false);
    },
  });

  const handleSendCampaign = () => {
    if (!subject.trim()) {
      toast({
        title: "Missing subject",
        description: "Please provide an email subject.",
        variant: "destructive",
      });
      return;
    }

    if (!useTemplate && !body.trim()) {
      toast({
        title: "Missing body",
        description: "Please provide email content.",
        variant: "destructive",
      });
      return;
    }

    if (useTemplate && !selectedTemplateId) {
      toast({
        title: "No template selected",
        description: "Please select an email template.",
        variant: "destructive",
      });
      return;
    }

    if (selectedRecipients.length === 0 && !customEmails.trim()) {
      toast({
        title: "No recipients",
        description: "Please select at least one recipient group or add custom email addresses.",
        variant: "destructive",
      });
      return;
    }

    sendCampaignMutation.mutate();
  };

  const handleViewEmail = async (email: any) => {
    const response = await fetch(`/api/inbound-emails/${email.id}`);
    const data = await response.json();
    setSelectedEmail(data.email);
    setNotes(data.email.notes || "");
    setLinkedAnimalId(data.email.linkedAnimalId);
    setViewDialogOpen(true);
  };

  const handleMarkProcessed = () => {
    if (selectedEmail) {
      updateEmailMutation.mutate({
        id: selectedEmail.id,
        data: {
          status: 'processed',
          notes: notes || undefined,
          linkedAnimalId: linkedAnimalId || null,
        },
      });
    }
  };

  const handleArchive = () => {
    if (selectedEmail) {
      updateEmailMutation.mutate({
        id: selectedEmail.id,
        data: { status: 'archived' },
      });
    }
  };

  const emails = emailsData?.emails || [];
  const animals = animalsData?.animals || [];
  const templates = templatesData?.templates || [];

  const toggleRecipient = (type: RecipientType) => {
    setSelectedRecipients(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unprocessed':
        return <Inbox className="w-4 h-4" />;
      case 'processed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'archived':
        return <Archive className="w-4 h-4" />;
      default:
        return <Mail className="w-4 h-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case 'unprocessed':
        return 'default';
      case 'processed':
        return 'secondary';
      case 'archived':
        return 'outline';
      default:
        return 'default';
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <DashboardLayout
      title="Communications"
      description="Send email campaigns and manage inbound emails"
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="inbox" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="inbox" data-testid="tab-inbox">
              <Inbox className="w-4 h-4 mr-2" />
              Inbox
            </TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="tab-campaigns">
              <Send className="w-4 h-4 mr-2" />
              Email Campaigns
            </TabsTrigger>
            <TabsTrigger value="sms-log" data-testid="tab-sms-log">
              <MessageSquare className="w-4 h-4 mr-2" />
              SMS Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-6 mt-6">
            {/* Newsletter Campaigns Banner */}
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20" data-testid="card-newsletter-banner">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Newspaper className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Professional Newsletter Templates</h3>
                    <p className="text-sm text-muted-foreground">
                      Create beautiful animal rescue themed newsletters with React Email templates
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/newsletter-campaigns">
                  <Button data-testid="button-newsletter-campaigns">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Newsletter Builder
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {showSuccess && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Your email campaign has been sent successfully!
                </AlertDescription>
              </Alert>
            )}

            <Card data-testid="card-email-form">
              <CardHeader>
                <CardTitle>Compose Email Campaign</CardTitle>
                <CardDescription>
                  Send newsletters, updates, and announcements to your team and supporters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* From Address Display */}
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    {senderLoading ? (
                      <p className="text-sm text-muted-foreground">Loading sender info...</p>
                    ) : senderError ? (
                      <p className="text-sm text-muted-foreground">Using platform defaults</p>
                    ) : emailSenderData?.senderAddresses && emailSenderData.senderAddresses.length > 1 ? (
                      <Select
                        value={selectedSenderEmail || emailSenderData.senderAddresses.find(a => a.isDefault)?.email || emailSenderData.senderAddresses[0]?.email}
                        onValueChange={setSelectedSenderEmail}
                      >
                        <SelectTrigger className="w-full h-8 mt-1" data-testid="select-sender-address">
                          <SelectValue placeholder="Select sender address" />
                        </SelectTrigger>
                        <SelectContent>
                          {emailSenderData.senderAddresses.map((addr, index) => (
                            <SelectItem key={index} value={addr.email} data-testid={`option-sender-${index}`}>
                              {addr.name} &lt;{addr.email}&gt;{addr.isDefault ? ' (Default)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : emailSenderData ? (
                      <p className="text-sm font-medium" data-testid="text-sender-info">
                        {emailSenderData.senderName} &lt;{emailSenderData.senderEmail}&gt;
                        <Badge variant="outline" className="ml-2 text-xs">
                          {emailSenderData.provider === 'gmail' ? 'Gmail' : emailSenderData.provider === 'resend' ? 'Resend' : 'Platform'}
                        </Badge>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Email not configured</p>
                    )}
                  </div>
                  <Link href="/dashboard/settings?tab=integrations">
                    <Button variant="ghost" size="sm" data-testid="button-change-sender">
                      {emailSenderData?.senderAddresses && emailSenderData.senderAddresses.length > 0 ? 'Manage' : 'Setup'}
                    </Button>
                  </Link>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-semibold mb-3 block">Recipients</Label>
                    <div className="grid gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="team"
                          checked={selectedRecipients.includes('team')}
                          onCheckedChange={() => toggleRecipient('team')}
                          data-testid="checkbox-team"
                        />
                        <label htmlFor="team" className="flex items-center gap-2 cursor-pointer">
                          <Users className="w-4 h-4" />
                          <span>Team Members</span>
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="donors"
                          checked={selectedRecipients.includes('donors')}
                          onCheckedChange={() => toggleRecipient('donors')}
                          data-testid="checkbox-donors"
                        />
                        <label htmlFor="donors" className="flex items-center gap-2 cursor-pointer">
                          <DollarSign className="w-4 h-4" />
                          <span>Donors</span>
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="newsletter"
                          checked={selectedRecipients.includes('newsletter')}
                          onCheckedChange={() => toggleRecipient('newsletter')}
                          data-testid="checkbox-newsletter"
                        />
                        <label htmlFor="newsletter" className="flex items-center gap-2 cursor-pointer">
                          <BookOpen className="w-4 h-4" />
                          <span>Newsletter Subscribers</span>
                          {subscribersData?.activeCount && (
                            <Badge variant="secondary" className="ml-2">
                              {subscribersData.activeCount}
                            </Badge>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customEmails">Additional Recipients (Optional)</Label>
                    <Input
                      id="customEmails"
                      placeholder="email1@example.com, email2@example.com"
                      value={customEmails}
                      onChange={(e) => setCustomEmails(e.target.value)}
                      data-testid="input-custom-emails"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple email addresses with commas
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="useTemplate"
                      checked={useTemplate}
                      onCheckedChange={(checked) => setUseTemplate(checked as boolean)}
                      data-testid="checkbox-use-template"
                    />
                    <label htmlFor="useTemplate" className="flex items-center gap-2 cursor-pointer">
                      <Sparkles className="w-4 h-4" />
                      <span>Use Email Template</span>
                    </label>
                  </div>

                  {useTemplate && templates.length > 0 && (
                    <div className="space-y-2">
                      <Label>Select Template</Label>
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Choose a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplate && (
                        <p className="text-sm text-muted-foreground">
                          {selectedTemplate.description}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input
                      id="subject"
                      placeholder="Your email subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-subject"
                    />
                  </div>

                  {!useTemplate && (
                    <div className="space-y-2">
                      <Label htmlFor="body">Email Body</Label>
                      <Textarea
                        id="body"
                        placeholder="Write your email content here..."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={12}
                        data-testid="textarea-body"
                      />
                    </div>
                  )}

                  {useTemplate && selectedTemplate && selectedTemplate.variables.length > 0 && (
                    <div className="space-y-3">
                      <Label>Template Variables</Label>
                      {selectedTemplate.variables.map((variable) => (
                        <div key={variable} className="space-y-2">
                          <Label htmlFor={`var-${variable}`} className="text-sm">
                            {variable}
                          </Label>
                          <Input
                            id={`var-${variable}`}
                            placeholder={`Enter ${variable}`}
                            value={templateVariables[variable] || ''}
                            onChange={(e) =>
                              setTemplateVariables({ ...templateVariables, [variable]: e.target.value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSendCampaign}
                  disabled={sendCampaignMutation.isPending}
                  className="w-full"
                  data-testid="button-send-campaign"
                >
                  {sendCampaignMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Email Campaign
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Inbox</CardTitle>
                <CardDescription>
                  Emails sent to your rescue at {tenantData?.tenant?.subdomain || '[subdomain]'}@mail.irescue.life
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)} className="w-full">
                  <TabsList>
                    <TabsTrigger value="all" data-testid="tab-all-emails">All</TabsTrigger>
                    <TabsTrigger value="unprocessed" data-testid="tab-unprocessed">Unprocessed</TabsTrigger>
                    <TabsTrigger value="processed" data-testid="tab-processed">Processed</TabsTrigger>
                    <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
                  </TabsList>

                  <TabsContent value={selectedStatus} className="space-y-4 mt-4">
                    {emailsLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : emails.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-center">
                        <Mail className="h-12 w-12 mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">No emails yet</h3>
                        <p className="text-muted-foreground max-w-md">
                          Emails sent to {tenantData?.tenant?.subdomain || '[subdomain]'}@mail.irescue.life will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {emails.map((email: any) => (
                          <Card 
                            key={email.id} 
                            className="hover-elevate cursor-pointer" 
                            onClick={() => handleViewEmail(email)}
                            data-testid={`card-email-${email.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {getStatusIcon(email.status)}
                                    <h3 className="font-semibold truncate">{email.subject || '(No Subject)'}</h3>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">
                                    From: {email.sender}
                                  </p>
                                  <p className="text-sm line-clamp-2">{email.body}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <Badge variant={getStatusBadgeVariant(email.status)}>
                                    {email.status}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                                  </span>
                                  {email.hasAttachments && (
                                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── SMS Log Tab ─────────────────────────────────────────── */}
          <TabsContent value="sms-log" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>SMS Communications Log</CardTitle>
                <CardDescription>
                  All automated and manual SMS messages sent and received by this organisation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filter bar */}
                <div className="flex flex-wrap gap-3 items-center">
                  <Select value={smsDirection || "all"} onValueChange={v => setSmsDirection(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-36" data-testid="select-sms-direction">
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Directions</SelectItem>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={smsStatus || "all"} onValueChange={v => setSmsStatus(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-36" data-testid="select-sms-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={smsMessageType || "all"} onValueChange={v => setSmsMessageType(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-44" data-testid="select-sms-type">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="transport_alert">Transport Alert</SelectItem>
                      <SelectItem value="proxy_message">Proxy Message</SelectItem>
                      <SelectItem value="broadcast">Broadcast</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Search recipient or animal..."
                    value={smsSearch}
                    onChange={e => setSmsSearch(e.target.value)}
                    className="w-64"
                    data-testid="input-sms-search"
                  />

                  {(smsDirection || smsStatus || smsMessageType || smsSearch) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSmsDirection(""); setSmsStatus(""); setSmsMessageType(""); setSmsSearch(""); }}
                      data-testid="button-sms-clear-filters"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>

                {/* Table */}
                {smsLoading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : !smsLogs || smsLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                    <MessageSquare className="w-10 h-10 opacity-30" />
                    <p className="font-medium">No SMS messages found</p>
                    <p className="text-sm max-w-sm">
                      SMS logs appear here once Twilio is configured and messages are sent. Try adjusting your filters.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-36">Date / Time</TableHead>
                          <TableHead className="w-10">Dir</TableHead>
                          <TableHead className="w-36">Type</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Animal</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {smsLogs.map((log: any) => (
                          <TableRow
                            key={log.id}
                            className="cursor-pointer"
                            onClick={() => { setSelectedSmsLog(log); setSmsDetailOpen(true); }}
                            data-testid={`row-sms-${log.id}`}
                          >
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {log.createdAt ? format(new Date(log.createdAt), 'MMM d, yyyy HH:mm') : '—'}
                            </TableCell>
                            <TableCell>
                              {log.direction === 'outbound'
                                ? <ArrowUpRight className="w-4 h-4 text-primary" />
                                : <ArrowDownLeft className="w-4 h-4 text-muted-foreground" />
                              }
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">
                                {(log.messageType || 'other').replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.recipientName || log.toNumber || '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.animalName
                                ? <span>{log.animalName}{log.animalLocalId ? <span className="text-xs text-muted-foreground ml-1">({log.animalLocalId})</span> : null}</span>
                                : <span className="text-muted-foreground">—</span>
                              }
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate">
                              {log.body ? log.body.slice(0, 70) + (log.body.length > 70 ? '…' : '') : '—'}
                            </TableCell>
                            <TableCell>
                              {log.status === 'delivered' && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Delivered</Badge>
                              )}
                              {log.status === 'sent' && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">Sent</Badge>
                              )}
                              {log.status === 'failed' && (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">Failed</Badge>
                              )}
                              {log.status === 'received' && (
                                <Badge variant="secondary" className="text-xs">Received</Badge>
                              )}
                              {!['delivered','sent','failed','received'].includes(log.status) && (
                                <Badge variant="outline" className="text-xs capitalize">{log.status || 'unknown'}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* SMS Detail Dialog */}
        <Dialog open={smsDetailOpen} onOpenChange={setSmsDetailOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedSmsLog?.direction === 'outbound'
                  ? <ArrowUpRight className="w-5 h-5 text-primary" />
                  : <ArrowDownLeft className="w-5 h-5 text-muted-foreground" />
                }
                SMS Detail
              </DialogTitle>
            </DialogHeader>
            {selectedSmsLog && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</Label>
                    <p>{selectedSmsLog.createdAt ? format(new Date(selectedSmsLog.createdAt), 'MMM d, yyyy HH:mm:ss') : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direction</Label>
                    <p className="capitalize">{selectedSmsLog.direction || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
                    <p className="font-mono">{selectedSmsLog.fromNumber || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</Label>
                    <p className="font-mono">{selectedSmsLog.toNumber || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</Label>
                    <p className="capitalize">{(selectedSmsLog.messageType || 'other').replace('_', ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
                    <p className="capitalize">{selectedSmsLog.status || '—'}</p>
                  </div>
                  {selectedSmsLog.recipientName && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient</Label>
                      <p>{selectedSmsLog.recipientName}{selectedSmsLog.recipientRoles?.length ? <span className="text-muted-foreground ml-1">({selectedSmsLog.recipientRoles.join(', ')})</span> : null}</p>
                    </div>
                  )}
                  {selectedSmsLog.animalName && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Animal</Label>
                      <p>{selectedSmsLog.animalName}{selectedSmsLog.animalLocalId ? <span className="text-muted-foreground ml-1">({selectedSmsLog.animalLocalId})</span> : null}</p>
                    </div>
                  )}
                  {selectedSmsLog.senderName && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent By</Label>
                      <p>{selectedSmsLog.senderName}</p>
                    </div>
                  )}
                  {selectedSmsLog.twilioMessageSid && (
                    <div className="col-span-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Twilio SID</Label>
                      <p className="font-mono text-xs break-all">{selectedSmsLog.twilioMessageSid}</p>
                    </div>
                  )}
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Message Body</Label>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                    {selectedSmsLog.body || '(no body)'}
                  </div>
                </div>
                {selectedSmsLog.errorMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{selectedSmsLog.errorMessage}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedEmail?.subject || '(No Subject)'}</DialogTitle>
            </DialogHeader>
            {selectedEmail && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">From</Label>
                  <p className="text-sm">{selectedEmail.sender}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Received</Label>
                  <p className="text-sm">
                    {new Date(selectedEmail.receivedAt).toLocaleString()}
                  </p>
                </div>
                {selectedEmail.recipients && selectedEmail.recipients.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold">To</Label>
                    <p className="text-sm">{selectedEmail.recipients.join(', ')}</p>
                  </div>
                )}
                <Separator />
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Email Body</Label>
                  <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                    {selectedEmail.textBody}
                  </div>
                </div>
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Attachments</Label>
                    <div className="space-y-2">
                      {selectedEmail.attachments.map((attachment: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <Paperclip className="w-4 h-4" />
                          <span className="text-sm">{attachment.filename}</span>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="email-notes">Notes</Label>
                  <Textarea
                    id="email-notes"
                    placeholder="Add notes about this email..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linked-animal">Link to Animal (Optional)</Label>
                  <Select value={linkedAnimalId || undefined} onValueChange={setLinkedAnimalId}>
                    <SelectTrigger id="linked-animal">
                      <SelectValue placeholder="Select an animal" />
                    </SelectTrigger>
                    <SelectContent>
                      {animals.map((animal) => (
                        <SelectItem key={animal.id} value={animal.id}>
                          {animal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleMarkProcessed}
                    disabled={updateEmailMutation.isPending}
                    data-testid="button-mark-processed"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Mark as Processed
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleArchive}
                    disabled={updateEmailMutation.isPending}
                    data-testid="button-archive"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
