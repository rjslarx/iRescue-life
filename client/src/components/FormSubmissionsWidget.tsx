import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FormSubmission {
  id: string;
  formType: string;
  submitterName: string;
  status: string;
  createdAt: string;
}

export default function FormSubmissionsWidget() {
  const { data, isLoading } = useQuery<{ submissions: FormSubmission[] }>({
    queryKey: ["/api/form-submissions/recent"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Recent Form Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const submissions = data?.submissions || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Recent Form Submissions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent submissions
          </p>
        ) : (
          <div className="space-y-3">
            {submissions.slice(0, 5).map((submission) => (
              <div
                key={submission.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                data-testid={`form-submission-${submission.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {submission.submitterName}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className="ml-2 shrink-0">
                  {submission.formType}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
