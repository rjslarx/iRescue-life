import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Heart, AlertCircle, FileText, CreditCard, Download, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// Use test keys in development (with fallback to regular keys), production keys in production
const isDevelopment = import.meta.env.DEV;
const stripePublicKey = isDevelopment 
  ? (import.meta.env.TESTING_VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

type Step = "review" | "sign" | "payment" | "success";

interface FeeConfig {
  passFeesToAdopter: boolean;
  platformFeePercent: number;
  processingFeePercent: number;
  processingFeeFixed: number;
  rescueName: string;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    baseFee: string;
    donationBoost: string;
    totals: { subtotal: string; fees: string; total: string };
    expiresAt: string;
    contractTemplateId?: number;
  };
  animal: {
    id: string;
    name: string;
    species: string;
    breed: string;
    photoUrls: string[];
  };
  applicant: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  contract?: {
    html: string;
    name: string;
  };
  organization?: {
    name: string;
  };
  feeConfig?: FeeConfig;
}

function PaymentForm({ 
  sessionId, 
  totals: initialTotals, 
  onSuccess,
  feeConfig,
}: { 
  sessionId: string; 
  totals: { subtotal: string; fees: string; total: string }; 
  onSuccess: () => void;
  feeConfig?: FeeConfig;
}) {
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const [donationBoost, setDonationBoost] = useState("0");
  const [coverFees, setCoverFees] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  // Store server-confirmed totals (updated after payment intent creation)
  const [serverTotals, setServerTotals] = useState<{ subtotal: string; fees: string; total: string } | null>(null);

  const baseFeeNum = parseFloat(initialTotals.subtotal);
  const donationNum = parseFloat(donationBoost || "0");
  const subtotal = baseFeeNum + donationNum;

  // Fee calculation based on tenant's passFeesToAdopter setting (for preview only)
  const processingFeePercent = feeConfig?.processingFeePercent || 2.9;
  const processingFeeFixed = feeConfig?.processingFeeFixed || 0.30;
  const platformFeePercent = feeConfig?.platformFeePercent || 0;
  const passFeesToAdopter = feeConfig?.passFeesToAdopter || false;

  // Calculate estimated fees for preview (before payment intent is created)
  // Once payment intent is created, we use server totals which are authoritative
  let estimatedServiceFee = 0;
  let estimatedFinalTotal = subtotal;

  if (passFeesToAdopter) {
    const totalPercentFee = (processingFeePercent + platformFeePercent) / 100;
    estimatedFinalTotal = (subtotal + processingFeeFixed) / (1 - totalPercentFee);
    estimatedServiceFee = estimatedFinalTotal - subtotal;
  } else if (coverFees) {
    estimatedFinalTotal = (subtotal + processingFeeFixed) / (1 - processingFeePercent / 100);
    estimatedServiceFee = estimatedFinalTotal - subtotal;
  }

  // Use server totals if available, otherwise use estimated totals
  const displayServiceFee = serverTotals ? parseFloat(serverTotals.fees) : estimatedServiceFee;
  const displayTotal = serverTotals ? parseFloat(serverTotals.total) : estimatedFinalTotal;
  const displaySubtotal = serverTotals ? parseFloat(serverTotals.subtotal) : subtotal;

  // Track if we need server confirmation before allowing payment
  // Required when: passFeesToAdopter is true OR coverFees is checked (any fee modification)
  const needsServerConfirmation = passFeesToAdopter || coverFees;
  const hasServerConfirmation = serverTotals !== null;
  
  // Payment can only proceed when: no fees needed OR we have server-confirmed totals
  const canSubmitPayment = !needsServerConfirmation || hasServerConfirmation;

  const createPaymentIntent = async () => {
    setCreatingIntent(true);
    try {
      const response = await apiRequest('POST', `/api/public/adoption-checkouts/${sessionId}/create-payment-intent`, {
        donationBoost: donationBoost,
        coverFees: coverFees,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Failed to initialize payment");
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      // Update to server-confirmed totals
      if (data.totals) {
        setServerTotals(data.totals);
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard: If fees need confirmation but haven't been confirmed, prevent submission
    if (needsServerConfirmation && !hasServerConfirmation) {
      toast({
        title: "Please confirm your total first",
        description: "Click 'Confirm Total' to calculate your final amount before proceeding with payment.",
        variant: "destructive",
      });
      return;
    }

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

      const response = await apiRequest('POST', `/api/public/adoption-checkouts/${sessionId}/payment`, {
        processor: "stripe",
        paymentIntentId: intentId,
        donationBoost: donationBoost,
        coverFees: coverFees,
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        throw new Error(data.error || "Failed to finalize adoption");
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
          <CardTitle>Amount Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span>Adoption Fee:</span>
            <span className="font-medium">${baseFeeNum.toFixed(2)}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="add-donation"
                checked={parseFloat(donationBoost || "0") > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Set a default donation amount when checking
                    setDonationBoost("10");
                  } else {
                    setDonationBoost("0");
                  }
                  // Reset server totals when donation changes
                  setServerTotals(null);
                  setClientSecret(null);
                  setPaymentIntentId(null);
                }}
                data-testid="checkbox-add-donation"
              />
              <label htmlFor="add-donation" className="text-sm font-medium cursor-pointer">
                Add a donation to support our mission
              </label>
            </div>

            {parseFloat(donationBoost || "0") > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {["5", "10", "20", "50"].map((amount) => (
                    <Button
                      key={amount}
                      type="button"
                      variant={donationBoost === amount ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setDonationBoost(amount);
                        // Reset server totals when donation changes
                        setServerTotals(null);
                        setClientSecret(null);
                        setPaymentIntentId(null);
                      }}
                      data-testid={`button-donation-${amount}`}
                    >
                      ${amount}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Other"
                    value={donationBoost}
                    onChange={(e) => {
                      setDonationBoost(e.target.value);
                      // Reset server totals when donation changes
                      setServerTotals(null);
                      setClientSecret(null);
                      setPaymentIntentId(null);
                    }}
                    className="w-24"
                    data-testid="input-donation-custom"
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Your donation:</span>
                  <span>${donationNum.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* When passFeesToAdopter is true, show service fee automatically (no checkbox) */}
          {passFeesToAdopter ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal:</span>
                <span>${displaySubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Service Fee{!serverTotals ? ' (est.)' : ''}:</span>
                <span>${displayServiceFee.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                A small service fee helps cover payment processing and platform costs so 100% of the adoption fee goes to {feeConfig?.rescueName || 'the rescue'}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cover-fees"
                  checked={coverFees}
                  onCheckedChange={(checked) => {
                    setCoverFees(checked as boolean);
                    // Clear server totals when user changes selection (will recalculate on payment intent creation)
                    setServerTotals(null);
                    setClientSecret(null);
                    setPaymentIntentId(null);
                  }}
                  data-testid="checkbox-cover-fees"
                />
                <label htmlFor="cover-fees" className="text-sm cursor-pointer">
                  Cover payment processing fees (${displayServiceFee.toFixed(2)})
                </label>
              </div>

              {coverFees && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Processing Fee:</span>
                  <span>${displayServiceFee.toFixed(2)}</span>
                </div>
              )}
            </>
          )}

          <Separator />

          <div className="flex justify-between text-lg font-bold">
            <span>Total{!serverTotals && (passFeesToAdopter || coverFees) ? ' (est.)' : ''}:</span>
            <span>${displayTotal.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
          <CardDescription>Enter your card details to complete adoption</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-3 border rounded-md bg-background">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: "#424770",
                    "::placeholder": {
                      color: "#aab7c4",
                    },
                  },
                  invalid: {
                    color: "#9e2146",
                  },
                },
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* If fees are involved but not yet confirmed, show a "Confirm Total" button first */}
      {needsServerConfirmation && !hasServerConfirmation ? (
        <Button
          type="button"
          className="w-full min-h-11"
          onClick={createPaymentIntent}
          disabled={creatingIntent}
          data-testid="button-confirm-total"
        >
          {creatingIntent ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating final total...
            </>
          ) : (
            <>
              Confirm Total ${displayTotal.toFixed(2)}
            </>
          )}
        </Button>
      ) : (
        <Button
          type="submit"
          className="w-full min-h-11"
          disabled={!stripe || processing || creatingIntent || !canSubmitPayment}
          data-testid="button-pay"
        >
          {creatingIntent ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up payment...
            </>
          ) : processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing Payment...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${displayTotal.toFixed(2)}
            </>
          )}
        </Button>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Your payment is secure and encrypted. By completing this payment, you agree to the adoption contract.
      </p>
    </form>
  );
}

function SuccessStep({ token, animalName }: { token: string; animalName: string }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownloadContract = async () => {
    setDownloading(true);
    try {
      const response = await apiRequest('GET', `/api/public/adoption-checkouts/${token}/contract`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get contract');
      }
      const data = await response.json();
      
      if (data.contractPdfUrl) {
        window.open(data.contractPdfUrl, '_blank');
      } else {
        toast({
          title: "Contract not ready",
          description: "Your contract is being generated. Please try again in a moment.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message || "Please try again or check your email for the contract",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="text-center space-y-6">
      <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-3xl font-bold text-green-900 dark:text-green-100">
              Adoption Complete!
            </h2>
            <p className="text-green-700 dark:text-green-300 max-w-md">
              Congratulations on adopting {animalName}! We're so excited for your new journey together.
            </p>
            <Button
              onClick={handleDownloadContract}
              disabled={downloading}
              className="mt-4"
              variant="outline"
              data-testid="button-download-contract"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Getting contract...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Signed Contract
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What's Next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-left">
          <p className="text-sm">
            <strong>Check your email for:</strong>
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground ml-4">
            <li>• Signed adoption contract (PDF)</li>
            <li>• Payment receipt</li>
            <li>• {animalName}'s medical records</li>
            <li>• Care instructions and tips</li>
          </ul>
          <Separator className="my-4" />
          <p className="text-sm text-muted-foreground">
            We'll follow up with you in a few days to see how {animalName} is settling in. 
            If you have any questions, don't hesitate to reach out!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PublicAdoptionCheckoutPageContent() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>("review");
  const [signature, setSignature] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [driversLicenseNumber, setDriversLicenseNumber] = useState("");
  const [driversLicenseImage, setDriversLicenseImage] = useState<string | null>(null);
  const [driversLicenseFileName, setDriversLicenseFileName] = useState<string | null>(null);

  const { data: sessionData, isLoading, error } = useQuery<SessionData>({
    queryKey: ['/api/public/adoption-checkouts', token],
    retry: false,
  });

  // Check if fee is waived (baseFee is 0 or metadata indicates waived)
  const isFeeWaived = sessionData?.session?.baseFee === "0" || 
    parseFloat(sessionData?.session?.baseFee || "0") === 0 ||
    (sessionData?.session?.metadata as any)?.waiveFee === true;

  const signMutation = useMutation({
    mutationFn: async (signatureData: string) => {
      const response = await apiRequest('POST', `/api/public/adoption-checkouts/${token}/sign`, {
        signerName: sessionData?.applicant.name || "",
        signerEmail: sessionData?.applicant.email || "",
        signatureImageData: signatureData,
        driversLicenseNumber: driversLicenseNumber || undefined,
        driversLicenseImageData: driversLicenseImage || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // If fee is waived, skip payment and go directly to success
      if (isFeeWaived || data?.skipPayment) {
        setCurrentStep("success");
        toast({
          title: "Adoption complete!",
          description: "Your adoption has been finalized",
        });
      } else {
        setCurrentStep("payment");
        toast({
          title: "Contract signed!",
          description: "Please proceed to payment",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to sign contract",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSignContract = () => {
    if (signature) {
      signMutation.mutate(signature);
    }
  };

  const handlePaymentSuccess = () => {
    setCurrentStep("success");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading checkout session...</p>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Session Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This checkout link is invalid or has expired. Please contact the rescue organization for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, animal, applicant, feeConfig, contract, organization } = sessionData;

  // Determine step progress based on whether fee is waived
  const stepProgress = isFeeWaived ? {
    review: 50,
    sign: 100,
    payment: 100, // Not used when waived
    success: 100,
  } : {
    review: 33,
    sign: 66,
    payment: 90,
    success: 100,
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Complete Your Adoption</h1>
          <p className="text-muted-foreground">
            Welcome, {applicant.name}! You're adopting {animal.name}
          </p>
        </div>

        {/* Progress */}
        {currentStep !== "success" && (
          <div className="mb-8">
            <Progress value={stepProgress[currentStep]} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span className={currentStep === "review" ? "font-medium text-foreground" : ""}>
                Review
              </span>
              <span className={currentStep === "sign" ? "font-medium text-foreground" : ""}>
                Sign
              </span>
              {!isFeeWaived && (
                <span className={currentStep === "payment" ? "font-medium text-foreground" : ""}>
                  Payment
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Review Information */}
        {currentStep === "review" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Review Information
                </CardTitle>
                <CardDescription>Please verify all details are correct</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Animal Info */}
                <div>
                  <h3 className="font-semibold mb-3">Animal Information</h3>
                  <div className="flex gap-4">
                    {animal.photoUrls?.[0] && (
                      <img
                        src={animal.photoUrls[0]}
                        alt={animal.name}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium text-lg">{animal.name}</p>
                      <p className="text-sm text-muted-foreground">{animal.breed}</p>
                      <p className="text-sm text-muted-foreground">{animal.species}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Adopter Info */}
                <div>
                  <h3 className="font-semibold mb-3">Your Information</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">{applicant.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{applicant.email}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Fee Info */}
                <div>
                  <h3 className="font-semibold mb-3">Adoption Fee</h3>
                  {isFeeWaived ? (
                    <div className="flex justify-between text-lg">
                      <span>Total:</span>
                      <span className="font-bold text-green-600 dark:text-green-400">Fee Waived</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-lg">
                      <span>Total:</span>
                      <span className="font-bold">${session.baseFee}</span>
                    </div>
                  )}
                </div>

                <Alert>
                  <AlertDescription>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-correct"
                        checked={agreedToTerms}
                        onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                        data-testid="checkbox-confirm-correct"
                      />
                      <label htmlFor="confirm-correct" className="text-sm cursor-pointer">
                        I confirm that all information above is correct
                      </label>
                    </div>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Button
              onClick={() => setCurrentStep("sign")}
              disabled={!agreedToTerms}
              className="w-full min-h-11"
              data-testid="button-next-to-sign"
            >
              Next: Sign Contract
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Sign Contract */}
        {currentStep === "sign" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {contract?.name || "Adoption Contract"}
                </CardTitle>
                <CardDescription>Please read and sign the adoption agreement</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contract Terms */}
                <div className="max-h-96 overflow-y-auto border rounded-lg p-4 bg-muted/30">
                  {contract?.html ? (
                    <div 
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: contract.html }}
                    />
                  ) : (
                    <>
                      <h4 className="font-semibold mb-3">Terms and Conditions</h4>
                      <div className="space-y-3 text-sm">
                        <p>
                          <strong>1. Veterinary Care:</strong> You agree to provide necessary veterinary care, 
                          including annual check-ups, vaccinations, and treatment for any illnesses or injuries.
                        </p>
                        <p>
                          <strong>2. Living Conditions:</strong> The animal will be kept as an indoor pet and 
                          provided with adequate food, water, shelter, exercise, and companionship.
                        </p>
                        <p>
                          <strong>3. Spay/Neuter:</strong> If the animal is not already spayed/neutered, you 
                          agree to have this procedure completed within 30 days of adoption.
                        </p>
                        <p>
                          <strong>4. Identification:</strong> You agree to ensure the animal wears identification 
                          tags and to update microchip registration with current contact information.
                        </p>
                        <p>
                          <strong>5. No Transfer:</strong> You agree not to sell, give away, or transfer ownership 
                          of the animal without written consent from the rescue organization.
                        </p>
                        <p>
                          <strong>6. Return Policy:</strong> If you can no longer care for the animal, you agree 
                          to contact the rescue organization to arrange for the animal's return.
                        </p>
                        <p>
                          <strong>7. Non-Refundable Fee:</strong> The adoption fee is non-refundable and helps 
                          cover medical expenses, food, and shelter for animals in our care.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <Separator />

                {/* Driver's License */}
                <div className="space-y-4">
                  <h4 className="font-semibold">Driver's License Information</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="driversLicenseNumber">Driver's License Number</Label>
                    <Input
                      id="driversLicenseNumber"
                      placeholder="Enter your driver's license number"
                      value={driversLicenseNumber}
                      onChange={(e) => setDriversLicenseNumber(e.target.value)}
                      disabled={signMutation.isPending}
                      data-testid="input-drivers-license-number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Photo of Driver's License</Label>
                    {driversLicenseImage ? (
                      <div className="relative border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium">{driversLicenseFileName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="ml-auto"
                            onClick={() => {
                              setDriversLicenseImage(null);
                              setDriversLicenseFileName(null);
                            }}
                            disabled={signMutation.isPending}
                            data-testid="button-remove-license-photo"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="driversLicenseUpload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                toast({
                                  title: "File too large",
                                  description: "Please upload an image smaller than 10MB",
                                  variant: "destructive",
                                });
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setDriversLicenseImage(event.target?.result as string);
                                setDriversLicenseFileName(file.name);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          disabled={signMutation.isPending}
                        />
                        <label htmlFor="driversLicenseUpload" className="cursor-pointer">
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Click to upload a photo of your driver's license
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPG, PNG, or HEIC (max 10MB)
                          </p>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Signature */}
                <div>
                  <h4 className="font-semibold mb-4">Your Signature</h4>
                  <SignatureCanvas onSignatureChange={setSignature} disabled={signMutation.isPending} />
                </div>

                <Alert>
                  <Heart className="h-4 w-4" />
                  <AlertDescription>
                    By signing, I agree to all terms and conditions of this adoption contract.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={() => setCurrentStep("review")}
                variant="outline"
                className="flex-1"
                data-testid="button-back-to-review"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSignContract}
                disabled={!signature || signMutation.isPending}
                className="flex-1"
                data-testid="button-sign-contract"
              >
                {signMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    Sign & Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {currentStep === "payment" && (
          <div className="space-y-6">
            <PaymentForm
              sessionId={token!}
              totals={session.totals}
              onSuccess={handlePaymentSuccess}
              feeConfig={feeConfig}
            />

            <Button
              onClick={() => setCurrentStep("sign")}
              variant="outline"
              className="w-full"
              data-testid="button-back-to-sign"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Signature
            </Button>
          </div>
        )}

        {/* Step 4: Success */}
        {currentStep === "success" && (
          <SuccessStep 
            token={token!}
            animalName={animal.name}
          />
        )}
      </div>
    </div>
  );
}

export default function PublicAdoptionCheckoutPage() {
  return (
    <Elements stripe={stripePromise}>
      <PublicAdoptionCheckoutPageContent />
    </Elements>
  );
}
