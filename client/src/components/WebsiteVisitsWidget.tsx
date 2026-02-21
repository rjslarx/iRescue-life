import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Eye, Users, Globe } from "lucide-react";

interface PageVisitStats {
  today: {
    views: number;
    uniqueVisitors: number;
  };
  thisWeek: {
    views: number;
    uniqueVisitors: number;
  };
  lastWeek: {
    views: number;
  };
  trendPercentage: number;
  topPages: Array<{
    pageType: string;
    views: number;
  }>;
}

const pageTypeLabels: Record<string, string> = {
  home: 'Home',
  animals: 'Animals',
  animal_profile: 'Animal Profile',
  donate: 'Donate',
  wishlist: 'Wishlist',
  foster: 'Foster',
  volunteer: 'Volunteer',
  surrender: 'Surrender',
  contact: 'Contact',
  shop: 'Shop',
  campaign: 'Campaign',
  custom: 'Custom Page',
  other: 'Other',
};

export default function WebsiteVisitsWidget() {
  const { data, isLoading, error } = useQuery<PageVisitStats>({
    queryKey: ['/api/analytics/page-visits'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-website-visits-loading">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const TrendIcon = data.trendPercentage > 0 
    ? TrendingUp 
    : data.trendPercentage < 0 
      ? TrendingDown 
      : Minus;
  
  const trendColor = data.trendPercentage > 0 
    ? 'text-green-600 dark:text-green-400' 
    : data.trendPercentage < 0 
      ? 'text-red-600 dark:text-red-400' 
      : 'text-muted-foreground';

  return (
    <Card data-testid="card-website-visits">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Website Visits</CardTitle>
        </div>
        <CardDescription>Track your public site traffic</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span>Today</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-visits-today">
              {data.today.views.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.today.uniqueVisitors} unique
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>This Week</span>
            </div>
            <div className="text-2xl font-bold" data-testid="text-visits-week">
              {data.thisWeek.views.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-xs" data-testid="text-visits-trend">
              <TrendIcon className={`h-3 w-3 ${trendColor}`} />
              <span className={trendColor}>
                {data.trendPercentage > 0 ? '+' : ''}
                {data.trendPercentage}% vs last week
              </span>
            </div>
          </div>
        </div>

        {data.topPages.length > 0 && (
          <div className="pt-2 border-t" data-testid="section-top-pages">
            <div className="text-sm font-medium mb-2">Top Pages This Week</div>
            <div className="space-y-1.5">
              {data.topPages.slice(0, 3).map((page, idx) => (
                <div 
                  key={page.pageType} 
                  className="flex items-center justify-between text-sm"
                  data-testid={`row-top-page-${idx}`}
                >
                  <span className="text-muted-foreground">
                    {idx + 1}. {pageTypeLabels[page.pageType] || page.pageType}
                  </span>
                  <span className="font-medium" data-testid={`text-top-page-views-${idx}`}>
                    {page.views}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
