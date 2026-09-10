import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserCircle, Calendar, Plus, FolderOpen, FileText, ExternalLink, Files, ShieldCheck, Link2, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { PersonDocumentsModal } from "@/components/PersonDocumentsModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VolunteerCalendar from "@/components/VolunteerCalendar";
import AddOpportunityDialog from "@/components/AddOpportunityDialog";
import type { VolunteerOpportunity, User } from "@shared/schema";

interface UsersData {
  users: User[];
}

interface VolunteerApplicationBasic {
  id: string;
  applicantEmail: string;
  driveFolderId: string | null;
}

interface FolderFile {
  name: string;
  path: string;
  size: number;
  updatedAt: string;
  contentType: string;
}

export default function VolunteerManagementPage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | undefined>();
  const [documentFolderEmail, setDocumentFolderEmail] = useState<string | null>(null);
  const [waiverLinkCopied, setWaiverLinkCopied] = useState(false);
  const [documentFolderPath, setDocumentFolderPath] = useState<string | null>(null);
  const [documentVolunteerName, setDocumentVolunteerName] = useState<string>('');
  const [documentsModal, setDocumentsModal] = useState<{
    isOpen: boolean;
    personType: "volunteer" | "user";
    personId: string;
    personName: string;
  } | null>(null);
  const [trainingFilter, setTrainingFilter] = useState("all");
  const [trainingVolunteer, setTrainingVolunteer] = useState<{ id: string; name: string } | null>(null);
  const [overrideTutorialId, setOverrideTutorialId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const isAdmin = user?.roles?.includes('owner') || user?.roles?.includes('admin') || user?.roles?.includes('staff') || false;

  // Fetch all users
  const { data: usersData, isLoading: usersLoading } = useQuery<UsersData>({
    queryKey: ['/api/users'],
  });

  // Fetch opportunities
  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useQuery<{ opportunities: VolunteerOpportunity[] }>({
    queryKey: ["/api/volunteer-opportunities"],
  });

  // Fetch volunteer applications to get driveFolderIds
  const { data: volunteerAppsData } = useQuery<{ applications: VolunteerApplicationBasic[] }>({
    queryKey: ['/api/volunteer-applications'],
    select: (data) => ({
      applications: data.applications?.map(app => ({
        id: app.id,
        applicantEmail: app.applicantEmail,
        driveFolderId: app.driveFolderId
      })) || []
    })
  });

  const { data: holdHarmlessData } = useQuery<{ holdHarmlessStatus: Record<string, { signedAt: string; title: string }> }>({
    queryKey: ['/api/volunteers/hold-harmless-status'],
  });
  const { data: trainingData } = useQuery<{
    volunteers: Array<{
      id: string;
      overallStatus: "current" | "due_soon" | "overdue" | "incomplete";
      requirements: Array<{ tutorialId: string; title: string; requirementVersion: number; status: string; completion: { renewalDueAt: string } | null }>;
    }>;
  }>({ queryKey: ['/api/volunteer-training/tracker'], enabled: isAdmin });
  const { data: historyData } = useQuery<{
    history: Array<{ id: string; title: string; requirementVersion: number; completionType: string; attestedAt: string; renewalDueAt: string; overrideReason: string | null }>;
  }>({
    queryKey: ['/api/volunteer-training/users', trainingVolunteer?.id, 'history'],
    queryFn: async () => (await apiRequest('GET', `/api/volunteer-training/users/${trainingVolunteer!.id}/history`)).json(),
    enabled: !!trainingVolunteer,
  });
  const overrideMutation = useMutation({
    mutationFn: async () => (await apiRequest('POST', `/api/volunteer-training/users/${trainingVolunteer!.id}/override`, {
      tutorialId: overrideTutorialId,
      requirementVersion: trainingData!.volunteers
        .find(volunteer => volunteer.id === trainingVolunteer!.id)!.requirements
        .find(item => item.tutorialId === overrideTutorialId)!.requirementVersion,
      reason: overrideReason,
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-training/tracker'] });
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-training/users', trainingVolunteer?.id, 'history'] });
      setOverrideReason("");
      toast({ title: "Training override recorded", description: "The reason is retained in the volunteer's audit history." });
    },
    onError: (e: any) => toast({ title: "Unable to record override", description: e.message, variant: "destructive" }),
  });

  const holdHarmlessStatus = holdHarmlessData?.holdHarmlessStatus || {};

  const hasHoldHarmless = (email: string): { signed: boolean; signedAt?: string } => {
    const normalized = email?.toLowerCase().trim();
    const status = holdHarmlessStatus[normalized];
    if (status) return { signed: true, signedAt: status.signedAt };
    return { signed: false };
  };

  // Fetch folder files when a folder is selected
  const { data: folderFilesData, isLoading: folderFilesLoading } = useQuery<{ files: FolderFile[] }>({
    queryKey: ['/api/documents/folder', documentFolderPath],
    queryFn: async () => {
      if (!documentFolderPath) return { files: [] };
      const response = await apiRequest('GET', `/api/documents/folder?path=${encodeURIComponent(documentFolderPath)}`);
      return response.json();
    },
    enabled: !!documentFolderPath,
  });

  const allUsers = usersData?.users || [];
  // Filter users to show only those with volunteer role
  const volunteers = allUsers.filter(user => user.roles?.includes('volunteer'));
  const visibleVolunteers = volunteers.filter(volunteer => {
    if (trainingFilter === "all") return true;
    return trainingData?.volunteers.find(item => item.id === volunteer.id)?.overallStatus === trainingFilter;
  });
  const opportunities = opportunitiesData?.opportunities || [];
  const volunteerApps = volunteerAppsData?.applications || [];

  // Helper to find volunteer's folder by email
  const getVolunteerFolder = (volunteerEmail: string): string | null => {
    const app = volunteerApps.find(a => a.applicantEmail?.toLowerCase() === volunteerEmail?.toLowerCase());
    return app?.driveFolderId || null;
  };

  // Sign up mutation
  const signupMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      return await apiRequest("POST", `/api/volunteer-opportunities/${opportunityId}/signup`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "You've signed up for this opportunity!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel signup mutation
  const cancelMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      return await apiRequest("DELETE", `/api/volunteer-opportunities/${opportunityId}/signup`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Your signup has been cancelled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete opportunity mutation
  const deleteMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      return await apiRequest("DELETE", `/api/volunteer-opportunities/${opportunityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/volunteer-opportunities"] });
      toast({
        title: "Success",
        description: "Opportunity deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSignUp = (opportunityId: string) => {
    signupMutation.mutate(opportunityId);
  };

  const handleCancel = (opportunityId: string) => {
    cancelMutation.mutate(opportunityId);
  };

  const handleEdit = (opportunity: VolunteerOpportunity) => {
    setEditingOpportunity(opportunity);
    setDialogOpen(true);
  };

  const handleDelete = (opportunityId: string) => {
    if (confirm("Are you sure you want to delete this opportunity?")) {
      deleteMutation.mutate(opportunityId);
    }
  };

  const handleAddNew = () => {
    setEditingOpportunity(undefined);
    setDialogOpen(true);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  return (
    <DashboardLayout
      title="Volunteer Management"
      description={`${volunteers.length} active volunteer${volunteers.length !== 1 ? 's' : ''} • ${opportunities.length} opportunit${opportunities.length !== 1 ? 'ies' : 'y'}`}
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="active-volunteers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active-volunteers" data-testid="tab-active-volunteers">
              <UserCircle className="h-4 w-4 mr-2" />
              Active Volunteers ({volunteers.length})
            </TabsTrigger>
            <TabsTrigger value="opportunities" data-testid="tab-opportunities">
              <Calendar className="h-4 w-4 mr-2" />
              Opportunities ({opportunities.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    const waiverUrl = `${window.location.origin}${basePath}/volunteer-waiver`;
                    navigator.clipboard.writeText(waiverUrl).then(() => {
                      setWaiverLinkCopied(true);
                      toast({ title: 'Waiver link copied', description: 'Share this link with walk-in volunteers to sign the hold harmless waiver.' });
                      setTimeout(() => setWaiverLinkCopied(false), 2000);
                    });
                  }}
                  data-testid="button-copy-waiver-link"
                >
                  {waiverLinkCopied ? <Check className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                  {waiverLinkCopied ? 'Link Copied' : 'Copy Public Waiver Link'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Copy the public hold harmless waiver link to share with walk-in volunteers
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Tab 1: Active Volunteers */}
          <TabsContent value="active-volunteers">
            {usersLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-volunteers">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : volunteers.length === 0 ? (
              <Card className="p-12 text-center" data-testid="empty-volunteers">
                <UserCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" data-testid="icon-empty-volunteers" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-volunteers-title">No Active Volunteers Yet</h3>
                <p className="text-muted-foreground" data-testid="text-empty-volunteers-description">
                  Users with volunteer role will appear here.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
              <div className="flex justify-end">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={trainingFilter}
                  onChange={event => setTrainingFilter(event.target.value)}
                  aria-label="Filter by training status"
                  data-testid="select-training-status-filter"
                >
                  <option value="all">All training statuses</option>
                  <option value="current">Current</option>
                  <option value="due_soon">Due soon</option>
                  <option value="overdue">Overdue</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Joined Date</TableHead>
                      <TableHead>Compliance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleVolunteers.map((volunteer) => {
                      const folderPath = getVolunteerFolder(volunteer.email);
                      const hhStatus = hasHoldHarmless(volunteer.email);
                      const training = trainingData?.volunteers.find(item => item.id === volunteer.id);
                      return (
                        <TableRow key={volunteer.id} data-testid={`row-volunteer-${volunteer.id}`}>
                          <TableCell className="font-medium">{volunteer.fullName}</TableCell>
                          <TableCell>{volunteer.email}</TableCell>
                          <TableCell>{volunteer.phone || '—'}</TableCell>
                          <TableCell>{formatDate(volunteer.createdAt)}</TableCell>
                          <TableCell>
                            {hhStatus.signed ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="gap-1 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 no-default-active-elevate" data-testid={`badge-hh-${volunteer.id}`}>
                                    <ShieldCheck className="h-3 w-3" />
                                    Hold Harmless
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Signed {hhStatus.signedAt ? new Date(hhStatus.signedAt).toLocaleDateString() : ''}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground" data-testid={`text-no-hh-${volunteer.id}`}>No waiver on file</span>
                            )}
                            {training && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-1 h-7 px-2"
                                onClick={() => {
                                  setTrainingVolunteer({ id: volunteer.id, name: volunteer.fullName || volunteer.email });
                                  setOverrideTutorialId(training.requirements.find(item => !['current', 'due_soon'].includes(item.status))?.tutorialId || training.requirements[0]?.tutorialId || "");
                                }}
                                data-testid={`button-training-history-${volunteer.id}`}
                              >
                                <Badge variant={['overdue', 'incomplete'].includes(training.overallStatus) ? "destructive" : "outline"}>
                                  Training {training.overallStatus.replace('_', ' ')}
                                </Badge>
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {folderPath && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setDocumentFolderPath(folderPath);
                                    setDocumentVolunteerName(volunteer.fullName || volunteer.email);
                                  }}
                                  title="Drive Documents"
                                  data-testid={`button-drive-${volunteer.id}`}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDocumentsModal({
                                  isOpen: true,
                                  personType: "volunteer",
                                  personId: volunteer.id,
                                  personName: volunteer.fullName || volunteer.email,
                                })}
                                title="All Documents"
                                data-testid={`button-documents-${volunteer.id}`}
                              >
                                <Files className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Opportunities */}
          <TabsContent value="opportunities">
            <div className="space-y-4">
              <div className="flex justify-end">
                {isAdmin && (
                  <Button onClick={handleAddNew} data-testid="button-add-opportunity">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Opportunity
                  </Button>
                )}
              </div>
              {opportunitiesLoading ? (
                <div className="flex items-center justify-center h-64" data-testid="loading-opportunities">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : opportunities.length === 0 ? (
                <Card className="p-12 text-center" data-testid="empty-opportunities">
                  <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" data-testid="icon-empty-opportunities" />
                  <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-opportunities-title">No Opportunities Yet</h3>
                  <p className="text-muted-foreground mb-4" data-testid="text-empty-opportunities-description">No volunteer opportunities available yet.</p>
                  {isAdmin && (
                    <Button onClick={handleAddNew} data-testid="button-add-first-opportunity">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Opportunity
                    </Button>
                  )}
                </Card>
              ) : (
                <VolunteerCalendar 
                  opportunities={opportunities}
                  onSignUp={handleSignUp}
                  onCancel={handleCancel}
                  onEdit={isAdmin ? handleEdit : undefined}
                  onDelete={isAdmin ? handleDelete : undefined}
                  isAdmin={isAdmin}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Opportunity Dialog */}
      <Dialog open={!!trainingVolunteer} onOpenChange={(open) => !open && setTrainingVolunteer(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-training-history">
          <DialogHeader>
            <DialogTitle>Training history — {trainingVolunteer?.name}</DialogTitle>
            <DialogDescription>
              Explicit attestations and authorized overrides. Video playback is not technically verified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {historyData?.history.length ? historyData.history.map(item => (
              <Card key={item.id} className="p-3">
                <div className="font-medium">{item.title} · version {item.requirementVersion}</div>
                <div className="text-sm text-muted-foreground">
                  {item.completionType === "staff_override" ? "Staff override" : "Volunteer attestation"} on {new Date(item.attestedAt).toLocaleDateString()}
                  {" · "}renewal due {new Date(item.renewalDueAt).toLocaleDateString()}
                </div>
                {item.overrideReason && <p className="text-sm mt-1">Reason: {item.overrideReason}</p>}
              </Card>
            )) : <p className="text-sm text-muted-foreground">No completion history.</p>}
          </div>
          {isAdmin && trainingVolunteer && (trainingData?.volunteers.find(item => item.id === trainingVolunteer.id)?.requirements.length || 0) > 0 && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-medium">Authorized staff override</h4>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={overrideTutorialId}
                onChange={event => setOverrideTutorialId(event.target.value)}
                data-testid="select-override-training"
              >
                {trainingData?.volunteers.find(item => item.id === trainingVolunteer.id)?.requirements.map(item => (
                  <option key={item.tutorialId} value={item.tutorialId}>{item.title} ({item.status.replace('_', ' ')})</option>
                ))}
              </select>
              <Textarea
                value={overrideReason}
                onChange={event => setOverrideReason(event.target.value)}
                placeholder="Audit reason (at least 10 characters)"
                data-testid="input-training-override-reason"
              />
              <Button
                disabled={overrideReason.trim().length < 10 || !overrideTutorialId || overrideMutation.isPending}
                onClick={() => overrideMutation.mutate()}
                data-testid="button-submit-training-override"
              >
                {overrideMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record override
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Opportunity Dialog */}
      <AddOpportunityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunity={editingOpportunity}
      />

      {/* Documents Folder Dialog */}
      <Dialog open={!!documentFolderPath} onOpenChange={(open) => !open && setDocumentFolderPath(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-documents-folder">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Documents - {documentVolunteerName}
            </DialogTitle>
            <DialogDescription>
              Files associated with this volunteer (application, hold harmless agreement, etc.)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {folderFilesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : folderFilesData?.files && folderFilesData.files.length > 0 ? (
              folderFilesData.files.map((file) => (
                <Card key={file.path} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB • {new Date(file.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(file.path, '_blank')}
                      data-testid={`button-download-file-${file.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No documents uploaded yet</p>
                <p className="text-xs mt-1">Documents will appear here when uploaded</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {documentsModal && (
        <PersonDocumentsModal
          isOpen={documentsModal.isOpen}
          onClose={() => setDocumentsModal(null)}
          personType={documentsModal.personType}
          personId={documentsModal.personId}
          personName={documentsModal.personName}
        />
      )}
    </DashboardLayout>
  );
}
