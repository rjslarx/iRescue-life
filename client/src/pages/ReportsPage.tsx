import ReportsDashboard from "@/components/ReportsDashboard";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";

interface ReportsMetrics {
  intakesThisMonth: number;
  intakesYTD: number;
  adoptionsThisMonth: number;
  adoptionsYTD: number;
  avgLengthOfStay: number;
  totalDonationsThisMonth: number;
  totalDonationsYTD: number;
  totalExpendituresThisMonth: number;
  totalExpendituresYTD: number;
  activeFosters: number;
}

export default function ReportsPage() {
  const { data, isLoading, error } = useQuery<{ metrics: ReportsMetrics }>({
    queryKey: ['/api/reports'],
  });

  const metrics = data?.metrics;

  return (
    <DashboardLayout
      title="Reports & Analytics"
      description="Key metrics for grants and board meetings"
    >
      <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-destructive">Error loading reports data. Please try again.</p>
                </CardContent>
              </Card>
            ) : metrics ? (
              <ReportsDashboard metrics={metrics} />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">No reports data available.</p>
                </CardContent>
              </Card>
            )}
      </div>
    </DashboardLayout>
  );
}
