import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UserCircle, X, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface PlatformImpersonationStatus {
  impersonating: boolean;
  tenant?: {
    id: string;
    name: string;
    subdomain: string;
  };
}

interface UserImpersonationStatus {
  impersonating: boolean;
  impersonatedUserId?: string;
  impersonatedUserName?: string;
  realUserId?: string;
  realUserName?: string;
  startedAt?: number;
}

export function ImpersonationBanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  const isPlatformAdmin = user?.roles?.includes('platform_admin');
  const isOwner = user?.roles?.includes('owner');

  const { data: platformData } = useQuery<PlatformImpersonationStatus>({
    queryKey: ['/api/platform/impersonation-status'],
    refetchInterval: 5000,
    enabled: isAuthenticated && isPlatformAdmin,
  });

  const { data: userImpersonationData } = useQuery<UserImpersonationStatus>({
    queryKey: ['/api/impersonation/status'],
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const endPlatformImpersonationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/platform/end-impersonation', {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/impersonation-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/me'] });
      toast({
        title: "Impersonation ended",
        description: "Returning to platform admin view...",
      });
      setTimeout(() => {
        setLocation('/platform/dashboard');
      }, 500);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to end impersonation",
        variant: "destructive",
      });
    },
  });

  const endUserImpersonationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/impersonation/stop');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/impersonation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: "Impersonation Ended",
        description: "You are now viewing as yourself again.",
      });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop impersonation",
        variant: "destructive",
      });
    },
  });

  if (userImpersonationData?.impersonating) {
    const duration = userImpersonationData.startedAt 
      ? Math.floor((Date.now() - userImpersonationData.startedAt) / 60000)
      : 0;

    return (
      <Alert 
        className="rounded-none border-x-0 border-t-0 border-b bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" 
        data-testid="impersonation-banner-user"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Viewing as <span className="font-bold">{userImpersonationData.impersonatedUserName}</span>
              {duration > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  <Clock className="inline h-3 w-3 mr-1" />
                  {duration}m
                </span>
              )}
            </AlertDescription>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-600 dark:text-amber-400 hidden sm:inline">
              Logged in as {userImpersonationData.realUserName}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => endUserImpersonationMutation.mutate()}
              disabled={endUserImpersonationMutation.isPending}
              data-testid="button-stop-user-impersonation"
              className="border-amber-300 dark:border-amber-700"
            >
              <X className="h-3 w-3 mr-1" />
              {endUserImpersonationMutation.isPending ? 'Exiting...' : 'Exit View'}
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  if (platformData?.impersonating && platformData?.tenant) {
    return (
      <Alert 
        className="rounded-none border-x-0 border-t-0 border-b bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" 
        data-testid="impersonation-banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Viewing as <span className="font-bold">{platformData.tenant.name}</span> ({platformData.tenant.subdomain})
            </AlertDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => endPlatformImpersonationMutation.mutate()}
            disabled={endPlatformImpersonationMutation.isPending}
            data-testid="button-exit-impersonation"
            className="border-yellow-300 dark:border-yellow-700"
          >
            <X className="h-3 w-3 mr-1" />
            {endPlatformImpersonationMutation.isPending ? 'Exiting...' : 'Exit View'}
          </Button>
        </div>
      </Alert>
    );
  }

  return null;
}
