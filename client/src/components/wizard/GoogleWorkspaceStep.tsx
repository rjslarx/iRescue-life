import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Mail, 
  Calendar, 
  HardDrive, 
  CheckCircle, 
  AlertCircle,
  ExternalLink,
  Heart,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GoogleWorkspaceStepProps {
  onNext: () => void;
}

export default function GoogleWorkspaceStep({ onNext }: GoogleWorkspaceStepProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if Google Workspace is already connected
  const { data: integrationStatus } = useQuery<{
    isConnected: boolean;
    email?: string;
  }>({
    queryKey: ['/api/google-workspace/status'],
  });

  // Initiate OAuth flow
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/google-workspace/auth-url");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect');
      }
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Not Available",
        description: error.message || "Could not initiate Google Workspace connection. Please try again.",
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });

  const handleConnect = () => {
    setIsConnecting(true);
    connectMutation.mutate();
  };

  const handleSkip = () => {
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold" data-testid="heading-google-workspace">
          Google Workspace Integration
        </h2>
        <p className="text-muted-foreground">
          Connect your nonprofit's Google Workspace for free email sending and more
        </p>
      </div>

      {integrationStatus?.isConnected ? (
        <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-900 dark:text-green-100">
            <strong>Connected!</strong> Google Workspace is integrated with account: {integrationStatus.email}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Heart className="h-4 w-4 text-primary" />
          <AlertDescription>
            <strong className="block mb-1">For Nonprofits</strong>
            If your rescue has Google Workspace for Nonprofits (free for up to 2,000 users), 
            connecting it unlocks powerful benefits at no additional cost.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="card-gmail-benefit">
          <CardHeader className="pb-3">
            <Mail className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Unlimited Email</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">
              Route emails through Gmail API to bypass Resend quotas. Send adoption alerts, newsletters, 
              and updates for free (up to Google's generous limits).
            </CardDescription>
          </CardContent>
        </Card>

        <Card data-testid="card-calendar-benefit">
          <CardHeader className="pb-3">
            <Calendar className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Calendar Sync</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">
              Integrate rescue events, volunteer shifts, and appointments with Google Calendar for 
              seamless scheduling.
            </CardDescription>
          </CardContent>
        </Card>

        <Card data-testid="card-drive-benefit">
          <CardHeader className="pb-3">
            <HardDrive className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Drive Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">
              Store adoption documents, medical records, and photos in Google Drive with automatic 
              organization.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30" data-testid="card-eligibility">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Eligibility & Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <p className="font-medium">To connect Google Workspace:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
              <li>Your rescue must have Google Workspace for Nonprofits</li>
              <li>You need admin access to your Google Workspace account</li>
              <li>Click "Connect Google Workspace" below to authorize</li>
            </ol>
          </div>
          
          {!integrationStatus?.isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Don't have Google Workspace? No problem! You can still use iRescue.life with our built-in 
                email system. This step is completely optional.
                <a 
                  href="https://www.google.com/nonprofits/offerings/workspace/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
                >
                  Learn about Google for Nonprofits
                  <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-4 pt-4">
        {!integrationStatus?.isConnected ? (
          <>
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isConnecting}
              data-testid="button-skip-google-workspace"
            >
              Skip for Now
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isConnecting || connectMutation.isPending}
              data-testid="button-connect-google-workspace"
            >
              {isConnecting ? (
                <>Connecting...</>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Connect Google Workspace
                </>
              )}
            </Button>
          </>
        ) : (
          <Button onClick={onNext} data-testid="button-google-workspace-continue">
            Continue to Next Step
          </Button>
        )}
      </div>
    </div>
  );
}
