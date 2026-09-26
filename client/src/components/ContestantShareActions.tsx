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

  return (
    <div className="flex flex-nowrap items-center justify-center gap-1 w-full" role="group" aria-label={`Share ${name}`}>
      <Button asChild variant="ghost" size="icon" className="h-10 w-10 shrink-0">
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on Facebook"
          aria-label={`Share ${name} on Facebook`}
          onClick={(event) => {
            if (isIOS) {
              // URL-only native sharing avoids Facebook's unreliable iOS web handoff.
              event.preventDefault();
              void share();
            }
          }}
        >
          <Facebook className="h-4 w-4" />
        </a>
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={share} title="Share" aria-label={`Share ${name}`}>
        <Share2 className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={copy} title="Copy link" aria-label={`Copy link for ${name}`}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}