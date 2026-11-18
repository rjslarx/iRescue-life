import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Heart, Upload, X, AlertCircle } from "lucide-react";
import type { AdoptionFormField } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoogleClickId } from "@/hooks/useGoogleClickId";

const publicAdoptionSchema = z.object({
  applicantName: z.string().min(2, "Name must be at least 2 characters"),
  applicantEmail: z.string().email("Please enter a valid email address"),
  applicantPhone: z.string().min(10, "Please enter a valid phone number"),
  // Task #230: A complete applicant address is now always required on adoption
  // applications for every tenant, regardless of the requireCompleteAddress flag.
  address: z.string().trim().min(1, "Street address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  zip: z.string().trim().min(1, "ZIP is required"),
   smsConsent: z.boolean(),
   notes: z.string(),
  customResponses: z.record(z.any()).optional(),
});

type PublicAdoptionFormData = z.infer<typeof publicAdoptionSchema>;

type ApplicationFieldsResponse = {
  fields: AdoptionFormField[];
  applicationVariant: "wild_horse" | "standard";
  introText?: string | null;
};

const emptyApplication = (): PublicAdoptionFormData => ({
  applicantName: "", applicantEmail: "", applicantPhone: "",
  address: "", city: "", state: "", zip: "",
  smsConsent: false, notes: "", customResponses: {},
});

interface PublicAdoptionDialogProps {
  animal: {
    id: string;
    name: string;
    species: string;
    breed: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublicAdoptionDialog({ animal, open, onOpenChange }: PublicAdoptionDialogProps) {
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { data: tenantData } = useQuery<{ tenant: { name: string } }>({
    queryKey: ["/api/tenant", { tenantId }],
    queryFn: async () => (await apiRequest("GET", "/api/tenant")).json(),
    enabled: open,
  });
  const tenant = tenantData?.tenant;
  const { gclid, clearGclid } = useGoogleClickId();

  const speciesParam = animal?.species || '';
  const { data: customFieldsData, isPending: fieldsLoading, isFetching: fieldsFetching, isError: fieldsError, refetch: retryFields } = useQuery<ApplicationFieldsResponse>({
    queryKey: ['/api/adoption-form-fields', { tenantId, animalId: animal?.id, species: speciesParam }],
    queryFn: async () => {
      const params = new URLSearchParams({ animalId: animal!.id, species: speciesParam });
      const baseUrl = `/api/adoption-form-fields?${params}`;
      const url = buildTenantUrl(baseUrl);
      const headers = getTenantHeaders();
      const res = await fetch(url, { credentials: 'include', headers });
      if (!res.ok) throw new Error('Failed to load form fields');
      const data = await res.json();
      if (!Array.isArray(data.fields) || !["standard", "wild_horse"].includes(data.applicationVariant)) {
        throw new Error("Invalid application form");
      }
      return data;
    },
    enabled: open && !!animal?.id,
  });
  const isWildHorse = customFieldsData?.applicationVariant === "wild_horse";
  const fieldsReady = !!animal && !!customFieldsData && !fieldsLoading && !fieldsError && !fieldsFetching;

  // Load form intro text
  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', { tenantId, formType: 'adoption' }],
    queryFn: async () => (await apiRequest("GET", "/api/form-settings/adoption")).json(),
    enabled: open && fieldsReady && !isWildHorse,
  });

  const form = useForm<PublicAdoptionFormData>({
    resolver: zodResolver(publicAdoptionSchema.superRefine((data, ctx) => {
      if (!isWildHorse) {
        if (data.notes.length < 100) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Please tell us a bit more about yourself (minimum 100 characters)" });
        }
        if (!data.smsConsent) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smsConsent"], message: "You must consent to receive SMS messages to submit this form" });
        }
      }
    })),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      smsConsent: false,
      notes: "",
      customResponses: {},
    },
  });

  const [photoUploads, setPhotoUploads] = useState<Record<string, { url: string; name: string; uploading: boolean }>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [missingFieldLabels, setMissingFieldLabels] = useState<string[]>([]);

  // ---------------------------------------------------------------------
  // Draft auto-save: adopters often take a long time to fill this form out
  // (especially on mobile, where switching apps to find a photo can cause
  // the browser to reload the page and wipe the dialog state). Persist a
  // draft to localStorage as they type so nothing is lost, restore it when
  // the dialog reopens, and clear it after a successful submission.
  // ---------------------------------------------------------------------
  const variant = customFieldsData?.applicationVariant;
  const draftKey = animal && variant
    ? `adoption-app-draft-${tenantId}-${animal.id}-${variant}` : null;
  const draftRestoredRef = useRef<string | null>(null);
  const [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null);
  const activeDraftKeyRef = useRef(draftKey);
  activeDraftKeyRef.current = open ? draftKey : null;
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDraft = () => {
    if (!draftKey) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftRestoredRef.current = null;
    try { localStorage.removeItem(draftKey); } catch {}
    if (animal && variant === "standard") {
      try { localStorage.removeItem(`adoption-app-draft-${animal.id}`); } catch {}
    }
  };

  // Restore a saved draft when the dialog opens.
  useEffect(() => {
    if (!open || !fieldsReady || !draftKey || draftRestoredRef.current === draftKey) return;
    form.reset(emptyApplication());
    setPhotoUploads({});
    setMissingFieldLabels([]);
    draftRestoredRef.current = draftKey;
    setRestoredDraftKey(draftKey);
    try {
      // Old drafts were standard applications scoped to the animal. Keep them
      // available without ever importing their answers into the wild form.
      const legacyKey = animal && variant === "standard" ? `adoption-app-draft-${animal.id}` : null;
      const raw = localStorage.getItem(draftKey) || (legacyKey ? localStorage.getItem(legacyKey) : null);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object' || !draft.values) return;
      if (draft.applicationVariant && draft.applicationVariant !== variant) return;
      const hasContent = Object.entries(draft.values).some(([key, val]) => {
        if (key === 'smsConsent' || key === 'customResponses') return false;
        return typeof val === 'string' && val.trim().length > 0;
      }) || Object.keys(draft.values.customResponses || {}).length > 0;
      if (!hasContent) return;
      form.reset({
        applicantName: draft.values.applicantName || "",
        applicantEmail: draft.values.applicantEmail || "",
        applicantPhone: draft.values.applicantPhone || "",
        address: draft.values.address || "",
        city: draft.values.city || "",
        state: draft.values.state || "",
        zip: draft.values.zip || "",
        smsConsent: draft.values.smsConsent === true,
        notes: isWildHorse ? "" : (draft.values.notes || ""),
        customResponses: draft.values.customResponses || {},
      });
      if (draft.photoUploads && typeof draft.photoUploads === 'object') {
        const restoredUploads: Record<string, { url: string; name: string; uploading: boolean }> = {};
        for (const [fieldId, up] of Object.entries<any>(draft.photoUploads)) {
          if (up && typeof up.url === 'string' && up.url && !up.uploading) {
            restoredUploads[fieldId] = { url: up.url, name: up.name || 'Uploaded file', uploading: false };
          }
        }
        setPhotoUploads(restoredUploads);
      }
      toast({
        title: "Welcome back!",
        description: "We restored the application you started earlier. Your progress is saved on this device as you type.",
      });
    } catch {
      // Ignore storage errors (private browsing, etc.)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftKey, fieldsReady]);

  // Save the draft (debounced) whenever any field changes while the dialog is open.
  useEffect(() => {
    if (!open || !fieldsReady || !draftKey || restoredDraftKey !== draftKey || draftRestoredRef.current !== draftKey) return;
    const saveDraft = () => {
      if (draftRestoredRef.current !== draftKey) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          values: form.getValues(), photoUploads, applicationVariant: variant, savedAt: Date.now(),
        }));
      } catch {}
    };
    const subscription = form.watch(() => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = setTimeout(saveDraft, 400);
    });
    saveDraft();
    return () => {
      subscription.unsubscribe();
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      saveDraft();
    };
  }, [open, draftKey, restoredDraftKey, fieldsReady, form, photoUploads, variant]);

  // Allow the restore effect to run again the next time the dialog opens.
  useEffect(() => {
    if (!open) {
      draftRestoredRef.current = null;
      setRestoredDraftKey(null);
    }
  }, [open]);

  // Map built-in form field names -> friendly labels and DOM data-testids so we can
  // build named missing-field lists, scroll to them, and outline them in red.
  const BUILT_IN_FIELD_META: Record<string, { label: string; testId: string }> = {
    applicantName: { label: "Your Full Name", testId: "input-applicant-name" },
    applicantEmail: { label: "Email Address", testId: "input-applicant-email" },
    applicantPhone: { label: "Mobile Phone", testId: "input-applicant-phone" },
    address: { label: "Street Address", testId: "input-applicant-address" },
    city: { label: "City", testId: "input-applicant-city" },
    state: { label: "State", testId: "input-applicant-state" },
    zip: { label: "ZIP", testId: "input-applicant-zip" },
    notes: { label: "Tell Us About Yourself", testId: "input-applicant-notes" },
    smsConsent: { label: "SMS Consent", testId: "checkbox-sms-consent" },
  };

  const scrollToFieldByTestId = (testId: string) => {
    const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { el.focus({ preventScroll: true }); } catch {}
    }
  };

  const showMissingFieldsFeedback = (labels: string[], firstScrollTestId: string | null) => {
    setMissingFieldLabels(labels);
    toast({
      variant: "destructive",
      title: "Missing Required Fields",
      description: `Please complete: ${labels.join(', ')}.`,
    });
    if (firstScrollTestId) {
      requestAnimationFrame(() => scrollToFieldByTestId(firstScrollTestId));
    }
  };

  // Walk required custom fields and return a list of missing ones with
  // a scroll target for the first one.
  const collectMissingCustomFields = (customResponses: Record<string, any> | undefined) => {
    const requiredFields = customFieldsData?.fields?.filter(f => f.required) || [];
    const labels: string[] = [];
    let firstTestId: string | null = null;
    for (const field of requiredFields) {
      const value = customResponses?.[field.id];
      let isMissing = false;
      if (field.fieldType === 'checkbox') {
        if (!value || !Array.isArray(value) || value.length === 0) isMissing = true;
      } else if (field.fieldType === 'photo') {
        if (!value || (typeof value === 'string' && value.trim() === '')) isMissing = true;
      } else {
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) isMissing = true;
      }
      if (isMissing) {
        labels.push(field.label);
        if (!firstTestId) {
          if (field.fieldType === 'photo') {
            firstTestId = `button-upload-${field.id}`;
          } else if (field.fieldType === 'radio') {
            firstTestId = `radio-custom-${field.id}`;
          } else if (field.fieldType === 'select') {
            firstTestId = `select-custom-${field.id}`;
          } else if (field.fieldType === 'checkbox') {
            firstTestId = `checkbox-custom-${field.id}-${field.options?.[0] ?? ''}`;
          } else {
            firstTestId = `input-custom-${field.id}`;
          }
        }
      }
    }
    return { labels, firstTestId };
  };

  const onInvalid = (formErrors: Record<string, any>) => {
    const builtInLabels: string[] = [];
    let firstTestId: string | null = null;
    for (const key of Object.keys(BUILT_IN_FIELD_META)) {
      if (formErrors[key]) {
        const meta = BUILT_IN_FIELD_META[key];
        builtInLabels.push(meta.label);
        if (!firstTestId) firstTestId = meta.testId;
      }
    }

    const customCheck = collectMissingCustomFields(form.getValues('customResponses'));
    if (!firstTestId) firstTestId = customCheck.firstTestId;

    const labels = [...builtInLabels, ...customCheck.labels];
    if (labels.length === 0) {
      labels.push('Required information');
    }
    showMissingFieldsFeedback(labels, firstTestId);
  };

  // Clear the stale missing-fields banner whenever the user starts editing again.
  // form.watch fires for form-state changes (e.g. isSubmitted) too, so only react
  // to actual field changes that carry a `name`.
  useEffect(() => {
    if (missingFieldLabels.length === 0) return;
    const subscription = form.watch((_value, info) => {
      if (info?.name) {
        setMissingFieldLabels([]);
      }
    });
    return () => subscription.unsubscribe();
  }, [missingFieldLabels.length, form]);

  // Reset banner state whenever the dialog is closed or reopened.
  useEffect(() => {
    if (!open) {
      setMissingFieldLabels([]);
    }
  }, [open]);

  const handlePhotoUpload = async (fieldId: string, file: File) => {
    const uploadDraftKey = activeDraftKeyRef.current;
    setPhotoUploads(prev => ({ ...prev, [fieldId]: { url: '', name: file.name, uploading: true } }));
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldId', fieldId);
      formData.append('formType', 'adoption');

      const tenantUrl = buildTenantUrl('/api/public/form-photos/upload');
      const tenantHeaders = getTenantHeaders();
      const response = await fetch(tenantUrl, {
        method: 'POST',
        body: formData,
        headers: tenantHeaders,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      if (activeDraftKeyRef.current !== uploadDraftKey) return;
      setPhotoUploads(prev => ({ ...prev, [fieldId]: { url: result.fileUrl, name: file.name, uploading: false } }));
      form.setValue(`customResponses.${fieldId}` as any, result.fileUrl);
    } catch (error: any) {
      if (activeDraftKeyRef.current !== uploadDraftKey) return;
      setPhotoUploads(prev => {
        const newState = { ...prev };
        delete newState[fieldId];
        return newState;
      });
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload photo. Please try again.",
      });
    }
  };

  const removePhoto = (fieldId: string) => {
    setPhotoUploads(prev => {
      const newState = { ...prev };
      delete newState[fieldId];
      return newState;
    });
    form.setValue(`customResponses.${fieldId}` as any, '');
    if (fileInputRefs.current[fieldId]) {
      fileInputRefs.current[fieldId]!.value = '';
    }
  };

  const applicationMutation = useMutation({
    mutationFn: async (data: PublicAdoptionFormData) => {
      if (!animal) throw new Error("No animal selected");
      if (!fieldsReady || restoredDraftKey !== draftKey) throw new Error("Please wait for the complete application to load.");
      
      const response = await apiRequest('POST', '/api/applications', {
        animalId: animal.id,
        applicantName: data.applicantName,
        applicantEmail: data.applicantEmail,
        applicantPhone: data.applicantPhone,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        smsConsent: data.smsConsent || false,
        notes: isWildHorse ? null : (data.notes || null),
        customResponses: data.customResponses || {},
        gclid: gclid || undefined,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Application submitted!",
        description: `Thank you for your interest in ${isWildHorse ? "providing a placement for" : "adopting"} ${animal?.name}! We'll review your application and be in touch soon.`,
      });
      
      clearGclid();
      clearDraft();
      setPhotoUploads({});
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit application",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: PublicAdoptionFormData) => {
    if (!fieldsReady || restoredDraftKey !== draftKey || Object.values(photoUploads).some(upload => upload.uploading)) return;
    const customCheck = collectMissingCustomFields(data.customResponses);
    if (customCheck.labels.length > 0) {
      showMissingFieldsFeedback(customCheck.labels, customCheck.firstTestId);
      return;
    }
    setMissingFieldLabels([]);
    applicationMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            {isWildHorse ? "Wild horse placement application" : `Apply to Adopt ${animal?.name}`}
          </DialogTitle>
          <DialogDescription>
            {isWildHorse
              ? `Apply to provide a safe placement for ${animal?.name}. Our team will review your experience and facilities and contact you about next steps.`
              : `Fill out this application to express your interest in adopting ${animal?.name}, a ${animal?.breed} ${animal?.species}. Our team will review your application and contact you soon.`}
          </DialogDescription>
        </DialogHeader>

        {(isWildHorse ? customFieldsData?.introText : fieldsReady && formSettingsData?.setting?.introText) && (
          <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-form-intro">
            {isWildHorse ? customFieldsData?.introText : formSettingsData?.setting?.introText}
          </div>
        )}

        {!fieldsReady || restoredDraftKey !== draftKey ? (
          fieldsError ? (
            <Alert variant="destructive" data-testid="alert-application-fields-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                We couldn't load the complete application. Your saved progress is safe. Please retry before continuing.
                <Button type="button" variant="outline" className="mt-3" onClick={() => void retryFields()} disabled={fieldsFetching}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4" role="status" aria-label="Loading application questions">
              <p className="text-sm text-muted-foreground">Loading the complete application...</p>
              <div className="h-10 rounded-md bg-muted animate-pulse" />
              <div className="h-10 rounded-md bg-muted animate-pulse" />
              <div className="h-24 rounded-md bg-muted animate-pulse" />
            </div>
          )
        ) : <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit, onInvalid)} className="space-y-4">
            <FormField
              control={form.control}
              name="applicantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Full Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      {...field}
                      data-testid="input-applicant-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="applicantEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                      data-testid="input-applicant-email"
                    />
                  </FormControl>
                  <FormDescription>
                    We'll use this to contact you about your application.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="applicantPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Phone *</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      {...field}
                      data-testid="input-applicant-phone"
                    />
                  </FormControl>
                  <FormMessage />
                   <p className="text-xs text-muted-foreground mt-1">
                     {isWildHorse
                       ? "We'll use this number to contact you about your placement application. Text message consent below is optional."
                       : `By entering your number, you agree to receive mobile messages from ${tenant?.name || "Animal Rescue"}. Message frequency varies. Carrier rates may apply. Reply STOP to opt out.`}
                   </p>
                </FormItem>
              )}
            />

            <>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Main St"
                          {...field}
                          value={field.value ?? ""}
                          data-testid="input-applicant-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Phoenix"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-applicant-city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="AZ"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-applicant-state"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="85001"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-applicant-zip"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
            </>

            {!isWildHorse && <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tell Us About Yourself *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us about your home, experience with pets, why you'd like to adopt, etc... (minimum 100 characters)"
                      className="resize-none"
                      rows={4}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      data-testid="input-applicant-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Share relevant information about your living situation, experience with pets, or why you're interested in {animal?.name}. Minimum 100 characters required.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />}

            {/* Render custom form fields */}
            {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
              <>
                {customFieldsData.fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    {field.textAbove && (
                      <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-above-${field.id}`}>
                        {field.textAbove}
                      </div>
                    )}
                    {field.fieldType === 'text' && (
                      <FormField
                        control={form.control}
                        name={`customResponses.${field.id}` as any}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                            <FormControl>
                              <Input
                                {...formField}
                                placeholder={field.placeholder || ''}
                                data-testid={`input-custom-${field.id}`}
                              />
                            </FormControl>
                            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {field.fieldType === 'textarea' && (
                      <FormField
                        control={form.control}
                        name={`customResponses.${field.id}` as any}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                            <FormControl>
                              <Textarea
                                {...formField}
                                placeholder={field.placeholder || ''}
                                rows={3}
                                data-testid={`input-custom-${field.id}`}
                              />
                            </FormControl>
                            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {field.fieldType === 'select' && (
                      <FormField
                        control={form.control}
                        name={`customResponses.${field.id}` as any}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                            <Select onValueChange={formField.onChange} value={formField.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`select-custom-${field.id}`}>
                                  <SelectValue placeholder={field.placeholder || 'Select an option'} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {field.options?.filter(option => option.trim()).map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {field.fieldType === 'radio' && (
                      <FormField
                        control={form.control}
                        name={`customResponses.${field.id}` as any}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={formField.onChange}
                                value={formField.value}
                                data-testid={`radio-custom-${field.id}`}
                              >
                                {field.options?.filter(option => option.trim()).map((option) => (
                                  <div key={option} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                    <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {field.fieldType === 'checkbox' && (
                      <FormField
                        control={form.control}
                        name={`customResponses.${field.id}` as any}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                            <div className="space-y-2">
                              {field.options?.filter(option => option.trim()).map((option) => (
                                <div key={option} className="flex items-center space-x-2">
                                  <Checkbox
                                    checked={formField.value?.includes(option)}
                                    onCheckedChange={(checked) => {
                                      const currentValue = formField.value || [];
                                      const newValue = checked
                                        ? [...currentValue, option]
                                        : currentValue.filter((v: string) => v !== option);
                                      formField.onChange(newValue);
                                    }}
                                    id={`${field.id}-${option}`}
                                    data-testid={`checkbox-custom-${field.id}-${option}`}
                                  />
                                  <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                                </div>
                              ))}
                            </div>
                            {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {field.fieldType === 'photo' && (
                      <FormItem>
                        <FormLabel>{field.label} {field.required && '*'}</FormLabel>
                        <div className="space-y-3">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[field.id] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(field.id, file);
                            }}
                            data-testid={`input-photo-${field.id}`}
                          />
                          {!photoUploads[field.id] ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRefs.current[field.id]?.click()}
                              data-testid={`button-upload-${field.id}`}
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Photo
                            </Button>
                          ) : photoUploads[field.id].uploading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Uploading {photoUploads[field.id].name}...
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                              <img
                                src={photoUploads[field.id].url}
                                alt="Uploaded"
                                className="w-16 h-16 object-cover rounded"
                              />
                              <div className="flex-1 text-sm">
                                {photoUploads[field.id].name}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePhoto(field.id)}
                                data-testid={`button-remove-photo-${field.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                      </FormItem>
                    )}
                    {field.textBelow && (
                      <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-below-${field.id}`}>
                        {field.textBelow}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* SMS Consent Checkbox (mandatory for Twilio compliance) */}
            <FormField
              control={form.control}
              name="smsConsent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-sms-consent"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-normal">
                      I agree to receive text messages from {tenant?.name || "Animal Rescue"} regarding my {isWildHorse ? "placement" : "adoption"} application.{isWildHorse && " Optional."} Message frequency varies. Message & data rates may apply. Reply STOP to unsubscribe, HELP for help.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            {missingFieldLabels.length > 0 && (
              <Alert variant="destructive" data-testid="alert-missing-fields" className="relative pr-10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">
                    Please complete the following before submitting:
                  </div>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {missingFieldLabels.map((label) => (
                      <li key={label} data-testid={`text-missing-field-${label.replace(/\s+/g, '-').toLowerCase()}`}>{label}</li>
                    ))}
                  </ul>
                </AlertDescription>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1"
                  onClick={() => setMissingFieldLabels([])}
                  aria-label="Dismiss missing fields alert"
                  data-testid="button-dismiss-missing-fields"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground" data-testid="text-draft-autosave-hint">
              Your progress is automatically saved on this device, so you can safely come back and finish later.
            </p>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={applicationMutation.isPending}
                className="flex-1"
                data-testid="button-cancel-application"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={applicationMutation.isPending || !fieldsReady || Object.values(photoUploads).some(upload => upload.uploading)}
                className="flex-1"
                data-testid="button-submit-application"
              >
                {applicationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Application
              </Button>
            </div>
          </form>
        </Form>}
      </DialogContent>
    </Dialog>
  );
}
