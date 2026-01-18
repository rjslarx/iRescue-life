import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Heart, Upload, X } from "lucide-react";
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
  notes: z.string().min(100, "Please tell us a bit more about yourself (minimum 100 characters)"),
  customResponses: z.record(z.any()).optional(),
});

type PublicAdoptionFormData = z.infer<typeof publicAdoptionSchema>;

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
  const { gclid, clearGclid } = useGoogleClickId();

  // Load custom form fields
  const { data: customFieldsData } = useQuery<{ fields: AdoptionFormField[] }>({
    queryKey: ['/api/adoption-form-fields'],
  });

  // Load form intro text
  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'adoption'],
  });

  const form = useForm<PublicAdoptionFormData>({
    resolver: zodResolver(publicAdoptionSchema),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      notes: "",
      customResponses: {},
    },
  });

  const [photoUploads, setPhotoUploads] = useState<Record<string, { url: string; name: string; uploading: boolean }>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Prepopulate animal name in any text field that contains "animal" in the label
  useEffect(() => {
    if (animal && customFieldsData?.fields && open) {
      customFieldsData.fields.forEach((field) => {
        if (field.fieldType === 'text' && field.label.toLowerCase().includes('animal')) {
          const currentValue = form.getValues(`customResponses.${field.id}` as any);
          if (!currentValue) {
            form.setValue(`customResponses.${field.id}` as any, animal.name);
          }
        }
      });
    }
  }, [animal, customFieldsData?.fields, open, form]);

  const handlePhotoUpload = async (fieldId: string, file: File) => {
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
      setPhotoUploads(prev => ({ ...prev, [fieldId]: { url: result.fileUrl, name: file.name, uploading: false } }));
      form.setValue(`customResponses.${fieldId}` as any, result.fileUrl);
    } catch (error: any) {
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
      
      const response = await apiRequest('POST', '/api/applications', {
        animalId: animal.id,
        applicantName: data.applicantName,
        applicantEmail: data.applicantEmail,
        applicantPhone: data.applicantPhone,
        notes: data.notes || null,
        customResponses: data.customResponses || {},
        gclid: gclid || undefined,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Application submitted!",
        description: `Thank you for your interest in adopting ${animal?.name}! We'll review your application and be in touch soon.`,
      });
      
      clearGclid();
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
    applicationMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Apply to Adopt {animal?.name}
          </DialogTitle>
          <DialogDescription>
            Fill out this application to express your interest in adopting {animal?.name}, 
            a {animal?.breed} {animal?.species}. Our team will review your application and contact you soon.
          </DialogDescription>
        </DialogHeader>

        {formSettingsData?.setting?.introText && (
          <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-form-intro">
            {formSettingsData.setting.introText}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                  <FormLabel>Phone Number *</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      {...field}
                      data-testid="input-applicant-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
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
            />

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
                disabled={applicationMutation.isPending}
                className="flex-1"
                data-testid="button-submit-application"
              >
                {applicationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Application
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
