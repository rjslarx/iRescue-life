import { useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Plus, Trash2, Stethoscope, AlertCircle, Loader2 } from "lucide-react";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import type { Tenant } from "@shared/schema";

const animalSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  species: z.enum(["dog", "cat", "other"], { required_error: "Species required" }),
  breed: z.string().trim().max(120).optional().or(z.literal("")),
  age: z.string().trim().max(60).optional().or(z.literal("")),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  color: z.string().trim().max(120).optional().or(z.literal("")),
  weight: z.string().trim().max(60).optional().or(z.literal("")),
  hasMedicalIssues: z.boolean().default(false),
  medicalIssues: z.string().trim().max(2000).optional().or(z.literal("")),
  heartwormStatus: z.enum(["positive", "negative", "unknown", "not_applicable"], { required_error: "Required" }),
  needsRabies: z.enum(["yes", "no", "unsure"], { required_error: "Required" }),
}).superRefine((animal, ctx) => {
  if (animal.hasMedicalIssues) {
    const text = (animal.medicalIssues || "").trim();
    if (text.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["medicalIssues"],
        message: "Please describe the medical issues",
      });
    }
  }
});

const formSchema = z.object({
  partnerOrganizationId: z.string().optional(),
  organizationName: z.string().trim().min(1, "Organization name is required").max(200),
  contactName: z.string().trim().min(1, "Contact name is required").max(200),
  contactPhone: z.string().trim().min(7, "Contact phone is required").max(50),
  contactEmail: z.string().trim().email("Invalid email").max(200).optional().or(z.literal("")),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Surgery date is required"),
  signedByName: z.string().trim().min(1, "Your name is required").max(200),
  acknowledged: z.literal(true, { errorMap: () => ({ message: "You must acknowledge to continue" }) }),
  animals: z.array(animalSchema).min(1, "Add at least one animal"),
});
type FormValues = z.infer<typeof formSchema>;

const PRE_OP_INSTRUCTIONS = [
  "No food after 10:00 PM the night before surgery.",
  "Water may be removed at the same time (no food or water after 10:00 PM).",
  "Drop-off is between 8:00 AM and 9:00 AM on the scheduled surgery day.",
  "Pick-up is between 2:00 PM and 3:00 PM the same day.",
  "If your animal is sick, in heat, or has eaten that morning, please call to reschedule.",
];

function buildAckText(rescueName: string, feralCats = false) {
  return `By submitting this Surgery Day Request to ${rescueName}, I acknowledge and agree ${feralCats ? "as the person responsible for these feral cats" : "on behalf of my rescue/organization"} that:
1. The information provided for each animal is accurate to the best of my knowledge.
2. I understand that surgery and anesthesia carry inherent risks, and I assume those risks for every animal listed on this request.
3. ${rescueName} and its veterinarian, Dr. Stark, are not liable for outcomes related to undisclosed medical conditions, age, temperament, or pre-existing conditions.
4. I have read the pre-operative instructions above and agree to follow them, including withholding food and water after 10:00 PM the night before surgery.
5. I am authorized to submit this request and to provide consent for the procedures listed for each animal.
6. I will transport each animal to and from the surgery location on the scheduled date during the posted drop-off and pick-up windows.
7. I agree to follow all post-operative care instructions provided and to seek follow-up veterinary care for ${feralCats ? "these cats at my expense" : "my own animals at my organization's expense"} if needed.`;
}

function emptyAnimal() {
  return {
    name: "",
    species: "dog" as const,
    breed: "",
    age: "",
    sex: undefined,
    color: "",
    weight: "",
    hasMedicalIssues: false,
    medicalIssues: "",
    heartwormStatus: "unknown" as const,
    needsRabies: "unsure" as const,
  };
}

export default function PublicSurgeryDayRequestPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { tenantId } = useTenant();
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [partnerNotListed, setPartnerNotListed] = useState(false);
  const [feralCats, setFeralCats] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({ queryKey: ["/api/tenant", tenantId] });
  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Surgery Day Request - ${rescueName}`,
    description: `Submit a surgery day request to ${rescueName}.`,
  });

  const { data: partnersData, isLoading: partnersLoading } = useQuery<{ partners: { id: string; name: string; city: string | null; state: string | null }[] }>({
    queryKey: ["/api/public/surgery-day-partners", tenantId],
  });
  const partners = partnersData?.partners || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(feralCats ? formSchema.extend({
      contactEmail: z.string().trim().min(1, "Email is required for feral cat requests").email("Enter a valid email address").max(200),
    }) : formSchema),
    defaultValues: {
      partnerOrganizationId: "",
      organizationName: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      requestedDate: "",
      signedByName: "",
      acknowledged: false as any,
      animals: [emptyAnimal()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "animals" });
  const selectedPartnerId = form.watch("partnerOrganizationId");

  // Fetch full partner detail (with contact info) when one is selected so we can
  // auto-fill the contact name / phone / email fields from the partner record.
  const { data: partnerDetailData } = useQuery<{
    partner: {
      id: string;
      name: string;
      contactName: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      city: string | null;
      state: string | null;
    };
  }>({
    queryKey: ["/api/public/surgery-day-partners", selectedPartnerId, tenantId],
    queryFn: async () => {
      const res = await fetch(buildTenantUrl(`/api/public/surgery-day-partners/${selectedPartnerId}`), {
        headers: getTenantHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load partner");
      return res.json();
    },
    enabled: !partnerNotListed && !!selectedPartnerId,
  });

  // Auto-fill org name + contact fields from selected partner. Only fill empty
  // fields so we never overwrite anything the user has already typed.
  useEffect(() => {
    if (partnerNotListed || !selectedPartnerId) return;
    const p = partnerDetailData?.partner;
    if (!p) return;
    form.setValue("organizationName", p.name);
    if (p.contactName && !form.getValues("contactName")) {
      form.setValue("contactName", p.contactName);
    }
    if (p.contactPhone && !form.getValues("contactPhone")) {
      form.setValue("contactPhone", p.contactPhone);
    }
    if (p.contactEmail && !form.getValues("contactEmail")) {
      form.setValue("contactEmail", p.contactEmail);
    }
  }, [partnerDetailData, selectedPartnerId, partnerNotListed, form]);

  const submit = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!signature) {
        throw new Error("Please sign your name");
      }
      const payload = {
        feralCats,
        partnerOrganizationId: partnerNotListed ? null : values.partnerOrganizationId || null,
        organizationName: values.organizationName,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        contactEmail: values.contactEmail || null,
        requestedDate: values.requestedDate,
        signatureDataUrl: signature,
        signedByName: values.signedByName,
        acknowledgmentText: `Pre-operative instructions:\n- ${PRE_OP_INSTRUCTIONS.join("\n- ")}\n\n${buildAckText(rescueName, feralCats)}`,
        animals: values.animals.map((a) => ({
          ...a,
          name: a.name || null,
          breed: a.breed || null,
          age: a.age || null,
          color: a.color || null,
          weight: a.weight || null,
          medicalIssues: a.medicalIssues || null,
          sex: a.sex || null,
        })),
      };

      const res = await fetch(buildTenantUrl("/api/surgery-day-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getTenantHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Submission failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: any) => {
      toast({ title: "Submission failed", description: e?.message || "Please try again", variant: "destructive" });
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!signature) {
      setSignatureError("Signature is required");
      return;
    }
    setSignatureError(null);
    submit.mutate(values);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="container max-w-2xl mx-auto px-4 py-12">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-submission-success">Request received</CardTitle>
              <CardDescription className="text-base">
                Thank you for submitting your surgery day request. {rescueName} will review your request and contact you to confirm scheduling.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-home">Back to home</Button>
              <Button onClick={() => { setSubmitted(false); form.reset({ ...form.getValues(), animals: [emptyAnimal()] }); setSignature(null); }} data-testid="button-submit-another">
                Submit another request
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="container max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <Stethoscope className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Surgery Day Request</h1>
          <p className="text-muted-foreground">
            Request a surgery day with {rescueName}'s veterinarian for one or more animals. We'll review and contact you to confirm scheduling.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Surgery Date */}
            <Card>
              <CardHeader>
                <CardTitle>Surgery Date</CardTitle>
                <CardDescription>
                  Enter the date your contact at {rescueName} gave you for this surgery day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="requestedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Surgery date *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          data-testid="input-requested-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Partner Selection */}
            <Card>
              <CardHeader>
                <CardTitle>{feralCats ? "Feral cats — Your contact information" : "Your Rescue / Organization"}</CardTitle>
                <CardDescription>Tell us who's submitting this request.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tenant?.subdomain === "haseyas" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="feral-cats"
                        checked={feralCats}
                        data-testid="checkbox-feral-cats"
                        onCheckedChange={(value) => {
                          const next = value === true;
                          setFeralCats(next);
                          setPartnerNotListed(false);
                          form.setValue("partnerOrganizationId", "");
                          form.setValue("organizationName", next ? "Feral cats" : "");
                          form.clearErrors(["organizationName", "partnerOrganizationId"]);
                          if (next) {
                            form.getValues("animals").forEach((_, index) => {
                              form.setValue(`animals.${index}.species`, "cat");
                            });
                          }
                          form.setValue("acknowledged", false as any);
                          setSignature(null);
                        }}
                      />
                      <Label htmlFor="feral-cats">Feral cats (no organization required)</Label>
                    </div>
                    {feralCats && <p className="text-sm text-muted-foreground">Enter your contact information and each cat below. No rescue affiliation is needed.</p>}
                  </div>
                )}
                {!feralCats && !partnerNotListed && (
                  <FormField
                    control={form.control}
                    name="partnerOrganizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select your rescue</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={partnersLoading}>
                          <FormControl>
                            <SelectTrigger data-testid="select-partner-org">
                              <SelectValue placeholder={partnersLoading ? "Loading…" : "Choose your rescue"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {partners.length === 0 && (
                              <div className="px-3 py-2 text-sm text-muted-foreground">No partners listed yet.</div>
                            )}
                            {partners.map((p) => (
                              <SelectItem key={p.id} value={p.id} data-testid={`option-partner-${p.id}`}>
                                {p.name}{p.city || p.state ? ` — ${[p.city, p.state].filter(Boolean).join(", ")}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {!feralCats && <div className="flex items-center gap-2">
                  <Checkbox
                    id="partner-not-listed"
                    checked={partnerNotListed}
                    onCheckedChange={(v) => {
                      const next = v === true;
                      setPartnerNotListed(next);
                      if (next) {
                        form.setValue("partnerOrganizationId", "");
                        form.setValue("organizationName", "");
                      }
                    }}
                    data-testid="checkbox-partner-not-listed"
                  />
                  <Label htmlFor="partner-not-listed" className="cursor-pointer">My rescue isn't listed</Label>
                </div>}

                {!feralCats && partnerNotListed && (
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rescue / organization name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Happy Tails Rescue" data-testid="input-organization-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="contactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact name *</FormLabel>
                      <FormControl><Input {...field} data-testid="input-contact-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="contactPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl><Input {...field} type="tel" data-testid="input-contact-phone" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{feralCats ? "Email *" : "Email (optional)"}</FormLabel>
                    <FormControl><Input {...field} type="email" required={feralCats} data-testid="input-contact-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Animals */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Animals</CardTitle>
                  <CardDescription>Add each animal that needs surgery.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ ...emptyAnimal(), species: feralCats ? "cat" : "dog" })}
                  data-testid="button-add-animal"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add animal
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {fields.map((field, index) => (
                  <div key={field.id} className="rounded-md border p-4 space-y-4" data-testid={`card-animal-${index}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold" data-testid={`text-animal-heading-${index}`}>Animal #{index + 1}</h3>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-animal-${index}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name={`animals.${index}.name`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name (optional)</FormLabel>
                          <FormControl><Input {...field} data-testid={`input-animal-name-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.species`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Species *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={feralCats}>
                            <FormControl><SelectTrigger data-testid={`select-animal-species-${index}`}><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="dog">Dog</SelectItem>
                              <SelectItem value="cat">Cat</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.breed`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Breed</FormLabel>
                          <FormControl><Input {...field} data-testid={`input-animal-breed-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.age`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl><Input {...field} placeholder="e.g. 2 yrs" data-testid={`input-animal-age-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.sex`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sex</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger data-testid={`select-animal-sex-${index}`}><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="unknown">Unknown</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.weight`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight</FormLabel>
                          <FormControl><Input {...field} placeholder="e.g. 35 lb" data-testid={`input-animal-weight-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.color`} render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Color / markings</FormLabel>
                          <FormControl><Input {...field} data-testid={`input-animal-color-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.heartwormStatus`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Heartworm status *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger data-testid={`select-animal-hw-${index}`}><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="negative">Negative</SelectItem>
                              <SelectItem value="positive">Positive</SelectItem>
                              <SelectItem value="unknown">Unknown</SelectItem>
                              <SelectItem value="not_applicable">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`animals.${index}.needsRabies`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Needs rabies vaccine? *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger data-testid={`select-animal-rabies-${index}`}><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="unsure">Unsure</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name={`animals.${index}.hasMedicalIssues`} render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid={`checkbox-animal-medical-${index}`} />
                        </FormControl>
                        <FormLabel className="cursor-pointer">This animal has known medical issues</FormLabel>
                      </FormItem>
                    )} />
                    {form.watch(`animals.${index}.hasMedicalIssues`) && (
                      <FormField control={form.control} name={`animals.${index}.medicalIssues`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Describe medical issues</FormLabel>
                          <FormControl><Textarea rows={3} {...field} data-testid={`textarea-animal-medical-${index}`} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Pre-op instructions */}
            <Card data-testid="card-pre-op-instructions">
              <CardHeader>
                <CardTitle>Pre-Operative Instructions</CardTitle>
                <CardDescription>Please read carefully — these apply to every animal on this request.</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc pl-5 space-y-1 text-sm" data-testid="list-pre-op">
                      {PRE_OP_INSTRUCTIONS.map((line, i) => (
                        <li key={i} data-testid={`text-pre-op-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Acknowledgment + signature */}
            <Card>
              <CardHeader>
                <CardTitle>Acknowledgment & Signature</CardTitle>
                <CardDescription>One signature covers all animals on this request.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <pre className="whitespace-pre-wrap font-sans text-sm" data-testid="text-acknowledgment">{buildAckText(rescueName, feralCats)}</pre>
                  </AlertDescription>
                </Alert>

                <FormField control={form.control} name="acknowledged" render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value as any}
                        onCheckedChange={(v) => field.onChange(v === true ? true : false)}
                        data-testid="checkbox-acknowledged"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="cursor-pointer">I have read and agree to the acknowledgment above.</FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )} />

                <FormField control={form.control} name="signedByName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your full name *</FormLabel>
                    <FormControl><Input {...field} data-testid="input-signed-by-name" /></FormControl>
                    <FormDescription>This is your typed legal name accompanying your signature below.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <div>
                  <Label>Signature *</Label>
                  <div className="mt-2">
                    <SignatureCanvas key={String(feralCats)} onSignatureChange={(s) => { setSignature(s); if (s) setSignatureError(null); }} />
                  </div>
                  {signatureError && (
                    <p className="text-sm text-destructive mt-1" data-testid="text-signature-error">{signatureError}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setLocation("/")} data-testid="button-cancel">Cancel</Button>
              <Button type="submit" disabled={submit.isPending} data-testid="button-submit-request">
                {submit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit request
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
