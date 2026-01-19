import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useQuickActions } from "@/hooks/useQuickActions";

interface FloatingActionButtonProps {
  onRecordDonation?: () => void;
}

export function FloatingActionButton({ onRecordDonation }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { actions, handleAction } = useQuickActions({ onRecordDonation });

  const handleActionClick = (actionId: string) => {
    setIsOpen(false);
    handleAction(actionId);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      {isOpen && (
        <div className="flex flex-col-reverse gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actions.map((action) => (
            action.href ? (
              <Link key={action.id} href={action.href}>
                <Button
                  variant="secondary"
                  className="shadow-lg gap-2 pr-4"
                  onClick={() => setIsOpen(false)}
                  data-testid={`fab-action-${action.id}`}
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button
                key={action.id}
                variant="secondary"
                className="shadow-lg gap-2 pr-4"
                onClick={() => handleActionClick(action.id)}
                data-testid={`fab-action-${action.id}`}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Button>
            )
          ))}
        </div>
      )}

      <Button
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-transform duration-200",
          isOpen && "rotate-45"
        )}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="fab-toggle"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
