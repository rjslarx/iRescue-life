import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { FileText } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  changes: any;
  metadata: any;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export default function TenantAuditLogsPage() {
  const { data: logsData, isLoading, isError } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['/api/audit-logs'],
  });

  const logs = logsData?.logs || [];

  const getActionBadgeVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
    if (action.includes('create') || action.includes('invited')) return 'default';
    if (action.includes('update') || action.includes('stage_change') || action.includes('status_change')) return 'secondary';
    if (action.includes('delete') || action.includes('disable') || action.includes('declined')) return 'destructive';
    return 'outline';
  };

  const formatAction = (action: string) => {
    return action
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <DashboardLayout
      title="Audit Logs"
      description="Review team member activity and changes within your organization"
    >
      <div className="max-w-7xl">
        <Card>
          <CardContent className="p-0">
            {isError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground font-medium">Unable to load audit logs</p>
                <p className="text-sm text-muted-foreground mt-1">You may not have permission to view this page</p>
              </div>
            ) : isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : logs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Team Member</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} data-testid={`audit-log-row-${log.id}`}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm" data-testid={`audit-log-user-${log.id}`}>{log.userName || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)} className="font-mono text-xs" data-testid={`audit-log-action-${log.id}`}>
                          {formatAction(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.entityType ? (
                          <div>
                            <div className="capitalize">{log.entityType.replace(/_/g, ' ')}</div>
                            {log.entityId && (
                              <div className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                                {log.entityId.substring(0, 8)}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[250px]">
                        {(() => {
                          const parts: string[] = [];
                          if (log.changes?.before?.status && log.changes?.after?.status) {
                            parts.push(`${log.changes.before.status} → ${log.changes.after.status}`);
                          } else if (log.changes?.after?.stage) {
                            parts.push(`→ ${log.changes.after.stage}`);
                          } else if (log.changes?.after?.status) {
                            parts.push(`→ ${log.changes.after.status}`);
                          }
                          if (log.metadata?.applicantName) parts.push(log.metadata.applicantName);
                          else if (log.metadata?.animalName) parts.push(log.metadata.animalName);
                          else if (log.metadata?.targetUserName) parts.push(log.metadata.targetUserName);
                          else if (log.metadata?.invitedEmail) parts.push(log.metadata.invitedEmail);
                          else if (log.metadata?.dogName) parts.push(log.metadata.dogName);
                          if (parts.length === 0 && log.metadata) {
                            return (
                              <span className="truncate block" title={JSON.stringify(log.metadata, null, 2)}>
                                {Object.entries(log.metadata).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')}
                              </span>
                            );
                          }
                          return parts.length > 0 ? (
                            <span className="truncate block" title={JSON.stringify({ changes: log.changes, metadata: log.metadata }, null, 2)}>
                              {parts.join(' - ')}
                            </span>
                          ) : '-';
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground font-medium">No audit logs found</p>
                <p className="text-sm text-muted-foreground mt-1">Activity from your team will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}