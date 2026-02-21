import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, PawPrint, Sparkles } from "lucide-react";

interface AboutUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTrial?: () => void;
}

export function AboutUsModal({ open, onOpenChange, onStartTrial }: AboutUsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-[#5B7B6B] flex items-center justify-center">
              <PawPrint className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="text-xl font-bold text-[#5B7B6B]">
              Why We Built This
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5 text-foreground">
          <p className="leading-relaxed">
            I started iRescue.life because I've stood where you stand. As a dedicated animal rescue volunteer, I saw how much time and energy was spent on logistics, paperwork, and trying to coordinate teams—time that I knew could be better spent caring for animals in need.
          </p>

          <p className="leading-relaxed">
            I realized that rescues didn't just need software; they needed a partner to help them navigate the complex world of nonprofit benefits and operational efficiency. I built iRescue.life to bridge that gap. We integrate powerful management features with tools that help you unlock and maximize the specific benefits available to nonprofits, all in one seamless experience.
          </p>

          <div className="bg-[#5B7B6B]/10 rounded-lg p-5 border border-[#5B7B6B]/20">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Heart className="h-5 w-5 text-[#5B7B6B]" />
              </div>
              <div>
                <h4 className="font-semibold text-[#5B7B6B] mb-2">Join Us</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  I am confident that iRescue.life will transform your operations. In fact, I believe the platform will pay for itself by ensuring you are utilizing every benefit at your disposal. Start your free 30-day trial today and let's get back to saving lives, together.
                </p>
              </div>
            </div>
          </div>

          {onStartTrial && (
            <div className="pt-2">
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onStartTrial();
                }}
                className="w-full bg-[#5B7B6B] hover:bg-[#4a6a5a] text-white"
                data-testid="button-start-trial-about"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Start Your Free 30-Day Trial
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
