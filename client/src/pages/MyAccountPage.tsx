import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Phone, Mail, Lock, Bell, BellOff, Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

const contactSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ContactFormValues = z.infer<typeof contactSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function MyAccountPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    isSupported,
    isSubscribed,
    isLoading: pushLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      phone: user?.phone || "",
      email: user?.email || "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/me/profile", data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Profile updated",
        description: result.message || "Your changes have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContactSubmit = (values: ContactFormValues) => {
    const updates: Record<string, any> = {};
    if (values.email !== user?.email) updates.email = values.email;
    if ((values.phone || "") !== (user?.phone || "")) updates.phone = values.phone || null;

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes", description: "Nothing was changed." });
      return;
    }

    profileMutation.mutate(updates);
  };

  const handlePasswordSubmit = (values: PasswordFormValues) => {
    profileMutation.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          passwordForm.reset();
        },
      }
    );
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    try {
      if (enabled) {
        const success = await subscribe();
        if (success) {
          toast({
            title: "Notifications enabled",
            description: "You will now receive push notifications for broadcasts and alerts.",
          });
        } else {
          toast({
            title: "Could not enable notifications",
            description: permission === "denied"
              ? "Notifications are blocked in your browser settings. Please allow them and try again."
              : "Something went wrong. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        const success = await unsubscribe();
        if (success) {
          toast({
            title: "Notifications disabled",
            description: "You will no longer receive push notifications.",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update notification settings.",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <DashboardLayout title="My Account" description="Manage your contact information, password, and notification preferences.">
    <div className="max-w-2xl space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact Information
          </CardTitle>
          <CardDescription>Update your email address and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...contactForm}>
            <form onSubmit={contactForm.handleSubmit(handleContactSubmit)} className="space-y-4">
              <FormField
                control={contactForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        data-testid="input-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        data-testid="input-phone"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={profileMutation.isPending}
                data-testid="button-save-contact"
              >
                {profileMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your login password. You must enter your current password to confirm.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your current password"
                        data-testid="input-current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter new password (min 8 characters)"
                        data-testid="input-new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm your new password"
                        data-testid="input-confirm-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={profileMutation.isPending}
                data-testid="button-change-password"
              >
                {profileMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            Push Notifications
          </CardTitle>
          <CardDescription>
            Receive instant alerts for broadcasts, urgent requests, and important updates directly on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupported ? (
            <div className="text-sm text-muted-foreground" data-testid="text-push-not-supported">
              Push notifications are not supported on this browser or device.
            </div>
          ) : permission === "denied" ? (
            <div className="space-y-2" data-testid="text-push-denied">
              <p className="text-sm text-muted-foreground">
                Notifications are blocked by your browser. To enable them:
              </p>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Click the lock or info icon in your browser's address bar</li>
                <li>Find "Notifications" and change it to "Allow"</li>
                <li>Reload this page and try again</li>
              </ol>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="push-toggle" className="text-sm font-medium">
                  Enable push notifications
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSubscribed
                    ? "You are receiving push notifications on this device."
                    : "Turn on to receive broadcast messages and alerts."}
                </p>
              </div>
              <Switch
                id="push-toggle"
                checked={isSubscribed}
                onCheckedChange={handleToggleNotifications}
                disabled={pushLoading}
                data-testid="switch-push-notifications"
              />
            </div>
          )}
          {isSubscribed && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
              <span className="text-xs text-muted-foreground">on this device</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );

}
