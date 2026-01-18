import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Loader2, CheckCircle2, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Mail, Calendar, HardDrive, Plus, Trash2, Star, StarOff } from "lucide-react";
import { z } from "zod";
import type { Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";

const platformConfigSchema = z.object({
  clientId: z.string().min(1, "Client ID / API Key is required"),
  clientSecret: z.string().optional(),
  organizationId: z.string().optional(),
});

type PlatformConfigData = z.infer<typeof platformConfigSchema>;

interface PlatformIntegration {
  id: string;
  platform: "petfinder" | "rescuegroups" | "adoptapet";
  isEnabled: boolean;
  organizationId: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "error" | "partial" | null;
  lastSyncError: string | null;
  totalSynced: number;
  totalErrors: number;
  ftpHost?: string | null;
  ftpPath?: string | null;
  hasFtpCredentials?: boolean;
  autoSync?: boolean;
  syncFrequency?: string | null;
}

interface SenderAddress {
  name: string;
  email: string;
  isDefault?: boolean;
}

interface GoogleWorkspaceStatus {
  connected: boolean;
  features: {
    useGmail?: boolean;
    syncCalendar?: boolean;
    useDrive?: boolean;
    useChat?: boolean;
    connectedEmail?: string;
    senderName?: string;
    senderEmail?: string;
    senderAddresses?: SenderAddress[];
  } | null;
  connectedEmail?: string;
}

const platformInfo = {
  petfinder: {
    name: "PetFinder",
    description: "Sync your animals to PetFinder.com via FTP to reach millions of potential adopters",
    docsUrl: "https://www.petfinder.com/developers/",
    note: "Petfinder uses FTP import to sync animals. Enter your FTP credentials from your Petfinder Pro Dashboard. Animals and photos will be automatically exported in CSV format.",
    useFtp: true,
    fields: {
      clientId: null,
      clientSecret: null,
      organizationId: null,
    },
    ftpFields: {
      ftpHost: "FTP Host",
      ftpUsername: "FTP Username",
      ftpPassword: "FTP Password",
      ftpPath: "FTP Path (optional)",
    },
  },
  rescuegroups: {
    name: "RescueGroups",
    description: "Sync your animals to RescueGroups.org for wider adoption visibility",
    docsUrl: "https://rescuegroups.org/services/adoptable-pet-data-api/",
    note: "RescueGroups allows full CRUD operations. You can automatically sync animal data.",
    fields: {
      clientId: "API Key",
      clientSecret: null,
      organizationId: "Organization ID (required)",
    },
  },
  adoptapet: {
    name: "Adopt-a-Pet",
    description: "List your animals on Adopt-a-Pet.com to connect with adopters",
    docsUrl: "https://www.adoptapet.com/public/apis/pet_list.html",
    note: "Adopt-a-Pet API is primarily read-only for partners. Animals must be managed through their dashboard.",
    fields: {
      clientId: "API Key",
      clientSecret: null,
      organizationId: "Shelter ID",
    },
  },
};

export default function PlatformIntegrationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof platformInfo | null>(null);
  const [newSenderName, setNewSenderName] = useState("");
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [showAddSender, setShowAddSender] = useState(false);
  
  const [ftpHost, setFtpHost] = useState("");
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [ftpPath, setFtpPath] = useState("");
  const [ftpAutoSync, setFtpAutoSync] = useState(true);
  const [ftpSyncFrequency, setFtpSyncFrequency] = useState<"manual" | "frequent" | "daily">("daily");
  const [ftpCredentialsSaved, setFtpCredentialsSaved] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: integrationsData, isLoading } = useQuery<{ integrations: PlatformIntegration[] }>({
    queryKey: ['/api/platform-integrations'],
  });

  const { data: googleWorkspaceData, isLoading: isGoogleLoading, error: googleWorkspaceError, isError: isGoogleError } = useQuery<GoogleWorkspaceStatus>({
    queryKey: ['/api/google-workspace/status'],
    retry: 2,
    staleTime: 30000,
  });
  
  // Debug logging for Google Workspace status
  console.log('[Google Workspace Status]', {
    data: googleWorkspaceData,
    isLoading: isGoogleLoading,
    isError: isGoogleError,
    error: googleWorkspaceError,
  });

  const integrations = integrationsData?.integrations || [];
  const googleWorkspace = googleWorkspaceData || { connected: false, features: null };

  const petfinderIntegration = integrations.find(i => i.platform === 'petfinder');
  
  useEffect(() => {
    if (selectedPlatform === 'petfinder' && petfinderIntegration) {
      setFtpHost(petfinderIntegration.ftpHost || '');
      setFtpPath(petfinderIntegration.ftpPath || '');
      setFtpAutoSync(petfinderIntegration.autoSync ?? true);
      const freq = petfinderIntegration.syncFrequency;
      // Map old "hourly" to "frequent" for backward compatibility
      const mappedFreq = freq === 'hourly' ? 'frequent' : freq;
      setFtpSyncFrequency((mappedFreq as "manual" | "frequent" | "daily") || 'daily');
      // Credentials are considered saved if ftpHost exists (username/password are masked)
      setFtpCredentialsSaved(!!petfinderIntegration.ftpHost);
    } else {
      setFtpCredentialsSaved(false);
    }
  }, [selectedPlatform, petfinderIntegration]);

  const saveMutation = useMutation({
    mutationFn: async (data: { platform: string; config: PlatformConfigData }) => {
      const response = await apiRequest('POST', '/api/platform-integrations', {
        platform: data.platform,
        clientId: data.config.clientId,
        clientSecret: data.config.clientSecret,
        organizationId: data.config.organizationId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform-integrations'] });
      toast({
        title: "Integration saved",
        description: "Platform credentials have been saved successfully.",
      });
      setSelectedPlatform(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await apiRequest('POST', `/api/platform-integrations/${platform}/test`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform-integrations'] });
      toast({
        title: "Connection successful",
        description: data.message || "Successfully connected to the platform.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Could not connect to the platform.",
        variant: "destructive",
      });
    },
  });

  const saveFtpMutation = useMutation({
    mutationFn: async (data: { ftpHost: string; ftpUsername: string; ftpPassword: string; ftpPath?: string; autoSync: boolean; syncFrequency: string }) => {
      const response = await apiRequest('POST', '/api/platform-integrations/petfinder/ftp', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform-integrations'] });
      toast({
        title: "FTP credentials saved",
        description: "Petfinder FTP credentials have been saved successfully.",
      });
      setSelectedPlatform(null);
      setFtpHost("");
      setFtpUsername("");
      setFtpPassword("");
      setFtpPath("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const testFtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/platform-integrations/petfinder/test-ftp', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "FTP connection successful",
        description: data.message || `Found ${data.filesFound} files in directory.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "FTP connection failed",
        description: error.message || "Could not connect to FTP server.",
        variant: "destructive",
      });
    },
  });

  const syncPetfinderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/platform-integrations/petfinder/sync', {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform-integrations'] });
      toast({
        title: "Sync completed",
        description: `Exported ${data.animalsExported} animals, uploaded ${data.imagesUploaded} images.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Could not sync animals to Petfinder.",
        variant: "destructive",
      });
    },
  });

  const connectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/google-workspace/auth-url', {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get auth URL');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to connect",
        description: error.message || "Could not generate Google OAuth URL.",
        variant: "destructive",
      });
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/google-workspace/disconnect', {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-workspace/status'] });
      toast({
        title: "Disconnected",
        description: "Google Workspace has been disconnected.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to disconnect",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateGoogleFeaturesMutation = useMutation({
    mutationFn: async (features: { useGmail?: boolean; syncCalendar?: boolean; useDrive?: boolean; useChat?: boolean }) => {
      const response = await apiRequest('PATCH', '/api/google-workspace/features', features);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-workspace/status'] });
      toast({
        title: "Settings updated",
        description: "Google Workspace features have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const syncCalendarsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/google-workspace/sync-calendars', {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-workspace/status'] });
      const syncedCount = data.results?.filter((r: any) => r.success).length || 0;
      const failedCount = data.results?.filter((r: any) => !r.success).length || 0;
      
      if (syncedCount > 0 && failedCount === 0) {
        toast({
          title: "Calendars synced",
          description: `Successfully synced ${syncedCount} calendar${syncedCount > 1 ? 's' : ''} to Google Calendar.`,
        });
      } else if (syncedCount > 0 && failedCount > 0) {
        toast({
          title: "Partial sync complete",
          description: `Synced ${syncedCount} calendar${syncedCount > 1 ? 's' : ''}, ${failedCount} failed.`,
          variant: "destructive",
        });
      } else if (syncedCount === 0 && failedCount > 0) {
        toast({
          title: "Sync failed",
          description: `Failed to sync ${failedCount} calendar${failedCount > 1 ? 's' : ''}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Already synced",
          description: "All calendars are already synced to Google Calendar.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sync calendars",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<PlatformConfigData>({
    resolver: zodResolver(platformConfigSchema),
    defaultValues: {
      clientId: "",
      clientSecret: "",
      organizationId: "",
    },
  });

  const onSubmit = (data: PlatformConfigData) => {
    if (!selectedPlatform) return;
    saveMutation.mutate({ platform: selectedPlatform, config: data });
  };

  const getIntegrationStatus = (platform: keyof typeof platformInfo) => {
    return integrations.find(i => i.platform === platform);
  };

  return (
    <DashboardLayout
      title="Platform Integrations"
      description="Sync your animals to major adoption platforms"
    >
      <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="max-w-4xl space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connect your rescue to popular pet adoption platforms to increase visibility for your animals. Note: Some platforms have read-only APIs and require manual updates through their dashboards.
                  </AlertDescription>
                </Alert>

                <Card data-testid="card-google-workspace">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>Google Workspace</CardTitle>
                          {isGoogleLoading && (
                            <Badge variant="secondary" className="gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Checking...
                            </Badge>
                          )}
                          {!isGoogleLoading && googleWorkspace.connected && (
                            <Badge variant="default" className="gap-1" data-testid="badge-google-connected">
                              <CheckCircle2 className="h-3 w-3" />
                              Connected
                            </Badge>
                          )}
                          {!isGoogleLoading && isGoogleError && (
                            <Badge variant="destructive" className="gap-1" data-testid="badge-google-error">
                              <AlertCircle className="h-3 w-3" />
                              Error
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-2">
                          Connect your Google Workspace account to send emails via Gmail, sync calendar events, and store documents in Drive
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isGoogleLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Checking Google Workspace connection status...</span>
                      </div>
                    ) : isGoogleError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Failed to check Google Workspace status. Error: {(googleWorkspaceError as Error)?.message || 'Unknown error'}. Please refresh the page to try again.
                        </AlertDescription>
                      </Alert>
                    ) : !googleWorkspace.connected ? (
                      <>
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            By connecting Google Workspace, you can use your own Gmail account to send emails (avoiding quota limits), sync your calendars to Google Calendar (each iRescue calendar creates its own Google Calendar), and store documents in Google Drive.
                          </AlertDescription>
                        </Alert>
                        <Button 
                          onClick={() => connectGoogleMutation.mutate()}
                          disabled={connectGoogleMutation.isPending}
                          data-testid="button-connect-google"
                        >
                          {connectGoogleMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              Connect Google Workspace
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="text-sm">
                          <p className="text-muted-foreground">Connected Account</p>
                          <p className="font-medium" data-testid="text-google-email">{googleWorkspace.connectedEmail}</p>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <Label htmlFor="gmail-toggle" className="text-sm font-medium">
                                  Use Gmail for sending emails
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Send emails through your Gmail account instead of Resend
                                </p>
                              </div>
                            </div>
                            <Switch
                              id="gmail-toggle"
                              checked={googleWorkspace.features?.useGmail || false}
                              onCheckedChange={(checked) => {
                                updateGoogleFeaturesMutation.mutate({ useGmail: checked });
                              }}
                              data-testid="switch-gmail"
                            />
                          </div>

                          {googleWorkspace.features?.useGmail && (
                            <div className="ml-8 pl-3 border-l-2 border-muted space-y-4">
                              <div className="flex items-start gap-3">
                                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div className="flex-1 space-y-3">
                                  <div>
                                    <Label className="text-sm font-medium">
                                      Saved Sender Addresses
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                      Add email addresses you can use as the "From" address when sending emails (newsletters, notifications, etc.). 
                                      Each email must be configured as a "Send mail as" alias in Gmail.
                                    </p>
                                  </div>
                                  
                                  {/* List of saved sender addresses */}
                                  <div className="space-y-2">
                                    {(googleWorkspace.features?.senderAddresses || []).map((addr, index) => (
                                      <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid={`sender-address-${index}`}>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm truncate">{addr.name}</span>
                                            {addr.isDefault && (
                                              <Badge variant="secondary" className="text-xs">Default</Badge>
                                            )}
                                          </div>
                                          <span className="text-xs text-muted-foreground truncate block">{addr.email}</span>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 flex-shrink-0"
                                          onClick={() => {
                                            const addresses = googleWorkspace.features?.senderAddresses || [];
                                            const updatedAddresses = addresses.map((a, i) => ({
                                              ...a,
                                              isDefault: i === index,
                                            }));
                                            updateGoogleFeaturesMutation.mutate({ senderAddresses: updatedAddresses });
                                          }}
                                          disabled={updateGoogleFeaturesMutation.isPending || addr.isDefault}
                                          title={addr.isDefault ? "This is the default address" : "Set as default"}
                                          data-testid={`button-set-default-${index}`}
                                        >
                                          {addr.isDefault ? (
                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                          ) : (
                                            <StarOff className="h-4 w-4 text-muted-foreground" />
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 flex-shrink-0 text-destructive hover:text-destructive"
                                          onClick={() => {
                                            const addresses = googleWorkspace.features?.senderAddresses || [];
                                            const updatedAddresses = addresses.filter((_, i) => i !== index);
                                            // If we removed the default, set the first one as default
                                            if (addr.isDefault && updatedAddresses.length > 0) {
                                              updatedAddresses[0].isDefault = true;
                                            }
                                            updateGoogleFeaturesMutation.mutate({ senderAddresses: updatedAddresses });
                                          }}
                                          disabled={updateGoogleFeaturesMutation.isPending}
                                          data-testid={`button-remove-sender-${index}`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}
                                    
                                    {(!googleWorkspace.features?.senderAddresses || googleWorkspace.features.senderAddresses.length === 0) && !showAddSender && (
                                      <p className="text-xs text-muted-foreground italic py-2">
                                        No sender addresses configured. Add one to get started.
                                      </p>
                                    )}
                                  </div>

                                  {/* Add new sender address form */}
                                  {showAddSender ? (
                                    <div className="space-y-3 p-3 rounded-md border bg-background">
                                      <div className="space-y-1">
                                        <Label htmlFor="new-sender-name" className="text-xs font-medium">
                                          Display Name
                                        </Label>
                                        <Input
                                          id="new-sender-name"
                                          placeholder="e.g., Happy Paws Rescue"
                                          value={newSenderName}
                                          onChange={(e) => setNewSenderName(e.target.value)}
                                          data-testid="input-new-sender-name"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor="new-sender-email" className="text-xs font-medium">
                                          Email Address
                                        </Label>
                                        <Input
                                          id="new-sender-email"
                                          type="email"
                                          placeholder="e.g., info@happypawsrescue.org"
                                          value={newSenderEmail}
                                          onChange={(e) => setNewSenderEmail(e.target.value)}
                                          data-testid="input-new-sender-email"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            if (!newSenderName.trim() || !newSenderEmail.trim()) {
                                              toast({
                                                title: "Missing information",
                                                description: "Please enter both a name and email address.",
                                                variant: "destructive",
                                              });
                                              return;
                                            }
                                            // Simple email validation
                                            if (!newSenderEmail.includes('@') || !newSenderEmail.includes('.')) {
                                              toast({
                                                title: "Invalid email",
                                                description: "Please enter a valid email address.",
                                                variant: "destructive",
                                              });
                                              return;
                                            }
                                            const addresses = googleWorkspace.features?.senderAddresses || [];
                                            const isFirst = addresses.length === 0;
                                            const updatedAddresses = [
                                              ...addresses,
                                              { name: newSenderName.trim(), email: newSenderEmail.trim().toLowerCase(), isDefault: isFirst },
                                            ];
                                            updateGoogleFeaturesMutation.mutate({ senderAddresses: updatedAddresses });
                                            setNewSenderName("");
                                            setNewSenderEmail("");
                                            setShowAddSender(false);
                                          }}
                                          disabled={updateGoogleFeaturesMutation.isPending}
                                          data-testid="button-save-new-sender"
                                        >
                                          {updateGoogleFeaturesMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                          ) : null}
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setShowAddSender(false);
                                            setNewSenderName("");
                                            setNewSenderEmail("");
                                          }}
                                          data-testid="button-cancel-new-sender"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowAddSender(true)}
                                      data-testid="button-add-sender-address"
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Email Address
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Calendar className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <Label htmlFor="calendar-toggle" className="text-sm font-medium">
                                  Sync calendars to Google Calendar
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Each iRescue calendar syncs to its own Google Calendar
                                </p>
                              </div>
                            </div>
                            <Switch
                              id="calendar-toggle"
                              checked={googleWorkspace.features?.syncCalendar || false}
                              onCheckedChange={(checked) => {
                                updateGoogleFeaturesMutation.mutate({ syncCalendar: checked });
                              }}
                              data-testid="switch-calendar"
                            />
                          </div>

                          {googleWorkspace.features?.syncCalendar && (
                            <div className="ml-8 pl-3 border-l-2 border-muted space-y-3">
                              <div className="flex items-start gap-3">
                                <RefreshCw className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div className="flex-1 space-y-2">
                                  <Label className="text-sm font-medium">
                                    Sync existing calendars
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    Create Google Calendars for any iRescue calendars that haven't been synced yet
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => syncCalendarsMutation.mutate()}
                                    disabled={syncCalendarsMutation.isPending}
                                    data-testid="button-sync-calendars"
                                  >
                                    {syncCalendarsMutation.isPending ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Syncing...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Sync calendars now
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <HardDrive className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <Label htmlFor="drive-toggle" className="text-sm font-medium">
                                  Store documents in Google Drive
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Save animal documents and files to Google Drive
                                </p>
                              </div>
                            </div>
                            <Switch
                              id="drive-toggle"
                              checked={googleWorkspace.features?.useDrive || false}
                              onCheckedChange={(checked) => {
                                updateGoogleFeaturesMutation.mutate({ useDrive: checked });
                              }}
                              data-testid="switch-drive"
                            />
                          </div>

                          {googleWorkspace.features?.useDrive && (
                            <div className="ml-8 pl-3 border-l-2 border-muted">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <p className="text-sm text-muted-foreground">
                                  Ready to select files from animal profiles
                                </p>
                              </div>
                            </div>
                          )}

                        </div>

                        <Separator />

                        <Button 
                          variant="outline" 
                          onClick={() => disconnectGoogleMutation.mutate()}
                          disabled={disconnectGoogleMutation.isPending}
                          data-testid="button-disconnect-google"
                        >
                          {disconnectGoogleMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Disconnecting...
                            </>
                          ) : (
                            <>
                              Disconnect Google Workspace
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                {(Object.keys(platformInfo) as Array<keyof typeof platformInfo>).map((platform) => {
                  const info = platformInfo[platform];
                  const integration = getIntegrationStatus(platform);
                  const isConfiguring = selectedPlatform === platform;

                  return (
                    <Card key={platform}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle>{info.name}</CardTitle>
                              {integration?.isEnabled && (
                                <Badge variant="default" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Connected
                                </Badge>
                              )}
                              {integration?.lastSyncStatus === 'error' && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Error
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="mt-2">
                              {info.description}
                            </CardDescription>
                          </div>
                          <a 
                            href={info.docsUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            Docs
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            {info.note}
                          </AlertDescription>
                        </Alert>

                        {integration?.isEnabled && !isConfiguring && (
                          <>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Animals Synced</p>
                                <p className="font-medium">{integration.totalSynced}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Last Sync</p>
                                <p className="font-medium">
                                  {integration.lastSyncAt 
                                    ? new Date(integration.lastSyncAt).toLocaleString()
                                    : "Never"
                                  }
                                </p>
                              </div>
                            </div>

                            {integration.lastSyncError && (
                              <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-sm">
                                  {integration.lastSyncError}
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="flex gap-2 flex-wrap">
                              {platform === 'petfinder' && integration.hasFtpCredentials ? (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => testFtpMutation.mutate()}
                                    disabled={testFtpMutation.isPending}
                                    data-testid="button-test-petfinder-ftp"
                                  >
                                    {testFtpMutation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Testing...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Test FTP Connection
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    onClick={() => syncPetfinderMutation.mutate()}
                                    disabled={syncPetfinderMutation.isPending}
                                    data-testid="button-sync-petfinder"
                                  >
                                    {syncPetfinderMutation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Syncing...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Sync Now
                                      </>
                                    )}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  onClick={() => testMutation.mutate(platform)}
                                  disabled={testMutation.isPending}
                                  data-testid={`button-test-${platform}`}
                                >
                                  {testMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Testing...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Test Connection
                                    </>
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                onClick={() => setSelectedPlatform(platform)}
                                data-testid={`button-edit-${platform}`}
                              >
                                Update Credentials
                              </Button>
                            </div>
                          </>
                        )}

                        {(!integration?.isEnabled || isConfiguring) && (
                          <>
                            {'useFtp' in info && info.useFtp ? (
                              <div className="space-y-4">
                                {ftpCredentialsSaved && (
                                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 rounded-md text-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>FTP credentials are saved. Leave username/password empty to keep existing credentials.</span>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <Label htmlFor="ftp-host">FTP Host</Label>
                                  <Input
                                    id="ftp-host"
                                    placeholder="members.petfinder.com"
                                    value={ftpHost}
                                    onChange={(e) => setFtpHost(e.target.value)}
                                    data-testid="input-petfinder-ftp-host"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="ftp-username">FTP Username{ftpCredentialsSaved && ' (leave empty to keep existing)'}</Label>
                                  <Input
                                    id="ftp-username"
                                    placeholder={ftpCredentialsSaved ? "(unchanged)" : "Your Petfinder FTP username"}
                                    value={ftpUsername}
                                    onChange={(e) => setFtpUsername(e.target.value)}
                                    data-testid="input-petfinder-ftp-username"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="ftp-password">FTP Password{ftpCredentialsSaved && ' (leave empty to keep existing)'}</Label>
                                  <Input
                                    id="ftp-password"
                                    type="password"
                                    placeholder={ftpCredentialsSaved ? "(unchanged)" : "Your Petfinder FTP password"}
                                    value={ftpPassword}
                                    onChange={(e) => setFtpPassword(e.target.value)}
                                    data-testid="input-petfinder-ftp-password"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="ftp-path">FTP Path (optional)</Label>
                                  <Input
                                    id="ftp-path"
                                    placeholder="/ (leave empty for root)"
                                    value={ftpPath}
                                    onChange={(e) => setFtpPath(e.target.value)}
                                    data-testid="input-petfinder-ftp-path"
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <Label htmlFor="auto-sync">Auto-sync animals</Label>
                                    <p className="text-xs text-muted-foreground">
                                      Automatically sync animals to Petfinder on schedule
                                    </p>
                                  </div>
                                  <Switch
                                    id="auto-sync"
                                    checked={ftpAutoSync}
                                    onCheckedChange={setFtpAutoSync}
                                    data-testid="switch-petfinder-auto-sync"
                                  />
                                </div>
                                {ftpAutoSync && (
                                  <div className="space-y-2">
                                    <Label htmlFor="sync-frequency">Sync Frequency</Label>
                                    <Select
                                      value={ftpSyncFrequency}
                                      onValueChange={(v: "manual" | "frequent" | "daily") => setFtpSyncFrequency(v)}
                                    >
                                      <SelectTrigger data-testid="select-petfinder-sync-frequency">
                                        <SelectValue placeholder="Select frequency" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="frequent">Every 6 hours</SelectItem>
                                        <SelectItem value="daily">Once daily (midnight UTC)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => {
                                      // Require host always. Only require username/password for new integrations
                                      if (!ftpHost) {
                                        toast({
                                          title: "Missing FTP host",
                                          description: "Please enter the FTP host address.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      if (!ftpCredentialsSaved && (!ftpUsername || !ftpPassword)) {
                                        toast({
                                          title: "Missing credentials",
                                          description: "Please enter FTP username and password.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      saveFtpMutation.mutate({
                                        ftpHost,
                                        ftpUsername: ftpUsername || undefined,
                                        ftpPassword: ftpPassword || undefined,
                                        ftpPath: ftpPath || undefined,
                                        autoSync: ftpAutoSync,
                                        syncFrequency: ftpSyncFrequency,
                                      });
                                    }}
                                    disabled={saveFtpMutation.isPending}
                                    data-testid="button-save-petfinder-ftp"
                                  >
                                    {saveFtpMutation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save FTP Credentials
                                      </>
                                    )}
                                  </Button>
                                  {isConfiguring && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setSelectedPlatform(null)}
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <Form {...form}>
                                <form onSubmit={form.handleSubmit((data) => {
                                  if (platform === 'rescuegroups' && !data.organizationId) {
                                    form.setError('organizationId', {
                                      type: 'manual',
                                      message: 'Organization ID is required for RescueGroups'
                                    });
                                    return;
                                  }
                                  saveMutation.mutate({ platform, config: data });
                                })} className="space-y-4">
                                  <FormField
                                    control={form.control}
                                    name="clientId"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>{info.fields.clientId}</FormLabel>
                                        <FormControl>
                                          <Input 
                                            placeholder="Enter your client ID or API key" 
                                            data-testid={`input-${platform}-client-id`}
                                            {...field} 
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  {info.fields.clientSecret && (
                                    <FormField
                                      control={form.control}
                                      name="clientSecret"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>{info.fields.clientSecret}</FormLabel>
                                          <FormControl>
                                            <Input 
                                              type="password"
                                              placeholder="Enter your client secret" 
                                              data-testid={`input-${platform}-client-secret`}
                                              {...field} 
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  )}

                                  {info.fields.organizationId && (
                                    <FormField
                                      control={form.control}
                                      name="organizationId"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>{info.fields.organizationId}</FormLabel>
                                          <FormControl>
                                            <Input 
                                              placeholder="Enter your organization/shelter ID" 
                                              data-testid={`input-${platform}-org-id`}
                                              {...field} 
                                            />
                                          </FormControl>
                                          <FormDescription>
                                            Found in your {info.name} account settings
                                          </FormDescription>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  )}

                                  <div className="flex gap-2">
                                    <Button 
                                      type="submit" 
                                      disabled={saveMutation.isPending}
                                      data-testid={`button-save-${platform}`}
                                    >
                                      {saveMutation.isPending ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Saving...
                                        </>
                                      ) : (
                                        <>
                                          <Save className="mr-2 h-4 w-4" />
                                          Save Credentials
                                        </>
                                      )}
                                    </Button>
                                    {isConfiguring && (
                                      <Button 
                                        type="button" 
                                        variant="outline"
                                        onClick={() => setSelectedPlatform(null)}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                </form>
                              </Form>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
      </div>
    </DashboardLayout>
  );
}
