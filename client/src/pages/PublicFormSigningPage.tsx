import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, FileSignature, Loader2 } from "lucide-react";
import SignaturePad from "signature_pad";

interface FormData {
  form: {
    id: number;
    name: string;
    description: string | null;
    formType: string;
    requiresSignature: boolean;
    htmlTemplate: string;
  };
  submission: {
    id: number;
    signerName: string;
    signerEmail: string;
    signerPhone: string | null;
  };
  animal: {
    id: number;
    name: string;
    species: string;
    breed: string;
    age: string;
    sex: string;
  } | null;
  tenant: {
    name: string;
    logo: string | null;
  };
}

interface SubmitResponse {
  success: boolean;
  message: string;
  downloadUrl?: string;
}

function renderMergeFields(html: string, data: FormData): string {
  let rendered = html;
  
  const signerFields: Record<string, string> = {
    '{{signer_name}}': data.submission.signerName || '',
    '{{signer_email}}': data.submission.signerEmail || '',
    '{{signer_phone}}': data.submission.signerPhone || '',
    '{{organization_name}}': data.tenant.name || '',
    '{{current_date}}': new Date().toLocaleDateString(),
  };
  
  Object.entries(signerFields).forEach(([field, value]) => {
    rendered = rendered.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'g'), value);
  });
  
  if (data.animal) {
    const animalFields: Record<string, string> = {
      '{{animal_name}}': data.animal.name || '',
      '{{animal_species}}': data.animal.species || '',
      '{{animal_breed}}': data.animal.breed || '',
      '{{animal_age}}': data.animal.age || '',
      '{{animal_sex}}': data.animal.sex || '',
    };
    
    Object.entries(animalFields).forEach(([field, value]) => {
      rendered = rendered.replace(new RegExp(field.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
  }
  
  return rendered;
}

export default function PublicFormSigningPage() {
  const { token } = useParams<{ token: string }>();
  const [isComplete, setIsComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);

  const { data, isLoading, error } = useQuery<FormData>({
    queryKey: ['/api/public/forms', token],
    enabled: !!token,
  });

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

  const submitMutation = useMutation<SubmitResponse, Error, { signatureData: string }>({
    mutationFn: async ({ signatureData }) => {
      const response = await fetch(`/api/public/forms/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to submit form');
      }
      return response.json();
    },
    onSuccess: (result) => {
      setIsComplete(true);
      if (result.downloadUrl) {
        setDownloadUrl(result.downloadUrl);
      }
    },
  });

  const handleClearSignature = () => {
    signaturePadRef.current?.clear();
  };

  const handleSubmit = () => {
    if (data?.form.requiresSignature && (!signaturePadRef.current || signaturePadRef.current.isEmpty())) {
      alert('Please sign the form before submitting');
      return;
    }
    
    const signatureData = signaturePadRef.current?.toDataURL('image/png') || '';
    submitMutation.mutate({ signatureData });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30" data-testid="loading-state">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    const errorMessage = error instanceof Error ? error.message : 'Form not found or has expired';
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="error-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Form Unavailable
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="success-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Form Submitted Successfully</CardTitle>
            <CardDescription>
              Thank you for completing this form. A copy has been sent to your email.
            </CardDescription>
          </CardHeader>
          {downloadUrl && (
            <CardFooter className="justify-center">
              <Button asChild data-testid="button-download-pdf">
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                  Download PDF Copy
                </a>
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    );
  }

  const renderedHtml = renderMergeFields(data.form.htmlTemplate, data);

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card data-testid="form-header-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>{data.form.name}</CardTitle>
                <CardDescription>
                  From {data.tenant.name}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card data-testid="form-content-card">
          <CardHeader>
            <CardTitle className="text-lg">Form Details</CardTitle>
            <CardDescription>
              For: {data.submission.signerName} ({data.submission.signerEmail})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
              data-testid="form-rendered-content"
            />
          </CardContent>
        </Card>

        {data.form.requiresSignature && (
          <Card data-testid="signature-card">
            <CardHeader>
              <CardTitle className="text-lg">Your Signature</CardTitle>
              <CardDescription>
                Please sign below to complete this form
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-2 bg-white">
                <canvas
                  ref={signatureCanvasRef}
                  className="w-full h-40 touch-none"
                  data-testid="signature-canvas"
                />
              </div>
              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={handleClearSignature}
                  data-testid="button-clear-signature"
                >
                  Clear Signature
                </Button>
                <p className="text-xs text-muted-foreground self-center">
                  Draw your signature above
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="submit-card">
          <CardFooter className="flex-col gap-4 pt-6">
            {submitMutation.error && (
              <Alert variant="destructive" className="w-full">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{submitMutation.error.message}</AlertDescription>
              </Alert>
            )}
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              data-testid="button-submit-form"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <FileSignature className="mr-2 h-4 w-4" />
                  {data.form.requiresSignature ? 'Sign and Submit Form' : 'Submit Form'}
                </>
              )}
            </Button>
            {data.form.requiresSignature && (
              <p className="text-xs text-center text-muted-foreground">
                By submitting, you agree to sign this form electronically. Your signature, 
                IP address, and timestamp will be recorded.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
