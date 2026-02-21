import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { 
  Plus, 
  Loader2, 
  Truck, 
  AlertTriangle, 
  MessageCircle, 
  MapPin, 
  Calendar, 
  Users, 
  ArrowRight, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Radio, 
  ChevronRight,
  ExternalLink,
  Send,
  Bell,
  Phone,
  MessageSquare,
  Trash2,
  AlertCircle,
  FileText,
  Copy,
  Link2,
  PawPrint,
  Shield,
  AlertOctagon,
  Download,
  Pill,
  ShieldAlert,
  Ban,
  GripVertical,
  User,
  History,
  Upload,
  Play,
  Info,
  ArrowDown,
  CircleDot,
  Package,
  Clipboard,
  Navigation,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTenant } from "@/contexts/TenantContext";
import { MedicalFileUploadDialog } from "@/components/MedicalFileUploadDialog";
import type { 
  TransportEvent, 
  TransferAlert,
  TransportParticipant,
  TransportUpdate,
  TransportManifestItem,
  TransportTimelineEvent,
  Animal,
  PendingTransfer,
  User as UserType,
  PartnerOrganization,
} from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const transportFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  transportType: z.enum(["outbound", "inbound", "relay", "internal"]),
  originLocation: z.string().optional(),
  destinationLocation: z.string().optional(),
  departureDate: z.string().optional(),
  estimatedArrivalDate: z.string().optional(),
  partnerOrganizationName: z.string().optional(),
  partnerContactName: z.string().optional(),
  partnerContactEmail: z.string().email().optional().or(z.literal("")),
  partnerContactPhone: z.string().optional(),
  vehicleInfo: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  notes: z.string().optional(),
});

type TransportFormData = z.infer<typeof transportFormSchema>;

const alertFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  urgencyLevel: z.enum(["low", "medium", "high", "critical"]),
  alertType: z.enum(["capacity", "transport_needed", "foster_needed", "medical_emergency", "general"]),
  animalCount: z.preprocess(
    (val) => (val === "" || val === undefined || val === null) ? undefined : Number(val),
    z.number().optional()
  ),
  species: z.string().optional(),
  location: z.string().optional(),
  region: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

type AlertFormData = z.infer<typeof alertFormSchema>;

