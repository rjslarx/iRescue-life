import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import EmailComposerDialog from "@/components/EmailComposerDialog";
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
  adoptionFeeStatus?: string;
  adoptionFeeAmount?: string;
  adoptionFeePaidAt?: string;
  adoptionFeePaymentSource?: string;
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
  preferences?: string;
  vetReference?: string;
  personalReference?: string;
  customResponses?: Record<string, any>;
  status: string;
  pipelineStatus?: string;
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
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  customResponses?: Record<string, any>;
  status: string;
  pipelineStatus?: string;
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
  dogDateOfBirth?: string;
  dogGender?: string;
  dogWeight?: string;
  spayedNeutered?: boolean;
  microchipped?: boolean;
  microchipNumber?: string;
  goodWithKids?: string;
  goodWithDogs?: string;
  goodWithCats?: string;
  reasonForSurrender: string;
  medicalIssues?: string;
  behavioralIssues?: string;
  photoUrl?: string;
  preferredSurrenderDate?: string;
  declinedReason?: string;
  declinedAt?: string;
  customResponses?: Record<string, any>;
  status: string;
  pipelineStatus?: string;
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

const adoptionStages = ["new", "screening", "vet_check", "home_visit", "approved", "trial", "adopted", "denied", "trial_failed"];
const fosterStatuses = ["new_app", "interview", "home_check", "orientation", "agreement", "active_pool", "rejected"];
const volunteerStatuses = ["new_applicant", "orientation_scheduled", "waiver_needed", "active_pool", "rejected"];
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
  new_app: "New App",
  interview: "Interview",
  home_check: "Home Check",
  orientation: "Orientation",
  agreement: "Agreement",
  active_pool: "Active Pool",
  new_applicant: "New Applicant",
  orientation_scheduled: "Orientation Scheduled",
  waiver_needed: "Waiver Needed",
  trial_failed: "Trial Failed",
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
  new_app: "default",
  interview: "secondary",
  home_check: "secondary",
  orientation: "secondary",
  agreement: "secondary",
  active_pool: "default",
  new_applicant: "default",
  orientation_scheduled: "secondary",
  waiver_needed: "secondary",
  trial_failed: "destructive",
};

