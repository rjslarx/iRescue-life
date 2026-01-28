import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Cpu } from "lucide-react";
import type { Animal } from "@shared/schema";

interface PendingMicrochip {
  id: string;
  microchipNumber: string;
  registrationStatus: string;
}

interface MicrochipWarning {
  message: string;
  pendingMicrochips: PendingMicrochip[];
}

const adoptionSchema = z.object({
  applicationId: z.string().optional(),
  adopterName: z.string().min(1, "Adopter name is required"),
  adopterEmail: z.string().email("Valid email is required"),
  adopterPhone: z.string().min(1, "Phone number is required"),
  adoptionDate: z.string().optional(),
  adoptionFee: z.string().optional(),
  notes: z.string().optional(),
});

type AdoptionFormData = z.infer<typeof adoptionSchema>;

interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  stage: string;
}

interface AdoptionDialogProps {
  animal: Animal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (animalId?: string) => void;
  pendingEdits?: Record<string, any> | null;
  prefilledData?: {
    adopterName?: string;
    adopterEmail?: string;
    adopterPhone?: string;
    applicationId?: string;
  };
}

export function AdoptionDialog({ animal, open, onOpenChange, onSuccess, pendingEdits, prefilledData }: AdoptionDialogProps) {
  const { toast } = useToast();
  const [microchipWarning, setMicrochipWarning] = useState<MicrochipWarning | null>(null);
  const [confirmMicrochipPending, setConfirmMicrochipPending] = useState(false);

  const form = useForm<AdoptionFormData>({
    resolver: zodResolver(adoptionSchema),
    defaultValues: {
      applicationId: prefilledData?.applicationId || "",
      adopterName: prefilledData?.adopterName || "",
      adopterEmail: prefilledData?.adopterEmail || "",
      adopterPhone: prefilledData?.adopterPhone || "",
      adoptionDate: new Date().toISOString().split('T')[0], // Today's date
      adoptionFee: "",
      notes: "",
    },
  });

  // Reset form when dialog opens and apply prefill data if provided
  React.useEffect(() => {
    if (open) {
      // Always reset to fresh defaults when opening
      form.reset({
        applicationId: prefilledData?.applicationId || '',
        adopterName: prefilledData?.adopterName || '',
        adopterEmail: prefilledData?.adopterEmail || '',
        adopterPhone: prefilledData?.adopterPhone || '',
        adoptionDate: new Date().toISOString().split('T')[0],
        adoptionFee: '',
        notes: '',
      });
      // Reset microchip warning state
      setMicrochipWarning(null);
      setConfirmMicrochipPending(false);
    }
  }, [open, prefilledData, form]);

  // Fetch approved applications for this animal
  const { data: applicationsData, isLoading: isLoadingApplications } = useQuery<{ applications: Application[] }>({
    queryKey: ['/api/applications', animal?.id, 'approved'],
    enabled: open && !!animal?.id,
  });

  const applications = applicationsData?.applications || [];

  const adoptionMutation = useMutation({
    mutationFn: async (data: AdoptionFormData & { confirmMicrochipPending?: boolean }) => {
      if (!animal) throw new Error("No animal selected");
      
      const response = await apiRequest('POST', '/api/adoptions', {
        animalId: animal.id,
        applicationId: data.applicationId || null,
        adopterName: data.adopterName,
        adopterEmail: data.adopterEmail,
        adopterPhone: data.adopterPhone,
        adoptionDate: data.adoptionDate ? new Date(data.adoptionDate) : new Date(),
        adoptionFee: data.adoptionFee || null,
        notes: data.notes || null,
        confirmMicrochipPending: data.confirmMicrochipPending || false,
      });
      
      return response.json();
    },
    onSuccess: async () => {
      // If there are pending edits (non-status fields), apply them now
      if (pendingEdits && animal?.id && Object.keys(pendingEdits).length > 0) {
        try {
          await apiRequest('PATCH', `/api/animals/${animal.id}`, pendingEdits);
        } catch (error) {
          console.error('Failed to apply pending edits:', error);
          // Continue anyway - the adoption succeeded
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/adoptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      
      toast({
        title: "Adoption recorded",
        description: `${animal?.name} has been marked as adopted.`,
      });
      
      // Reset microchip warning state
      setMicrochipWarning(null);
      setConfirmMicrochipPending(false);
      
      form.reset();
      onSuccess(animal?.id);
      onOpenChange(false);
    },
    onError: (error: any) => {
      // apiRequest throws errors in format "STATUS: JSON_BODY"
      // Check if this is a 409 microchip warning
      const errorMessage = error.message || '';
      if (errorMessage.startsWith('409:')) {
        try {
          // Parse the JSON body from the error message
          const jsonStr = errorMessage.substring(4).trim();
          const errorData = JSON.parse(jsonStr);
          
          if (errorData.code === 'MICROCHIP_TRANSFER_PENDING') {
            setMicrochipWarning({
              message: errorData.message || 'Microchip transfer pending',
              pendingMicrochips: errorData.pendingMicrochips || [],
            });
            return; // Don't show error toast for warnings
          }
        } catch {
          // If JSON parsing fails, fall through to generic error handling
        }
      }
      
      toast({
        title: "Failed to record adoption",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AdoptionFormData) => {
    // If we have a microchip warning and user confirmed, include the confirmation flag
    if (microchipWarning && confirmMicrochipPending) {
      adoptionMutation.mutate({ ...data, confirmMicrochipPending: true });
    } else {
      adoptionMutation.mutate(data);
    }
  };

  // When an application is selected, auto-fill the adopter info
  const handleApplicationSelect = (applicationId: string) => {
    const selectedApp = applications.find(app => app.id === applicationId);
    if (selectedApp) {
      form.setValue('adopterName', selectedApp.applicantName);
      form.setValue('adopterEmail', selectedApp.applicantEmail);
      form.setValue('adopterPhone', selectedApp.applicantPhone);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Adoption</DialogTitle>
          <DialogDescription>
            Record the adoption of {animal?.name}. You can select an approved application or enter adopter information manually.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {applications.length > 0 && (
              <FormField
                control={form.control}
                name="applicationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approved Application (Optional)</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        const actualValue = value === "none" ? "" : value;
                        field.onChange(actualValue);
                        handleApplicationSelect(actualValue);
                      }} 
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-application">
                          <SelectValue placeholder={isLoadingApplications ? "Loading applications..." : "Select an approved application (optional)"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None - Enter manually</SelectItem>
                        {applications.map((app) => (
                          <SelectItem key={app.id} value={app.id}>
                            {app.applicantName} ({app.applicantEmail})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Selecting an application will auto-fill adopter information.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="adopterName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adopter Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      {...field}
                      data-testid="input-adopter-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adopterEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adopter Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                      data-testid="input-adopter-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adopterPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adopter Phone *</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      {...field}
                      data-testid="input-adopter-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="adoptionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adoption Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-adoption-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adoptionFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adoption Fee ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="150.00"
                        {...field}
                        data-testid="input-adoption-fee"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes about the adoption..."
                      className="resize-none"
                      rows={3}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      data-testid="input-adoption-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional notes about the adoption.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Microchip Transfer Warning */}
            {microchipWarning && (
              <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950" data-testid="alert-microchip-warning">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200">Microchip Transfer Pending</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  <p className="mb-3">{microchipWarning.message}</p>
                  
                  <div className="space-y-2 mb-4">
                    {microchipWarning.pendingMicrochips.map((chip) => (
                      <Card key={chip.id} className="bg-white/50 dark:bg-black/20">
                        <CardContent className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-amber-600" />
                            <span className="font-mono text-sm">{chip.microchipNumber}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {chip.registrationStatus.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="confirm-microchip"
                      checked={confirmMicrochipPending}
                      onCheckedChange={(checked) => setConfirmMicrochipPending(checked === true)}
                      data-testid="checkbox-confirm-microchip"
                    />
                    <label 
                      htmlFor="confirm-microchip" 
                      className="text-sm cursor-pointer leading-tight"
                    >
                      I confirm that the microchip registration transfer is in progress or will be completed after adoption
                    </label>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={adoptionMutation.isPending}
                data-testid="button-cancel-adoption"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adoptionMutation.isPending || (microchipWarning !== null && !confirmMicrochipPending)}
                data-testid="button-record-adoption"
              >
                {adoptionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {microchipWarning ? 'Confirm & Record Adoption' : 'Record Adoption'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
