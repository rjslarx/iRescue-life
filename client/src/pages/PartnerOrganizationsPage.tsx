import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Search, Plus, Building2, Mail, Phone, MapPin, Globe, MoreHorizontal, Pencil, Archive, RotateCcw, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface PartnerOrganization {
  id: string;
  name: string;
  organizationType: "rescue" | "sanctuary" | "shelter" | "foster_network" | "other" | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  website: string | null;
  notes: string | null;
  totalTransfersTo: number;
  totalTransfersFrom: number;
  lastTransferDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const orgFormSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  organizationType: z.enum(["rescue", "sanctuary", "shelter", "foster_network", "other"]).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type OrgFormData = z.infer<typeof orgFormSchema>;

const orgTypeLabels: Record<string, string> = {
  rescue: "Rescue",
  sanctuary: "Sanctuary",
  shelter: "Shelter",
  foster_network: "Foster Network",
  other: "Other",
};

export default function PartnerOrganizationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<PartnerOrganization | null>(null);

  const form = useForm<OrgFormData>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: {
      name: "",
      organizationType: "rescue",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      website: "",
      notes: "",
    },
  });

  const { data, isLoading } = useQuery<{ organizations: PartnerOrganization[] }>({
    queryKey: ['/api/partner-organizations', showArchived],
    queryFn: async () => {
      const response = await fetch(`/api/partner-organizations?includeArchived=${showArchived}`, {
        credentials: 'include',
      });
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: OrgFormData) => {
      const response = await apiRequest('POST', '/api/partner-organizations', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partner-organizations'] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Organization added",
        description: "Partner organization has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OrgFormData> }) => {
      const response = await apiRequest('PATCH', `/api/partner-organizations/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partner-organizations'] });
      setDialogOpen(false);
      setEditingOrg(null);
      form.reset();
      toast({
        title: "Organization updated",
        description: "Partner organization has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/partner-organizations/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partner-organizations'] });
      toast({
        title: "Organization archived",
        description: "Partner organization has been archived.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to archive organization",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/partner-organizations/${id}`, { isActive: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/partner-organizations'] });
      toast({
        title: "Organization restored",
        description: "Partner organization has been restored.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore organization",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (org?: PartnerOrganization) => {
    if (org) {
      setEditingOrg(org);
      form.reset({
        name: org.name,
        organizationType: org.organizationType || "rescue",
        contactName: org.contactName || "",
        contactEmail: org.contactEmail || "",
        contactPhone: org.contactPhone || "",
        address: org.address || "",
        city: org.city || "",
        state: org.state || "",
        zipCode: org.zipCode || "",
        website: org.website || "",
        notes: org.notes || "",
      });
    } else {
      setEditingOrg(null);
      form.reset();
    }
    setDialogOpen(true);
  };

  const onSubmit = (data: OrgFormData) => {
    const cleanData = {
      ...data,
      contactEmail: data.contactEmail || undefined,
    };
    
    if (editingOrg) {
      updateMutation.mutate({ id: editingOrg.id, data: cleanData });
    } else {
      createMutation.mutate(cleanData);
    }
  };

  const organizations = data?.organizations || [];
  
  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = 
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.state?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "all" || org.organizationType === typeFilter;
    
    return matchesSearch && matchesType;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Partner Organizations</h1>
            <p className="text-muted-foreground">
              Manage rescue partners, sanctuaries, and transfer destinations
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()} data-testid="button-add-partner">
            <Plus className="h-4 w-4 mr-2" />
            Add Partner
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search organizations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-partners"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40" data-testid="select-type-filter">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="rescue">Rescue</SelectItem>
                    <SelectItem value="sanctuary">Sanctuary</SelectItem>
                    <SelectItem value="shelter">Shelter</SelectItem>
                    <SelectItem value="foster_network">Foster Network</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  data-testid="switch-show-archived"
                />
                <Label htmlFor="show-archived" className="text-sm">Show archived</Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-1">No partner organizations</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || typeFilter !== "all" 
                    ? "No organizations match your filters" 
                    : "Add your first transfer partner to get started"}
                </p>
                {!searchQuery && typeFilter === "all" && (
                  <Button variant="outline" onClick={() => handleOpenDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Partner
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-center">Transfers</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrgs.map((org) => (
                    <TableRow 
                      key={org.id} 
                      className={!org.isActive ? "opacity-50" : ""}
                      data-testid={`row-partner-${org.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{org.name}</div>
                            {org.website && (
                              <a 
                                href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <Globe className="h-3 w-3" />
                                Website
                              </a>
                            )}
                          </div>
                          {!org.isActive && (
                            <Badge variant="secondary">Archived</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {org.organizationType ? orgTypeLabels[org.organizationType] : "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {org.contactName && (
                            <div className="text-sm">{org.contactName}</div>
                          )}
                          {org.contactEmail && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {org.contactEmail}
                            </div>
                          )}
                          {org.contactPhone && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {org.contactPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(org.city || org.state) ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {[org.city, org.state].filter(Boolean).join(", ")}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm" title="Transfers to this org">
                            <ArrowUpDown className="h-3 w-3 inline mr-1" />
                            {org.totalTransfersTo}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${org.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDialog(org)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {org.isActive ? (
                              <DropdownMenuItem 
                                onClick={() => archiveMutation.mutate(org.id)}
                                className="text-destructive"
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => restoreMutation.mutate(org.id)}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrg ? "Edit Partner Organization" : "Add Partner Organization"}
              </DialogTitle>
              <DialogDescription>
                {editingOrg 
                  ? "Update the partner organization details" 
                  : "Add a new rescue, sanctuary, or transfer destination"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Organization Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Big Sky Sanctuary" 
                            {...field} 
                            data-testid="input-org-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="organizationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-org-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="rescue">Rescue</SelectItem>
                            <SelectItem value="sanctuary">Sanctuary</SelectItem>
                            <SelectItem value="shelter">Shelter</SelectItem>
                            <SelectItem value="foster_network">Foster Network</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.org" 
                            {...field} 
                            data-testid="input-org-website"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">Contact Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="contactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Jane Smith" 
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email"
                              placeholder="contact@example.org" 
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
                          <FormLabel>Phone</FormLabel>
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
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">Address</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Rescue Lane" 
                              {...field} 
                              data-testid="input-org-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Denver" 
                              {...field} 
                              data-testid="input-org-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="CO" 
                                {...field} 
                                data-testid="input-org-state"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="80202" 
                                {...field} 
                                data-testid="input-org-zip"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Any notes about this partner (specialties, requirements, etc.)" 
                          {...field} 
                          data-testid="input-org-notes"
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
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-org"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingOrg ? "Save Changes" : "Add Organization"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
