import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  Loader2, 
  AlertCircle, 
  Users, 
  Bell, 
  MessageSquare, 
  Mail, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  History,
  FileText,
  Smartphone,
  Zap,
  Radio,
} from "lucide-react";
import type { Broadcast, BroadcastTemplate } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import { formatDistanceToNow, format } from "date-fns";

type Channel = "push" | "sms" | "email";
type TargetRole = "admin" | "board_member" | "staff" | "foster" | "volunteer";

interface ChannelStatus {
  push: { available: boolean };
  sms: { available: boolean };
  email: { available: boolean };
}

interface TargetUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  roles: string[];
  hasPushSubscription: boolean;
}

const ROLE_LABELS: Record<TargetRole, string> = {
  admin: "Administrators",
  board_member: "Board Members",
  staff: "Staff",
  foster: "Fosters",
  volunteer: "Volunteers",
};

const ROLE_ICONS: Record<TargetRole, typeof Users> = {
  admin: Users,
  board_member: Users,
  staff: Users,
  foster: Users,
  volunteer: Users,
};

export default function BroadcastsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("compose");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(["push"]);
  const [selectedRoles, setSelectedRoles] = useState<TargetRole[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: channelStatus, isLoading: channelStatusLoading } = useQuery<ChannelStatus>({
    queryKey: ['/api/broadcasts/status'],
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<BroadcastTemplate[]>({
    queryKey: ['/api/broadcasts/templates/list'],
  });

  const { data: targetUsers, isLoading: usersLoading } = useQuery<TargetUser[]>({
    queryKey: ['/api/broadcasts/recipients', selectedRoles.join(',')],
    queryFn: async () => {
      const params = selectedRoles.length > 0 ? `?roles=${selectedRoles.join(',')}` : '';
      const res = await fetch(`/api/broadcasts/recipients${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: selectedRoles.length > 0,
  });

  const { data: broadcasts, isLoading: broadcastsLoading } = useQuery<Broadcast[]>({
    queryKey: ['/api/broadcasts'],
  });

  if (!user || user.activeRole !== 'admin') {
    return (
      <DashboardLayout title="Access Denied" description="">
        <div className="flex-1 overflow-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Access Denied: Broadcast notifications are only available to administrators.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const sendBroadcastMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/broadcasts/send', {
        title,
        message,
        channels: selectedChannels,
        targetRoles: selectedRoles,
        templateId: selectedTemplateId || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Broadcast sent!",
        description: `Sent to ${data.totalRecipients} recipient${data.totalRecipients !== 1 ? 's' : ''}: ${data.results.push.sent} push, ${data.results.sms.sent} SMS`,
      });
      setTitle("");
      setMessage("");
      setSelectedRoles([]);
      setSelectedTemplateId("");
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send broadcast",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      setTitle(template.subject);
      setMessage(template.body);
      setSelectedChannels(template.channels as Channel[]);
      if (template.targetRoles) {
        setSelectedRoles(template.targetRoles as TargetRole[]);
      }
    }
  };

  const handleChannelToggle = (channel: Channel) => {
    setSelectedChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const handleRoleToggle = (role: TargetRole) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSendBroadcast = () => {
    if (!title.trim()) {
      toast({ title: "Missing title", description: "Please provide a notification title.", variant: "destructive" });
      return;
    }
    if (!message.trim()) {
      toast({ title: "Missing message", description: "Please provide a message.", variant: "destructive" });
      return;
    }
    if (selectedChannels.length === 0) {
      toast({ title: "No channels selected", description: "Please select at least one notification channel.", variant: "destructive" });
      return;
    }
    if (selectedRoles.length === 0) {
      toast({ title: "No recipients selected", description: "Please select at least one role to notify.", variant: "destructive" });
      return;
    }
    sendBroadcastMutation.mutate();
  };

  const seedDefaultTemplatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/broadcasts/templates/seed-defaults', {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.created > 0) {
        toast({
          title: "Templates created!",
          description: `${data.created} default templates have been added.`,
        });
      } else {
        toast({
          title: "Templates already exist",
          description: "Default templates are already configured.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts/templates/list'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create templates",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const pushCount = targetUsers?.filter(u => u.hasPushSubscription).length || 0;
  const smsCount = targetUsers?.filter(u => u.phone).length || 0;
  const totalCount = targetUsers?.length || 0;

  return (
    <DashboardLayout
      title="Broadcast Notifications"
      description="Send push notifications and SMS alerts to your team"
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="compose" data-testid="tab-compose">
              <Radio className="h-4 w-4 mr-2" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Compose Message
                    </CardTitle>
                    <CardDescription>
                      Send an alert to your team via push notification or SMS
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {templates && templates.length > 0 && (
                      <div className="space-y-2">
                        <Label>Quick Template</Label>
                        <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                          <SelectTrigger data-testid="select-template">
                            <SelectValue placeholder="Choose a template (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map(template => (
                              <SelectItem key={template.id} value={template.id}>
                                <div className="flex items-center gap-2">
                                  <Badge variant={template.category === 'urgent' ? 'destructive' : 'secondary'} className="text-xs">
                                    {template.category}
                                  </Badge>
                                  {template.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Urgent: Foster Needed!"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={100}
                        data-testid="input-title"
                      />
                      <p className="text-xs text-muted-foreground">{title.length}/100 characters</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message *</Label>
                      <Textarea
                        id="message"
                        placeholder="Enter your message here..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        maxLength={500}
                        data-testid="input-message"
                      />
                      <p className="text-xs text-muted-foreground">{message.length}/500 characters</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      Notification Channels
                    </CardTitle>
                    <CardDescription>
                      Select how you want to send this broadcast
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {channelStatusLoading ? (
                      <div className="flex gap-4">
                        <Skeleton className="h-20 w-40" />
                        <Skeleton className="h-20 w-40" />
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-4">
                        <label
                          className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedChannels.includes('push') 
                              ? 'border-primary bg-primary/5' 
                              : 'border-muted hover-elevate'
                          } ${!channelStatus?.push.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Checkbox
                            checked={selectedChannels.includes('push')}
                            onCheckedChange={() => handleChannelToggle('push')}
                            disabled={!channelStatus?.push.available}
                            data-testid="checkbox-push"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <Bell className="h-4 w-4" />
                              <span className="font-medium">Push Notification</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {channelStatus?.push.available ? 'Instant alerts on devices' : 'Not configured'}
                            </p>
                          </div>
                        </label>

                        <label
                          className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedChannels.includes('sms') 
                              ? 'border-primary bg-primary/5' 
                              : 'border-muted hover-elevate'
                          } ${!channelStatus?.sms.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Checkbox
                            checked={selectedChannels.includes('sms')}
                            onCheckedChange={() => handleChannelToggle('sms')}
                            disabled={!channelStatus?.sms.available}
                            data-testid="checkbox-sms"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              <span className="font-medium">SMS Text Message</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {channelStatus?.sms.available ? 'Via Twilio' : 'Not configured'}
                            </p>
                          </div>
                        </label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Recipients
                    </CardTitle>
                    <CardDescription>
                      Select who should receive this broadcast
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(Object.keys(ROLE_LABELS) as TargetRole[]).map(role => (
                      <label
                        key={role}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedRoles.includes(role) 
                            ? 'border-primary bg-primary/5' 
                            : 'border-muted hover-elevate'
                        }`}
                      >
                        <Checkbox
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={() => handleRoleToggle(role)}
                          data-testid={`checkbox-role-${role}`}
                        />
                        <span className="font-medium">{ROLE_LABELS[role]}</span>
                      </label>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Delivery Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedRoles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Select roles to see delivery stats</p>
                    ) : usersLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Total Recipients</span>
                          <Badge variant="secondary">{totalCount}</Badge>
                        </div>
                        {selectedChannels.includes('push') && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Bell className="h-3 w-3" />
                              Push Enabled
                            </span>
                            <Badge variant={pushCount > 0 ? "default" : "outline"}>{pushCount}</Badge>
                          </div>
                        )}
                        {selectedChannels.includes('sms') && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <MessageSquare className="h-3 w-3" />
                              Has Phone
                            </span>
                            <Badge variant={smsCount > 0 ? "default" : "outline"}>{smsCount}</Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button
                  onClick={handleSendBroadcast}
                  disabled={sendBroadcastMutation.isPending || selectedRoles.length === 0 || selectedChannels.length === 0}
                  className="w-full"
                  size="lg"
                  data-testid="button-send-broadcast"
                >
                  {sendBroadcastMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Broadcast
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {broadcasts && broadcasts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{broadcasts.length}</div>
                    <p className="text-xs text-muted-foreground">Total Broadcasts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">
                      {broadcasts.reduce((sum, b) => sum + b.totalRecipients, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Total Recipients</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">
                      {broadcasts.reduce((sum, b) => sum + b.pushSent + b.smsSent, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Delivered</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-destructive">
                      {broadcasts.reduce((sum, b) => sum + (b.pushFailed || 0) + (b.smsFailed || 0), 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Broadcast History</CardTitle>
                <CardDescription>
                  View previously sent notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {broadcastsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : !broadcasts || broadcasts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No broadcasts sent yet</p>
                    <p className="text-sm">Your broadcast history will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {broadcasts.map(broadcast => (
                        <div
                          key={broadcast.id}
                          className="p-4 border rounded-lg space-y-3"
                          data-testid={`broadcast-item-${broadcast.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{broadcast.title}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2">{broadcast.message}</p>
                            </div>
                            <Badge 
                              variant={
                                broadcast.status === 'sent' ? 'default' :
                                broadcast.status === 'partial' ? 'secondary' :
                                broadcast.status === 'failed' ? 'destructive' : 'outline'
                              }
                            >
                              {broadcast.status === 'sent' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {broadcast.status === 'partial' && <AlertTriangle className="h-3 w-3 mr-1" />}
                              {broadcast.status === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {broadcast.status}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap gap-3 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {broadcast.totalRecipients} total
                            </span>
                            {(broadcast.channels as string[])?.includes('push') && (
                              <span className={`flex items-center gap-1 ${broadcast.pushFailed && broadcast.pushFailed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <Bell className="h-3 w-3" />
                                {broadcast.pushSent}/{broadcast.pushSent + (broadcast.pushFailed || 0)} push
                              </span>
                            )}
                            {(broadcast.channels as string[])?.includes('sms') && (
                              <span className={`flex items-center gap-1 ${broadcast.smsFailed && broadcast.smsFailed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <MessageSquare className="h-3 w-3" />
                                {broadcast.smsSent}/{broadcast.smsSent + (broadcast.smsFailed || 0)} SMS
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {broadcast.targetRoles && (broadcast.targetRoles as string[]).length > 0 && (
                                <span className="flex items-center gap-1">
                                  Target: {(broadcast.targetRoles as string[]).map(r => ROLE_LABELS[r as TargetRole] || r).join(', ')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {broadcast.sentByName && (
                                <span>by {broadcast.sentByName}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {broadcast.sentAt 
                                  ? format(new Date(broadcast.sentAt), 'MMM d, yyyy h:mm a')
                                  : 'Pending'
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Message Templates</CardTitle>
                <CardDescription>
                  Pre-configured templates for common alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : !templates || templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No templates yet</p>
                    <p className="text-sm mb-4">Create templates for frequently used messages</p>
                    <Button
                      onClick={() => seedDefaultTemplatesMutation.mutate()}
                      disabled={seedDefaultTemplatesMutation.isPending}
                      data-testid="button-load-default-templates"
                    >
                      {seedDefaultTemplatesMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Load Default Templates
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {templates.map(template => (
                      <div
                        key={template.id}
                        className="p-4 border rounded-lg space-y-2"
                        data-testid={`template-item-${template.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{template.name}</h4>
                              <Badge variant={template.category === 'urgent' ? 'destructive' : 'secondary'}>
                                {template.category}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-muted-foreground mt-1">{template.subject}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">{template.body}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {template.channels.map(channel => (
                            <Badge key={channel} variant="outline" className="text-xs">
                              {channel === 'push' && <Bell className="h-3 w-3 mr-1" />}
                              {channel === 'sms' && <MessageSquare className="h-3 w-3 mr-1" />}
                              {channel === 'email' && <Mail className="h-3 w-3 mr-1" />}
                              {channel}
                            </Badge>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleTemplateSelect(template.id);
                            setActiveTab('compose');
                          }}
                          data-testid={`button-use-template-${template.id}`}
                        >
                          Use Template
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
