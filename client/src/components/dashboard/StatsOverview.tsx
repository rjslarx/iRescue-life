import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Heart, ClipboardList, Users, HandHeart, Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

interface AnimalCountsResponse {
  inShelter: number;
  inFoster: number;
  total: number;
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

export default function StatsOverview() {
  const { user } = useAuth();
  const allowedRoles = ['admin', 'owner', 'board_member', 'staff', 'intake_coordinator'];

  const { data: animalCountsData, isLoading: isLoadingAnimalCounts } = useQuery<AnimalCountsResponse>({
    queryKey: ['/api/dashboard/animal-counts', user?.activeRole],
    enabled: !!user && user.activeRole !== 'foster',
  });

  const { data: actionItemsData, isLoading: isLoadingActionItems } = useQuery<ActionItemsResponse>({
    queryKey: ['/api/dashboard/action-items-count', user?.activeRole],
    enabled: !!user && allowedRoles.includes(user.activeRole || ''),
  });

  const isLoading = isLoadingAnimalCounts || isLoadingActionItems;
  const inShelter = animalCountsData?.inShelter || 0;
  const inFoster = animalCountsData?.inFoster || 0;
  const pendingAdoptions = actionItemsData?.breakdown?.adoptions || 0;
  const pendingFosters = actionItemsData?.breakdown?.fosters || 0;
  const pendingVolunteers = actionItemsData?.breakdown?.volunteers || 0;
  const pendingIntakes = actionItemsData?.breakdown?.surrenders || 0;

  const stats = [
    {
      label: 'Pending Adoptions',
      value: pendingAdoptions,
      description: 'Adoption applications',
      icon: ClipboardList,
      href: '#section-pipeline-manager',
    },
    {
      label: 'Pending Fosters',
      value: pendingFosters,
      description: 'Foster applications',
      icon: HandHeart,
      href: '#section-pipeline-manager',
    },
    {
      label: 'Pending Volunteers',
      value: pendingVolunteers,
      description: 'Volunteer applications',
      icon: Users,
      href: '#section-pipeline-manager',
    },
    {
      label: 'Pending Intakes',
      value: pendingIntakes,
      description: 'Surrender requests',
      icon: Inbox,
      href: '#section-pipeline-manager',
    },
    {
      label: 'In Shelter',
      value: inShelter,
      description: 'Animals currently on-site',
      icon: Home,
      href: '/dashboard/animals?location=shelter',
    },
    {
      label: 'In Foster Homes',
      value: inFoster,
      description: 'Animals in foster care',
      icon: Heart,
      href: '/dashboard/animals?location=foster',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="stats-overview-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
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
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="stats-overview">
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
