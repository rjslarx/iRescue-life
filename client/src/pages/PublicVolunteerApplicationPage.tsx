import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Users, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSEO } from "@/hooks/useSEO";
import { insertVolunteerApplicationSchema, type InsertVolunteerApplication, type Tenant, type VolunteerFormField } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

export default function PublicVolunteerApplicationPage() {
  const { toast } = useToast();

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  // Load custom form fields
  const { data: customFieldsData } = useQuery<{ fields: VolunteerFormField[] }>({
    queryKey: ['/api/volunteer-form-fields'],
  });

  // Load form intro text
  const { data: formSettingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'volunteer'],
  });

  // Extend schema to make emergency contact fields required
  const volunteerFormSchema = insertVolunteerApplicationSchema
    .omit({ tenantId: true, status: true, notes: true })
    .extend({
      emergencyContactName: insertVolunteerApplicationSchema.shape.emergencyContactName.unwrap().min(1, "Emergency contact name is required"),
      emergencyContactPhone: insertVolunteerApplicationSchema.shape.emergencyContactPhone.unwrap().min(1, "Emergency contact phone is required"),
    });

  const form = useForm<InsertVolunteerApplication & { customResponses?: Record<string, any> }>({
    resolver: zodResolver(volunteerFormSchema),
    defaultValues: {
      applicantName: "",
      applicantEmail: "",
      applicantPhone: "",
      address: "",
      experience: "",
      availability: "",
      interests: "",
      skills: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: InsertVolunteerApplication) => {
      return await apiRequest("POST", "/api/volunteer-applications", data);
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted!",
        description: "Thank you for applying to volunteer. We'll review your application and contact you soon.",
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit application. Please try again.",
      });
    },
  });

  const onSubmit = (data: InsertVolunteerApplication) => {
    submitMutation.mutate(data);
  };

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Volunteer Application - ${rescueName}`,
    description: `Apply to volunteer with ${rescueName}. Help make a difference in the lives of animals in need by joining our dedicated volunteer team.`,
    siteName: rescueName,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader rescueName={tenant?.name || "Animal Rescue"} logoUrl={tenant?.logoUrl || undefined} />

      <main className="flex-1">
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container px-6">
            <div className="text-center max-w-3xl mx-auto">
              <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                Join Our Volunteer Team
              </h1>
              <p className="text-lg text-muted-foreground">
                Make a difference in the lives of animals in need. Join our dedicated team of volunteers
                and help us provide care, love, and support to rescued animals.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container px-6">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <Users className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Community</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Join a passionate community of animal lovers working together to save lives.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Calendar className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Flexible Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Volunteer on your own schedule with opportunities that fit your availability.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Heart className="w-8 h-8 mb-2 text-primary" />
                    <CardTitle>Make an Impact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Every hour you volunteer makes a real difference in an animal's life.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Volunteer Application</CardTitle>
                  <CardDescription>
                    Please fill out the form below to apply to become a volunteer. We'll review your application
                    and contact you within a few days.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {formSettingsData?.setting?.introText && (
                    <div className="mb-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-form-intro">
                      {formSettingsData.setting.introText}
                    </div>
                  )}

                  <Alert className="mb-6">
                    <AlertDescription>
                      <strong>What to Expect:</strong> After submitting your application, our volunteer coordinator
                      will review it and reach out to schedule an orientation session. We'll match you with
                      opportunities that align with your interests and availability.
                    </AlertDescription>
                  </Alert>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Contact Information</h3>
                        
                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="applicantName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="John Doe" {...field} data-testid="input-applicant-name" />
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
                                <FormLabel>Email *</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="john@example.com" {...field} data-testid="input-applicant-email" />
                                </FormControl>
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
                                  <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-applicant-phone" />
                                </FormControl>
                                <FormMessage />
                                <p className="text-xs text-muted-foreground mt-1">By entering your number, you agree to receive mobile messages from {tenant?.name || "Animal Rescue"}. Message frequency varies. Carrier rates may apply. Reply STOP to opt out.</p>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                  <Input placeholder="123 Main St, City, State ZIP" {...field} value={field.value || ''} data-testid="input-address" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Volunteer Details</h3>

                        <FormField
                          control={form.control}
                          name="experience"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Experience with Animals *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Tell us about your experience with animals (pets, volunteering, work experience, etc.)"
                                  {...field}
                                  rows={4}
                                  data-testid="input-experience"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="availability"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Availability *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="When are you available to volunteer? (e.g., weekdays, weekends, mornings, evenings)"
                                  {...field}
                                  rows={3}
                                  data-testid="input-availability"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="interests"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Areas of Interest</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="What volunteer activities interest you? (e.g., dog walking, cat socialization, administrative work, events, fundraising)"
                                  {...field}
                                  value={field.value || ''}
                                  rows={3}
                                  data-testid="input-interests"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="skills"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Special Skills or Qualifications</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Do you have any special skills that could help? (e.g., photography, social media, carpentry, veterinary experience)"
                                  {...field}
                                  value={field.value || ''}
                                  rows={3}
                                  data-testid="input-skills"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Emergency Contact</h3>
                        
                        <div className="grid md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="emergencyContactName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Emergency Contact Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Jane Doe" {...field} value={field.value || ''} data-testid="input-emergency-contact-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="emergencyContactPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Emergency Contact Phone *</FormLabel>
                                <FormControl>
                                  <Input type="tel" placeholder="(555) 987-6543" {...field} value={field.value || ''} data-testid="input-emergency-contact-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Render custom form fields */}
                      {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Additional Information</h3>
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
                              {field.textBelow && (
                                <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-below-${field.id}`}>
                                  {field.textBelow}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end pt-4">
                        <Button
                          type="submit"
                          size="lg"
                          disabled={submitMutation.isPending}
                          data-testid="button-submit"
                        >
                          {submitMutation.isPending ? "Submitting..." : "Submit Application"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 bg-card">
        <div className="container px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {tenant?.name || "Animal Rescue"}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
