import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  Phone, 
  MessageSquare, 
  Mail, 
  Star,
  Check,
  X,
  Home,
  Dog,
  Users,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  PawPrint,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const DECLINE_REASONS = [
  { value: "no_space", label: "No Space Available" },
  { value: "behavioral", label: "Behavioral Issues Beyond Our Capacity" },
  { value: "out_of_area", label: "Out of Service Area" },
  { value: "medical", label: "Medical Needs Beyond Our Capacity" },
  { value: "breed_restriction", label: "Breed Restriction" },
  { value: "other", label: "Other" }
];

export type ApplicationType = "adoption" | "foster" | "volunteer" | "intake";

interface AdoptionData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  stage: string;
  notes?: string;
  customResponses?: Record<string, any>;
  smsConsent?: boolean;
  createdAt: string;
  animal?: {
    id: string;
    name: string;
  };
}

interface FosterData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  address?: string;
  housingType?: string;
  hasYard?: boolean;
  hasOtherPets?: boolean;
  otherPetsDetails?: string;
  experience?: string;
  availability?: string;
  status: string;
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

interface VolunteerData {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  address?: string;
  experience?: string;
  availability?: string;
  interests?: string;
  skills?: string;
  status: string;
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

interface IntakeData {
  id: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
  dogBreed?: string;
  dogAge?: string;
  dogGender?: string;
  spayedNeutered?: boolean;
  goodWithKids?: string;
  goodWithDogs?: string;
  goodWithCats?: string;
  reasonForSurrender: string;
  medicalIssues?: string;
  behavioralIssues?: string;
  status: string;
  notes?: string;
  smsConsent?: boolean;
  createdAt: string;
}

export type ApplicationData = AdoptionData | FosterData | VolunteerData | IntakeData;

interface ApplicationDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: ApplicationType;
  data: ApplicationData | null;
}

const adoptionStages = ["new", "screening", "vet_check", "home_visit", "approved", "trial", "adopted", "denied"];
const fosterVolunteerStatuses = ["pending", "approved", "rejected"];
const intakeStatuses = ["new", "review", "spacecheck", "waitlist", "scheduled", "intaken", "declined"];

