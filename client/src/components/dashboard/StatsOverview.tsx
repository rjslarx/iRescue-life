import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Shield, Clipboard, Pill } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

interface StatsResponse {
  stats: {
    pendingApplications: number;
    animalsInCare: number;
  };
}

interface ActionItemsResponse {
  total: number;
  breakdown: {
    surrenders: number;
    adoptions: number;
    fosters: number;
    volunteers: number;
  };
}

interface ComplianceResponse {
  compliance: {
    complianceRate: number;
    overdueMedications: { count: number };
  };
}

interface FosterDashboardStats {
  pendingSupplyRequests: number;
  pendingBioSubmissions: number;
  flaggedNotes: number;
  pendingPhotoApprovals: number;
}

export default function StatsOverview() {
  const { user } = useAuth();

  const { data: statsData, isLoading: isLoadingStats } = useQuery<StatsResponse>({
    queryKey: ['/api/stats', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: complianceData, isLoading: isLoadingCompliance } = useQuery<ComplianceResponse>({
    queryKey: ['/api/dashboard/compliance', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: fosterStats, isLoading: isLoadingFoster } = useQuery<FosterDashboardStats>({
    queryKey: ['/api/foster-portal/staff/dashboard'],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff'),
  });

  const { data: actionItemsData, isLoading: isLoadingActionItems } = useQuery<ActionItemsResponse>({
    queryKey: ['/api/dashboard/action-items-count', user?.activeRole],
    enabled: !!user && (user.activeRole === 'admin' || user.activeRole === 'staff' || user.activeRole === 'owner'),
  });

  const isLoading = isLoadingStats || isLoadingCompliance || isLoadingFoster || isLoadingActionItems;
  const actionItemsCount = actionItemsData?.total || 0;
  const complianceRate = complianceData?.compliance?.complianceRate || 100;
  const overdueMedsCount = complianceData?.compliance?.overdueMedications?.count || 0;
  const behaviorAlerts = fosterStats?.flaggedNotes || 0;

  const stats = [
    {
      label: 'Action Items',
      value: actionItemsCount,
      description: 'Pending requests to process',
      icon: Clipboard,
      href: '#action-items-zone',
    },
    {
      label: 'Overdue Meds',
      value: overdueMedsCount,
      description: 'Animals behind on medication',
      icon: Pill,
      href: '/dashboard/medical-pipeline',
    },
    {
      label: 'Compliance Rate',
      value: `${complianceRate}%`,
      description: 'Medical check compliance',
      icon: Shield,
      href: '#compliance-widget',
    },
    {
      label: 'Behavior Alerts',
      value: behaviorAlerts,
      description: 'Flagged for review',
      icon: AlertTriangle,
      href: '/dashboard/animals?filter=behavior',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const handleClick = (href: string) => {
    if (href.startsWith('#')) {
      const element = document.getElementById(href.slice(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview">
      {stats.map((stat) => {
        const isAnchor = stat.href.startsWith('#');
        const cardContent = (
          <Card 
            className="bg-muted/30 border-0 shadow-none cursor-pointer hover-elevate"
            data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div 
                className="text-3xl font-bold text-foreground mb-1"
                data-testid={`text-${stat.label.toLowerCase().replace(/\s+/g, '-')}-value`}
              >
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        );

        if (isAnchor) {
          return (
            <div 
              key={stat.label} 
              onClick={() => handleClick(stat.href)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleClick(stat.href)}
            >
              {cardContent}
            </div>
          );
        }

        return (
          <Link key={stat.label} href={stat.href}>
            {cardContent}
          </Link>
        );
      })}
    </div>
  );
}
