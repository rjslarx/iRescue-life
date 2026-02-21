import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, Heart, Package, MessageSquare, AlertCircle, History, Files, Plus, FileSignature, Send, FileText } from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CarePrioritiesInput from "@/components/CarePrioritiesInput";
import type { FosterAnimal, Animal, User, SupplyRequest, FosterUpdate, CarePriorities } from "@shared/schema";

interface FosterAnimalWithDetails extends FosterAnimal {
  animal: Animal | null;
  foster: User | null;
  placementAgreementStatus?: string | null;
  placementAgreementSignedAt?: string | null;
  contractPdfUrl?: string | null;
}

interface FosterAnimalsData {
  fosterAnimals: FosterAnimalWithDetails[];
}

interface PendingPlacement {
  animalId: string;
  animalName: string;
  animalSpecies: string;
  animalBreed: string;
  pendingFosterUserId: string;
  fosterName: string;
  fosterEmail: string;
  placementAgreementStatus: string | null;
  placementCreatedAt: string | null;
}

interface AvailableAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  animalId: string;
  status: string;
}

interface ActiveFoster {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
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
  const isMobile = useIsMobile();
  const [selectedUpdate, setSelectedUpdate] = useState<FosterUpdateWithDetails | null>(null);
  const [documentsModal, setDocumentsModal] = useState<{
    isOpen: boolean;
    personType: "foster" | "user";
    personId: string;
    personName: string;
  } | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [selectedFosterId, setSelectedFosterId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignCarePriorities, setAssignCarePriorities] = useState<CarePriorities>({
    enabled: false,
    flags: {},
  });
  const [animalHistoryDialog, setAnimalHistoryDialog] = useState<{ animalId: string; animalName: string } | null>(null);
  const [fosterHistoryDialog, setFosterHistoryDialog] = useState<{ fosterId: string; fosterName: string } | null>(null);
  
