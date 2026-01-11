import { AlertTriangle, Info, AlertCircle, X, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AnnouncementBarProps {
  text: string;
  linkText?: string;
  linkUrl?: string;
  style?: "info" | "warning" | "urgent";
  dismissible?: boolean;
}

export default function AnnouncementBar({
  text,
  linkText,
  linkUrl,
  style = "info",
  dismissible = true
}: AnnouncementBarProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || !text) return null;

  const styleClasses = {
    info: "bg-blue-600 text-white",
    warning: "bg-amber-500 text-black",
    urgent: "bg-red-600 text-white"
  };

  const iconClasses = {
    info: "text-white/90",
    warning: "text-black/80",
    urgent: "text-white/90"
  };

  const linkClasses = {
    info: "text-white/90 hover:text-white underline underline-offset-2",
    warning: "text-black/80 hover:text-black underline underline-offset-2",
    urgent: "text-white/90 hover:text-white underline underline-offset-2"
  };

  const dismissClasses = {
    info: "text-white/70 hover:text-white hover:bg-white/10",
    warning: "text-black/60 hover:text-black hover:bg-black/10",
    urgent: "text-white/70 hover:text-white hover:bg-white/10"
  };

  const Icon = style === "urgent" ? AlertTriangle : style === "warning" ? AlertCircle : Info;

  // Don't manually prepend basePath - wouter's Router base handles this automatically
  const isExternalLink = linkUrl?.startsWith("http");

  return (
    <div 
      className={cn(
        "relative w-full py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium",
        styleClasses[style]
      )}
      data-testid="announcement-bar"
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", iconClasses[style])} />
      <span className="text-center">{text}</span>
      {linkText && linkUrl && (
        isExternalLink ? (
          <a 
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("inline-flex items-center gap-1", linkClasses[style])}
            data-testid="link-announcement-action"
          >
            {linkText}
            <ChevronRight className="h-3 w-3" />
          </a>
        ) : (
          <Link 
            href={linkUrl}
            className={cn("inline-flex items-center gap-1", linkClasses[style])}
            data-testid="link-announcement-action"
          >
            {linkText}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )
      )}
      {dismissible && (
        <button
          onClick={() => setIsDismissed(true)}
          className={cn(
            "absolute right-2 p-1 rounded transition-colors",
            dismissClasses[style]
          )}
          aria-label="Dismiss announcement"
          data-testid="button-dismiss-announcement"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
