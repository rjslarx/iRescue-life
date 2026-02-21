import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Stethoscope, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

interface NotificationCounts {
  pendingVetVisits: number;
  pendingComplianceReviews: number;
  total: number;
}

export default function NotificationBell() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<NotificationCounts>({
    queryKey: ["/api/notifications/counts"],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const total = data?.total || 0;
  const vetCount = data?.pendingVetVisits || 0;
  const complianceCount = data?.pendingComplianceReviews || 0;

  const handleVetClick = () => {
    setOpen(false);
    navigate("/dashboard/medical-pipeline?location=foster&tab=triage");
  };

  const handleComplianceClick = () => {
    setOpen(false);
    navigate("/dashboard/adopter-compliance");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1"
              data-testid="badge-notification-count"
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="p-3 border-b" data-testid="text-notifications-header">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {total === 0 && (
            <p className="text-xs text-muted-foreground mt-1">All caught up</p>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {vetCount > 0 && (
            <Button
              variant="ghost"
              onClick={handleVetClick}
              className="flex items-start gap-3 w-full h-auto p-3 text-left justify-start rounded-none border-b last:border-b-0"
              data-testid="notification-vet-visits"
            >
              <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Stethoscope className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 whitespace-normal">
                <p className="text-sm font-medium" data-testid="text-vet-visit-count">
                  {vetCount} Foster Vet Visit{vetCount !== 1 ? "s" : ""} require medical review
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Medical Pipeline &rarr; In Foster &rarr; Vet Visit Triage
                </p>
              </div>
            </Button>
          )}
          {complianceCount > 0 && (
            <Button
              variant="ghost"
              onClick={handleComplianceClick}
              className="flex items-start gap-3 w-full h-auto p-3 text-left justify-start rounded-none border-b last:border-b-0"
              data-testid="notification-compliance-reviews"
            >
              <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 whitespace-normal">
                <p className="text-sm font-medium" data-testid="text-compliance-count">
                  {complianceCount} Adopter Compliance document{complianceCount !== 1 ? "s" : ""} require approval
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adopter Compliance &rarr; Action Required
                </p>
              </div>
            </Button>
          )}
          {total === 0 && (
            <div className="p-6 text-center" data-testid="text-no-notifications">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No pending items</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
