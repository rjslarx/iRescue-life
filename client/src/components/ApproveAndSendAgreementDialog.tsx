import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Send, FileSignature, Star, AlertCircle, Gift } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Animal, Grant } from "@shared/schema";

interface ContractTemplate {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  version: string;
}

interface ApplicationData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  animalId: string;
  animalName?: string;
}

const formSchema = z.object({
  approvalAction: z.enum(["approve_only", "approve_and_send"]),
  baseFee: z.string().min(1, "Adoption fee is required"),
  waiveFee: z.boolean().default(false),
  grantId: z.string().optional(),
  contractTemplateId: z.string().optional(),
}).superRefine((data, ctx) => {
  // Require contract template when approving and sending
  if (data.approvalAction === "approve_and_send" && !data.contractTemplateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select a contract template",
      path: ["contractTemplateId"],
    });
  }
});

type FormData = z.infer<typeof formSchema>;

interface ApproveAndSendAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: ApplicationData | null;
  onSuccess?: () => void;
}

export function ApproveAndSendAgreementDialog({ 
  open, 
  onOpenChange, 
  application,
  onSuccess 
}: ApproveAndSendAgreementDialogProps) {
  const { toast } = useToast();

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
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

  const activeGrants = grantsData?.grants.filter(
    grant => grant.status === 'active'
  ) || [];

  const animal = animalsData?.animals.find(a => a.id === application?.animalId);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      approvalAction: "approve_and_send",
      baseFee: "",
      waiveFee: false,
      grantId: "",
      contractTemplateId: "",
    },
  });

  useEffect(() => {
    if (open && animal) {
      form.setValue("baseFee", animal.adoptionFee || "200");
    }
  }, [open, animal, form]);

  useEffect(() => {
    if (open && defaultTemplate && !form.getValues('contractTemplateId')) {
      form.setValue('contractTemplateId', defaultTemplate.id.toString());
    }
  }, [open, defaultTemplate, form]);

  const selectedGrantId = form.watch("grantId");
  const baseFee = form.watch("baseFee");
  const approvalAction = form.watch("approvalAction");
  const waiveFee = form.watch("waiveFee");

  // When waive fee is checked, set fee to 0
  useEffect(() => {
    if (waiveFee) {
      form.setValue("baseFee", "0");
      form.setValue("grantId", ""); // Clear any selected grant
    } else if (open && animal && !waiveFee) {
      // Restore original fee when unchecking waive
      form.setValue("baseFee", animal.adoptionFee || "200");
    }
  }, [waiveFee, open, animal, form]);

  const selectedGrant = activeGrants.find(g => g.id === selectedGrantId);

  useEffect(() => {
    if (selectedGrant && baseFee && animal) {
      const originalFee = parseFloat(animal.adoptionFee || "200");
      const waiverAmount = parseFloat(selectedGrant.waiverAmount || "0");
      const newFee = Math.max(0, originalFee - waiverAmount);
      form.setValue("baseFee", newFee.toFixed(2));
    }
  }, [selectedGrantId]);

  const approveAndSendMutation = useMutation({
    mutationFn: async (data: FormData & { applicationId: string }) => {
      const response = await apiRequest('POST', '/api/applications/approve-and-send', {
        applicationId: data.applicationId,
        sendContract: data.approvalAction === "approve_and_send",
        baseFee: data.waiveFee ? "0" : data.baseFee,
        waiveFee: data.waiveFee,
        grantId: data.grantId || null,
        contractTemplateId: data.contractTemplateId || null,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/adoptions/checkouts'] });
      
      if (data.contractSent) {
        toast({
          title: "Applicant approved & contract sent",
          description: `${application?.applicantName} has been approved and sent the adoption agreement for e-signature.`,
        });
      } else {
        toast({
          title: "Applicant approved",
          description: `${application?.applicantName} has been approved. You can send the contract later.`,
        });
      }
      
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to process approval",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: FormData) => {
    if (!application) return;
    approveAndSendMutation.mutate({
      ...data,
      applicationId: application.id,
    });
  };

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-approve-and-send">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Approve Application
          </DialogTitle>
          <DialogDescription>
            Approve {application.applicantName}'s application for {application.animalName || "this animal"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="approvalAction"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Approval Action</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="approve_and_send" id="approve_and_send" data-testid="radio-approve-and-send" />
                        <label
                          htmlFor="approve_and_send"
                          className="flex flex-col cursor-pointer"
                        >
                          <span className="font-medium flex items-center gap-2">
                            <Send className="h-4 w-4 text-primary" />
                            Approve & Send Agreement
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Automatically email the adoption contract for e-signature
                          </span>
                        </label>
                      </div>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="approve_only" id="approve_only" data-testid="radio-approve-only" />
                        <label
                          htmlFor="approve_only"
                          className="flex flex-col cursor-pointer"
                        >
                          <span className="font-medium">Approve Only</span>
                          <span className="text-sm text-muted-foreground">
                            Just update the status to approved (send contract later)
                          </span>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {approvalAction === "approve_and_send" && (
              <>
                <FormField
                  control={form.control}
                  name="waiveFee"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-muted/50">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-waive-fee"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="flex items-center gap-2 cursor-pointer">
                          <Gift className="h-4 w-4 text-green-600" />
                          Waive Adoption Fee
                        </FormLabel>
                        <FormDescription>
                          Check this to waive the entire adoption fee (no payment required)
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {!waiveFee && (
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
                          {animal?.adoptionFee 
                            ? `Pre-filled from ${animal.name}'s configured adoption fee`
                            : "Enter the adoption fee amount"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {waiveFee && (
                  <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Gift className="h-5 w-5" />
                        <span className="font-medium">Adoption fee will be waived</span>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                        The adopter will not be charged any fee. They only need to sign the contract.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {activeGrants.length > 0 && !waiveFee && (
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {selectedGrant && !waiveFee && (
                  <Card className="bg-muted">
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Original Fee:</span>
                          <span className="line-through text-muted-foreground">
                            ${animal?.adoptionFee || "200"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Grant Waiver:</span>
                          <span className="text-green-600 dark:text-green-400">
                            -${selectedGrant.waiverAmount}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>New Fee:</span>
                          <span>${baseFee}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <FormField
                  control={form.control}
                  name="contractTemplateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <FileSignature className="h-4 w-4" />
                        Contract Template *
                      </FormLabel>
                      {contractTemplates.length > 0 ? (
                        <>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-contract-template">
                                <SelectValue placeholder="Select a contract template" />
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
                            The adopter will sign this contract electronically
                          </FormDescription>
                        </>
                      ) : (
                        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                          <CardContent className="pt-4">
                            <div className="flex gap-3">
                              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <div className="text-sm text-amber-700 dark:text-amber-300">
                                <p className="font-medium">No contract templates available</p>
                                <p className="text-amber-600 dark:text-amber-400">
                                  Create a contract template in Settings to send agreements automatically.
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        <p className="font-medium">What happens next:</p>
                        <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-600 dark:text-blue-400">
                          <li>Application is marked as approved</li>
                          <li>Contract is emailed for e-signature</li>
                          <li>After signing, payment link is sent automatically</li>
                          <li>Once paid, adoption is finalized</li>
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={approveAndSendMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={approveAndSendMutation.isPending}
                data-testid="button-confirm-approval"
              >
                {approveAndSendMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : approvalAction === "approve_and_send" ? (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Approve & Send Contract
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Approve Application
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