const transportStatusColors: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function TransportCard({ transport, onClick }: { transport: TransportEvent; onClick: () => void }) {
  const statusColors = transportStatusColors;

  const typeLabels: Record<string, string> = {
    outbound: "Outbound",
    inbound: "Inbound",
    relay: "Relay",
    internal: "Internal",
  };

  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      onClick={onClick}
      data-testid={`card-transport-${transport.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg line-clamp-1">{transport.name}</CardTitle>
          <Badge className={statusColors[transport.status]}>
            {transport.status.replace("_", " ")}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          <Truck className="h-3 w-3" />
          {typeLabels[transport.transportType]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(transport.originLocation || transport.destinationLocation) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="line-clamp-1">
              {transport.originLocation}
              {transport.originLocation && transport.destinationLocation && (
                <ArrowRight className="h-3 w-3 inline mx-1" />
              )}
              {transport.destinationLocation}
            </span>
          </div>
        )}
        {transport.departureDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{new Date(transport.departureDate).toLocaleDateString()}</span>
          </div>
        )}
        {transport.animalCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>{transport.animalCount} animals</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert, onClick }: { alert: TransferAlert; onClick: () => void }) {
  const urgencyColors: Record<string, string> = {
    low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const typeLabels: Record<string, string> = {
    capacity: "Over Capacity",
    transport_needed: "Transport Needed",
    foster_needed: "Foster Needed",
    medical_emergency: "Medical Emergency",
    general: "General",
  };

  const statusIcons: Record<string, JSX.Element> = {
    active: <Radio className="h-4 w-4 text-red-500 animate-pulse" />,
    responded: <Clock className="h-4 w-4 text-yellow-500" />,
    resolved: <CheckCircle className="h-4 w-4 text-green-500" />,
    expired: <XCircle className="h-4 w-4 text-muted-foreground" />,
    cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <Card 
      className="hover-elevate cursor-pointer border-l-4" 
      style={{
        borderLeftColor: alert.urgencyLevel === 'critical' ? 'rgb(239, 68, 68)' : 
                         alert.urgencyLevel === 'high' ? 'rgb(249, 115, 22)' :
                         alert.urgencyLevel === 'medium' ? 'rgb(234, 179, 8)' : 'rgb(34, 197, 94)'
      }}
      onClick={onClick}
      data-testid={`card-alert-${alert.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {statusIcons[alert.status]}
            <CardTitle className="text-lg line-clamp-1">{alert.title}</CardTitle>
          </div>
          <Badge className={urgencyColors[alert.urgencyLevel]}>
            {alert.urgencyLevel}
          </Badge>
        </div>
        <CardDescription>{typeLabels[alert.alertType]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-2">{alert.message}</p>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {alert.animalCount && (
            <span>{alert.animalCount} animals</span>
          )}
          {alert.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {alert.location}
            </span>
          )}
          {alert.responseCount > 0 && (
            <Badge variant="outline">{alert.responseCount} responses</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateTransportDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  
  const { data: partnerOrgsResponse } = useQuery<{ organizations: PartnerOrganization[] }>({
    queryKey: ['/api/partner-organizations'],
  });
  
  const activePartners = (partnerOrgsResponse?.organizations || []).filter(p => p.isActive);
  
  const form = useForm<TransportFormData>({
    resolver: zodResolver(transportFormSchema),
    defaultValues: {
      name: "",
      description: "",
      transportType: "outbound",
      originLocation: "",
      destinationLocation: "",
      departureDate: "",
      estimatedArrivalDate: "",
      partnerOrganizationName: "",
      partnerContactName: "",
      partnerContactEmail: "",
      partnerContactPhone: "",
      vehicleInfo: "",
      driverName: "",
      driverPhone: "",
      notes: "",
    },
  });
  
  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    
    if (partnerId === "manual") {
      form.setValue("partnerOrganizationName", "");
      form.setValue("partnerContactName", "");
      form.setValue("partnerContactEmail", "");
      form.setValue("partnerContactPhone", "");
      return;
    }
    
    const partner = activePartners.find(p => p.id === partnerId);
    if (partner) {
      form.setValue("partnerOrganizationName", partner.name);
      form.setValue("partnerContactName", partner.contactName || "");
      form.setValue("partnerContactEmail", partner.contactEmail || "");
      form.setValue("partnerContactPhone", partner.contactPhone || "");
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: TransportFormData) => {
      const payload = {
        ...data,
        departureDate: data.departureDate ? new Date(data.departureDate).toISOString() : undefined,
        estimatedArrivalDate: data.estimatedArrivalDate ? new Date(data.estimatedArrivalDate).toISOString() : undefined,
      };
      return apiRequest('POST', '/api/transport/events', payload);
    },
    onSuccess: () => {
      toast({ title: "Transport created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/stats'] });
      form.reset();
      setSelectedPartnerId("");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create transport",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Transport</DialogTitle>
          <DialogDescription>
            Set up a new transport event to coordinate animal transfers
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Transport Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="TX to CO Transport - November 2024" 
                        {...field} 
                        data-testid="input-transport-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="transportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transport Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transport-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound (Sending)</SelectItem>
                        <SelectItem value="inbound">Inbound (Receiving)</SelectItem>
                        <SelectItem value="relay">Relay (Transfer Point)</SelectItem>
                        <SelectItem value="internal">Internal (Local Move)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Details about this transport..." 
                        {...field} 
                        data-testid="input-transport-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <h4 className="font-medium">Route Information</h4>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="originLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origin Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Houston, TX" 
                        {...field} 
                        data-testid="input-origin-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destinationLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Denver, CO" 
                        {...field} 
                        data-testid="input-destination-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="departureDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departure Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field} 
                        data-testid="input-departure-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimatedArrivalDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Arrival</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field} 
                        data-testid="input-arrival-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <h4 className="font-medium">Partner Organization</h4>

            <div className="space-y-4">
              <div className="space-y-2">
                <FormLabel>Select Partner Organization</FormLabel>
                <Select 
                  value={selectedPartnerId} 
                  onValueChange={handlePartnerSelect}
                >
                  <SelectTrigger data-testid="select-partner-org">
                    <SelectValue placeholder="Choose from your partners or enter manually" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Enter manually</SelectItem>
                    {activePartners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                        {partner.city && partner.state && ` - ${partner.city}, ${partner.state}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activePartners.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No partner organizations found. <Link href="/dashboard/partner-organizations" className="text-primary hover:underline">Add partners</Link> to enable quick selection.
                  </p>
                )}
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="partnerOrganizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Partner Rescue Name" 
                          {...field} 
                          data-testid="input-partner-org"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              <FormField
                control={form.control}
                name="partnerContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Contact person" 
                        {...field} 
                        data-testid="input-partner-contact"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="partnerContactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="contact@partner.org" 
                        {...field} 
                        data-testid="input-partner-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="partnerContactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="(555) 123-4567" 
                        {...field} 
                        data-testid="input-partner-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
            </div>

            <Separator />
            <h4 className="font-medium">Logistics</h4>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="vehicleInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle Info</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="White Van - License ABC123" 
                        {...field} 
                        data-testid="input-vehicle-info"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Driver name" 
                        {...field} 
                        data-testid="input-driver-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="driverPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver Phone</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="(555) 123-4567" 
                        {...field} 
                        data-testid="input-driver-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes..." 
                      {...field} 
                      data-testid="input-transport-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-transport"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-create-transport"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Transport
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CreateAlertDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  
  const form = useForm<AlertFormData>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: {
      title: "",
      message: "",
      urgencyLevel: "medium",
      alertType: "general",
      animalCount: undefined,
      species: "",
      location: "",
      region: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AlertFormData) => {
      return apiRequest('POST', '/api/transport/alerts', data);
    },
    onSuccess: () => {
      toast({ title: "Alert created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/stats'] });
      form.reset();
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create alert",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Create Transfer Alert
          </DialogTitle>
          <DialogDescription>
            Broadcast an SOS alert to request help from partner organizations
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Alert Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="URGENT: Over capacity - need transfer help" 
                        {...field}
                        data-testid="input-alert-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="urgencyLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Urgency Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-urgency-level">
                          <SelectValue placeholder="Select urgency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low - Non-urgent</SelectItem>
                        <SelectItem value="medium">Medium - Standard</SelectItem>
                        <SelectItem value="high">High - Urgent</SelectItem>
                        <SelectItem value="critical">Critical - Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alertType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-alert-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="capacity">Over Capacity</SelectItem>
                        <SelectItem value="transport_needed">Transport Needed</SelectItem>
                        <SelectItem value="foster_needed">Foster Needed</SelectItem>
                        <SelectItem value="medical_emergency">Medical Emergency</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your situation and what help you need..." 
                        rows={4}
                        {...field}
                        data-testid="input-alert-message"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <h4 className="font-medium">Animal Information</h4>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="animalCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Animals</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-animal-count"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="species"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Species</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="dogs, cats, mixed"
                        {...field}
                        data-testid="input-alert-species"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="City, State"
                        {...field}
                        data-testid="input-alert-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Southeast Texas"
                        {...field}
                        data-testid="input-alert-region"
                      />
                    </FormControl>
                    <FormDescription>For regional network targeting</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <h4 className="font-medium">Contact Information</h4>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Your name"
                        {...field}
                        data-testid="input-contact-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="email@rescue.org"
                        {...field}
                        data-testid="input-contact-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="(555) 123-4567"
                        {...field}
                        data-testid="input-contact-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-alert"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-create-alert"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Alert
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ManifestTab({ transportId, open }: { transportId: string; open: boolean }) {
  const { toast } = useToast();
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [destinationOrgName, setDestinationOrgName] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [runSheetUrl, setRunSheetUrl] = useState<string | null>(null);
  const [needsMedication, setNeedsMedication] = useState(false);
  const [isFlightRisk, setIsFlightRisk] = useState(false);
  const [isAggressive, setIsAggressive] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedAnimalId, setDraggedAnimalId] = useState<string | null>(null);
  const [uploadDialogAnimal, setUploadDialogAnimal] = useState<Animal | null>(null);

  const { data: manifestData, isLoading: manifestLoading } = useQuery<{
    items: (TransportManifestItem & { 
      animal?: Animal | null;
      validationErrors?: string[];
    })[];
  }>({
    queryKey: [`/api/transport/events/${transportId}/manifest`],
    enabled: !!transportId && open,
  });

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
    enabled: open,
  });

  const { data: validationData, refetch: refetchValidation } = useQuery<{
    isValid: boolean;
    canFinalize: boolean;
    items: { animalId: string; animalName: string; errors: string[]; hasCvi: boolean }[];
    summary: { total: number; valid: number; invalid: number; missingCvi: number };
  }>({
    queryKey: [`/api/transport/events/${transportId}/validate-manifest`],
    enabled: !!transportId && open && (manifestData?.items?.length || 0) > 0,
  });

  const addManifestItemMutation = useMutation({
    mutationFn: async (data: { 
      animalId: string; 
      destinationOrgName?: string; 
      specialInstructions?: string;
      needsMedication?: boolean;
      isFlightRisk?: boolean;
      isAggressive?: boolean;
    }) => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/manifest`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportId}/manifest`] });
      queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportId}/validate-manifest`] });
      setSelectedAnimalId("");
      setDestinationOrgName("");
      setSpecialInstructions("");
      setNeedsMedication(false);
      setIsFlightRisk(false);
      setIsAggressive(false);
      toast({
        title: "Animal added to manifest",
        description: data.validationErrors?.length > 0 
          ? `Added with ${data.validationErrors.length} validation warning(s)` 
          : "Animal successfully added to transport manifest.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add animal",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeManifestItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest('DELETE', `/api/transport/manifest/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportId}/manifest`] });
      queryClient.invalidateQueries({ queryKey: [`/api/transport/events/${transportId}/validate-manifest`] });
      toast({
        title: "Animal removed",
        description: "Removed from transport manifest.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove animal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateRunSheetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/run-sheet-token`);
      return response.json();
    },
    onSuccess: (data) => {
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/run-sheet/${data.token}`;
      setRunSheetUrl(url);
      toast({
        title: "Run sheet link generated",
        description: "Share this link with drivers for mobile access.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const finalizeManifestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/transport/events/${transportId}/finalize-manifest`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to finalize manifest');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transportId] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events'] });
      toast({
        title: "Manifest finalized",
        description: "Transport status updated to confirmed. All health certificates verified.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cannot finalize manifest",
        description: error.message || "Some animals are missing required health certificates.",
        variant: "destructive",
      });
    },
  });

  const handleCopyRunSheetUrl = async () => {
    if (runSheetUrl) {
      await navigator.clipboard.writeText(runSheetUrl);
      toast({
        title: "Link copied",
        description: "Run sheet URL copied to clipboard.",
      });
    }
  };

  const handleAddAnimal = (animalId?: string) => {
    const idToAdd = animalId || selectedAnimalId;
    if (!idToAdd) {
      toast({
        title: "Select an animal",
        description: "Please select an animal to add to the manifest.",
        variant: "destructive",
      });
      return;
    }
    addManifestItemMutation.mutate({
      animalId: idToAdd,
      destinationOrgName: destinationOrgName || undefined,
      specialInstructions: specialInstructions || undefined,
      needsMedication,
      isFlightRisk,
      isAggressive,
    });
  };

  const handleDragStart = (e: React.DragEvent, animalId: string) => {
    e.dataTransfer.setData("animalId", animalId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedAnimalId(animalId);
  };

  const handleDragEnd = () => {
    setDraggedAnimalId(null);
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const animalId = e.dataTransfer.getData("animalId");
    if (animalId) {
      handleAddAnimal(animalId);
    }
  };

  const manifestItems = manifestData?.items || [];
  const availableAnimals = animalsData?.animals?.filter(
    (a) => !manifestItems.some((item) => item.animalId === a.id) && a.status !== 'adopted' && a.status !== 'deceased' && a.status !== 'transported'
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Transport Manifest</h4>
          <p className="text-sm text-muted-foreground">
            Add animals and manage the transport checklist
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchValidation()}
            data-testid="button-validate-manifest"
          >
            <Shield className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Validate</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateRunSheetMutation.mutate()}
            disabled={generateRunSheetMutation.isPending}
            data-testid="button-generate-runsheet"
          >
            {generateRunSheetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Link2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Run Sheet</span>
          </Button>
          <Button
            size="sm"
            onClick={() => finalizeManifestMutation.mutate()}
            disabled={finalizeManifestMutation.isPending || (validationData && !validationData.canFinalize)}
            data-testid="button-finalize-manifest"
          >
            {finalizeManifestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Finalize</span>
          </Button>
        </div>
      </div>

      {runSheetUrl && (
        <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <Link2 className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm truncate mr-2">{runSheetUrl}</span>
            <Button variant="ghost" size="sm" onClick={handleCopyRunSheetUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {validationData?.summary?.missingCvi && validationData.summary.missingCvi > 0 && (
        <Alert variant="destructive">
          <AlertOctagon className="h-4 w-4" />
          <AlertDescription>
            <strong>CVI Check Failed:</strong> {validationData.summary.missingCvi} animal(s) missing Health Certificate / CVI.
            <br />
            <span className="text-sm">Transport cannot be finalized until all animals have valid health documentation.</span>
          </AlertDescription>
        </Alert>
      )}

      {validationData && validationData.canFinalize && !validationData.isValid && (
        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            {validationData.summary.invalid} animal(s) have warnings (e.g., missing photos). Transport can still be finalized.
          </AlertDescription>
        </Alert>
      )}

      {validationData && validationData.canFinalize && validationData.isValid && manifestItems.length > 0 && (
        <Alert className="bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            All {validationData.summary.total} animals have valid health certificates. Ready to finalize!
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium">Available Animals ({availableAnimals.length})</h5>
            <p className="text-xs text-muted-foreground">Drag to add or click +</p>
          </div>
          
          <ScrollArea className="h-[200px] border rounded-lg p-2">
            {availableAnimals.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <PawPrint className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No available animals</p>
              </div>
            ) : (
              <div className="space-y-1">
                {availableAnimals.map((animal) => (
                  <div
                    key={animal.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, animal.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-2 rounded-md border cursor-grab active:cursor-grabbing transition-all ${
                      draggedAnimalId === animal.id 
                        ? 'opacity-50 border-primary bg-primary/5' 
                        : 'hover-elevate bg-card'
                    }`}
                    data-testid={`draggable-animal-${animal.id}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <PawPrint className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="truncate">
                        <span className="font-medium">{animal.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {animal.species} {animal.breed ? `- ${animal.breed}` : ''}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => handleAddAnimal(animal.id)}
                      disabled={addManifestItemMutation.isPending}
                      data-testid={`button-quick-add-${animal.id}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground">Default options for added animals:</p>
            <Input
              placeholder="Destination organization (optional)"
              value={destinationOrgName}
              onChange={(e) => setDestinationOrgName(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-destination-org"
            />
            <Input
              placeholder="Special instructions (optional)"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-special-instructions"
            />
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center space-x-1">
                <Checkbox 
                  id="needsMedication" 
                  checked={needsMedication}
                  onCheckedChange={(checked) => setNeedsMedication(checked === true)}
                  data-testid="checkbox-needs-medication"
                />
                <label htmlFor="needsMedication" className="text-xs font-medium flex items-center gap-1 cursor-pointer">
                  <Pill className="h-3 w-3 text-blue-500" />
                  Meds
                </label>
              </div>
              <div className="flex items-center space-x-1">
                <Checkbox 
                  id="isFlightRisk" 
                  checked={isFlightRisk}
                  onCheckedChange={(checked) => setIsFlightRisk(checked === true)}
                  data-testid="checkbox-flight-risk"
                />
                <label htmlFor="isFlightRisk" className="text-xs font-medium flex items-center gap-1 cursor-pointer">
                  <Ban className="h-3 w-3 text-orange-500" />
                  Flight Risk
                </label>
              </div>
              <div className="flex items-center space-x-1">
                <Checkbox 
                  id="isAggressive" 
                  checked={isAggressive}
                  onCheckedChange={(checked) => setIsAggressive(checked === true)}
                  data-testid="checkbox-aggressive"
                />
                <label htmlFor="isAggressive" className="text-xs font-medium flex items-center gap-1 cursor-pointer">
                  <ShieldAlert className="h-3 w-3 text-red-500" />
                  Handle w/ Care
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium">On Manifest ({manifestItems.length})</h5>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg transition-colors min-h-[200px] ${
              isDragOver 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="listbox"
            aria-label="Transport manifest drop zone. Drag animals here to add them to the manifest, or use the add buttons."
            aria-dropeffect="move"
            data-testid="manifest-drop-zone"
          >
            {manifestLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : manifestItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                <PawPrint className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm font-medium">Drop animals here</p>
                <p className="text-xs">or click + to add</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] p-2">
                <div className="space-y-2">
                  {manifestItems.map((item) => {
                    const itemValidation = validationData?.items?.find((v) => v.animalId === item.animalId);
                    const hasErrors = itemValidation?.errors?.length > 0;

                    return (
                  <Card key={item.id} className={hasErrors ? "border-amber-500" : ""}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PawPrint className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.animal?.name || item.animalName || 'Unknown'}</span>
                            {item.deliveryStatus === 'delivered' && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Delivered
                              </Badge>
                            )}
                            {hasErrors && (
                              <Badge variant="outline" className="text-amber-600 border-amber-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {itemValidation.errors.length} issue(s)
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {item.animal?.species || item.animalSpecies} - {item.animal?.breed || item.animalBreed || 'Unknown breed'}
                          </div>
                          {(item.needsMedication || item.isFlightRisk || item.isAggressive) && (
                            <div className="flex gap-2 mt-2">
                              {item.needsMedication && (
                                <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                                  <Pill className="h-3 w-3 mr-1" />
                                  Needs Meds
                                </Badge>
                              )}
                              {item.isFlightRisk && (
                                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                                  <Ban className="h-3 w-3 mr-1" />
                                  Flight Risk
                                </Badge>
                              )}
                              {item.isAggressive && (
                                <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800">
                                  <ShieldAlert className="h-3 w-3 mr-1" />
                                  Handle with Care
                                </Badge>
                              )}
                            </div>
                          )}
                          {item.destinationOrgName && (
                            <div className="text-sm text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              To: {item.destinationOrgName}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="text-sm mt-1 p-2 bg-muted rounded">
                              {item.specialInstructions}
                            </div>
                          )}
                          {hasErrors && (
                            <div className="mt-2 space-y-1">
                              {itemValidation.errors.map((error, idx) => (
                                <div key={idx} className="text-xs text-amber-600 flex items-center gap-1 flex-wrap">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span>{error}</span>
                                  {(error.toLowerCase().includes('cvi') || error.toLowerCase().includes('health certificate')) && item.animal && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs text-primary ml-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUploadDialogAnimal(item.animal!);
                                      }}
                                      data-testid={`button-upload-cvi-${item.animalId}`}
                                    >
                                      <Upload className="h-3 w-3 mr-1" />
                                      Upload Document
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeManifestItemMutation.mutate(item.id)}
                          disabled={removeManifestItemMutation.isPending}
                          data-testid={`button-remove-manifest-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>

      {uploadDialogAnimal && (
        <MedicalFileUploadDialog
          open={!!uploadDialogAnimal}
          onOpenChange={(open) => !open && setUploadDialogAnimal(null)}
          animal={uploadDialogAnimal}
          transportEventId={transportId}
          onSuccess={() => {
            refetchValidation();
          }}
        />
      )}
    </div>
  );
}

function TransportDetailDialog({
  transport,
  open,
  onOpenChange,
}: {
  transport: TransportEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const { data: tenantTierData } = useQuery<{ tenant: { subscriptionTier: string } }>({
    queryKey: ['/api/tenant'],
  });
  const isLiteTier = tenantTierData?.tenant?.subscriptionTier === 'lite';
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [participantType, setParticipantType] = useState<"internal" | "external">("internal");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [participantRole, setParticipantRole] = useState<string>("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [externalOrganization, setExternalOrganization] = useState("");
  const [newComment, setNewComment] = useState("");
  const [statusChangeDialog, setStatusChangeDialog] = useState<{ targetStatus: string } | null>(null);
  const [statusChangeNotes, setStatusChangeNotes] = useState("");

  const statusChangeMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes?: string }) => {
      const body: any = { status };
      if (status === 'completed') {
        body.actualArrivalDate = new Date().toISOString();
      }
      const response = await apiRequest('PATCH', `/api/transport/events/${transport?.id}`, body);
      if (notes?.trim()) {
        await apiRequest('POST', `/api/transport/events/${transport?.id}/comment`, {
          message: status === 'cancelled'
            ? `Transport cancelled: ${notes.trim()}`
            : `Transport completed: ${notes.trim()}`,
        });
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id, 'timeline'] });
      if (variables.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      }
      setStatusChangeDialog(null);
      setStatusChangeNotes("");
      toast({
        title: "Status updated",
        description: variables.status === 'completed'
          ? `Transport completed. All linked animals have been automatically updated to "transported" status.`
          : `Transport status changed to ${variables.status.replace("_", " ")}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update status",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch team members for dropdown
  const { data: usersData } = useQuery<{ users: UserType[] }>({
    queryKey: ['/api/users'],
    enabled: open,
  });

  // Fetch timeline events (Mission Log)
  type TimelineEventWithUser = TransportTimelineEvent & { 
    user?: { firstName: string | null; lastName: string | null; profilePictureUrl?: string | null } | null 
  };
  const { data: timelineData, isLoading: isLoadingTimeline } = useQuery<{ events: TimelineEventWithUser[] }>({
    queryKey: ['/api/transport/events', transport?.id, 'timeline'],
    enabled: !!transport?.id && open,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', `/api/transport/events/${transport?.id}/comment`, { message });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id, 'timeline'] });
      setNewComment("");
      toast({
        title: "Comment added",
        description: "Your note has been added to the mission log.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add comment",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: detailData, isLoading } = useQuery<{
    transport: TransportEvent & { smsSubscribers?: string[] };
    participants: TransportParticipant[];
    updates: TransportUpdate[];
  }>({
    queryKey: ['/api/transport/events', transport?.id],
    enabled: !!transport?.id && open,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest('POST', `/api/transports/${transport?.id}/sms-subscribe`, { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id] });
      setNewPhoneNumber("");
      toast({
        title: "Subscriber added",
        description: "Phone number will now receive transport updates.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add subscriber",
        description: error.message || "Please verify the phone number format.",
        variant: "destructive",
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest('DELETE', `/api/transports/${transport?.id}/sms-unsubscribe`, { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id] });
      toast({
        title: "Subscriber removed",
        description: "Phone number will no longer receive updates.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove subscriber",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', `/api/transports/${transport?.id}/sms-broadcast`, { message });
      return response.json();
    },
    onSuccess: (data) => {
      setBroadcastMessage("");
      toast({
        title: "SMS sent",
        description: `Sent to ${data.sent} subscriber${data.sent !== 1 ? 's' : ''}${data.failed > 0 ? ` (${data.failed} failed)` : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send SMS",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const addParticipantMutation = useMutation({
    mutationFn: async (data: {
      userId?: string;
      externalName?: string;
      externalEmail?: string;
      externalPhone?: string;
      externalOrganization?: string;
      role: string;
    }) => {
      const response = await apiRequest('POST', `/api/transport/events/${transport?.id}/participants`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id] });
      // Reset form
      setSelectedUserId("");
      setParticipantRole("");
      setExternalName("");
      setExternalEmail("");
      setExternalPhone("");
      setExternalOrganization("");
      toast({
        title: "Participant added",
        description: "The participant has been added to this transport.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add participant",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeParticipantMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const response = await apiRequest('DELETE', `/api/transport/participants/${participantId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transport/events', transport?.id] });
      toast({
        title: "Participant removed",
        description: "The participant has been removed from this transport.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove participant",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddParticipant = () => {
    if (!participantRole) {
      toast({
        title: "Role required",
        description: "Please select a role for the participant.",
        variant: "destructive",
      });
      return;
    }

    if (participantType === "internal") {
      if (!selectedUserId) {
        toast({
          title: "Team member required",
          description: "Please select a team member.",
          variant: "destructive",
        });
        return;
      }
      addParticipantMutation.mutate({
        userId: selectedUserId,
        role: participantRole,
      });
    } else {
      if (!externalName.trim()) {
        toast({
          title: "Name required",
          description: "Please enter the participant's name.",
          variant: "destructive",
        });
        return;
      }
      addParticipantMutation.mutate({
        externalName: externalName.trim(),
        externalEmail: externalEmail.trim() || undefined,
        externalPhone: externalPhone.trim() || undefined,
        externalOrganization: externalOrganization.trim() || undefined,
        role: participantRole,
      });
    }
  };

  const handleAddSubscriber = () => {
    const trimmedPhone = newPhoneNumber.trim();
    if (!trimmedPhone.match(/^\+[1-9]\d{1,14}$/)) {
      toast({
        title: "Invalid phone number",
        description: "Please use E.164 format (e.g., +15551234567)",
        variant: "destructive",
      });
      return;
    }
    subscribeMutation.mutate(trimmedPhone);
  };

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) {
      toast({
        title: "Message required",
        description: "Please enter a message to send.",
        variant: "destructive",
      });
      return;
    }
    broadcastMutation.mutate(broadcastMessage);
  };

  const smsSubscribers = detailData?.transport?.smsSubscribers || [];
  const twilioEnabled = tenant?.twilioEnabled;

  if (!transport) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transport.name}</DialogTitle>
          <DialogDescription>
            {transport.originLocation}
            {transport.originLocation && transport.destinationLocation && " → "}
            {transport.destinationLocation}
          </DialogDescription>
        </DialogHeader>

        {/* Status Controls & Active Mode */}
        {(() => {
          const currentStatus = detailData?.transport?.status || transport.status;
          return (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {currentStatus === 'planning' && (
                  <Button
                    variant="outline"
                    onClick={() => statusChangeMutation.mutate({ status: 'confirmed' })}
                    disabled={statusChangeMutation.isPending}
                    data-testid="button-confirm-transport"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm
                  </Button>
                )}
                {currentStatus === 'confirmed' && (
                  <Button
                    variant="default"
                    onClick={() => statusChangeMutation.mutate({ status: 'in_progress' })}
                    disabled={statusChangeMutation.isPending}
                    data-testid="button-start-transport"
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    Start Transport
                  </Button>
                )}
                {currentStatus === 'in_progress' && (
                  <Button
                    variant="default"
                    onClick={() => setStatusChangeDialog({ targetStatus: 'completed' })}
                    disabled={statusChangeMutation.isPending}
                    data-testid="button-complete-transport"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Completed
                  </Button>
                )}
                {currentStatus !== 'completed' && currentStatus !== 'cancelled' && (
                  <Button
                    variant="outline"
                    onClick={() => setStatusChangeDialog({ targetStatus: 'cancelled' })}
                    disabled={statusChangeMutation.isPending}
                    data-testid="button-cancel-transport"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
              {(currentStatus === 'confirmed' || currentStatus === 'in_progress') && (
                <Link href={`/dashboard/transport/${transport.id}/active`}>
                  <Button variant="default" className="w-full sm:w-auto" data-testid="button-start-active-mode">
                    <Play className="h-4 w-4 mr-2" />
                    Active Mode
                  </Button>
                </Link>
              )}
            </div>
          );
        })()}

        {/* Status Change Confirmation AlertDialog (uses portal, safe inside Dialog) */}
        <AlertDialog open={!!statusChangeDialog} onOpenChange={(o) => { if (!o) { setStatusChangeDialog(null); setStatusChangeNotes(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusChangeDialog?.targetStatus === 'cancelled' ? 'Cancel Transport' : 'Complete Transport'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusChangeDialog?.targetStatus === 'cancelled'
                  ? 'Please provide a reason for cancelling this transport.'
                  : 'Add any final notes about this transport (optional).'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder={statusChangeDialog?.targetStatus === 'cancelled'
                ? 'Reason for cancellation...'
                : 'Final notes (optional)...'}
              value={statusChangeNotes}
              onChange={(e) => setStatusChangeNotes(e.target.value)}
              data-testid="input-status-change-notes"
            />
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => { setStatusChangeDialog(null); setStatusChangeNotes(""); }}
                data-testid="button-cancel-status-change"
              >
                Go Back
              </AlertDialogCancel>
              <Button
                variant={statusChangeDialog?.targetStatus === 'cancelled' ? 'destructive' : 'default'}
                onClick={() => {
                  if (statusChangeDialog?.targetStatus === 'cancelled' && !statusChangeNotes.trim()) {
                    toast({
                      title: "Reason required",
                      description: "Please provide a reason for cancelling.",
                      variant: "destructive",
                    });
                    return;
                  }
                  statusChangeMutation.mutate({
                    status: statusChangeDialog!.targetStatus,
                    notes: statusChangeNotes,
                  });
                }}
                disabled={statusChangeMutation.isPending}
                data-testid="button-confirm-status-change"
              >
                {statusChangeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {statusChangeDialog?.targetStatus === 'cancelled' ? 'Cancel Transport' : 'Mark Completed'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Tabs defaultValue="details" className="w-full">
          <div className="w-full overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-5">
              <TabsTrigger value="details" data-testid="tab-transport-details">Details</TabsTrigger>
              <TabsTrigger value="manifest" data-testid="tab-transport-manifest">
                <FileText className="h-3 w-3 mr-1" />
                Manifest
              </TabsTrigger>
              <TabsTrigger value="participants" data-testid="tab-transport-participants">
                Participants ({detailData?.participants?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-transport-timeline">
                Mission Log ({timelineData?.events?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="sms" data-testid="tab-transport-sms">
                <Phone className="h-3 w-3 mr-1" />
                SMS ({smsSubscribers.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                    <Badge className={`mt-1 ${transportStatusColors[detailData?.transport?.status || transport.status] || ''}`} data-testid="badge-transport-status">
                      {(detailData?.transport?.status || transport.status).replace("_", " ")}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Type</h4>
                    <p className="mt-1">{transport.transportType}</p>
                  </div>
                  {transport.departureDate && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Departure</h4>
                      <p className="mt-1">{new Date(transport.departureDate).toLocaleString()}</p>
                    </div>
                  )}
                  {transport.estimatedArrivalDate && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Est. Arrival</h4>
                      <p className="mt-1">{new Date(transport.estimatedArrivalDate).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {transport.partnerOrganizationName && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Partner Organization</h4>
                      <div className="grid gap-2 md:grid-cols-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Organization:</span>{" "}
                          {transport.partnerOrganizationName}
                        </div>
                        {transport.partnerContactName && (
                          <div>
                            <span className="text-muted-foreground">Contact:</span>{" "}
                            {transport.partnerContactName}
                          </div>
                        )}
                        {transport.partnerContactEmail && (
                          <div>
                            <span className="text-muted-foreground">Email:</span>{" "}
                            {transport.partnerContactEmail}
                          </div>
                        )}
                        {transport.partnerContactPhone && (
                          <div>
                            <span className="text-muted-foreground">Phone:</span>{" "}
                            {transport.partnerContactPhone}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {(transport.vehicleInfo || transport.driverName) && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Logistics</h4>
                      <div className="grid gap-2 md:grid-cols-2 text-sm">
                        {transport.vehicleInfo && (
                          <div>
                            <span className="text-muted-foreground">Vehicle:</span>{" "}
                            {transport.vehicleInfo}
                          </div>
                        )}
                        {transport.driverName && (
                          <div>
                            <span className="text-muted-foreground">Driver:</span>{" "}
                            {transport.driverName}
                          </div>
                        )}
                        {transport.driverPhone && (
                          <div>
                            <span className="text-muted-foreground">Driver Phone:</span>{" "}
                            {transport.driverPhone}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {transport.notes && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Notes</h4>
                      <p className="text-sm text-muted-foreground">{transport.notes}</p>
                    </div>
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="manifest">
            <ManifestTab transportId={transport.id} open={open} />
          </TabsContent>

          <TabsContent value="participants" className="space-y-4">
            {/* Add Participant Form */}
            <Card className="p-4">
              <h4 className="font-medium mb-3">Add Participant</h4>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={participantType === "internal" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setParticipantType("internal")}
                    data-testid="button-participant-type-internal"
                  >
                    Team Member
                  </Button>
                  <Button
                    type="button"
                    variant={participantType === "external" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setParticipantType("external")}
                    data-testid="button-participant-type-external"
                  >
                    External
                  </Button>
                </div>

                {participantType === "internal" ? (
                  <div>
                    <label className="text-sm font-medium">Team Member</label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger data-testid="select-team-member">
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        {usersData?.users?.map((user) => (
                          <SelectItem key={user.id} value={user.id} data-testid={`select-user-${user.id}`}>
                            {user.fullName} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Name *</label>
                      <Input
                        value={externalName}
                        onChange={(e) => setExternalName(e.target.value)}
                        placeholder="Full name"
                        data-testid="input-external-name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        type="email"
                        value={externalEmail}
                        onChange={(e) => setExternalEmail(e.target.value)}
                        placeholder="Email address"
                        data-testid="input-external-email"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Phone</label>
                      <Input
                        value={externalPhone}
                        onChange={(e) => setExternalPhone(e.target.value)}
                        placeholder="Phone number"
                        data-testid="input-external-phone"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Organization</label>
                      <Input
                        value={externalOrganization}
                        onChange={(e) => setExternalOrganization(e.target.value)}
                        placeholder="Organization name"
                        data-testid="input-external-organization"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Role *</label>
                  <Select value={participantRole} onValueChange={setParticipantRole}>
                    <SelectTrigger data-testid="select-participant-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coordinator">Coordinator</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="volunteer">Volunteer</SelectItem>
                      <SelectItem value="foster_pickup">Foster Pickup</SelectItem>
                      <SelectItem value="foster_dropoff">Foster Dropoff</SelectItem>
                      <SelectItem value="vet">Veterinarian</SelectItem>
                      <SelectItem value="observer">Observer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleAddParticipant}
                  disabled={addParticipantMutation.isPending}
                  className="w-full"
                  data-testid="button-add-participant"
                >
                  {addParticipantMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Participant
                </Button>
              </div>
            </Card>

            {/* Participants List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detailData?.participants?.length ? (
              <div className="space-y-2">
                {detailData.participants.map((participant) => (
                  <Card key={participant.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium">
                          {participant.externalName || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {participant.role.replace(/_/g, " ")}
                          {participant.assignedLeg && ` - ${participant.assignedLeg}`}
                        </p>
                      </div>
                      <Badge variant={participant.status === "confirmed" ? "default" : "secondary"}>
                        {participant.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeParticipantMutation.mutate(participant.id)}
                        disabled={removeParticipantMutation.isPending}
                        data-testid={`button-remove-participant-${participant.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No participants added yet
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="flex flex-col h-[500px]">
            {/* Timeline Events */}
            <ScrollArea className="flex-1">
              {isLoadingTimeline ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : timelineData?.events?.length ? (
                <div className="space-y-3 p-2">
                  {timelineData.events.map((event) => {
                    const userName = event.user 
                      ? `${event.user.firstName || ''} ${event.user.lastName || ''}`.trim() 
                      : event.userName || 'System';
                    const initials = userName !== 'System' 
                      ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) 
                      : 'SY';
                    
                    // Comment styling - chat bubble
                    if (event.eventType === 'comment') {
                      return (
                        <div key={event.id} className="flex gap-3" data-testid={`timeline-event-${event.id}`}>
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarImage src={event.user?.profilePictureUrl || undefined} />
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="bg-muted rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{userName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-sm">{event.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // Alert styling - highlighted
                    if (event.eventType === 'alert') {
                      return (
                        <div key={event.id} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid={`timeline-event-${event.id}`}>
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-amber-800 dark:text-amber-200">{event.message}</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              {userName} • {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    
                    // Status change styling - system feed
                    if (event.eventType === 'status_change') {
                      return (
                        <div key={event.id} className="flex items-center gap-2 py-1" data-testid={`timeline-event-${event.id}`}>
                          <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground">{event.message}</span>
                          <span className="text-xs text-muted-foreground/60">
                            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    }
                    
                    // Log styling - small gray text
                    return (
                      <div key={event.id} className="flex items-center gap-2 py-1" data-testid={`timeline-event-${event.id}`}>
                        <History className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{event.message}</span>
                        <span className="text-xs text-muted-foreground/60">
                          {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No activity yet</p>
                  <p className="text-xs mt-1">Add a note to get started</p>
                </div>
              )}
            </ScrollArea>
            
            {/* Add Comment Input */}
            <div className="border-t pt-3 mt-3">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[60px] flex-1"
                  data-testid="input-mission-log-comment"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) {
                      e.preventDefault();
                      addCommentMutation.mutate(newComment.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => newComment.trim() && addCommentMutation.mutate(newComment.trim())}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="self-end"
                  data-testid="button-send-comment"
                >
                  {addCommentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="space-y-4">
            {isLiteTier ? (
              <ProFeatureGate
                title="SMS Notifications"
                description="Upgrade to Pro to send SMS broadcast updates and manage transport subscriber notifications."
                icon={MessageSquare}
              />
            ) : !twilioEnabled ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  SMS messaging is not configured. Go to Settings &gt; Integrations to set up Twilio.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Send Broadcast
                    </h4>
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Type your message to all subscribers..."
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value)}
                        className="min-h-[80px]"
                        maxLength={1600}
                        data-testid="input-sms-broadcast"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {broadcastMessage.length}/1600 characters
                        </p>
                        <Button
                          onClick={handleBroadcast}
                          disabled={!broadcastMessage.trim() || smsSubscribers.length === 0 || broadcastMutation.isPending}
                          className="w-full sm:w-auto"
                          data-testid="button-send-broadcast"
                        >
                          {broadcastMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Send className="h-4 w-4 mr-2" />
                          Send to {smsSubscribers.length} subscriber{smsSubscribers.length !== 1 ? 's' : ''}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      SMS Subscribers
                    </h4>
                    
                    <div className="flex gap-2 mb-4">
                      <Input
                        placeholder="+15551234567"
                        value={newPhoneNumber}
                        onChange={(e) => setNewPhoneNumber(e.target.value)}
                        className="font-mono flex-1"
                        data-testid="input-add-subscriber"
                      />
                      <Button
                        onClick={handleAddSubscriber}
                        disabled={!newPhoneNumber || subscribeMutation.isPending}
                        data-testid="button-add-subscriber"
                      >
                        {subscribeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                      </Button>
                    </div>

                    {smsSubscribers.length > 0 ? (
                      <div className="space-y-2">
                        {smsSubscribers.map((phone) => (
                          <div 
                            key={phone} 
                            className="flex items-center justify-between p-2 rounded-md border"
                            data-testid={`subscriber-${phone}`}
                          >
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{phone}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unsubscribeMutation.mutate(phone)}
                              disabled={unsubscribeMutation.isPending}
                              data-testid={`button-remove-${phone}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No SMS subscribers yet. Add phone numbers above to receive transport updates.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-muted/50 p-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Messages will be prefixed with "iRescue Transport Update:" and sent from your organization's Twilio number.
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PendingTransfersTab({ 
  transfers, 
  isLoading 
}: { 
  transfers: PendingTransfer[];
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const acceptMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const response = await apiRequest(`/api/transport/pending-transfers/${transferId}/accept`, {
        method: 'POST',
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transfer Accepted",
        description: `${data.newAnimal?.name || 'Animal'} has been added to your animals.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/transport/pending-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept transfer",
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: string; reason: string }) => {
      const response = await apiRequest(`/api/transport/pending-transfers/${transferId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Transfer Declined",
        description: "The sender has been notified.",
      });
      setDeclineDialogOpen(false);
      setDeclineReason("");
      setSelectedTransferId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/transport/pending-transfers'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to decline transfer",
        variant: "destructive",
      });
    },
  });

  const handleDecline = (transferId: string) => {
    setSelectedTransferId(transferId);
    setDeclineDialogOpen(true);
  };

  const confirmDecline = () => {
    if (!selectedTransferId || !declineReason.trim()) return;
    declineMutation.mutate({ 
      transferId: selectedTransferId, 
      reason: declineReason 
    });
  };

  const pendingOnly = transfers.filter(t => t.status === 'pending');
  const processedTransfers = transfers.filter(t => t.status !== 'pending');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Download className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">No pending transfers</h3>
        <p className="text-muted-foreground">
          When other organizations send animals your way, they'll appear here for one-click import.
        </p>
      </Card>
    );
  }

  return (
    <>
      {pendingOnly.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Download className="h-5 w-5 text-green-500" />
            Awaiting Your Action ({pendingOnly.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {pendingOnly.map((transfer) => (
              <Card key={transfer.id} data-testid={`card-pending-transfer-${transfer.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PawPrint className="h-5 w-5" />
                      {transfer.animalName}
                    </CardTitle>
                    <Badge variant="default" className="bg-green-500">New</Badge>
                  </div>
                  <CardDescription>
                    From: {transfer.senderOrgName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Species:</span>{" "}
                      {transfer.animalSpecies}
                    </div>
                    {transfer.animalBreed && (
                      <div>
                        <span className="text-muted-foreground">Breed:</span>{" "}
                        {transfer.animalBreed}
                      </div>
                    )}
                    {transfer.animalAge && (
                      <div>
                        <span className="text-muted-foreground">Age:</span>{" "}
                        {transfer.animalAge}
                      </div>
                    )}
                    {transfer.animalGender && (
                      <div>
                        <span className="text-muted-foreground">Gender:</span>{" "}
                        {transfer.animalGender}
                      </div>
                    )}
                  </div>

                  {transfer.transferNotes && (
                    <div className="bg-muted/50 p-3 rounded-md text-sm">
                      <p className="font-medium text-muted-foreground mb-1">Transfer Notes:</p>
                      <p>{transfer.transferNotes}</p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Received: {new Date(transfer.createdAt).toLocaleDateString()}
                    {transfer.expiresAt && (
                      <> · Expires: {new Date(transfer.expiresAt).toLocaleDateString()}</>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => acceptMutation.mutate(transfer.id)}
                    disabled={acceptMutation.isPending}
                    data-testid={`button-accept-transfer-${transfer.id}`}
                  >
                    {acceptMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Accept & Import
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDecline(transfer.id)}
                    disabled={declineMutation.isPending}
                    data-testid={`button-decline-transfer-${transfer.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}

      {processedTransfers.length > 0 && (
        <div className="space-y-4 mt-8">
          <h3 className="text-lg font-semibold text-muted-foreground">
            Processed Transfers ({processedTransfers.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {processedTransfers.map((transfer) => (
              <Card key={transfer.id} className="opacity-75" data-testid={`card-processed-transfer-${transfer.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PawPrint className="h-5 w-5" />
                      {transfer.animalName}
                    </CardTitle>
                    <Badge variant={transfer.status === 'accepted' ? 'default' : 'secondary'}>
                      {transfer.status === 'accepted' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {transfer.status === 'declined' && <XCircle className="h-3 w-3 mr-1" />}
                      {transfer.status.charAt(0).toUpperCase() + transfer.status.slice(1)}
                    </Badge>
                  </div>
                  <CardDescription>
                    From: {transfer.senderOrgName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {transfer.status === 'accepted' && transfer.acceptedAt && (
                      <>Accepted on {new Date(transfer.acceptedAt).toLocaleDateString()}</>
                    )}
                    {transfer.status === 'declined' && transfer.declinedAt && (
                      <>Declined on {new Date(transfer.declinedAt).toLocaleDateString()}</>
                    )}
                    {transfer.declineReason && (
                      <p className="mt-1">Reason: {transfer.declineReason}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Transfer</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining this transfer. The sending organization will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter reason for declining..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-decline-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeclineDialogOpen(false);
                setDeclineReason("");
                setSelectedTransferId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDecline}
              disabled={!declineReason.trim() || declineMutation.isPending}
              data-testid="button-confirm-decline"
            >
              {declineMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Decline Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProFeatureGate({ title, description, icon: Icon }: { title: string; description: string; icon: any }) {
  return (
    <Card className="p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">{description}</p>
      <Badge variant="secondary" data-testid="badge-pro-feature">Pro Feature</Badge>
    </Card>
  );
}

function CollaborationHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("transports");
  const [createTransportOpen, setCreateTransportOpen] = useState(false);
  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<TransportEvent | null>(null);
  const [transportDetailOpen, setTransportDetailOpen] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: { subscriptionTier: string } }>({
    queryKey: ['/api/tenant'],
  });
  const isLiteTier = tenantData?.tenant?.subscriptionTier === 'lite';

  const { data: statsData } = useQuery<{ stats: {
    total: number;
    planning: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    activeAlerts: number;
  } }>({
    queryKey: ['/api/transport/stats'],
  });

  const { data: transportsData, isLoading: transportsLoading } = useQuery<{ transports: TransportEvent[] }>({
    queryKey: ['/api/transport/events'],
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery<{ alerts: TransferAlert[] }>({
    queryKey: ['/api/transport/alerts'],
  });

  const { data: pendingTransfersData, isLoading: pendingLoading } = useQuery<{ transfers: PendingTransfer[] }>({
    queryKey: ['/api/transport/pending-transfers'],
  });

  const pendingTransfers = pendingTransfersData?.transfers || [];
  const pendingCount = pendingTransfers.filter(t => t.status === 'pending').length;

  const stats = statsData?.stats;
  const allTransports = transportsData?.transports || [];
  const activeTransports = allTransports.filter(t => !['completed', 'cancelled'].includes(t.status));
  const historyTransports = allTransports.filter(t => ['completed', 'cancelled'].includes(t.status));
  const alerts = alertsData?.alerts || [];

  const handleTransportClick = (transport: TransportEvent) => {
    setSelectedTransport(transport);
    setTransportDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
              Collaboration Hub
            </h1>
            <p className="text-muted-foreground">
              Coordinate transports and transfers with partner organizations
            </p>
          </div>

          <div className="flex gap-2">
            {!isLiteTier && (
              <Button 
                variant="outline"
                onClick={() => setCreateAlertOpen(true)}
                data-testid="button-create-alert"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                SOS Alert
              </Button>
            )}
            <Button 
              onClick={() => setCreateTransportOpen(true)}
              data-testid="button-create-transport"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Transport
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">Total Transports</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.planning}</div>
                <p className="text-xs text-muted-foreground">Planning</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.confirmed}</div>
                <p className="text-xs text-muted-foreground">Confirmed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.inProgress}</div>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card className={stats.activeAlerts > 0 ? "border-orange-300 dark:border-orange-700" : ""}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold flex items-center gap-2">
                  {stats.activeAlerts}
                  {stats.activeAlerts > 0 && <Bell className="h-4 w-4 text-orange-500" />}
                </div>
                <p className="text-xs text-muted-foreground">Active Alerts</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="w-full overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto min-w-full">
              <TabsTrigger value="transports" data-testid="tab-transports">
                <Truck className="mr-2 h-4 w-4" />
                Transports
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending-transfers">
                <Download className="mr-2 h-4 w-4" />
                Pending Transfers
                {pendingCount > 0 && (
                  <Badge variant="default" className="ml-2 bg-green-500 hover:bg-green-500">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="alerts" data-testid="tab-alerts">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Transfer Alerts
                {alerts.filter(a => a.status === 'active').length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {alerts.filter(a => a.status === 'active').length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                <History className="mr-2 h-4 w-4" />
                History
                {historyTransports.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {historyTransports.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="process" data-testid="tab-process-guide">
                <Info className="mr-2 h-4 w-4" />
                Process Guide
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="transports" className="space-y-4">
            {transportsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activeTransports.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeTransports.map((transport) => (
                  <TransportCard 
                    key={transport.id} 
                    transport={transport}
                    onClick={() => handleTransportClick(transport)}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No active transports</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first transport to start coordinating with partner organizations
                </p>
                <Button onClick={() => setCreateTransportOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Transport
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <PendingTransfersTab 
              transfers={pendingTransfers}
              isLoading={pendingLoading}
            />
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {isLiteTier ? (
              <ProFeatureGate
                title="Transfer Alerts"
                description="Upgrade to Pro to send SOS alerts and coordinate emergency transfers with partner organizations."
                icon={AlertTriangle}
              />
            ) : alertsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : alerts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {alerts.map((alert) => (
                  <AlertCard 
                    key={alert.id} 
                    alert={alert}
                    onClick={() => {}}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No alerts</h3>
                <p className="text-muted-foreground mb-4">
                  Create an SOS alert when you need help from partner organizations
                </p>
                <Button onClick={() => setCreateAlertOpen(true)}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Create SOS Alert
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {transportsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : historyTransports.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {historyTransports.map((transport) => (
                  <TransportCard 
                    key={transport.id} 
                    transport={transport}
                    onClick={() => handleTransportClick(transport)}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No transport history</h3>
                <p className="text-muted-foreground mb-4">
                  Completed and cancelled transports will appear here
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="process" className="space-y-6" data-testid="content-process-guide">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Transport & Collaboration Process
                </CardTitle>
                <CardDescription>
                  A visual guide to the transport coordination workflow from start to finish
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">

                {/* Main Transport Flow */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Transport Lifecycle</h3>
                  <div className="flex flex-col items-center gap-0">

                    {/* Step 1 - Create */}
                    <div className="flex items-center gap-4 w-full max-w-2xl">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">1</div>
                      <Card className="flex-1">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-1">
                            <Plus className="h-4 w-4 text-primary" />
                            <span className="font-semibold">Create Transport</span>
                            <Badge variant="secondary">Planning</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground ml-7">
                            Set transport name, type (outbound/inbound/relay/internal), origin &amp; destination, departure date, partner organization, and vehicle/driver info.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="w-10 flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

                    {/* Step 2 - Build Manifest */}
                    <div className="flex items-center gap-4 w-full max-w-2xl">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">2</div>
                      <Card className="flex-1">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-1">
                            <Clipboard className="h-4 w-4 text-primary" />
                            <span className="font-semibold">Build Manifest &amp; Route</span>
                          </div>
                          <p className="text-sm text-muted-foreground ml-7">
                            Add animals to the manifest with their destination org. Define route stops (origin, pickups, handoffs, dropoffs, destination) with estimated times and leg drivers.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="w-10 flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

                    {/* Step 3 - Add Participants */}
                    <div className="flex items-center gap-4 w-full max-w-2xl">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">3</div>
                      <Card className="flex-1">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-1">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="font-semibold">Assign Participants</span>
                          </div>
                          <p className="text-sm text-muted-foreground ml-7">
                            Add coordinators, drivers, volunteers, foster pickups/dropoffs, and vets. Participants can be internal users, contacts, or external people. Each gets a role and optional leg assignment.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="w-10 flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

                    {/* Step 4 - Confirm */}
                    <div className="flex items-center gap-4 w-full max-w-2xl">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-bold text-sm">4</div>
                      <Card className="flex-1">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-1">
                            <Shield className="h-4 w-4 text-blue-500" />
                            <span className="font-semibold">Confirm Transport</span>
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 no-default-hover-elevate no-default-active-elevate">Confirmed</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground ml-7">
                            Lock in the plan. Notify participants, set up SMS subscribers for live updates, and optionally generate a shareable run sheet link for drivers.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="w-10 flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

                    {/* Step 5 - Active Mode */}
                    <div className="flex items-center gap-4 w-full max-w-2xl">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 dark:bg-orange-600 flex items-center justify-center text-white font-bold text-sm">5</div>
                      <Card className="flex-1">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-1">
                            <Play className="h-4 w-4 text-orange-500" />
                            <span className="font-semibold">Start Transport &amp; Active Mode</span>
                            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 no-default-hover-elevate no-default-active-elevate">In Progress</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground ml-7">
                            Transport is on the road. Use Active Mode to mark stops as arrived/departed, capture signatures at delivery, send live GPS &amp; ETA updates, post timeline comments, and broadcast SMS alerts.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="w-10 flex justify-center"><ChevronDown className="h-5 w-5 text-muted-foreground" /></div>

                    {/* Branch: Complete or Cancel */}
                    <div className="flex flex-col sm:flex-row items-stretch gap-4 w-full max-w-2xl">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 dark:bg-green-600 flex items-center justify-center text-white font-bold text-sm">6a</div>
                        <Card className="flex-1 border-green-200 dark:border-green-800">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3 mb-1">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="font-semibold">Complete</span>
                            </div>
                            <p className="text-sm text-muted-foreground ml-7">
                              All animals delivered. Optionally add completion notes. Actual arrival date is recorded.
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 dark:bg-red-600 flex items-center justify-center text-white font-bold text-sm">6b</div>
                        <Card className="flex-1 border-red-200 dark:border-red-800">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3 mb-1">
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="font-semibold">Cancel</span>
                            </div>
                            <p className="text-sm text-muted-foreground ml-7">
                              Transport cancelled. A reason is required and logged to the timeline for records.
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Status Transitions Quick Reference */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Status Transitions</h3>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">Planning</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 no-default-hover-elevate no-default-active-elevate">Confirmed</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 no-default-hover-elevate no-default-active-elevate">In Progress</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 no-default-hover-elevate no-default-active-elevate">Completed</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    A transport can be cancelled from any active status (Planning, Confirmed, or In Progress)
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Transfer Alerts Flow */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Transfer Alert Flow</h3>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                        <p className="font-medium text-sm">Broadcast Alert</p>
                        <p className="text-xs text-muted-foreground mt-1">Send an urgent capacity, transport, foster, or medical emergency request</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Bell className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                        <p className="font-medium text-sm">Receive Responses</p>
                        <p className="text-xs text-muted-foreground mt-1">Partner rescues reply with how many animals they can accept and transport availability</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Truck className="h-6 w-6 mx-auto mb-2 text-primary" />
                        <p className="font-medium text-sm">Create Transport</p>
                        <p className="text-xs text-muted-foreground mt-1">Coordinate a transport based on confirmed responses from partner organizations</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                        <p className="font-medium text-sm">Resolve Alert</p>
                        <p className="text-xs text-muted-foreground mt-1">Mark the alert as resolved once animals are placed or the need is met</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Transport Detail Tabs Reference */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Transport Detail Sections</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Details</p>
                        <p className="text-xs text-muted-foreground">Transport info, route, partner org, vehicle &amp; driver, schedule, and status controls</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <Package className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Manifest</p>
                        <p className="text-xs text-muted-foreground">Animals on the transport with their origin/destination orgs and special needs</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <Users className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Participants</p>
                        <p className="text-xs text-muted-foreground">Coordinators, drivers, volunteers, fosters, and vets assigned to this transport</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Timeline</p>
                        <p className="text-xs text-muted-foreground">Activity log with comments, status changes, alerts, GPS updates, and photos</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <MessageSquare className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">SMS</p>
                        <p className="text-xs text-muted-foreground">Manage phone subscribers who receive live transport updates via text message</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <Navigation className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Active Mode</p>
                        <p className="text-xs text-muted-foreground">Real-time stop tracking with arrival/departure logging, signature capture, and delivery proof</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Participant Roles */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Participant Roles</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { role: "Coordinator", desc: "Organizes and oversees the entire transport" },
                      { role: "Driver", desc: "Drives a leg of the transport route" },
                      { role: "Volunteer", desc: "Assists with loading, unloading, and animal care" },
                      { role: "Foster Pickup", desc: "Picks up animals from a foster home for transport" },
                      { role: "Foster Dropoff", desc: "Receives animals from transport into foster care" },
                      { role: "Vet", desc: "Provides health checks or medical clearance for the animals" },
                    ].map((item) => (
                      <div key={item.role} className="flex items-center gap-3 p-2 rounded-md">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <span className="font-medium text-sm">{item.role}</span>
                          <span className="text-xs text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t" />

                {/* Stop Types */}
                <div>
                  <h3 className="font-semibold text-base mb-4">Route Stop Types</h3>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { type: "Origin", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
                      { type: "Pickup", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
                      { type: "Handoff", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
                      { type: "Dropoff", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
                      { type: "Rest", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
                      { type: "Fuel", color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
                      { type: "Destination", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
                    ].map((item) => (
                      <Badge key={item.type} className={`${item.color} no-default-hover-elevate no-default-active-elevate`}>{item.type}</Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Each stop can have its own leg driver, estimated arrival/departure times, and destination contact info. In Active Mode, stops can be marked arrived/departed with signature capture.
                  </p>
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <CreateTransportDialog
          open={createTransportOpen}
          onOpenChange={setCreateTransportOpen}
          onSuccess={() => {}}
        />

        <CreateAlertDialog
          open={createAlertOpen}
          onOpenChange={setCreateAlertOpen}
          onSuccess={() => {}}
        />

        <TransportDetailDialog
          transport={selectedTransport}
          open={transportDetailOpen}
          onOpenChange={setTransportDetailOpen}
        />
      </div>
    </DashboardLayout>
  );
}

export default CollaborationHubPage;
