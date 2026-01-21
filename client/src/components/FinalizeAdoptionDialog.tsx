import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { Loader2, Send, Link as LinkIcon, X, CheckCircle2, FileText, Star, Heart } from "lucide-react";
import type { Animal, Application, Grant, Tenant } from "@shared/schema";
import { HealthPlanProposalModal } from "./HealthPlanProposalModal";

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
  vetAppointmentDate: z.string().optional(),
  spayNeuterDate: z.string().optional(),
});

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
  const [showHealthPlanModal, setShowHealthPlanModal] = useState(false);
  const [selectedAdopterId, setSelectedAdopterId] = useState<string | null>(null);
  const [selectedAdopterName, setSelectedAdopterName] = useState<string>("");

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: applicationsData, isLoading: loadingApplications } = useQuery<{ applications: Application[] }>({
    queryKey: ['/api/animals', animal.id, 'applications'],
    enabled: open,
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

  const activeGrants = grantsData?.grants.filter(
    grant => grant.status === 'active'
  ) || [];

  // Check if animal is already spayed/neutered
  const isAlreadyAltered = animal.neuterStatus === 'spayed' || animal.neuterStatus === 'neutered';
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      applicationId: "",
      baseFee: animal.adoptionFee || "200",
      donationBoost: "0",
      contractTemplateId: "",
      coverFees: false,
      vetAppointmentDate: animal.nextVaccinationDue 
        ? new Date(animal.nextVaccinationDue).toISOString().split('T')[0] 
        : "",
      spayNeuterDate: "",
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

  // Reset date fields when dialog opens or animal changes
  useEffect(() => {
    if (open) {
      // Reset vetAppointmentDate from animal's nextVaccinationDue
      const vetDate = animal.nextVaccinationDue 
        ? new Date(animal.nextVaccinationDue).toISOString().split('T')[0] 
        : "";
      form.setValue("vetAppointmentDate", vetDate);
      
      // Reset spayNeuterDate
      form.setValue("spayNeuterDate", "");
    }
  }, [open, animal.id, animal.nextVaccinationDue, form]);

  const selectedGrantId = form.watch("grantId");
  const baseFee = form.watch("baseFee");

  const selectedGrant = activeGrants.find(g => g.id === selectedGrantId);

  useEffect(() => {
    if (selectedGrant && baseFee) {
      const baseFeeNum = parseFloat(baseFee);
      const waiverAmount = parseFloat(selectedGrant.waiverAmount || "0");
      const newFee = Math.max(0, baseFeeNum - waiverAmount);
      form.setValue("baseFee", newFee.toFixed(2));
    }
  }, [selectedGrantId]);

  const createSessionMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest('POST', '/api/adoptions/checkouts', data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      setSessionId(data.session.id);
      setCheckoutToken(data.token);
      setSessionCreated(true);
      
      const selectedApp = approvedApplications.find(a => a.id === variables.applicationId);
      if (selectedApp) {
        setSelectedAdopterName(selectedApp.applicantName);
        if (data.session.adopterContactId) {
          setSelectedAdopterId(data.session.adopterContactId);
        }
      }
      
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

  const sendLinkMutation = useMutation({
    mutationFn: async ({ sessionId, method }: { sessionId: string; method: 'email' | 'sms' }) => {
      const response = await apiRequest('POST', `/api/adoptions/checkouts/${sessionId}/send-link`, { method });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Checkout link sent!",
        description: "The adopter will receive an email with the checkout link",
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
    // Validate spayNeuterDate is required when animal is not already altered
    if (!isAlreadyAltered && !data.spayNeuterDate) {
      form.setError("spayNeuterDate", {
        type: "manual",
        message: "Spay/neuter deadline is required for animals that are not already spayed/neutered"
      });
      return;
    }
    
    createSessionMutation.mutate({
      ...data,
      animalId: animal.id,
    } as any);
  };

  const handleSendLink = () => {
    if (sessionId) {
      sendLinkMutation.mutate({ sessionId, method: 'email' });
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

  if (loadingApplications) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="dialog-finalize-adoption">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (approvedApplications.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="dialog-finalize-adoption">
          <DialogHeader>
            <DialogTitle>No Approved Applications</DialogTitle>
            <DialogDescription>
              There are no approved applications for {animal.name}. Please approve an application first.
            </DialogDescription>
          </DialogHeader>
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
              <FormField
                control={form.control}
                name="applicationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Approved Adopter *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                          {...field}
                          data-testid="input-adoption-fee"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {animal.adoptionFee 
                        ? `Pre-filled from ${animal.name}'s configured adoption fee`
                        : `Base adoption fee for ${animal.name}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              {/* Contract Commitment Dates */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium text-sm">Contract Commitment Dates</h4>
                <p className="text-sm text-muted-foreground">
                  These dates will appear in the adoption contract. Confirm or adjust as needed.
                </p>
                
                <FormField
                  control={form.control}
                  name="vetAppointmentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Vaccination Due Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-vet-appointment-date"
                        />
                      </FormControl>
                      <FormDescription>
                        {animal.nextVaccinationDue 
                          ? "Pre-filled from the animal's profile" 
                          : "Enter the date when vaccinations are due"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isAlreadyAltered && (
                  <FormField
                    control={form.control}
                    name="spayNeuterDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spay/Neuter Deadline</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-spay-neuter-date"
                          />
                        </FormControl>
                        <FormDescription>
                          Enter the deadline for the adopter to complete spay/neuter
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isAlreadyAltered && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{animal.name} is already {animal.neuterStatus} - spay/neuter date will show as "N/A" in the contract</span>
                  </div>
                )}
              </div>

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
                      Creating...
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

            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <Heart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Set up health reminders?
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Auto-generate vaccination and medication reminders for the adopter
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHealthPlanModal(true)}
                data-testid="button-setup-health-plan"
              >
                Setup
              </Button>
            </div>

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
              <Button
                type="button"
                onClick={handleSendLink}
                disabled={sendLinkMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-send-link"
              >
                {sendLinkMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Checkout Link
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {showHealthPlanModal && selectedAdopterId && (
          <HealthPlanProposalModal
            open={showHealthPlanModal}
            onOpenChange={setShowHealthPlanModal}
            animalId={animal.id}
            animalName={animal.name}
            adopterId={selectedAdopterId}
            adopterName={selectedAdopterName}
            adoptionDate={new Date()}
            onComplete={() => {
              toast({
                title: "Health plan created",
                description: "Automated reminders have been scheduled for the adopter",
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
