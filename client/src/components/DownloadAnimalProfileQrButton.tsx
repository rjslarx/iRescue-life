import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadAnimalProfileQr } from "@/lib/animal-profile-qr";
import { cn } from "@/lib/utils";

interface DownloadAnimalProfileQrButtonProps {
  animal: { id: string; name: string };
  basePath: string;
  className?: string;
}

export function DownloadAnimalProfileQrButton({ animal, basePath, className }: DownloadAnimalProfileQrButtonProps) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const downloading = useRef(false);

  const handleDownload = async () => {
    if (downloading.current) return;
    downloading.current = true;
    setPending(true);
    const feedback = toast({
      title: "Preparing profile QR code",
      description: "Creating a print-ready PNG for this animal's public profile.",
    });
    try {
      await downloadAnimalProfileQr(basePath, animal.id, animal.name);
      feedback.update({
        id: feedback.id,
        title: "Profile QR code download started",
        description: "1024px PNG ready for mailers. Visitors can view the profile only while this animal is eligible for public adoption listing. Downloading does not make a private record public.",
      });
    } catch {
      feedback.update({
        id: feedback.id,
        title: "Could not download profile QR code",
        description: "Please try again. No animal information or visibility settings were changed.",
        variant: "destructive",
      });
    } finally {
      downloading.current = false;
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-auto min-h-9 min-w-0 justify-center whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm", className)}
      onClick={handleDownload}
      disabled={pending}
      aria-busy={pending}
      title="Download a printable PNG linking to the public profile. Public adoption eligibility still applies."
      data-testid={`button-download-profile-qr-${animal.id}`}
    >
      <Download className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{pending ? "Preparing Profile QR Code…" : "Download Profile QR Code"}</span>
    </Button>
  );
}
