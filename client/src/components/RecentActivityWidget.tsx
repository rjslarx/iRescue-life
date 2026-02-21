import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { 
  CirclePlus, 
  AlertTriangle, 
  Truck, 
  Star, 
  DollarSign, 
  User, 
  Settings,
  Activity
} from "lucide-react";

type ActivityCategory = "intake" | "medical" | "movement" | "adoption" | "finance" | "user" | "system";

interface ActivityLogWithUser {
  id: string;
  tenantId: string;
  userId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  description: string;
  category: ActivityCategory;
  metadata: Record<string, any> | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

interface ActivityResponse {
  activities: ActivityLogWithUser[];
}

const categoryConfig: Record<ActivityCategory, { icon: typeof CirclePlus; color: string; bgColor: string }> = {
  intake: { 
    icon: CirclePlus, 
    color: "text-green-600 dark:text-green-400", 
    bgColor: "bg-green-100 dark:bg-green-900/30" 
  },
  medical: { 
    icon: AlertTriangle, 
    color: "text-red-600 dark:text-red-400", 
    bgColor: "bg-red-100 dark:bg-red-900/30" 
  },
  movement: { 
    icon: Truck, 
    color: "text-blue-600 dark:text-blue-400", 
    bgColor: "bg-blue-100 dark:bg-blue-900/30" 
  },
  adoption: { 
    icon: Star, 
    color: "text-yellow-600 dark:text-yellow-400", 
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30" 
  },
  finance: { 
    icon: DollarSign, 
    color: "text-emerald-600 dark:text-emerald-400", 
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30" 
  },
  user: { 
    icon: User, 
    color: "text-purple-600 dark:text-purple-400", 
    bgColor: "bg-purple-100 dark:bg-purple-900/30" 
  },
  system: { 
    icon: Settings, 
    color: "text-gray-600 dark:text-gray-400", 
    bgColor: "bg-gray-100 dark:bg-gray-900/30" 
  },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ActivityItem({ activity }: { activity: ActivityLogWithUser }) {
  const config = categoryConfig[activity.category] || categoryConfig.system;
  const Icon = config.icon;
  const userName = activity.user?.name || 'System';
  const userInitials = getInitials(userName);
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true });

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0" data-testid={`activity-item-${activity.id}`}>
      <div className="relative flex-shrink-0">
        <Avatar className="h-9 w-9">
          {activity.user?.avatarUrl && (
            <AvatarImage src={activity.user.avatarUrl} alt={userName} />
          )}
          <AvatarFallback className="text-xs bg-muted">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full ${config.bgColor}`}>
          <Icon className={`h-3 w-3 ${config.color}`} />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug">
              <span className="font-medium">{userName}</span>
              {' '}
              <span className="text-muted-foreground">{activity.description}</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {timeAgo}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RecentActivityWidget() {
  const { data, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: ['/api/activity-logs'],
    refetchInterval: 30000,
  });

  return (
    <Card data-testid="card-recent-activity">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
        <CardDescription>
          Latest actions across your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="activity-error">
            <p className="text-sm">Unable to load activity</p>
          </div>
        ) : !data?.activities || data.activities.length === 0 ? (
          <div className="text-center py-8" data-testid="activity-empty">
            <Activity className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground mt-1">
              Activities will appear here as your team works
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-0">
              {data.activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
