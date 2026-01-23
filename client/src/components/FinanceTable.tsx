import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Upload, DollarSign, TrendingUp, TrendingDown, FileText, Mail, MoreHorizontal, Loader2, Package, Gift, Repeat, CalendarDays } from "lucide-react";
import AnnualGivingSummary from "./AnnualGivingSummary";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type DonationType = 'cash' | 'check' | 'in_kind' | 'in_kind_goods' | 'in_kind_services';

interface Donation {
  id: string;
  donorName: string;
  donorEmail?: string;
  amount: number;
  donationType?: DonationType;
  description?: string;
  estimatedValue?: number;
  date: string;
  source: string;
  receiptNumber?: string;
  receiptSentAt?: string;
  isRecurring?: boolean;
  recurringFrequency?: 'monthly' | 'quarterly' | 'yearly';
  recurringStatus?: 'active' | 'paused' | 'cancelled';
}

interface Expenditure {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  grantName?: string;
}

interface Grant {
  id: string;
  name: string;
  status: string;
}

interface FinanceTableProps {
  donations: Donation[];
  expenditures: Expenditure[];
  grants?: Grant[];
  onAddDonation?: (donation: Omit<Donation, 'id'>) => void;
  onAddExpenditure?: (expenditure: Omit<Expenditure, 'id'> & { grantId?: string | null }) => void;
  onUploadCSV?: (file: File, type: 'donations' | 'expenditures') => void;
  isImporting?: boolean;
}