function getNextStage(type: ApplicationType, currentStage: string): string | null {
  if (type === "adoption") {
    const idx = adoptionStages.indexOf(currentStage);
    if (idx >= 0 && idx < adoptionStages.length - 1 && currentStage !== "denied" && currentStage !== "trial_failed") {
      return adoptionStages[idx + 1];
    }
  } else if (type === "foster") {
    const idx = fosterStatuses.indexOf(currentStage);
    if (idx >= 0 && idx < fosterStatuses.length - 1 && currentStage !== "rejected") {
      return fosterStatuses[idx + 1];
    }
  } else if (type === "volunteer") {
    const idx = volunteerStatuses.indexOf(currentStage);
    if (idx >= 0 && idx < volunteerStatuses.length - 1 && currentStage !== "rejected") {
      return volunteerStatuses[idx + 1];
    }
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
  if (type === "foster") {
    // Use pipelineStatus if available, otherwise fall back to status
    const fosterData = data as FosterData;
    return fosterData.pipelineStatus || fosterData.status;
  }
  if (type === "volunteer") {
    // Use pipelineStatus for volunteers too
    const volunteerData = data as VolunteerData;
    return (volunteerData as any).pipelineStatus || volunteerData.status;
  }
  return (data as IntakeData).status;
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
  const [showEmailComposer, setShowEmailComposer] = useState(false);

  // Get the appropriate form fields endpoint based on application type
  const formFieldsEndpoint = type === "adoption" 
    ? "/api/adoption-form-fields" 
    : type === "foster" 
      ? "/api/foster-form-fields" 
      : type === "volunteer"
        ? "/api/volunteer-form-fields"
        : type === "intake"
          ? "/api/surrender-form-fields"
          : "";

  // Lookup endpoint for cross-tenant form field resolution
  const formFieldsLookupEndpoint = type === "adoption"
    ? "/api/adoption-form-fields/lookup"
    : type === "foster"
      ? "/api/foster-form-fields/lookup"
      : type === "volunteer"
        ? "/api/volunteer-form-fields/lookup"
        : type === "intake"
          ? "/api/surrender-form-fields/lookup"
          : "";

  // Extract UUID keys from custom responses that need label lookup
  const customResponseKeys = useMemo(() => {
    if (!data) return [];
    const customResponses = (data as any).customResponses || {};
    // Filter for UUID-like keys (form field IDs)
    return Object.keys(customResponses).filter(key => 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    );
  }, [data]);

  // Fetch form field definitions to get proper labels for UUID keys
  const { data: formFieldsData } = useQuery<{ fields: Array<{ id: string; label: string; fieldType: string }> }>({
    queryKey: [formFieldsEndpoint],
    enabled: !!formFieldsEndpoint && isOpen,
  });

  // Fallback: Use lookup endpoint if tenant-based endpoint returns no fields but we have UUID keys
  const { data: lookupFieldsData } = useQuery<{ fields: Array<{ id: string; label: string; fieldType: string }> }>({
    queryKey: ["form-fields-lookup", formFieldsLookupEndpoint, customResponseKeys],
    queryFn: async () => {
      if (!formFieldsLookupEndpoint || customResponseKeys.length === 0) {
        return { fields: [] };
      }
      const response = await apiRequest("POST", formFieldsLookupEndpoint, { fieldIds: customResponseKeys });
      return response.json();
    },
    enabled: !!formFieldsLookupEndpoint && isOpen && customResponseKeys.length > 0 && 
             (formFieldsData?.fields?.length === 0 || !formFieldsData),
  });

  // Combine fields from both sources, preferring lookup results for cross-tenant scenarios
  const allFields = useMemo(() => {
    const tenantFields = formFieldsData?.fields || [];
    const lookupFields = lookupFieldsData?.fields || [];
    
    // Merge: use lookup fields for any IDs not found in tenant fields
    const tenantFieldIds = new Set(tenantFields.map(f => f.id));
    const additionalFields = lookupFields.filter(f => !tenantFieldIds.has(f.id));
    
    return [...tenantFields, ...additionalFields];
  }, [formFieldsData, lookupFieldsData]);

  // Create a map from field ID (UUID) to label for display
  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    allFields.forEach((field) => {
      map[field.id] = field.label;
    });
    return map;
  }, [allFields]);

  // Create a reverse lookup from label to field ID for finding values by label
  // IMPORTANT: This must be before the early return to maintain hook order
  const labelToIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    allFields.forEach((field) => {
      // Normalize label to lowercase for case-insensitive matching
      map[field.label.toLowerCase()] = field.id;
    });
    return map;
  }, [allFields]);

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
      // Use appropriate field name and endpoint path for each application type
      if (type === "adoption") {
        // Adoption uses a separate /stage endpoint
        return apiRequest("PATCH", `${endpoint}/${data?.id}/stage`, { stage: newStatus });
      } else if (type === "foster") {
        return apiRequest("PATCH", `${endpoint}/${data?.id}`, { pipelineStatus: newStatus });
      } else if (type === "volunteer") {
        return apiRequest("PATCH", `${endpoint}/${data?.id}`, { pipelineStatus: newStatus });
      } else if (type === "intake") {
        // Intake/surrender requests use a separate /status endpoint
        return apiRequest("PATCH", `${endpoint}/${data?.id}/status`, { status: newStatus });
      } else {
        return apiRequest("PATCH", `${endpoint}/${data?.id}`, { status: newStatus });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getQueryKey(type)] });
      toast({
        title: "Status updated",
        description: "The application status has been updated successfully.",
      });
      // Close the sheet after successful status update so user sees the updated status in the list
      onClose();
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
      const response = await apiRequest("POST", `/api/surrender/${data?.id}/promote`);
      return response.json() as Promise<{ success: boolean; animalId: string; animalName: string; message: string }>;
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
      case "foster": return fosterStatuses;
      case "volunteer": return volunteerStatuses;
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

  // Helper to find a response value by label pattern (case-insensitive)
  // Uses more specific patterns to avoid false matches
  const getResponseByLabel = (responses: Record<string, any>, labelPattern: string | RegExp): any => {
    // First try exact match by label (for UUID keys stored with form field labels)
    if (typeof labelPattern === 'string') {
      const normalizedPattern = labelPattern.toLowerCase();
      const fieldId = labelToIdMap[normalizedPattern];
      if (fieldId && responses[fieldId] !== undefined) {
        return responses[fieldId];
      }
      // Also try looking for legacy field names directly
      if (responses[labelPattern] !== undefined) return responses[labelPattern];
    }
    
    // Try regex pattern matching against form field labels
    for (const [key, value] of Object.entries(responses)) {
      const label = fieldLabelMap[key] || key;
      if (typeof labelPattern === 'string') {
        if (label.toLowerCase().includes(labelPattern.toLowerCase())) {
          return value;
        }
      } else if (labelPattern.test(label)) {
        return value;
      }
    }
    return undefined;
  };

  const formatFieldLabel = (key: string): string => {
    // First check if we have a label from form field definitions (for UUID keys)
    if (fieldLabelMap[key]) {
      return fieldLabelMap[key];
    }
    // Fall back to formatting the key itself (for legacy field names like homeOwnership)
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

  const renderDealbreakerSection = () => {
    if (type === "adoption") {
      const adoptionData = data as AdoptionData;
      const customResponses = adoptionData.customResponses || {};
      
      // Use more specific regex patterns to avoid false matches
      const homeType = getResponseByLabel(customResponses, /home\s*type|housing\s*type|own\s*or\s*rent|homeownership/i)
        || getResponseByLabel(customResponses, "homeOwnership")
        || getResponseByLabel(customResponses, "housingType");
      const hasFence = getResponseByLabel(customResponses, /fenced?\s*yard|have.*fence|has\s*fence/i)
        || getResponseByLabel(customResponses, "hasFence");
      const hasLandlordApproval = getResponseByLabel(customResponses, /landlord\s*approval|landlord\s*permission/i)
        || getResponseByLabel(customResponses, "hasLandlordApproval");
      const otherPets = getResponseByLabel(customResponses, /other\s*pets|current\s*pets|have.*pets/i)
        || getResponseByLabel(customResponses, "hasOtherPets")
        || getResponseByLabel(customResponses, "otherPetsDetails");
      const vetInfo = getResponseByLabel(customResponses, /veterinarian|vet\s*name|vet\s*contact|vet\s*info/i)
        || getResponseByLabel(customResponses, "vetName")
        || getResponseByLabel(customResponses, "vetContact");
      
      return (
        <div className="space-y-2" data-testid="dealbreaker-section-adoption">
          <SummaryItem 
            label="Home Type" 
            value={formatFieldValue(homeType)} 
            warning={homeType != null && String(homeType).toLowerCase().includes("rent") && !hasLandlordApproval}
          />
          <SummaryItem 
            label="Fenced Yard" 
            value={formatFieldValue(hasFence)} 
            warning={hasFence === false || (hasFence != null && String(hasFence).toLowerCase() === "no")}
          />
          <SummaryItem 
            label="Current Pets" 
            value={formatFieldValue(otherPets)}
          />
          <SummaryItem 
            label="Vet Contact" 
            value={formatFieldValue(vetInfo)}
            warning={vetInfo == null}
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
          
          {/* Dealbreaker questions section */}
          {dealbreakerKeys.some(key => customResponses[key] !== undefined && customResponses[key] !== null && customResponses[key] !== "") && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground">Housing & Pet Info</p>
              {dealbreakerKeys.map((key) => (
                customResponses[key] !== undefined && customResponses[key] !== null && customResponses[key] !== "" && (
                  <SummaryItem 
                    key={key}
                    label={formatFieldLabel(key)} 
                    value={formatFieldValue(customResponses[key])}
                  />
                )
              ))}
            </>
          )}
          
          {/* Render all other custom responses */}
          {otherResponseKeys.length > 0 && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground">Additional Questions</p>
              {otherResponseKeys.map((key) => (
                <SummaryItem 
                  key={key}
                  label={formatFieldLabel(key)} 
                  value={formatFieldValue(customResponses[key])}
                />
              ))}
            </>
          )}
          
          {/* Adoption fee information */}
          {(adoptionData.adoptionFeeStatus || adoptionData.adoptionFeeAmount) && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground">Adoption Fee</p>
              <SummaryItem label="Status" value={adoptionData.adoptionFeeStatus === "paid" ? "Paid" : adoptionData.adoptionFeeStatus === "waived" ? "Waived" : "Pending"} />
              {adoptionData.adoptionFeeAmount && (
                <SummaryItem label="Amount" value={`$${(parseFloat(adoptionData.adoptionFeeAmount) / 100).toFixed(2)}`} />
              )}
              {adoptionData.adoptionFeePaidAt && (
                <SummaryItem label="Paid On" value={new Date(adoptionData.adoptionFeePaidAt).toLocaleDateString()} />
              )}
              {adoptionData.adoptionFeePaymentSource && (
                <SummaryItem label="Payment Method" value={adoptionData.adoptionFeePaymentSource.charAt(0).toUpperCase() + adoptionData.adoptionFeePaymentSource.slice(1)} />
              )}
            </>
          )}
          
          {adoptionData.notes && (
            <>
              <div className="border-t pt-2 mt-2" />
              <SummaryItem label="Notes" value={adoptionData.notes} />
            </>
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
          {intakeData.preferredSurrenderDate && (
            <SummaryItem label="Preferred Surrender Date" value={new Date(intakeData.preferredSurrenderDate).toLocaleDateString()} />
          )}
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Dog Name" value={intakeData.dogName} />
          <SummaryItem label="Breed" value={intakeData.dogBreed || "Not specified"} />
          <SummaryItem label="Age" value={intakeData.dogAge || "Not specified"} />
          {intakeData.dogDateOfBirth && (
            <SummaryItem label="Date of Birth" value={new Date(intakeData.dogDateOfBirth).toLocaleDateString()} />
          )}
          <SummaryItem label="Gender" value={intakeData.dogGender || "Not specified"} />
          {intakeData.dogWeight && (
            <SummaryItem label="Weight" value={intakeData.dogWeight} />
          )}
          <SummaryItem label="Spayed/Neutered" value={intakeData.spayedNeutered ? "Yes" : "No"} />
          <SummaryItem label="Microchipped" value={intakeData.microchipped ? "Yes" : "No"} />
          {intakeData.microchipped && intakeData.microchipNumber && (
            <SummaryItem label="Microchip Number" value={intakeData.microchipNumber} />
          )}
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
          {intakeData.photoUrl && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground">Photo</p>
              <img 
                src={intakeData.photoUrl} 
                alt={`${intakeData.dogName}`} 
                className="w-full max-w-xs rounded-md object-cover"
                data-testid="intake-dog-photo"
              />
            </>
          )}
          {intakeData.status === "declined" && intakeData.declinedReason && (
            <>
              <div className="border-t pt-2 mt-2" />
              <SummaryItem label="Decline Reason" value={intakeData.declinedReason} warning />
              {intakeData.declinedAt && (
                <SummaryItem label="Declined On" value={new Date(intakeData.declinedAt).toLocaleDateString()} />
              )}
            </>
          )}
          {intakeData.customResponses && Object.keys(intakeData.customResponses).length > 0 && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground mb-2">Additional Responses</p>
              {Object.entries(intakeData.customResponses).map(([fieldId, value]) => {
                const field = allFields.find(f => f.id === fieldId);
                const label = field?.label || fieldId;
                const fieldType = field?.fieldType || 'text';
                
                if (fieldType === 'photo' && typeof value === 'string' && (value.startsWith('http') || value.startsWith('/objects/') || value.startsWith('objects/'))) {
                  return (
                    <div key={fieldId} className="mb-3">
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <img 
                        src={value} 
                        alt={label} 
                        className="mt-1 w-full max-w-[200px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 active:opacity-75"
                        onClick={() => window.open(value, '_blank')}
                        data-testid={`img-custom-response-${fieldId}`}
                      />
                    </div>
                  );
                }
                
                const displayValue = Array.isArray(value) 
                  ? value.join(', ') 
                  : typeof value === 'boolean' 
                    ? (value ? 'Yes' : 'No')
                    : String(value || 'Not provided');
                return (
                  <SummaryItem key={fieldId} label={label} value={displayValue} />
                );
              })}
            </>
          )}
          {intakeData.notes && (
            <>
              <div className="border-t pt-2 mt-2" />
              <SummaryItem label="Notes" value={intakeData.notes} />
            </>
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
          {fosterData.preferences && (
            <SummaryItem label="Animal Preferences" value={fosterData.preferences} />
          )}
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Vet Reference" value={fosterData.vetReference || "Not provided"} />
          <SummaryItem label="Personal Reference" value={fosterData.personalReference || "Not provided"} />
          {fosterData.customResponses && Object.keys(fosterData.customResponses).length > 0 && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground">Additional Questions</p>
              {Object.entries(fosterData.customResponses).map(([key, answer]) => {
                const field = allFields.find(f => f.id === key);
                const fieldType = field?.fieldType || 'text';
                const label = field?.label || formatFieldLabel(key);
                
                if (fieldType === 'photo' && typeof answer === 'string' && answer.startsWith('http')) {
                  return (
                    <div key={key} className="mb-3">
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <img 
                        src={answer} 
                        alt={label} 
                        className="mt-1 w-full max-w-[200px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 active:opacity-75"
                        onClick={() => window.open(answer, '_blank')}
                        data-testid={`img-custom-response-${key}`}
                      />
                    </div>
                  );
                }
                
                return (
                  <SummaryItem key={key} label={label} value={formatFieldValue(answer)} />
                );
              })}
            </>
          )}
          {fosterData.notes && (
            <>
              <div className="border-t pt-2 mt-2" />
              <SummaryItem label="Notes" value={fosterData.notes} />
            </>
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
          <div className="border-t pt-2 mt-2" />
          <SummaryItem label="Emergency Contact" value={volunteerData.emergencyContactName || "Not specified"} />
          <SummaryItem label="Emergency Phone" value={volunteerData.emergencyContactPhone || "Not specified"} />
          {volunteerData.customResponses && Object.keys(volunteerData.customResponses).length > 0 && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-sm font-medium text-muted-foreground mb-2">Additional Responses</p>
              {Object.entries(volunteerData.customResponses).map(([fieldId, value]) => {
                const field = allFields.find(f => f.id === fieldId);
                const label = field?.label || fieldId;
                const fieldType = field?.fieldType || 'text';
                
                if (fieldType === 'photo' && typeof value === 'string' && (value.startsWith('http') || value.startsWith('/objects/') || value.startsWith('objects/'))) {
                  return (
                    <div key={fieldId} className="mb-3">
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <img 
                        src={value} 
                        alt={label} 
                        className="mt-1 w-full max-w-[200px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 active:opacity-75"
                        onClick={() => window.open(value, '_blank')}
                        data-testid={`img-custom-response-${fieldId}`}
                      />
                    </div>
                  );
                }
                
                const displayValue = Array.isArray(value) 
                  ? value.join(', ') 
                  : typeof value === 'boolean' 
                    ? (value ? 'Yes' : 'No')
                    : String(value || 'Not provided');
                return (
                  <SummaryItem key={fieldId} label={label} value={displayValue} />
                );
              })}
            </>
          )}
          {volunteerData.notes && (
            <>
              <div className="border-t pt-2 mt-2" />
              <SummaryItem label="Notes" value={volunteerData.notes} />
            </>
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
                  className="w-[180px] h-8"
                  data-testid="select-status"
                >
                  <SelectValue placeholder={stageLabels[currentStatus] || currentStatus}>
                    {currentStatus && (
                      <Badge variant={stageVariants[currentStatus] || "outline"}>
                        {stageLabels[currentStatus] || currentStatus}
                      </Badge>
                    )}
                  </SelectValue>
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
                onClick={() => setShowEmailComposer(true)}
                data-testid="button-email"
              >
                <Mail className="h-4 w-4 mr-1" />
                Email
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

      {showEmailComposer && (
        <EmailComposerDialog
          isOpen={showEmailComposer}
          onClose={() => setShowEmailComposer(false)}
          recipientEmail={email}
          recipientName={name}
          defaultSubject={
            type === "adoption" && (data as AdoptionData)?.animal?.name 
              ? `Regarding your adoption application for ${(data as AdoptionData).animal.name}`
              : type === "foster" && (data as FosterData)?.animal?.name
                ? `Regarding your foster application for ${(data as FosterData).animal.name}`
                : type === "intake" && (data as IntakeData)?.dogName
                  ? `Regarding your surrender request for ${(data as IntakeData).dogName}`
                  : `Your ${type} application`
          }
          context={{
            type: type === "adoption" ? "adoption_application" 
                : type === "foster" ? "foster_application"
                : type === "volunteer" ? "volunteer_application"
                : "intake_request",
            id: data.id,
            animalName: type === "adoption" ? (data as AdoptionData)?.animal?.name
                      : type === "foster" ? (data as FosterData)?.animal?.name
                      : type === "intake" ? (data as IntakeData)?.dogName
                      : undefined,
          }}
        />
      )}
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
