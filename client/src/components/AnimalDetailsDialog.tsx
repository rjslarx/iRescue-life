import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, User, Package, FileText, Search, Send, Check, Home, Baby, Cat, Mail, Phone } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import type { Animal } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FosterHistoryItem {
  id: string;
  animalId: string;
  fosterId: string;
  fosterName: string | null;
  fosterEmail: string | null;
  startDate: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  status: "active" | "completed" | "returned";
  notes: string | null;
  createdAt: string;
}

interface SupplyRequestItem {
  id: string;
  fosterId: string;
  fosterName: string | null;
  animalId: string | null;
  category: "food" | "medication" | "supplies" | "other";
  item: string;
  quantity: string;
  notes: string | null;
  status: "pending" | "approved" | "fulfilled" | "denied";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FosterUpdateItem {
  id: string;
  fosterId: string;
  fosterName: string | null;
  animalId: string;
  updateType: "medical_concern" | "behavioral_note" | "general_update" | "photo_update";
  description: string;
  photoUrls: string[] | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "acknowledged" | "resolved";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FosterMatch {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  fosterStatus: string | null;
  hasCats: boolean | null;
  hasKids: boolean | null;
  hasFencedYard: boolean | null;
  sizePreference: string | null;
  badges: string[];
  matchScore: number;
}

interface AnimalDetailsDialogProps {
  animal: Animal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnimalDetailsDialog({ animal, open, onOpenChange }: AnimalDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState("find-fosters");
  const [sendingFosterId, setSendingFosterId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: fosterHistoryData, isLoading: isLoadingHistory } = useQuery<{ fosterHistory: FosterHistoryItem[] }>({
    queryKey: ['/api/animals', animal.id, 'foster-history'],
    enabled: open,
  });

  const { data: supplyRequestsData, isLoading: isLoadingRequests } = useQuery<{ supplyRequests: SupplyRequestItem[] }>({
    queryKey: ['/api/animals', animal.id, 'supply-requests'],
    enabled: open,
  });

  const { data: fosterUpdatesData, isLoading: isLoadingUpdates } = useQuery<{ fosterUpdates: FosterUpdateItem[] }>({
    queryKey: ['/api/animals', animal.id, 'foster-updates'],
    enabled: open,
  });

  const { data: fosterMatchesData, isLoading: isLoadingMatches } = useQuery<{ 
    matches: FosterMatch[]; 
    totalFosters: number; 
    matchingFosters: number; 
  }>({
    queryKey: ['/api/animals', animal.id, 'foster-matches'],
    enabled: open && activeTab === 'find-fosters',
  });

  const sendFosterRequestMutation = useMutation({
    mutationFn: async (fosterId: string) => {
      const res = await apiRequest('POST', '/api/foster-animals', {
        animalId: animal.id,
        fosterId,
      });
      return res.json();
    },
    onMutate: (fosterId: string) => {
      setSendingFosterId(fosterId);
    },
    onSettled: () => {
      setSendingFosterId(null);
    },
    onSuccess: (data, fosterId) => {
      const foster = fosterMatches.find(f => f.id === fosterId);
      toast({
        title: "Placement agreement sent",
        description: `A placement agreement has been sent to ${foster?.fullName || 'the foster parent'} for signing.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/foster-animals/pending-placements'] });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to send placement agreement. Please try again.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const fosterHistory = fosterHistoryData?.fosterHistory || [];
  const supplyRequests = supplyRequestsData?.supplyRequests || [];
  const fosterUpdates = fosterUpdatesData?.fosterUpdates || [];
  const fosterMatches = fosterMatchesData?.matches || [];

  const calculateDaysInFoster = (startDate: string, endDate: string | null): number => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    return differenceInDays(end, start);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "completed":
      case "fulfilled":
      case "resolved":
        return "bg-blue-500";
      case "pending":
        return "bg-yellow-500";
      case "denied":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "normal":
        return "bg-blue-500";
      case "low":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-animal-details">
            {animal.name} - Foster Management
          </DialogTitle>
          <DialogDescription>
            Find foster homes, view placements, supply requests, and updates
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
            <TabsTrigger value="find-fosters" className="text-xs sm:text-sm px-2 sm:px-3 py-2 gap-1" data-testid="tab-find-fosters">
              <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden sm:inline">Find Fosters</span>
              <span className="sm:hidden">Find</span>
            </TabsTrigger>
            <TabsTrigger value="foster-history" className="text-xs sm:text-sm px-2 sm:px-3 py-2 gap-1" data-testid="tab-foster-history">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>History</span>
            </TabsTrigger>
            <TabsTrigger value="supply-requests" className="text-xs sm:text-sm px-2 sm:px-3 py-2 gap-1" data-testid="tab-supply-requests">
              <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>Supplies</span>
            </TabsTrigger>
            <TabsTrigger value="foster-updates" className="text-xs sm:text-sm px-2 sm:px-3 py-2 gap-1" data-testid="tab-foster-updates">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>Updates</span>
            </TabsTrigger>
          </TabsList>

          {/* Find Fosters Tab */}
          <TabsContent value="find-fosters" className="space-y-4">
            {isLoadingMatches ? (
              <div className="flex justify-center py-8" data-testid="loading-foster-matches">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <span data-testid="text-match-summary">
                    Found <strong>{fosterMatchesData?.matchingFosters || 0}</strong> matching fosters 
                    out of <strong>{fosterMatchesData?.totalFosters || 0}</strong> total
                  </span>
                </div>
                
                {fosterMatches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="no-foster-matches">
                    No matching fosters found. Consider adjusting the animal's compatibility settings or reaching out to fosters directly.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fosterMatches.map((foster) => (
                      <Card key={foster.id} data-testid={`card-foster-match-${foster.id}`}>
                        <CardHeader>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4 shrink-0" />
                                <span className="truncate">{foster.fullName}</span>
                              </CardTitle>
                              <CardDescription className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                                <span className="flex items-center gap-1 truncate" data-testid={`text-email-${foster.id}`}>
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{foster.email}</span>
                                </span>
                                {foster.phone && (
                                  <span className="flex items-center gap-1" data-testid={`text-phone-${foster.id}`}>
                                    <Phone className="h-3 w-3 shrink-0" />
                                    {foster.phone}
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="font-bold" data-testid={`badge-score-${foster.id}`}>
                                {foster.matchScore} pts
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => sendFosterRequestMutation.mutate(foster.id)}
                                disabled={sendFosterRequestMutation.isPending || !!animal.pendingFosterUserId || animal.locationType === 'foster'}
                                data-testid={`button-send-request-${foster.id}`}
                              >
                                {sendingFosterId === foster.id && sendFosterRequestMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : animal.pendingFosterUserId ? (
                                  <>
                                    <FileText className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">Agreement Pending</span>
                                    <span className="sm:hidden">Pending</span>
                                  </>
                                ) : animal.locationType === 'foster' ? (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    In Foster
                                  </>
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">Send Agreement</span>
                                    <span className="sm:hidden">Send</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {foster.badges.map((badge, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="flex items-center gap-1"
                                data-testid={`badge-match-${foster.id}-${idx}`}
                              >
                                <Check className="h-3 w-3 text-green-500" />
                                {badge}
                              </Badge>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1" data-testid={`status-cats-${foster.id}`}>
                              <Cat className="h-3 w-3" />
                              {foster.hasCats === true ? 'Has cats' : foster.hasCats === false ? 'No cats' : 'Unknown'}
                            </div>
                            <div className="flex items-center gap-1" data-testid={`status-kids-${foster.id}`}>
                              <Baby className="h-3 w-3" />
                              {foster.hasKids === true ? 'Has kids' : foster.hasKids === false ? 'No kids' : 'Unknown'}
                            </div>
                            <div className="flex items-center gap-1" data-testid={`status-fence-${foster.id}`}>
                              <Home className="h-3 w-3" />
                              {foster.hasFencedYard === true ? 'Has fence' : foster.hasFencedYard === false ? 'No fence' : 'Unknown'}
                            </div>
                            <div data-testid={`status-size-${foster.id}`}>
                              Size: {foster.sizePreference || 'Any'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Foster History Tab */}
          <TabsContent value="foster-history" className="space-y-4">
            {isLoadingHistory ? (
              <div className="flex justify-center py-8" data-testid="loading-foster-history">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : fosterHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="no-foster-history">
                No foster history for this animal
              </div>
            ) : (
              <div className="space-y-3">
                {fosterHistory.map((placement) => (
                  <Card key={placement.id} data-testid={`card-foster-placement-${placement.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {placement.fosterName || 'Unknown Foster'}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {placement.fosterEmail}
                          </CardDescription>
                        </div>
                        <Badge className={`${getStatusColor(placement.status)} shrink-0`}>
                          {placement.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-medium text-xs text-muted-foreground">Start Date</p>
                          <p data-testid={`text-start-date-${placement.id}`}>
                            {format(new Date(placement.startDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        {placement.actualReturnDate && (
                          <div>
                            <p className="font-medium text-xs text-muted-foreground">Return Date</p>
                            <p data-testid={`text-return-date-${placement.id}`}>
                              {format(new Date(placement.actualReturnDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-xs text-muted-foreground">Days in Foster</p>
                          <p className="font-semibold" data-testid={`text-days-fostered-${placement.id}`}>
                            {calculateDaysInFoster(placement.startDate, placement.actualReturnDate)} days
                          </p>
                        </div>
                      </div>
                      {placement.notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-notes-${placement.id}`}>
                            {placement.notes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Supply Requests Tab */}
          <TabsContent value="supply-requests" className="space-y-4">
            {isLoadingRequests ? (
              <div className="flex justify-center py-8" data-testid="loading-supply-requests">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : supplyRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="no-supply-requests">
                No supply requests for this animal
              </div>
            ) : (
              <div className="space-y-3">
                {supplyRequests.map((request) => (
                  <Card key={request.id} data-testid={`card-supply-request-${request.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-base">{request.item}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Requested by {request.fosterName || 'Unknown Foster'} • {format(new Date(request.createdAt), 'MMM d, yyyy')}
                          </CardDescription>
                        </div>
                        <Badge className={`${getStatusColor(request.status)} shrink-0`}>
                          {request.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-medium text-xs text-muted-foreground">Category</p>
                          <p className="capitalize" data-testid={`text-category-${request.id}`}>
                            {request.category}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-xs text-muted-foreground">Quantity</p>
                          <p data-testid={`text-quantity-${request.id}`}>{request.quantity}</p>
                        </div>
                      </div>
                      {request.notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-notes-${request.id}`}>
                            {request.notes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Foster Updates Tab */}
          <TabsContent value="foster-updates" className="space-y-4">
            {isLoadingUpdates ? (
              <div className="flex justify-center py-8" data-testid="loading-foster-updates">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : fosterUpdates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="no-foster-updates">
                No foster updates for this animal
              </div>
            ) : (
              <div className="space-y-3">
                {fosterUpdates.map((update) => (
                  <Card key={update.id} data-testid={`card-foster-update-${update.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base capitalize">
                              {update.updateType.replace('_', ' ')}
                            </CardTitle>
                            <Badge className={`${getPriorityColor(update.priority)} shrink-0 text-xs`}>
                              {update.priority}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs mt-1">
                            By {update.fosterName || 'Unknown Foster'} • {format(new Date(update.createdAt), 'MMM d, yyyy h:mm a')}
                          </CardDescription>
                        </div>
                        <Badge className={`${getStatusColor(update.status)} shrink-0`}>
                          {update.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm" data-testid={`text-description-${update.id}`}>
                        {update.description}
                      </p>
                      {update.photoUrls && update.photoUrls.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {update.photoUrls.map((photoUrl, index) => (
                            <img
                              key={index}
                              src={photoUrl}
                              alt={`Update photo ${index + 1}`}
                              className="w-full h-32 object-cover rounded-md"
                              data-testid={`img-update-photo-${update.id}-${index}`}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
