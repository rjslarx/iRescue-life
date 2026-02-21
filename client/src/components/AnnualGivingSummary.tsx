import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Download, Mail, FileText, Crown, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EligibleDonor {
  donorName: string;
  donorEmail: string;
  donorAddress: string | null;
  totalAmount: number;
  donationCount: number;
}

interface AnnualSummaryResponse {
  year: number;
  eligibleDonors: EligibleDonor[];
  totalEligible: number;
  totalAmount: number;
  isProTier: boolean;
  canBulkSend: boolean;
}

interface BulkSendResult {
  success: boolean;
  message: string;
  totalEligible: number;
  sent: number;
  failed: number;
  errors: string[];
}

export default function AnnualGivingSummary() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear - 1);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<AnnualSummaryResponse>({
    queryKey: ['/api/compliance/annual-summary/eligible-donors', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/compliance/annual-summary/eligible-donors?year=${selectedYear}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch eligible donors');
      return response.json();
    },
  });

  const sendSingleMutation = useMutation({
    mutationFn: async (email: string) => {
      setSendingEmail(email);
      const response = await apiRequest('POST', `/api/compliance/annual-summary/send/${encodeURIComponent(email)}?year=${selectedYear}`, {});
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: result.success ? "Summary Sent" : "Send Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      setSendingEmail(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setSendingEmail(null);
    },
  });

  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/compliance/annual-summary/send-all', { year: selectedYear });
      return response.json() as Promise<BulkSendResult>;
    },
    onSuccess: (result) => {
      toast({
        title: result.success ? "All Summaries Sent" : "Partial Success",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.errors.length > 0) {
        console.error('Bulk send errors:', result.errors);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Send Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleDownloadPdf = async (email: string, donorName: string) => {
    try {
      const response = await fetch(
        `/api/compliance/annual-summary/download/${encodeURIComponent(email)}?year=${selectedYear}`,
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to download');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Annual_Summary_${selectedYear}_${donorName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Downloaded",
        description: `Annual summary for ${donorName} downloaded`,
      });
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(
        `/api/compliance/annual-summary/export-csv?year=${selectedYear}`,
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Eligible_Donors_${selectedYear}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Exported",
        description: `Eligible donors list exported to CSV`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amountInCents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amountInCents / 100);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2" data-testid="text-annual-summary-title">
                <FileText className="h-5 w-5" />
                Annual Giving Summary
              </CardTitle>
              <CardDescription>
                IRS-compliant year-end tax summaries for donors who gave $250 or more
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-[120px]" data-testid="select-year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={handleExportCSV}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>

              {data?.canBulkSend ? (
                <Button
                  onClick={() => sendAllMutation.mutate()}
                  disabled={sendAllMutation.isPending || !data?.eligibleDonors.length}
                  data-testid="button-send-all"
                >
                  {sendAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send All ({data?.totalEligible || 0})
                </Button>
              ) : (
                <Button variant="outline" disabled className="cursor-not-allowed" data-testid="button-send-all-disabled">
                  <Crown className="h-4 w-4 mr-2" />
                  Send All (Pro)
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {!data?.isProTier && (
            <Alert className="mb-4">
              <Crown className="h-4 w-4" />
              <AlertTitle>Upgrade to Professional</AlertTitle>
              <AlertDescription>
                Free tier can view eligible donors, download PDFs, and export CSV. 
                Upgrade to Professional to send all annual summaries with one click, 
                saving hours of manual work every January.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Eligible Donors</div>
                <div className="text-2xl font-bold" data-testid="text-eligible-count">
                  {data?.totalEligible || 0}
                </div>
                <div className="text-xs text-muted-foreground">gave $250+ in {selectedYear}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Total Contributions</div>
                <div className="text-2xl font-bold" data-testid="text-total-amount">
                  {formatCurrency(data?.totalAmount || 0)}
                </div>
                <div className="text-xs text-muted-foreground">from eligible donors</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">IRS Deadline</div>
                <div className="text-2xl font-bold">Jan 31</div>
                <div className="text-xs text-muted-foreground">send summaries by this date</div>
              </CardContent>
            </Card>
          </div>

          {data?.eligibleDonors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-donors">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No donors gave $250 or more in {selectedYear}.</p>
              <p className="text-sm mt-2">Donations must be cash contributions to be included.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Total Given</TableHead>
                    <TableHead className="text-right">Donations</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.eligibleDonors.map((donor) => (
                    <TableRow key={donor.donorEmail} data-testid={`row-donor-${donor.donorEmail}`}>
                      <TableCell className="font-medium">{donor.donorName}</TableCell>
                      <TableCell>{donor.donorEmail}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(donor.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{donor.donationCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadPdf(donor.donorEmail, donor.donorName)}
                            title="Download PDF"
                            data-testid={`button-download-${donor.donorEmail}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          
                          {data?.canBulkSend ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => sendSingleMutation.mutate(donor.donorEmail)}
                              disabled={sendingEmail === donor.donorEmail}
                              title="Send via email"
                              data-testid={`button-send-${donor.donorEmail}`}
                            >
                              {sendingEmail === donor.donorEmail ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled
                              title="Email requires Pro tier"
                              className="cursor-not-allowed opacity-50"
                              data-testid={`button-send-disabled-${donor.donorEmail}`}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
