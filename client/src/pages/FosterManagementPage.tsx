import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, Users, Heart, Package, MessageSquare, AlertCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
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
import type { FosterApplication, FosterAnimal, Animal, User, SupplyRequest, FosterUpdate } from "@shared/schema";

interface FosterApplicationsData {
  applications: FosterApplication[];
}

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
}

interface FosterAnimalsData {
  fosterAnimals: FosterAnimalWithDetails[];
}

interface SupplyRequestWithDetails extends SupplyRequest {
  animal: Animal | null;
  foster: User | null;
}

interface SupplyRequestsData {
  supplyRequests: SupplyRequestWithDetails[];
}

interface FosterUpdateWithDetails extends FosterUpdate {
  animal: Animal | null;
  foster: User | null;
}

interface FosterUpdatesData {
  fosterUpdates: FosterUpdateWithDetails[];
}

export default function FosterManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [selectedApplication, setSelectedApplication] = useState<FosterApplication | null>(null);
  const [selectedUpdate, setSelectedUpdate] = useState<FosterUpdateWithDetails | null>(null);
  
  // Parse tab from query params
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const tabParam = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'applications');

  // Update active tab when URL changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const { data: applicationsData, isLoading: applicationsLoading } = useQuery<FosterApplicationsData>({
    queryKey: ['/api/foster-applications'],
  });

  const { data: fostersData, isLoading: fostersLoading } = useQuery<FosterAnimalsData>({
    queryKey: ['/api/foster-animals'],
  });

  const { data: supplyRequestsData, isLoading: supplyRequestsLoading } = useQuery<SupplyRequestsData>({
    queryKey: ['/api/supply-requests'],
  });

  const { data: fosterUpdatesData, isLoading: fosterUpdatesLoading } = useQuery<FosterUpdatesData>({
    queryKey: ['/api/foster-updates'],
  });

  const updateApplicationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      return await apiRequest("PATCH", `/api/foster-applications/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-applications'] });
      setSelectedApplication(null);
      toast({
        title: "Application Updated",
        description: "The foster application has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSupplyRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'approved' | 'fulfilled' | 'denied' }) => {
      return await apiRequest("PATCH", `/api/supply-requests/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-requests'] });
      toast({
        title: "Supply Request Updated",
        description: "The supply request has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateFosterUpdateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'acknowledged' | 'resolved' }) => {
      return await apiRequest("PATCH", `/api/foster-updates/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-updates'] });
      setSelectedUpdate(null);
      toast({
        title: "Foster Update Acknowledged",
        description: "The foster update has been acknowledged.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const applications = applicationsData?.applications || [];
  const fosterAnimals = fostersData?.fosterAnimals || [];
  const supplyRequests = supplyRequestsData?.supplyRequests || [];
  const fosterUpdates = fosterUpdatesData?.fosterUpdates || [];

  // Helper function to check if item is archived (archivedAt is in the past)
  const isArchived = (archivedAt: Date | string | null): boolean => {
    if (!archivedAt) return false;
    return new Date(archivedAt) <= new Date();
  };

  // Filter archived and active items
  const activeSupplyRequests = supplyRequests.filter(sr => !isArchived(sr.archivedAt));
  const archivedSupplyRequests = supplyRequests.filter(sr => isArchived(sr.archivedAt));
  
  const activeFosterUpdates = fosterUpdates.filter(fu => !isArchived(fu.archivedAt));
  const archivedFosterUpdates = fosterUpdates.filter(fu => isArchived(fu.archivedAt));

  const pendingApplications = applications.filter(a => a.status === 'pending');
  const approvedApplications = applications.filter(a => a.status === 'approved');
  const activeFosters = fosterAnimals.filter(fa => fa.status === 'active');
  const pendingSupplyRequests = activeSupplyRequests.filter(sr => sr.status === 'pending');
  const unacknowledgedUpdates = activeFosterUpdates.filter(fu => fu.status === 'pending');

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout
      title="Foster Management"
      description={`${pendingApplications.length} pending application${pendingApplications.length !== 1 ? 's' : ''} • ${pendingSupplyRequests.length} pending supply request${pendingSupplyRequests.length !== 1 ? 's' : ''} • ${unacknowledgedUpdates.length} new update${unacknowledgedUpdates.length !== 1 ? 's' : ''}`}
    >
      <div className="flex-1 overflow-auto p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
                <TabsTrigger value="applications" data-testid="tab-applications">
                  <Users className="h-4 w-4 mr-2" />
                  Applications ({pendingApplications.length})
                </TabsTrigger>
                <TabsTrigger value="fosters" data-testid="tab-fosters">
                  <Heart className="h-4 w-4 mr-2" />
                  Active Fosters ({activeFosters.length})
                </TabsTrigger>
                <TabsTrigger value="supply-requests" data-testid="tab-supply-requests">
                  <Package className="h-4 w-4 mr-2" />
                  Supply Requests ({pendingSupplyRequests.length})
                </TabsTrigger>
                <TabsTrigger value="foster-updates" data-testid="tab-foster-updates">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Foster Updates ({unacknowledgedUpdates.length})
                </TabsTrigger>
                <TabsTrigger value="supply-history" data-testid="tab-supply-history">
                  <Package className="h-4 w-4 mr-2 opacity-60" />
                  Supply History ({archivedSupplyRequests.length})
                </TabsTrigger>
                <TabsTrigger value="update-history" data-testid="tab-update-history">
                  <MessageSquare className="h-4 w-4 mr-2 opacity-60" />
                  Update History ({archivedFosterUpdates.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="applications">
                {applicationsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : applications.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Applications Yet</h3>
                    <p className="text-muted-foreground">
                      Foster applications will appear here when people apply.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Housing</TableHead>
                          <TableHead>Experience</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Applied</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {applications.map((app) => (
                          <TableRow key={app.id} data-testid={`row-application-${app.id}`}>
                            <TableCell className="font-medium">{app.applicantName}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{app.applicantEmail}</div>
                                <div className="text-muted-foreground">{app.applicantPhone}</div>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{app.housingType}</TableCell>
                            <TableCell className="max-w-xs truncate">{app.experience}</TableCell>
                            <TableCell>{getStatusBadge(app.status)}</TableCell>
                            <TableCell>{formatDate(app.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedApplication(app)}
                                  data-testid={`button-view-${app.id}`}
                                >
                                  View
                                </Button>
                                {app.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => updateApplicationMutation.mutate({ id: app.id, status: 'approved' })}
                                      disabled={updateApplicationMutation.isPending}
                                      data-testid={`button-approve-${app.id}`}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => updateApplicationMutation.mutate({ id: app.id, status: 'rejected' })}
                                      disabled={updateApplicationMutation.isPending}
                                      data-testid={`button-reject-${app.id}`}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="fosters">
                {fostersLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : fosterAnimals.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Foster Animals Yet</h3>
                    <p className="text-muted-foreground">
                      Assign animals to approved fosters to get started.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Animal</TableHead>
                          <TableHead>Species/Breed</TableHead>
                          <TableHead>Foster Parent</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>Expected Return</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fosterAnimals.map((fa) => (
                          <TableRow key={fa.id} data-testid={`row-foster-${fa.id}`}>
                            <TableCell className="font-medium">{fa.animal?.name || 'Unknown'}</TableCell>
                            <TableCell>{fa.animal?.species} • {fa.animal?.breed}</TableCell>
                            <TableCell>{fa.foster?.fullName || 'Unknown'}</TableCell>
                            <TableCell>{formatDate(fa.startDate)}</TableCell>
                            <TableCell>{formatDate(fa.expectedReturnDate)}</TableCell>
                            <TableCell>
                              <Badge variant={fa.status === 'active' ? 'default' : 'secondary'}>
                                {fa.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="supply-requests">
                {supplyRequestsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : supplyRequests.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Supply Requests</h3>
                    <p className="text-muted-foreground">
                      Supply requests from foster parents will appear here.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Foster Parent</TableHead>
                          <TableHead>Animal</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplyRequests.map((request) => (
                          <TableRow key={request.id} data-testid={`row-supply-request-${request.id}`}>
                            <TableCell className="font-medium">{request.foster?.fullName || 'Unknown'}</TableCell>
                            <TableCell>{request.animal?.name || '—'}</TableCell>
                            <TableCell>{request.item}</TableCell>
                            <TableCell className="capitalize">{request.category}</TableCell>
                            <TableCell>{request.quantity}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  request.status === 'fulfilled' ? 'default' :
                                  request.status === 'pending' ? 'secondary' :
                                  request.status === 'denied' ? 'destructive' : 'outline'
                                }
                              >
                                {request.status === 'fulfilled' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                {request.status === 'denied' && <XCircle className="h-3 w-3 mr-1" />}
                                {request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(request.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {request.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => updateSupplyRequestMutation.mutate({ id: request.id, status: 'fulfilled' })}
                                      disabled={updateSupplyRequestMutation.isPending}
                                      data-testid={`button-fulfill-${request.id}`}
                                    >
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Mark Fulfilled
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="foster-updates">
                {fosterUpdatesLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : fosterUpdates.length === 0 ? (
                  <Card className="p-12 text-center">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Foster Updates</h3>
                    <p className="text-muted-foreground">
                      Updates from foster parents will appear here.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Foster Parent</TableHead>
                          <TableHead>Animal</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fosterUpdates.map((update) => (
                          <TableRow key={update.id} data-testid={`row-foster-update-${update.id}`}>
                            <TableCell className="font-medium">{update.foster?.fullName || 'Unknown'}</TableCell>
                            <TableCell>{update.animal?.name || 'Unknown'}</TableCell>
                            <TableCell className="capitalize">
                              {update.updateType === 'medical_concern' && (
                                <Badge variant="destructive">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Medical Concern
                                </Badge>
                              )}
                              {update.updateType === 'behavioral_note' && (
                                <Badge variant="secondary">Behavioral Note</Badge>
                              )}
                              {update.updateType === 'general_update' && (
                                <Badge variant="outline">General Update</Badge>
                              )}
                              {update.updateType === 'photo_update' && (
                                <Badge variant="outline">Photo Update</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  update.priority === 'urgent' || update.priority === 'high' ? 'destructive' :
                                  update.priority === 'normal' ? 'secondary' : 'outline'
                                }
                              >
                                {update.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  update.status === 'resolved' ? 'default' :
                                  update.status === 'acknowledged' ? 'secondary' : 'outline'
                                }
                              >
                                {update.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {update.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(update.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedUpdate(update)}
                                  data-testid={`button-view-update-${update.id}`}
                                >
                                  View
                                </Button>
                                {update.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateFosterUpdateMutation.mutate({ id: update.id, status: 'acknowledged' })}
                                    disabled={updateFosterUpdateMutation.isPending}
                                    data-testid={`button-acknowledge-${update.id}`}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Acknowledge
                                  </Button>
                                )}
                                {update.status === 'acknowledged' && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateFosterUpdateMutation.mutate({ id: update.id, status: 'resolved' })}
                                    disabled={updateFosterUpdateMutation.isPending}
                                    data-testid={`button-resolve-${update.id}`}
                                  >
                                    Mark Resolved
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="supply-history">
                {supplyRequestsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : archivedSupplyRequests.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-60" />
                    <h3 className="text-xl font-semibold mb-2">No Archived Supply Requests</h3>
                    <p className="text-muted-foreground">
                      Fulfilled or denied supply requests are automatically archived after 7 days.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Foster Parent</TableHead>
                          <TableHead>Animal</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Archived</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {archivedSupplyRequests.map((request) => (
                          <TableRow key={request.id} data-testid={`row-supply-request-archived-${request.id}`}>
                            <TableCell className="font-medium">{request.foster?.fullName || 'Unknown'}</TableCell>
                            <TableCell>{request.animal?.name || '—'}</TableCell>
                            <TableCell>{request.item}</TableCell>
                            <TableCell className="capitalize">{request.category}</TableCell>
                            <TableCell>{request.quantity}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  request.status === 'fulfilled' ? 'default' :
                                  request.status === 'denied' ? 'destructive' : 'outline'
                                }
                              >
                                {request.status === 'fulfilled' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {request.status === 'denied' && <XCircle className="h-3 w-3 mr-1" />}
                                {request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(request.createdAt)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(request.archivedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="update-history">
                {fosterUpdatesLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : archivedFosterUpdates.length === 0 ? (
                  <Card className="p-12 text-center">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-60" />
                    <h3 className="text-xl font-semibold mb-2">No Archived Foster Updates</h3>
                    <p className="text-muted-foreground">
                      Resolved foster updates are automatically archived after 7 days.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Foster Parent</TableHead>
                          <TableHead>Animal</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Archived</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {archivedFosterUpdates.map((update) => (
                          <TableRow key={update.id} data-testid={`row-foster-update-archived-${update.id}`}>
                            <TableCell className="font-medium">{update.foster?.fullName || 'Unknown'}</TableCell>
                            <TableCell>{update.animal?.name || 'Unknown'}</TableCell>
                            <TableCell className="capitalize">
                              {update.updateType === 'medical_concern' && (
                                <Badge variant="destructive">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Medical Concern
                                </Badge>
                              )}
                              {update.updateType === 'behavioral_note' && (
                                <Badge variant="secondary">Behavioral Note</Badge>
                              )}
                              {update.updateType === 'general_update' && (
                                <Badge variant="outline">General Update</Badge>
                              )}
                              {update.updateType === 'photo_update' && (
                                <Badge variant="outline">Photo Update</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  update.priority === 'urgent' ? 'destructive' :
                                  update.priority === 'high' ? 'secondary' : 'outline'
                                }
                              >
                                {update.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">
                                {update.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {update.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(update.createdAt)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(update.archivedAt)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedUpdate(update)}
                                data-testid={`button-view-archived-update-${update.id}`}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
      </div>

      {/* Application Details Dialog */}
      <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Foster Application Details</DialogTitle>
            <DialogDescription>
              Review the foster application information
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Applicant Name</label>
                  <p>{selectedApplication.applicantName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedApplication.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p>{selectedApplication.applicantEmail}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p>{selectedApplication.applicantPhone}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
                  <p>{selectedApplication.address}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Housing Type</label>
                  <p className="capitalize">{selectedApplication.housingType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Has Yard</label>
                  <p>{selectedApplication.hasYard ? 'Yes' : 'No'}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Other Pets</label>
                  <p>{selectedApplication.hasOtherPets ? selectedApplication.otherPetsDetails || 'Yes' : 'No'}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Experience</label>
                  <p className="whitespace-pre-wrap">{selectedApplication.experience}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Availability</label>
                  <p className="whitespace-pre-wrap">{selectedApplication.availability}</p>
                </div>
                {selectedApplication.preferences && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Preferences</label>
                    <p className="whitespace-pre-wrap">{selectedApplication.preferences}</p>
                  </div>
                )}
                {selectedApplication.vetReference && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Vet Reference</label>
                    <p>{selectedApplication.vetReference}</p>
                  </div>
                )}
                {selectedApplication.personalReference && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Personal Reference</label>
                    <p>{selectedApplication.personalReference}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Foster Update Details Dialog */}
      <Dialog open={!!selectedUpdate} onOpenChange={() => setSelectedUpdate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Foster Update Details</DialogTitle>
            <DialogDescription>
              Review the foster update information
            </DialogDescription>
          </DialogHeader>
          {selectedUpdate && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Foster Parent</label>
                  <p>{selectedUpdate.foster?.fullName || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Animal</label>
                  <p>{selectedUpdate.animal?.name || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Update Type</label>
                  <p className="capitalize">{selectedUpdate.updateType.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Priority</label>
                  <Badge 
                    variant={
                      selectedUpdate.priority === 'urgent' || selectedUpdate.priority === 'high' ? 'destructive' :
                      selectedUpdate.priority === 'normal' ? 'secondary' : 'outline'
                    }
                  >
                    {selectedUpdate.priority}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Badge 
                    variant={
                      selectedUpdate.status === 'resolved' ? 'default' :
                      selectedUpdate.status === 'acknowledged' ? 'secondary' : 'outline'
                    }
                  >
                    {selectedUpdate.status}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Submitted</label>
                  <p>{formatDate(selectedUpdate.createdAt)}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="whitespace-pre-wrap">{selectedUpdate.description}</p>
                </div>
                {selectedUpdate.photoUrls && selectedUpdate.photoUrls.length > 0 && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Photos</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                      {selectedUpdate.photoUrls.map((url, idx) => (
                        <img 
                          key={idx} 
                          src={url} 
                          alt={`Update photo ${idx + 1}`}
                          className="rounded-md border"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {selectedUpdate.status === 'pending' && (
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => updateFosterUpdateMutation.mutate({ id: selectedUpdate.id, status: 'acknowledged' })}
                    disabled={updateFosterUpdateMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Acknowledge
                  </Button>
                </div>
              )}
              {selectedUpdate.status === 'acknowledged' && (
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => updateFosterUpdateMutation.mutate({ id: selectedUpdate.id, status: 'resolved' })}
                    disabled={updateFosterUpdateMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Resolved
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
