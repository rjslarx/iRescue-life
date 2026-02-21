import { useState } from "react";
import { Plus, X, Heart, DollarSign, FileText, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
}

interface FloatingActionButtonProps {
  onRecordDonation?: () => void;
}

export function FloatingActionButton({ onRecordDonation }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions: QuickAction[] = [
    {
      label: "Add Animal",
      icon: PawPrint,
      href: "/dashboard/animals?action=add",
    },
    {
      label: "Record Donation",
      icon: DollarSign,
      onClick: () => {
        setIsOpen(false);
        onRecordDonation?.();
      },
    },
    {
      label: "New Application",
      icon: FileText,
      href: "/dashboard/applications",
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      {isOpen && (
        <div className="flex flex-col-reverse gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actions.map((action, index) => (
            action.href ? (
              <Link key={index} href={action.href}>
                <Button
                  variant="secondary"
                  className="shadow-lg gap-2 pr-4"
                  onClick={() => setIsOpen(false)}
                  data-testid={`fab-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button
                key={index}
                variant="secondary"
                className="shadow-lg gap-2 pr-4"
                onClick={action.onClick}
                data-testid={`fab-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
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
