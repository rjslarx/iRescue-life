import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { Loader2, Calendar, MapPin, Phone, Send, Printer, AlertTriangle, Heart, Check } from "lucide-react";
import { format, addDays, addMonths } from "date-fns";
import type { Animal } from "@shared/schema";

interface HeartwormTreatmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal?: Animal;
  animalId?: string;
  animalName?: string;
  adopterName?: string;
  adopterEmail?: string;
  adopterPhone?: string;
  adoptionId?: string;
  onComplete?: () => void;
}

interface Appointment {
  type: 'start_doxy' | 'first_injection' | 'second_third_injection' | 'recheck' | 'proheart';
  label: string;
  scheduledDate: string;
  completedDate?: string | null;
  notes?: string | null;
}

function generateDefaultAppointments(startDate: Date): Appointment[] {
  return [
    {
      type: 'start_doxy',
      label: 'Start Doxycycline',
      scheduledDate: format(startDate, 'yyyy-MM-dd'),
    },
    {
      type: 'first_injection',
      label: '1st Injection (Immiticide)',
      scheduledDate: format(addDays(startDate, 30), 'yyyy-MM-dd'),
    },
    {
      type: 'second_third_injection',
      label: '2nd & 3rd Injection (Immiticide)',
      scheduledDate: format(addDays(startDate, 60), 'yyyy-MM-dd'),
    },
    {
      type: 'recheck',
      label: 'Recheck',
      scheduledDate: format(addDays(startDate, 90), 'yyyy-MM-dd'),
    },
    {
      type: 'proheart',
      label: 'Next Proheart (6-month prevention)',
      scheduledDate: format(addMonths(startDate, 6), 'yyyy-MM-dd'),
    },
  ];
}

