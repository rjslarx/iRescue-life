import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { copyTextToClipboard } from "@/lib/share";
import { Copy, Facebook, Share2 } from "lucide-react";

interface ContestantShareActionsProps {
  url: string;
  name: string;
}

export default function ContestantShareActions({ url, name }: ContestantShareActionsProps) {
  const { toast } = useToast();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const copy = async () => {
    try {
      await copyTextToClipboard(url);
      toast({ title: "Link copied", description: `Share ${name}'s contestant link anywhere.` });
    } catch (error) {
      toast({ title: "Could not copy link", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const share = async () => {
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      // URL-only: attaching an image/file can hide Facebook from the iOS share sheet.
      await navigator.share({ url });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copy();
    }
  };

  const facebook = async () => {
    if (isIOS) {
      // The Facebook web sharer may hand off to the app without the URL on iOS.
      await share();
      return;
    }
    const popup = window.open("", "_blank", "width=650,height=600");
    if (!popup) {
      await copy();
      return;
    }
    popup.opener = null;
    popup.location.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  };

  return (
    <div className="flex flex-wrap gap-2 w-full" role="group" aria-label={`Share ${name}`}>
      <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5 px-3" onClick={facebook} aria-label={`Share ${name} on Facebook`}>
        <Facebook className="h-4 w-4 shrink-0" /> Facebook
      </Button>
      <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5 px-3" onClick={share} aria-label={`Share ${name}`}>
        <Share2 className="h-4 w-4 shrink-0" /> Share
      </Button>
      <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5 px-3" onClick={copy} aria-label={`Copy link for ${name}`}>
        <Copy className="h-4 w-4 shrink-0" /> Copy link
      </Button>
    </div>
  );
}