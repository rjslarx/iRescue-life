import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Home, DollarSign, Calendar } from "lucide-react";

interface ReportMetrics {
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

interface ReportsDashboardProps {
  metrics: ReportMetrics;
}

export default function ReportsDashboard({ metrics }: ReportsDashboardProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Operational Metrics</h2>
        <p className="text-muted-foreground">Key insights for grants and board meetings</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Intakes vs Adoptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">This Month</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Intakes: <span className="font-semibold">{metrics.intakesThisMonth}</span></span>
                <span>Adoptions: <span className="font-semibold text-green-600">{metrics.adoptionsThisMonth}</span></span>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Year to Date</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Intakes: <span className="font-semibold">{metrics.intakesYTD}</span></span>
                <span>Adoptions: <span className="font-semibold text-green-600">{metrics.adoptionsYTD}</span></span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Average Length of Stay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-4xl font-bold">{metrics.avgLengthOfStay}</p>
              <p className="text-sm text-muted-foreground">days from intake to adoption</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Active Foster Homes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-4xl font-bold">{metrics.activeFosters}</p>
              <p className="text-sm text-muted-foreground">currently providing care</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Financial Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">This Month</p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Donations</span>
                      <span className="font-semibold text-green-600">
                        ${metrics.totalDonationsThisMonth.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Expenditures</span>
                      <span className="font-semibold text-red-600">
                        ${metrics.totalExpendituresThisMonth.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net</span>
                      <span className={`font-bold ${
                        metrics.totalDonationsThisMonth - metrics.totalExpendituresThisMonth >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        ${(metrics.totalDonationsThisMonth - metrics.totalExpendituresThisMonth).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Year to Date</p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Donations</span>
                      <span className="font-semibold text-green-600">
                        ${metrics.totalDonationsYTD.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Expenditures</span>
                      <span className="font-semibold text-red-600">
                        ${metrics.totalExpendituresYTD.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net</span>
                      <span className={`font-bold ${
                        metrics.totalDonationsYTD - metrics.totalExpendituresYTD >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        ${(metrics.totalDonationsYTD - metrics.totalExpendituresYTD).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
