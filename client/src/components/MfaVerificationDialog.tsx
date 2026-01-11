import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Shield, AlertCircle } from 'lucide-react';

interface MfaVerificationDialogProps {
  open: boolean;
  userId: string;
  onSuccess: (user: any) => void;
  onCancel: () => void;
}

export function MfaVerificationDialog({
  open,
  userId,
  onSuccess,
  onCancel,
}: MfaVerificationDialogProps) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const result = await apiRequest('POST', '/api/auth/mfa/verify', {
        userId,
        code: verificationCode,
      });
      return result;
    },
    onSuccess: (data) => {
      if (data.backupCodeUsed) {
        toast({
          title: 'Backup Code Used',
          description: `${data.remainingBackupCodes} backup codes remaining`,
        });
      }
      onSuccess(data.user);
    },
    onError: (error: any) => {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid code. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleVerify = () => {
    if (code.length >= 6) {
      verifyMutation.mutate(code);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length >= 6) {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-mfa-verification">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">
              {useBackupCode ? 'Backup Code' : 'Verification Code'}
            </Label>
            <Input
              id="mfa-code"
              type="text"
              maxLength={useBackupCode ? 8 : 6}
              placeholder={useBackupCode ? 'XXXXXXXX' : '000000'}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, '').toUpperCase())}
              onKeyPress={handleKeyPress}
              className="font-mono text-2xl text-center tracking-widest"
              autoFocus
              data-testid="input-mfa-code"
            />
          </div>

          {!useBackupCode && (
            <Button
              variant="link"
              className="px-0 h-auto"
              onClick={() => {
                setUseBackupCode(true);
                setCode('');
              }}
              data-testid="button-use-backup-code"
            >
              Use a backup code instead
            </Button>
          )}

          {useBackupCode && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Each backup code can only be used once. After using a backup code, consider
                regenerating new ones.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-mfa"
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={code.length < 6 || verifyMutation.isPending}
            data-testid="button-verify-mfa"
          >
            {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
