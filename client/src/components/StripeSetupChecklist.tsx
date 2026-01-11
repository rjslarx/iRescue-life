import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  User,
  Landmark,
  CreditCard,
  Shield,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface StripeSetupChecklistProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
  isPending?: boolean;
  hasExistingStripeAccount?: boolean;
}

export function StripeSetupChecklist({
  open,
  onOpenChange,
  onProceed,
  isPending = false,
  hasExistingStripeAccount: initialHasExisting = false,
}: StripeSetupChecklistProps) {
  const [hasExistingAccount, setHasExistingAccount] = useState(initialHasExisting);
  const [checkedItems, setCheckedItems] = useState({
    irsLetter: false,
    representative: false,
    banking: false,
    descriptor: false,
  });

  const allChecked = Object.values(checkedItems).every(Boolean);

  const handleCheckChange = (key: keyof typeof checkedItems) => {
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleProceed = () => {
    onProceed();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            {hasExistingAccount
              ? "Quick Login to Stripe"
              : "Before You Connect to Stripe"}
          </DialogTitle>
          <DialogDescription>
            {hasExistingAccount
              ? "If you already have a Stripe account, just have your login ready and authorize iRescue.life."
              : "Please gather these documents before starting. Having everything ready will make setup quick and easy."}
          </DialogDescription>
        </DialogHeader>

        {/* Toggle for existing Stripe account holders */}
        <label
          className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 cursor-pointer hover-elevate"
          data-testid="checkbox-existing-stripe-account"
        >
          <Checkbox
            checked={hasExistingAccount}
            onCheckedChange={(checked) => setHasExistingAccount(checked === true)}
          />
          <div className="flex-1">
            <span className="font-medium">I already have a Stripe account</span>
            <p className="text-sm text-muted-foreground">
              Skip the checklist and go straight to connecting
            </p>
          </div>
        </label>

        {hasExistingAccount ? (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <strong>Already use Stripe?</strong> Great! You won't need to
                hunt for documents. Just have your Stripe email and password
                ready. When you click "Proceed," simply log in and authorize our
                app.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                We partner with <strong>Stripe</strong>, the same payment
                processor used by Amazon and Google. Federal law requires Stripe
                to verify your organization's identity to process payments.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <label
                className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid="checklist-irs-letter"
              >
                <Checkbox
                  checked={checkedItems.irsLetter}
                  onCheckedChange={() => handleCheckChange("irsLetter")}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Organization's Legal Info
                  </div>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                    <li>
                      <strong>Legal Name</strong> - Exactly as on your IRS
                      determination letter
                    </li>
                    <li>
                      <strong>EIN (Tax ID)</strong> - Your 9-digit federal tax
                      ID
                    </li>
                    <li>
                      <strong>Physical Address</strong> - Official operating
                      address
                    </li>
                  </ul>
                </div>
              </label>

              <label
                className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid="checklist-representative"
              >
                <Checkbox
                  checked={checkedItems.representative}
                  onCheckedChange={() => handleCheckChange("representative")}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Account Representative Info
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Stripe requires one person (usually Treasurer, President, or
                    Director) as the account controller:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                    <li>
                      <strong>Home Address</strong> - Personal address, not the
                      rescue's
                    </li>
                    <li>
                      <strong>Date of Birth</strong> - For identity verification
                    </li>
                    <li>
                      <strong>SSN (Last 4 Digits)</strong> - For soft identity
                      check
                    </li>
                  </ul>
                  <Alert className="mt-2 border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
                    <AlertTriangle className="h-3 w-3 text-yellow-600" />
                    <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
                      This is a soft identity check (KYC) required by banking
                      law. It is <strong>not</strong> a credit check and will
                      not affect anyone's credit score.
                    </AlertDescription>
                  </Alert>
                </div>
              </label>

              <label
                className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid="checklist-banking"
              >
                <Checkbox
                  checked={checkedItems.banking}
                  onCheckedChange={() => handleCheckChange("banking")}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    Banking Details
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Routing Number</strong> and{" "}
                    <strong>Account Number</strong> for where you want donations
                    deposited.
                  </p>
                </div>
              </label>

              <label
                className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                data-testid="checklist-descriptor"
              >
                <Checkbox
                  checked={checkedItems.descriptor}
                  onCheckedChange={() => handleCheckChange("descriptor")}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Statement Descriptor
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The text that appears on donors' credit card statements
                    (e.g., "HAPPY PAWS RESCUE") so they recognize the charge.
                  </p>
                </div>
              </label>
            </div>

            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
              <Shield className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <strong>Security Note:</strong> iRescue.life never sees or
                stores your Social Security Number or Bank Account details. You
                will be redirected to Stripe's own secure, government-grade
                vault to enter this data. We only receive a "Success" message
                once you are verified.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-stripe-checklist"
          >
            Cancel
          </Button>
          <Button
            onClick={handleProceed}
            disabled={(isPending || !allChecked) && !hasExistingAccount}
            className="gap-2"
            data-testid="button-proceed-to-stripe"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Proceed to Stripe
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
