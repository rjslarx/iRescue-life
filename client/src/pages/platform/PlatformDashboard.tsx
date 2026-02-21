import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Building2, Users, PawPrint, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalAnimals: number;
  recentActivity: {
    newTenantsThisMonth: number;
    newUsersThisMonth: number;
  };
}

export default function PlatformDashboard() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();

  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ['/api/platform/stats'],
  });

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div>
              <h1 className="text-2xl font-semibold" data-testid="heading-platform-dashboard">Platform Dashboard</h1>
              <p className="text-sm text-muted-foreground">System-wide overview and metrics</p>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl space-y-6">
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : stats ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card data-testid="card-total-tenants">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-total-tenants">{stats.totalTenants}</div>
                        <p className="text-xs text-muted-foreground">
                          {stats.activeTenants} active
                        </p>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-total-users">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-total-users">{stats.totalUsers}</div>
                        <p className="text-xs text-muted-foreground">
                          +{stats.recentActivity.newUsersThisMonth} this month
                        </p>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-total-animals">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Animals</CardTitle>
                        <PawPrint className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-total-animals">{stats.totalAnimals}</div>
                        <p className="text-xs text-muted-foreground">
                          Across all rescues
                        </p>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-new-tenants">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-new-tenants">{stats.recentActivity.newTenantsThisMonth}</div>
                        <p className="text-xs text-muted-foreground">
                          New organizations
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Welcome to Platform Administration</CardTitle>
                      <CardDescription>
                        Manage all rescue organizations, users, and system-wide settings from this central hub.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Use the navigation menu to access:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>Tenant Management - View, create, and manage rescue organizations</li>
                        <li>User Oversight - Monitor users across all tenants</li>
                        <li>Platform Settings - Configure system-wide preferences</li>
                      </ul>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="text-center p-8">
                  <p className="text-muted-foreground">Unable to load platform statistics</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
