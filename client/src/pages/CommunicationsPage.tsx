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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Mail, AlertCircle, Users, DollarSign, BookOpen, CheckCircle2, Sparkles, FileText, Inbox, Archive, Paperclip, ExternalLink, Newspaper } from "lucide-react";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "isomorphic-dompurify";

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
        <Tabs defaultValue="campaigns" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="campaigns" data-testid="tab-campaigns">
              <Send className="w-4 h-4 mr-2" />
              Email Campaigns
            </TabsTrigger>
            <TabsTrigger value="inbox" data-testid="tab-inbox">
              <Inbox className="w-4 h-4 mr-2" />
              Inbox
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
                                    From: {email.fromName || email.from || 'Unknown'}
                                  </p>
                                  <p className="text-sm line-clamp-2">{email.textBody || '(No preview available)'}</p>
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
        </Tabs>

        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedEmail?.subject || '(No Subject)'}</DialogTitle>
            </DialogHeader>
            {selectedEmail && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">From</Label>
                  <p className="text-sm">{selectedEmail.fromName || selectedEmail.from || 'Unknown'}</p>
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
                    {selectedEmail.htmlBody ? (
                      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmail.htmlBody) }} />
                    ) : (
                      selectedEmail.textBody || '(No content)'
                    )}
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
