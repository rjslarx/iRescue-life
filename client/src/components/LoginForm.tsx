import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LogIn, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MfaVerificationDialog } from "@/components/MfaVerificationDialog";

interface LoginFormProps {
  rescueName?: string;
}

export default function LoginForm({ rescueName }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMfaDialog, setShowMfaDialog] = useState(false);
  const [mfaUserId, setMfaUserId] = useState<string | null>(null);
  const { login, completeMfaLogin } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Check for success messages from OAuth redirects
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('google_connected') === 'true') {
      setSuccessMessage('Google Workspace connected successfully! Please log in to access your settings.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.success) {
        // Check if MFA is required
        if (result.requiresMfa && result.userId) {
          setMfaUserId(result.userId);
          setShowMfaDialog(true);
        } else {
          // Normal login without MFA
          toast({
            title: "Login successful",
            description: "Welcome back!",
          });
          // Redirect based on whether user is platform admin
          if (result.user?.roles?.includes('platform_admin')) {
            window.location.href = "/platform/dashboard";
          } else {
            navigate("/dashboard");
          }
        }
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSuccess = async (user: any) => {
    await completeMfaLogin(user);
    setShowMfaDialog(false);
    toast({
      title: "Login successful",
      description: "Welcome back!",
    });
    // Redirect based on whether user is platform admin
    if (user?.roles?.includes('platform_admin')) {
      window.location.href = "/platform/dashboard";
    } else {
      navigate("/dashboard");
    }
  };

  const handleMfaCancel = () => {
    setShowMfaDialog(false);
    setMfaUserId(null);
  };

  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <LogIn className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">Team Login</CardTitle>
            </div>
            <CardDescription>
              Sign in to access {rescueName}'s management portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {successMessage && (
                <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" data-testid="alert-login-success">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-700 dark:text-green-300">{successMessage}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" data-testid="alert-login-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login-submit">
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* MFA Verification Dialog */}
      {showMfaDialog && mfaUserId && (
        <MfaVerificationDialog
          open={showMfaDialog}
          userId={mfaUserId}
          onSuccess={handleMfaSuccess}
          onCancel={handleMfaCancel}
        />
      )}
    </>
  );
}
