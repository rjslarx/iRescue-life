import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LogIn, AlertCircle, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MfaVerificationDialog } from "@/components/MfaVerificationDialog";

export default function PlatformLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMfaDialog, setShowMfaDialog] = useState(false);
  const [mfaUserId, setMfaUserId] = useState<string | null>(null);
  const { completeMfaLogin, checkAuth } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Use platform-specific login endpoint (doesn't require tenant context)
      const response = await fetch('/api/platform/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.requiresMfa && data.userId) {
          setMfaUserId(data.userId);
          setShowMfaDialog(true);
        } else if (data.user) {
          // Refresh auth state after successful login
          await checkAuth();
          toast({
            title: "Login successful",
            description: "Welcome to Platform Admin!",
          });
          window.location.href = "/platform/dashboard";
        }
      } else {
        setError(data.error || data.message || "Login failed");
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
      description: "Welcome to Platform Admin!",
    });
    window.location.href = "/platform/dashboard";
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
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">Platform Admin Login</CardTitle>
            </div>
            <CardDescription>
              Sign in to access the iRescue.life Platform Administration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="admin@irescue.life"
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
                  <Link href="/platform/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
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
