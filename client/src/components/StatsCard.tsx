import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    change: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'amber';
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-950',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-950',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-950',
    icon: 'text-green-600 dark:text-green-400',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-950',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-950',
    icon: 'text-pink-600 dark:text-pink-400',
  },
  cyan: {
    bg: 'bg-cyan-100 dark:bg-cyan-950',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-950',
    icon: 'text-amber-600 dark:text-amber-400',
  },
};

export default function StatsCard({ title, value, icon: Icon, trend, color = 'blue' }: StatsCardProps) {
  const colors = colorClasses[color];
  
  return (
    <Card data-testid={`card-stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-semibold" data-testid={`text-stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
              {value}
            </p>
            {trend && (
              <div className="flex items-center gap-1 text-xs" data-testid={`trend-${title.toLowerCase().replace(/\s/g, '-')}`}>
                {trend.change > 0 && trend.isPositive && (
                  <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-500" />
                )}
                {trend.change > 0 && !trend.isPositive && (
                  <TrendingUp className="h-3 w-3 text-red-600 dark:text-red-500" />
                )}
                {trend.change < 0 && (
                  <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-500" />
                )}
                <span className={
                  trend.change === 0 
                    ? "text-muted-foreground" 
                    : trend.isPositive 
                      ? "text-green-600 dark:text-green-500" 
                      : "text-red-600 dark:text-red-500"
                }>
                  {trend.change > 0 ? '+' : ''}{trend.change}%
                </span>
                <span className="text-muted-foreground">vs last month</span>
              </div>
            )}
          </div>
          <div className={`rounded-md ${colors.bg} p-3`}>
            <Icon className={`h-6 w-6 ${colors.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
