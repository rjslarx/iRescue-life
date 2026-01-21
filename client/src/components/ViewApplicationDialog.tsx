import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { 
  Heart, 
  Home, 
  Users, 
  Mail, 
  Phone,
  Calendar,
  PawPrint,
  Loader2,
  CheckCircle2,
  X
} from "lucide-react";
import { format } from "date-fns";

type ApplicationType = 'adoption' | 'foster' | 'volunteer';

interface BaseApplication {
  id: string;
  applicantName?: string;
  email?: string;
  applicantEmail?: string;
  phone?: string;
  applicantPhone?: string;
  stage?: string;
  pipelineStatus?: string;
  createdAt?: string;
  animalName?: string;
  [key: string]: unknown;
}

interface ViewApplicationDialogProps {
  application: BaseApplication | null;
  applicationType: ApplicationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getTypeIcon(type: ApplicationType) {
  switch (type) {
    case 'adoption':
      return <Heart className="h-5 w-5 text-pink-500" />;
    case 'foster':
      return <Home className="h-5 w-5 text-blue-500" />;
    case 'volunteer':
      return <Users className="h-5 w-5 text-green-500" />;
  }
}

function getTypeLabel(type: ApplicationType): string {
  switch (type) {
    case 'adoption':
      return 'Adoption Application';
    case 'foster':
      return 'Foster Application';
    case 'volunteer':
      return 'Volunteer Application';
  }
}

function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    new: 'New',
    new_app: 'New Application',
    screening: 'Screening',
    vet_check: 'Vet Check',
    home_visit: 'Home Visit',
    home_check: 'Home Check',
    interview: 'Interview',
    orientation: 'Orientation',
    agreement: 'Agreement Pending',
    new_applicant: 'New Applicant',
    orientation_scheduled: 'Orientation Scheduled',
    waiver_needed: 'Waiver Needed',
    approved: 'Approved',
    rejected: 'Rejected',
    active_pool: 'Active Pool',
    adopted: 'Adopted',
    denied: 'Denied',
    pending: 'Pending',
  };
  return statusMap[status] || status;
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
      try {
        return format(new Date(value), 'PPP');
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

const excludedFields = new Set([
  'id', 'tenantId', 'userId', 'animalId', 'createdAt', 'updatedAt',
  'applicantName', 'applicantEmail', 'applicantPhone', 'email', 'phone',
  'stage', 'pipelineStatus', 'status', 'animalName', 'checkoutStatus',
  'adoptionFeeStatus', 'adoptionFeeAmount', 'agreementStatus',
  'holdHarmlessFormId', 'holdHarmlessSignedAt', 'formResponses'
]);

export function ViewApplicationDialog({
  application,
  applicationType,
  open,
  onOpenChange,
}: ViewApplicationDialogProps) {
  const apiEndpoint = applicationType === 'adoption' 
    ? `/api/applications/${application?.id}`
    : applicationType === 'foster'
    ? `/api/foster-applications/${application?.id}`
    : `/api/volunteer-applications/${application?.id}`;

  const { data: fullData, isLoading } = useQuery<{ application: Record<string, unknown> }>({
    queryKey: [apiEndpoint],
    enabled: open && !!application?.id,
  });

  if (!application) return null;

  const email = application.email || application.applicantEmail;
  const phone = application.phone || application.applicantPhone;
  const name = application.applicantName;
  const status = application.stage || application.pipelineStatus || 'new';

  const fullApplication = fullData?.application || application;
  
  const displayFields = Object.entries(fullApplication)
    .filter(([key]) => !excludedFields.has(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]" data-testid="dialog-view-application">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-dialog-title">
            {getTypeIcon(applicationType)}
            {getTypeLabel(applicationType)}
          </DialogTitle>
          <DialogDescription>
            Full application details for {name}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Applicant Header */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold" data-testid="text-applicant-name">{name}</h3>
                <Badge variant="secondary" data-testid="badge-status">
                  {getStatusLabel(status)}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`mailto:${email}`} 
                    className="hover:underline"
                    data-testid="link-email"
                  >
                    {email}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${phone}`}
                    className="hover:underline"
                    data-testid="link-phone"
                  >
                    {phone}
                  </a>
                </div>
                {application.createdAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span data-testid="text-created-date">
                      {format(new Date(application.createdAt), 'PPP')}
                    </span>
                  </div>
                )}
                {applicationType === 'adoption' && application.animalName && (
                  <div className="flex items-center gap-2 text-sm">
                    <PawPrint className="h-4 w-4 text-muted-foreground" />
                    <span>Applying for: <strong>{application.animalName}</strong></span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Application Details */}
            <div className="space-y-4">
              <h4 className="font-medium">Application Details</h4>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : displayFields.length > 0 ? (
                <div className="grid gap-4">
                  {displayFields.map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatFieldLabel(key)}
                      </p>
                      <p className="text-sm" data-testid={`text-field-${key}`}>
                        {formatFieldValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No additional application details available.
                </p>
              )}

              {/* Form Responses if available */}
              {fullApplication.formResponses && 
               typeof fullApplication.formResponses === 'object' && 
               Object.keys(fullApplication.formResponses as object).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="font-medium">Form Responses</h4>
                    <div className="grid gap-4">
                      {Object.entries(fullApplication.formResponses as Record<string, unknown>).map(([question, answer]) => (
                        <div key={question} className="space-y-1 p-3 rounded-md bg-muted/30">
                          <p className="text-sm font-medium">{question}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFieldValue(answer)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-close-dialog"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
