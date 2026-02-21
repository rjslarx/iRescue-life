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
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Heart, AlertCircle, FileText, PawPrint } from "lucide-react";

type Step = "review" | "sign" | "success";

interface PlacementSessionData {
  session: {
    id: string;
    fosterName: string;
    fosterEmail: string;
    animalName: string;
    animalBreed: string | null;
    animalInternalId: string | null;
    renderedContract: string | null;
    expiresAt: string;
  };
  animal: {
    name: string;
    breed: string;
    species: string;
    photoUrls: string[] | null;
  } | null;
  organization: {
    name: string;
    logoUrl: string | null;
    contactEmail: string | null;
  } | null;
}

export default function PublicPlacementAgreementPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("review");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<PlacementSessionData>({
    queryKey: ['/api/public/placement-agreements', token],
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (data?.session) {
      setSignerName(data.session.fosterName || "");
      setSignerEmail(data.session.fosterEmail || "");
    }
  }, [data]);

  const signMutation = useMutation({
    mutationFn: async (signatureData: { signerName: string; signerEmail: string; signatureImageData: string }) => {
      const response = await apiRequest('POST', `/api/public/placement-agreements/${token}/sign`, signatureData);
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit signature",
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

    signMutation.mutate({
      signerName,
      signerEmail,
      signatureImageData: signatureImage,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !data) {
    const errorMessage = (error as any)?.message || '';
    const isExpired = errorMessage.includes('expired');
    const isSigned = errorMessage.includes('already been signed');
    const isCancelled = errorMessage.includes('cancelled');

    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className={`mx-auto w-16 h-16 ${isSigned ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center mb-4`}>
              {isSigned ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-600" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {isSigned ? 'Agreement Already Signed' : isExpired ? 'Link Expired' : isCancelled ? 'Agreement Cancelled' : 'Agreement Not Found'}
            </CardTitle>
            <CardDescription>
              {isSigned
                ? 'This placement agreement has already been signed.'
                : isExpired
                ? 'This placement agreement link has expired. Please contact the rescue for a new link.'
                : isCancelled
                ? 'This placement agreement has been cancelled by the organization.'
                : 'This link is invalid or has expired. Please contact the rescue organization.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl" data-testid="text-signing-success">Agreement Signed!</CardTitle>
            <CardDescription>
              Thank you for signing the placement agreement for <strong>{data.session.animalName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {data.organization?.name} has been notified. You can now welcome {data.session.animalName} into your care!
            </p>
            <div className="inline-flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              <span className="text-sm text-muted-foreground">Thank you for fostering!</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressPercent = step === "review" ? 50 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
            <PawPrint className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-placement-title">
            Animal Placement Agreement
          </h1>
          {data.organization && (
            <p className="text-muted-foreground mt-1">{data.organization.name}</p>
          )}
        </div>

        {data.animal && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {data.animal.photoUrls && data.animal.photoUrls.length > 0 && (
                  <img
                    src={data.animal.photoUrls[0]}
                    alt={data.animal.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                )}
                <div>
                  <h2 className="text-xl font-semibold" data-testid="text-animal-name">{data.animal.name}</h2>
                  <p className="text-muted-foreground">
                    {data.animal.breed || data.animal.species}
                    {data.session.animalInternalId && ` (ID: ${data.session.animalInternalId})`}
                  </p>
                </div>
                <Badge className="bg-amber-500 ml-auto shrink-0">Placement Agreement</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span className={step === "review" ? "font-semibold text-foreground" : ""}>Review</span>
            <span className={step === "sign" ? "font-semibold text-foreground" : ""}>Sign</span>
          </div>
        </div>

        {step === "review" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Review Agreement
              </CardTitle>
              <CardDescription>
                Please review the placement agreement for {data.session.animalName} carefully before signing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.session.renderedContract ? (
                <div
                  className="prose prose-sm max-w-none border rounded-lg p-6 bg-white dark:bg-gray-900 max-h-[60vh] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: data.session.renderedContract }}
                  data-testid="div-contract-content"
                />
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No agreement content is available. Please contact the rescue organization.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="flex items-start gap-3">
                <Checkbox
                  id="agree"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  data-testid="checkbox-agree-terms"
                />
                <label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                  I have read and understand the Animal Placement Agreement for <strong>{data.session.animalName}</strong>.
                  I agree to the terms and conditions outlined above and confirm this placement is subject to my Master Foster Agreement.
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep("sign")}
                  disabled={!agreedToTerms}
                  data-testid="button-proceed-to-sign"
                >
                  Proceed to Sign
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "sign" && (
          <Card>
            <CardHeader>
              <CardTitle>Sign Agreement</CardTitle>
              <CardDescription>
                Confirm your identity and provide your signature for the {data.session.animalName} placement agreement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Your full name"
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="Your email address"
                    data-testid="input-signer-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Signature</label>
                <div className="border rounded-lg p-2 bg-white dark:bg-gray-900">
                  <SignatureCanvas
                    onSignatureChange={(dataUrl) => setSignatureImage(dataUrl)}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-between gap-3 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => setStep("review")}
                  data-testid="button-back-to-review"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back to Review
                </Button>
                <Button
                  onClick={handleSign}
                  disabled={!signatureImage || !signerName || !signerEmail || signMutation.isPending}
                  data-testid="button-submit-signature"
                >
                  {signMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Sign & Submit
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          This agreement expires on {new Date(data.session.expiresAt).toLocaleDateString()}.
          Contact {data.organization?.contactEmail || 'the rescue organization'} with questions.
        </p>
      </div>
    </div>
  );
}
