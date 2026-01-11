import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

interface NewsletterSubscribeProps {
  variant?: "card" | "inline";
  className?: string;
}

export default function NewsletterSubscribe({ variant = "card", className = "" }: NewsletterSubscribeProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/newsletter/subscribe', {
        email,
        name: name || undefined,
        source: 'website',
      });
      return response.json();
    },
    onSuccess: () => {
      setShowSuccess(true);
      setEmail("");
      setName("");
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    },
    onError: () => {
      // Error toast is already handled by the mutation
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribeMutation.mutate();
  };

  if (variant === "inline") {
    return (
      <div className={`space-y-3 ${className}`}>
        {showSuccess ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Thanks for subscribing! You'll receive updates about our rescue animals.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={subscribeMutation.isPending}
                className="flex-1"
                data-testid="input-newsletter-email"
              />
              <Button 
                type="submit" 
                disabled={subscribeMutation.isPending}
                data-testid="button-newsletter-subscribe"
              >
                {subscribeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Mail className="h-4 w-4 mr-2" />
                Subscribe
              </Button>
            </div>
            <Input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={subscribeMutation.isPending}
              className="w-full"
              data-testid="input-newsletter-name"
            />
          </form>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <CardTitle>Stay Updated</CardTitle>
        </div>
        <CardDescription>
          Subscribe to our newsletter for updates on adoptable animals and rescue news
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showSuccess ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Thanks for subscribing! Check your email to confirm your subscription.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={subscribeMutation.isPending}
              data-testid="input-newsletter-email"
            />
            <Input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={subscribeMutation.isPending}
              data-testid="input-newsletter-name"
            />
            <Button 
              type="submit" 
              className="w-full"
              disabled={subscribeMutation.isPending}
              data-testid="button-newsletter-subscribe"
            >
              {subscribeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Mail className="h-4 w-4 mr-2" />
              Subscribe to Newsletter
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
