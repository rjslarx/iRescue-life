import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface VisitStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
}

export default function WebsiteVisitsWidget() {
  const { data, isLoading } = useQuery<{ stats: VisitStats }>({
    queryKey: ["/api/analytics/visits"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Website Visits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const stats = data?.stats || {
    today: 0,
    yesterday: 0,
    thisWeek: 0,
    lastWeek: 0,
    thisMonth: 0,
  };

  const getTrend = (current: number, previous: number) => {
    if (current > previous) {
      return { icon: TrendingUp, color: "text-green-500", label: "Up" };
    } else if (current < previous) {
      return { icon: TrendingDown, color: "text-red-500", label: "Down" };
    }
    return { icon: Minus, color: "text-muted-foreground", label: "Same" };
  };

  const dailyTrend = getTrend(stats.today, stats.yesterday);
  const weeklyTrend = getTrend(stats.thisWeek, stats.lastWeek);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Website Visits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold" data-testid="text-visits-today">
              {stats.today}
            </p>
            <p className="text-xs text-muted-foreground">Today</p>
            <div className={`flex items-center justify-center gap-1 ${dailyTrend.color}`}>
              <dailyTrend.icon className="h-3 w-3" />
              <span className="text-xs">{dailyTrend.label}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" data-testid="text-visits-week">
              {stats.thisWeek}
            </p>
            <p className="text-xs text-muted-foreground">This Week</p>
            <div className={`flex items-center justify-center gap-1 ${weeklyTrend.color}`}>
              <weeklyTrend.icon className="h-3 w-3" />
              <span className="text-xs">{weeklyTrend.label}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" data-testid="text-visits-month">
              {stats.thisMonth}
            </p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
