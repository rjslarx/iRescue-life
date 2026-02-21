import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, Smartphone } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function NotificationSettings() {
  const { user } = useAuth();
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();
  const { toast } = useToast();

  const handleToggleNotifications = async (enabled: boolean) => {
    try {
      if (enabled) {
        const success = await subscribe();
        if (success) {
          toast({
            title: 'Notifications Enabled',
            description: 'You will now receive push notifications for urgent updates.',
          });
        } else {
          toast({
            title: 'Failed to Enable Notifications',
            description: permission === 'denied' 
              ? 'Please enable notifications in your browser settings.'
              : 'Could not enable notifications. Please try again.',
            variant: 'destructive',
          });
        }
      } else {
        const success = await unsubscribe();
        if (success) {
          toast({
            title: 'Notifications Disabled',
            description: 'You will no longer receive push notifications.',
          });
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update notification settings.',
        variant: 'destructive',
      });
    }
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
      toast({
        title: 'Test Notification Sent',
        description: 'Check your device for the test notification.',
      });
    } catch (error) {
      toast({
        title: 'Failed to Send Test',
        description: 'Could not send test notification.',
        variant: 'destructive',
      });
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Push Notifications Not Supported
          </CardTitle>
          <CardDescription>
            Your browser does not support push notifications. Try using a modern browser like Chrome, Firefox, or Safari.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Receive instant notifications for urgent updates about animals in your care.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="notifications-toggle" className="text-base">
              Enable Push Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Get notified about medical alerts, supply requests, and important updates
            </p>
          </div>
          <Switch
            id="notifications-toggle"
            data-testid="switch-push-notifications"
            checked={isSubscribed}
            onCheckedChange={handleToggleNotifications}
            disabled={isLoading}
          />
        </div>

        {isSubscribed && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Smartphone className="h-3 w-3" />
                Active on this device
              </Badge>
            </div>

            {user?.roles.includes('admin') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                disabled={isLoading}
                data-testid="button-test-notification"
              >
                Send Test Notification
              </Button>
            )}
          </div>
        )}

        {permission === 'denied' && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">
              Notifications are blocked. Please enable them in your browser settings.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Notification preferences are saved per device and browser.
      </CardFooter>
    </Card>
  );
}
