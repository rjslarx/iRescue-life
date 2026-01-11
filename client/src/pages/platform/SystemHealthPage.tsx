import { useQuery } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Activity, Database, TrendingUp, Users, FileText, DollarSign } from "lucide-react";

interface SystemHealth {
  database: {
    size: string;
    activeConnections: number;
  };
  activity24h: {
    newAnimals: number;
    newApplications: number;
    newDonations: number;
  };
}

export default function SystemHealthPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();

  const { data: healthData, isLoading } = useQuery<SystemHealth>({
    queryKey: ['/api/platform/health'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div>
              <h1 className="text-2xl font-semibold" data-testid="heading-system-health">System Health</h1>
              <p className="text-sm text-muted-foreground">Monitor platform performance and activity</p>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl space-y-6">
              {/* Database Health */}
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Database Size</CardTitle>
                      <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-24" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold" data-testid="stat-db-size">
                            {healthData?.database.size ? formatBytes(parseInt(healthData.database.size)) : '0 MB'}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Total storage used
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold" data-testid="stat-connections">
                            {healthData?.database.activeConnections || 0}
                          </div>
                          <Progress value={(healthData?.database.activeConnections || 0) * 10} className="mt-2" />
                          <p className="text-xs text-muted-foreground mt-1">
                            Current database connections
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Activity (Last 24 Hours) */}
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Activity (Last 24 Hours)
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">New Animals</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold" data-testid="stat-new-animals">
                            {healthData?.activity24h.newAnimals || 0}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Added in the last 24h
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">New Applications</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold" data-testid="stat-new-applications">
                            {healthData?.activity24h.newApplications || 0}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Submitted in the last 24h
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">New Donations</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold" data-testid="stat-new-donations">
                            {healthData?.activity24h.newDonations || 0}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Received in the last 24h
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* System Status */}
              <Card>
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>Overall health indicators</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">API Status</span>
                      <Badge variant="default" className="gap-1">
                        <Activity className="h-3 w-3" />
                        Operational
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Database Status</span>
                      <Badge variant="default" className="gap-1">
                        <Database className="h-3 w-3" />
                        Healthy
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Last Updated</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