export function HeartwormTreatmentModal({
  open,
  onOpenChange,
  animal,
  animalId: propsAnimalId,
  animalName: propsAnimalName,
  adopterName: initialAdopterName = '',
  adopterEmail: initialAdopterEmail = '',
  adopterPhone: initialAdopterPhone = '',
  adoptionId,
  onComplete,
}: HeartwormTreatmentModalProps) {
  const { toast } = useToast();
  const { tenant } = useTenant();
  
  // Resolve animal ID and name from either animal object or direct props
  const resolvedAnimalId = animal?.id || propsAnimalId;
  const resolvedAnimalName = animal?.name || propsAnimalName || 'Unknown Animal';
  
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appointments, setAppointments] = useState<Appointment[]>(generateDefaultAppointments(new Date()));
  const [locationName, setLocationName] = useState('Rice City Animal Hospital');
  const [locationAddress, setLocationAddress] = useState('2604 N. Main Street, Pearland, TX 77581');
  const [locationPhone, setLocationPhone] = useState('281-993-0300');
  const [notes, setNotes] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [step, setStep] = useState<'schedule' | 'review' | 'complete'>('schedule');
  const [adopterName, setAdopterName] = useState(initialAdopterName);
  const [adopterEmail, setAdopterEmail] = useState(initialAdopterEmail);
  const [adopterPhone, setAdopterPhone] = useState(initialAdopterPhone);

  // Reset state when modal opens to prevent stale data
  useEffect(() => {
    if (open) {
      const today = new Date();
      setStartDate(format(today, 'yyyy-MM-dd'));
      setAppointments(generateDefaultAppointments(today));
      setLocationName('Rice City Animal Hospital');
      setLocationAddress('2604 N. Main Street, Pearland, TX 77581');
      setLocationPhone('281-993-0300');
      setNotes('');
      setPlanId(null);
      setStep('schedule');
      setAdopterName(initialAdopterName);
      setAdopterEmail(initialAdopterEmail);
      setAdopterPhone(initialAdopterPhone);
    }
  }, [open, initialAdopterName, initialAdopterEmail, initialAdopterPhone]);

  const handleStartDateChange = (newDate: string) => {
    setStartDate(newDate);
    const date = new Date(newDate);
    setAppointments(generateDefaultAppointments(date));
  };

  const updateAppointmentDate = (index: number, newDate: string) => {
    setAppointments(prev => prev.map((appt, i) => 
      i === index ? { ...appt, scheduledDate: newDate } : appt
    ));
  };

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedAnimalId) {
        throw new Error('Animal ID is required');
      }
      if (!adopterName || !adopterEmail) {
        throw new Error('Adopter name and email are required');
      }
      const response = await apiRequest('POST', '/api/heartworm-treatment-plans', {
        animalId: resolvedAnimalId,
        adoptionId,
        adopterName,
        adopterEmail,
        adopterPhone,
        locationName,
        locationAddress,
        locationPhone,
        appointments,
        notes,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setPlanId(data.plan.id);
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['/api/heartworm-treatment-plans'] });
      toast({
        title: "Treatment plan created",
        description: "The heartworm treatment schedule has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create treatment plan",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/heartworm-treatment-plans/${planId}/send-email`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent!",
        description: `Treatment schedule emailed to ${adopterEmail}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const appointmentRows = appointments.map(appt => {
      const date = new Date(appt.scheduledDate);
      return `
        <tr>
          <td style="padding: 12px; border: 1px solid #d1d5db;">${appt.label}</td>
          <td style="padding: 12px; border: 1px solid #d1d5db;">${format(date, 'EEEE, MMMM d, yyyy')}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Heartworm Treatment Contract - ${resolvedAnimalName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
          h1 { color: #1f2937; border-bottom: 2px solid #dc2626; padding-bottom: 12px; }
          .warning { background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 24px 0; }
          .warning p { color: #dc2626; font-weight: bold; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin: 24px 0; }
          th { background: #f3f4f6; padding: 12px; text-align: left; border: 1px solid #d1d5db; }
          .location { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0; }
          .signature { margin-top: 48px; padding-top: 24px; border-top: 1px solid #d1d5db; }
          .signature-line { border-bottom: 1px solid #000; width: 300px; margin-top: 48px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>Heartworm Treatment Contract</h1>
        <h2>Patient: ${resolvedAnimalName}</h2>
        <p><strong>Adopter:</strong> ${adopterName}</p>
        <p><strong>Email:</strong> ${adopterEmail}</p>
        ${adopterPhone ? `<p><strong>Phone:</strong> ${adopterPhone}</p>` : ''}
        
        <div class="warning">
          <p>IMPORTANT: Completion of ALL heartworm treatment appointments is MANDATORY. Failure to complete treatment will result in the dog being reclaimed by ${tenant?.name || 'the rescue organization'}.</p>
        </div>

        <h3>Appointment Schedule</h3>
        <table>
          <thead>
            <tr>
              <th>Appointment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${appointmentRows}
          </tbody>
        </table>

        <h3>Treatment Location</h3>
        <div class="location">
          <p style="margin: 0; font-weight: bold;">${locationName}</p>
          <p style="margin: 4px 0 0 0;">${locationAddress}</p>
          <p style="margin: 4px 0 0 0;">Phone: ${locationPhone}</p>
        </div>

        ${notes ? `<h3>Additional Notes</h3><p>${notes}</p>` : ''}

        <div class="signature">
          <p>By signing below, I acknowledge that I have read and understand the heartworm treatment requirements for ${resolvedAnimalName}. I agree to complete all scheduled appointments and understand that failure to do so may result in the dog being reclaimed.</p>
          <div class="signature-line"></div>
          <p>Signature / Date</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleClose = () => {
    if (step === 'complete') {
      onComplete?.();
    }
    onOpenChange(false);
    setStep('schedule');
    setPlanId(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-heartworm-treatment">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            <DialogTitle>Heartworm Treatment Schedule: {resolvedAnimalName}</DialogTitle>
          </div>
          <DialogDescription>
            {step === 'schedule' && 'Set up the treatment schedule for this heartworm positive dog.'}
            {step === 'review' && 'Review the treatment schedule before creating the plan.'}
            {step === 'complete' && 'Treatment plan created successfully!'}
          </DialogDescription>
        </DialogHeader>

        {step === 'schedule' && (
          <div className="space-y-6">
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Heartworm Positive Dog</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      {resolvedAnimalName} requires a complete heartworm treatment protocol. 
                      All appointments are mandatory per the adoption agreement.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Adopter Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="adopter-name">Adopter Name *</Label>
                    <Input
                      id="adopter-name"
                      value={adopterName}
                      onChange={(e) => setAdopterName(e.target.value)}
                      placeholder="Enter adopter name"
                      className="mt-1"
                      data-testid="input-adopter-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adopter-email">Email *</Label>
                    <Input
                      id="adopter-email"
                      type="email"
                      value={adopterEmail}
                      onChange={(e) => setAdopterEmail(e.target.value)}
                      placeholder="adopter@email.com"
                      className="mt-1"
                      data-testid="input-adopter-email"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="adopter-phone">Phone</Label>
                  <Input
                    id="adopter-phone"
                    type="tel"
                    value={adopterPhone}
                    onChange={(e) => setAdopterPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="mt-1"
                    data-testid="input-adopter-phone"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div>
                <Label htmlFor="start-date">Treatment Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="mt-1"
                  data-testid="input-start-date"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Other appointment dates will auto-calculate from this date
                </p>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Appointment Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {appointments.map((appt, index) => (
                    <div key={appt.type} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Appt {index + 1}
                          </Badge>
                          <span className="font-medium text-sm">{appt.label}</span>
                        </div>
                      </div>
                      <Input
                        type="date"
                        value={appt.scheduledDate}
                        onChange={(e) => updateAppointmentDate(index, e.target.value)}
                        className="w-40"
                        data-testid={`input-appt-date-${index}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Treatment Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="location-name">Clinic Name</Label>
                    <Input
                      id="location-name"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="mt-1"
                      data-testid="input-location-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="location-address">Address</Label>
                    <Input
                      id="location-address"
                      value={locationAddress}
                      onChange={(e) => setLocationAddress(e.target.value)}
                      className="mt-1"
                      data-testid="input-location-address"
                    />
                  </div>
                  <div>
                    <Label htmlFor="location-phone">Phone</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="location-phone"
                        value={locationPhone}
                        onChange={(e) => setLocationPhone(e.target.value)}
                        data-testid="input-location-phone"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions or notes..."
                  className="mt-1"
                  data-testid="textarea-notes"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={() => setStep('review')} 
                disabled={!adopterName || !adopterEmail}
                data-testid="button-review"
              >
                Review Schedule
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Adopter</p>
                  <p className="font-medium">{adopterName}</p>
                  <p className="text-sm text-muted-foreground">{adopterEmail}</p>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Treatment Schedule</p>
                  <div className="space-y-2">
                    {appointments.map((appt, index) => (
                      <div key={appt.type} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{index + 1}</Badge>
                          <span className="text-sm">{appt.label}</span>
                        </div>
                        <span className="text-sm font-medium">
                          {format(new Date(appt.scheduledDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{locationName}</p>
                  <p className="text-sm">{locationAddress}</p>
                  <p className="text-sm">{locationPhone}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
              <CardContent className="pt-4">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  By creating this treatment plan, the adopter agrees that completion of ALL appointments 
                  is mandatory. Failure to complete treatment may result in the dog being reclaimed.
                </p>
              </CardContent>
            </Card>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep('schedule')} data-testid="button-back">
                Back
              </Button>
              <Button 
                onClick={() => createPlanMutation.mutate()} 
                disabled={createPlanMutation.isPending}
                data-testid="button-create-plan"
              >
                {createPlanMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Treatment Plan'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'complete' && (
          <div className="space-y-6">
            <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-900 dark:text-green-100">
                      Treatment Plan Created
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      The heartworm treatment schedule for {resolvedAnimalName} has been saved.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={handlePrint}
                variant="outline"
                className="w-full"
                data-testid="button-print"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Treatment Contract
              </Button>
              
              <Button 
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending}
                className="w-full"
                data-testid="button-send-email"
              >
                {sendEmailMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Email Schedule to Adopter
                  </>
                )}
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-done">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
