import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdopterLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [linkRequested, setLinkRequested] = useState(false);
  
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const magicLoginMutation = useMutation({
    mutationFn: async (loginToken: string) => {
      const response = await apiRequest("/api/adopter/magic-login", {
        method: "POST",
        body: JSON.stringify({ token: loginToken }),
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Welcome back!",
        description: "You've been logged in successfully.",
      });
      setLocation(data.redirectTo || "/my-pets");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "The link may have expired or already been used.",
        variant: "destructive",
      });
    },
  });

  const requestLinkMutation = useMutation({
    mutationFn: async (userEmail: string) => {
      const response = await apiRequest("/api/adopter/request-magic-link", {
        method: "POST",
        body: JSON.stringify({ email: userEmail }),
      });
      return response;
    },
    onSuccess: () => {
      setLinkRequested(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send login link. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (token) {
      magicLoginMutation.mutate(token);
    }
  }, [token]);

  const handleRequestLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      requestLinkMutation.mutate(email.trim());
    }
  };

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Signing you in...</CardTitle>
            <CardDescription>Please wait while we verify your login link</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            {magicLoginMutation.isPending ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-magic-login" />
            ) : magicLoginMutation.isError ? (
              <div className="text-center space-y-4">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-sm text-muted-foreground">
                  This link is invalid or has expired.
                </p>
                <Button 
                  onClick={() => setLocation("/my-pets/login")} 
                  variant="outline"
                  data-testid="button-request-new-link"
                >
                  Request a new link
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkRequested) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Check your email!</CardTitle>
            <CardDescription>
              If an account exists for {email}, we've sent a login link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              The link expires in 24 hours. Check your spam folder if you don't see it.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setLinkRequested(false);
                setEmail("");
              }}
              data-testid="button-try-different-email"
            >
              Try a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Pet Portal Login</CardTitle>
          <CardDescription>
            Enter your email to receive a login link - no password needed!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRequestLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={requestLinkMutation.isPending || !email.trim()}
              data-testid="button-send-login-link"
            >
              {requestLinkMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Login Link"
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Only adopters with existing accounts can access the Pet Portal.
              <br />
              Contact your rescue organization if you need help.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
