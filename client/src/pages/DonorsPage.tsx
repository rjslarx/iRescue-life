import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Mail, Sparkles } from "lucide-react";
import type { Donor } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";

interface DonorsData {
  donors: Donor[];
}

interface VipMember {
  donorId: string;
  tierName: string | null;
  amount: number;
  status: string;
  memberSince: string;
}

interface VipMembersData {
  members: VipMember[];
}

export default function DonorsPage() {
  const { data, isLoading } = useQuery<DonorsData>({
    queryKey: ['/api/donors'],
  });

  const { data: vipData } = useQuery<VipMembersData>({
    queryKey: ['/api/vip-club/members'],
  });

  const donors = data?.donors || [];

  const vipByDonor = useMemo(() => {
    // Show ALL active VIP subscriptions per donor (a donor can hold multiple).
    // If no active subscription, fall back to most recent inactive one for context.
    const map = new Map<string, VipMember[]>();
    const inactiveFallback = new Map<string, VipMember>();
    (vipData?.members || []).forEach(m => {
      if (m.status === 'active') {
        const list = map.get(m.donorId) || [];
        list.push(m);
        map.set(m.donorId, list);
      } else {
        const prev = inactiveFallback.get(m.donorId);
        if (!prev || new Date(m.memberSince) > new Date(prev.memberSince)) {
          inactiveFallback.set(m.donorId, m);
        }
      }
    });
    inactiveFallback.forEach((m, donorId) => {
      if (!map.has(donorId)) map.set(donorId, [m]);
    });
    // Sort each donor's badges by amount desc (most prominent tier first)
    map.forEach((list) => list.sort((a, b) => b.amount - a.amount));
    return map;
  }, [vipData]);

  const handleExportCSV = () => {
    const headers = ['Email', 'Name', 'Phone', 'VIP Tier', 'Total Donated', 'Last Donation Date'];
    const rows = donors.map(d => {
      const vipList = vipByDonor.get(d.id) || [];
      const vipText = vipList
        .map(v => `${v.tierName || 'VIP'} ($${(v.amount / 100).toFixed(0)}/mo, ${v.status})`)
        .join(' + ');
      return [
        d.email,
        d.name,
        d.phone || '',
        vipText,
        `$${(d.totalDonated / 100).toFixed(2)}`,
        d.lastDonationDate ? new Date(d.lastDonationDate).toLocaleDateString() : 'Never',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donors-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleCopyEmails = () => {
    const emails = donors.map(d => d.email).join(', ');
    navigator.clipboard.writeText(emails);
  };

  const actions = (
    <>
      <Button
        variant="outline"
        onClick={handleCopyEmails}
        disabled={donors.length === 0}
        data-testid="button-copy-emails"
      >
        <Mail className="h-4 w-4 mr-2" />
        Copy Emails
      </Button>
      <Button
        onClick={handleExportCSV}
        disabled={donors.length === 0}
        data-testid="button-export-csv"
      >
        <Download className="h-4 w-4 mr-2" />
        Export CSV
      </Button>
    </>
  );

  return (
    <DashboardLayout
      title="Donor Management"
      description="View donor contact information for newsletters"
      actions={actions}
    >
      <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-donors">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : donors.length === 0 ? (
              <Card className="p-8 text-center">
                <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Donors Yet</h3>
                <p className="text-muted-foreground">
                  Donors will appear here once they make donations through Stripe checkout.
                </p>
              </Card>
            ) : (
              <Card>
                <div className="p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">All Donors</h2>
                    <p className="text-sm text-muted-foreground">
                      {donors.length} total donor{donors.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>VIP Tier</TableHead>
                          <TableHead className="text-right">Total Donated</TableHead>
                          <TableHead className="text-right">Last Donation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {donors.map((donor) => {
                          const vipList = vipByDonor.get(donor.id) || [];
                          return (
                            <TableRow key={donor.id} data-testid={`row-donor-${donor.id}`}>
                              <TableCell className="font-medium" data-testid={`text-donor-name-${donor.id}`}>
                                {donor.name}
                              </TableCell>
                              <TableCell data-testid={`text-donor-email-${donor.id}`}>
                                {donor.email}
                              </TableCell>
                              <TableCell data-testid={`text-donor-phone-${donor.id}`}>
                                {donor.phone || '—'}
                              </TableCell>
                              <TableCell>
                                {vipList.length > 0 ? (
                                  <div className="flex flex-col gap-1.5">
                                    {vipList.map((vip, idx) => (
                                      <div key={`${donor.id}-vip-${idx}`} className="flex flex-col gap-0.5">
                                        <Badge
                                          variant={vip.status === 'active' ? 'default' : 'outline'}
                                          data-testid={idx === 0 ? `badge-vip-tier-${donor.id}` : `badge-vip-tier-${donor.id}-${idx}`}
                                          className="self-start"
                                        >
                                          <Sparkles className="h-3 w-3 mr-1" />
                                          {vip.tierName || 'VIP'}
                                          <span className="ml-1 opacity-80">${(vip.amount / 100).toFixed(0)}/mo</span>
                                          {vip.status !== 'active' && <span className="ml-1 opacity-70">({vip.status})</span>}
                                        </Badge>
                                        {vip.memberSince && (
                                          <span
                                            className="text-[10px] text-muted-foreground"
                                            data-testid={idx === 0 ? `text-vip-since-${donor.id}` : `text-vip-since-${donor.id}-${idx}`}
                                          >
                                            since {new Date(vip.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right" data-testid={`text-donor-total-${donor.id}`}>
                                ${(donor.totalDonated / 100).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right" data-testid={`text-donor-lastdate-${donor.id}`}>
                                {donor.lastDonationDate
                                  ? new Date(donor.lastDonationDate).toLocaleDateString()
                                  : 'Never'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </Card>
            )}
      </div>
    </DashboardLayout>
  );
}
