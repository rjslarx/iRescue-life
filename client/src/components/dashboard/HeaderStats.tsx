import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, Home, Heart } from "lucide-react";
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

export default function HeaderStats() {
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
  const pendingIntakes = actionItemsData?.breakdown?.surrenders || 0;

  const stats = [
    {
      label: 'Intakes',
      value: pendingIntakes,
      icon: Inbox,
      href: '/dashboard#intake',
      urgent: pendingIntakes > 0,
    },
    {
      label: 'Shelter',
      value: inShelter,
      icon: Home,
      href: '/dashboard/animals',
      urgent: false,
    },
    {
      label: 'Foster',
      value: inFoster,
      icon: Heart,
      href: '/dashboard/animals?location=foster',
      urgent: false,
    },
  ];

  const handleHashLinkClick = (href: string) => {
    if (href.includes('#')) {
      setTimeout(() => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, 0);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 sm:gap-5" data-testid="header-stats">
      {stats.map((stat) => (
        <Link 
          key={stat.label} 
          href={stat.href} 
          onClick={() => handleHashLinkClick(stat.href)}
          data-testid={`link-header-stat-${stat.label.toLowerCase()}`}
        >
          <div className="flex flex-col items-center gap-1">
            <div 
              className={`
                relative flex items-center justify-center 
                h-10 w-10 sm:h-12 sm:w-12 
                rounded-full border-2 
                hover-elevate
                ${stat.urgent 
                  ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400' 
                  : 'border-muted-foreground/30 bg-muted/50 text-foreground'
                }
              `}
              data-testid={`stat-circle-${stat.label.toLowerCase()}`}
            >
              <span className="text-base sm:text-lg font-bold">{stat.value}</span>
              {stat.urgent && stat.value > 0 && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
              {stat.label}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
