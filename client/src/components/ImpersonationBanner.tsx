import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UserCircle, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface ImpersonationStatus {
  impersonating: boolean;
  tenant?: {
    id: string;
    name: string;
    subdomain: string;
  };
}

export function ImpersonationBanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  // Only poll for platform admins to avoid rate limiting
  const isPlatformAdmin = user?.roles?.includes('platform_admin');

  const { data } = useQuery<ImpersonationStatus>({
    queryKey: ['/api/platform/impersonation-status'],
    refetchInterval: 5000, // Check every 5 seconds
    enabled: isAuthenticated && isPlatformAdmin, // Only run for platform admins
  });

  const endImpersonationMutation = useMutation({
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
      // Redirect to platform dashboard
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

  if (!data?.impersonating || !data?.tenant) {
    return null;
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-b bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" data-testid="impersonation-banner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Viewing as <span className="font-bold">{data.tenant.name}</span> ({data.tenant.subdomain})
          </AlertDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => endImpersonationMutation.mutate()}
          disabled={endImpersonationMutation.isPending}
          data-testid="button-exit-impersonation"
          className="border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900"
        >
          <X className="h-3 w-3 mr-1" />
          {endImpersonationMutation.isPending ? 'Exiting...' : 'Exit View'}
        </Button>
      </div>
    </Alert>
  );
}
