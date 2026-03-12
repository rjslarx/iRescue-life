import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSearch, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface NotificationCounts {
  pendingMedicalImports: number;
}

export default function PendingMedicalImportsWidget() {
  const { data, isLoading } = useQuery<NotificationCounts>({
    queryKey: ["/api/notifications/counts"],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const count = data?.pendingMedicalImports || 0;

  if (isLoading) {
    return (
      <Card data-testid="card-pending-medical-imports">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (count === 0) return null;

  return (
    <Card data-testid="card-pending-medical-imports">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Medical Records Import
        </CardTitle>
        <Badge variant="secondary" data-testid="badge-pending-import-count">{count}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3" data-testid="text-pending-import-description">
          {count} AI-parsed medical record{count !== 1 ? "s" : ""} awaiting human review
        </p>
        <Link href="/dashboard/medical-imports">
          <Button variant="outline" size="sm" className="w-full gap-2" data-testid="button-review-medical-imports">
            Review Records
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
