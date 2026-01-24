import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Home, PawPrint, CheckCircle2 } from "lucide-react";
import type { FosterFormField } from "@shared/schema";

export default function FosterApplicationPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    applicantName: "",
    applicantEmail: "",
    applicantPhone: "",
    smsConsent: false,
    address: "",
    housingType: "house" as "house" | "apartment" | "condo" | "other",
    hasYard: false,
    hasOtherPets: false,
    otherPetsDetails: "",
    experience: "",
    availability: "",
    preferences: "",
    vetReference: "",
    personalReference: "",
    customResponses: {} as Record<string, any>,
  });

  const { data: customFieldsData, isLoading: isLoadingFields } = useQuery<{ fields: FosterFormField[] }>({
    queryKey: ['/api/foster-form-fields'],
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/foster-applications", data);
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Application Submitted!",
        description: "Thank you for applying to become a foster. We'll review your application and get back to you soon.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      customResponses: {
        ...prev.customResponses,
        [fieldId]: value,
      },
    }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-4">Application Submitted!</h1>
          <p className="text-lg text-muted-foreground mb-6">
            Thank you for your interest in becoming a foster! We'll review your application and contact you within 3-5 business days.
          </p>
          <Button onClick={() => window.location.href = "/"} data-testid="button-back-home">
            Return Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <Heart className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-4">Become a Foster</h1>
          <p className="text-lg text-muted-foreground">
            Open your home and heart to an animal in need. Foster parents provide temporary care and love while we find forever homes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="p-6 text-center">
            <Home className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Flexible Commitment</h3>
            <p className="text-sm text-muted-foreground">
              Foster for as long as you can - from a few weeks to several months
            </p>
          </Card>
          <Card className="p-6 text-center">
            <PawPrint className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">We Provide Support</h3>
            <p className="text-sm text-muted-foreground">
              Food, medical care, and supplies are covered by the rescue
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Heart className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Save Lives</h3>
            <p className="text-sm text-muted-foreground">
              Every foster home opened saves an animal's life
            </p>
          </Card>
        </div>

        <Card className="p-8">
          <h2 className="text-2xl font-bold mb-6">Foster Application</h2>
          
          {isLoadingFields ? (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="applicantName">Full Name *</Label>
                    <Input
                      id="applicantName"
                      value={formData.applicantName}
                      onChange={(e) => handleChange("applicantName", e.target.value)}
                      required
                      data-testid="input-applicant-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="applicantEmail">Email *</Label>
                    <Input
                      id="applicantEmail"
                      type="email"
                      value={formData.applicantEmail}
                      onChange={(e) => handleChange("applicantEmail", e.target.value)}
                      required
                      data-testid="input-applicant-email"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="applicantPhone">Phone *</Label>
                  <Input
                    id="applicantPhone"
                    type="tel"
                    value={formData.applicantPhone}
                    onChange={(e) => handleChange("applicantPhone", e.target.value)}
                    required
                    data-testid="input-applicant-phone"
                  />
                </div>

                <div className="flex items-start space-x-3 md:col-span-2">
                  <Checkbox
                    id="smsConsent"
                    checked={formData.smsConsent}
                    onCheckedChange={(checked) => handleChange("smsConsent", checked === true)}
                    data-testid="checkbox-sms-consent"
                  />
                  <Label htmlFor="smsConsent" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    I consent to receive text message updates regarding the status of my application and rescue operations. Reply STOP to unsubscribe.
                  </Label>
                </div>
              </div>

              {/* Housing Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Housing Information</h3>
                <div>
                  <Label htmlFor="address">Address *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    required
                    data-testid="input-address"
                  />
                </div>
                <div>
                  <Label htmlFor="housingType">Housing Type *</Label>
                  <Select
                    value={formData.housingType}
                    onValueChange={(value) => handleChange("housingType", value)}
                    required
                  >
                    <SelectTrigger id="housingType" data-testid="select-housing-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="condo">Condo</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasYard"
                    checked={formData.hasYard}
                    onCheckedChange={(checked) => handleChange("hasYard", checked)}
                    data-testid="checkbox-has-yard"
                  />
                  <Label htmlFor="hasYard">I have a yard</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasOtherPets"
                    checked={formData.hasOtherPets}
                    onCheckedChange={(checked) => handleChange("hasOtherPets", checked)}
                    data-testid="checkbox-has-other-pets"
                  />
                  <Label htmlFor="hasOtherPets">I have other pets</Label>
                </div>
                {formData.hasOtherPets && (
                  <div>
                    <Label htmlFor="otherPetsDetails">Please describe your other pets</Label>
                    <Textarea
                      id="otherPetsDetails"
                      value={formData.otherPetsDetails}
                      onChange={(e) => handleChange("otherPetsDetails", e.target.value)}
                      rows={3}
                      data-testid="textarea-other-pets-details"
                    />
                  </div>
                )}
              </div>

              {/* Experience & Availability Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Experience & Availability</h3>
                <div>
                  <Label htmlFor="experience">Previous Pet/Foster Experience *</Label>
                  <Textarea
                    id="experience"
                    value={formData.experience}
                    onChange={(e) => handleChange("experience", e.target.value)}
                    rows={3}
                    required
                    data-testid="textarea-experience"
                    placeholder="Tell us about your experience with animals..."
                  />
                </div>
                <div>
                  <Label htmlFor="availability">Availability *</Label>
                  <Textarea
                    id="availability"
                    value={formData.availability}
                    onChange={(e) => handleChange("availability", e.target.value)}
                    rows={3}
                    required
                    data-testid="textarea-availability"
                    placeholder="How long can you commit to fostering? Any scheduling constraints?"
                  />
                </div>
                <div>
                  <Label htmlFor="preferences">Preferences</Label>
                  <Textarea
                    id="preferences"
                    value={formData.preferences}
                    onChange={(e) => handleChange("preferences", e.target.value)}
                    rows={3}
                    data-testid="textarea-preferences"
                    placeholder="Animal type, size, age preferences, special needs..."
                  />
                </div>
              </div>

              {/* References Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">References</h3>
                <div>
                  <Label htmlFor="vetReference">Veterinary Reference</Label>
                  <Input
                    id="vetReference"
                    value={formData.vetReference}
                    onChange={(e) => handleChange("vetReference", e.target.value)}
                    data-testid="input-vet-reference"
                    placeholder="Veterinary clinic name and phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="personalReference">Personal Reference</Label>
                  <Input
                    id="personalReference"
                    value={formData.personalReference}
                    onChange={(e) => handleChange("personalReference", e.target.value)}
                    data-testid="input-personal-reference"
                    placeholder="Name and phone number"
                  />
                </div>
              </div>

              {/* Custom Questions Section */}
              {customFieldsData?.fields && customFieldsData.fields.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Additional Questions</h3>
                  {customFieldsData.fields.map((field) => (
                    <div key={field.id}>
                      {field.fieldType === 'text' && (
                        <div>
                          <Label htmlFor={field.id}>{field.label} {field.required && '*'}</Label>
                          <Input
                            id={field.id}
                            value={formData.customResponses[field.id] || ''}
                            onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                            placeholder={field.placeholder || ''}
                            required={field.required}
                            data-testid={`custom-field-${field.id}`}
                          />
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      )}

                      {field.fieldType === 'textarea' && (
                        <div>
                          <Label htmlFor={field.id}>{field.label} {field.required && '*'}</Label>
                          <Textarea
                            id={field.id}
                            value={formData.customResponses[field.id] || ''}
                            onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                            placeholder={field.placeholder || ''}
                            required={field.required}
                            rows={3}
                            data-testid={`custom-field-${field.id}`}
                          />
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      )}

                      {field.fieldType === 'select' && (
                        <div>
                          <Label htmlFor={field.id}>{field.label} {field.required && '*'}</Label>
                          <Select
                            value={formData.customResponses[field.id] || ''}
                            onValueChange={(value) => handleCustomFieldChange(field.id, value)}
                            required={field.required}
                          >
                            <SelectTrigger data-testid={`custom-field-${field.id}`}>
                              <SelectValue placeholder={field.placeholder || 'Select an option'} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.filter(option => option.trim()).map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      )}

                      {field.fieldType === 'radio' && (
                        <div>
                          <Label>{field.label} {field.required && '*'}</Label>
                          <RadioGroup
                            value={formData.customResponses[field.id] || ''}
                            onValueChange={(value) => handleCustomFieldChange(field.id, value)}
                            required={field.required}
                            data-testid={`custom-field-${field.id}`}
                          >
                            {field.options?.filter(option => option.trim()).map((option) => (
                              <div key={option} className="flex items-center space-x-2">
                                <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                              </div>
                            ))}
                          </RadioGroup>
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      )}

                      {field.fieldType === 'checkbox' && (
                        <div>
                          <Label>{field.label} {field.required && '*'}</Label>
                          <div className="space-y-2">
                            {field.options?.filter(option => option.trim()).map((option) => (
                              <div key={option} className="flex items-center space-x-2">
                                <Checkbox
                                  checked={(formData.customResponses[field.id] || []).includes(option)}
                                  onCheckedChange={(checked) => {
                                    const currentValue = formData.customResponses[field.id] || [];
                                    const newValue = checked
                                      ? [...currentValue, option]
                                      : currentValue.filter((v: string) => v !== option);
                                    handleCustomFieldChange(field.id, newValue);
                                  }}
                                  id={`${field.id}-${option}`}
                                  data-testid={`custom-field-${field.id}`}
                                />
                                <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                              </div>
                            ))}
                          </div>
                          {field.helpText && (
                            <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={mutation.isPending}
                  data-testid="button-submit-application"
                >
                  {mutation.isPending ? "Submitting..." : "Submit Foster Application"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