export default function FinanceTable({ donations, expenditures, grants, onAddDonation, onAddExpenditure, onUploadCSV, isImporting }: FinanceTableProps) {
  const { toast } = useToast();
  const [donationForm, setDonationForm] = useState({ 
    donorName: "", 
    donorEmail: "",
    amount: "", 
    date: "", 
    source: "Manual Entry",
    donationType: "cash" as DonationType,
    description: ""
  });
  const [expenditureForm, setExpenditureForm] = useState({ vendor: "", amount: "", date: "", category: "", grantId: "" });
  const [isAddingDonation, setIsAddingDonation] = useState(false);
  const [isAddingExpenditure, setIsAddingExpenditure] = useState(false);
  const [importType, setImportType] = useState<'donations' | 'expenditures'>('donations');
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  // Helper to check if a donation is in-kind
  const isInKindDonation = (type?: DonationType) => 
    type === 'in_kind' || type === 'in_kind_goods' || type === 'in_kind_services';
  
  // Donations are stored in cents, convert to dollars for display
  // Cash revenue = cash + check donations
  const cashDonations = donations.filter(d => !isInKindDonation(d.donationType));
  const inKindDonations = donations.filter(d => isInKindDonation(d.donationType));
  
  const totalCashDonations = cashDonations.reduce((sum, d) => sum + d.amount, 0) / 100;
  const totalInKindDonations = inKindDonations.reduce((sum, d) => sum + (d.estimatedValue || 0), 0) / 100;
  const totalDonations = totalCashDonations; // For backwards compatibility
  const totalExpenditures = expenditures.reduce((sum, e) => sum + e.amount, 0);
  
  // Calculate recurring donation stats (active recurring donors only for projected revenue)
  const activeRecurringDonations = donations.filter(d => d.isRecurring && d.recurringStatus === 'active');
  const monthlyRecurringAmount = activeRecurringDonations.reduce((sum, d) => {
    // Amounts are in cents
    if (d.recurringFrequency === 'monthly') return sum + d.amount;
    if (d.recurringFrequency === 'quarterly') return sum + (d.amount / 3);
    if (d.recurringFrequency === 'yearly') return sum + (d.amount / 12);
    return sum + d.amount; // Default to monthly if unknown
  }, 0) / 100; // Convert to dollars for display
  // Count unique donors by email or name if email missing
  const uniqueRecurringDonors = new Set(activeRecurringDonations.map(d => d.donorEmail || d.donorName)).size;

  // Mutation for sending receipt via email
  const sendReceiptMutation = useMutation({
    mutationFn: async (donationId: string) => {
      setSendingReceiptId(donationId);
      const response = await apiRequest('POST', `/api/donations/${donationId}/send-receipt`, {});
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance'] });
      toast({
        title: "Receipt Sent",
        description: `Receipt #${result.receiptNumber} has been emailed to the donor.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send receipt",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setSendingReceiptId(null);
    }
  });

  // Function to download receipt PDF
  const handleDownloadReceipt = async (donationId: string, donorName: string) => {
    setDownloadingReceiptId(donationId);
    try {
      const response = await fetch(`/api/donations/${donationId}/generate-receipt`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate receipt');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const receiptNum = response.headers.get('Content-Disposition')?.match(/Receipt_([^.]+)/)?.[1] || donationId.slice(0, 8);
      a.download = `Receipt_${receiptNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Receipt Downloaded",
        description: `Tax receipt for ${donorName} has been downloaded.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to download receipt",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleAddDonation = () => {
    if (donationForm.donorName && donationForm.date) {
      const isCashType = donationForm.donationType === 'cash' || donationForm.donationType === 'check';
      const isInKindType = donationForm.donationType === 'in_kind_goods' || donationForm.donationType === 'in_kind_services';
      
      if (isCashType && !donationForm.amount) {
        toast({
          title: "Missing amount",
          description: "Cash and check donations require an amount.",
          variant: "destructive",
        });
        return;
      }
      if (isInKindType && !donationForm.description) {
        toast({
          title: "Missing description",
          description: "In-kind donations require a description of items or services.",
          variant: "destructive",
        });
        return;
      }
      
      onAddDonation?.({
        donorName: donationForm.donorName,
        donorEmail: donationForm.donorEmail,
        amount: (donationForm.donationType === 'cash' || donationForm.donationType === 'check') ? Math.round(parseFloat(donationForm.amount) * 100) : 0, // Convert dollars to cents
        date: donationForm.date,
        source: donationForm.source,
        donationType: donationForm.donationType,
        description: donationForm.description
      });
      setDonationForm({ donorName: "", donorEmail: "", amount: "", date: "", source: "Manual Entry", donationType: "cash", description: "" });
      setIsAddingDonation(false);
    }
  };

  const handleAddExpenditure = () => {
    if (expenditureForm.vendor && expenditureForm.amount && expenditureForm.date && expenditureForm.category) {
      onAddExpenditure?.({
        vendor: expenditureForm.vendor,
        amount: parseFloat(expenditureForm.amount),
        date: expenditureForm.date,
        category: expenditureForm.category,
        grantId: expenditureForm.grantId || null,
      });
      setExpenditureForm({ vendor: "", amount: "", date: "", category: "", grantId: "" });
      setIsAddingExpenditure(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Donations</p>
                <p className="text-2xl font-semibold text-green-600">${totalDonations.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Expenditures</p>
                <p className="text-2xl font-semibold text-red-600">${totalExpenditures.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Balance</p>
                <p className={`text-2xl font-semibold ${totalDonations - totalExpenditures >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${(totalDonations - totalExpenditures).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-recurring-summary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Recurring</p>
                <p className="text-2xl font-semibold text-blue-600">${monthlyRecurringAmount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{uniqueRecurringDonors} active donor{uniqueRecurringDonors !== 1 ? 's' : ''}</p>
              </div>
              <Repeat className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="donations" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="donations">Donations</TabsTrigger>
            <TabsTrigger value="expenditures">Expenditures</TabsTrigger>
            <TabsTrigger value="annual-summary" data-testid="tab-annual-summary">
              <CalendarDays className="h-4 w-4 mr-1" />
              Annual Summary
            </TabsTrigger>
            <TabsTrigger value="import">Import CSV</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="donations" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddingDonation} onOpenChange={setIsAddingDonation}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-donation">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Donation
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Donation</DialogTitle>
                  <DialogDescription>Record a new cash or in-kind donation</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Donation Type</Label>
                    <Select 
                      value={donationForm.donationType} 
                      onValueChange={(value: 'cash' | 'in_kind') => setDonationForm({ ...donationForm, donationType: value })}
                    >
                      <SelectTrigger data-testid="select-donation-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Cash Donation
                          </div>
                        </SelectItem>
                        <SelectItem value="check">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Check
                          </div>
                        </SelectItem>
                        <SelectItem value="in_kind_goods">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            In-Kind Goods
                          </div>
                        </SelectItem>
                        <SelectItem value="in_kind_services">
                          <div className="flex items-center gap-2">
                            <Gift className="h-4 w-4" />
                            In-Kind Services
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Donor Name</Label>
                    <Input
                      value={donationForm.donorName}
                      onChange={(e) => setDonationForm({ ...donationForm, donorName: e.target.value })}
                      data-testid="input-donor-name"
                    />
                  </div>
                  <div>
                    <Label>Donor Email</Label>
                    <Input
                      type="email"
                      value={donationForm.donorEmail}
                      onChange={(e) => setDonationForm({ ...donationForm, donorEmail: e.target.value })}
                      placeholder="For sending tax receipts"
                      data-testid="input-donor-email"
                    />
                  </div>
                  {(donationForm.donationType === 'cash' || donationForm.donationType === 'check') ? (
                    <div>
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        value={donationForm.amount}
                        onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })}
                        placeholder="0.00"
                        data-testid="input-amount"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label>{donationForm.donationType === 'in_kind_services' ? 'Services Provided' : 'Items Donated'}</Label>
                      <Textarea
                        value={donationForm.description}
                        onChange={(e) => setDonationForm({ ...donationForm, description: e.target.value })}
                        placeholder={donationForm.donationType === 'in_kind_services' 
                          ? "Describe the services provided (e.g., 4 hours veterinary care, professional grooming)"
                          : "Describe the items donated (e.g., 50 lbs dog food, 10 pet blankets)"}
                        data-testid="input-description"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        IRS requires donors to determine fair market value for in-kind donations
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={donationForm.date}
                      onChange={(e) => setDonationForm({ ...donationForm, date: e.target.value })}
                      data-testid="input-date"
                    />
                  </div>
                  <Button onClick={handleAddDonation} className="w-full" data-testid="button-submit-donation">
                    Save Donation
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto" data-testid="scroll-container-donations">
                <Table data-testid="table-donations">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Donor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount/Items</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {donations.map((donation) => (
                      <TableRow key={donation.id} data-testid={`row-donation-${donation.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{donation.donorName}</div>
                            {donation.donorEmail && (
                              <div className="text-xs text-muted-foreground">{donation.donorEmail}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={isInKindDonation(donation.donationType) ? 'secondary' : 'default'} className="text-xs">
                              {donation.donationType === 'in_kind_goods' ? (
                                <><Package className="h-3 w-3 mr-1" />In-Kind Goods</>
                              ) : donation.donationType === 'in_kind_services' ? (
                                <><Gift className="h-3 w-3 mr-1" />In-Kind Services</>
                              ) : donation.donationType === 'in_kind' ? (
                                <><Gift className="h-3 w-3 mr-1" />In-Kind</>
                              ) : donation.donationType === 'check' ? (
                                <><FileText className="h-3 w-3 mr-1" />Check</>
                              ) : (
                                <><DollarSign className="h-3 w-3 mr-1" />Cash</>
                              )}
                            </Badge>
                            {donation.isRecurring && (
                              <Badge 
                                variant={donation.recurringStatus === 'active' ? 'default' : 'secondary'} 
                                className={`text-xs ${donation.recurringStatus === 'active' ? 'bg-blue-500' : donation.recurringStatus === 'cancelled' ? 'bg-gray-400' : 'bg-yellow-500'}`}
                                data-testid={`badge-recurring-${donation.id}`}
                              >
                                <Repeat className="h-3 w-3 mr-1" />
                                {donation.recurringFrequency === 'monthly' ? 'Monthly' :
                                 donation.recurringFrequency === 'quarterly' ? 'Quarterly' :
                                 donation.recurringFrequency === 'yearly' ? 'Yearly' : 'Recurring'}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isInKindDonation(donation.donationType) ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{donation.description || 'Items donated'}</span>
                              {donation.estimatedValue ? (
                                <span className="text-xs text-muted-foreground">Est. value: ${(donation.estimatedValue / 100).toLocaleString()}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="font-medium text-green-600">${(donation.amount / 100).toLocaleString()}</span>
                          )}
                        </TableCell>
                        <TableCell>{donation.date}</TableCell>
                        <TableCell>{donation.source}</TableCell>
                        <TableCell>
                          {donation.receiptSentAt ? (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                              Sent {new Date(donation.receiptSentAt).toLocaleDateString()}
                            </Badge>
                          ) : donation.receiptNumber ? (
                            <Badge variant="outline" className="text-xs">
                              #{donation.receiptNumber}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not sent</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-donation-actions-${donation.id}`}>
                                {(sendingReceiptId === donation.id || downloadingReceiptId === donation.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleDownloadReceipt(donation.id, donation.donorName)}
                                disabled={downloadingReceiptId === donation.id}
                                data-testid={`button-download-receipt-${donation.id}`}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Download Receipt
                              </DropdownMenuItem>
                              {donation.donorEmail && (
                                <DropdownMenuItem 
                                  onClick={() => sendReceiptMutation.mutate(donation.id)}
                                  disabled={sendingReceiptId === donation.id}
                                  data-testid={`button-send-receipt-${donation.id}`}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Email Receipt
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenditures" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddingExpenditure} onOpenChange={setIsAddingExpenditure}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-expenditure">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expenditure
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Expenditure</DialogTitle>
                  <DialogDescription>Record a new expense manually</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Vendor</Label>
                    <Input
                      value={expenditureForm.vendor}
                      onChange={(e) => setExpenditureForm({ ...expenditureForm, vendor: e.target.value })}
                      data-testid="input-vendor"
                    />
                  </div>
                  <div>
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      value={expenditureForm.amount}
                      onChange={(e) => setExpenditureForm({ ...expenditureForm, amount: e.target.value })}
                      data-testid="input-amount"
                    />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={expenditureForm.date}
                      onChange={(e) => setExpenditureForm({ ...expenditureForm, date: e.target.value })}
                      data-testid="input-date"
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={expenditureForm.category} onValueChange={(value) => setExpenditureForm({ ...expenditureForm, category: value })}>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vet">Vet</SelectItem>
                        <SelectItem value="Food">Food</SelectItem>
                        <SelectItem value="Supplies">Supplies</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Transport">Transport</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {grants && grants.length > 0 && (
                    <div>
                      <Label>Grant (Optional)</Label>
                      <Select value={expenditureForm.grantId || "none"} onValueChange={(value) => setExpenditureForm({ ...expenditureForm, grantId: value === "none" ? "" : value })}>
                        <SelectTrigger data-testid="select-grant">
                          <SelectValue placeholder="No grant (general fund)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No grant (general fund)</SelectItem>
                          {grants.filter(g => g.status === 'awarded').map(grant => (
                            <SelectItem key={grant.id} value={grant.id}>{grant.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Tag this expense to a specific grant for compliance reporting</p>
                    </div>
                  )}
                  <Button onClick={handleAddExpenditure} className="w-full" data-testid="button-submit-expenditure">
                    Save Expenditure
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto" data-testid="scroll-container-expenditures">
                <Table data-testid="table-expenditures">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      {grants && grants.length > 0 && <TableHead>Grant</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenditures.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell>{exp.vendor}</TableCell>
                        <TableCell className="font-medium text-red-600">${exp.amount.toLocaleString()}</TableCell>
                      <TableCell>{exp.date}</TableCell>
                      <TableCell>{exp.category}</TableCell>
                      {grants && grants.length > 0 && (
                        <TableCell>{exp.grantName || <span className="text-muted-foreground">General Fund</span>}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="annual-summary">
          <AnnualGivingSummary />
        </TabsContent>

        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle>CSV Import</CardTitle>
              <p className="text-sm text-muted-foreground">Import donations or expenditures from a CSV file</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <Label>Import Type</Label>
                  <Select value={importType} onValueChange={(value: 'donations' | 'expenditures') => setImportType(value)}>
                    <SelectTrigger data-testid="select-import-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="donations">Donations</SelectItem>
                      <SelectItem value="expenditures">Expenditures</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    {importType === 'donations' 
                      ? 'CSV should have columns: Donor Name, Email (optional), Amount, Date, Source (optional)'
                      : 'CSV should have columns: Vendor, Amount, Date, Category, Notes (optional)'}
                  </p>
                </div>
                
                <div className="flex items-center justify-center w-full">
                  <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg ${isImporting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover-elevate'}`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">{isImporting ? 'Importing...' : 'Click to upload'}</span> {!isImporting && 'or drag and drop'}
                      </p>
                      <p className="text-xs text-muted-foreground">CSV files only</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv"
                      disabled={isImporting}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && onUploadCSV) {
                          onUploadCSV(file, importType);
                          e.target.value = ''; // Reset file input
                        }
                      }}
                      data-testid="input-csv-upload"
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