const stageLabels: Record<string, string> = {
  new: "New",
  screening: "Screening",
  vet_check: "Vet Check",
  home_visit: "Home Visit",
  approved: "Approved",
  trial: "Trial",
  adopted: "Adopted",
  denied: "Denied",
  pending: "Pending",
  rejected: "Rejected",
  review: "Review",
  spacecheck: "Space Check",
  waitlist: "Waitlist",
  scheduled: "Scheduled",
  intaken: "Intaken",
  declined: "Declined",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const stageVariants: Record<string, BadgeVariant> = {
  new: "default",
  screening: "secondary",
  vet_check: "secondary",
  home_visit: "secondary",
  approved: "default",
  trial: "secondary",
  adopted: "default",
  denied: "destructive",
  pending: "secondary",
  rejected: "destructive",
  review: "secondary",
  spacecheck: "secondary",
  waitlist: "outline",
  scheduled: "default",
  intaken: "default",
  declined: "destructive",
};

function getNextStage(type: ApplicationType, currentStage: string): string | null {
  if (type === "adoption") {
    const idx = adoptionStages.indexOf(currentStage);
    if (idx >= 0 && idx < adoptionStages.length - 1 && currentStage !== "denied") {
      return adoptionStages[idx + 1];
    }
  } else if (type === "foster" || type === "volunteer") {
    if (currentStage === "pending") return "approved";
  } else if (type === "intake") {
    const idx = intakeStatuses.indexOf(currentStage);
    if (idx >= 0 && idx < intakeStatuses.length - 1 && currentStage !== "declined") {
      return intakeStatuses[idx + 1];
    }
  }
  return null;
}

function getApiEndpoint(type: ApplicationType): string {
  switch (type) {
    case "adoption": return "/api/applications";
    case "foster": return "/api/foster-applications";
    case "volunteer": return "/api/volunteer-applications";
    case "intake": return "/api/surrender-requests";
  }
}

function getQueryKey(type: ApplicationType): string {
  return getApiEndpoint(type);
}

function getName(type: ApplicationType, data: ApplicationData): string {
  if (type === "intake") {
    return (data as IntakeData).ownerName;
  }
  return (data as AdoptionData | FosterData | VolunteerData).applicantName;
}

function getEmail(type: ApplicationType, data: ApplicationData): string {
  if (type === "intake") {
    return (data as IntakeData).ownerEmail;
  }
  return (data as AdoptionData | FosterData | VolunteerData).applicantEmail;
}

function getPhone(type: ApplicationType, data: ApplicationData): string {
  if (type === "intake") {
    return (data as IntakeData).ownerPhone;
  }
  return (data as AdoptionData | FosterData | VolunteerData).applicantPhone;
}

function getStatus(type: ApplicationType, data: ApplicationData): string {
  if (type === "adoption") {
    return (data as AdoptionData).stage;
  }
  return (data as FosterData | VolunteerData | IntakeData).status;
}

function getSmsConsent(data: ApplicationData): boolean {
  return data.smsConsent ?? false;
}

export default function ApplicationDetailSheet({
  isOpen,
  onClose,
  type,
  data,
}: ApplicationDetailSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");

  const declineMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/surrender/${id}/decline`, { reason });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      toast({
        title: "Request Declined",
        description: "The intake request has been declined.",
      });
      setShowRejectDialog(false);
      setDeclineReason("");
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to decline the request.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ newStatus }: { newStatus: string }) => {
      const endpoint = getApiEndpoint(type);
      const statusField = type === "adoption" ? "stage" : "status";
      return apiRequest(`${endpoint}/${data?.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [statusField]: newStatus }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getQueryKey(type)] });
      toast({
        title: "Status updated",
        description: "The application status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update the application status.",
        variant: "destructive",
      });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/surrender/${data?.id}/promote`, {
        method: "POST",
      });
      return response as { success: boolean; animalId: string; animalName: string; message: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surrender-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
      toast({
        title: "Animal Added to System",
        description: `${result.animalName} is now in the system and ready for vetting!`,
      });
      onClose();
      setLocation(`/dashboard/animals?highlight=${result.animalId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to promote intake to animal record.",
        variant: "destructive",
      });
    },
  });

  if (!data) return null;

  const name = getName(type, data);
  const email = getEmail(type, data);
  const phone = getPhone(type, data);
  const currentStatus = getStatus(type, data);
  const nextStage = getNextStage(type, currentStatus);
  const hasSmsConsent = getSmsConsent(data);

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ newStatus });
  };

  const handleAdvance = () => {
    if (nextStage) {
      updateMutation.mutate({ newStatus: nextStage });
    }
  };

  const handleReject = () => {
    if (type === "intake" && data?.id) {
      const reasonLabel = DECLINE_REASONS.find(r => r.value === declineReason)?.label || declineReason;
      declineMutation.mutate({ id: data.id, reason: reasonLabel });
    } else {
      const rejectStatus = type === "adoption" ? "denied" : "rejected";
      updateMutation.mutate({ newStatus: rejectStatus });
      setShowRejectDialog(false);
      onClose();
    }
  };

  const getStatusOptions = () => {
    switch (type) {
      case "adoption": return adoptionStages;
      case "foster":
      case "volunteer": return fosterVolunteerStatuses;
      case "intake": return intakeStatuses;
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case "adoption": return <Star className="h-4 w-4" />;
      case "foster": return <Home className="h-4 w-4" />;
      case "volunteer": return <Users className="h-4 w-4" />;
      case "intake": return <Dog className="h-4 w-4" />;
    }
  };

  const renderDealbreakerSection = () => {
    if (type === "adoption") {
      const adoptionData = data as AdoptionData;
      const customResponses = adoptionData.customResponses || {};
      return (
        <div className="space-y-2" data-testid="dealbreaker-section-adoption">
          <SummaryItem 
            label="Home Type" 
            value={customResponses.homeOwnership || customResponses.housingType || "Not specified"} 
            warning={customResponses.homeOwnership === "rent" && !customResponses.hasLandlordApproval}
          />
          <SummaryItem 
            label="Fenced Yard" 
            value={customResponses.hasFence ? "Yes" : "No"} 
            warning={!customResponses.hasFence}
          />
          <SummaryItem 
            label="Current Pets" 
            value={customResponses.hasOtherPets ? (customResponses.otherPetsDetails || "Yes") : "None"}
          />
          <SummaryItem 
            label="Vet Contact" 
            value={customResponses.vetName || customResponses.vetContact || "Not provided"}
            warning={!customResponses.vetName && !customResponses.vetContact}
          />
        </div>
      );
    }

    if (type === "intake") {
      const intakeData = data as IntakeData;
      return (
        <div className="space-y-2" data-testid="dealbreaker-section-intake">
          <SummaryItem 
            label="Reason for Surrender" 
            value={intakeData.reasonForSurrender}
            warning
          />
          <SummaryItem 
            label="Animal Age" 
            value={intakeData.dogAge || "Not specified"}
          />
          <SummaryItem 
            label="Spayed/Neutered" 
            value={intakeData.spayedNeutered ? "Yes" : "No"}
            warning={!intakeData.spayedNeutered}
          />
          <SummaryItem 
            label="Aggression History" 
            value={intakeData.behavioralIssues || "None reported"}
            warning={!!intakeData.behavioralIssues}
          />
        </div>
      );
    }

    if (type === "foster") {
      const fosterData = data as FosterData;
      return (
        <div className="space-y-2" data-testid="dealbreaker-section-foster">
          <SummaryItem 
            label="Experience Level" 
            value={fosterData.experience || "Not specified"}
          />
          <SummaryItem 
            label="Home Activity Level" 
            value={fosterData.availability || "Not specified"}
          />
        </div>
      );
    }

    if (type === "volunteer") {
      const volunteerData = data as VolunteerData;
      return (
        <div className="space-y-2" data-testid="dealbreaker-section-volunteer">
          <SummaryItem 
            label="Experience" 
            value={volunteerData.experience || "Not specified"}
          />
          <SummaryItem 
            label="Availability" 
            value={volunteerData.availability || "Not specified"}
          />
        </div>
      );
    }

    return null;
  };

  const formatFieldLabel = (key: string): string => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/_/g, ' ')
      .trim();
  };

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return "Not specified";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.join(", ") || "None";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const renderFullDetailsSection = () => {
    if (type === "adoption") {
      const adoptionData = data as AdoptionData;
      const customResponses = adoptionData.customResponses || {};
      
      // Get all custom response keys except those already shown in dealbreakers
      const dealbreakerKeys = ['homeOwnership', 'housingType', 'hasFence', 'hasOtherPets', 'otherPetsDetails', 'vetName', 'vetContact'];
      const otherResponseKeys = Object.keys(customResponses).filter(
        key => !dealbreakerKeys.includes(key) && customResponses[key] !== null && customResponses[key] !== undefined && customResponses[key] !== ""
      );

      return (
        <div className="space-y-2 pt-2" data-testid="full-details-adoption">
          {adoptionData.animal && (
            <SummaryItem label="Animal" value={adoptionData.animal.name} />
          )}
          <SummaryItem label="Email" value={adoptionData.applicantEmail} />
          <SummaryItem label="Phone" value={adoptionData.applicantPhone} />
          <SummaryItem 
            label="Submitted" 
            value={new Date(adoptionData.createdAt).toLocaleDateString()} 
          />
          
          {/* Render all other custom responses */}
          {otherResponseKeys.map((key) => (
            <SummaryItem 
              key={key}
              label={formatFieldLabel(key)} 
              value={formatFieldValue(customResponses[key])}
            />
          ))}
          
          {adoptionData.notes && (
            <SummaryItem label="Notes" value={adoptionData.notes} />
          )}
        </div>
      );
    }

    if (type === "intake") {
      const intakeData = data as IntakeData;
      return (
        <div className="space-y-2 pt-2" data-testid="full-details-intake">
          <SummaryItem label="Owner Name" value={intakeData.ownerName} />
          <SummaryItem label="Email" value={intakeData.ownerEmail} />
          <SummaryItem label="Phone" value={intakeData.ownerPhone} />
          <SummaryItem 
            label="Submitted" 
            value={new Date(intakeData.createdAt).toLocaleDateString()} 
          />
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Dog Name" value={intakeData.dogName} />
          <SummaryItem label="Breed" value={intakeData.dogBreed || "Not specified"} />
          <SummaryItem label="Age" value={intakeData.dogAge || "Not specified"} />
          <SummaryItem label="Gender" value={intakeData.dogGender || "Not specified"} />
          <SummaryItem label="Spayed/Neutered" value={intakeData.spayedNeutered ? "Yes" : "No"} />
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Good with Kids" value={intakeData.goodWithKids || "Unknown"} />
          <SummaryItem label="Good with Dogs" value={intakeData.goodWithDogs || "Unknown"} />
          <SummaryItem label="Good with Cats" value={intakeData.goodWithCats || "Unknown"} />
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Reason for Surrender" value={intakeData.reasonForSurrender} />
          {intakeData.medicalIssues && (
            <SummaryItem label="Medical Issues" value={intakeData.medicalIssues} warning />
          )}
          {intakeData.behavioralIssues && (
            <SummaryItem label="Behavioral Issues" value={intakeData.behavioralIssues} warning />
          )}
          {intakeData.notes && (
            <SummaryItem label="Notes" value={intakeData.notes} />
          )}
        </div>
      );
    }

    if (type === "foster") {
      const fosterData = data as FosterData;
      return (
        <div className="space-y-2 pt-2" data-testid="full-details-foster">
          <SummaryItem label="Name" value={fosterData.applicantName} />
          <SummaryItem label="Email" value={fosterData.applicantEmail} />
          <SummaryItem label="Phone" value={fosterData.applicantPhone} />
          <SummaryItem 
            label="Submitted" 
            value={new Date(fosterData.createdAt).toLocaleDateString()} 
          />
          {fosterData.address && (
            <SummaryItem label="Address" value={fosterData.address} />
          )}
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Housing Type" value={fosterData.housingType || "Not specified"} />
          <SummaryItem label="Has Yard" value={fosterData.hasYard ? "Yes" : "No"} />
          <SummaryItem label="Other Pets" value={fosterData.hasOtherPets ? "Yes" : "No"} />
          {fosterData.otherPetsDetails && (
            <SummaryItem label="Pet Details" value={fosterData.otherPetsDetails} />
          )}
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Experience" value={fosterData.experience || "Not specified"} />
          <SummaryItem label="Availability" value={fosterData.availability || "Not specified"} />
          {fosterData.notes && (
            <SummaryItem label="Notes" value={fosterData.notes} />
          )}
        </div>
      );
    }

    if (type === "volunteer") {
      const volunteerData = data as VolunteerData;
      return (
        <div className="space-y-2 pt-2" data-testid="full-details-volunteer">
          <SummaryItem label="Name" value={volunteerData.applicantName} />
          <SummaryItem label="Email" value={volunteerData.applicantEmail} />
          <SummaryItem label="Phone" value={volunteerData.applicantPhone} />
          <SummaryItem 
            label="Submitted" 
            value={new Date(volunteerData.createdAt).toLocaleDateString()} 
          />
          {volunteerData.address && (
            <SummaryItem label="Address" value={volunteerData.address} />
          )}
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Experience" value={volunteerData.experience || "Not specified"} />
          <SummaryItem label="Availability" value={volunteerData.availability || "Not specified"} />
          {volunteerData.interests && (
            <SummaryItem label="Interests" value={volunteerData.interests} />
          )}
          {volunteerData.skills && (
            <SummaryItem label="Skills" value={volunteerData.skills} />
          )}
          {volunteerData.notes && (
            <SummaryItem label="Notes" value={volunteerData.notes} />
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-md flex flex-col p-0"
          data-testid="application-detail-sheet"
        >
          <SheetHeader className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between gap-2 pr-8">
              <div className="flex items-center gap-2 min-w-0">
                {getTypeIcon()}
                <SheetTitle className="text-lg truncate" data-testid="sheet-title">
                  {name}
                </SheetTitle>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="h-4 w-4 text-muted-foreground" />
                <Star className="h-4 w-4 text-muted-foreground" />
                <Star className="h-4 w-4 text-muted-foreground" />
                <Star className="h-4 w-4 text-muted-foreground" />
                <Star className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <SheetDescription className="sr-only">
              Application details for {name}
            </SheetDescription>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select 
                value={currentStatus} 
                onValueChange={handleStatusChange}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger 
                  className="w-[160px] h-8"
                  data-testid="select-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getStatusOptions().map((status) => (
                    <SelectItem 
                      key={status} 
                      value={status}
                      data-testid={`select-option-${status}`}
                    >
                      <Badge variant={stageVariants[status] || "outline"}>
                        {stageLabels[status] || status}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SheetHeader>

          <div className="p-4 border-b">
            <div className="flex items-center justify-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="flex-1"
                asChild
              >
                <a 
                  href={`tel:${phone}`}
                  data-testid="link-call"
                >
                  <Phone className="h-4 w-4 mr-1" />
                  Call
                </a>
              </Button>
              {hasSmsConsent ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  asChild
                >
                  <a 
                    href={`sms:${phone}`}
                    data-testid="link-text"
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Text
                  </a>
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  disabled
                  data-testid="button-text-disabled"
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Text
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                className="flex-1"
                asChild
              >
                <a 
                  href={`mailto:${email}`}
                  data-testid="link-email"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Email
                </a>
              </Button>
            </div>
            {!hasSmsConsent && (
              <p className="text-xs text-muted-foreground text-center mt-2" data-testid="text-sms-disabled">
                SMS disabled - no consent given
              </p>
            )}
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div 
                className="bg-muted/50 rounded-lg p-4"
                data-testid="dealbreaker-summary"
              >
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Key Factors
                </h3>
                {renderDealbreakerSection()}
              </div>

              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between"
                    data-testid="button-toggle-full-details"
                  >
                    <span className="text-sm font-medium">View Full Application Details</span>
                    {detailsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent data-testid="full-details-content">
                  {renderFullDetailsSection()}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>

          <div className="p-4 border-t flex flex-col gap-2 mt-auto">
            {type === "intake" && currentStatus === "scheduled" && (
              <Button
                variant="default"
                className="w-full"
                onClick={() => promoteMutation.mutate()}
                disabled={promoteMutation.isPending}
                data-testid="button-finalize-intake"
              >
                <PawPrint className="h-4 w-4 mr-1" />
                {promoteMutation.isPending ? "Adding to System..." : "Finalize & Add to Database"}
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setShowRejectDialog(true)}
                disabled={updateMutation.isPending || promoteMutation.isPending || ["denied", "rejected", "declined", "adopted", "intaken"].includes(currentStatus)}
                data-testid="button-reject"
              >
                <X className="h-4 w-4 mr-1" />
                {type === "intake" ? "Decline" : "Reject"}
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={handleAdvance}
                disabled={updateMutation.isPending || promoteMutation.isPending || !nextStage}
                data-testid="button-advance"
              >
                <Check className="h-4 w-4 mr-1" />
                {nextStage ? `Advance to ${stageLabels[nextStage] || nextStage}` : "Complete"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showRejectDialog} onOpenChange={(open) => {
        setShowRejectDialog(open);
        if (!open) setDeclineReason("");
      }}>
        <AlertDialogContent data-testid="reject-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{type === "intake" ? "Decline Intake Request" : "Confirm Rejection"}</AlertDialogTitle>
            <AlertDialogDescription>
              {type === "intake" 
                ? "Please select a reason for declining this intake request."
                : `Are you sure you want to reject this application from ${name}? This action can be undone by changing the status manually.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {type === "intake" && (
            <div className="py-4">
              <Label className="text-sm font-medium mb-3 block">Reason for Decline</Label>
              <RadioGroup value={declineReason} onValueChange={setDeclineReason} className="space-y-2">
                {DECLINE_REASONS.map((reason) => (
                  <div key={reason.value} className="flex items-center space-x-2">
                    <RadioGroupItem 
                      value={reason.value} 
                      id={`decline-reason-${reason.value}`}
                      data-testid={`radio-decline-${reason.value}`}
                    />
                    <Label 
                      htmlFor={`decline-reason-${reason.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {reason.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReject}
              disabled={type === "intake" && !declineReason || declineMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-reject"
            >
              {declineMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Declining...
                </>
              ) : (
                type === "intake" ? "Decline Request" : "Reject Application"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface SummaryItemProps {
  label: string;
  value: string;
  warning?: boolean;
}

function SummaryItem({ label, value, warning }: SummaryItemProps) {
  const labelId = label.toLowerCase().replace(/[\s/]+/g, '-');
  return (
    <div 
      className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0"
      data-testid={`summary-item-${labelId}`}
    >
      <span 
        className="text-sm text-muted-foreground flex items-center gap-1"
        data-testid={`summary-label-${labelId}`}
      >
        {warning && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
        {label}
      </span>
      <span 
        className="text-sm font-medium text-right max-w-[60%] break-words"
        data-testid={`summary-value-${labelId}`}
      >
        {value}
      </span>
    </div>
  );
}
