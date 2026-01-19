import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, CreditCard, AlertCircle, FileText } from "lucide-react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { tenantFetch } from "@/lib/tenantApi";

const isDevelopment = import.meta.env.DEV;
const stripePublicKey = isDevelopment 
  ? (import.meta.env.TESTING_VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

interface PaymentData {
  submission: {
    id: string;
    signerName: string;
    signerEmail: string;
    feeAmount: number | null;
    feeLabel: string | null;
    feeRequired: boolean | null;
    feeWaived: boolean | null;
    donationReceived: number | null;
    enableDonation: boolean | null;
    donationSuggested: number | null;
    paymentStatus: string | null;
  };
  form: {
    id: string;
    name: string;
  } | null;
}

function PaymentFormContent({ 
  token,
  paymentData,
  onSuccess,
}: { 
  token: string;
  paymentData: PaymentData;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);

  const feeAmount = paymentData.submission.feeAmount || 0;
  const donationAmount = paymentData.submission.donationReceived || 0;
  const totalAmount = feeAmount + donationAmount;
  const feeLabel = paymentData.submission.feeLabel || 'Fee';

  const createPaymentIntent = async () => {
    setCreatingIntent(true);
    try {
      const response = await tenantFetch(`/api/custom-forms/sign/${token}/payment/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to initialize payment");
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      return data;
    } catch (error: any) {
      toast({
        title: "Payment setup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      throw error;
    } finally {
      setCreatingIntent(false);
    }
  };

  useEffect(() => {
    if (totalAmount > 0 && !clientSecret) {
      createPaymentIntent();
    }
  }, [totalAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      let secret = clientSecret;
      let intentId = paymentIntentId;

      if (!secret) {
        const intentData = await createPaymentIntent();
        secret = intentData.clientSecret;
        intentId = intentData.paymentIntentId;
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(secret!, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent?.status !== 'succeeded') {
        throw new Error(`Payment not completed. Status: ${paymentIntent?.status}`);
      }

      const response = await tenantFetch(`/api/custom-forms/sign/${token}/payment/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: intentId }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        throw new Error(data.error || "Failed to complete payment");
      }
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payment Summary
          </CardTitle>
          <CardDescription>
            Complete your payment for {paymentData.form?.name || 'form submission'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feeAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span>{feeLabel}:</span>
              <span className="font-medium">${(feeAmount / 100).toFixed(2)}</span>
            </div>
          )}
          
          {donationAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span>Donation:</span>
              <span className="font-medium text-green-600">${(donationAmount / 100).toFixed(2)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between font-medium">
            <span>Total:</span>
            <span className="text-lg">${(totalAmount / 100).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Card Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 border rounded-md bg-background">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#1a1a1a',
                    '::placeholder': {
                      color: '#6b7280',
                    },
                  },
                },
              }}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={!stripe || processing || creatingIntent || !clientSecret}
            data-testid="button-submit-payment"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : creatingIntent ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pay ${(totalAmount / 100).toFixed(2)}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Your payment is processed securely through Stripe. Your card information is never stored on our servers.
      </p>
    </form>
  );
}

function SuccessState({ formName, signerName }: { formName?: string; signerName?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center" data-testid="success-card">
        <CardHeader>
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Thank you{signerName ? `, ${signerName}` : ''}! Your payment has been processed and your form submission is complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formName && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="text-muted-foreground">Form completed:</p>
              <p className="font-medium">{formName}</p>
            </div>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            You will receive a confirmation email shortly. You may now close this page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FormPaymentPage() {
  const { token } = useParams<{ token: string }>();
  const [isComplete, setIsComplete] = useState(false);

  const { data, isLoading, error } = useQuery<PaymentData>({
    queryKey: ['form-payment', token],
    queryFn: async () => {
      const response = await tenantFetch(`/api/custom-forms/sign/${token}/payment`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to load payment information');
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30" data-testid="loading-state">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    const errorMessage = error instanceof Error ? error.message : 'Payment session not found or has expired';
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="error-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Payment Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return <SuccessState formName={data.form?.name} signerName={data.submission.signerName} />;
  }

  if (!stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Payment Not Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Payment processing is not configured. Please contact the organization for assistance.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-payment-title">
            Complete Your Payment
          </h1>
          <p className="text-muted-foreground mt-1">
            {data.submission.signerName}
          </p>
        </div>

        <Elements stripe={stripePromise}>
          <PaymentFormContent
            token={token!}
            paymentData={data}
            onSuccess={() => setIsComplete(true)}
          />
        </Elements>
      </div>
    </div>
  );
}
