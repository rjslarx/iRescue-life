import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  CheckCircle,
  XCircle,
  X
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type ApplicationType = 'adoption' | 'foster' | 'volunteer';

interface FormField {
  id: string;
  label: string;
  fieldType: string;
  order: number;
}

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
  formResponses?: Record<string, unknown>;
  formData?: Record<string, unknown>;
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

function getFormFieldsEndpoint(type: ApplicationType): string {
  switch (type) {
    case 'adoption':
      return '/api/adoption-form-fields';
    case 'foster':
      return '/api/foster-form-fields';
    case 'volunteer':
      return '/api/volunteer-form-fields';
  }
}

function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    new: 'New',
    new_app: 'New Application',
    pending: 'New Application',
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
  };
  return statusMap[status] || status;
}

function formatFallbackLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function formatFieldValue(value: unknown): string | React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">Not provided</span>;
  }
  if (typeof value === 'boolean') {
    return value ? (
      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <CheckCircle className="h-4 w-4" /> Yes
      </span>
    ) : (
      <span className="flex items-center gap-1 text-muted-foreground">
        <XCircle className="h-4 w-4" /> No
      </span>
    );
  }
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
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const excludedFields = new Set([
  'id', 'tenantId', 'userId', 'animalId', 'createdAt', 'updatedAt',
  'applicantName', 'applicantEmail', 'applicantPhone', 'email', 'phone',
  'stage', 'pipelineStatus', 'status', 'animalName', 'checkoutStatus',
  'adoptionFeeStatus', 'adoptionFeeAmount', 'agreementStatus',
  'holdHarmlessFormId', 'holdHarmlessSignedAt', 'formResponses', 'formData', 'notes'
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

  const { data: formFieldsData, isLoading: isLoadingFields } = useQuery<{ fields: FormField[] }>({
    queryKey: [getFormFieldsEndpoint(applicationType)],
    enabled: open && !!application,
  });

  if (!application) return null;

  const email = application.email || application.applicantEmail;
  const phone = application.phone || application.applicantPhone;
  const name = application.applicantName;
  const status = application.stage || application.pipelineStatus || 'new';

  const fullApplication = fullData?.application || application;
  // Support both formData (adoption/foster) and formResponses naming conventions
  const formData = (fullApplication.formData as Record<string, unknown>) || 
                   (fullApplication.formResponses as Record<string, unknown>) || {};
  const notes = formData.notes || (fullApplication as Record<string, unknown>).notes || null;

  const fieldLabelMap = new Map<string, { label: string; order: number }>();
  if (formFieldsData?.fields) {
    formFieldsData.fields.forEach((field) => {
      fieldLabelMap.set(field.id, { label: field.label, order: field.order });
    });
  }

  const sortedFormResponses = Object.entries(formData)
    .filter(([key]) => key !== 'notes' && formData[key] !== null && formData[key] !== undefined && formData[key] !== '')
    .sort((a, b) => {
      const aField = fieldLabelMap.get(a[0]);
      const bField = fieldLabelMap.get(b[0]);
      
      if (aField && bField) {
        return aField.order - bField.order;
      }
      if (aField) return -1;
      if (bField) return 1;
      return a[0].localeCompare(b[0]);
    });

  const getFieldLabel = (key: string): string => {
    const fieldInfo = fieldLabelMap.get(key);
    if (fieldInfo) {
      return fieldInfo.label;
    }
    if (isUUID(key)) {
      return `Question ${key.slice(0, 8)}...`;
    }
    return formatFallbackLabel(key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden" data-testid="dialog-view-application">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-dialog-title">
            {getTypeIcon(applicationType)}
            {getTypeLabel(applicationType)}
          </DialogTitle>
          <DialogDescription>
            {application.createdAt ? (
              <>Submitted {formatDistanceToNow(new Date(application.createdAt), { addSuffix: true })}</>
            ) : (
              <>Full application details for {name}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-4 min-h-0">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
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

            {(sortedFormResponses.length > 0 || isLoading || isLoadingFields) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Application Responses
                  </h4>
                  {(isLoading || isLoadingFields) ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                      ))}
                    </div>
                  ) : sortedFormResponses.length > 0 ? (
                    <div className="space-y-4">
                      {sortedFormResponses.map(([key, value]) => (
                        <div key={key} className="space-y-1" data-testid={`field-${key}`}>
                          <dt className="text-sm font-medium text-muted-foreground">
                            {getFieldLabel(key)}
                          </dt>
                          <dd className="text-sm">
                            {formatFieldValue(value)}
                          </dd>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No application responses available.
                    </p>
                  )}
                </div>
              </>
            )}

            {notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Staff Notes
                  </h4>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md" data-testid="text-notes">
                    {String(notes)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
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
