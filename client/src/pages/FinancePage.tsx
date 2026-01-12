import { useQuery, useMutation } from "@tanstack/react-query";
import FinanceTable from "@/components/FinanceTable";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Donation, Expenditure } from "@shared/schema";
import Papa from 'papaparse';
import DashboardLayout from "@/components/DashboardLayout";

interface FinanceData {
  donations: Donation[];
  expenditures: Expenditure[];
  summary: {
    totalDonations: number;
    totalExpenditures: number;
    netIncome: number;
  };
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
    grantName: (e as any).grantName,
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

  return (
    <DashboardLayout
      title="Finance Management"
      description="Track donations and expenditures"
    >
      <div className="flex-1 overflow-auto p-6">
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
      </div>
    </DashboardLayout>
  );
}
