import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Sparkles, Search, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";

interface Member {
  subscriptionId: string;
  stripeSubscriptionId: string;
  tierName: string | null;
  tierIdSnapshot: string | null;
  amount: number;
  status: string;
  memberSince: string;
  canceledAt: string | null;
  currentPeriodEnd: string | null;
  displayOnWallOfHeroes: boolean;
  firstNameDisplay: string | null;
  donorId: string;
  donorName: string;
  donorEmail: string;
  donorPhone: string | null;
  totalDonated: number;
}

export default function VipMembersPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ['/api/vip-club/members'],
  });

  const members = data?.members || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      m.donorName?.toLowerCase().includes(q) ||
      m.donorEmail?.toLowerCase().includes(q) ||
      m.tierName?.toLowerCase().includes(q),
    );
  }, [members, search]);

  const stats = useMemo(() => {
    const active = members.filter(m => m.status === 'active');
    const monthlyMrr = active.reduce((sum, m) => sum + m.amount, 0);
    return {
      totalMembers: members.length,
      activeMembers: active.length,
      mrr: monthlyMrr,
    };
  }, [members]);

  const exportCsv = () => {
    const headers = ['Donor Name', 'Email', 'Phone', 'Tier', 'Monthly Amount', 'Status', 'Member Since', 'Canceled At', 'Wall of Heroes Display Name'];
    const rows = filtered.map(m => [
      m.donorName || '',
      m.donorEmail || '',
      m.donorPhone || '',
      m.tierName || '',
      `$${(m.amount / 100).toFixed(2)}`,
      m.status,
      m.memberSince ? new Date(m.memberSince).toLocaleDateString() : '',
      m.canceledAt ? new Date(m.canceledAt).toLocaleDateString() : '',
      m.displayOnWallOfHeroes ? (m.firstNameDisplay || m.donorName.split(' ')[0]) : 'Opted out',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vip-members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout
      title="VIP Donor Club Members"
      description="Sustaining monthly donors who joined via your VIP Club page"
    >
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Members</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-total-members">{stats.totalMembers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Active Members</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-active-members">{stats.activeMembers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Monthly Recurring</div>
            <div className="text-3xl font-bold mt-1" data-testid="stat-mrr">${(stats.mrr / 100).toFixed(0)}</div>
          </Card>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or tier..."
              className="pl-9"
              data-testid="input-vip-search"
            />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0} data-testid="button-export-vip">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">No VIP members yet</h3>
              <p className="text-sm text-muted-foreground">
                Once donors join via your VIP Club page, they'll appear here.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => window.open('/vip-club', '_blank')} data-testid="button-preview-vip-page">
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview VIP Club Page
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donor</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Member Since</TableHead>
                  <TableHead>Wall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => (
                  <TableRow key={m.subscriptionId} data-testid={`row-vip-member-${m.subscriptionId}`}>
                    <TableCell>
                      <div className="font-medium" data-testid={`text-vip-donor-name-${m.subscriptionId}`}>{m.donorName}</div>
                      <div className="text-xs text-muted-foreground">{m.donorEmail}</div>
                    </TableCell>
                    <TableCell>
                      {m.tierName ? (
                        <Badge variant="secondary" data-testid={`badge-vip-tier-${m.subscriptionId}`}>
                          <Sparkles className="h-3 w-3 mr-1" />
                          {m.tierName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">${(m.amount / 100).toFixed(0)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === 'active' ? 'default' : 'outline'}
                        data-testid={`badge-vip-status-${m.subscriptionId}`}
                      >
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.memberSince).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {m.displayOnWallOfHeroes ? (
                        <Badge variant="outline" className="text-xs">
                          {m.firstNameDisplay || m.donorName.split(' ')[0]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Opted out</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
