import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Check,
  X,
  Clock,
  Eye,
  Send,
  Ban,
  Syringe,
  Shield,
  FileText,
  Cpu,
  PawPrint,
} from "lucide-react";
import { format } from "date-fns";

interface TransferRecord {
  transfer: {
    id: string;
    sendingTenantId: string;
    receivingTenantId: string;
    animalId: string;
    status: string;
    notes: string | null;
    responseNotes: string | null;
    requestedBy: string;
    respondedBy: string | null;
    respondedAt: string | null;
    clonedAnimalId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  animal: {
    id: string;
    name: string;
    species: string;
    breed: string;
    age: string | null;
    sex: string | null;
    status: string;
    photoUrls: string[] | null;
    weight: string | null;
    microchipNumber: string | null;
    neuterStatus: string | null;
    medicalStatus: string | null;
    heartwormPositive: boolean;
    biteHistory: boolean;
    specialDiet: boolean;
    needsSpayNeuter: boolean;
    isFlightRisk: boolean;
    catFriendly: boolean;
    dogFriendly: boolean;
    childFriendly: boolean;
    behaviorColor: string | null;
    bio: string | null;
    intakeDate: string | null;
  };
  sendingTenant: { id: string; name: string };
  receivingTenant: { id: string; name: string };
  requestedByUser: { id: string; name: string };
}

interface PreviewData {
  animal: any;
  vaccines: any[];
  preventativeCare: any[];
  microchips: any[];
  medicalFiles: any[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "accepted":
      return <Badge variant="default" className="bg-green-600 border-green-600" data-testid={`badge-status-${status}`}><Check className="w-3 h-3 mr-1" />Accepted</Badge>;
    case "rejected":
      return <Badge variant="destructive" data-testid={`badge-status-${status}`}><X className="w-3 h-3 mr-1" />Rejected</Badge>;
    case "cancelled":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Ban className="w-3 h-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
}

export default function TransfersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [direction, setDirection] = useState<"all" | "incoming" | "outgoing">("all");
  const [previewTransferId, setPreviewTransferId] = useState<string | null>(null);
  const [respondDialogOpen, setRespondDialogOpen] = useState(false);
  const [respondAction, setRespondAction] = useState<"accept" | "reject">("accept");
  const [respondTransferId, setRespondTransferId] = useState<string | null>(null);
  const [responseNotes, setResponseNotes] = useState("");

  const queryParam = direction === "all" ? "" : `?direction=${direction}`;
  const { data, isLoading } = useQuery<{ transfers: TransferRecord[] }>({
    queryKey: ["/api/transfers", direction],
    queryFn: async () => {
      const res = await fetch(`/api/transfers${queryParam}`);
      if (!res.ok) throw new Error("Failed to load transfers");
      return res.json();
    },
  });

  const { data: previewData, isLoading: previewLoading } = useQuery<PreviewData>({
    queryKey: ["/api/transfers", previewTransferId, "preview"],
    queryFn: async () => {
      const res = await fetch(`/api/transfers/${previewTransferId}/preview`);
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: !!previewTransferId,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ id, responseNotes }: { id: string; responseNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/transfers/${id}/accept`, { responseNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Transfer Accepted", description: "The animal has been added to your organization." });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
      setRespondDialogOpen(false);
      setResponseNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to accept transfer", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, responseNotes }: { id: string; responseNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/transfers/${id}/reject`, { responseNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Transfer Rejected", description: "The transfer has been declined." });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      setRespondDialogOpen(false);
      setResponseNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reject transfer", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/transfers/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Transfer Cancelled", description: "The transfer request has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to cancel transfer", variant: "destructive" });
    },
  });

  const transfers = data?.transfers || [];
  const currentTenantId = user?.tenantId;

  const pendingIncoming = transfers.filter(
    t => t.transfer.status === "pending" && t.transfer.receivingTenantId === currentTenantId
  );

  const openRespondDialog = (transferId: string, action: "accept" | "reject") => {
    setRespondTransferId(transferId);
    setRespondAction(action);
    setResponseNotes("");
    setRespondDialogOpen(true);
  };

