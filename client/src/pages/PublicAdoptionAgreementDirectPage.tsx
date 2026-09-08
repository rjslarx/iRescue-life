import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Heart, AlertCircle, FileText, PawPrint } from "lucide-react";
import { CatSafetyAddendumFields, CatSafetyAddendumReview, emptyCatSafetyAnswers, catSafetyAnswersValid, type CatSafetyAnswers } from "@/components/CatSafetyAddendum";

type Step = "review" | "sign" | "success";

interface DirectSendData {
  send: {
    id: string;
    status: string;
    expiresAt?: string;
    signedAt?: string;
    recipientName?: string;
    recipientEmail?: string;
  };
  contract?: {
    html: string;
    name: string;
  };
  animal?: { name: string } | null;
  organization?: { name: string } | null;
  catSafetyAddendum?: { html: string; prefill: { adopterName: string; adopterEmail: string; adopterPhone: string; adopterAddress: string } };
}

export default function PublicAdoptionAgreementDirectPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("review");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signerAddress, setSignerAddress] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [catAnswers, setCatAnswers] = useState<CatSafetyAnswers>(emptyCatSafetyAnswers());
  const [coAdopterEnabled, setCoAdopterEnabled] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<DirectSendData>({
    queryKey: ['/api/public/adoption-agreement-direct', token],
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (data?.send) {
      setSignerName((prev) => prev || data.send.recipientName || "");
      setSignerEmail((prev) => prev || data.send.recipientEmail || "");
      if (data.catSafetyAddendum?.prefill) {
        setSignerName(prev => prev || data.catSafetyAddendum!.prefill.adopterName);
        setSignerEmail(prev => prev || data.catSafetyAddendum!.prefill.adopterEmail);
        setSignerPhone(prev => prev || data.catSafetyAddendum!.prefill.adopterPhone);
        setSignerAddress(prev => prev || data.catSafetyAddendum!.prefill.adopterAddress);
      }
    }
  }, [data]);

  const signMutation = useMutation({
    mutationFn: async (body: {
      signerName: string;
      signerEmail: string;
      signerPhone?: string;
      signerAddress?: string;
      signatureImageData: string;
      catSafetyAddendumAnswers?: CatSafetyAnswers;
    }) => {
      const response = await apiRequest('POST', `/api/public/adoption-agreement-direct/${token}/sign`, body);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Failed to submit signature");
      }
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      refetch();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to submit signature",
        variant: "destructive",
      });
    },
  });

  const handleSign = () => {
    if (!signatureImage || !signerName || !signerEmail) {
      toast({
        title: "Missing Information",
        description: "Please provide your name, email, and signature",
        variant: "destructive",
      });
      return;
    }
    if (data.catSafetyAddendum && !catSafetyAnswersValid(catAnswers, coAdopterEnabled)) {
      toast({ title: "Complete the cat safety addendum", description: "Please answer every required question and complete all required initials and signatures.", variant: "destructive" }); return;
    }
    signMutation.mutate({
      signerName,
      signerEmail,
      signerPhone: signerPhone || undefined,
      signerAddress: signerAddress || undefined,
      signatureImageData: signatureImage,
      catSafetyAddendumAnswers: data.catSafetyAddendum ? catAnswers : undefined,
    });
  };

  if (data?.send?.status === "signed" && step !== "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Agreement Already Signed</CardTitle>
            <CardDescription>
              This adoption agreement was signed{data.send.signedAt ? ` on ${new Date(data.send.signedAt).toLocaleDateString()}` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Thank you for completing your adoption agreement. The rescue organization has been notified.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data?.send?.expiresAt && new Date(data.send.expiresAt) < new Date() && data.send.status !== "signed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Link Expired</CardTitle>
            <CardDescription>This adoption agreement link has expired.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Please contact the rescue organization to request a new agreement link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Agreement Not Found</CardTitle>
            <CardDescription>
              This adoption agreement link is invalid, expired, or has been cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Please contact the rescue organization for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressPercent = step === "review" ? 33 : step === "sign" ? 66 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
            <PawPrint className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Adoption Agreement</h1>
          {data.organization && (
            <p className="text-muted-foreground mt-2">{data.organization.name}</p>
          )}
          {data.animal?.name && (
            <p className="text-muted-foreground">For {data.animal.name}</p>
          )}
        </div>

        <div className="mb-8">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span className={step === "review" ? "text-emerald-600 font-medium" : ""}>Review</span>
            <span className={step === "sign" ? "text-emerald-600 font-medium" : ""}>Fill &amp; Sign</span>
            <span className={step === "success" ? "text-green-600 font-medium" : ""}>Complete</span>
          </div>
        </div>

        {step === "review" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Review Adoption Agreement
              </CardTitle>
              <CardDescription>
                Please review the adoption agreement carefully before filling it out and signing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.contract ? (
                <div
                  className="prose prose-sm max-w-none border rounded-lg p-6 bg-white max-h-[60vh] overflow-y-auto"
                  data-testid="contract-content"
                  dangerouslySetInnerHTML={{ __html: data.contract.html }}
                />
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The agreement content could not be loaded. Please contact the rescue organization.
                  </AlertDescription>
                </Alert>
              )}
              {data.catSafetyAddendum && <CatSafetyAddendumReview html={data.catSafetyAddendum.html} />}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setStep("sign")}
                disabled={!data.contract}
                data-testid="button-continue-to-sign"
              >
                Continue to Fill &amp; Sign
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "sign" && (
          <Card>
            <CardHeader>
              <CardTitle>Your Information &amp; Signature</CardTitle>
              <CardDescription>
                Fill in your details, then sign below to complete the agreement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="signer-name">Full Name *</Label>
                  <Input
                    id="signer-name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signer-email">Email *</Label>
                  <Input
                    id="signer-email"
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    data-testid="input-signer-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signer-phone">Phone</Label>
                  <Input
                    id="signer-phone"
                    type="tel"
                    value={signerPhone}
                    onChange={(e) => setSignerPhone(e.target.value)}
                    data-testid="input-signer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signer-address">Address</Label>
                  <Input
                    id="signer-address"
                    value={signerAddress}
                    onChange={(e) => setSignerAddress(e.target.value)}
                    placeholder="Street, City, State ZIP"
                    data-testid="input-signer-address"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Signature *</Label>
                <SignatureCanvas onSignatureChange={setSignatureImage} />
              </div>
              {data.catSafetyAddendum && <CatSafetyAddendumFields value={catAnswers} onChange={setCatAnswers} coAdopterEnabled={coAdopterEnabled} onCoAdopterEnabledChange={setCoAdopterEnabled} />}

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="agree-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  data-testid="checkbox-agree-terms"
                />
                <label htmlFor="agree-terms" className="text-sm text-muted-foreground leading-snug">
                  I have read and agree to the terms of this adoption agreement. I understand my
                  electronic signature is legally binding.
                </label>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("review")}
                  data-testid="button-back-to-review"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSign}
                  disabled={!signatureImage || !signerName || !signerEmail || !agreedToTerms || signMutation.isPending}
                  data-testid="button-submit-signature"
                >
                  {signMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      Sign Agreement
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "success" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Agreement Signed!</CardTitle>
              <CardDescription>Thank you for completing the adoption agreement</CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <Heart className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-muted-foreground">
                  The rescue organization has been notified and has a copy of your signed agreement.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
