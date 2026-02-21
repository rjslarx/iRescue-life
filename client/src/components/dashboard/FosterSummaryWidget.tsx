import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Home, ChevronRight } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

interface FosterApplication {
  id: string;
  status: string;
  applicantName: string;
  createdAt: string;
}

interface FosterApplicationsResponse {
  fosterApplications: FosterApplication[];
}

export default function FosterSummaryWidget() {
  const { basePath } = useTenant();
  const { data, isLoading } = useQuery<FosterApplicationsResponse>({
    queryKey: ['/api/foster-applications'],
  });

  const applications = data?.fosterApplications || [];
  const pendingApplications = applications.filter(a => a.status === 'pending' || a.status === 'new');

  if (isLoading) {
    return (
      <Card data-testid="card-foster-summary-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Foster Applications</CardTitle>
          <Home className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-foster-summary-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Foster Applications</CardTitle>
        <Home className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-bold" data-testid="text-foster-apps-count">{pendingApplications.length}</div>
            <p className="text-xs text-muted-foreground">Pending Applications</p>
          </div>
          {pendingApplications.length > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              Needs Review
            </Badge>
          )}
        </div>

        <Link href="/dashboard/foster-applications">
          <Button variant="ghost" size="sm" className="w-full" data-testid="link-view-foster">
            View Applications
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
