import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const isDevelopment = import.meta.env.DEV;
const stripePublicKey = isDevelopment
  ? (import.meta.env.TESTING_VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

interface SurrenderFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surrenderRequestId: string;
  dogName: string;
  ownerEmail?: string;
  onFeeComplete: (data: { surrenderFeePaid: string; surrenderFeeWaived: boolean; paymentIntentId?: string }) => void;
  onSkip: () => void;
}

function StripeCardForm({
  feeAmount,
  clientSecret,
  onSuccess,
  onError,
}: {
  feeAmount: string;
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleConfirmPayment = async () => {
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      onError("Card element not found. Please try again.");
      return;
    }

    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent?.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        throw new Error(`Payment not completed. Status: ${paymentIntent?.status}`);
      }
    } catch (err: any) {
      onError(err.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const feeNum = parseFloat(feeAmount);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">Card Details</Label>
        <div className="border rounded-md p-3 bg-background">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "14px",
                  color: "hsl(var(--foreground))",
                  "::placeholder": { color: "hsl(var(--muted-foreground))" },
                },
              },
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the card details to charge ${!isNaN(feeNum) ? feeNum.toFixed(2) : "0.00"}
        </p>
      </div>
      <Button
        onClick={handleConfirmPayment}
        disabled={processing || !stripe}
        className="w-full"
        data-testid="button-confirm-surrender-stripe-payment"
      >
        {processing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming Payment...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" /> Confirm Payment - ${!isNaN(feeNum) ? feeNum.toFixed(2) : "0.00"}</>
        )}
      </Button>
    </div>
  );
}

