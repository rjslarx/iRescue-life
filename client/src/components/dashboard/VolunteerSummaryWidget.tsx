import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Users, ChevronRight } from "lucide-react";

interface VolunteerApplication {
  id: string;
  status: string;
  applicantName: string;
  createdAt: string;
}

interface VolunteerApplicationsResponse {
  volunteerApplications: VolunteerApplication[];
}

export default function VolunteerSummaryWidget() {
  const { data, isLoading } = useQuery<VolunteerApplicationsResponse>({
    queryKey: ['/api/volunteer-applications'],
  });

  const applications = data?.volunteerApplications || [];
  const newApplications = applications.filter(a => a.status === 'pending' || a.status === 'new');

  if (isLoading) {
    return (
      <Card data-testid="card-volunteer-summary-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Volunteers</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-volunteer-summary-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Volunteers</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-bold" data-testid="text-volunteer-apps-count">{newApplications.length}</div>
            <p className="text-xs text-muted-foreground">New Applications</p>
          </div>
          {newApplications.length > 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              Pending Review
            </Badge>
          )}
        </div>

        <Link href="/dashboard/volunteer-applications">
          <Button variant="ghost" size="sm" className="w-full" data-testid="link-view-volunteers">
            View Applications
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
