import { useState, useEffect } from "react";
import { AdoptionMedicalDeadlines, useAdoptionMedicalDeadlines } from "./AdoptionMedicalDeadlines";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, Send, FileSignature, Star, AlertCircle, ClipboardCheck, Shield, Syringe, MessageSquare, Mail } from "lucide-react";
import type { Animal, Grant, EditableVariable, CarePriorities } from "@shared/schema";
import CarePrioritiesInput from "@/components/CarePrioritiesInput";

interface ContractTemplate {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  version: string;
  editableVariables?: EditableVariable[];
}

interface ApplicationData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  animalId: string;
  animalName?: string;
}

interface PreventativeCareRecord {
  id: string;
  careTypeId: string;
  dateAdministered: string;
  nextDueDate: string | null;
}

interface PreventativeCareType {
  id: string;
  name: string;
  category: string;
}

interface MedicalDueDates {
  rabiesDueDate: string;
  dhppDueDate: string;
}

interface CustomComplianceItem {
  obligationType: string;
  label: string;
  contractualDueDate: string;
  notes: string;
}

const formSchema = z.object({
  approvalAction: z.enum(["approve_only", "approve_and_send"]),
  baseFee: z.string().min(1, "Adoption fee is required"),
  grantId: z.string().optional(),
  contractTemplateId: z.string().optional(),
  spayNeuterDate: z.string().optional(),
  isFeeWaived: z.boolean().default(false),
  feeWaiverReason: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.approvalAction === "approve_and_send" && !data.contractTemplateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select a contract template",
      path: ["contractTemplateId"],
    });
  }
  if (data.isFeeWaived && (!data.feeWaiverReason || data.feeWaiverReason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please provide a reason for waiving the fee",
      path: ["feeWaiverReason"],
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

const MEDICAL_DATE_FIELDS: { key: keyof MedicalDueDates; label: string; careNames: string[] }[] = [
  { key: "rabiesDueDate", label: "Rabies Vaccine", careNames: ["rabies"] },
  { key: "dhppDueDate", label: "DHPP Booster", careNames: ["dhpp", "da2pp", "dapp", "distemper", "dapp-l4"] },
];

const CUSTOM_OBLIGATION_TYPES = [
  { value: "heartworm_prevention_proof", label: "Heartworm Prevention Proof" },
  { value: "obedience_training", label: "Obedience Training" },
  { value: "fecal_test", label: "Fecal Test" },
  { value: "custom", label: "Other (Custom)" },
] as const;

function findMatchingRecord(
  records: PreventativeCareRecord[],
  types: PreventativeCareType[],
  careNames: string[]
): PreventativeCareRecord | undefined {
  return records.find(r => {
    const type = types.find(t => t.id === r.careTypeId);
    if (!type) return false;
    const typeName = type.name.toLowerCase();
    return careNames.some(name => typeName.includes(name.toLowerCase()));
  });
}

export function ApproveAndSendAgreementDialog({ 
  open, 
  onOpenChange, 
  application,
  onSuccess 
}: ApproveAndSendAgreementDialogProps) {
  const { toast } = useToast();
  const [spayNeuterNotApplicable, setSpayNeuterNotApplicable] = useState(false);
  const [sendMethod, setSendMethod] = useState<'sms' | 'email'>('email');
  const [includeCatSafetyAddendum, setIncludeCatSafetyAddendum] = useState(false);
  const { data: catSafetyData } = useQuery<{ addendum: { enabled: boolean } }>({
    queryKey: ['/api/cat-safety-addendum'], enabled: open,
  });

  const { data: tenantData } = useQuery<{ tenant: { twilioEnabled?: boolean } }>({
    queryKey: ['/api/tenant'],
  });
  const smsEnabled = !!tenantData?.tenant?.twilioEnabled;
  const [staffConfirmValues, setStaffConfirmValues] = useState<Record<string, string>>({});
  const medicalReview = useAdoptionMedicalDeadlines(application?.animalId, open);
  const medicalDueDates = { rabiesDueDate: "", dhppDueDate: "", ...medicalReview.dates };
  const [carePriorities, setCarePriorities] = useState<CarePriorities>({
    enabled: false,
    flags: {},
  });
  const [customObligations, setCustomObligations] = useState<CustomComplianceItem[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newCustom, setNewCustom] = useState<CustomComplianceItem>({
    obligationType: "",
    label: "",
    contractualDueDate: "",
    notes: "",
  });

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
      grantId: "",
      contractTemplateId: "",
      spayNeuterDate: "",
      isFeeWaived: false,
      feeWaiverReason: "",
    },
  });

  useEffect(() => {
    if (open && animal) {
      form.setValue("baseFee", animal.adoptionFee || "200");
    }
    if (open) {
      setSpayNeuterNotApplicable(false);
      setSendMethod(smsEnabled && application?.applicantPhone ? 'sms' : 'email');
      setStaffConfirmValues({});
      setCarePriorities({ enabled: false, flags: {} });
      setCustomObligations([]);
      setShowAddCustom(false);
      setNewCustom({ obligationType: "", label: "", contractualDueDate: "", notes: "" });
      setIncludeCatSafetyAddendum(false);
    }
  }, [open, animal, form, smsEnabled, application?.applicantPhone]);


  useEffect(() => {
    if (open && defaultTemplate && !form.getValues('contractTemplateId')) {
      form.setValue('contractTemplateId', defaultTemplate.id.toString());
    }
  }, [open, defaultTemplate, form]);

  useEffect(() => {
    if (spayNeuterNotApplicable) {
      form.setValue("spayNeuterDate", "not_applicable");
    } else if (form.getValues("spayNeuterDate") === "not_applicable") {
      form.setValue("spayNeuterDate", "");
    }
  }, [spayNeuterNotApplicable, form]);

  const selectedGrantId = form.watch("grantId");
  const baseFee = form.watch("baseFee");
  const approvalAction = form.watch("approvalAction");
  const selectedTemplateId = form.watch("contractTemplateId");
  const isFeeWaived = form.watch("isFeeWaived");
  const adopterPhone = application?.applicantPhone;

  const selectedTemplate = contractTemplates.find(t => t.id.toString() === selectedTemplateId);
  const editableVars = selectedTemplate?.editableVariables || [];

  useEffect(() => {
    setStaffConfirmValues({});
  }, [selectedTemplateId]);

  const selectedGrant = activeGrants.find(g => g.id === selectedGrantId);

  useEffect(() => {
    if (selectedGrant && baseFee && animal) {
      const originalFee = parseFloat(animal.adoptionFee || "200");
      const waiverAmount = parseFloat(selectedGrant.waiverAmount || "0");
      const newFee = Math.max(0, originalFee - waiverAmount);
      form.setValue("baseFee", newFee.toFixed(2));
    }
  }, [selectedGrantId]);

  useEffect(() => {
    if (isFeeWaived) {
      form.setValue("baseFee", "0");
    } else if (animal) {
      form.setValue("baseFee", animal.adoptionFee || "200");
    }
  }, [isFeeWaived]);

  const allMedicalDatesFilled = approvalAction !== "approve_and_send" ||
    medicalReview.fields.filter(field => MEDICAL_DATE_FIELDS.some(required => required.key === field.key))
      .every(field => (medicalDueDates[field.key] || "").trim() !== "");

  const approveAndSendMutation = useMutation({
    mutationFn: async (data: FormData & { applicationId: string }) => {
      if (data.approvalAction === "approve_and_send" && !medicalReview.ready) {
        throw new Error("Review and confirm medical deadlines before continuing.");
      }
      const response = await apiRequest('POST', '/api/applications/approve-and-send', {
        applicationId: data.applicationId,
        sendContract: data.approvalAction === "approve_and_send",
        baseFee: data.baseFee,
        grantId: data.grantId || null,
        contractTemplateId: data.contractTemplateId || null,
        vetAppointmentDate: null,
        spayNeuterDate: data.spayNeuterDate || null,
        staffConfirmValues: Object.keys(staffConfirmValues).length > 0 ? staffConfirmValues : null,
        medicalDueDates: data.approvalAction === "approve_and_send" ? medicalDueDates : null,
        medicalDatesConfirmed: medicalReview.confirmed,
        carePriorities: carePriorities.enabled ? carePriorities : null,
        customComplianceObligations: data.approvalAction === "approve_and_send" && customObligations.length > 0 ? customObligations : null,
        isFeeWaived: data.isFeeWaived || false,
        feeWaiverReason: data.feeWaiverReason || null,
        sendMethod,
        includeCatSafetyAddendum: data.approvalAction === "approve_and_send" && includeCatSafetyAddendum,
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

    if (data.approvalAction === "approve_and_send") {
      if (!allMedicalDatesFilled) {
        toast({
          title: "Missing medical dates",
          description: "Please confirm all medical due dates before sending the agreement.",
          variant: "destructive",
        });
        return;
      }

      if (editableVars.length > 0) {
        const missingRequired = editableVars.filter(
          v => v.required && !staffConfirmValues[v.token]?.trim()
        );
        if (missingRequired.length > 0) {
          toast({
            title: "Missing required fields",
            description: `Please fill in: ${missingRequired.map(v => v.label).join(', ')}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    approveAndSendMutation.mutate({
      ...data,
      applicationId: application.id,
    });
  };

  if (!application) return null;

  const medicalDatesMissing = medicalReview.fields.filter(field => MEDICAL_DATE_FIELDS.some(required => required.key === field.key) && !(medicalDueDates[field.key] || "").trim()).length;

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
                          : animal?.adoptionFee 
                            ? `Pre-filled from ${animal.name}'s configured adoption fee`
                            : "Enter the adoption fee amount"}
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
                        <FormLabel>Waive Adoption Fee</FormLabel>
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
                            placeholder="e.g., Senior animal adoption event, staff adoption"
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

                {activeGrants.length > 0 && !isFeeWaived && (
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

                {selectedGrant && (
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

                {editableVars.length > 0 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ClipboardCheck className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">Staff-Confirmable Fields</Label>
                      </div>
                      <div className="space-y-3">
                        {editableVars.map((variable) => (
                          <div key={variable.token}>
                            <Label className="text-sm" htmlFor={`staff-var-${variable.token}`}>
                              {variable.label}
                              {variable.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                            {variable.fieldType === 'textarea' ? (
                              <Textarea
                                id={`staff-var-${variable.token}`}
                                value={staffConfirmValues[variable.token] || variable.defaultValue || ''}
                                onChange={(e) => setStaffConfirmValues(prev => ({
                                  ...prev,
                                  [variable.token]: e.target.value,
                                }))}
                                placeholder={`Enter ${variable.label.toLowerCase()}`}
                                className="mt-1"
                                data-testid={`input-staff-var-${variable.token}`}
                              />
                            ) : (
                              <Input
                                id={`staff-var-${variable.token}`}
                                type={variable.fieldType === 'date' ? 'date' : variable.fieldType === 'number' ? 'number' : 'text'}
                                value={staffConfirmValues[variable.token] || variable.defaultValue || ''}
                                onChange={(e) => setStaffConfirmValues(prev => ({
                                  ...prev,
                                  [variable.token]: e.target.value,
                                }))}
                                placeholder={`Enter ${variable.label.toLowerCase()}`}
                                className="mt-1"
                                data-testid={`input-staff-var-${variable.token}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card data-testid="card-medical-due-dates">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-medium">Mandatory Compliance Dates *</Label>
                      {!allMedicalDatesFilled && (
                        <Badge variant="destructive" className="text-xs" data-testid="badge-medical-dates-missing">
                          {medicalDatesMissing} missing
                        </Badge>
                      )}
                      {allMedicalDatesFilled && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      These high-stakes items will be tracked in the compliance monitor. Pre-filled from {animal?.name || "the animal"}'s records when available.
                    </p>
                    <div className="space-y-3">
                      <AdoptionMedicalDeadlines review={medicalReview} />
                      {animal?.heartwormPositive && (
                        <div className="p-2 border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                            {animal.name} is heartworm positive - ongoing treatment will be monitored
                          </p>
                          <p className="text-xs text-muted-foreground">
                            An ongoing treatment obligation will be created automatically
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-custom-compliance">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">Additional Requirements</Label>
                        {customObligations.length > 0 && (
                          <Badge variant="secondary" className="text-xs">{customObligations.length}</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddCustom(true)}
                        data-testid="button-add-custom-compliance"
                      >
                        + Add Requirement
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Optional custom compliance requirements (e.g., heartworm prevention proof, obedience training, fecal test)
                    </p>

                    {customObligations.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {customObligations.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 p-2 border rounded-md" data-testid={`custom-obligation-${idx}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.label}</p>
                              <p className="text-xs text-muted-foreground">
                                Due: {new Date(item.contractualDueDate).toLocaleDateString()}
                                {item.notes && ` - ${item.notes}`}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setCustomObligations(prev => prev.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-custom-${idx}`}
                            >
                              <AlertCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showAddCustom && (
                      <div className="space-y-2 p-3 border border-dashed rounded-md" data-testid="form-add-custom-compliance">
                        <Select
                          value={newCustom.obligationType}
                          onValueChange={(val) => {
                            const typeObj = CUSTOM_OBLIGATION_TYPES.find(t => t.value === val);
                            setNewCustom(prev => ({
                              ...prev,
                              obligationType: val,
                              label: val === "custom" ? prev.label : (typeObj?.label || ""),
                            }));
                          }}
                        >
                          <SelectTrigger data-testid="select-custom-type">
                            <SelectValue placeholder="Select requirement type" />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOM_OBLIGATION_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newCustom.obligationType === "custom" && (
                          <Input
                            placeholder="Custom requirement name"
                            value={newCustom.label}
                            onChange={(e) => setNewCustom(prev => ({ ...prev, label: e.target.value }))}
                            data-testid="input-custom-label"
                          />
                        )}
                        <Input
                          type="date"
                          value={newCustom.contractualDueDate}
                          onChange={(e) => setNewCustom(prev => ({ ...prev, contractualDueDate: e.target.value }))}
                          data-testid="input-custom-due-date"
                        />
                        <Input
                          placeholder="Notes (optional)"
                          value={newCustom.notes}
                          onChange={(e) => setNewCustom(prev => ({ ...prev, notes: e.target.value }))}
                          data-testid="input-custom-notes"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!newCustom.obligationType || !newCustom.label || !newCustom.contractualDueDate}
                            onClick={() => {
                              setCustomObligations(prev => [...prev, { ...newCustom }]);
                              setNewCustom({ obligationType: "", label: "", contractualDueDate: "", notes: "" });
                              setShowAddCustom(false);
                            }}
                            data-testid="button-confirm-add-custom"
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowAddCustom(false);
                              setNewCustom({ obligationType: "", label: "", contractualDueDate: "", notes: "" });
                            }}
                            data-testid="button-cancel-add-custom"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {animal && !animal.spayedNeutered && (
                  <FormField
                    control={form.control}
                    name="spayNeuterDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spay/Neuter By Date</FormLabel>
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="spay-neuter-not-applicable"
                              checked={spayNeuterNotApplicable}
                              onCheckedChange={(checked) => setSpayNeuterNotApplicable(checked === true)}
                              data-testid="checkbox-spay-neuter-not-applicable"
                            />
                            <Label 
                              htmlFor="spay-neuter-not-applicable"
                              className="text-sm font-normal cursor-pointer"
                            >
                              Not applicable (already scheduled or not required)
                            </Label>
                          </div>
                          {!spayNeuterNotApplicable && (
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                value={field.value === "not_applicable" ? "" : field.value}
                                data-testid="input-spay-neuter-date"
                              />
                            </FormControl>
                          )}
                        </div>
                        <FormDescription>
                          {spayNeuterNotApplicable 
                            ? "Will show as 'Not applicable' in the contract"
                            : `Date by which ${animal?.name || "the animal"} must be spayed/neutered`
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <CarePrioritiesInput
                  animalName={animal?.name || application.animalName || "this animal"}
                  mode="adoption"
                  value={carePriorities}
                  onChange={setCarePriorities}
                />

                <Card data-testid="card-delivery-method">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-medium">Contract Delivery Method</Label>
                    </div>
                    <div className="flex gap-2">
                      {smsEnabled && (
                        <Button
                          type="button"
                          variant={sendMethod === 'sms' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSendMethod('sms')}
                          disabled={!adopterPhone}
                          data-testid="button-send-method-sms"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          SMS
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant={sendMethod === 'email' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSendMethod('email')}
                        data-testid="button-send-method-email"
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {sendMethod === 'sms' && adopterPhone
                        ? `Contract link will be sent via SMS to ${adopterPhone}`
                        : sendMethod === 'sms' && !adopterPhone
                          ? "No phone number on file — using email instead"
                          : `Contract link will be sent via email to ${application?.applicantEmail}`}
                    </p>
                    {!smsEnabled && (
                      <p
                        className="text-xs text-muted-foreground mt-1"
                        data-testid="text-sms-not-configured-hint"
                      >
                        SMS delivery requires Twilio. Configure Twilio in Integrations Settings to enable text delivery.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {catSafetyData?.addendum?.enabled && (
                  <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-include-cat-safety">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Checkbox id="include-cat-safety" checked={includeCatSafetyAddendum} onCheckedChange={v => setIncludeCatSafetyAddendum(v === true)} data-testid="checkbox-include-cat-safety" />
                        <div>
                          <Label htmlFor="include-cat-safety" className="font-medium">Include cat safety addendum</Label>
                          <p className="mt-1 text-xs text-muted-foreground">Prefilled with {animal?.name || "the animal"} and {application.applicantName}. The adopter will provide details about resident pets, transition barriers, a daily responsible person, an emergency plan, and initials before signing.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        <p className="font-medium">What happens next:</p>
                        <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-600 dark:text-blue-400">
                          <li>Application is marked as approved</li>
                          <li>Contract link sent via {sendMethod === 'sms' && adopterPhone && smsEnabled ? 'SMS' : 'email'} for e-signature</li>
                          {isFeeWaived ? (
                            <li>After signing, adoption is finalized automatically (fee waived)</li>
                          ) : (
                            <>
                              <li>After signing, payment link is sent automatically</li>
                              <li>Once paid, adoption is finalized</li>
                            </>
                          )}
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
                disabled={approveAndSendMutation.isPending || (approvalAction === "approve_and_send" && !allMedicalDatesFilled)}
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
