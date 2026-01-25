import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Heart, FileText, Stethoscope } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Animal } from "@shared/schema";

interface AnimalsResponse {
  animals: Animal[];
}

interface StatsResponse {
  stats: {
    pendingApplications: number;
    animalsInCare: number;
  };
}

export default function StatsOverview() {
  const { user } = useAuth();

  const { data: animalsData, isLoading: isLoadingAnimals } = useQuery<AnimalsResponse>({
    queryKey: ['/api/animals', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: statsData, isLoading: isLoadingStats } = useQuery<StatsResponse>({
    queryKey: ['/api/stats', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const isLoading = isLoadingAnimals || isLoadingStats;
  const animals = animalsData?.animals || [];

  const onSiteCount = animals.filter(a => a.status === 'Shelter' || a.status === 'Boarding').length;
  const inFosterCount = animals.filter(a => a.status === 'Foster').length;
  const pendingAppsCount = statsData?.stats?.pendingApplications || 0;
  const medicalNeedsCount = animals.filter(a => 
    a.medicalStatus === 'needs_vetting' || a.medicalStatus === 'surgery_pending'
  ).length;

  const stats = [
    {
      label: 'On Site',
      value: onSiteCount,
      icon: Home,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'In Foster',
      value: inFosterCount,
      icon: Heart,
      color: 'text-pink-500',
      bgColor: 'bg-pink-100 dark:bg-pink-900/30',
    },
    {
      label: 'Pending Apps',
      value: pendingAppsCount,
      icon: FileText,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Medical Needs',
      value: medicalNeedsCount,
      icon: Stethoscope,
      color: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview">
      {stats.map((stat) => (
        <Card key={stat.label} data-testid={`stat-${stat.label.toLowerCase().replace(' ', '-')}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid={`text-${stat.label.toLowerCase().replace(' ', '-')}-value`}>
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
