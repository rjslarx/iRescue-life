import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, User, PawPrint } from "lucide-react";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";

interface PendingApplication {
  id: string;
  type: "adoption" | "foster" | "volunteer";
  applicantName: string;
  animalName?: string;
  status: string;
  createdAt: string;
}

export default function PendingApplicationsWidget() {
  const { subdomain } = useTenant();
  const { data, isLoading } = useQuery<{ applications: PendingApplication[] }>({
    queryKey: ["/api/applications/pending"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Pending Applications
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

  const applications = data?.applications || [];

  const getTypeColor = (type: string) => {
    switch (type) {
      case "adoption":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "foster":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "volunteer":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Pending Applications
          {applications.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {applications.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No pending applications
          </p>
        ) : (
          <div className="space-y-3">
            {applications.slice(0, 5).map((app) => (
              <Link
                key={app.id}
                href={`/${subdomain}/applications`}
                className="block"
              >
                <div
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                  data-testid={`pending-application-${app.id}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {app.applicantName}
                      </p>
                      {app.animalName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <PawPrint className="h-3 w-3" />
                          {app.animalName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={`ml-2 shrink-0 ${getTypeColor(app.type)}`}>
                    {app.type}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
