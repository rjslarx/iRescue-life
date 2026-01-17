import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, User, Package, FileText, Search, Send, Check, Home, Baby, Cat, Mail, Phone, Heart, Copy, ExternalLink, DollarSign, PawPrint } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, differenceInDays } from "date-fns";
import type { Animal, DonationLink } from "@shared/schema";
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
      await apiRequest('POST', `/api/animals/${animal.id}/foster-request`, { fosterId });
    },
    onSuccess: (_, fosterId) => {
      const foster = fosterMatches.find(f => f.id === fosterId);
      toast({
        title: "Foster request sent",
        description: `An email has been sent to ${foster?.fullName || 'the foster parent'}.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send foster request. Please try again.",
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

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "active":
        return "default";
      case "completed":
      case "fulfilled":
      case "resolved":
        return "secondary";
      case "pending":
        return "outline";
      case "denied":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getPriorityVariant = (priority: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (priority) {
      case "urgent":
        return "destructive";
      case "high":
        return "default";
      case "normal":
        return "secondary";
      case "low":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-animal-details">
            {animal.name} - Foster Management
          </DialogTitle>
          <DialogDescription>
            Find foster homes, view placements, supply requests, and updates
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="find-fosters" data-testid="tab-find-fosters">
              <Search className="h-4 w-4 mr-2" />
              Find Fosters
            </TabsTrigger>
            <TabsTrigger value="foster-history" data-testid="tab-foster-history">
              <Calendar className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="supply-requests" data-testid="tab-supply-requests">
              <Package className="h-4 w-4 mr-2" />
              Supplies
            </TabsTrigger>
            <TabsTrigger value="foster-updates" data-testid="tab-foster-updates">
              <FileText className="h-4 w-4 mr-2" />
              Updates
            </TabsTrigger>
            <TabsTrigger value="sponsor" data-testid="tab-sponsor">
              <Heart className="h-4 w-4 mr-2" />
              Sponsor
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
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
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
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div className="flex-1">
                              <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4" />
                                {foster.fullName}
                              </CardTitle>
                              <CardDescription className="flex items-center gap-4 mt-1">
                                <span className="flex items-center gap-1" data-testid={`text-email-${foster.id}`}>
                                  <Mail className="h-3 w-3" />
                                  {foster.email}
                                </span>
                                {foster.phone && (
                                  <span className="flex items-center gap-1" data-testid={`text-phone-${foster.id}`}>
                                    <Phone className="h-3 w-3" />
                                    {foster.phone}
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-bold" data-testid={`badge-score-${foster.id}`}>
                                {foster.matchScore} pts
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => sendFosterRequestMutation.mutate(foster.id)}
                                disabled={sendFosterRequestMutation.isPending}
                                data-testid={`button-send-request-${foster.id}`}
                              >
                                {sendFosterRequestMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    Send Request
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
                                <Check className="h-3 w-3" />
                                {badge}
                              </Badge>
                            ))}
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-3 text-xs text-muted-foreground">
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
                        <Badge variant={getStatusVariant(placement.status)} className="shrink-0">
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
                        <Badge variant={getStatusVariant(request.status)} className="shrink-0">
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
                            <Badge variant={getPriorityVariant(update.priority)} className="shrink-0 text-xs">
                              {update.priority}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs mt-1">
                            By {update.fosterName || 'Unknown Foster'} • {format(new Date(update.createdAt), 'MMM d, yyyy h:mm a')}
                          </CardDescription>
                        </div>
                        <Badge variant={getStatusVariant(update.status)} className="shrink-0">
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

          {/* Sponsor Tab */}
          <TabsContent value="sponsor" className="space-y-4">
            <SponsorPetPanel animal={animal} />
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Sponsor Pet Panel Component
function SponsorPetPanel({ animal }: { animal: Animal }) {
  const { toast } = useToast();
  const [sponsorAmount, setSponsorAmount] = useState(2500);
  const [sponsorLink, setSponsorLink] = useState<DonationLink | null>(null);
  
  const createSponsorLinkMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest('POST', `/api/animals/${animal.id}/sponsor-link`, { 
        amount,
        interval: 'month' 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSponsorLink(data.donationLink);
      if (data.existing) {
        toast({ 
          title: "Existing sponsor link found", 
          description: "Using the existing sponsor link for this animal." 
        });
      } else {
        toast({ title: "Sponsor link created!", description: "You can now share this link." });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/donation-links'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create sponsor link",
        description: error.message || "Please check Stripe Connect configuration.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-destructive" />
            Sponsor {animal.name}
          </CardTitle>
          <CardDescription>
            Create a shareable link for donors to become {animal.name}'s monthly godparent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center" data-testid="container-sponsor-pet-image">
            <Avatar className="w-32 h-32 rounded-lg">
              <AvatarImage 
                src={animal.photoUrls?.[0]} 
                alt={animal.name}
                className="object-cover"
              />
              <AvatarFallback className="rounded-lg">
                <PawPrint className="h-12 w-12 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sponsor-amount">Monthly Sponsorship Amount</Label>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                id="sponsor-amount"
                type="number"
                min="5"
                step="5"
                value={sponsorAmount / 100}
                onChange={(e) => setSponsorAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="w-32"
                data-testid="input-sponsor-amount"
              />
              <span className="text-sm text-muted-foreground">per month</span>
            </div>
          </div>

          {!sponsorLink ? (
            <Button 
              onClick={() => createSponsorLinkMutation.mutate(sponsorAmount)}
              disabled={createSponsorLinkMutation.isPending || sponsorAmount < 500}
              className="w-full"
              data-testid="button-generate-sponsor-link"
            >
              {createSponsorLinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Link...
                </>
              ) : (
                <>
                  <Heart className="h-4 w-4 mr-2" />
                  Generate Sponsor Link
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3 p-4 bg-muted rounded-lg" data-testid="container-sponsor-link-result">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium" data-testid="text-sponsor-link-status">Sponsor Link Ready!</span>
                <Badge variant="secondary" data-testid="badge-sponsor-amount">${(sponsorLink.amount / 100).toFixed(2)}/month</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input 
                  value={sponsorLink.stripePaymentLinkUrl} 
                  readOnly 
                  className="flex-1 text-xs"
                  data-testid="input-sponsor-link-url"
                />
                <Button 
                  size="icon" 
                  variant="outline"
                  onClick={() => copyToClipboard(sponsorLink.stripePaymentLinkUrl)}
                  data-testid="button-copy-sponsor-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="outline"
                  asChild
                  data-testid="button-open-sponsor-link"
                >
                  <a href={sponsorLink.stripePaymentLinkUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link on Facebook: "Become {animal.name}'s Monthly Godparent for just ${(sponsorLink.amount / 100).toFixed(0)}!"
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
