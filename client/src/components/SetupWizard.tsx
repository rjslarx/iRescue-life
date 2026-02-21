import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  Building2,
  Palette,
  Mail,
  Globe,
  Heart,
  Users,
  Settings,
  Rocket,
  Cloud
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import WelcomeStep from "./wizard/WelcomeStep";
import BasicInfoStep from "./wizard/BasicInfoStep";
import BrandingStep from "./wizard/BrandingStep";
import EmailConfigStep from "./wizard/EmailConfigStep";
import GoogleWorkspaceStep from "./wizard/GoogleWorkspaceStep";
import DomainStep from "./wizard/DomainStep";
import FirstAnimalStep from "./wizard/FirstAnimalStep";
import TeamStep from "./wizard/TeamStep";
import ReviewStep from "./wizard/ReviewStep";

interface StepDef {
  id: number;
  title: string;
  description: string;
  icon: any;
  component: any;
  proOnly?: boolean;
}

const ALL_STEPS: StepDef[] = [
  {
    id: 0,
    title: "Welcome",
    description: "Let's get started",
    icon: Sparkles,
    component: WelcomeStep,
  },
  {
    id: 1,
    title: "Basic Info",
    description: "Organization details",
    icon: Building2,
    component: BasicInfoStep,
  },
  {
    id: 2,
    title: "Branding",
    description: "Logo & colors",
    icon: Palette,
    component: BrandingStep,
  },
  {
    id: 3,
    title: "Email",
    description: "Configure email",
    icon: Mail,
    component: EmailConfigStep,
  },
  {
    id: 4,
    title: "Google Workspace",
    description: "Connect (optional)",
    icon: Cloud,
    component: GoogleWorkspaceStep,
  },
  {
    id: 5,
    title: "Domain",
    description: "Custom domain (optional)",
    icon: Globe,
    component: DomainStep,
  },
  {
    id: 6,
    title: "First Animal",
    description: "Add your first animal",
    icon: Heart,
    component: FirstAnimalStep,
  },
  {
    id: 7,
    title: "Team",
    description: "Invite team members",
    icon: Users,
    component: TeamStep,
  },
  {
    id: 8,
    title: "Review",
    description: "Review & launch",
    icon: Rocket,
    component: ReviewStep,
  },
];

interface SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SetupWizard({ open, onOpenChange }: SetupWizardProps) {
  const { toast } = useToast();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const { data: tenantData } = useQuery<{ tenant: { subscriptionTier?: string } }>({
    queryKey: ['/api/tenant'],
    enabled: open,
  });

  const isLite = !tenantData?.tenant?.subscriptionTier || 
    tenantData.tenant.subscriptionTier === 'lite' || 
    tenantData.tenant.subscriptionTier === 'free';

  const steps = useMemo(() => {
    if (isLite) {
      return ALL_STEPS.filter(s => !s.proOnly);
    }
    return ALL_STEPS;
  }, [isLite]);

  const { data: wizardStatus, isLoading } = useQuery<{
    wizardCompleted: boolean;
    wizardStep: number;
    wizardSkipped: boolean;
  }>({
    queryKey: ['/api/wizard/status'],
    enabled: open,
  });

  useEffect(() => {
    if (wizardStatus && !isLoading) {
      const serverStep = wizardStatus.wizardStep;
      const clampedStep = Math.min(serverStep, steps.length - 1);
      setCurrentStepIndex(clampedStep);
    }
  }, [wizardStatus, isLoading, steps.length]);

  const updateStepMutation = useMutation({
    mutationFn: async (step: number) => {
      const response = await apiRequest("PATCH", "/api/wizard/step", { step });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wizard/status'] });
    },
  });

  const completeWizardMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wizard/complete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wizard/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Setup Complete!",
        description: "Your rescue site is now ready to launch.",
      });
      onOpenChange(false);
    },
  });

  const skipWizardMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wizard/skip");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wizard/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Wizard Skipped",
        description: "You can access setup options from Settings.",
      });
      onOpenChange(false);
    },
  });

  const handleNext = async () => {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      await updateStepMutation.mutateAsync(nextIndex);
    } else {
      await completeWizardMutation.mutateAsync();
    }
  };

  const handleBack = async () => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1;
      setCurrentStepIndex(prevIndex);
      await updateStepMutation.mutateAsync(prevIndex);
    }
  };

  const handleSkip = async () => {
    await skipWizardMutation.mutateAsync();
  };

  const progress = ((currentStepIndex + 1) / steps.length) * 100;
  const CurrentStepComponent = steps[currentStepIndex]?.component;

  if (isLoading || !CurrentStepComponent) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col" data-testid="dialog-setup-wizard">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Welcome to iRescue.life
          </DialogTitle>
          <DialogDescription>
            {isLite
              ? "Let's set up your Lite rescue portal in a few quick steps"
              : "Let's set up your Professional rescue portal"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 shrink-0">
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="font-medium">{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex flex-col items-center gap-1 min-w-[80px]",
                    isActive && "opacity-100",
                    !isActive && !isCompleted && "opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                      isCompleted && "bg-primary border-primary text-primary-foreground",
                      isActive && "border-primary text-primary",
                      !isActive && !isCompleted && "border-border"
                    )}
                    data-testid={`step-indicator-${index}`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs text-center font-medium hidden sm:block",
                    isActive && "text-foreground",
                    !isActive && "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          <CurrentStepComponent onNext={handleNext} />
        </div>

        <div className="flex items-center justify-between gap-4 p-6 border-t bg-muted/20 shrink-0">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={updateStepMutation.isPending || completeWizardMutation.isPending}
            data-testid="button-skip-wizard"
          >
            Skip Setup
          </Button>
          
          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={updateStepMutation.isPending}
                data-testid="button-wizard-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            
            <Button
              onClick={handleNext}
              disabled={updateStepMutation.isPending || completeWizardMutation.isPending}
              data-testid="button-wizard-next"
            >
              {currentStepIndex === steps.length - 1 ? (
                <>
                  Complete Setup
                  <Rocket className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
