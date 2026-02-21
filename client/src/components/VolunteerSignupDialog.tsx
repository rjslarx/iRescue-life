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
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Heart } from "lucide-react";
import type { VolunteerFormField } from "@shared/schema";
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

const volunteerSignupSchema = z.object({
  applicantName: z.string().min(2, "Name must be at least 2 characters"),
  applicantEmail: z.string().email("Please enter a valid email address"),
  applicantPhone: z.string().min(10, "Please enter a valid phone number"),
  customResponses: z.record(z.any()).optional(),
});

type VolunteerSignupFormData = z.infer<typeof volunteerSignupSchema>;

interface VolunteerSignupDialogProps {
  opportunityId: string | null;
  opportunityTitle: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function VolunteerSignupDialog({ 
  opportunityId, 
  opportunityTitle, 
  open, 
  onOpenChange,
  onSuccess 
}: VolunteerSignupDialogProps) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const { data: customFieldsData } = useQuery<{ fields: VolunteerFormField[] }>({
    queryKey: ['/api/volunteer-form-fields'],
  });

  const form = useForm<VolunteerSignupFormData>({
    resolver: zodResolver(volunteerSignupSchema),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      customResponses: {},
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: VolunteerSignupFormData) => {
      if (!opportunityId) throw new Error("No opportunity selected");
      
      const response = await apiRequest('POST', `/api/volunteer-opportunities/${opportunityId}/signup`, {
        applicantName: data.applicantName,
        applicantEmail: data.applicantEmail,
        applicantPhone: data.applicantPhone,
        customResponses: data.customResponses || {},
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: `You've successfully signed up for ${opportunityTitle}!`,
      });
      
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sign up",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: VolunteerSignupFormData) => {
    signupMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Sign Up to Volunteer
          </DialogTitle>
          <DialogDescription>
            Fill out this form to sign up for {opportunityTitle}. We'll contact you with more details soon.
          </DialogDescription>
        </DialogHeader>

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
                    We'll use this to contact you about the volunteer opportunity.
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
                  <p className="text-xs text-muted-foreground mt-1">By entering your number, you agree to receive mobile messages from {tenant?.name || "Animal Rescue"}. Message frequency varies. Carrier rates may apply. Reply STOP to opt out.</p>
                </FormItem>
              )}
            />

            {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
              <>
                {customFieldsData.fields.map((field) => (
                  <div key={field.id}>
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
                                data-testid={`custom-field-${field.id}`}
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
                                data-testid={`custom-field-${field.id}`}
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
                                <SelectTrigger data-testid={`custom-field-${field.id}`}>
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
                                data-testid={`custom-field-${field.id}`}
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
                                    data-testid={`custom-field-${field.id}`}
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
                  </div>
                ))}
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={signupMutation.isPending}
                className="flex-1"
                data-testid="button-cancel-signup"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={signupMutation.isPending}
                className="flex-1"
                data-testid="button-submit-signup"
              >
                {signupMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sign Up
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