export function SurrenderFeeDialog({
  open,
  onOpenChange,
  surrenderRequestId,
  dogName,
  ownerEmail,
  onFeeComplete,
  onSkip,
}: SurrenderFeeDialogProps) {
  const { toast } = useToast();

  const { data: tenantData } = useQuery<{ tenant: any }>({
    queryKey: ['/api/tenant'],
  });
  const stripeEnabled = tenantData?.tenant?.stripeEnabled || !!tenantData?.tenant?.stripeConnectedAccountId;
  const defaultFee = tenantData?.tenant?.defaultSurrenderFee;

  const [feeAmount, setFeeAmount] = useState("0.00");
  const [waiveFee, setWaiveFee] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const fee = defaultFee ? String(parseFloat(defaultFee).toFixed(2)) : "0.00";
      setFeeAmount(fee);
      setWaiveFee(false);
      setPaymentComplete(false);
      setPaymentIntentId(null);
      setClientSecret(null);
      setPaymentError(null);
      setIsSaving(false);
    }
  }, [open, defaultFee]);

  const feeNum = parseFloat(feeAmount);
  const isValidFee = !isNaN(feeNum) && feeNum > 0;
  const hasFeeConfigured = isValidFee;

  const handleCreatePayment = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Please enter a valid fee amount");
      return;
    }
    setIsCreatingPayment(true);
    setPaymentError(null);
    try {
      const res = await apiRequest("POST", `/api/surrender-requests/${surrenderRequestId}/payment`, {
        amount: Math.round(amount * 100),
        description: `Owner surrender fee for ${dogName}`,
        ownerEmail: ownerEmail || undefined,
      });
      const data = await res.json();
      if (data.paymentIntentId) {
        setPaymentIntentId(data.paymentIntentId);
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setPaymentComplete(true);
          toast({ title: "Payment recorded", description: `Surrender fee of $${amount.toFixed(2)} has been recorded.` });
        }
      } else {
        throw new Error(data.error || "Failed to create payment");
      }
    } catch (err: any) {
      setPaymentError(err.message || "Payment failed. Please try again.");
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleStripePaymentSuccess = (intentId: string) => {
    setPaymentIntentId(intentId);
    setPaymentComplete(true);
    toast({ title: "Payment confirmed", description: `Surrender fee of $${parseFloat(feeAmount).toFixed(2)} has been charged successfully.` });
  };

  const handleCancelStripeSetup = () => {
    setClientSecret(null);
    setPaymentIntentId(null);
    setPaymentError(null);
  };

  const handleProceedWithFee = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/surrender-requests/${surrenderRequestId}/fee`, {
        surrenderFeePaid: waiveFee ? "0.00" : feeAmount,
        surrenderFeeWaived: waiveFee,
        paymentIntentId: paymentIntentId || undefined,
      });
      onFeeComplete({
        surrenderFeePaid: waiveFee ? "0.00" : feeAmount,
        surrenderFeeWaived: waiveFee,
        paymentIntentId: paymentIntentId || undefined,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to record fee", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const canProceed = waiveFee || paymentComplete || !hasFeeConfigured;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Surrender Fee
          </DialogTitle>
          <DialogDescription>
            Collect the owner surrender fee for {dogName} before proceeding to intake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="surrender-fee-amount">Fee Amount ($)</Label>
                <Input
                  id="surrender-fee-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={feeAmount}
                  onChange={e => setFeeAmount(e.target.value)}
                  disabled={waiveFee || paymentComplete || !!clientSecret}
                  data-testid="input-surrender-fee"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Switch
                checked={waiveFee}
                onCheckedChange={(checked) => {
                  setWaiveFee(checked);
                }}
                disabled={paymentComplete || !!clientSecret}
                data-testid="switch-waive-surrender-fee"
              />
              <div>
                <Label className="text-sm font-medium">Waive Fee</Label>
                <p className="text-xs text-muted-foreground">No payment required - fee will be waived</p>
              </div>
            </div>
          </div>

          {!waiveFee && hasFeeConfigured && (
            <div className="space-y-3">
              {paymentComplete ? (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Payment Confirmed</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      ${parseFloat(feeAmount).toFixed(2)} surrender fee has been charged for {dogName}
                    </p>
                  </div>
                </div>
              ) : clientSecret && stripePromise ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Enter card details below to process the ${isValidFee ? feeNum.toFixed(2) : "0.00"} surrender fee.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelStripeSetup}
                      className="text-xs text-blue-600 dark:text-blue-400 shrink-0"
                      data-testid="button-cancel-surrender-stripe-setup"
                    >
                      Change Amount
                    </Button>
                  </div>
                  <Elements stripe={stripePromise}>
                    <StripeCardForm
                      feeAmount={feeAmount}
                      clientSecret={clientSecret}
                      onSuccess={handleStripePaymentSuccess}
                      onError={(msg) => setPaymentError(msg)}
                    />
                  </Elements>
                  {paymentError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 dark:text-red-300">{paymentError}</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {stripeEnabled ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Click below to set up card payment for the surrender fee via Stripe.
                      </p>
                      <Button
                        onClick={handleCreatePayment}
                        disabled={!isValidFee || isCreatingPayment}
                        className="w-full"
                        data-testid="button-process-surrender-payment"
                      >
                        {isCreatingPayment ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting Up Payment...</>
                        ) : (
                          <><CreditCard className="h-4 w-4 mr-2" /> Set Up Payment - ${isValidFee ? feeNum.toFixed(2) : "0.00"}</>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Stripe is not configured. Payment will be recorded manually. You can collect payment separately (cash, check, etc.) and record it here.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleCreatePayment}
                        disabled={!isValidFee || isCreatingPayment}
                        className="w-full"
                        data-testid="button-record-manual-surrender-payment"
                      >
                        {isCreatingPayment ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</>
                        ) : (
                          <><DollarSign className="h-4 w-4 mr-2" /> Record Manual Payment - ${isValidFee ? feeNum.toFixed(2) : "0.00"}</>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {paymentError && !clientSecret && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-300">{paymentError}</p>
                </div>
              )}
            </div>
          )}

          {waiveFee && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Fee Waived</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">No payment is required for this surrender</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={async () => {
              setIsSaving(true);
              try {
                await apiRequest("PATCH", `/api/surrender-requests/${surrenderRequestId}/fee`, {
                  surrenderFeePaid: "0.00",
                  surrenderFeeWaived: true,
                });
              } catch {}
              setIsSaving(false);
              onSkip();
            }}
            disabled={isSaving}
            className="w-full sm:w-auto"
            data-testid="button-skip-surrender-fee"
          >
            Skip (No Fee)
          </Button>
          <Button
            onClick={handleProceedWithFee}
            disabled={!canProceed || isSaving}
            className="w-full sm:w-auto"
            data-testid="button-proceed-with-surrender-fee"
          >
            {isSaving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><ArrowRight className="h-4 w-4 mr-2" /> Proceed to Intake</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}