import { useState } from "react";
import { Gamepad2, LockKeyhole, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrivateGamePlayer } from "@/components/vip/PrivateGamePlayer";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useToast } from "@/hooks/use-toast";
import { usePilotDetails, usePilotTenants, usePilotUpdate, type PilotInvitation } from "@/hooks/use-vip-game";

export default function VipGamePilotPage() {
  const { user } = useAuth();
  const { isLoading: checkingAccess, isPlatformAdmin } = usePlatformAdmin();
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState(false);
  const [revoking, setRevoking] = useState<PilotInvitation | null>(null);
  const tenants = usePilotTenants(isPlatformAdmin && !checkingAccess);
  const selectedId = tenantId || tenants.data?.tenants[0]?.id || "";
  const selectedTenant = tenants.data?.tenants.find((tenant) => tenant.id === selectedId);
  const details = usePilotDetails(selectedId, isPlatformAdmin && !checkingAccess);
  const update = usePilotUpdate();
  const feedback = {
    onSuccess: (result: { message: string }) => {
      toast({ title: "Pilot updated", description: result.message });
    },
    onError: (error: Error) => {
      toast({ title: "Could not update pilot", description: error.message, variant: "destructive" });
    },
  };
  const busy = update.isPending;

  if (checkingAccess || !isPlatformAdmin) {
    return <div className="min-h-[100dvh] space-y-4 p-6" aria-label="Checking platform access"><Skeleton className="h-10 w-64" /><Skeleton className="h-52 w-full" /></div>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-4 border-b p-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold" data-testid="heading-vip-game-pilot">VIP game pilot</h1>
              <p className="text-sm text-muted-foreground">Private access. A small thank-you for existing VIP giving.</p>
            </div>
            <Button variant="outline" onClick={() => setPreview(true)} data-testid="button-preview-pasture-run"><Gamepad2 className="mr-2 h-4 w-4" />Owner preview</Button>
          </header>
          <main className="space-y-6 p-4 md:p-6">
            <div className="max-w-6xl space-y-6">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                  <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-primary" />
                  <div className="space-y-2">
                    <Badge variant="secondary">Invitation-only test</Badge>
                    <h2 className="text-xl font-semibold">Pasture Run, kept small on purpose</h2>
                    <p className="max-w-3xl text-sm text-muted-foreground">You control which rescues participate and which donors are invited. Donors need an active VIP membership, an invitation, and an enabled rescue to play. There is no public arcade or public game menu.</p>
                    <p className="text-xs text-muted-foreground">Owner preview works even when a rescue is disabled and never records play starts.</p>
                  </div>
                </CardContent>
              </Card>

              {tenants.isLoading ? (
                <div className="space-y-4" aria-label="Loading pilot rescues"><Skeleton className="h-12 w-72 max-w-full" /><Skeleton className="h-56 w-full" /></div>
              ) : tenants.isError ? (
                <Card><CardContent className="space-y-3 p-6" role="alert"><h2 className="font-semibold">Could not load the private pilot</h2><p className="text-sm text-muted-foreground">{tenants.error.message}</p><Button variant="outline" onClick={() => void tenants.refetch()}>Try again</Button></CardContent></Card>
              ) : !tenants.data?.tenants.length ? (
                <Card><CardContent className="space-y-3 p-8"><ShieldCheck className="h-8 w-8 text-muted-foreground" /><h2 className="font-semibold">No rescues available yet</h2><p className="text-sm text-muted-foreground">Once a rescue is available, select it here to manage its private pilot. You can still try the owner preview.</p><Button variant="outline" onClick={() => void tenants.refetch()}>Refresh rescues</Button></CardContent></Card>
              ) : (
                <>
                  <div className="max-w-md space-y-2">
                    <Label htmlFor="pilot-tenant">Rescue</Label>
                    <Select value={selectedId} disabled={busy} onValueChange={(value) => { setTenantId(value); setEmail(""); setRevoking(null); update.reset(); }}>
                      <SelectTrigger id="pilot-tenant" data-testid="select-pilot-tenant"><SelectValue placeholder="Choose a rescue" /></SelectTrigger>
                      <SelectContent>{tenants.data.tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {selectedTenant && (
                    <Card>
                      <CardHeader className="pb-3"><CardTitle className="text-lg">Pilot activity</CardTitle><CardDescription>{selectedTenant.name} · Private play, not a fundraising attribution report.</CardDescription></CardHeader>
                      <CardContent>
                        <dl className="grid grid-cols-2 gap-x-5 gap-y-5 md:grid-cols-4">
                          {([
                            ["Invited donors", selectedTenant.invitedCount],
                            ["Play starts", selectedTenant.starts],
                            ["Unique players", selectedTenant.players],
                            ["Returning players", selectedTenant.returningPlayers],
                          ] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd></div>)}
                        </dl>
                        <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">Play starts count actual runs, not opening the game. Returning players are donors who play again on a later UTC day. These figures describe play activity, not revenue attribution or proof that the game increased giving.</p>
                        <Button className="mt-3" variant="ghost" size="sm" disabled={tenants.isFetching} onClick={() => void tenants.refetch()}>{tenants.isFetching ? "Refreshing…" : "Refresh activity"}</Button>
                      </CardContent>
                    </Card>
                  )}
                  {details.isLoading ? <Skeleton className="h-64 w-full" aria-label="Loading invitations" /> : details.isError ? (
                    <Card><CardContent className="space-y-3 p-6" role="alert"><h2 className="font-semibold">Could not load rescue access</h2><p className="text-sm text-muted-foreground">{details.error.message}</p><Button variant="outline" onClick={() => void details.refetch()}>Try again</Button></CardContent></Card>
                  ) : details.data && (
                    <div className="space-y-6">
                      <Card>
                        <CardContent className="flex items-center justify-between gap-5 p-5 sm:p-6">
                          <div className="space-y-1">
                            <h2 className="font-semibold">{details.data.enabled ? "Pilot enabled" : "Pilot paused"}</h2>
                            <p className="max-w-2xl text-sm text-muted-foreground">Turning this off blocks donor play without removing invitations. Open games stop at their next access check, within about a minute.</p>
                            {busy && update.variables?.action === "toggle" && <p className="text-xs text-muted-foreground" role="status">Saving access setting…</p>}
                          </div>
                          <Switch aria-label={`Enable Pasture Run for ${selectedTenant?.name || "this rescue"}`} checked={details.data.enabled} disabled={busy || details.isFetching} onCheckedChange={(enabled) => update.mutate({ tenantId: selectedId, action: "toggle", enabled }, feedback)} data-testid="switch-pilot-enabled" />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-lg">Invite a VIP supporter</CardTitle><CardDescription>Use the email on their donor account. Invitations grant private access; active membership is still required to play.</CardDescription></CardHeader>
                        <CardContent>
                          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
                            event.preventDefault();
                            update.mutate({ tenantId: selectedId, action: "invite", email: email.trim() }, {
                              ...feedback, onSuccess: (result) => { feedback.onSuccess(result); setEmail(""); },
                            });
                          }}>
                            <div className="flex-1 space-y-2"><Label htmlFor="pilot-invite-email">Donor email</Label><Input id="pilot-invite-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="supporter@example.org" disabled={busy} data-testid="input-pilot-invitation-email" /></div>
                            <Button type="submit" disabled={busy || !email.trim()}><Mail className="mr-2 h-4 w-4" />{busy && update.variables?.action === "invite" ? "Sending invitation…" : "Grant access & send invitation"}</Button>
                          </form>
                          {!details.data.enabled && <p className="mt-3 text-xs text-muted-foreground">The pilot is paused. Invited donors cannot play until you enable it.</p>}
                          {update.isError && <p className="mt-3 text-sm text-destructive" role="alert">{update.error.message}</p>}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-lg">Private invitations <span className="text-muted-foreground">({details.data.invitations.length})</span></CardTitle><CardDescription>Revoke an invitation to end that donor’s pilot access.</CardDescription></CardHeader>
                        <CardContent>
                          {!details.data.invitations.length ? (
                            <div className="rounded-md border border-dashed bg-muted/20 p-7 text-center"><Mail className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">A small pilot starts with an invitation</p><p className="mt-1 text-sm text-muted-foreground">No donors have been invited for this rescue yet. Add an existing VIP supporter above.</p></div>
                          ) : <ul className="divide-y">{details.data.invitations.map((invitation) => (
                            <li key={invitation.donorId} className="flex flex-col justify-between gap-3 py-4 first:pt-0 sm:flex-row sm:items-center">
                              <div className="min-w-0 space-y-1"><p className="break-words font-medium">{invitation.name || "VIP supporter"}</p><p className="break-all text-sm text-muted-foreground">{invitation.email}</p><Badge variant={invitation.eligible ? "default" : "secondary"}>{invitation.eligible ? "Eligible to play" : "Not currently eligible"}</Badge></div>
                              <Button variant="outline" size="sm" className="self-start sm:self-auto" disabled={busy} onClick={() => setRevoking(invitation)} aria-label={`Revoke invitation for ${invitation.name || invitation.email}`}><Trash2 className="mr-2 h-4 w-4" />Revoke</Button>
                            </li>
                          ))}</ul>}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
      <Dialog open={!!revoking} onOpenChange={(open) => { if (!open && !busy) setRevoking(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revoke private access?</DialogTitle><DialogDescription>{revoking?.email} will no longer be invited to this pilot. This does not change their VIP membership or giving.</DialogDescription></DialogHeader>
          {update.isError && <p className="text-sm text-destructive" role="alert">{update.error.message}</p>}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRevoking(null)}>Keep invitation</Button><Button variant="destructive" disabled={busy || !revoking} onClick={() => {
            if (!revoking) return;
            update.mutate({ tenantId: selectedId, action: "revoke", donorId: revoking.donorId }, {
              ...feedback, onSuccess: (result) => { feedback.onSuccess(result); setRevoking(null); },
            });
          }}>{busy ? "Revoking…" : "Revoke access"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {preview && <PrivateGamePlayer preview onClose={() => setPreview(false)} />}
    </SidebarProvider>
  );
}
