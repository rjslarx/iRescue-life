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
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Mail, AlertCircle, Users, DollarSign, BookOpen, CheckCircle2, Sparkles, FileText, Heart } from "lucide-react";
import type { Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

type RecipientType = 'team' | 'donors' | 'newsletter' | 'adopters' | 'custom';

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: 'animal' | 'event' | 'newsletter' | 'donation';
  variables: string[];
}

export default function EmailCampaignPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientType[]>([]);
  const [customEmails, setCustomEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Template state
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // All hooks must be called before any conditional returns
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant/settings'],
  });

  const { data: subscribersData } = useQuery<{ activeCount: number }>({
    queryKey: ['/api/newsletter/subscribers'],
  });

  const { data: adoptersData } = useQuery<{ count: number }>({
    queryKey: ['/api/adopters/count'],
  });

  const { data: templatesData } = useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ['/api/email-templates'],
  });

  // Admin-only access check - AFTER all hooks are called
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
              Access Denied: Email campaigns are only available to administrators.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      const payload = useTemplate ? {
        recipientTypes: selectedRecipients,
        customEmails: customEmails ? customEmails.split(',').map(e => e.trim()).filter(Boolean) : undefined,
        subject,
        templateId: selectedTemplateId,
        templateVariables,
      } : {
        recipientTypes: selectedRecipients,
        customEmails: customEmails ? customEmails.split(',').map(e => e.trim()).filter(Boolean) : undefined,
        subject,
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
      // Clear form
      setSelectedRecipients([]);
      setCustomEmails("");
      setSubject("");
      setBody("");
      setSelectedTemplateId("");
      setTemplateVariables({});
      // Hide success message after 10 seconds
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

  const handleSend = () => {
    if (!subject.trim()) {
      toast({
        title: "Missing subject",
        description: "Please provide an email subject.",
        variant: "destructive",
      });
      return;
    }

    if (useTemplate) {
      if (!selectedTemplateId) {
        toast({
          title: "No template selected",
          description: "Please select an email template.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!body.trim()) {
        toast({
          title: "Missing message",
          description: "Please provide a message body.",
          variant: "destructive",
        });
        return;
      }
    }

    if (selectedRecipients.length === 0 && !customEmails.trim()) {
      toast({
        title: "No recipients selected",
        description: "Please select at least one audience or enter custom email addresses.",
        variant: "destructive",
      });
      return;
    }

    sendCampaignMutation.mutate();
  };

  const toggleRecipient = (type: RecipientType) => {
    setSelectedRecipients(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templatesData?.templates.find(t => t.id === templateId);
    if (template) {
      // Initialize template variables with rescueName
      const initialVars: Record<string, string> = {
        rescueName: tenantData?.tenant?.name || '',
        websiteUrl: `https://${tenantData?.tenant?.subdomain}.irescue.life`,
      };
      setTemplateVariables(initialVars);
    }
  };

  const updateTemplateVariable = (key: string, value: string) => {
    setTemplateVariables(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const selectedTemplate = templatesData?.templates.find(t => t.id === selectedTemplateId);
  const isResendConfigured = tenantData?.tenant?.resendEnabled;

  return (
    <DashboardLayout
      title="Email Campaigns"
      description="Send beautiful newsletters to team members, donors, and subscribers"
    >
      <div className="flex-1 overflow-auto p-6">
            {!isResendConfigured ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Email service is not configured. Please configure your Resend API key in <a href="/dashboard/settings" className="underline">Settings</a> to send email campaigns.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="max-w-4xl space-y-6">
                {showSuccess && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Your email campaign has been sent successfully! Recipients will receive it shortly.
                    </AlertDescription>
                  </Alert>
                )}

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      <CardTitle>Recipients</CardTitle>
                    </div>
                    <CardDescription>
                      Select who should receive this email campaign
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="team" 
                          checked={selectedRecipients.includes('team')}
                          onCheckedChange={() => toggleRecipient('team')}
                          data-testid="checkbox-recipient-team"
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="team" className="cursor-pointer">
                            Team Members
                          </Label>
                          <span className="text-sm text-muted-foreground">(All staff, volunteers, and board members)</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="donors" 
                          checked={selectedRecipients.includes('donors')}
                          onCheckedChange={() => toggleRecipient('donors')}
                          data-testid="checkbox-recipient-donors"
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="donors" className="cursor-pointer">
                            Donors
                          </Label>
                          <span className="text-sm text-muted-foreground">(All donors with email addresses)</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="newsletter" 
                          checked={selectedRecipients.includes('newsletter')}
                          onCheckedChange={() => toggleRecipient('newsletter')}
                          data-testid="checkbox-recipient-newsletter"
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="newsletter" className="cursor-pointer">
                            Newsletter Subscribers
                          </Label>
                          <span className="text-sm text-muted-foreground">
                            ({subscribersData?.activeCount || 0} active subscribers)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="adopters" 
                          checked={selectedRecipients.includes('adopters')}
                          onCheckedChange={() => toggleRecipient('adopters')}
                          data-testid="checkbox-recipient-adopters"
                        />
                        <div className="flex items-center gap-2 flex-1">
                          <Heart className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="adopters" className="cursor-pointer">
                            Adopters
                          </Label>
                          <span className="text-sm text-muted-foreground">
                            ({adoptersData?.count || 0} adopters with email addresses)
                          </span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="custom-emails">Custom Email Addresses (Optional)</Label>
                      <Input 
                        id="custom-emails"
                        placeholder="email1@example.com, email2@example.com" 
                        value={customEmails}
                        onChange={(e) => setCustomEmails(e.target.value)}
                        data-testid="input-custom-emails"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter email addresses separated by commas
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      <CardTitle>Compose Message</CardTitle>
                    </div>
                    <CardDescription>
                      Choose a beautiful template or write a custom message
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs value={useTemplate ? "template" : "custom"} onValueChange={(v) => setUseTemplate(v === "template")}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="template" data-testid="tab-use-template">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Use Template
                        </TabsTrigger>
                        <TabsTrigger value="custom" data-testid="tab-custom-message">
                          <FileText className="h-4 w-4 mr-2" />
                          Custom Message
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="template" className="space-y-4 mt-4">
                        <div className="space-y-3">
                          <Label>Select Template</Label>
                          <div className="grid gap-3">
                            {templatesData?.templates.map((template) => (
                              <div
                                key={template.id}
                                className={`p-4 border rounded-lg cursor-pointer transition-colors hover-elevate ${
                                  selectedTemplateId === template.id
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border'
                                }`}
                                onClick={() => handleTemplateSelect(template.id)}
                                data-testid={`template-card-${template.id}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-medium">{template.name}</h4>
                                      <Badge variant="outline" className="text-xs">
                                        {template.category}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{template.description}</p>
                                  </div>
                                  {selectedTemplateId === template.id && (
                                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {selectedTemplate && (
                          <>
                            <Separator />
                            <div className="space-y-3">
                              <Label>Template Fields</Label>
                              <p className="text-sm text-muted-foreground mb-3">
                                Fill in the details for your {selectedTemplate.name} email
                              </p>
                              
                              <div className="grid gap-4">
                                {selectedTemplate.variables
                                  .filter(v => v !== 'rescueName' && v !== 'websiteUrl') // Auto-filled
                                  .map((variable) => (
                                    <div key={variable} className="space-y-2">
                                      <Label htmlFor={`var-${variable}`} className="capitalize">
                                        {variable.replace(/([A-Z])/g, ' $1').trim()}
                                      </Label>
                                      {variable.includes('Url') || variable.includes('Image') ? (
                                        <Input
                                          id={`var-${variable}`}
                                          type="url"
                                          placeholder={`Enter ${variable.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                                          value={templateVariables[variable] || ''}
                                          onChange={(e) => updateTemplateVariable(variable, e.target.value)}
                                          data-testid={`input-template-${variable}`}
                                        />
                                      ) : variable.includes('Text') || variable.includes('Message') || variable.includes('Bio') || variable.includes('Description') || variable.includes('Content') ? (
                                        <Textarea
                                          id={`var-${variable}`}
                                          placeholder={`Enter ${variable.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                                          value={templateVariables[variable] || ''}
                                          onChange={(e) => updateTemplateVariable(variable, e.target.value)}
                                          rows={4}
                                          data-testid={`textarea-template-${variable}`}
                                        />
                                      ) : (
                                        <Input
                                          id={`var-${variable}`}
                                          placeholder={`Enter ${variable.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                                          value={templateVariables[variable] || ''}
                                          onChange={(e) => updateTemplateVariable(variable, e.target.value)}
                                          data-testid={`input-template-${variable}`}
                                        />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </>
                        )}
                      </TabsContent>

                      <TabsContent value="custom" className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="body">Message Body</Label>
                          <Textarea 
                            id="body"
                            placeholder="Enter your message here..."
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={12}
                            className="resize-none"
                            data-testid="textarea-email-body"
                          />
                          <p className="text-xs text-muted-foreground">
                            Plain text will be converted to HTML. Line breaks will be preserved.
                          </p>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject Line</Label>
                      <Input 
                        id="subject"
                        placeholder="Enter email subject" 
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        data-testid="input-email-subject"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button 
                        onClick={handleSend}
                        disabled={sendCampaignMutation.isPending}
                        data-testid="button-send-campaign"
                      >
                        {sendCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Send className="h-4 w-4 mr-2" />
                        Send Campaign
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Sender Information</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">From:</span>
                      <span className="font-medium">
                        {tenantData?.tenant?.resendFromName || "Your Rescue"} 
                        &lt;{tenantData?.tenant?.resendFromEmail || "noreply@yourrescue.org"}&gt;
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recipients will see this sender information. Update it in Settings if needed.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
      </div>
    </DashboardLayout>
  );
}