  // Parse tab from query params
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const tabParam = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'fosters');

  // Update active tab when URL changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const isAdminOrStaff = user?.activeRole === 'admin' || user?.activeRole === 'staff';

  const { data: fostersData, isLoading: fostersLoading } = useQuery<FosterAnimalsData>({
    queryKey: ['/api/foster-animals'],
  });

  const { data: pendingPlacementsData } = useQuery<{ pendingPlacements: PendingPlacement[] }>({
    queryKey: ['/api/foster-animals/pending-placements'],
    enabled: isAdminOrStaff,
  });

  const { data: availableAnimalsData } = useQuery<{ animals: AvailableAnimal[] }>({
    queryKey: ['/api/foster-animals/available-animals'],
    enabled: isAdminOrStaff && assignDialogOpen,
  });

  const { data: activeFostersData } = useQuery<{ fosters: ActiveFoster[] }>({
    queryKey: ['/api/foster-animals/active-fosters'],
    enabled: isAdminOrStaff && assignDialogOpen,
  });

  const { data: supplyRequestsData, isLoading: supplyRequestsLoading } = useQuery<SupplyRequestsData>({
    queryKey: ['/api/supply-requests'],
  });

  const { data: fosterUpdatesData, isLoading: fosterUpdatesLoading } = useQuery<FosterUpdatesData>({
    queryKey: ['/api/foster-updates'],
  });

  const assignAnimalMutation = useMutation({
    mutationFn: async (data: { animalId: string; fosterId: string; notes?: string; carePriorities?: CarePriorities }) => {
      return await apiRequest("POST", "/api/foster-animals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals/pending-placements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals/available-animals'] });
      setAssignDialogOpen(false);
      setSelectedAnimalId("");
      setSelectedFosterId("");
      setAssignNotes("");
      setAssignCarePriorities({ enabled: false, flags: {} });
      toast({
        title: "Animal Assigned",
        description: "The placement agreement has been sent to the foster for signing.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
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

  const updateFosterAnimalStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'completed' | 'returned' }) => {
      return await apiRequest("PATCH", `/api/foster-animals/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals/available-animals'] });
      toast({
        title: "Foster Status Updated",
        description: "The foster animal status has been updated and the animal is now available.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Status Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fosterAnimals = fostersData?.fosterAnimals || [];
  const pendingPlacements = pendingPlacementsData?.pendingPlacements || [];
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

  const activeFosters = fosterAnimals.filter(fa => fa.status === 'active');
  const totalFostersAndPending = activeFosters.length + pendingPlacements.length;
  const pendingSupplyRequests = activeSupplyRequests.filter(sr => sr.status === 'pending');
  const unacknowledgedUpdates = activeFosterUpdates.filter(fu => fu.status === 'pending');

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  return (
    <DashboardLayout
      title="Foster Management"
      description={`${activeFosters.length} active foster${activeFosters.length !== 1 ? 's' : ''}${pendingPlacements.length > 0 ? ` • ${pendingPlacements.length} pending` : ''} • ${pendingSupplyRequests.length} pending supply request${pendingSupplyRequests.length !== 1 ? 's' : ''} • ${unacknowledgedUpdates.length} new update${unacknowledgedUpdates.length !== 1 ? 's' : ''}`}
    >
      <div className="flex-1 overflow-auto p-4 md:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
              <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-5 h-auto gap-1">
                  <TabsTrigger value="fosters" data-testid="tab-fosters" className="flex flex-col md:flex-row items-center gap-1 px-3 py-2 md:py-1.5 whitespace-nowrap">
                    <Heart className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs md:text-sm">
                      {isMobile ? totalFostersAndPending : `Fosters (${totalFostersAndPending})`}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="supply-requests" data-testid="tab-supply-requests" className="flex flex-col md:flex-row items-center gap-1 px-3 py-2 md:py-1.5 whitespace-nowrap">
                    <Package className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs md:text-sm">
                      {isMobile ? pendingSupplyRequests.length : `Supplies (${pendingSupplyRequests.length})`}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="foster-updates" data-testid="tab-foster-updates" className="flex flex-col md:flex-row items-center gap-1 px-3 py-2 md:py-1.5 whitespace-nowrap">
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs md:text-sm">
                      {isMobile ? unacknowledgedUpdates.length : `Updates (${unacknowledgedUpdates.length})`}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="supply-history" data-testid="tab-supply-history" className="flex flex-col md:flex-row items-center gap-1 px-3 py-2 md:py-1.5 whitespace-nowrap">
                    <History className="h-4 w-4 flex-shrink-0 opacity-60" />
                    <span className="text-xs md:text-sm opacity-60">
                      {isMobile ? archivedSupplyRequests.length : `Supply Hist (${archivedSupplyRequests.length})`}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="update-history" data-testid="tab-update-history" className="flex flex-col md:flex-row items-center gap-1 px-3 py-2 md:py-1.5 whitespace-nowrap">
                    <History className="h-4 w-4 flex-shrink-0 opacity-60" />
                    <span className="text-xs md:text-sm opacity-60">
                      {isMobile ? archivedFosterUpdates.length : `Update Hist (${archivedFosterUpdates.length})`}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="fosters">
                {isAdminOrStaff && (
                  <div className="flex flex-wrap justify-end mb-4">
                    <Button onClick={() => setAssignDialogOpen(true)} data-testid="button-assign-foster">
                      <Plus className="h-4 w-4 mr-2" />
                      Assign Animal to Foster
                    </Button>
                  </div>
                )}

                {pendingPlacements.length > 0 && (
                  <div className="mb-6 space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground" data-testid="text-pending-placements-header">Pending Placement Agreements</h3>
                    {isMobile ? (
                      <div className="space-y-3">
                        {pendingPlacements.map((pp) => (
                          <Card key={pp.animalId} data-testid={`card-pending-placement-${pp.animalId}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">{pp.animalName}</CardTitle>
                                  <p className="text-sm text-muted-foreground">{pp.animalSpecies} {pp.animalBreed ? `• ${pp.animalBreed}` : ''}</p>
                                </div>
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                                  <FileSignature className="h-3 w-3 mr-1" />
                                  Pending Signature
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="text-sm">
                                <span className="text-muted-foreground">Foster:</span>
                                <p className="font-medium">{pp.fosterName}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Animal</TableHead>
                              <TableHead>Species/Breed</TableHead>
                              <TableHead>Foster Parent</TableHead>
                              <TableHead>Sent</TableHead>
                              <TableHead>Agreement Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingPlacements.map((pp) => (
                              <TableRow key={pp.animalId} data-testid={`row-pending-placement-${pp.animalId}`}>
                                <TableCell className="font-medium">{pp.animalName}</TableCell>
                                <TableCell>{pp.animalSpecies} {pp.animalBreed ? `• ${pp.animalBreed}` : ''}</TableCell>
                                <TableCell>{pp.fosterName}</TableCell>
                                <TableCell>{formatDate(pp.placementCreatedAt)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                                    <FileSignature className="h-3 w-3 mr-1" />
                                    Pending Signature
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    )}
                  </div>
                )}

                {fostersLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : fosterAnimals.length === 0 && pendingPlacements.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Foster Animals Yet</h3>
                    <p className="text-muted-foreground">
                      Assign animals to approved fosters to get started.
                    </p>
                  </Card>
                ) : fosterAnimals.length > 0 ? (
                  <>
                    {pendingPlacements.length > 0 && (
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Placements</h3>
                    )}
                    {isMobile ? (
                      <div className="space-y-3">
                        {fosterAnimals.map((fa) => (
                          <Card key={fa.id} data-testid={`card-foster-${fa.id}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">
                                    {isAdminOrStaff && fa.animal ? (
                                      <button
                                        className="text-left underline decoration-dotted underline-offset-4 hover-elevate cursor-pointer"
                                        onClick={() => setAnimalHistoryDialog({ animalId: fa.animal!.id, animalName: fa.animal!.name })}
                                        data-testid={`link-animal-history-mobile-${fa.animal.id}`}
                                      >
                                        {fa.animal.name}
                                      </button>
                                    ) : (
                                      fa.animal?.name || 'Unknown'
                                    )}
                                  </CardTitle>
                                  <p className="text-sm text-muted-foreground">{fa.animal?.species} • {fa.animal?.breed}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {isAdminOrStaff && fa.status === 'active' ? (
                                    <Select
                                      value={fa.status}
                                      disabled={updateFosterAnimalStatusMutation.isPending}
                                      onValueChange={(value: 'active' | 'completed' | 'returned') => {
                                        if (value !== 'active') {
                                          updateFosterAnimalStatusMutation.mutate({ id: fa.id, status: value });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-[120px]" data-testid={`select-foster-status-mobile-${fa.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="returned">Returned</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant={fa.status === 'active' ? 'default' : 'secondary'}>
                                      {fa.status}
                                    </Badge>
                                  )}
                                  {fa.placementAgreementStatus === 'signed' ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800" data-testid={`badge-agreement-signed-mobile-${fa.id}`}>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Agreement Signed
                                    </Badge>
                                  ) : fa.placementAgreementStatus === 'pending' ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800" data-testid={`badge-agreement-pending-mobile-${fa.id}`}>
                                      <FileSignature className="h-3 w-3 mr-1" />
                                      Pending Signature
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Foster Parent:</span>
                                  {isAdminOrStaff && fa.foster ? (
                                    <button
                                      className="text-left font-medium underline decoration-dotted underline-offset-4 hover-elevate cursor-pointer"
                                      onClick={() => setFosterHistoryDialog({ fosterId: fa.foster!.id, fosterName: fa.foster!.fullName })}
                                      data-testid={`link-foster-history-mobile-${fa.foster.id}`}
                                    >
                                      {fa.foster.fullName}
                                    </button>
                                  ) : (
                                    <p className="font-medium">{fa.foster?.fullName || 'Unknown'}</p>
                                  )}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Started:</span>
                                  <p>{formatDate(fa.startDate)}</p>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Expected Return:</span>
                                  <p>{formatDate(fa.expectedReturnDate)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {fa.foster && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setDocumentsModal({
                                      isOpen: true,
                                      personType: "foster",
                                      personId: fa.foster!.id,
                                      personName: fa.foster!.fullName,
                                    })}
                                    data-testid={`button-documents-foster-mobile-${fa.foster.id}`}
                                  >
                                    <Files className="h-4 w-4 mr-1" />
                                    Documents
                                  </Button>
                                )}
                                {fa.placementAgreementStatus === 'signed' && fa.contractPdfUrl && (
                                  <a href={fa.contractPdfUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-agreement-mobile-${fa.id}`}>
                                    <Button size="sm" variant="outline" data-testid={`button-view-agreement-mobile-${fa.id}`}>
                                      <FileText className="h-4 w-4 mr-1" />
                                      View Agreement
                                    </Button>
                                  </a>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
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
                              <TableHead>Agreement</TableHead>
                              <TableHead>Documents</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fosterAnimals.map((fa) => (
                              <TableRow key={fa.id} data-testid={`row-foster-${fa.id}`}>
                                <TableCell className="font-medium">
                                  {isAdminOrStaff && fa.animal ? (
                                    <button
                                      className="text-left underline decoration-dotted underline-offset-4 hover-elevate cursor-pointer"
                                      onClick={() => setAnimalHistoryDialog({ animalId: fa.animal!.id, animalName: fa.animal!.name })}
                                      data-testid={`link-animal-history-${fa.animal.id}`}
                                    >
                                      {fa.animal.name}
                                    </button>
                                  ) : (
                                    fa.animal?.name || 'Unknown'
                                  )}
                                </TableCell>
                                <TableCell>{fa.animal?.species} • {fa.animal?.breed}</TableCell>
                                <TableCell>
                                  {isAdminOrStaff && fa.foster ? (
                                    <button
                                      className="text-left underline decoration-dotted underline-offset-4 hover-elevate cursor-pointer"
                                      onClick={() => setFosterHistoryDialog({ fosterId: fa.foster!.id, fosterName: fa.foster!.fullName })}
                                      data-testid={`link-foster-history-${fa.foster.id}`}
                                    >
                                      {fa.foster.fullName}
                                    </button>
                                  ) : (
                                    fa.foster?.fullName || 'Unknown'
                                  )}
                                </TableCell>
                                <TableCell>{formatDate(fa.startDate)}</TableCell>
                                <TableCell>{formatDate(fa.expectedReturnDate)}</TableCell>
                                <TableCell>
                                  {isAdminOrStaff && fa.status === 'active' ? (
                                    <Select
                                      value={fa.status}
                                      disabled={updateFosterAnimalStatusMutation.isPending}
                                      onValueChange={(value: 'active' | 'completed' | 'returned') => {
                                        if (value !== 'active') {
                                          updateFosterAnimalStatusMutation.mutate({ id: fa.id, status: value });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-[130px]" data-testid={`select-foster-status-${fa.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="returned">Returned</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant={fa.status === 'active' ? 'default' : 'secondary'}>
                                      {fa.status}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {fa.placementAgreementStatus === 'signed' ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800" data-testid={`badge-agreement-signed-${fa.id}`}>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Signed
                                    </Badge>
                                  ) : fa.placementAgreementStatus === 'pending' ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800" data-testid={`badge-agreement-pending-${fa.id}`}>
                                      <FileSignature className="h-3 w-3 mr-1" />
                                      Pending
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {fa.foster && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setDocumentsModal({
                                          isOpen: true,
                                          personType: "foster",
                                          personId: fa.foster!.id,
                                          personName: fa.foster!.fullName,
                                        })}
                                        data-testid={`button-documents-foster-${fa.foster.id}`}
                                      >
                                        <Files className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {fa.placementAgreementStatus === 'signed' && fa.contractPdfUrl && (
                                      <a href={fa.contractPdfUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-agreement-${fa.id}`}>
                                        <Button variant="ghost" size="icon" data-testid={`button-view-agreement-${fa.id}`}>
                                          <FileText className="h-4 w-4" />
                                        </Button>
                                      </a>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    )}
                  </>
                ) : null}
              </TabsContent>

              <TabsContent value="supply-requests">
                {supplyRequestsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : activeSupplyRequests.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Supply Requests</h3>
                    <p className="text-muted-foreground">
                      Supply requests from foster parents will appear here.
                    </p>
                  </Card>
                ) : isMobile ? (
                  <div className="space-y-3">
                    {activeSupplyRequests.map((request) => (
                      <Card key={request.id} data-testid={`card-supply-request-${request.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{request.item}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {request.foster?.fullName || 'Unknown'} • {request.animal?.name || 'No animal'}
                              </p>
                            </div>
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
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Category:</span>
                              <p className="capitalize">{request.category}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Quantity:</span>
                              <p>{request.quantity}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Requested:</span>
                              <p>{formatDate(request.createdAt)}</p>
                            </div>
                          </div>
                          {request.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => updateSupplyRequestMutation.mutate({ id: request.id, status: 'fulfilled' })}
                              disabled={updateSupplyRequestMutation.isPending}
                              data-testid={`button-fulfill-${request.id}`}
                              className="w-full"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Mark Fulfilled
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
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
                        {activeSupplyRequests.map((request) => (
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
                ) : activeFosterUpdates.length === 0 ? (
                  <Card className="p-12 text-center">
                    <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No Foster Updates</h3>
                    <p className="text-muted-foreground">
                      Updates from foster parents will appear here.
                    </p>
                  </Card>
                ) : isMobile ? (
                  <div className="space-y-3">
                    {activeFosterUpdates.map((update) => (
                      <Card key={update.id} data-testid={`card-foster-update-${update.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{update.animal?.name || 'Unknown'}</CardTitle>
                              <p className="text-sm text-muted-foreground">{update.foster?.fullName || 'Unknown'}</p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              {update.updateType === 'medical_concern' && (
                                <Badge variant="destructive">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Medical
                                </Badge>
                              )}
                              {update.updateType === 'behavioral_note' && (
                                <Badge variant="secondary">Behavioral</Badge>
                              )}
                              {update.updateType === 'general_update' && (
                                <Badge variant="outline">General</Badge>
                              )}
                              {update.updateType === 'photo_update' && (
                                <Badge variant="outline">Photo</Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge 
                              variant={
                                update.priority === 'urgent' || update.priority === 'high' ? 'destructive' :
                                update.priority === 'normal' ? 'secondary' : 'outline'
                              }
                            >
                              {update.priority}
                            </Badge>
                            <Badge 
                              variant={
                                update.status === 'resolved' ? 'default' :
                                update.status === 'acknowledged' ? 'secondary' : 'outline'
                              }
                            >
                              {update.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {update.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground self-center ml-auto">
                              {formatDate(update.createdAt)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedUpdate(update)}
                              data-testid={`button-view-update-${update.id}`}
                            >
                              View Details
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
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
                        {activeFosterUpdates.map((update) => (
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
                ) : isMobile ? (
                  <div className="space-y-3">
                    {archivedSupplyRequests.map((request) => (
                      <Card key={request.id} data-testid={`card-supply-request-archived-${request.id}`} className="opacity-80">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{request.item}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {request.foster?.fullName || 'Unknown'} • {request.animal?.name || 'No animal'}
                              </p>
                            </div>
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
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <div>
                              <span>Category:</span>
                              <p className="capitalize">{request.category}</p>
                            </div>
                            <div>
                              <span>Qty:</span>
                              <p>{request.quantity}</p>
                            </div>
                            <div>
                              <span>Requested:</span>
                              <p>{formatDate(request.createdAt)}</p>
                            </div>
                            <div>
                              <span>Archived:</span>
                              <p>{formatDate(request.archivedAt)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
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
                ) : isMobile ? (
                  <div className="space-y-3">
                    {archivedFosterUpdates.map((update) => (
                      <Card key={update.id} data-testid={`card-foster-update-archived-${update.id}`} className="opacity-80">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{update.animal?.name || 'Unknown'}</CardTitle>
                              <p className="text-sm text-muted-foreground">{update.foster?.fullName || 'Unknown'}</p>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              {update.updateType === 'medical_concern' && (
                                <Badge variant="destructive">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Medical
                                </Badge>
                              )}
                              {update.updateType === 'behavioral_note' && (
                                <Badge variant="secondary">Behavioral</Badge>
                              )}
                              {update.updateType === 'general_update' && (
                                <Badge variant="outline">General</Badge>
                              )}
                              {update.updateType === 'photo_update' && (
                                <Badge variant="outline">Photo</Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          <div className="flex flex-wrap gap-2 text-muted-foreground">
                            <Badge 
                              variant={
                                update.priority === 'urgent' ? 'destructive' :
                                update.priority === 'high' ? 'secondary' : 'outline'
                              }
                            >
                              {update.priority}
                            </Badge>
                            <Badge variant="default">
                              {update.status === 'resolved' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {update.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                            <div>
                              <span>Submitted:</span>
                              <p>{formatDate(update.createdAt)}</p>
                            </div>
                            <div>
                              <span>Archived:</span>
                              <p>{formatDate(update.archivedAt)}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedUpdate(update)}
                            data-testid={`button-view-archived-update-${update.id}`}
                            className="w-full"
                          >
                            View Details
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
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

      {documentsModal && (
        <PersonDocumentsModal
          isOpen={documentsModal.isOpen}
          onClose={() => setDocumentsModal(null)}
          personType={documentsModal.personType}
          personId={documentsModal.personId}
          personName={documentsModal.personName}
        />
      )}

      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        setAssignDialogOpen(open);
        if (!open) {
          setSelectedAnimalId("");
          setSelectedFosterId("");
          setAssignNotes("");
          setAssignCarePriorities({ enabled: false, flags: {} });
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Animal to Foster</DialogTitle>
            <DialogDescription>
              Select an animal and an active pool foster. A placement agreement will be emailed to the foster for signing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="animal-select">Animal</Label>
              <Select value={selectedAnimalId} onValueChange={setSelectedAnimalId} disabled={!availableAnimalsData}>
                <SelectTrigger id="animal-select" data-testid="select-animal">
                  <SelectValue placeholder={!availableAnimalsData ? "Loading animals..." : "Select an animal"} />
                </SelectTrigger>
                <SelectContent>
                  {!availableAnimalsData ? (
                    <div className="flex items-center justify-center p-2 gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (availableAnimalsData.animals || []).length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center" data-testid="text-no-animals">No available animals</div>
                  ) : (
                    (availableAnimalsData.animals || []).map((a) => (
                      <SelectItem key={a.id} value={a.id} data-testid={`option-animal-${a.id}`}>
                        {a.name} ({a.species}{a.breed ? ` - ${a.breed}` : ''})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="foster-select">Foster Parent (Active Pool)</Label>
              <Select value={selectedFosterId} onValueChange={setSelectedFosterId} disabled={!activeFostersData}>
                <SelectTrigger id="foster-select" data-testid="select-foster">
                  <SelectValue placeholder={!activeFostersData ? "Loading fosters..." : "Select a foster"} />
                </SelectTrigger>
                <SelectContent>
                  {!activeFostersData ? (
                    <div className="flex items-center justify-center p-2 gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : (activeFostersData.fosters || []).length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center" data-testid="text-no-fosters">No active pool fosters</div>
                  ) : (
                    (activeFostersData.fosters || []).map((f) => (
                      <SelectItem key={f.id} value={f.id} data-testid={`option-foster-${f.id}`}>
                        {f.fullName} ({f.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedAnimalId && (
              <CarePrioritiesInput
                animalName={
                  (availableAnimalsData?.animals || []).find(a => a.id === selectedAnimalId)?.name || "this animal"
                }
                mode="foster"
                value={assignCarePriorities}
                onChange={setAssignCarePriorities}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="assign-notes">Additional Comments</Label>
              <Textarea
                id="assign-notes"
                placeholder="Any additional notes or instructions for the foster parent..."
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                rows={3}
                data-testid="textarea-assign-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assign">
              Cancel
            </Button>
            <Button
              onClick={() => assignAnimalMutation.mutate({
                animalId: selectedAnimalId,
                fosterId: selectedFosterId,
                notes: assignNotes || undefined,
                carePriorities: assignCarePriorities.enabled ? assignCarePriorities : undefined,
              })}
              disabled={!selectedAnimalId || !selectedFosterId || assignAnimalMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignAnimalMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Assign & Send Agreement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnimalFosterHistoryDialog
        animalId={animalHistoryDialog?.animalId || ''}
        animalName={animalHistoryDialog?.animalName || ''}
        open={!!animalHistoryDialog}
        onOpenChange={(open) => !open && setAnimalHistoryDialog(null)}
      />

      <FosterAnimalsHistoryDialog
        fosterId={fosterHistoryDialog?.fosterId || ''}
        fosterName={fosterHistoryDialog?.fosterName || ''}
        open={!!fosterHistoryDialog}
        onOpenChange={(open) => !open && setFosterHistoryDialog(null)}
      />
    </DashboardLayout>
  );
}

interface FosterHistoryRecord {
  id: string;
  fosterId?: string;
  fosterName?: string | null;
  fosterEmail?: string | null;
  animalId?: string;
  animalName?: string | null;
  animalSpecies?: string | null;
  animalBreed?: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  placementAgreementStatus: string | null;
  notes: string | null;
  createdAt: string;
  contractPdfUrl?: string | null;
}

function AnimalFosterHistoryDialog({
  animalId,
  animalName,
  open,
  onOpenChange,
}: {
  animalId: string;
  animalName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<{ animal: { id: string; name: string }; history: FosterHistoryRecord[] }>({
    queryKey: ['/api/foster-animals', animalId, 'history'],
    enabled: open && !!animalId,
  });

  const history = data?.history || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Foster History: {animalName}
          </DialogTitle>
          <DialogDescription>
            All current and past foster placements for this animal
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-3 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No foster history found</p>
          ) : (
            history.map((record) => (
              <div key={record.id} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`history-record-${record.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{record.fosterName || 'Unknown Foster'}</p>
                  {record.fosterEmail && (
                    <p className="text-xs text-muted-foreground">{record.fosterEmail}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant={record.status === 'active' ? 'default' : 'secondary'}>
                      {record.status}
                    </Badge>
                    {record.placementAgreementStatus === 'signed' && record.contractPdfUrl && (
                      <a href={record.contractPdfUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-agreement-animal-history-${record.id}`}>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800 hover-elevate cursor-pointer">
                          <FileText className="h-3 w-3 mr-1" />
                          View Agreement
                        </Badge>
                      </a>
                    )}
                    {record.placementAgreementStatus === 'signed' && !record.contractPdfUrl && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Agreement
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {record.startDate ? format(new Date(record.startDate), 'MMM d, yyyy') : 'Unknown start'}
                    {record.endDate ? ` — ${format(new Date(record.endDate), 'MMM d, yyyy')}` : record.status === 'active' ? ' — Present' : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FosterAnimalsHistoryDialog({
  fosterId,
  fosterName,
  open,
  onOpenChange,
}: {
  fosterId: string;
  fosterName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<{ foster: { id: string; fullName: string; email: string }; history: FosterHistoryRecord[] }>({
    queryKey: ['/api/fosters', fosterId, 'history'],
    enabled: open && !!fosterId,
  });

  const history = data?.history || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Animals Fostered by {fosterName}
          </DialogTitle>
          <DialogDescription>
            All current and past animals fostered by this person
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-3 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No foster history found</p>
          ) : (
            history.map((record) => (
              <div key={record.id} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`foster-history-record-${record.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{record.animalName || 'Unknown Animal'}</p>
                  <p className="text-xs text-muted-foreground">
                    {record.animalSpecies}{record.animalBreed ? ` • ${record.animalBreed}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant={record.status === 'active' ? 'default' : 'secondary'}>
                      {record.status}
                    </Badge>
                    {record.placementAgreementStatus === 'signed' && record.contractPdfUrl && (
                      <a href={record.contractPdfUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-view-agreement-foster-history-${record.id}`}>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800 hover-elevate cursor-pointer">
                          <FileText className="h-3 w-3 mr-1" />
                          View Agreement
                        </Badge>
                      </a>
                    )}
                    {record.placementAgreementStatus === 'signed' && !record.contractPdfUrl && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Agreement
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {record.startDate ? format(new Date(record.startDate), 'MMM d, yyyy') : 'Unknown start'}
                    {record.endDate ? ` — ${format(new Date(record.endDate), 'MMM d, yyyy')}` : record.status === 'active' ? ' — Present' : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
