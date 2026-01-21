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
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Heart, 
  Home, 
  Users, 
  Mail, 
  Phone,
  Calendar,
  PawPrint,
  ExternalLink,
  CheckCircle,
  XCircle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { PendingApplication } from "./PendingApplicationsWidget";

interface FormField {
  id: string;
  label: string;
  fieldType: string;
  order: number;
}

interface ApplicationDetailsDialogProps {
  application: PendingApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'adoption':
      return <Heart className="h-5 w-5 text-pink-500" />;
    case 'foster':
      return <Home className="h-5 w-5 text-blue-500" />;
    case 'volunteer':
      return <Users className="h-5 w-5 text-green-500" />;
    default:
      return null;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'adoption':
      return 'Adoption Application';
    case 'foster':
      return 'Foster Application';
    case 'volunteer':
      return 'Volunteer Application';
    default:
      return 'Application';
  }
}

function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    new: 'New',
    pending: 'New Application',
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
  };
  return statusMap[status] || status;
}

function getManagementLink(type: string): string {
  switch (type) {
    case 'adoption':
      return '/dashboard/applications';
    case 'foster':
      return '/dashboard/foster-pipeline';
    case 'volunteer':
      return '/dashboard/volunteer-pipeline';
    default:
      return '/dashboard';
  }
}

function getFormFieldsEndpoint(type: string): string {
  switch (type) {
    case 'adoption':
      return '/api/adoption-form-fields';
    case 'foster':
      return '/api/foster-form-fields';
    case 'volunteer':
      return '/api/volunteer-form-fields';
    default:
      return '/api/adoption-form-fields';
  }
}

function formatFallbackLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function formatFieldValue(value: any): string | React.ReactNode {
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
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

const excludedFields = ['notes'];

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function ApplicationDetailsDialog({ application, open, onOpenChange }: ApplicationDetailsDialogProps) {
  const { data: formFieldsData, isLoading: isLoadingFields } = useQuery<{ fields: FormField[] }>({
    queryKey: [application?.type ? getFormFieldsEndpoint(application.type) : '/api/adoption-form-fields'],
    enabled: open && !!application,
  });

  if (!application) return null;

  const formData = application.formData || {};
  const notes = formData.notes || null;
  
  const fieldLabelMap = new Map<string, { label: string; order: number }>();
  if (formFieldsData?.fields) {
    formFieldsData.fields.forEach((field) => {
      fieldLabelMap.set(field.id, { label: field.label, order: field.order });
    });
  }

  const sortedFields = Object.entries(formData)
    .filter(([key]) => !excludedFields.includes(key) && formData[key] !== null && formData[key] !== undefined && formData[key] !== '')
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
      <DialogContent className="max-w-2xl max-h-[90vh] !grid !grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title">
            {getTypeIcon(application.type)}
            {getTypeLabel(application.type)}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDistanceToNow(new Date(application.createdAt), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-4 min-h-0">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-lg font-semibold" data-testid="text-applicant-name">
                  {application.applicantName}
                </h3>
                <Badge variant="secondary" data-testid="badge-status">
                  {getStatusLabel(application.status)}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`mailto:${application.applicantEmail}`} 
                    className="hover:underline"
                    data-testid="link-email"
                  >
                    {application.applicantEmail}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${application.applicantPhone}`}
                    className="hover:underline"
                    data-testid="link-phone"
                  >
                    {application.applicantPhone}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span data-testid="text-created-date">{format(new Date(application.createdAt), 'PPP')}</span>
                </div>
                {application.type === 'adoption' && application.animalName && (
                  <div className="flex items-center gap-2 text-sm">
                    <PawPrint className="h-4 w-4 text-muted-foreground" />
                    <span>Applying for: <strong>{application.animalName}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {sortedFields.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Application Responses
                  </h4>
                  {isLoadingFields ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sortedFields.map(([key, value]) => (
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
                    {notes}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close">
            Close
          </Button>
          <Link href={getManagementLink(application.type)}>
            <Button data-testid="button-manage">
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage {application.type === 'adoption' ? 'Adoptions' : application.type === 'foster' ? 'Fosters' : 'Volunteers'}
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
