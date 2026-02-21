import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Heart, 
  TrendingUp, 
  PawPrint,
  Users,
  Home,
} from "lucide-react";

interface ImpactStats {
  liveReleaseRate: string;
  totalIntakes: number;
  adoptionsCount: number;
  liveOutcomes: number;
  totalOutcomes: number;
  periodStart: string;
  periodEnd: string;
  periodType: string;
}

interface ImpactWidgetProps {
  variant?: 'full' | 'compact' | 'minimal';
  className?: string;
  showTitle?: boolean;
}

export default function ImpactWidget({ 
  variant = 'full', 
  className = '',
  showTitle = true,
}: ImpactWidgetProps) {
  const { data, isLoading } = useQuery<{ 
    hasData: boolean;
    stats?: ImpactStats;
    settings?: { showOnPublicSite: boolean };
  }>({
    queryKey: ['/api/compliance/public/impact-stats'],
  });

  if (isLoading) {
    if (variant === 'minimal') {
      return <Skeleton className={`h-16 w-40 ${className}`} />;
    }
    return <Skeleton className={`h-48 w-full ${className}`} />;
  }

  if (!data?.hasData || !data.stats) {
    return null;
  }

  const { stats } = data;
  const lrr = parseFloat(stats.liveReleaseRate);
  const periodLabel = getPeriodLabel(stats.periodType);

  function getPeriodLabel(type: string): string {
    switch (type) {
      case 'monthly':
        return 'Last Month';
      case 'quarterly':
        return 'Last Quarter';
      case 'annual':
        return 'Last Year';
      case 'rolling_12_months':
        return 'Rolling 12 Months';
      default:
        return type;
    }
  }

  function getLrrColor(rate: number): string {
    if (rate >= 90) return 'text-green-600 dark:text-green-400';
    if (rate >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  }

  function getLrrBadgeVariant(rate: number): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (rate >= 90) return 'default';
    if (rate >= 80) return 'secondary';
    return 'outline';
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="impact-widget-minimal">
        <PawPrint className="h-5 w-5 text-primary" />
        <span className={`text-lg font-bold ${getLrrColor(lrr)}`}>
          {lrr.toFixed(1)}%
        </span>
        <span className="text-sm text-muted-foreground">Live Release Rate</span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <Card className={className} data-testid="impact-widget-compact">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              <span className="font-medium">Live Release Rate</span>
            </div>
            <Badge variant={getLrrBadgeVariant(lrr)}>{periodLabel}</Badge>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className={`text-4xl font-bold ${getLrrColor(lrr)}`}>
              {lrr.toFixed(1)}%
            </span>
          </div>
          <Progress value={lrr} className="h-2 mb-4" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span>{stats.adoptionsCount} adoptions</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{stats.totalIntakes} intakes</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="impact-widget-full">
      {showTitle && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Our Impact
              </CardTitle>
              <CardDescription>Making a difference for animals in need</CardDescription>
            </div>
            <Badge variant={getLrrBadgeVariant(lrr)}>{periodLabel}</Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className={showTitle ? '' : 'pt-6'}>
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground mb-2">Live Release Rate</p>
          <div className={`text-5xl font-bold ${getLrrColor(lrr)}`}>
            {lrr.toFixed(1)}%
          </div>
          <Progress value={lrr} className="h-3 mt-4 max-w-xs mx-auto" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Home className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.adoptionsCount}</p>
            <p className="text-xs text-muted-foreground">Adoptions</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Users className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.totalIntakes}</p>
            <p className="text-xs text-muted-foreground">Total Intakes</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Heart className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.liveOutcomes}</p>
            <p className="text-xs text-muted-foreground">Live Outcomes</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <PawPrint className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{stats.totalOutcomes}</p>
            <p className="text-xs text-muted-foreground">Total Outcomes</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Live Release Rate measures the percentage of animals leaving our care alive through 
          adoption, transfer, or return to owner.
        </p>
      </CardContent>
    </Card>
  );
}
