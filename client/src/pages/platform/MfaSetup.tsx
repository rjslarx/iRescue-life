import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle2, Copy, Shield, Smartphone } from 'lucide-react';
import { useLocation } from 'wouter';

export default function MfaSetup() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [verificationCode, setVerificationCode] = useState('');
  const [setupData, setSetupData] = useState<{
    qrCode: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);
  const [backupCodesSaved, setBackupCodesSaved] = useState(false);

  // Setup MFA - generate QR code and backup codes
  const setupMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest('POST', '/api/auth/mfa/setup', {});
      return result;
    },
    onSuccess: (data) => {
      setSetupData(data);
      toast({
        title: 'QR Code Generated',
        description: 'Scan the QR code with your authenticator app',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to generate MFA setup',
        variant: 'destructive',
      });
    },
  });

  // Verify and enable MFA
  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      return await apiRequest('POST', '/api/auth/mfa/verify-setup', { code });
    },
    onSuccess: () => {
      toast({
        title: 'MFA Enabled Successfully',
        description: 'Two-factor authentication is now active',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/mfa/status'] });
      setLocation('/platform/settings');
    },
    onError: (error: any) => {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code',
        variant: 'destructive',
      });
    },
  });

  const handleCopySecret = () => {
    if (setupData) {
      navigator.clipboard.writeText(setupData.secret);
      toast({
        title: 'Copied',
        description: 'Secret key copied to clipboard',
      });
    }
  };

  const handleCopyBackupCodes = () => {
    if (setupData) {
      navigator.clipboard.writeText(setupData.backupCodes.join('\n'));
      toast({
        title: 'Copied',
        description: 'Backup codes copied to clipboard',
      });
    }
  };

  const handleVerify = () => {
    if (!backupCodesSaved) {
      toast({
        title: 'Save Backup Codes',
        description: 'Please confirm you have saved your backup codes',
        variant: 'destructive',
      });
      return;
    }
    if (verificationCode.length === 6) {
      verifyMutation.mutate(verificationCode);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-mfa-setup">
          Set Up Two-Factor Authentication
        </h1>
        <p className="text-muted-foreground mt-2">
          Enhance your account security with TOTP-based two-factor authentication
        </p>
      </div>

      {!setupData ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Enable MFA/2FA
            </CardTitle>
            <CardDescription>
              Two-factor authentication adds an extra layer of security to your account.
              You'll need an authenticator app like Google Authenticator or Authy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              data-testid="button-start-setup"
            >
              {setupMutation.isPending ? 'Generating...' : 'Start Setup'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Step 1: Scan QR Code */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Step 1: Scan QR Code
              </CardTitle>
              <CardDescription>
                Open your authenticator app and scan this QR code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={setupData.qrCode}
                  alt="MFA QR Code"
                  className="w-64 h-64"
                  data-testid="img-qr-code"
                />
              </div>

              <div className="space-y-2">
                <Label>Or enter this key manually:</Label>
                <div className="flex gap-2">
                  <Input
                    value={setupData.secret}
                    readOnly
                    className="font-mono"
                    data-testid="input-secret-key"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                    data-testid="button-copy-secret"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Save Backup Codes */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Save Backup Codes</CardTitle>
              <CardDescription>
                Save these backup codes in a secure location. Each code can only be used once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  <strong>Important:</strong> These backup codes can be used to access your account
                  if you lose your authenticator device. Store them securely!
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted p-4 rounded-lg">
                {setupData.backupCodes?.map((code, index) => (
                  <div key={index} data-testid={`backup-code-${index}`}>
                    {code}
                  </div>
                )) || <div>No backup codes available</div>}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyBackupCodes}
                  data-testid="button-copy-backup-codes"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Codes
                </Button>

                <Button
                  variant={backupCodesSaved ? 'default' : 'outline'}
                  onClick={() => setBackupCodesSaved(!backupCodesSaved)}
                  data-testid="button-confirm-saved"
                >
                  {backupCodesSaved && <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {backupCodesSaved ? 'Codes Saved' : 'I Have Saved These Codes'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Verify */}
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Verify Setup</CardTitle>
              <CardDescription>
                Enter the 6-digit code from your authenticator app to complete setup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verification-code">Verification Code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="font-mono text-2xl text-center tracking-widest"
                  data-testid="input-verification-code"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleVerify}
                  disabled={verificationCode.length !== 6 || verifyMutation.isPending}
                  data-testid="button-verify-enable"
                >
                  {verifyMutation.isPending ? 'Verifying...' : 'Verify & Enable MFA'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation('/platform/settings')}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
