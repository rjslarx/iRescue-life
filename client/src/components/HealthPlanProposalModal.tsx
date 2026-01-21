import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Pill, Syringe, Heart, Bug, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface HealthPlanItem {
  type: string;
  dueDate: string;
  isRecurring: boolean;
  recurrenceRule?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  notes: string;
  enabled: boolean;
  reminderType: "vaccine_booster" | "heartworm" | "flea_tick" | "other";
}

interface HealthPreviewResponse {
  animalId: string;
  animalName: string;
  species: string;
  adoptionDate: string;
  proposedReminders: HealthPlanItem[];
  recentVaccinations: Array<{
    name: string;
    dateGiven: string;
    expirationDate?: string;
  }>;
}

interface HealthPlanProposalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
  adopterId: string;
  adopterName: string;
  adoptionDate?: Date;
  onComplete?: () => void;
}

function getReminderIcon(reminderType: string) {
  switch (reminderType) {
    case "vaccine_booster":
      return <Syringe className="h-4 w-4" />;
    case "heartworm":
      return <Heart className="h-4 w-4" />;
    case "flea_tick":
      return <Bug className="h-4 w-4" />;
    default:
      return <Pill className="h-4 w-4" />;
  }
}

function getReminderBadgeColor(reminderType: string) {
  switch (reminderType) {
    case "vaccine_booster":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "heartworm":
      return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    case "flea_tick":
      return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

export function HealthPlanProposalModal({
  open,
  onOpenChange,
  animalId,
  animalName,
  adopterId,
  adopterName,
  adoptionDate,
  onComplete,
}: HealthPlanProposalModalProps) {
  const { toast } = useToast();
  const [editableReminders, setEditableReminders] = useState<HealthPlanItem[]>([]);

  const { data: healthPreview, isLoading } = useQuery<HealthPreviewResponse>({
    queryKey: ["/api/adopter/staff/animals", animalId, "health-preview", adoptionDate?.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (adoptionDate) {
        params.set("adoptionDate", adoptionDate.toISOString());
      }
      const response = await fetch(`/api/adopter/staff/animals/${animalId}/health-preview?${params}`);
      if (!response.ok) throw new Error("Failed to fetch health preview");
      return response.json();
    },
    enabled: open && !!animalId,
  });

  useEffect(() => {
    if (healthPreview?.proposedReminders) {
      setEditableReminders(healthPreview.proposedReminders.map(r => ({
        ...r,
        dueDate: typeof r.dueDate === 'string' ? r.dueDate : new Date(r.dueDate).toISOString(),
      })));
    }
  }, [healthPreview]);

  const createRemindersMutation = useMutation({
    mutationFn: async (reminders: HealthPlanItem[]) => {
      const enabledReminders = reminders.filter(r => r.enabled);
      const response = await apiRequest("POST", "/api/adopter/staff/health-plan/bulk-create", {
        animalId,
        adopterId,
        reminders: enabledReminders.map(r => ({
          type: r.type,
          dueDate: r.dueDate,
          isRecurring: r.isRecurring,
          recurrenceRule: r.recurrenceRule,
          notes: r.notes,
          reminderType: r.reminderType,
        })),
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Health plan created",
        description: `${data.reminders.length} health reminders scheduled for ${animalName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/adopter/staff/compliance"] });
      onComplete?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create health plan",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const toggleReminder = (index: number) => {
    setEditableReminders(prev => 
      prev.map((r, i) => i === index ? { ...r, enabled: !r.enabled } : r)
    );
  };

  const updateDueDate = (index: number, newDate: string) => {
    setEditableReminders(prev =>
      prev.map((r, i) => i === index ? { ...r, dueDate: new Date(newDate).toISOString() } : r)
    );
  };

  const handleSubmit = () => {
    createRemindersMutation.mutate(editableReminders);
  };

  const handleSkip = () => {
    toast({
      title: "Health plan skipped",
      description: "You can set up health reminders later from the animal's profile",
    });
    onComplete?.();
    onOpenChange(false);
  };

  const enabledCount = editableReminders.filter(r => r.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]" data-testid="dialog-health-plan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Health Plan for {animalName}
          </DialogTitle>
          <DialogDescription>
            Review and customize the automated health reminders for {adopterName}. 
            These reminders will be sent to the adopter on schedule.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-3 py-2">
              {healthPreview?.recentVaccinations && healthPreview.recentVaccinations.length > 0 && (
                <Card className="mb-4">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Recent Vaccinations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {healthPreview.recentVaccinations.map((v, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {v.name} ({format(parseISO(v.dateGiven), "MMM d, yyyy")})
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {editableReminders.map((reminder, index) => (
                <Card 
                  key={index} 
                  className={`transition-opacity ${!reminder.enabled ? 'opacity-50' : ''}`}
                  data-testid={`reminder-card-${index}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={reminder.enabled}
                        onCheckedChange={() => toggleReminder(index)}
                        data-testid={`checkbox-reminder-${index}`}
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getReminderIcon(reminder.reminderType)}
                            <span className="font-medium">{reminder.type}</span>
                            <Badge className={`text-xs ${getReminderBadgeColor(reminder.reminderType)}`}>
                              {reminder.isRecurring ? reminder.recurrenceRule : "One-time"}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{reminder.notes}</p>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`date-${index}`} className="text-sm">Due:</Label>
                          <Input
                            id={`date-${index}`}
                            type="date"
                            value={reminder.dueDate ? format(parseISO(reminder.dueDate), "yyyy-MM-dd") : ""}
                            onChange={(e) => updateDueDate(index, e.target.value)}
                            className="w-40 h-8"
                            disabled={!reminder.enabled}
                            data-testid={`input-date-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {editableReminders.length === 0 && !isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>No health reminders could be generated.</p>
                  <p className="text-sm">You can add reminders manually later.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip} data-testid="button-skip-health-plan">
            Skip for now
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createRemindersMutation.isPending || enabledCount === 0}
            data-testid="button-approve-health-plan"
          >
            {createRemindersMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Approve & Create ({enabledCount} reminders)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
