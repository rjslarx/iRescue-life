import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, FileSignature, Loader2, ShieldCheck } from "lucide-react";
import SignaturePad from "signature_pad";
import DOMPurify from "dompurify";
import { apiRequest } from "@/lib/queryClient";

interface WaiverData {
  form: {
    id: string;
    name: string;
    description: string | null;
    htmlTemplate: string;
    requiresSignature: boolean;
  };
  tenant: {
    name: string;
    logo: string | null;
  };
}

function renderMergeFields(html: string, data: {
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  tenantName: string;
  childrensNames?: string;
}): string {
  let rendered = html;

  const now = new Date();
  const replacements: Record<string, string> = {
    '{{signer_name}}': data.signerName || '',
    '{{signer_email}}': data.signerEmail || '',
    '{{signer_phone}}': data.signerPhone || '',
    '{{organization_name}}': data.tenantName || '',
    '{{current_date}}': now.toLocaleDateString(),
    '{{date}}': now.toLocaleDateString(),
    '{{date_day}}': String(now.getDate()),
    '{{date_month}}': now.toLocaleString('en-US', { month: 'long' }),
    '{{date_year}}': String(now.getFullYear()).slice(-2),
    '{{childrens_names}}': data.childrensNames || '',
    '{{signature_image_url}}': '',
  };

  Object.entries(replacements).forEach(([field, value]) => {
    rendered = rendered.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'g'), value);
  });

  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                   'div', 'span', 'blockquote', 'hr', 'a', 'img'],
    ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'src', 'alt'],
  });
}

export default function PublicWaiverPage() {
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [childrensNames, setChildrensNames] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [signatureError, setSignatureError] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  const { data, isLoading, error } = useQuery<WaiverData>({
    queryKey: ['/api/public-waiver'],
  });

  const hasChildrensField = data?.form.htmlTemplate?.includes('{{childrens_names}}') || false;

  useEffect(() => {
    if (signatureCanvasRef.current && !signaturePadRef.current && data) {
      signaturePadRef.current = new SignaturePad(signatureCanvasRef.current, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });

      const resizeCanvas = () => {
        const canvas = signatureCanvasRef.current;
        if (canvas) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d")?.scale(ratio, ratio);
          signaturePadRef.current?.clear();
        }
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      signerName: string;
      signerEmail: string;
      signerPhone: string;
      signatureData: string;
      formData?: Record<string, string>;
    }) => {
      const res = await apiRequest('POST', '/api/public-waiver/sign', payload);
      return res.json();
    },
    onSuccess: () => {
      setIsComplete(true);
    },
  });

  const handleClearSignature = () => {
    signaturePadRef.current?.clear();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!signerName.trim() || !signerEmail.trim()) {
      return;
    }

    if (data?.form.requiresSignature && (!signaturePadRef.current || signaturePadRef.current.isEmpty())) {
      setSignatureError(true);
      return;
    }
    setSignatureError(false);

    const signatureData = signaturePadRef.current?.toDataURL('image/png') || '';
    const formData: Record<string, string> = {};
    if (hasChildrensField) {
      formData.childrens_names = childrensNames.trim() || 'N/A';
    }

    submitMutation.mutate({
      signerName: signerName.trim(),
      signerEmail: signerEmail.trim(),
      signerPhone: signerPhone.trim(),
      signatureData,
      formData: Object.keys(formData).length > 0 ? formData : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30" data-testid="loading-waiver">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="error-card-waiver">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Waiver Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This organization has not set up a volunteer waiver form yet. Please contact them directly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="success-card-waiver">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Waiver Signed Successfully</CardTitle>
            <CardDescription>
              Thank you, {signerName}! A copy of your signed waiver has been sent to {signerEmail}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              You may now close this page. If you have any questions, please contact {data.tenant.name} directly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const previewHtml = renderMergeFields(data.form.htmlTemplate, {
    signerName: signerName || '(your name)',
    signerEmail: signerEmail || '(your email)',
    signerPhone: signerPhone || '',
    tenantName: data.tenant.name,
    childrensNames: childrensNames.trim() || hasChildrensField ? (childrensNames.trim() || '(will be filled in below)') : undefined,
  });

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card data-testid="waiver-header-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{data.form.name}</CardTitle>
                <CardDescription>{data.tenant.name}</CardDescription>
              </div>
            </div>
            {data.form.description && (
              <p className="text-sm text-muted-foreground mt-2">{data.form.description}</p>
            )}
          </CardHeader>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card data-testid="waiver-signer-info-card">
            <CardHeader>
              <CardTitle className="text-lg">Your Information</CardTitle>
              <CardDescription>Please provide your details below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signer-name">Full Name *</Label>
                <Input
                  id="signer-name"
                  placeholder="Enter your full legal name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  required
                  data-testid="input-signer-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-email">Email Address *</Label>
                <Input
                  id="signer-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  required
                  data-testid="input-signer-email"
                />
                <p className="text-xs text-muted-foreground">A copy of the signed waiver will be sent to this address</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-phone">Phone Number (optional)</Label>
                <Input
                  id="signer-phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={signerPhone}
                  onChange={(e) => setSignerPhone(e.target.value)}
                  data-testid="input-signer-phone"
                />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="waiver-content-card">
            <CardHeader>
              <CardTitle className="text-lg">Agreement</CardTitle>
              <CardDescription>Please read the following carefully before signing</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                data-testid="waiver-rendered-content"
              />
            </CardContent>
          </Card>

          {hasChildrensField && (
            <Card data-testid="waiver-childrens-card">
              <CardHeader>
                <CardTitle className="text-lg">Children Under 18</CardTitle>
                <CardDescription>
                  If applicable, list the names of any children under 18 who will be volunteering
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="childrens-names">Children's Names</Label>
                  <Textarea
                    id="childrens-names"
                    placeholder="Enter each child's full name, separated by a new line (leave blank if not applicable)"
                    value={childrensNames}
                    onChange={(e) => setChildrensNames(e.target.value)}
                    rows={3}
                    data-testid="input-childrens-names"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {data.form.requiresSignature && (
            <Card data-testid="waiver-signature-card">
              <CardHeader>
                <CardTitle className="text-lg">Your Signature</CardTitle>
                <CardDescription>
                  Please sign below to complete the waiver
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-md p-2 bg-white">
                  <canvas
                    ref={signatureCanvasRef}
                    className="w-full h-40 touch-none"
                    data-testid="waiver-signature-canvas"
                  />
                </div>
                {signatureError && (
                  <Alert variant="destructive" data-testid="alert-signature-required">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Please sign the form before submitting</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-between flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearSignature}
                    data-testid="button-clear-waiver-signature"
                  >
                    Clear Signature
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Draw your signature above using your finger or mouse
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="waiver-submit-card">
            <CardFooter className="flex-col gap-4 pt-6">
              {submitMutation.error && (
                <Alert variant="destructive" className="w-full">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitMutation.error.message}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitMutation.isPending || !signerName.trim() || !signerEmail.trim()}
                data-testid="button-submit-waiver"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileSignature className="mr-2 h-4 w-4" />
                    Sign and Submit Waiver
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                By submitting, you agree to sign this waiver electronically. Your signature,
                IP address, and timestamp will be recorded.
              </p>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
