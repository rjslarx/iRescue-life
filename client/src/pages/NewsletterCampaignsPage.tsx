import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Send, 
  Loader2, 
  Mail, 
  AlertCircle, 
  Eye, 
  Trash2, 
  Edit, 
  Sparkles, 
  Heart, 
  AlertTriangle, 
  Calendar,
  CalendarHeart,
  FileText,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  UserMinus
} from "lucide-react";
import type { NewsletterCampaign, Animal, HappyTail } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import { formatDistanceToNow, format } from "date-fns";

type TemplateType = "new_arrivals" | "success_stories" | "urgent_needs" | "monthly_roundup" | "event_announcement" | "custom";

interface TemplateInfo {
  name: string;
  description: string;
  icon: string;
}

interface NewsletterSubscriber {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "unsubscribed";
  source: "website" | "donation" | "application" | "manual";
  subscribedAt: string;
}

interface SubscribersResponse {
  subscribers: NewsletterSubscriber[];
  activeCount: number;
}

const templateIcons: Record<Exclude<TemplateType, 'custom'>, any> = {
  new_arrivals: Sparkles,
  success_stories: Heart,
  urgent_needs: AlertTriangle,
  monthly_roundup: Calendar,
  event_announcement: CalendarHeart,
};

export default function NewsletterCampaignsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<NewsletterCampaign | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  
  // New campaign form state
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    previewText: "",
    templateType: "new_arrivals" as TemplateType,
    content: {} as any,
  });

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<NewsletterCampaign[]>({
    queryKey: ['/api/newsletter/campaigns'],
  });

  // Fetch templates info
  const { data: templatesInfo } = useQuery<Record<string, TemplateInfo>>({
    queryKey: ['/api/newsletter/templates'],
  });

  // Fetch animals for selection
  const { data: animalsData } = useQuery<Animal[]>({
    queryKey: ['/api/animals'],
  });

  // Fetch happy tails for selection
  const { data: happyTailsData } = useQuery<HappyTail[]>({
    queryKey: ['/api/happy-tails'],
  });

  // Fetch subscribers list
  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<SubscribersResponse>({
    queryKey: ['/api/newsletter/subscribers'],
  });
  
  // Add subscriber state
  const [addSubscriberOpen, setAddSubscriberOpen] = useState(false);
  const [newSubscriber, setNewSubscriber] = useState({ email: "", name: "" });

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
              Access Denied: Newsletter campaigns are only available to administrators.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/newsletter/campaigns', newCampaign);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/campaigns'] });
      setCreateDialogOpen(false);
      setNewCampaign({
        name: "",
        subject: "",
        previewText: "",
        templateType: "new_arrivals",
        content: {},
      });
      toast({
        title: "Campaign created",
        description: "Your newsletter campaign has been created as a draft.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create campaign",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/newsletter/campaigns/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/campaigns'] });
      setEditDialogOpen(false);
      toast({
        title: "Campaign updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update campaign",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/newsletter/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/campaigns'] });
      toast({
        title: "Campaign deleted",
        description: "The draft campaign has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete campaign",
        description: error.message || "Only draft campaigns can be deleted.",
        variant: "destructive",
      });
    },
  });

  const previewCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/newsletter/campaigns/${id}/preview`);
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setPreviewDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate preview",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/newsletter/campaigns/${id}/send`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/campaigns'] });
      setSendDialogOpen(false);
      toast({
        title: "Newsletter sent!",
        description: `Successfully sent to ${data.successCount} subscriber${data.successCount !== 1 ? 's' : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send newsletter",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Add subscriber mutation
  const addSubscriberMutation = useMutation({
    mutationFn: async (data: { email: string; name: string }) => {
      const response = await apiRequest('POST', '/api/newsletter/subscribers', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/subscribers'] });
      setAddSubscriberOpen(false);
      setNewSubscriber({ email: "", name: "" });
      toast({
        title: "Subscriber added",
        description: "The subscriber has been added to your newsletter list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add subscriber",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Remove subscriber mutation
  const removeSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/newsletter/subscribers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/newsletter/subscribers'] });
      toast({
        title: "Subscriber removed",
        description: "The subscriber has been removed from your newsletter list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove subscriber",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary"><FileText className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'scheduled':
        return <Badge variant="outline" className="text-blue-600"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
      case 'sending':
        return <Badge variant="outline" className="text-yellow-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTemplateIcon = (type: TemplateType) => {
    if (type === 'custom') return FileText;
    return templateIcons[type] || FileText;
  };

  const animals = (animalsData as any)?.animals || animalsData || [];
  const happyTails = (happyTailsData as any)?.happyTails || happyTailsData || [];
  const activeSubscribers = subscribersData?.activeCount || 0;

  return (
    <DashboardLayout
      title="Newsletter Campaigns"
      description="Create beautiful animal rescue themed newsletters using professional templates"
    >
      <div className="flex-1 overflow-auto p-6">
        {/* Header with stats */}
        <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Active Subscribers:</span>
                <span className="font-semibold">{activeSubscribers}</span>
              </div>
            </Card>
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Campaigns:</span>
                <span className="font-semibold">{campaigns.length}</span>
              </div>
            </Card>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-campaign">
            <Plus className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </div>

        {/* Campaign tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all" data-testid="tab-all">All Campaigns</TabsTrigger>
            <TabsTrigger value="drafts" data-testid="tab-drafts">Drafts</TabsTrigger>
            <TabsTrigger value="sent" data-testid="tab-sent">Sent</TabsTrigger>
            <TabsTrigger value="subscribers" data-testid="tab-subscribers">
              <Users className="w-4 h-4 mr-1" />
              Subscribers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <CampaignsList 
              campaigns={campaigns}
              onEdit={(c) => { setSelectedCampaign(c); setEditDialogOpen(true); }}
              onPreview={(c) => { setSelectedCampaign(c); previewCampaignMutation.mutate(c.id); }}
              onSend={(c) => { setSelectedCampaign(c); setSendDialogOpen(true); }}
              onDelete={(c) => deleteCampaignMutation.mutate(c.id)}
              getStatusBadge={getStatusBadge}
              getTemplateIcon={getTemplateIcon}
              isLoading={campaignsLoading}
            />
          </TabsContent>

          <TabsContent value="drafts">
            <CampaignsList 
              campaigns={campaigns.filter(c => c.status === 'draft')}
              onEdit={(c) => { setSelectedCampaign(c); setEditDialogOpen(true); }}
              onPreview={(c) => { setSelectedCampaign(c); previewCampaignMutation.mutate(c.id); }}
              onSend={(c) => { setSelectedCampaign(c); setSendDialogOpen(true); }}
              onDelete={(c) => deleteCampaignMutation.mutate(c.id)}
              getStatusBadge={getStatusBadge}
              getTemplateIcon={getTemplateIcon}
              isLoading={campaignsLoading}
            />
          </TabsContent>

          <TabsContent value="sent">
            <CampaignsList 
              campaigns={campaigns.filter(c => c.status === 'sent')}
              onEdit={(c) => { setSelectedCampaign(c); setEditDialogOpen(true); }}
              onPreview={(c) => { setSelectedCampaign(c); previewCampaignMutation.mutate(c.id); }}
              onSend={(c) => { setSelectedCampaign(c); setSendDialogOpen(true); }}
              onDelete={(c) => deleteCampaignMutation.mutate(c.id)}
              getStatusBadge={getStatusBadge}
              getTemplateIcon={getTemplateIcon}
              isLoading={campaignsLoading}
            />
          </TabsContent>

          <TabsContent value="subscribers">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 justify-between items-center">
                <h3 className="text-lg font-medium">Newsletter Subscribers</h3>
                <Button onClick={() => setAddSubscriberOpen(true)} data-testid="button-add-subscriber">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Subscriber
                </Button>
              </div>

              {subscribersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !subscribersData?.subscribers?.length ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No subscribers yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Subscribers are added when visitors sign up on your website or make donations.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {subscribersData.subscribers.map((subscriber) => (
                        <div 
                          key={subscriber.id} 
                          className="flex flex-wrap gap-4 items-center justify-between p-4"
                          data-testid={`subscriber-row-${subscriber.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Mail className="w-5 h-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate" data-testid={`text-subscriber-email-${subscriber.id}`}>
                                {subscriber.email}
                              </p>
                              {subscriber.name && (
                                <p className="text-sm text-muted-foreground truncate">{subscriber.name}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={subscriber.status === 'active' ? 'default' : 'secondary'}>
                              {subscriber.status === 'active' ? (
                                <><CheckCircle2 className="w-3 h-3 mr-1" />Active</>
                              ) : (
                                <><XCircle className="w-3 h-3 mr-1" />Unsubscribed</>
                              )}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {subscriber.source}
                            </Badge>
                            <span className="text-sm text-muted-foreground hidden sm:inline">
                              {format(new Date(subscriber.subscribedAt), 'MMM d, yyyy')}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeSubscriberMutation.mutate(subscriber.id)}
                              disabled={removeSubscriberMutation.isPending}
                              data-testid={`button-remove-subscriber-${subscriber.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Add Subscriber Dialog */}
            <Dialog open={addSubscriberOpen} onOpenChange={setAddSubscriberOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Subscriber</DialogTitle>
                  <DialogDescription>
                    Manually add a subscriber to your newsletter list.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="subscriber-email">Email Address</Label>
                    <Input
                      id="subscriber-email"
                      type="email"
                      placeholder="email@example.com"
                      value={newSubscriber.email}
                      onChange={(e) => setNewSubscriber(prev => ({ ...prev, email: e.target.value }))}
                      data-testid="input-subscriber-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subscriber-name">Name (Optional)</Label>
                    <Input
                      id="subscriber-name"
                      placeholder="John Doe"
                      value={newSubscriber.name}
                      onChange={(e) => setNewSubscriber(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="input-subscriber-name"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddSubscriberOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => addSubscriberMutation.mutate(newSubscriber)}
                    disabled={!newSubscriber.email || addSubscriberMutation.isPending}
                    data-testid="button-confirm-add-subscriber"
                  >
                    {addSubscriberMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Add Subscriber
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        {/* Create Campaign Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Newsletter Campaign</DialogTitle>
              <DialogDescription>
                Choose a template and customize your newsletter content
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="template-type">Template Type</Label>
                <Select 
                  value={newCampaign.templateType} 
                  onValueChange={(v: TemplateType) => setNewCampaign(prev => ({ ...prev, templateType: v }))}
                >
                  <SelectTrigger data-testid="select-template-type">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_arrivals">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        New Arrivals - Showcase new animals
                      </div>
                    </SelectItem>
                    <SelectItem value="success_stories">
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4" />
                        Success Stories - Happy tails updates
                      </div>
                    </SelectItem>
                    <SelectItem value="urgent_needs">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Urgent Appeal - Medical fundraising
                      </div>
                    </SelectItem>
                    <SelectItem value="monthly_roundup">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Monthly Roundup - Stats and updates
                      </div>
                    </SelectItem>
                    <SelectItem value="event_announcement">
                      <div className="flex items-center gap-2">
                        <CalendarHeart className="w-4 h-4" />
                        Event Announcement - Promote events
                      </div>
                    </SelectItem>
                    <SelectItem value="custom">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Custom HTML - Import from Beefree or paste HTML
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name (Internal)</Label>
                <Input
                  id="campaign-name"
                  placeholder="e.g., November New Arrivals"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-campaign-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g., Meet Our Newest Furry Friends!"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, subject: e.target.value }))}
                  data-testid="input-subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preview-text">Preview Text (Optional)</Label>
                <Input
                  id="preview-text"
                  placeholder="Text shown in email client preview"
                  value={newCampaign.previewText}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, previewText: e.target.value }))}
                  data-testid="input-preview-text"
                />
              </div>

              {/* Template-specific content fields */}
              <TemplateContentFields
                templateType={newCampaign.templateType}
                content={newCampaign.content}
                onChange={(content) => setNewCampaign(prev => ({ ...prev, content }))}
                animals={animals}
                happyTails={happyTails}
                campaignName={newCampaign.name}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCampaignMutation.mutate()}
                disabled={!newCampaign.name || !newCampaign.subject || createCampaignMutation.isPending}
                data-testid="button-save-campaign"
              >
                {createCampaignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Campaign Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Campaign</DialogTitle>
            </DialogHeader>
            
            {selectedCampaign && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    value={selectedCampaign.name}
                    onChange={(e) => setSelectedCampaign({ ...selectedCampaign, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input
                    value={selectedCampaign.subject}
                    onChange={(e) => setSelectedCampaign({ ...selectedCampaign, subject: e.target.value })}
                    data-testid="input-edit-subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Preview Text</Label>
                  <Input
                    value={selectedCampaign.previewText || ""}
                    onChange={(e) => setSelectedCampaign({ ...selectedCampaign, previewText: e.target.value })}
                    data-testid="input-edit-preview"
                  />
                </div>

                <TemplateContentFields
                  templateType={selectedCampaign.templateType as TemplateType}
                  content={selectedCampaign.content || {}}
                  onChange={(content) => setSelectedCampaign({ ...selectedCampaign, content })}
                  animals={animals}
                  happyTails={happyTails}
                  campaignName={selectedCampaign.name}
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (selectedCampaign) {
                    updateCampaignMutation.mutate({
                      id: selectedCampaign.id,
                      data: {
                        name: selectedCampaign.name,
                        subject: selectedCampaign.subject,
                        previewText: selectedCampaign.previewText,
                        content: selectedCampaign.content,
                      },
                    });
                  }
                }}
                disabled={updateCampaignMutation.isPending}
                data-testid="button-update-campaign"
              >
                {updateCampaignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Newsletter Preview</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto max-h-[70vh] border rounded-lg bg-gray-50">
              <iframe
                srcDoc={previewHtml}
                className="w-full min-h-[600px] border-0"
                title="Newsletter Preview"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Send Confirmation Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Newsletter?</DialogTitle>
              <DialogDescription>
                This will send the newsletter "{selectedCampaign?.subject}" to {activeSubscribers} active subscriber{activeSubscribers !== 1 ? 's' : ''}. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedCampaign && sendCampaignMutation.mutate(selectedCampaign.id)}
                disabled={sendCampaignMutation.isPending}
                data-testid="button-confirm-send"
              >
                {sendCampaignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Send Newsletter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Campaigns List Component
function CampaignsList({ 
  campaigns, 
  onEdit, 
  onPreview, 
  onSend, 
  onDelete,
  getStatusBadge,
  getTemplateIcon,
  isLoading,
}: { 
  campaigns: NewsletterCampaign[];
  onEdit: (c: NewsletterCampaign) => void;
  onPreview: (c: NewsletterCampaign) => void;
  onSend: (c: NewsletterCampaign) => void;
  onDelete: (c: NewsletterCampaign) => void;
  getStatusBadge: (status: string) => JSX.Element;
  getTemplateIcon: (type: TemplateType) => any;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">No campaigns yet</h3>
        <p className="text-muted-foreground">
          Create your first newsletter campaign to get started.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => {
        const Icon = getTemplateIcon(campaign.templateType as TemplateType);
        return (
          <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {campaign.templateType.replace(/_/g, ' ')}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(campaign.status)}
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-sm font-medium text-muted-foreground line-clamp-2">
                {campaign.subject}
              </p>
              {campaign.sentAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Sent {formatDistanceToNow(new Date(campaign.sentAt), { addSuffix: true })}
                  {campaign.recipientCount && ` to ${campaign.recipientCount} recipients`}
                </p>
              )}
              {!campaign.sentAt && campaign.createdAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Created {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                </p>
              )}
            </CardContent>
            <CardFooter className="pt-3 border-t flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onPreview(campaign)}
                data-testid={`button-preview-${campaign.id}`}
              >
                <Eye className="w-4 h-4 mr-1" />
                Preview
              </Button>
              {campaign.status === 'draft' && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onEdit(campaign)}
                    data-testid={`button-edit-${campaign.id}`}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => onSend(campaign)}
                    data-testid={`button-send-${campaign.id}`}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    Send
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onDelete(campaign)}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-${campaign.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

// Template-specific content fields
function TemplateContentFields({ 
  templateType, 
  content, 
  onChange,
  animals,
  happyTails,
  campaignName,
}: {
  templateType: TemplateType;
  content: any;
  onChange: (content: any) => void;
  animals: Animal[];
  happyTails: HappyTail[];
  campaignName?: string;
}) {
  const updateContent = (key: string, value: any) => {
    onChange({ ...content, [key]: value });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleHtmlFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const htmlContent = e.target?.result as string;
      if (htmlContent) {
        updateContent("customHtml", htmlContent);
      }
    };
    reader.readAsText(file);
    if (event.target) {
      event.target.value = '';
    }
  };

  if (templateType === 'custom') {
    return (
      <div className="space-y-4 border-t pt-4">
        <h4 className="font-medium text-sm">Custom HTML Content</h4>
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Import your newsletter HTML from Beefree.io or any email editor. Export your design as HTML and upload it here.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".html,.htm"
            onChange={handleHtmlFileUpload}
            className="hidden"
            data-testid="input-html-file"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload-html"
          >
            <Plus className="w-4 h-4 mr-2" />
            Upload HTML File
          </Button>
          {content.customHtml && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              HTML Loaded ({Math.round(content.customHtml.length / 1024)}KB)
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <Label>Or Paste HTML Directly</Label>
          <Textarea
            placeholder="<!DOCTYPE html>&#10;<html>&#10;<head>...</head>&#10;<body>...</body>&#10;</html>"
            value={content.customHtml || ""}
            onChange={(e) => updateContent("customHtml", e.target.value)}
            className="font-mono text-xs min-h-[200px]"
            data-testid="textarea-custom-html"
          />
          <p className="text-xs text-muted-foreground">
            Paste the complete HTML exported from Beefree.io or another email editor. The HTML should be self-contained with all styles inline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="font-medium text-sm">Template Content</h4>

      {/* Common fields */}
      <div className="space-y-2">
        <Label>Header Title</Label>
        <Input
          placeholder="Main heading for your newsletter"
          value={content.headerTitle || ""}
          onChange={(e) => updateContent("headerTitle", e.target.value)}
          data-testid="input-header-title"
        />
      </div>

      <div className="space-y-2">
        <Label>Introduction Text</Label>
        <Textarea
          placeholder="Opening paragraph for your newsletter..."
          value={content.introText || ""}
          onChange={(e) => updateContent("introText", e.target.value)}
          data-testid="input-intro-text"
        />
      </div>

      {/* Template-specific fields */}
      {templateType === 'new_arrivals' && (
        <div className="space-y-2">
          <Label>Select Animals to Feature</Label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-2">
            {animals.filter(a => a.status === 'available').map((animal) => (
              <div key={animal.id} className="flex items-center gap-2">
                <Checkbox
                  id={`animal-${animal.id}`}
                  checked={(content.animalIds || []).includes(animal.id)}
                  onCheckedChange={(checked) => {
                    const ids = content.animalIds || [];
                    updateContent(
                      "animalIds",
                      checked ? [...ids, animal.id] : ids.filter((id: string) => id !== animal.id)
                    );
                  }}
                />
                <label htmlFor={`animal-${animal.id}`} className="text-sm cursor-pointer">
                  {animal.name} ({animal.species})
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selected: {(content.animalIds || []).length} animals
          </p>
        </div>
      )}

      {templateType === 'success_stories' && (
        <div className="space-y-2">
          <Label>Select Success Stories</Label>
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded p-2">
            {happyTails.filter(h => h.isPublished).map((story) => (
              <div key={story.id} className="flex items-center gap-2">
                <Checkbox
                  id={`story-${story.id}`}
                  checked={(content.happyTailIds || []).includes(story.id)}
                  onCheckedChange={(checked) => {
                    const ids = content.happyTailIds || [];
                    updateContent(
                      "happyTailIds",
                      checked ? [...ids, story.id] : ids.filter((id: string) => id !== story.id)
                    );
                  }}
                />
                <label htmlFor={`story-${story.id}`} className="text-sm cursor-pointer">
                  {story.animalName} - {story.adopterName}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {templateType === 'urgent_needs' && (
        <>
          <div className="space-y-2">
            <Label>Select Animal for Appeal</Label>
            <Select
              value={content.urgentAnimalId || ""}
              onValueChange={(v) => updateContent("urgentAnimalId", v)}
            >
              <SelectTrigger data-testid="select-urgent-animal">
                <SelectValue placeholder="Select an animal" />
              </SelectTrigger>
              <SelectContent>
                {animals.map((animal) => (
                  <SelectItem key={animal.id} value={animal.id}>
                    {animal.name} ({animal.species})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Urgency Reason</Label>
            <Input
              placeholder="e.g., Emergency Surgery Required"
              value={content.urgencyReason || ""}
              onChange={(e) => updateContent("urgencyReason", e.target.value)}
              data-testid="input-urgency-reason"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Funding Goal ($)</Label>
              <Input
                type="number"
                placeholder="3000"
                value={content.fundingGoal || ""}
                onChange={(e) => updateContent("fundingGoal", parseInt(e.target.value) || 0)}
                data-testid="input-funding-goal"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount Raised ($)</Label>
              <Input
                type="number"
                placeholder="1500"
                value={content.fundingRaised || ""}
                onChange={(e) => updateContent("fundingRaised", parseInt(e.target.value) || 0)}
                data-testid="input-funding-raised"
              />
            </div>
          </div>
        </>
      )}

      {templateType === 'monthly_roundup' && (
        <>
          <div className="space-y-2">
            <Label>Stats Month</Label>
            <Input
              placeholder="e.g., November 2024"
              value={content.statsMonth || ""}
              onChange={(e) => updateContent("statsMonth", e.target.value)}
              data-testid="input-stats-month"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Adoptions</Label>
              <Input
                type="number"
                value={content.adoptionCount || ""}
                onChange={(e) => updateContent("adoptionCount", parseInt(e.target.value) || 0)}
                data-testid="input-adoption-count"
              />
            </div>
            <div className="space-y-2">
              <Label>Animals Rescued</Label>
              <Input
                type="number"
                value={content.rescueCount || ""}
                onChange={(e) => updateContent("rescueCount", parseInt(e.target.value) || 0)}
                data-testid="input-rescue-count"
              />
            </div>
            <div className="space-y-2">
              <Label>Volunteer Hours</Label>
              <Input
                type="number"
                value={content.volunteerHours || ""}
                onChange={(e) => updateContent("volunteerHours", parseInt(e.target.value) || 0)}
                data-testid="input-volunteer-hours"
              />
            </div>
            <div className="space-y-2">
              <Label>Donations ($)</Label>
              <Input
                type="number"
                value={content.donationTotal || ""}
                onChange={(e) => updateContent("donationTotal", parseInt(e.target.value) || 0)}
                data-testid="input-donation-total"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Volunteer Spotlight Name</Label>
            <Input
              placeholder="Featured volunteer name"
              value={content.spotlightVolunteer || ""}
              onChange={(e) => updateContent("spotlightVolunteer", e.target.value)}
              data-testid="input-spotlight-volunteer"
            />
          </div>
          <div className="space-y-2">
            <Label>Volunteer Story</Label>
            <Textarea
              placeholder="Brief story about the volunteer..."
              value={content.spotlightStory || ""}
              onChange={(e) => updateContent("spotlightStory", e.target.value)}
              data-testid="input-spotlight-story"
            />
          </div>
        </>
      )}

      {templateType === 'event_announcement' && (
        <>
          <div className="space-y-2">
            <Label>Event Name</Label>
            <Input
              placeholder="e.g., Holiday Adoption Event"
              value={content.eventName || ""}
              onChange={(e) => updateContent("eventName", e.target.value)}
              data-testid="input-event-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Event Date</Label>
              <Input
                placeholder="e.g., Saturday, December 14, 2024"
                value={content.eventDate || ""}
                onChange={(e) => updateContent("eventDate", e.target.value)}
                data-testid="input-event-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Event Time</Label>
              <Input
                placeholder="e.g., 10:00 AM - 4:00 PM"
                value={content.eventTime || ""}
                onChange={(e) => updateContent("eventTime", e.target.value)}
                data-testid="input-event-time"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Event Location</Label>
            <Input
              placeholder="e.g., Main Street Park, Downtown"
              value={content.eventLocation || ""}
              onChange={(e) => updateContent("eventLocation", e.target.value)}
              data-testid="input-event-location"
            />
          </div>
          <div className="space-y-2">
            <Label>Event Description</Label>
            <Textarea
              placeholder="Describe what attendees can expect..."
              value={content.eventDescription || ""}
              onChange={(e) => updateContent("eventDescription", e.target.value)}
              data-testid="input-event-description"
            />
          </div>
        </>
      )}

      {/* CTA Button */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Call-to-Action Button Text</Label>
          <Input
            placeholder="e.g., View All Animals"
            value={content.ctaButtonText || ""}
            onChange={(e) => updateContent("ctaButtonText", e.target.value)}
            data-testid="input-cta-text"
          />
        </div>
        <div className="space-y-2">
          <Label>Button Link (Optional)</Label>
          <Input
            placeholder="https://..."
            value={content.ctaButtonUrl || ""}
            onChange={(e) => updateContent("ctaButtonUrl", e.target.value)}
            data-testid="input-cta-url"
          />
        </div>
      </div>
    </div>
  );
}
