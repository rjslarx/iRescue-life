import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { 
  FileText, 
  DollarSign, 
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight
} from "lucide-react";

interface FormSubmission {
  id: string;
  formName: string;
  signerName: string | null;
  signerEmail: string | null;
  status: string;
  createdAt: string;
  signedAt: string | null;
  feeAmount: number | null;
  paymentStatus: string | null;
}

interface FormSubmissionsResponse {
  submissions: FormSubmission[];
  counts: {
    pending: number;
    signed: number;
    completed: number;
    awaitingPayment: number;
  };
}

function getStatusBadge(submission: FormSubmission) {
  if (submission.paymentStatus === 'pending' && submission.signedAt) {
    return (
      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700">
        <DollarSign className="h-3 w-3 mr-1" />
        Awaiting Payment
      </Badge>
    );
  }
  
  if (submission.status === 'completed') {
    return (
      <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
        <CheckCircle className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  }
  
  if (submission.signedAt) {
    return (
      <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
        <FileText className="h-3 w-3 mr-1" />
        Signed
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700">
      <Clock className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}

function SubmissionItem({ submission }: { submission: FormSubmission }) {
  const timeAgo = formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true });
  
  return (
    <div 
      className="flex items-center gap-3 py-3 border-b border-border last:border-0" 
      data-testid={`form-submission-${submission.id}`}
    >
      <div className="flex-shrink-0 p-2 rounded-full bg-primary/10">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {submission.signerName || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {submission.formName}
            </p>
          </div>
          {getStatusBadge(submission)}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {timeAgo}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
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
  const { data, isLoading, error } = useQuery<FormSubmissionsResponse>({
    queryKey: ['/api/dashboard/form-submissions'],
    refetchInterval: 30000,
  });

  return (
    <Card data-testid="card-form-submissions">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Form Submissions</CardTitle>
          </div>
          {data?.counts && (
            <div className="flex items-center gap-2">
              {data.counts.awaitingPayment > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <DollarSign className="h-3 w-3" />
                  {data.counts.awaitingPayment}
                </Badge>
              )}
              {(data.counts.pending + data.counts.signed) > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {data.counts.pending + data.counts.signed} new
                </Badge>
              )}
            </div>
          )}
        </div>
        <CardDescription>
          Recent custom form submissions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Failed to load submissions</p>
          </div>
        ) : !data?.submissions.length ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No form submissions yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] -mx-1 px-1">
            {data.submissions.map((submission) => (
              <SubmissionItem key={submission.id} submission={submission} />
            ))}
          </ScrollArea>
        )}
        
        <div className="mt-4 pt-3 border-t">
          <Link href="/dashboard/custom-forms">
            <Button variant="outline" className="w-full gap-2" data-testid="button-view-all-forms">
              View All Forms
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
