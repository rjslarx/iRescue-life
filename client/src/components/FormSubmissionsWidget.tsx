import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { 
  FileText, 
  DollarSign, 
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Heart,
  Home,
  Users
} from "lucide-react";

interface FormSubmission {
  id: string;
  formName: string;
  signerName: string | null;
  signerEmail: string | null;
  status: string;
  createdAt: string | null;
  signedAt: string | null;
  feeAmount: number | null;
  paymentStatus: string | null;
  type?: 'custom' | 'adoption' | 'foster' | 'volunteer';
}

interface FormSubmissionsResponse {
  submissions: FormSubmission[];
  counts: {
    pending: number;
    signed: number;
    completed: number;
    awaitingPayment: number;
    newAdoptions?: number;
    newFosters?: number;
    newVolunteers?: number;
  };
}

function getTypeIcon(type?: string) {
  switch (type) {
    case 'adoption':
      return <Heart className="h-4 w-4 text-pink-500" />;
    case 'foster':
      return <Home className="h-4 w-4 text-blue-500" />;
    case 'volunteer':
      return <Users className="h-4 w-4 text-green-500" />;
    default:
      return <FileText className="h-4 w-4 text-primary" />;
  }
}

function getTypeColor(type?: string) {
  switch (type) {
    case 'adoption':
      return 'bg-pink-500/10';
    case 'foster':
      return 'bg-blue-500/10';
    case 'volunteer':
      return 'bg-green-500/10';
    default:
      return 'bg-primary/10';
  }
}

function getStatusBadge(submission: FormSubmission, submissionId: string) {
  if (submission.paymentStatus === 'pending' && submission.signedAt) {
    return (
      <Badge variant="secondary" data-testid={`badge-status-payment-${submissionId}`}>
        <DollarSign className="h-3 w-3 mr-1" />
        Awaiting Payment
      </Badge>
    );
  }
  
  if (submission.status === 'completed' || submission.status === 'adopted') {
    return (
      <Badge variant="default" data-testid={`badge-status-completed-${submissionId}`}>
        <CheckCircle className="h-3 w-3 mr-1" />
        {submission.status === 'adopted' ? 'Adopted' : 'Completed'}
      </Badge>
    );
  }

  if (submission.status === 'approved') {
    return (
      <Badge variant="default" data-testid={`badge-status-approved-${submissionId}`}>
        <CheckCircle className="h-3 w-3 mr-1" />
        Approved
      </Badge>
    );
  }
  
  if (submission.signedAt) {
    return (
      <Badge variant="outline" data-testid={`badge-status-signed-${submissionId}`}>
        <FileText className="h-3 w-3 mr-1" />
        Signed
      </Badge>
    );
  }

  if (submission.status === 'new') {
    return (
      <Badge variant="secondary" data-testid={`badge-status-new-${submissionId}`}>
        <AlertCircle className="h-3 w-3 mr-1" />
        New
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" data-testid={`badge-status-pending-${submissionId}`}>
      <Clock className="h-3 w-3 mr-1" />
      {submission.status || 'Pending'}
    </Badge>
  );
}

function SubmissionItem({ submission }: { submission: FormSubmission }) {
  const timeAgo = submission.createdAt 
    ? formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })
    : 'Unknown time';
  
  return (
    <div 
      className="flex items-center gap-3 py-3 border-b border-border last:border-0" 
      data-testid={`form-submission-${submission.id}`}
    >
      <div className={`flex-shrink-0 p-2 rounded-full ${getTypeColor(submission.type)}`}>
        {getTypeIcon(submission.type)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid={`text-signer-name-${submission.id}`}>
              {submission.signerName || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid={`text-form-name-${submission.id}`}>
              {submission.formName}
            </p>
          </div>
          {getStatusBadge(submission, submission.id)}
        </div>
        <p className="text-xs text-muted-foreground mt-1" data-testid={`text-time-ago-${submission.id}`}>
          {timeAgo}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" data-testid="loading-skeleton">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FormSubmissionsWidget() {
  const { basePath } = useTenant();
  const { data, isLoading, error } = useQuery<FormSubmissionsResponse>({
    queryKey: ['/api/dashboard/form-submissions'],
    refetchInterval: 30000,
  });

  const totalNewApplications = (data?.counts?.newAdoptions || 0) + 
    (data?.counts?.newFosters || 0) + 
    (data?.counts?.newVolunteers || 0);

  return (
    <Card data-testid="card-form-submissions">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Applications & Forms</CardTitle>
          </div>
          {data?.counts && (
            <div className="flex items-center gap-2 flex-wrap">
              {totalNewApplications > 0 && (
                <Badge variant="secondary" className="gap-1" data-testid="badge-new-applications-count">
                  <AlertCircle className="h-3 w-3" />
                  {totalNewApplications} new
                </Badge>
              )}
              {data.counts.awaitingPayment > 0 && (
                <Badge variant="outline" className="gap-1" data-testid="badge-awaiting-payment-count">
                  <DollarSign className="h-3 w-3" />
                  {data.counts.awaitingPayment}
                </Badge>
              )}
            </div>
          )}
        </div>
        <CardDescription>
          Recent adoption, foster, volunteer, and custom form submissions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="error-state">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Failed to load submissions</p>
          </div>
        ) : !data?.submissions.length ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="empty-state">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No applications or form submissions yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] -mx-1 px-1" data-testid="submissions-list">
            {data.submissions.map((submission) => (
              <SubmissionItem key={submission.id} submission={submission} />
            ))}
          </ScrollArea>
        )}
        
        <div className="mt-4 pt-3 border-t">
          <Link href="/dashboard/applications" data-testid="link-view-all-applications">
            <Button variant="outline" className="w-full gap-2" data-testid="button-view-all-applications">
              View All Applications
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