  const handleRespond = () => {
    if (!respondTransferId) return;
    const payload = { id: respondTransferId, responseNotes: responseNotes.trim() || undefined };
    if (respondAction === "accept") {
      acceptMutation.mutate(payload);
    } else {
      rejectMutation.mutate(payload);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="title-transfers-page">Network Transfers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage animal transfers between iRescue network organizations
            </p>
          </div>

          {pendingIncoming.length > 0 && (
            <Badge variant="destructive" className="text-sm" data-testid="badge-pending-count">
              {pendingIncoming.length} pending incoming
            </Badge>
          )}
        </div>

        <Tabs value={direction} onValueChange={(v) => setDirection(v as any)}>
          <TabsList data-testid="tabs-transfer-direction">
            <TabsTrigger value="all" data-testid="tab-all">
              <ArrowRightLeft className="w-4 h-4 mr-1" /> All
            </TabsTrigger>
            <TabsTrigger value="incoming" data-testid="tab-incoming">
              <ArrowDownLeft className="w-4 h-4 mr-1" /> Incoming
            </TabsTrigger>
            <TabsTrigger value="outgoing" data-testid="tab-outgoing">
              <ArrowUpRight className="w-4 h-4 mr-1" /> Outgoing
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : transfers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ArrowRightLeft className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium" data-testid="text-no-transfers">No transfers found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Transfer animals from the Animals page using the card menu.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {transfers.map((record) => {
              const isIncoming = record.transfer.receivingTenantId === currentTenantId;
              const isPending = record.transfer.status === "pending";
              const isOutgoing = record.transfer.sendingTenantId === currentTenantId;
              const photo = record.animal.photoUrls?.[0];

              return (
                <Card key={record.transfer.id} data-testid={`card-transfer-${record.transfer.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-4 items-start">
                      {photo && (
                        <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                          <img
                            src={photo}
                            alt={record.animal.name}
                            className="w-full h-full object-cover"
                            data-testid={`img-transfer-animal-${record.transfer.id}`}
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-base" data-testid={`text-animal-name-${record.transfer.id}`}>
                            {record.animal.name}
                          </span>
                          {getStatusBadge(record.transfer.status)}
                          <Badge variant="outline" className="text-xs" data-testid={`badge-direction-${record.transfer.id}`}>
                            {isIncoming ? (
                              <><ArrowDownLeft className="w-3 h-3 mr-1" />Incoming</>
                            ) : (
                              <><ArrowUpRight className="w-3 h-3 mr-1" />Outgoing</>
                            )}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground" data-testid={`text-transfer-details-${record.transfer.id}`}>
                          {record.animal.species} {record.animal.breed && `- ${record.animal.breed}`}
                          {record.animal.age && ` - ${record.animal.age}`}
                          {record.animal.sex && ` - ${record.animal.sex}`}
                        </p>

                        <p className="text-sm text-muted-foreground" data-testid={`text-transfer-orgs-${record.transfer.id}`}>
                          {isIncoming ? (
                            <>From: <span className="font-medium text-foreground">{record.sendingTenant.name}</span></>
                          ) : (
                            <>To: <span className="font-medium text-foreground">{record.receivingTenant.name}</span></>
                          )}
                          <span className="mx-2">-</span>
                          Requested by {record.requestedByUser.name}
                        </p>

                        {record.transfer.notes && (
                          <p className="text-sm" data-testid={`text-transfer-notes-${record.transfer.id}`}>
                            <span className="text-muted-foreground">Notes:</span> {record.transfer.notes}
                          </p>
                        )}

                        {record.transfer.responseNotes && (
                          <p className="text-sm" data-testid={`text-response-notes-${record.transfer.id}`}>
                            <span className="text-muted-foreground">Response:</span> {record.transfer.responseNotes}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground" data-testid={`text-transfer-date-${record.transfer.id}`}>
                          {format(new Date(record.transfer.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          {record.transfer.respondedAt && (
                            <> - Responded {format(new Date(record.transfer.respondedAt), "MMM d, yyyy 'at' h:mm a")}</>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isIncoming && isPending && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPreviewTransferId(record.transfer.id)}
                              data-testid={`button-preview-${record.transfer.id}`}
                            >
                              <Eye className="w-4 h-4 mr-1" /> Preview
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openRespondDialog(record.transfer.id, "accept")}
                              data-testid={`button-accept-${record.transfer.id}`}
                            >
                              <Check className="w-4 h-4 mr-1" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openRespondDialog(record.transfer.id, "reject")}
                              data-testid={`button-reject-${record.transfer.id}`}
                            >
                              <X className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {isOutgoing && isPending && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelMutation.mutate(record.transfer.id)}
                            disabled={cancelMutation.isPending}
                            data-testid={`button-cancel-${record.transfer.id}`}
                          >
                            {cancelMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Ban className="w-4 h-4 mr-1" />
                            )}
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={respondDialogOpen} onOpenChange={setRespondDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="title-respond-dialog">
              {respondAction === "accept" ? "Accept Transfer" : "Reject Transfer"}
            </DialogTitle>
            <DialogDescription>
              {respondAction === "accept"
                ? "This will clone the animal's records into your organization. The sending organization's animal will be set to Transported status."
                : "This will decline the transfer request. The animal will remain with the sending organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="response-notes" data-testid="label-response-notes">
                Response Notes (optional)
              </Label>
              <Textarea
                id="response-notes"
                placeholder={respondAction === "accept" ? "Any notes for the sending organization..." : "Reason for declining..."}
                value={responseNotes}
                onChange={(e) => setResponseNotes(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-response-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRespondDialogOpen(false)} data-testid="button-cancel-respond">
              Cancel
            </Button>
            <Button
              variant={respondAction === "accept" ? "default" : "destructive"}
              onClick={handleRespond}
              disabled={acceptMutation.isPending || rejectMutation.isPending}
              data-testid="button-confirm-respond"
            >
              {(acceptMutation.isPending || rejectMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {respondAction === "accept" ? "Accept Transfer" : "Reject Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTransferId} onOpenChange={(open) => !open && setPreviewTransferId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="title-preview-dialog">Transfer Preview</DialogTitle>
            <DialogDescription>
              Review the animal's details and medical records before accepting.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewData ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2" data-testid="heading-animal-info">
                  <PawPrint className="w-4 h-4" /> Animal Info
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> {previewData.animal.name}</div>
                  <div><span className="text-muted-foreground">Species:</span> {previewData.animal.species}</div>
                  <div><span className="text-muted-foreground">Breed:</span> {previewData.animal.breed}</div>
                  <div><span className="text-muted-foreground">Age:</span> {previewData.animal.age || "Unknown"}</div>
                  <div><span className="text-muted-foreground">Sex:</span> {previewData.animal.sex || "Unknown"}</div>
                  <div><span className="text-muted-foreground">Weight:</span> {previewData.animal.weight || "Unknown"}</div>
                  <div><span className="text-muted-foreground">Spay/Neuter:</span> {previewData.animal.neuterStatus || "Unknown"}</div>
                  <div><span className="text-muted-foreground">Microchip:</span> {previewData.animal.microchipNumber || "None"}</div>
                </div>
                {previewData.animal.bio && (
                  <p className="text-sm text-muted-foreground">{previewData.animal.bio}</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {previewData.animal.heartwormPositive && <Badge variant="destructive" className="text-xs">HW+</Badge>}
                  {previewData.animal.biteHistory && <Badge variant="destructive" className="text-xs">Bite History</Badge>}
                  {previewData.animal.specialDiet && <Badge variant="outline" className="text-xs">Special Diet</Badge>}
                  {previewData.animal.needsSpayNeuter && <Badge variant="outline" className="text-xs">Needs S/N</Badge>}
                  {previewData.animal.isFlightRisk && <Badge variant="destructive" className="text-xs">Flight Risk</Badge>}
                  {!previewData.animal.catFriendly && <Badge variant="outline" className="text-xs">No Cats</Badge>}
                  {!previewData.animal.dogFriendly && <Badge variant="outline" className="text-xs">No Dogs</Badge>}
                  {!previewData.animal.childFriendly && <Badge variant="outline" className="text-xs">No Kids</Badge>}
                </div>
              </div>

              {previewData.vaccines.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2" data-testid="heading-vaccines">
                    <Syringe className="w-4 h-4" /> Vaccines ({previewData.vaccines.length})
                  </h3>
                  <div className="space-y-1">
                    {previewData.vaccines.map((v: any, i: number) => (
                      <div key={i} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="font-medium">{v.itemName}</span>
                        <span className="text-muted-foreground">
                          {v.dateGiven ? format(new Date(v.dateGiven), "MMM d, yyyy") : "No date"}
                        </span>
                        {v.dateDue && (
                          <span className="text-muted-foreground">
                            Due: {format(new Date(v.dateDue), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.preventativeCare.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2" data-testid="heading-prev-care">
                    <Shield className="w-4 h-4" /> Preventative Care ({previewData.preventativeCare.length})
                  </h3>
                  <div className="space-y-1">
                    {previewData.preventativeCare.map((pc: any, i: number) => (
                      <div key={i} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="font-medium">{pc.careName}</span>
                        <Badge variant="outline" className="text-xs">{pc.status}</Badge>
                        {pc.dateAdministered && (
                          <span className="text-muted-foreground">
                            {format(new Date(pc.dateAdministered), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.microchips.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2" data-testid="heading-microchips">
                    <Cpu className="w-4 h-4" /> Microchips ({previewData.microchips.length})
                  </h3>
                  <div className="space-y-1">
                    {previewData.microchips.map((mc: any, i: number) => (
                      <div key={i} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="font-medium">{mc.microchipNumber}</span>
                        {mc.manufacturer && <span className="text-muted-foreground">{mc.manufacturer}</span>}
                        {mc.implantDate && (
                          <span className="text-muted-foreground">
                            {format(new Date(mc.implantDate), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.medicalFiles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2" data-testid="heading-med-files">
                    <FileText className="w-4 h-4" /> Medical Files ({previewData.medicalFiles.length})
                  </h3>
                  <div className="space-y-1">
                    {previewData.medicalFiles.map((mf: any, i: number) => (
                      <div key={i} className="text-sm flex flex-wrap items-center gap-2">
                        <span className="font-medium">{mf.fileName}</span>
                        {mf.description && <span className="text-muted-foreground">{mf.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewTransferId(null)} data-testid="button-close-preview">
              Close
            </Button>
            {previewTransferId && (
              <>
                <Button
                  onClick={() => {
                    setPreviewTransferId(null);
                    openRespondDialog(previewTransferId, "accept");
                  }}
                  data-testid="button-accept-from-preview"
                >
                  <Check className="w-4 h-4 mr-1" /> Accept Transfer
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
