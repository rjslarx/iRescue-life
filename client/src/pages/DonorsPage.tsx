import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Download, Mail } from "lucide-react";
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

export default function DonorsPage() {
  const { data, isLoading } = useQuery<DonorsData>({
    queryKey: ['/api/donors'],
  });

  const donors = data?.donors || [];

  const handleExportCSV = () => {
    const headers = ['Email', 'Name', 'Phone', 'Total Donated', 'Last Donation Date'];
    const rows = donors.map(d => [
      d.email,
      d.name,
      d.phone || '',
      `$${(d.totalDonated / 100).toFixed(2)}`,
      d.lastDonationDate ? new Date(d.lastDonationDate).toLocaleDateString() : 'Never'
    ]);

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
                          <TableHead className="text-right">Total Donated</TableHead>
                          <TableHead className="text-right">Last Donation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {donors.map((donor) => (
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
                            <TableCell className="text-right" data-testid={`text-donor-total-${donor.id}`}>
                              ${(donor.totalDonated / 100).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right" data-testid={`text-donor-lastdate-${donor.id}`}>
                              {donor.lastDonationDate 
                                ? new Date(donor.lastDonationDate).toLocaleDateString()
                                : 'Never'}
                            </TableCell>
                          </TableRow>
                        ))}
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
