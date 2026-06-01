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
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Heart, AlertCircle, FileText, PawPrint } from "lucide-react";

type Step = "review" | "sign" | "success";

interface SessionData {
  session: {
    id: string;
    status: string;
    expiresAt: string;
    signedAt?: string;
    ownerName: string;
    ownerEmail: string;
  };
  applicant: {
    name: string;
    email: string;
    phone?: string;
  };
  contract?: {
    html: string;
    name: string;
  };
  organization?: {
    name: string;
  };
}

export default function PublicSurrenderAgreementPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("review");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<SessionData>({
    queryKey: ['/api/public/surrender-agreements', token],
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (data?.applicant) {
      setSignerName(data.applicant.name || "");
      setSignerEmail(data.applicant.email || "");
    }
  }, [data]);

  const signMutation = useMutation({
    mutationFn: async (signatureData: { signerName: string; signerEmail: string; signatureImageData: string }) => {
      const response = await apiRequest('POST', `/api/public/surrender-agreements/${token}/sign`, signatureData);
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

  if (data?.session?.status === "signed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Agreement Already Signed</CardTitle>
            <CardDescription>
              This surrender agreement was signed on {new Date(data.session.signedAt!).toLocaleDateString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Thank you for completing your surrender agreement. The rescue organization has been notified.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data?.session?.status === "expired" || (data?.session?.expiresAt && new Date(data.session.expiresAt) < new Date())) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Link Expired</CardTitle>
            <CardDescription>
              This surrender agreement link has expired.
            </CardDescription>
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
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Session Not Found</CardTitle>
            <CardDescription>
              This surrender agreement link is invalid or has expired.
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
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
            <PawPrint className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Owner Surrender Agreement</h1>
          {data.organization && (
            <p className="text-muted-foreground mt-2">{data.organization.name}</p>
          )}
        </div>

        <div className="mb-8">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span className={step === "review" ? "text-amber-600 font-medium" : ""}>Review</span>
            <span className={step === "sign" ? "text-amber-600 font-medium" : ""}>Sign</span>
            <span className={step === "success" ? "text-green-600 font-medium" : ""}>Complete</span>
          </div>
        </div>

        {step === "review" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Review Surrender Agreement
              </CardTitle>
              <CardDescription>
                Please review the surrender agreement carefully before signing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.contract ? (
                <div className="border rounded-lg p-4 max-h-96 overflow-y-auto bg-white">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: data.contract.html }}
                  />
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No agreement content found. Please contact the organization.
                  </AlertDescription>
                </Alert>
              )}

              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Your Information</h4>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Name:</span> {data.applicant.name}</p>
                  <p><span className="font-medium text-foreground">Email:</span> {data.applicant.email}</p>
                  {data.applicant.phone && (
                    <p><span className="font-medium text-foreground">Phone:</span> {data.applicant.phone}</p>
                  )}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => setStep("sign")}
                disabled={!data.contract}
                data-testid="button-continue-to-sign"
              >
                Continue to Sign
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "sign" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Sign Agreement
              </CardTitle>
              <CardDescription>
                Please provide your signature to complete the surrender agreement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Full Legal Name</label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Enter your full legal name"
                    data-testid="input-signer-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email Address</label>
                  <Input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="Enter your email address"
                    data-testid="input-signer-email"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Your Signature</label>
                <SignatureCanvas
                  onSignatureChange={setSignatureImage}
                  width={400}
                  height={150}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Draw your signature in the box above
                </p>
              </div>

              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(!!checked)}
                  data-testid="checkbox-agree-terms"
                />
                <label htmlFor="terms" className="text-sm cursor-pointer">
                  I have read and agree to the surrender agreement terms. I certify that I am the legal owner of this animal and am voluntarily relinquishing ownership.
                </label>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("review")}
                  data-testid="button-back-to-review"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
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
              <CardDescription>
                Thank you for signing the surrender agreement
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <Heart className="h-6 w-6 text-amber-600 mx-auto mb-2" />
                <p className="text-muted-foreground">
                  The rescue organization has been notified. Thank you for caring about your animal's future.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                A copy of your signed agreement has been recorded by the organization.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
