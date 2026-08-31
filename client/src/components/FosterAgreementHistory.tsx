import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Session {
  id: string; fosterApplicationId: string | null; origin?: string | null; fosterName?: string | null;
  fosterEmail?: string | null; fosterPhone?: string | null; templateName?: string | null; sendMethod?: string | null;
  status: string; expiresAt?: string | null; signedAt?: string | null; contractPdfUrl?: string | null; createdAt?: string | null;
}
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
const label = (value?: string | null) => value === "both" ? "Email & SMS" : value?.toUpperCase() || "—";

export function FosterAgreementHistory() {
  const { toast } = useToast();
  const sessionsQuery = useQuery<{ sessions: Session[] }>({ queryKey: ["/api/foster-agreements/sessions"] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/foster-agreements/sessions"] });
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "resend" | "cancel" }) => {
      const response = await apiRequest("POST", `/api/foster-agreements/sessions/${id}/${action}`);
      return response.json();
    },
    onSuccess: (data: { warning?: string }, variables) => {
      refresh();
      toast({
        title: variables.action === "resend"
          ? data.warning ? "Agreement resent with a delivery warning" : "Agreement resent"
          : "Agreement cancelled",
        description: data.warning,
        variant: data.warning ? "destructive" : "default",
      });
    },
    onError: (error: Error) => toast({ title: "Agreement action failed", description: error.message || "Please try again.", variant: "destructive" }),
  });
  const downloadMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("GET", `/api/foster-agreements/sessions/${id}/download`)).json(),
    onSuccess: (data) => {
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      else toast({ title: "PDF unavailable", description: "The signed agreement PDF is not available.", variant: "destructive" });
    },
    onError: (error: Error) => toast({ title: "Could not download agreement", description: error.message, variant: "destructive" }),
  });
  const sessions = sessionsQuery.data?.sessions || [];
  return <Card data-testid="card-foster-agreement-history">
    <CardHeader><CardTitle>Agreement History</CardTitle></CardHeader>
    <CardContent>
      {sessionsQuery.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        : sessionsQuery.isError ? <div className="py-8 text-center"><p className="text-destructive">Agreement history could not be loaded.</p><Button variant="outline" className="mt-3" onClick={refresh}>Try again</Button></div>
        : sessions.length === 0 ? <p className="py-8 text-center text-muted-foreground" data-testid="text-no-foster-agreement-history">No foster agreements have been sent yet.</p>
        : <div className="space-y-3">{sessions.map(session => {
          const pending = session.status === "pending";
          const signing = actionMutation.isPending && actionMutation.variables?.id === session.id;
          return <div key={session.id} className="rounded-md border p-3 sm:p-4" data-testid={`row-foster-agreement-session-${session.id}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{session.fosterName || "Unknown recipient"}</p><Badge variant="outline">{session.origin === "direct" ? "Direct" : "Application"}</Badge><Badge>{session.status === "resending" ? "Resending…" : session.status}</Badge></div>
                <p className="text-sm text-muted-foreground break-all">{session.fosterEmail || session.fosterPhone || "No contact recorded"}</p>
                <p className="text-xs text-muted-foreground">Delivery: {label(session.sendMethod)} · Sent: {date(session.createdAt)}{session.signedAt ? ` · Signed: ${date(session.signedAt)}` : session.expiresAt ? ` · Expires: ${date(session.expiresAt)}` : ""}</p>
                {session.templateName && <p className="text-xs text-muted-foreground">Template: {session.templateName}</p>}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {pending && <><Button size="sm" variant="outline" disabled={signing} onClick={() => actionMutation.mutate({ id: session.id, action: "resend" })} data-testid={`button-resend-foster-agreement-${session.id}`}><RefreshCw className="mr-1 h-4 w-4" />Resend</Button>
                  <Button size="sm" variant="outline" disabled={signing} onClick={() => actionMutation.mutate({ id: session.id, action: "cancel" })} data-testid={`button-cancel-foster-agreement-${session.id}`}><XCircle className="mr-1 h-4 w-4" />Cancel</Button></>}
                {session.status === "signed" && <Button size="sm" variant="outline" disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate(session.id)} data-testid={`button-download-foster-agreement-${session.id}`}><Download className="mr-1 h-4 w-4" />View / Download PDF</Button>}
              </div>
            </div>
          </div>;
        })}</div>}
    </CardContent>
  </Card>;
}