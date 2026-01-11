import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Tenant } from "@shared/schema";
import DashboardLayout from "@/components/DashboardLayout";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Users,
  DollarSign,
  Heart,
  Calendar,
  PawPrint,
  FileText,
  Award,
  Download,
} from "lucide-react";

interface AnalyticsOverview {
  totalAdoptions: number;
  adoptionsThisPeriod: number;
  adoptionRate: number;
  averageDaysToAdoption: number;
  adoptionsBySpecies: { species: string; count: number }[];
  totalApplications: number;
  applicationsThisPeriod: number;
  applicationConversionRate: number;
  applicationsByStage: { stage: string; count: number }[];
  totalRevenue: number;
  revenueThisPeriod: number;
  averageDonationAmount: number;
  totalDonors: number;
  recurringDonors: number;
  donorRetentionRate: number;
  totalAnimals: number;
  availableAnimals: number;
  animalsInFoster: number;
  animalsPending: number;
  animalsOnMedicalHold: number;
  totalVolunteers: number;
  activeVolunteersThisPeriod: number;
  volunteerParticipationRate: number;
  totalVolunteerSlotsFilled: number;
}

interface TrendData {
  date: string;
  adoptions: number;
  applications: number;
  revenue: number;
  newAnimals: number;
}

interface SpeciesBreakdown {
  species: string;
  total: number;
  adopted: number;
  available: number;
  averageDaysToAdoption: number;
}

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

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Analytics() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "1y">("30d");
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("month");
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  // Calculate date range based on selection - memoized to prevent infinite query re-renders
  const { startDate, endDate } = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();

    switch (dateRange) {
      case "7d":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(endDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(endDate.getDate() - 90);
        break;
      case "1y":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [dateRange]);

  // Fetch analytics overview
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", startDate, endDate],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/overview?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  // Fetch trend data
  const { data: trends, isLoading: trendsLoading, error: trendsError } = useQuery<TrendData[]>({
    queryKey: ["/api/analytics/trends", startDate, endDate, granularity],
    queryFn: async () => {
      const response = await fetch(
        `/api/analytics/trends?startDate=${startDate}&endDate=${endDate}&granularity=${granularity}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch trends");
      return response.json();
    },
  });

  // Fetch species breakdown
  const { data: speciesBreakdown, isLoading: speciesLoading, error: speciesError } = useQuery<SpeciesBreakdown[]>({
    queryKey: ["/api/analytics/species-breakdown"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/species-breakdown", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch species breakdown");
      return response.json();
    },
  });

  // Fetch reports metrics
  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ metrics: ReportsMetrics }>({
    queryKey: ['/api/reports'],
  });

  const handleExport = () => {
    if (!overview) return;

    // Generate CSV export
    const csvData = [
      ["Metric", "Value"],
      ["Total Adoptions", overview.totalAdoptions],
      ["Adoptions This Period", overview.adoptionsThisPeriod],
      ["Adoption Rate", `${overview.adoptionRate}%`],
      ["Average Days to Adoption", overview.averageDaysToAdoption],
      ["Total Applications", overview.totalApplications],
      ["Application Conversion Rate", `${overview.applicationConversionRate}%`],
      ["Total Revenue", `$${overview.totalRevenue.toFixed(2)}`],
      ["Revenue This Period", `$${overview.revenueThisPeriod.toFixed(2)}`],
      ["Average Donation", `$${overview.averageDonationAmount}`],
      ["Total Donors", overview.totalDonors],
      ["Donor Retention Rate", `${overview.donorRetentionRate}%`],
      ["Total Animals", overview.totalAnimals],
      ["Available Animals", overview.availableAnimals],
      ["Total Volunteers", overview.totalVolunteers],
      ["Volunteer Participation Rate", `${overview.volunteerParticipationRate}%`],
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (overviewLoading) {
    return (
      <DashboardLayout
        title="Analytics & Reports"
        description="Track your organization's key metrics and performance"
      >
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading analytics...</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (overviewError) {
    return (
      <DashboardLayout
        title="Analytics & Reports"
        description="Track your organization's key metrics and performance"
      >
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-destructive">Error loading analytics. Please try again.</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Analytics & Reports"
      description="Track your organization's key metrics and performance"
    >
      <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-6" data-testid="page-analytics">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div></div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
            <SelectTrigger className="w-[140px]" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} variant="outline" data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Operational Reports Section */}
      {reportsData?.metrics && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Operational Metrics</h2>
            <p className="text-sm text-muted-foreground">Key insights for grants and board meetings</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-intakes-adoptions">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Intakes vs Adoptions</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">This Month</div>
                  <div className="flex justify-between text-sm gap-4">
                    <span>Intakes: <span className="font-semibold">{reportsData.metrics.intakesThisMonth}</span></span>
                    <span>Adoptions: <span className="font-semibold text-green-600 dark:text-green-400">{reportsData.metrics.adoptionsThisMonth}</span></span>
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <div className="text-xs text-muted-foreground">Year to Date</div>
                  <div className="flex justify-between text-sm gap-4">
                    <span>Intakes: <span className="font-semibold">{reportsData.metrics.intakesYTD}</span></span>
                    <span>Adoptions: <span className="font-semibold text-green-600 dark:text-green-400">{reportsData.metrics.adoptionsYTD}</span></span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-length-of-stay">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Length of Stay</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{reportsData.metrics.avgLengthOfStay}</div>
                <p className="text-xs text-muted-foreground">days from intake to adoption</p>
              </CardContent>
            </Card>

            <Card data-testid="card-active-fosters">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Foster Homes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{reportsData.metrics.activeFosters}</div>
                <p className="text-xs text-muted-foreground">currently providing care</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 lg:col-span-1" data-testid="card-financial-snapshot">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Financial Snapshot</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">This Month Net</span>
                    <span className={`font-semibold ${
                      reportsData.metrics.totalDonationsThisMonth - reportsData.metrics.totalExpendituresThisMonth >= 0 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      ${(reportsData.metrics.totalDonationsThisMonth - reportsData.metrics.totalExpendituresThisMonth).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">YTD Net</span>
                    <span className={`font-semibold ${
                      reportsData.metrics.totalDonationsYTD - reportsData.metrics.totalExpendituresYTD >= 0 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      ${(reportsData.metrics.totalDonationsYTD - reportsData.metrics.totalExpendituresYTD).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Details */}
          <Card data-testid="card-financial-details">
            <CardHeader>
              <CardTitle className="text-base">Financial Overview</CardTitle>
              <CardDescription>Donations vs expenditures breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">This Month</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Donations</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        ${reportsData.metrics.totalDonationsThisMonth.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Expenditures</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        ${reportsData.metrics.totalExpendituresThisMonth.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net</span>
                      <span className={`font-bold ${
                        reportsData.metrics.totalDonationsThisMonth - reportsData.metrics.totalExpendituresThisMonth >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        ${(reportsData.metrics.totalDonationsThisMonth - reportsData.metrics.totalExpendituresThisMonth).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">Year to Date</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Donations</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        ${reportsData.metrics.totalDonationsYTD.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Expenditures</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        ${reportsData.metrics.totalExpendituresYTD.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net</span>
                      <span className={`font-bold ${
                        reportsData.metrics.totalDonationsYTD - reportsData.metrics.totalExpendituresYTD >= 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        ${(reportsData.metrics.totalDonationsYTD - reportsData.metrics.totalExpendituresYTD).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analytics Metrics Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Performance Analytics</h2>
          <p className="text-sm text-muted-foreground">Track trends and key performance indicators</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Adoptions</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-adoptions">
              {overview?.totalAdoptions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              +{overview?.adoptionsThisPeriod || 0} this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Adoption Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-adoption-rate">
              {overview?.adoptionRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Avg {overview?.averageDaysToAdoption || 0} days to adopt
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-revenue">
              ${overview?.totalRevenue?.toFixed(0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              +${overview?.revenueThisPeriod?.toFixed(0) || 0} this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-applications">
              {overview?.totalApplications || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.applicationConversionRate || 0}% conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Animals</CardTitle>
            <PawPrint className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-available-animals">
              {overview?.availableAnimals || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.animalsInFoster || 0} in foster
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-donors">
              {overview?.totalDonors || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.donorRetentionRate || 0}% retention rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Volunteers</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-active-volunteers">
              {overview?.activeVolunteersThisPeriod || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.volunteerParticipationRate || 0}% participation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Donation</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-avg-donation">
              ${overview?.averageDonationAmount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.recurringDonors || 0} recurring donors
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Performance Trends</CardTitle>
                <CardDescription>Track key metrics over time</CardDescription>
              </div>
              <Select
                value={granularity}
                onValueChange={(value: any) => setGranularity(value)}
              >
                <SelectTrigger className="w-[120px]" data-testid="select-granularity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-muted-foreground">Loading trends...</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="adoptions"
                    stroke="hsl(var(--chart-1))"
                    name="Adoptions"
                  />
                  <Line
                    type="monotone"
                    dataKey="applications"
                    stroke="hsl(var(--chart-2))"
                    name="Applications"
                  />
                  <Line
                    type="monotone"
                    dataKey="newAnimals"
                    stroke="hsl(var(--chart-3))"
                    name="New Animals"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Adoptions by Species */}
        <Card>
          <CardHeader>
            <CardTitle>Adoptions by Species</CardTitle>
            <CardDescription>Distribution of adopted animals</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={overview?.adoptionsBySpecies || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.species}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {(overview?.adoptionsBySpecies || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Application Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Application Funnel</CardTitle>
            <CardDescription>Application stages breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={overview?.applicationsByStage || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Species Breakdown Table */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Species Performance Details</CardTitle>
            <CardDescription>
              Detailed metrics by animal species
            </CardDescription>
          </CardHeader>
          <CardContent>
            {speciesLoading ? (
              <div className="text-muted-foreground">Loading species data...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Species</th>
                      <th className="text-right p-2 font-medium">Total</th>
                      <th className="text-right p-2 font-medium">Adopted</th>
                      <th className="text-right p-2 font-medium">Available</th>
                      <th className="text-right p-2 font-medium">Avg Days to Adopt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(speciesBreakdown || []).map((species) => (
                      <tr key={species.species} className="border-b">
                        <td className="p-2 capitalize">{species.species}</td>
                        <td className="text-right p-2">{species.total}</td>
                        <td className="text-right p-2">{species.adopted}</td>
                        <td className="text-right p-2">{species.available}</td>
                        <td className="text-right p-2">{species.averageDaysToAdoption}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Donation revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(var(--chart-4))" name="Revenue ($)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
      </div>
    </DashboardLayout>
  );
}
