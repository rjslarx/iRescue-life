import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText } from "lucide-react";

export interface DonationHistoryRowDonation {
  id: string;
  date: string | Date;
  amount: number | null;
  isRecurring: boolean;
  isPendingBankTransfer: boolean;
  expectedClearDate: string | null;
  receiptNumber: string | null;
}

export interface DonationHistoryRowProps {
  donation: DonationHistoryRowDonation;
  onDownloadReceipt: (donationId: string) => void;
  formatMoney: (cents: number | null | undefined) => string;
  formatDateShort: (d: string | Date) => string;
}

export function DonationHistoryRow({
  donation: d,
  onDownloadReceipt,
  formatMoney,
  formatDateShort,
}: DonationHistoryRowProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3"
      data-testid={`row-donation-${d.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium" data-testid={`text-donation-date-${d.id}`}>
            {formatDateShort(d.date)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold" data-testid={`text-donation-amount-${d.id}`}>
            {formatMoney(d.amount)}
          </span>
          {d.isRecurring && (
            <Badge variant="secondary" data-testid={`badge-recurring-${d.id}`}>Monthly</Badge>
          )}
          {d.isPendingBankTransfer && (
            <Badge
              variant="outline"
              className="border-amber-500/60 text-amber-700 dark:text-amber-500"
              data-testid={`badge-donation-pending-${d.id}`}
            >
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Pending — clears in 3-5 business days
            </Badge>
          )}
        </div>
        {d.isPendingBankTransfer ? (
          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-donation-pending-detail-${d.id}`}>
            Bank transfer in flight{d.expectedClearDate ? ` — expected to clear by ${formatDateShort(d.expectedClearDate)}` : ''}. Your tax receipt will be sent automatically once it settles.
          </p>
        ) : d.receiptNumber ? (
          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-receipt-number-${d.id}`}>
            Receipt #{d.receiptNumber}
          </p>
        ) : null}
      </div>
      {d.isPendingBankTransfer ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          data-testid={`button-receipt-pending-${d.id}`}
        >
          <FileText className="h-4 w-4 mr-2" />
          Receipt pending
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDownloadReceipt(d.id)}
          data-testid={`button-download-receipt-${d.id}`}
        >
          <FileText className="h-4 w-4 mr-2" />
          Receipt
        </Button>
      )}
    </div>
  );
}
