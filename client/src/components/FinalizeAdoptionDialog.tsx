import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { Loader2, Send, Link as LinkIcon, X, CheckCircle2, FileText, Star, Download, Mail, ChevronsUpDown, Check, UserPlus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Animal, Application, Grant, Tenant } from "@shared/schema";

interface ContractTemplate {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  version: string;
}

const formSchema = z.object({
  applicationId: z.string().min(1, "Please select an adopter"),
  baseFee: z.string().min(1, "Adoption fee is required"),
  donationBoost: z.string().optional(),
  grantId: z.string().optional(),
  contractTemplateId: z.string().optional(),
  coverFees: z.boolean().default(false),
  isFeeWaived: z.boolean().default(false),
  feeWaiverReason: z.string().optional(),
}).refine(
  (data) => !data.isFeeWaived || (data.feeWaiverReason && data.feeWaiverReason.trim().length > 0),
  { message: "Please provide a reason for waiving the fee", path: ["feeWaiverReason"] }
);

type FormData = z.infer<typeof formSchema>;

interface FinalizeAdoptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
}

export function FinalizeAdoptionDialog({ open, onOpenChange, animal }: FinalizeAdoptionDialogProps) {
  const { toast } = useToast();
  const { basePath } = useTenant();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [sessionCreated, setSessionCreated] = useState(false);
  const [downloadingPacket, setDownloadingPacket] = useState(false);
  const [emailingPacket, setEmailingPacket] = useState(false);
  const [bypassMode, setBypassMode] = useState(false);
  const [bypassComboOpen, setBypassComboOpen] = useState(false);
  const [bypassSearch, setBypassSearch] = useState("");
  const [originalFee, setOriginalFee] = useState(animal.adoptionFee || "200");

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: applicationsData, isLoading: loadingApplications } = useQuery<{ applications: Application[] }>({
    queryKey: ['/api/applications', { animalId: animal.id }],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/applications?animalId=${animal.id}`);
      return res.json();
    },
    enabled: open,
  });

  const { data: allApprovedData, isLoading: loadingAllApproved } = useQuery<{ applications: Application[] }>({
    queryKey: ['/api/applications', { stage: 'approved,adopted' }],
    queryFn: async () => {
      const [approvedRes, adoptedRes] = await Promise.all([
        apiRequest('GET', '/api/applications?stage=approved'),
        apiRequest('GET', '/api/applications?stage=adopted'),
      ]);
      const [approvedData, adoptedData] = await Promise.all([approvedRes.json(), adoptedRes.json()]);
      const seen = new Set<string>();
      const combined: Application[] = [];
      for (const app of [...(approvedData.applications || []), ...(adoptedData.applications || [])]) {
        const key = app.applicantEmail?.toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(app);
        }
      }
      return { applications: combined };
    },
    enabled: open && bypassMode,
  });

  const { data: grantsData } = useQuery<{ grants: Grant[] }>({
    queryKey: ['/api/grants'],
    enabled: open,
  });

  const { data: contractTemplatesData } = useQuery<{ templates: ContractTemplate[] }>({
    queryKey: ['/api/contract-templates'],
    enabled: open,
  });

  const contractTemplates = contractTemplatesData?.templates || [];
  const defaultTemplate = contractTemplates.find(t => t.isDefault);

  const approvedApplications = applicationsData?.applications.filter(
    app => app.stage === 'approved'
  ) || [];

  const allApprovedApplications = useMemo(() => {
    const apps = allApprovedData?.applications || [];
    const thisAnimalAppIds = new Set(approvedApplications.map(a => a.id));
    return apps.filter(a => !thisAnimalAppIds.has(a.id));
  }, [allApprovedData, approvedApplications]);

  const filteredBypassApplicants = useMemo(() => {
    if (!bypassSearch.trim()) return allApprovedApplications;
    const search = bypassSearch.toLowerCase();
    return allApprovedApplications.filter(
      app => app.applicantName.toLowerCase().includes(search) || app.applicantEmail.toLowerCase().includes(search)
    );
  }, [allApprovedApplications, bypassSearch]);

  const activeGrants = grantsData?.grants.filter(
    grant => grant.status === 'active'
  ) || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      applicationId: "",
      baseFee: animal.adoptionFee || "200",
      donationBoost: "0",
      contractTemplateId: "",
      coverFees: false,
      isFeeWaived: false,
      feeWaiverReason: "",
    },
  });

  useEffect(() => {
    if (open && defaultTemplate && !form.getValues('contractTemplateId')) {
      form.setValue('contractTemplateId', defaultTemplate.id.toString());
    }
  }, [open, defaultTemplate, form]);

  useEffect(() => {
    if (open && animal.adoptionFee) {
      form.setValue("baseFee", animal.adoptionFee);
    }
  }, [open, animal.adoptionFee, form]);

  const selectedGrantId = form.watch("grantId");
  const baseFee = form.watch("baseFee");
  const isFeeWaived = form.watch("isFeeWaived");

  const selectedGrant = activeGrants.find(g => g.id === selectedGrantId);

  useEffect(() => {
    if (selectedGrant && baseFee) {
      const baseFeeNum = parseFloat(baseFee);
      const waiverAmount = parseFloat(selectedGrant.waiverAmount || "0");
      const newFee = Math.max(0, baseFeeNum - waiverAmount);
      form.setValue("baseFee", newFee.toFixed(2));
    }
  }, [selectedGrantId]);

  useEffect(() => {
    if (isFeeWaived) {
      const currentFee = form.getValues("baseFee");
      if (currentFee !== "0" && currentFee !== "0.00") {
        setOriginalFee(currentFee);
      }
      form.setValue("baseFee", "0");
    } else {
      form.setValue("baseFee", originalFee);
    }
  }, [isFeeWaived]);

  const [bypassAdopterName, setBypassAdopterName] = useState<string | null>(null);

  const createBypassApplicationMutation = useMutation({
    mutationFn: async (sourceApplication: Application) => {
      const response = await apiRequest('POST', '/api/applications', {
        animalId: animal.id,
        applicantName: sourceApplication.applicantName,
        applicantEmail: sourceApplication.applicantEmail,
        applicantPhone: sourceApplication.applicantPhone,
        stage: 'approved',
        notes: `Fast-tracked from approved application for another animal (source: ${sourceApplication.id})`,
        isBypass: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const newApp = data.application;
      queryClient.invalidateQueries({ queryKey: ['/api/applications', { animalId: animal.id }] });
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      form.setValue("applicationId", newApp.id);
      setBypassAdopterName(newApp.applicantName || null);
      toast({
        title: "Adopter linked",
        description: `${newApp.applicantName} has been linked to ${animal.name}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create bypass application",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest('POST', '/api/adoptions/checkouts', data);
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session.id);
      setCheckoutToken(data.token);
      setSessionCreated(true);
      queryClient.invalidateQueries({ queryKey: ['/api/adoptions/checkouts'] });
      toast({
        title: "Checkout session created",
        description: "Ready to send checkout link to the adopter",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create checkout session",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const [sendMethod, setSendMethod] = useState<'sms' | 'email'>('sms');

  const sendLinkMutation = useMutation({
    mutationFn: async ({ sessionId, method }: { sessionId: string; method: 'email' | 'sms' }) => {
      const response = await apiRequest('POST', `/api/adoptions/checkouts/${sessionId}/send-link`, { method });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Checkout link sent!",
        description: variables.method === 'sms'
          ? "The adopter will receive a text message with the checkout link"
          : "The adopter will receive an email with the checkout link",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send link",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('DELETE', `/api/adoptions/checkouts/${sessionId}`);
      return response.json();
    },
    onSuccess: () => {
      setSessionId(null);
      setCheckoutToken(null);
      setSessionCreated(false);
      setBypassAdopterName(null);
      toast({
        title: "Session cancelled",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel session",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: FormData) => {
    createSessionMutation.mutate({
      ...data,
      animalId: animal.id,
    } as any);
  };

  const handleSendLink = (method?: 'sms' | 'email') => {
    if (sessionId) {
      const m = method || sendMethod;
      setSendMethod(m);
      sendLinkMutation.mutate({ sessionId, method: m });
    }
  };

  const handleCancel = () => {
    if (sessionId) {
      cancelSessionMutation.mutate(sessionId);
    } else {
      onOpenChange(false);
    }
  };

  const copyLinkToClipboard = () => {
    if (checkoutToken) {
      const link = `${window.location.origin}${basePath}/adoption-checkout/${checkoutToken}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Link copied!",
        description: "Checkout link has been copied to clipboard",
      });
    }
  };

  const handleDownloadPacket = async () => {
    setDownloadingPacket(true);
    try {
      const response = await fetch(`/api/animals/${animal.id}/adoption-packet/download`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to generate vaccination record');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaccination-record-${animal.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Vaccination record PDF downloaded successfully" });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message || "Please try again", variant: "destructive" });
    } finally {
      setDownloadingPacket(false);
    }
  };

  const handleEmailPacket = async () => {
    const selectedApp = approvedApplications.find(app => app.id === form.getValues('applicationId'));
    if (!selectedApp?.applicantEmail) {
      toast({ title: "No email address", description: "Could not determine adopter email", variant: "destructive" });
      return;
    }
    setEmailingPacket(true);
    try {
      await apiRequest('POST', `/api/animals/${animal.id}/adoption-packet/email`, {
        email: selectedApp.applicantEmail,
        recipientName: selectedApp.applicantName,
      });
      toast({ title: "Sent", description: `Vaccination record emailed to ${selectedApp.applicantEmail}` });
    } catch (error: any) {
      toast({ title: "Email failed", description: error.message || "Please try again", variant: "destructive" });
    } finally {
      setEmailingPacket(false);
    }
  };

  const selectedApplicationId = form.watch('applicationId');
  const hasSelectedApplication = !!selectedApplicationId;

  const selectedAdopterName = useMemo(() => {
    if (!selectedApplicationId) return null;
    const fromApproved = approvedApplications.find(a => a.id === selectedApplicationId);
    if (fromApproved) return fromApproved.applicantName;
    return bypassAdopterName;
  }, [selectedApplicationId, approvedApplications, bypassAdopterName]);

  const adopterPhone = useMemo(() => {
    if (!selectedApplicationId) return null;
    const app = approvedApplications.find(a => a.id === selectedApplicationId);
    return app?.applicantPhone || null;
  }, [selectedApplicationId, approvedApplications]);

  if (loadingApplications) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="dialog-finalize-adoption" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Finalize Adoption</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (approvedApplications.length === 0 && !bypassMode && !hasSelectedApplication) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="dialog-finalize-adoption">
          <DialogHeader>
            <DialogTitle>No Approved Applications</DialogTitle>
            <DialogDescription>
              There are no approved applications for {animal.name}. You can approve an application first, or use the bypass option below to select an existing approved adopter.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setBypassMode(true)}
              data-testid="button-bypass-application"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Select Existing Approved Adopter
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} data-testid="button-close">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-finalize-adoption">
        <DialogHeader>
          <DialogTitle>Finalize Adoption: {animal.name}</DialogTitle>
          <DialogDescription>
            Create a secure checkout session for the approved adopter
          </DialogDescription>
        </DialogHeader>

        {!sessionCreated ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {approvedApplications.length > 0 && (
                <FormField
                  control={form.control}
                  name="applicationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Approved Adopter *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-adopter">
                            <SelectValue placeholder="Choose an adopter" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {approvedApplications.map((app) => (
                            <SelectItem key={app.id} value={app.id}>
                              {app.applicantName} ({app.applicantEmail})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Bypass Application</span>
                  <Button
                    type="button"
                    variant={bypassMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setBypassMode(!bypassMode);
                      if (bypassMode) {
                        setBypassSearch("");
                      }
                    }}
                    data-testid="button-toggle-bypass"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {bypassMode ? "Bypass Active" : "Select Existing Adopter"}
                  </Button>
                </div>
                {bypassMode && (
                  <div className="space-y-2">
                    <Popover open={bypassComboOpen} onOpenChange={setBypassComboOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={bypassComboOpen}
                          className="w-full justify-between font-normal"
                          data-testid="combobox-bypass-adopter"
                        >
                          {form.getValues("applicationId") && bypassMode
                            ? (() => {
                                const allApps = [...approvedApplications, ...allApprovedApplications];
                                const selected = allApps.find(a => a.id === form.getValues("applicationId"));
                                return selected ? `${selected.applicantName} (${selected.applicantEmail})` : "Search approved adopters...";
                              })()
                            : "Search approved adopters..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search by name or email..."
                            value={bypassSearch}
                            onValueChange={setBypassSearch}
                            data-testid="input-bypass-search"
                          />
                          <CommandList>
                            {loadingAllApproved ? (
                              <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : (
                              <>
                                <CommandEmpty>No approved adopters found.</CommandEmpty>
                                <CommandGroup>
                                  {filteredBypassApplicants.map((app) => (
                                    <CommandItem
                                      key={app.id}
                                      value={app.id}
                                      onSelect={() => {
                                        createBypassApplicationMutation.mutate(app);
                                        setBypassComboOpen(false);
                                      }}
                                      data-testid={`bypass-adopter-${app.id}`}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          form.getValues("applicationId") === app.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col">
                                        <span>{app.applicantName}</span>
                                        <span className="text-xs text-muted-foreground">{app.applicantEmail}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {createBypassApplicationMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Linking adopter to {animal.name}...
                      </div>
                    )}
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="baseFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adoption Fee *</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="200.00"
                          disabled={isFeeWaived}
                          {...field}
                          data-testid="input-adoption-fee"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {isFeeWaived
                        ? "Fee has been waived — $0.00"
                        : animal.adoptionFee 
                          ? `Pre-filled from ${animal.name}'s configured adoption fee`
                          : `Base adoption fee for ${animal.name}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFeeWaived"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Waive Adoption Fee ($0.00)</FormLabel>
                      <FormDescription>
                        Toggle to waive the entire adoption fee
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-waive-fee"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {isFeeWaived && (
                <FormField
                  control={form.control}
                  name="feeWaiverReason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Waiver Reason *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g., "Compassionate Transfer", "Clear the Shelter Event"'
                          {...field}
                          data-testid="input-fee-waiver-reason"
                        />
                      </FormControl>
                      <FormDescription>
                        Required: explain why this fee is being waived
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {activeGrants.length > 0 && (
                <FormField
                  control={form.control}
                  name="grantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subsidized Adoption (Optional)</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-grant">
                            <SelectValue placeholder="Select a grant (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No grant</SelectItem>
                          {activeGrants.map((grant) => (
                            <SelectItem key={grant.id} value={grant.id}>
                              {grant.name} (Waives ${grant.waiverAmount})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Apply a grant to reduce the adoption fee
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedGrant && (
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Original Fee:</span>
                        <span className="line-through text-muted-foreground">
                          ${(parseFloat(baseFee) + parseFloat(selectedGrant.waiverAmount || "0")).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Grant Waiver:</span>
                        <span className="text-green-600 dark:text-green-400">
                          -${selectedGrant.waiverAmount}
                        </span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>New Fee:</span>
                        <span>${baseFee}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {contractTemplates.length > 0 && (
                <FormField
                  control={form.control}
                  name="contractTemplateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Adoption Contract Template
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contract-template">
                            <SelectValue placeholder="Select a contract template (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {contractTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              <div className="flex items-center gap-2">
                                {template.name}
                                {template.isDefault && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Star className="h-2 w-2 mr-1" />
                                    Default
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The adopter will be asked to sign this contract during checkout
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isFeeWaived && hasSelectedApplication && (
                <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 text-sm">Fast-Track Summary</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {selectedAdopterName || "Selected adopter"} will receive a contract to sign. Since the fee is waived, the adoption will complete automatically after signing — no payment step.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={createSessionMutation.isPending}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createSessionMutation.isPending}
                  data-testid="button-create-session"
                >
                  {createSessionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isFeeWaived ? "Processing..." : "Creating..."}
                    </>
                  ) : isFeeWaived ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Fast-Track Adoption (Fee Waived)
                    </>
                  ) : (
                    <>Create Checkout Session</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900 dark:text-green-100">
                      Checkout Session Created
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Send the checkout link to the adopter to complete the adoption
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {checkoutToken && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Checkout Link:</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}${basePath}/adoption-checkout/${checkoutToken}`}
                        className="font-mono text-xs"
                        data-testid="input-checkout-link"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={copyLinkToClipboard}
                        data-testid="button-copy-link"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-medium mb-3">Vaccination Record</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Download or email {animal.name}'s official vaccination and preventative care record.
                  This will also be automatically included in the adoption confirmation email.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadPacket}
                    disabled={downloadingPacket}
                    data-testid="button-download-vaccination-record"
                  >
                    {downloadingPacket ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleEmailPacket}
                    disabled={emailingPacket}
                    data-testid="button-email-vaccination-record"
                  >
                    {emailingPacket ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Email to Adopter
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <h4 className="text-sm font-medium mb-3">Send Checkout Link</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => handleSendLink('sms')}
                    disabled={sendLinkMutation.isPending || !adopterPhone}
                    data-testid="button-send-sms"
                  >
                    {sendLinkMutation.isPending && sendMethod === 'sms' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Send via SMS
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSendLink('email')}
                    disabled={sendLinkMutation.isPending}
                    data-testid="button-send-email"
                  >
                    {sendLinkMutation.isPending && sendMethod === 'email' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send via Email
                      </>
                    )}
                  </Button>
                </div>
                {adopterPhone ? (
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-adopter-phone">
                    SMS will be sent to {adopterPhone}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    No phone number on file — use email instead
                  </p>
                )}
              </CardContent>
            </Card>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={cancelSessionMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-cancel-session"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel Session
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
