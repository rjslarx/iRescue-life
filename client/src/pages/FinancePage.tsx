import { useQuery, useMutation } from "@tanstack/react-query";
import FinanceTable from "@/components/FinanceTable";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, ArrowDownToLine, CreditCard, RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import type { Donation, Expenditure } from "@shared/schema";
import Papa from 'papaparse';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FinanceData {
  donations: Donation[];
  expenditures: Expenditure[];
  summary: {
    totalDonations: number;
    totalExpenditures: number;
    netIncome: number;
  };
}

interface StripeBalanceData {
  configured: boolean;
  message?: string;
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
  livemode?: boolean;
}

interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: string | null;
  created: string;
  destination: string | null;
  method: string;
  type: string;
  description: string | null;
}

interface StripeTransaction {
  id: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  refunded: boolean;
  created: string;
  description: string | null;
  receiptEmail: string | null;
  receiptUrl: string | null;
  billingDetails: { name: string | null; email: string | null } | null;
  paymentMethod: string | null;
  metadata: Record<string, string>;
}

function formatCurrency(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPayoutStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge variant="default">Paid</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'in_transit':
      return <Badge variant="secondary">In Transit</Badge>;
    case 'canceled':
      return <Badge variant="destructive">Canceled</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getTransactionStatusBadge(status: string, refunded: boolean) {
  if (refunded) {
    return <Badge variant="destructive">Refunded</Badge>;
  }
  switch (status) {
    case 'succeeded':
      return <Badge variant="default">Succeeded</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function FinancePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<FinanceData>({
    queryKey: ['/api/finance'],
  });

  const { data: tenantData } = useQuery<{ tenant: any }>({
    queryKey: ['/api/tenant'],
  });

  const { data: stripeBalance, isLoading: isLoadingBalance, isError: isErrorBalance, refetch: refetchBalance } = useQuery<StripeBalanceData>({
    queryKey: ['/api/stripe/balance'],
    enabled: user?.role === 'admin' || user?.role === 'board_member' || user?.role === 'owner',
    retry: false,
  });

  const { data: stripePayouts, isLoading: isLoadingPayouts, isError: isErrorPayouts } = useQuery<{ configured: boolean; payouts: StripePayout[]; error?: string; message?: string }>({
    queryKey: ['/api/stripe/payouts'],
    enabled: user?.role === 'admin' || user?.role === 'board_member' || user?.role === 'owner',
    retry: false,
  });

  const { data: stripeTransactions, isLoading: isLoadingTransactions, isError: isErrorTransactions } = useQuery<{ configured: boolean; transactions: StripeTransaction[]; error?: string; message?: string }>({
    queryKey: ['/api/stripe/transactions'],
    enabled: user?.role === 'admin' || user?.role === 'board_member' || user?.role === 'staff' || user?.role === 'owner',
    retry: false,
  });

  const { data: grantsData } = useQuery<{ grants: any[] }>({
    queryKey: ['/api/grants'],
    enabled: user?.role === 'admin' || user?.role === 'board_member' || user?.role === 'staff',
  });

  const addExpenditureMutation = useMutation({
    mutationFn: async (expenditure: any) => {
      const response = await apiRequest('POST', '/api/expenditures', expenditure);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance'] });
      toast({
        title: "Expenditure added",
        description: "The expenditure has been recorded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add expenditure",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const importCSVMutation = useMutation({
    mutationFn: async ({ type, data }: { type: 'donations' | 'expenditures', data: any[] }) => {
      const response = await apiRequest('POST', '/api/finance/import-csv', { type, data });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance'] });
      
      if (result.failed > 0) {
        const errorDetails = result.errors && result.errors.length > 0 
          ? result.errors.slice(0, 3).join(' | ') + (result.errors.length > 3 ? ` (and ${result.errors.length - 3} more)` : '')
          : '';
        
        toast({
          title: "CSV Import Partial Success",
          description: `Successfully imported ${result.imported} records. ${result.failed} failed. ${errorDetails}`,
          variant: result.imported > 0 ? "default" : "destructive",
        });
      } else {
        toast({
          title: "CSV Import Complete",
          description: `Successfully imported ${result.imported} records.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "CSV Import Failed",
        description: error.message || "Please check your CSV format and try again.",
        variant: "destructive",
      });
    },
  });

  // Transform backend data to FinanceTable format
  // Convert numeric strings from database to numbers for calculations
  const donations = (data?.donations || []).map(d => ({
    id: d.id,
    donorName: d.donorName,
    donorEmail: d.donorEmail,
    amount: typeof d.amount === 'string' ? parseFloat(d.amount) : (d.amount || 0),
    donationType: (d as any).donationType || 'cash',
    description: (d as any).description,
    date: new Date(d.date).toISOString().split('T')[0],
    source: d.source,
    receiptNumber: (d as any).receiptNumber,
    receiptSentAt: (d as any).receiptSentAt,
    // Recurring donation tracking
    isRecurring: (d as any).isRecurring || false,
    recurringFrequency: (d as any).recurringFrequency as 'monthly' | 'quarterly' | 'yearly' | undefined,
    recurringStatus: (d as any).recurringStatus as 'active' | 'paused' | 'cancelled' | undefined,
  }));

  const expenditures = (data?.expenditures || []).map(e => ({
    id: e.id,
    vendor: e.vendor,
    amount: typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount,
    date: new Date(e.date).toISOString().split('T')[0],
    category: e.category,
    grantName: (e as any).grantFunderName && (e as any).grantProgramName 
      ? `${(e as any).grantFunderName} - ${(e as any).grantProgramName}`
      : (e as any).grantFunderName || (e as any).grantProgramName || null,
  }));

  const handleAddExpenditure = (expenditure: any) => {
    const expenditureData = {
      vendor: expenditure.vendor,
      amount: expenditure.amount,
      category: expenditure.category,
      date: new Date(expenditure.date),
      notes: null,
      grantId: expenditure.grantId || null,
    };
    addExpenditureMutation.mutate(expenditureData);
  };

  // Mutation for adding manual donations (cash or in-kind)
  const addDonationMutation = useMutation({
    mutationFn: async (donation: any) => {
      const response = await apiRequest('POST', '/api/donations/manual', {
        donorName: donation.donorName,
        donorEmail: donation.donorEmail || 'no-email@placeholder.com',
        donationType: donation.donationType || 'cash',
        amount: donation.donationType === 'cash' ? donation.amount : undefined,
        description: donation.description,
        date: donation.date,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance'] });
      toast({
        title: "Donation recorded",
        description: "The donation has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add donation",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleAddDonation = (donation: any) => {
    addDonationMutation.mutate(donation);
  };

  const parseCSV = (text: string, type: 'donations' | 'expenditures'): { data: any[], skipped: number, errors: string[] } => {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
    });

    const rows: any[] = [];
    const errors: string[] = [];
    let skipped = 0;

    result.data.forEach((rawRow: any, index: number) => {
      const row: any = {};
      const rowNum = index + 2; // +2 because index is 0-based and we skip header

      try {
        // Map common header names to expected fields
        const headers = Object.keys(rawRow);
        
        headers.forEach((header) => {
          // Ensure value is a string before trimming
          const rawValue = rawRow[header];
          const value = (typeof rawValue === 'string' ? rawValue : String(rawValue || '')).trim();
          
          // Normalize header for matching (remove spaces, lowercase)
          const normalizedHeader = header.replace(/\s+/g, '').toLowerCase();
          
          if (normalizedHeader.includes('donor') || (normalizedHeader.includes('name') && type === 'donations')) {
            row.donorName = value;
          } else if (normalizedHeader.includes('email')) {
            row.donorEmail = value;
          } else if (normalizedHeader.includes('vendor')) {
            row.vendor = value;
          } else if (normalizedHeader.includes('amount')) {
            const cleaned = value.replace(/[$,]/g, '').trim();
            // Distinguish between missing (error) and explicit zero (valid)
            // Amounts are stored as numeric(10,2) supporting decimals like 75.50
            if (cleaned !== '') {
              const amount = parseFloat(cleaned);
              row.amount = isNaN(amount) ? NaN : amount;
            } else {
              row.amount = NaN;
            }
          } else if (normalizedHeader.includes('date')) {
            row.date = value;
          } else if (normalizedHeader.includes('category')) {
            row.category = value;
          } else if (normalizedHeader.includes('source')) {
            row.source = value;
          } else if (normalizedHeader.includes('note')) {
            row.notes = value;
          }
        });

        // Validate required fields based on type
        if (type === 'donations') {
          if (!row.date) {
            errors.push(`Row ${rowNum}: Missing required field 'date'`);
            skipped++;
            return;
          }
          if (row.amount === undefined || isNaN(row.amount)) {
            errors.push(`Row ${rowNum}: Invalid or missing 'amount'`);
            skipped++;
            return;
          }
          // donorName and donorEmail will be defaulted in backend if missing
          row.donorName = row.donorName || 'Anonymous';
          row.donorEmail = row.donorEmail || '';
        } else {
          // expenditures
          if (!row.vendor) {
            errors.push(`Row ${rowNum}: Missing required field 'vendor'`);
            skipped++;
            return;
          }
          if (!row.date) {
            errors.push(`Row ${rowNum}: Missing required field 'date'`);
            skipped++;
            return;
          }
          if (row.amount === undefined || isNaN(row.amount)) {
            errors.push(`Row ${rowNum}: Invalid or missing 'amount'`);
            skipped++;
            return;
          }
          if (!row.category) {
            errors.push(`Row ${rowNum}: Missing required field 'category'`);
            skipped++;
            return;
          }
        }

        rows.push(row);
      } catch (error: any) {
        errors.push(`Row ${rowNum}: ${error.message}`);
        skipped++;
      }
    });

    return { data: rows, skipped, errors };
  };

  const handleUploadCSV = (file: File, type: 'donations' | 'expenditures') => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        console.log('[CSV Import] File text:', text.substring(0, 200));
        const parseResult = parseCSV(text, type);
        console.log('[CSV Import] Parse result:', parseResult);
        
        // Atomic validation: reject entire import if ANY row has errors
        if (parseResult.errors.length > 0) {
          const errorMessage = parseResult.errors.slice(0, 3).join(' | ') + (parseResult.errors.length > 3 ? ` (and ${parseResult.errors.length - 3} more)` : '');
          
          toast({
            title: "CSV Import Failed",
            description: `${parseResult.errors.length} error(s) found. Please fix all errors before importing. ${errorMessage}`,
            variant: "destructive",
          });
          console.error('[CSV Import] Validation failed:', parseResult.errors);
          return;
        }
        
        if (parseResult.data.length === 0) {
          toast({
            title: "No Valid Data",
            description: "No valid data found in CSV file. Make sure it has headers and at least one data row.",
            variant: "destructive",
          });
          console.error('[CSV Import] No data rows found');
          return;
        }
        
        console.log('[CSV Import] Sending to API:', { type, rowCount: parseResult.data.length });
        importCSVMutation.mutate({ type, data: parseResult.data });
      } catch (error: any) {
        console.error('[CSV Import] Parse error:', error);
        toast({
          title: "Parse Error",
          description: error.message || "Failed to parse CSV file.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(file);
  };

  const totalAvailable = stripeBalance?.available?.reduce((sum, b) => sum + b.amount, 0) || 0;
  const totalPending = stripeBalance?.pending?.reduce((sum, b) => sum + b.amount, 0) || 0;
  const stripeConfigured = stripeBalance?.configured === true;
  const stripeBalanceError = isErrorBalance && !stripeBalance;
  const stripePayoutsError = isErrorPayouts && !stripePayouts;
  const stripeTransactionsError = isErrorTransactions && !stripeTransactions;

  return (
    <DashboardLayout
      title="Finance Management"
      description="Track donations and expenditures"
    >
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {(user?.role === 'admin' || user?.role === 'board_member' || user?.role === 'owner') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-balance-available">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingBalance ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : stripeBalanceError ? (
                  <div className="text-sm text-muted-foreground">
                    Unable to load balance
                  </div>
                ) : stripeConfigured ? (
                  <div className="text-2xl font-bold" data-testid="text-available-balance">
                    {formatCurrency(totalAvailable)}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Stripe not configured
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Ready to pay out</p>
              </CardContent>
            </Card>

            <Card data-testid="card-balance-pending">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Pending Balance</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingBalance ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : stripeBalanceError ? (
                  <div className="text-sm text-muted-foreground">
                    Unable to load balance
                  </div>
                ) : stripeConfigured ? (
                  <div className="text-2xl font-bold" data-testid="text-pending-balance">
                    {formatCurrency(totalPending)}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Stripe not configured
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Processing payments</p>
              </CardContent>
            </Card>

            <Card data-testid="card-recent-payouts">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Recent Payouts</CardTitle>
                <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingPayouts ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : stripePayoutsError ? (
                  <p className="text-sm text-muted-foreground">Unable to load payouts</p>
                ) : stripePayouts?.configured && stripePayouts.payouts.length > 0 ? (
                  <div className="space-y-2">
                    {stripePayouts.payouts.slice(0, 3).map(payout => (
                      <div key={payout.id} className="flex justify-between items-center text-sm" data-testid={`payout-${payout.id}`}>
                        <span className="text-muted-foreground">
                          {formatDate(payout.created)}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(payout.amount, payout.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : stripePayouts?.configured ? (
                  <p className="text-sm text-muted-foreground">No payouts yet</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Stripe not configured</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!stripeConfigured && !stripeBalanceError && !isLoadingBalance && (user?.role === 'admin' || user?.role === 'owner') && (
          <Alert data-testid="alert-stripe-not-configured">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Stripe is not configured for your organization. Go to Settings → Integrations to connect your Stripe account and start accepting donations online.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="records" className="w-full">
          <TabsList data-testid="tabs-finance">
            <TabsTrigger value="records" data-testid="tab-records">Records</TabsTrigger>
            <TabsTrigger value="stripe" data-testid="tab-stripe">Stripe Transactions</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">Bank Payouts</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-finance">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <FinanceTable 
                donations={donations}
                expenditures={expenditures}
                grants={grantsData?.grants ?? []}
                onAddDonation={handleAddDonation}
                onAddExpenditure={handleAddExpenditure}
                onUploadCSV={handleUploadCSV}
                isImporting={importCSVMutation.isPending}
              />
            )}
          </TabsContent>

          <TabsContent value="stripe" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Stripe Transactions</CardTitle>
                  <CardDescription>Recent payments processed through Stripe</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/stripe/transactions'] })}
                  data-testid="button-refresh-transactions"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingTransactions ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : stripeTransactionsError ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Unable to load transactions
                  </div>
                ) : !stripeTransactions?.configured ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Stripe is not configured for this organization
                  </div>
                ) : stripeTransactions?.error ? (
                  <div className="text-center py-8">
                    <p className="text-destructive font-medium">Error loading transactions</p>
                    <p className="text-sm text-muted-foreground mt-1">{stripeTransactions.error}</p>
                  </div>
                ) : stripeTransactions.transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No transactions yet
                  </div>
                ) : (
                  <Table data-testid="table-stripe-transactions">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Donor</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stripeTransactions.transactions.map(tx => (
                        <TableRow key={tx.id} data-testid={`transaction-${tx.id}`}>
                          <TableCell>{formatDate(tx.created)}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{tx.billingDetails?.name || 'Anonymous'}</div>
                              {tx.billingDetails?.email && (
                                <div className="text-xs text-muted-foreground">{tx.billingDetails.email}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(tx.amount, tx.currency)}
                            {tx.refunded && tx.amountRefunded > 0 && (
                              <span className="text-xs text-red-500 ml-1">
                                (-{formatCurrency(tx.amountRefunded, tx.currency)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getTransactionStatusBadge(tx.status, tx.refunded)}
                          </TableCell>
                          <TableCell>
                            {tx.receiptUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-receipt-${tx.id}`}>
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Bank Payouts</CardTitle>
                  <CardDescription>Transfers to your connected bank account</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/stripe/payouts'] });
                    refetchBalance();
                  }}
                  data-testid="button-refresh-payouts"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingPayouts ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : stripePayoutsError ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Unable to load payouts
                  </div>
                ) : !stripePayouts?.configured ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Stripe is not configured for this organization
                  </div>
                ) : stripePayouts?.error ? (
                  <div className="text-center py-8">
                    <p className="text-destructive font-medium">Error loading payouts</p>
                    <p className="text-sm text-muted-foreground mt-1">{stripePayouts.error}</p>
                  </div>
                ) : stripePayouts.payouts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No payouts yet - Stripe will automatically transfer funds to your bank account
                  </div>
                ) : (
                  <Table data-testid="table-payouts">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Arrival Date</TableHead>
                        <TableHead>Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stripePayouts.payouts.map(payout => (
                        <TableRow key={payout.id} data-testid={`payout-row-${payout.id}`}>
                          <TableCell>{formatDate(payout.created)}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(payout.amount, payout.currency)}
                          </TableCell>
                          <TableCell>
                            {getPayoutStatusBadge(payout.status)}
                          </TableCell>
                          <TableCell>
                            {payout.arrivalDate ? formatDate(payout.arrivalDate) : '-'}
                          </TableCell>
                          <TableCell className="capitalize">
                            {payout.method}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
