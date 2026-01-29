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
  X,
  FileText,
  Download,
  Eye,
  FolderOpen
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

interface SignedDocument {
  id: string;
  formName: string;
  signerName: string;
  signerEmail: string;
  signedAt: string | null;
  status: string;
  createdAt: string;
}

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

function formatFieldValue(value: unknown, fieldType?: string): string | React.ReactNode {
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
    // Handle photo URLs - render as clickable image
    if (fieldType === 'photo' || (value.startsWith('http') && (value.includes('/uploads/') || value.includes('storage.googleapis.com') || value.includes('.jpg') || value.includes('.jpeg') || value.includes('.png') || value.includes('.gif') || value.includes('.webp')))) {
      return (
        <img 
          src={value} 
          alt="Uploaded photo" 
          className="mt-1 w-full max-w-[200px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 active:opacity-75"
          onClick={() => window.open(value, '_blank')}
          data-testid="img-form-response-photo"
        />
      );
    }
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
  const [activeTab, setActiveTab] = useState<"details" | "documents">("details");
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  
  const apiEndpoint = applicationType === 'adoption' 
    ? `/api/applications/${application?.id}`
    : applicationType === 'foster'
    ? `/api/foster-applications/${application?.id}`
    : `/api/volunteer-applications/${application?.id}`;

  const email = application?.email || application?.applicantEmail;

  const { data: fullData, isLoading } = useQuery<{ application: Record<string, unknown> }>({
    queryKey: [apiEndpoint],
    enabled: open && !!application?.id,
  });

  const { data: formFieldsData, isLoading: isLoadingFields } = useQuery<{ fields: FormField[] }>({
    queryKey: [getFormFieldsEndpoint(applicationType)],
    enabled: open && !!application,
  });

  // Fetch signed documents for volunteers and fosters
  const showDocumentsTab = applicationType === 'volunteer' || applicationType === 'foster';
  const { data: documentsData, isLoading: isLoadingDocuments } = useQuery<{ documents: SignedDocument[] }>({
    queryKey: ['/api/signed-documents/by-email', email],
    queryFn: async () => {
      if (!email) return { documents: [] };
      const encodedEmail = encodeURIComponent(email);
      const response = await fetch(`/api/signed-documents/by-email/${encodedEmail}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
    enabled: open && showDocumentsTab && !!email,
  });

  // Fetch document content when viewing
  const { data: viewDocumentData, isLoading: isLoadingDocument } = useQuery<{ document: { renderedHtml: string; formName: string; signerName: string; signedAt: string } }>({
    queryKey: ['/api/signed-documents', viewingDocumentId, 'view'],
    queryFn: async () => {
      const response = await fetch(`/api/signed-documents/${viewingDocumentId}/view`);
      if (!response.ok) throw new Error('Failed to fetch document');
      return response.json();
    },
    enabled: !!viewingDocumentId,
  });

  if (!application) return null;

  const phone = application.phone || application.applicantPhone;
  const name = application.applicantName;
  const status = application.stage || application.pipelineStatus || 'new';
  const documents = documentsData?.documents || [];

  const handleDownloadPdf = async (docId: string) => {
    try {
      const response = await fetch(`/api/signed-documents/${docId}/download`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed-document-${docId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  const fullApplication = fullData?.application || application;
  // Support formData, formResponses, and customResponses naming conventions
  const formData = (fullApplication.formData as Record<string, unknown>) || 
                   (fullApplication.formResponses as Record<string, unknown>) ||
                   (fullApplication.customResponses as Record<string, unknown>) || {};
  const notes = formData.notes || (fullApplication as Record<string, unknown>).notes || null;

  const fieldLabelMap = new Map<string, { label: string; order: number; fieldType: string }>();
  if (formFieldsData?.fields) {
    formFieldsData.fields.forEach((field) => {
      fieldLabelMap.set(field.id, { label: field.label, order: field.order, fieldType: field.fieldType });
    });
  }
  
  const getFieldType = (key: string): string | undefined => {
    const fieldInfo = fieldLabelMap.get(key);
    return fieldInfo?.fieldType;
  };

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
          {/* Header with name and status - always shown */}
          <div className="space-y-4 mb-4">
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

          {/* Tabs for volunteers/fosters, regular content for adoption */}
          {showDocumentsTab ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "documents")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="details" data-testid="tab-details">
                  <Users className="h-4 w-4 mr-2" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="documents" data-testid="tab-documents">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Documents
                  {documents.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5">{documents.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-6 mt-0">
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
                                {formatFieldValue(value, getFieldType(key))}
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
              </TabsContent>

              <TabsContent value="documents" className="mt-0">
                {viewingDocumentId ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setViewingDocumentId(null)}
                        data-testid="button-back-to-list"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Back to Documents
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadPdf(viewingDocumentId)}
                        data-testid="button-download-current"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </Button>
                    </div>
                    {isLoadingDocument ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : viewDocumentData?.document ? (
                      <div className="border rounded-md p-4 bg-white dark:bg-background">
                        <div className="mb-4 pb-4 border-b">
                          <h4 className="font-semibold">{viewDocumentData.document.formName}</h4>
                          <p className="text-sm text-muted-foreground">
                            Signed by {viewDocumentData.document.signerName} on{' '}
                            {viewDocumentData.document.signedAt 
                              ? format(new Date(viewDocumentData.document.signedAt), 'PPP')
                              : 'Unknown date'}
                          </p>
                        </div>
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: viewDocumentData.document.renderedHtml }}
                        />
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Unable to load document.
                      </p>
                    )}
                  </div>
                ) : isLoadingDocuments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h4 className="font-medium mb-2">No Signed Documents</h4>
                    <p className="text-sm text-muted-foreground">
                      {applicationType === 'volunteer' 
                        ? 'Waivers and forms signed by this volunteer will appear here.'
                        : 'Agreements signed by this foster will appear here.'}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Signed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{doc.formName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {doc.signedAt 
                              ? format(new Date(doc.signedAt), 'MMM d, yyyy')
                              : 'Pending'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewingDocumentId(doc.id)}
                                title="View document"
                                data-testid={`button-view-${doc.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadPdf(doc.id)}
                                title="Download PDF"
                                data-testid={`button-download-${doc.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            /* Original content for adoption applications */
            <div className="space-y-6">
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
                              {formatFieldValue(value, getFieldType(key))}
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
          )}
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
