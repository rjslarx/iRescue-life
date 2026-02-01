import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserCircle, Calendar, Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
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
import type { VolunteerSignup, VolunteerOpportunity, User } from "@shared/schema";

interface VolunteerSignupWithOpportunity extends VolunteerSignup {
  opportunity?: VolunteerOpportunity;
}

interface VolunteerSignupsData {
  signups: VolunteerSignupWithOpportunity[];
}

interface UsersData {
  users: User[];
}

export default function VolunteerManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedSignup, setSelectedSignup] = useState<VolunteerSignupWithOpportunity | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<VolunteerOpportunity | undefined>();

  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('staff') || false;

  // Fetch volunteer signups (placeholder - will fail gracefully until backend route is created)
  const { data: signupsData, isLoading: signupsLoading } = useQuery<VolunteerSignupsData>({
    queryKey: ['/api/volunteer-signups'],
    retry: false,
    meta: {
      onError: () => {
        // Silently fail - route doesn't exist yet
      }
    }
  });

  // Fetch all users
  const { data: usersData, isLoading: usersLoading } = useQuery<UsersData>({
    queryKey: ['/api/users'],
  });

  // Fetch opportunities
  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useQuery<{ opportunities: VolunteerOpportunity[] }>({
    queryKey: ["/api/volunteer-opportunities"],
  });

  const signups = signupsData?.signups || [];
  const allUsers = usersData?.users || [];
  // Filter users to show only those with volunteer role
  const volunteers = allUsers.filter(user => user.roles?.includes('volunteer'));
  const opportunities = opportunitiesData?.opportunities || [];

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

  const getCustomResponsesCount = (customResponses: Record<string, any> | null | undefined) => {
    if (!customResponses) return 0;
    return Object.keys(customResponses).length;
  };

  return (
    <DashboardLayout
      title="Volunteer Management"
      description={`${signups.length} new application${signups.length !== 1 ? 's' : ''} • ${volunteers.length} active volunteer${volunteers.length !== 1 ? 's' : ''} • ${opportunities.length} opportunit${opportunities.length !== 1 ? 'ies' : 'y'}`}
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="applications" className="space-y-6">
          <TabsList>
            <TabsTrigger value="applications" data-testid="tab-applications">
              <Users className="h-4 w-4 mr-2" />
              Applications ({signups.length})
            </TabsTrigger>
            <TabsTrigger value="active-volunteers" data-testid="tab-active-volunteers">
              <UserCircle className="h-4 w-4 mr-2" />
              Active Volunteers ({volunteers.length})
            </TabsTrigger>
            <TabsTrigger value="opportunities" data-testid="tab-opportunities">
              <Calendar className="h-4 w-4 mr-2" />
              Opportunities ({opportunities.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Applications */}
          <TabsContent value="applications">
            {signupsLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-applications">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : signups.length === 0 ? (
              <Card className="p-12 text-center" data-testid="empty-applications">
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" data-testid="icon-empty-applications" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-applications-title">No Applications Yet</h3>
                <p className="text-muted-foreground" data-testid="text-empty-applications-description">
                  Volunteer applications will appear here when people sign up.
                </p>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Opportunity</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Custom Responses</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signups.map((signup) => (
                      <TableRow key={signup.id} data-testid={`row-signup-${signup.id}`}>
                        <TableCell className="font-medium">{signup.applicantName}</TableCell>
                        <TableCell>{signup.applicantEmail}</TableCell>
                        <TableCell>{signup.applicantPhone}</TableCell>
                        <TableCell>{signup.opportunity?.title || 'Unknown'}</TableCell>
                        <TableCell>{formatDate(signup.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getCustomResponsesCount(signup.customResponses)} response{getCustomResponsesCount(signup.customResponses) !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedSignup(signup)}
                            data-testid={`button-view-${signup.id}`}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Tab 2: Active Volunteers */}
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
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Joined Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {volunteers.map((volunteer) => (
                      <TableRow key={volunteer.id} data-testid={`row-volunteer-${volunteer.id}`}>
                        <TableCell className="font-medium">{volunteer.fullName}</TableCell>
                        <TableCell>{volunteer.email}</TableCell>
                        <TableCell>{volunteer.phone || '—'}</TableCell>
                        <TableCell>{formatDate(volunteer.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Tab 3: Opportunities */}
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

      {/* Signup Details Dialog */}
      <Dialog open={!!selectedSignup} onOpenChange={() => setSelectedSignup(null)} data-testid="dialog-signup-details">
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-content-signup-details">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-signup-details">Volunteer Application Details</DialogTitle>
            <DialogDescription data-testid="dialog-description-signup-details">
              Review the volunteer application information
            </DialogDescription>
          </DialogHeader>
          {selectedSignup && (
            <div className="space-y-4" data-testid="signup-details-content">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Applicant Name</label>
                  <p data-testid="text-applicant-name">{selectedSignup.applicantName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p data-testid="text-applicant-email">{selectedSignup.applicantEmail}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p data-testid="text-applicant-phone">{selectedSignup.applicantPhone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Opportunity</label>
                  <p data-testid="text-opportunity-title">{selectedSignup.opportunity?.title || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date Submitted</label>
                  <p data-testid="text-date-submitted">{formatDate(selectedSignup.createdAt)}</p>
                </div>
                {selectedSignup.opportunity?.date && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Opportunity Date</label>
                    <p>{selectedSignup.opportunity.date}</p>
                  </div>
                )}
                {selectedSignup.opportunity?.time && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Time</label>
                    <p>{selectedSignup.opportunity.time}</p>
                  </div>
                )}
                {selectedSignup.opportunity?.location && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Location</label>
                    <p>{selectedSignup.opportunity.location}</p>
                  </div>
                )}
              </div>
              {selectedSignup.customResponses && Object.keys(selectedSignup.customResponses).length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-muted-foreground mb-3 block">Custom Responses</label>
                  <div className="space-y-3">
                    {Object.entries(selectedSignup.customResponses).map(([key, value]) => (
                      <div key={key}>
                        <label className="text-sm font-medium">{key}</label>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
    </DashboardLayout>
  );
}
