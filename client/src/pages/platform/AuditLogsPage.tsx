import { useQuery } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { FileText } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  userId: string;
  tenantId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  changes: any;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  tenantName: string | null;
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();

  const { data: logsData, isLoading } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['/api/platform/audit-logs'],
  });

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  const logs = logsData?.logs || [];

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('create')) return 'default';
    if (action.includes('update')) return 'secondary';
    if (action.includes('delete') || action.includes('disable')) return 'destructive';
    return 'outline';
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div>
              <h1 className="text-2xl font-semibold" data-testid="heading-audit-logs">Audit Logs</h1>
              <p className="text-sm text-muted-foreground">Track all platform administrator actions</p>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl">
              <Card>
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="p-6 space-y-4">
                      {[...Array(10)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : logs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>IP Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => (
                          <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                            <TableCell className="font-mono text-xs">
                              {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">{log.userName}</div>
                                <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getActionBadgeVariant(log.action)} className="font-mono text-xs">
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {log.entityType && (
                                <div>
                                  <div>{log.entityType}</div>
                                  {log.entityId && (
                                    <div className="text-muted-foreground truncate max-w-[100px]">
                                      {log.entityId.substring(0, 8)}...
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.tenantName || <span className="text-muted-foreground italic">Platform</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {log.ipAddress || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No audit logs found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
