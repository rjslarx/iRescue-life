import { useState, useEffect } from "react";
import { X, Share, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface IOSInstallPromptProps {
  onDismiss?: () => void;
  compact?: boolean;
}

export function IOSInstallPrompt({ onDismiss, compact = false }: IOSInstallPromptProps) {
  const [isIOS, setIsIOS] = useState(false);
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);
    
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone === true;
    const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsInStandaloneMode(isStandalone || isDisplayModeStandalone);

    const dismissedKey = 'ios-install-prompt-dismissed';
    const dismissedTime = localStorage.getItem(dismissedKey);
    if (dismissedTime) {
      const dismissedDate = new Date(parseInt(dismissedTime));
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setIsDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('ios-install-prompt-dismissed', Date.now().toString());
    setIsDismissed(true);
    onDismiss?.();
  };

  if (!isIOS || isInStandaloneMode || isDismissed) {
    return null;
  }

  if (compact) {
    return (
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Install the App</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap <Share className="inline h-3 w-3" /> then "Add to Home Screen" for the best experience
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8"
            onClick={handleDismiss}
            data-testid="button-dismiss-ios-prompt-compact"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={handleDismiss}
        data-testid="button-dismiss-ios-prompt"
      >
        <X className="h-4 w-4" />
      </Button>
      
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Install Pet Portal</CardTitle>
            <CardDescription>Get instant medication reminders</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Install this app on your iPhone for the best experience, including push notifications for medication reminders.
        </p>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-primary">
              1
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-medium">Tap the Share button</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Look for <Share className="inline h-3 w-3 mx-0.5" /> at the bottom of Safari
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-primary">
              2
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-medium">Scroll down and tap "Add to Home Screen"</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Look for <Plus className="inline h-3 w-3 mx-0.5" /> Add to Home Screen
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-primary">
              3
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-medium">Tap "Add" to confirm</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The app will appear on your home screen
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-4">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            <strong>Important:</strong> Push notifications require the app to be installed on your home screen. Browser notifications are not supported on iOS.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AndroidInstallPrompt({ onDismiss }: { onDismiss?: () => void }) {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/.test(userAgent);
    setIsAndroid(isAndroidDevice);
    
    const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsInStandaloneMode(isDisplayModeStandalone);

    const dismissedKey = 'android-install-prompt-dismissed';
    const dismissedTime = localStorage.getItem(dismissedKey);
    if (dismissedTime) {
      const dismissedDate = new Date(parseInt(dismissedTime));
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setIsDismissed(true);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsDismissed(true);
      }
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('android-install-prompt-dismissed', Date.now().toString());
    setIsDismissed(true);
    onDismiss?.();
  };

  if (!isAndroid || isInStandaloneMode || isDismissed || !deferredPrompt) {
    return null;
  }

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Install Pet Portal</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get push notifications for medication reminders
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleInstall}
            data-testid="button-install-android"
          >
            Install
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDismiss}
            data-testid="button-dismiss-android-prompt"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PWAInstallPrompt({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <IOSInstallPrompt compact={compact} />
      <AndroidInstallPrompt />
    </>
  );
}
