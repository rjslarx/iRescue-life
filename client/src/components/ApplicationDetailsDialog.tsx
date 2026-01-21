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
import { Link } from "wouter";
import { 
  Heart, 
  Home, 
  Users, 
  Mail, 
  Phone,
  Calendar,
  MapPin,
  PawPrint,
  ExternalLink,
  CheckCircle,
  XCircle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { PendingApplication } from "./PendingApplicationsWidget";

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
      return '/dashboard/foster-management';
    case 'volunteer':
      return '/dashboard/volunteer-management';
    default:
      return '/dashboard';
  }
}

function formatFieldLabel(key: string): string {
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

const fieldOrder = [
  'address',
  'housingType',
  'hasYard',
  'hasFencedYard',
  'hasOtherPets',
  'otherPetsDetails',
  'experience',
  'availability',
  'preferences',
  'vetReference',
  'personalReference',
  'acceptsLargeDogs',
  'acceptsCats',
  'acceptsPuppies',
  'acceptsSeniors',
  'acceptsMedicalNeeds',
  'maxAnimals',
  'interests',
  'skills',
  'emergencyContactName',
  'emergencyContactPhone',
];

export function ApplicationDetailsDialog({ application, open, onOpenChange }: ApplicationDetailsDialogProps) {
  if (!application) return null;

  const formData = application.formData || {};
  const notes = formData.notes || null;
  
  const sortedFields = Object.entries(formData)
    .filter(([key]) => !excludedFields.includes(key) && formData[key] !== null && formData[key] !== undefined)
    .sort((a, b) => {
      const aIndex = fieldOrder.indexOf(a[0]);
      const bIndex = fieldOrder.indexOf(b[0]);
      if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title">
            {getTypeIcon(application.type)}
            {getTypeLabel(application.type)}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDistanceToNow(new Date(application.createdAt), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
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
                    className="text-primary hover:underline"
                    data-testid="link-email"
                  >
                    {application.applicantEmail}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${application.applicantPhone}`}
                    className="text-primary hover:underline"
                    data-testid="link-phone"
                  >
                    {application.applicantPhone}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(application.createdAt), 'PPP')}</span>
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
                  <div className="space-y-4">
                    {sortedFields.map(([key, value]) => (
                      <div key={key} className="space-y-1" data-testid={`field-${key}`}>
                        <dt className="text-sm font-medium text-muted-foreground">
                          {formatFieldLabel(key)}
                        </dt>
                        <dd className="text-sm">
                          {formatFieldValue(value)}
                        </dd>
                      </div>
                    ))}
                  </div>
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
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
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
