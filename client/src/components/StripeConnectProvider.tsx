import { useState, useEffect, useCallback } from 'react';
import { ConnectComponentsProvider } from '@stripe/react-connect-js';
import { loadConnectAndInitialize, StripeConnectInstance } from '@stripe/connect-js';
import { Loader2, AlertCircle, Unplug } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface StripeConnectProviderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function StripeConnectProvider({ children, fallback }: StripeConnectProviderProps) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const response = await fetch('/api/stripe/connect-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || data.error || 'Failed to create session');
    }

    const data = await response.json();
    return data.clientSecret;
  }, []);

  useEffect(() => {
    const initializeStripeConnect = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
        if (!publishableKey) {
          throw new Error('Stripe public key not configured');
        }
        
        const instance = await loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret,
          appearance: {
            overlays: 'dialog',
            variables: {
              colorPrimary: '#0570de',
              colorBackground: '#ffffff',
              colorText: '#1a1a1a',
              colorDanger: '#df1b41',
              fontFamily: 'Inter, system-ui, sans-serif',
              borderRadius: '8px',
            },
          },
        });
        
        setStripeConnectInstance(instance);
      } catch (err: any) {
        console.error('[StripeConnectProvider] Initialization error:', err);
        setError(err.message || 'Failed to initialize Stripe Connect');
      } finally {
        setLoading(false);
      }
    };

    initializeStripeConnect();
  }, [fetchClientSecret]);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Connecting to Stripe...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Stripe Connection Error</AlertTitle>
        <AlertDescription className="mt-2">
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-3 block"
            onClick={() => window.location.reload()}
            data-testid="button-retry-stripe"
          >
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!stripeConnectInstance) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Unplug className="h-8 w-8 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Unable to connect to Stripe</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      {children}
    </ConnectComponentsProvider>
  );
}
