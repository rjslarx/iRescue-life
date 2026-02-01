import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Inbox, ChevronRight, Dog } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SurrenderRequest } from "@shared/schema";
import { useTenant } from "@/contexts/TenantContext";

interface SurrenderRequestsResponse {
  surrenderRequests: SurrenderRequest[];
}

export default function IntakeSummaryWidget() {
  const { basePath } = useTenant();
  const { data, isLoading } = useQuery<SurrenderRequestsResponse>({
    queryKey: ['/api/surrender-requests'],
  });

  const surrenderRequests = data?.surrenderRequests || [];
  const newRequests = surrenderRequests.filter(r => r.status === 'new');
  const recentRequests = [...surrenderRequests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  if (isLoading) {
    return (
      <Card data-testid="card-intake-summary-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Intake Pipeline</CardTitle>
          <Inbox className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-intake-summary-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Intake Pipeline</CardTitle>
        <Inbox className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-bold" data-testid="text-new-requests-count">{newRequests.length}</div>
            <p className="text-xs text-muted-foreground">New Requests</p>
          </div>
          {newRequests.length > 0 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
              Needs Review
            </Badge>
          )}
        </div>

        {recentRequests.length > 0 ? (
          <div className="space-y-2">
            {recentRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                data-testid={`row-surrender-${request.id}`}
              >
                <Dog className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{request.dogName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {request.ownerName} · {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {request.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-surrender-requests">No surrender requests</p>
        )}

        <Link href="/dashboard/intake">
          <Button variant="ghost" size="sm" className="w-full mt-4" data-testid="link-view-intake">
            View Intake Manager
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
