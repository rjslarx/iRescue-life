import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, FileSignature, Loader2, Upload, X } from "lucide-react";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import DOMPurify from "dompurify";
import { apiRequest } from "@/lib/queryClient";
import { buildTenantUrl } from "@/lib/tenantApi";

interface CustomFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'file';
  required?: boolean;
  helpText?: string;
}

interface PublicFormData {
  form: {
    id: string;
    name: string;
    description: string | null;
    requiresSignature: boolean;
    htmlTemplate: string;
    formFields: CustomFormField[];
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
  customFields: Record<string, string>;
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
    '{{signature_image_url}}': '',
    '{{signed_timestamp}}': '',
    '{{signed_ip}}': '',
  };

  Object.entries(data.customFields).forEach(([key, value]) => {
    replacements[`{{${key}}}`] = value;
  });

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

export default function PublicCustomFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, { url: string; name: string; uploading: boolean }>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [signatureError, setSignatureError] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PublicFormData>({
    queryKey: ['/api/public/custom-forms/by-slug', slug],
    queryFn: async () => {
      const res = await fetch(buildTenantUrl(`/api/public/custom-forms/by-slug/${slug}`));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Form not found or is no longer available');
      }
      return res.json();
    },
    enabled: !!slug,
    retry: false,
  });

  const handleFileUpload = async (field: CustomFormField, file: File) => {
    setFileUploads(prev => ({ ...prev, [field.key]: { url: '', name: file.name, uploading: true } }));
    setFieldErrors(prev => ({ ...prev, [field.key]: '' }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldId', field.key);
      formData.append('formType', 'custom_form');

      const res = await fetch(buildTenantUrl('/api/public/form-photos/upload'), {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setFileUploads(prev => ({ ...prev, [field.key]: { url: result.fileUrl, name: file.name, uploading: false } }));
      setCustomValues(prev => ({ ...prev, [field.key]: result.fileUrl }));
    } catch (err: any) {
      setFileUploads(prev => {
        const next = { ...prev };
        delete next[field.key];
        return next;
      });
      setFieldErrors(prev => ({ ...prev, [field.key]: err.message || 'Failed to upload file. Please try again.' }));
    }
  };

  const handleRemoveFile = (field: CustomFormField) => {
    setFileUploads(prev => {
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
    setCustomValues(prev => {
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      signerName: string;
      signerEmail: string;
      signerPhone: string;
      signatureData: string;
      formData: Record<string, string>;
    }) => {
      const res = await apiRequest('POST', `/api/public/custom-forms/by-slug/${slug}/submit`, payload);
      return res.json();
    },
    onSuccess: () => {
      setIsComplete(true);
      window.scrollTo({ top: 0 });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    for (const field of data?.form.formFields || []) {
      const value = (customValues[field.key] || '').trim();
      if (field.required && !value) {
        errors[field.key] = field.type === 'file'
          ? `Please upload ${field.label.toLowerCase().startsWith('upload') ? 'the requested file' : field.label.toLowerCase()}`
          : `${field.label} is required`;
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    if (data?.form.requiresSignature && !signatureImage) {
      setSignatureError(true);
      return;
    }
    setSignatureError(false);

    const signatureData = data?.form.requiresSignature
      ? signatureImage || ''
      : '';

    submitMutation.mutate({
      signerName: signerName.trim(),
      signerEmail: signerEmail.trim(),
      signerPhone: signerPhone.trim(),
      signatureData,
      formData: customValues,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30" data-testid="loading-public-form">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="error-card-public-form">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Form Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'This form is not available. Please contact the organization directly.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md" data-testid="success-card-public-form">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Form Submitted Successfully</CardTitle>
            <CardDescription>
              Thank you, {signerName}! A copy of your signed form has been sent to {signerEmail}.
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

  const previewCustomFields: Record<string, string> = {};
  for (const field of data.form.formFields) {
    const value = (customValues[field.key] || '').trim();
    if (field.type === 'file') {
      previewCustomFields[field.key] = value ? '(ID uploaded)' : '(to be uploaded below)';
    } else {
      previewCustomFields[field.key] = value || '(to be filled in below)';
    }
  }

  const previewHtml = renderMergeFields(data.form.htmlTemplate, {
    signerName: signerName || '(your name)',
    signerEmail: signerEmail || '(your email)',
    signerPhone: signerPhone || '(your phone)',
    tenantName: data.tenant.name,
    customFields: previewCustomFields,
  });

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card data-testid="public-form-header-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileSignature className="h-5 w-5 text-primary" />
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
          <Card data-testid="public-form-signer-info-card">
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
                <p className="text-xs text-muted-foreground">A copy of the signed form will be sent to this address</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-phone">Phone Number *</Label>
                <Input
                  id="signer-phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={signerPhone}
                  onChange={(e) => setSignerPhone(e.target.value)}
                  required
                  data-testid="input-signer-phone"
                />
              </div>

              {data.form.formFields.filter(f => f.type !== 'file').map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`field-${field.key}`}>
                    {field.label}{field.required ? ' *' : ''}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={`field-${field.key}`}
                      value={customValues[field.key] || ''}
                      onChange={(e) => setCustomValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      rows={3}
                      required={field.required}
                      data-testid={`input-field-${field.key}`}
                    />
                  ) : (
                    <Input
                      id={`field-${field.key}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      min={field.type === 'number' ? 1 : undefined}
                      value={customValues[field.key] || ''}
                      onChange={(e) => setCustomValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      required={field.required}
                      data-testid={`input-field-${field.key}`}
                    />
                  )}
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                  {fieldErrors[field.key] && (
                    <p className="text-sm text-destructive" data-testid={`error-field-${field.key}`}>{fieldErrors[field.key]}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {data.form.formFields.filter(f => f.type === 'file').map((field) => (
            <Card key={field.key} data-testid={`card-upload-${field.key}`}>
              <CardHeader>
                <CardTitle className="text-lg">{field.label}{field.required ? ' *' : ''}</CardTitle>
                {field.helpText && <CardDescription>{field.helpText}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-3">
                {fileUploads[field.key] ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {fileUploads[field.key].uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      )}
                      <span className="text-sm truncate" data-testid={`text-filename-${field.key}`}>
                        {fileUploads[field.key].name}
                      </span>
                    </div>
                    {!fileUploads[field.key].uploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFile(field)}
                        data-testid={`button-remove-file-${field.key}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      id={`file-${field.key}`}
                      accept="image/*,.heic,.heif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(field, file);
                        e.target.value = '';
                      }}
                      data-testid={`input-file-${field.key}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById(`file-${field.key}`)?.click()}
                      data-testid={`button-upload-${field.key}`}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choose Photo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      JPG, PNG, or HEIC — up to 5MB
                    </p>
                  </div>
                )}
                {fieldErrors[field.key] && (
                  <p className="text-sm text-destructive" data-testid={`error-field-${field.key}`}>{fieldErrors[field.key]}</p>
                )}
              </CardContent>
            </Card>
          ))}

          <Card data-testid="public-form-content-card">
            <CardHeader>
              <CardTitle className="text-lg">Agreement</CardTitle>
              <CardDescription>Please read the following carefully before signing</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                data-testid="public-form-rendered-content"
              />
            </CardContent>
          </Card>

          {data.form.requiresSignature && (
            <Card data-testid="public-form-signature-card">
              <CardHeader>
                <CardTitle className="text-lg">Your Signature</CardTitle>
                <CardDescription>Please sign below to complete the form</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SignatureCanvas
                  onSignatureChange={(sig) => {
                    setSignatureImage(sig);
                    if (sig) setSignatureError(false);
                  }}
                  description="Your signature will be included in the signed agreement"
                />
                {signatureError && (
                  <Alert variant="destructive" data-testid="alert-signature-required">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Please sign the form before submitting</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card data-testid="public-form-submit-card">
            <CardFooter className="flex-col gap-4 pt-6">
              {submitMutation.error && (
                <Alert variant="destructive" className="w-full">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{(submitMutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={
                  submitMutation.isPending ||
                  !signerName.trim() ||
                  !signerEmail.trim() ||
                  Object.values(fileUploads).some(f => f.uploading)
                }
                data-testid="button-submit-public-form"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileSignature className="mr-2 h-4 w-4" />
                    {data.form.requiresSignature ? 'Sign and Submit' : 'Submit Form'}
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
        </form>
      </div>
    </div>
  );
}
