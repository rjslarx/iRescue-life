import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Settings, Mail, DollarSign, PawPrint, ChevronRight, X } from "lucide-react";
import { Link } from "wouter";
import type { Tenant } from "@shared/schema";
import { useState } from "react";

interface OnboardingChecklistProps {
  tenant: Tenant;
  animalCount?: number;
  hasPlatformEmailKey?: boolean;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: React.ReactNode;
  actionLabel: string;
  actionLink: string;
}

export function OnboardingChecklist({ tenant, animalCount = 0, hasPlatformEmailKey = false }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false);

  // Define checklist items
  const items: ChecklistItem[] = [
    {
      id: "branding",
      title: "Customize Your Branding",
      description: "Add your organization's logo, colors, and contact information",
      completed: !!(tenant.logoUrl && tenant.branding),
      icon: <Settings className="h-4 w-4" />,
      actionLabel: "Go to Settings",
      actionLink: "/dashboard/settings",
    },
    {
      id: "email",
      title: "Set Up Email Service",
      description: "Configure email to send campaigns and newsletters",
      completed: tenant.resendEnabled || hasPlatformEmailKey, // True if tenant has own key OR platform key is available
      icon: <Mail className="h-4 w-4" />,
      actionLabel: "View Settings",
      actionLink: "/dashboard/settings",
    },
    {
      id: "payments",
      title: "Add Payment Integration",
      description: "Enable Stripe to accept donations",
      completed: tenant.stripeEnabled,
      icon: <DollarSign className="h-4 w-4" />,
      actionLabel: "Configure Payments",
      actionLink: "/dashboard/settings",
    },
    {
      id: "animals",
      title: "Add Your First Animal",
      description: "Start showcasing adoptable animals on your site",
      completed: animalCount > 0,
      icon: <PawPrint className="h-4 w-4" />,
      actionLabel: "Add Animal",
      actionLink: "/dashboard/animals",
    },
  ];

  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const isComplete = completedCount === totalCount;

  // Don't show if dismissed or fully complete
  if (dismissed || isComplete) {
    return null;
  }

  return (
    <Card className="border-primary/50 bg-primary/5" data-testid="card-onboarding-checklist">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">Welcome to iRescue.life! 🎉</CardTitle>
            <CardDescription className="mt-1">
              Complete these steps to get your rescue portal up and running
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 -mt-1 -mr-1"
            data-testid="button-dismiss-onboarding"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              {completedCount} of {totalCount} completed
            </span>
            <span className="font-medium">{Math.round((completedCount / totalCount) * 100)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
              data-testid="progress-onboarding"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              item.completed
                ? "bg-muted/50 border-muted"
                : "bg-background border-border hover-elevate"
            }`}
            data-testid={`checklist-item-${item.id}`}
          >
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-0.5">
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" data-testid={`icon-completed-${item.id}`} />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" data-testid={`icon-incomplete-${item.id}`} />
                )}
              </div>
              <div className="flex-1">
                <h4 className={`text-sm font-medium ${item.completed ? "text-muted-foreground" : ""}`}>
                  {item.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </div>
            {!item.completed && (
              <Link href={item.actionLink}>
                <Button variant="ghost" size="sm" className="ml-2" data-testid={`button-action-${item.id}`}>
                  {item.actionLabel}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
