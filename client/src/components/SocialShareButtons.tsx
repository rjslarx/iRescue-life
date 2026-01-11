import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { 
  Facebook, 
  Twitter, 
  Linkedin, 
  Mail, 
  MessageSquare, 
  Link2, 
  Check,
  Share2,
  MessageCircle,
} from "lucide-react";

interface SocialShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  animalName?: string;
  raised?: number;
  goal?: number;
  variant?: 'horizontal' | 'vertical' | 'compact';
  showLabel?: boolean;
  className?: string;
}

interface SharePlatform {
  name: string;
  icon: React.ReactNode;
  color: string;
  getUrl: (params: ShareParams) => string;
}

interface ShareParams {
  url: string;
  title: string;
  description: string;
}

export function SocialShareButtons({
  url,
  title,
  description = "",
  animalName,
  raised,
  goal,
  variant = 'horizontal',
  showLabel = false,
  className = "",
}: SocialShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fundraisingContext = raised !== undefined && goal !== undefined
    ? `$${raised.toLocaleString()} raised of $${goal.toLocaleString()} goal. `
    : "";

  const fullDescription = `${fundraisingContext}${description}`;

  const shareParams: ShareParams = {
    url: encodeURIComponent(url),
    title: encodeURIComponent(title),
    description: encodeURIComponent(fullDescription),
  };

  const platforms: SharePlatform[] = [
    {
      name: "Facebook",
      icon: <Facebook className="h-4 w-4" />,
      color: "hover:bg-[#1877F2] hover:text-white",
      getUrl: (p) => `https://www.facebook.com/sharer/sharer.php?u=${p.url}&quote=${p.title}`,
    },
    {
      name: "Messenger",
      icon: <MessageCircle className="h-4 w-4" />,
      color: "hover:bg-[#0084FF] hover:text-white",
      getUrl: (p) => `fb-messenger://share/?link=${decodeURIComponent(p.url)}`,
    },
    {
      name: "Twitter",
      icon: <Twitter className="h-4 w-4" />,
      color: "hover:bg-[#1DA1F2] hover:text-white",
      getUrl: (p) => `https://twitter.com/intent/tweet?url=${p.url}&text=${p.title}`,
    },
    {
      name: "LinkedIn",
      icon: <Linkedin className="h-4 w-4" />,
      color: "hover:bg-[#0A66C2] hover:text-white",
      getUrl: (p) => `https://www.linkedin.com/sharing/share-offsite/?url=${p.url}`,
    },
    {
      name: "Email",
      icon: <Mail className="h-4 w-4" />,
      color: "hover:bg-gray-600 hover:text-white",
      getUrl: (p) => `mailto:?subject=${p.title}&body=${p.description}%0A%0A${p.url}`,
    },
    {
      name: "SMS",
      icon: <MessageSquare className="h-4 w-4" />,
      color: "hover:bg-green-600 hover:text-white",
      getUrl: (p) => `sms:?body=${p.title}%20${p.url}`,
    },
  ];

  const handleShare = (platform: SharePlatform) => {
    const shareUrl = platform.getUrl(shareParams);
    
    if (platform.name === "Email" || platform.name === "SMS") {
      window.location.href = shareUrl;
    } else if (platform.name === "Messenger") {
      // Try fb-messenger:// protocol first, fall back to messenger.com for desktop
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = shareUrl;
      } else {
        // Desktop fallback to Facebook's share dialog (which can include Messenger)
        const desktopUrl = `https://www.facebook.com/sharer/sharer.php?u=${shareParams.url}&quote=${shareParams.title}`;
        window.open(desktopUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
      }
    } else {
      window.open(shareUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
    }

    toast({
      title: `Sharing via ${platform.name}`,
      description: animalName 
        ? `Help spread the word about ${animalName}'s campaign!`
        : "Thank you for sharing!",
    });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link copied!",
        description: "Campaign link copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const containerClass = variant === 'vertical' 
    ? "flex flex-col gap-2" 
    : variant === 'compact'
    ? "flex flex-wrap gap-1"
    : "flex flex-wrap gap-2";

  const buttonSize = variant === 'compact' ? 'sm' : 'default';

  return (
    <div className={`${containerClass} ${className}`} data-testid="social-share-buttons">
      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
        <Share2 className="h-4 w-4" />
        <span>Share this campaign</span>
      </div>
      
      <div className={variant === 'vertical' ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
        {platforms.map((platform) => (
          <Tooltip key={platform.name}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={variant === 'compact' ? 'icon' : buttonSize}
                className={`transition-colors ${platform.color} ${variant !== 'compact' && showLabel ? 'gap-2' : ''}`}
                onClick={() => handleShare(platform)}
                data-testid={`button-share-${platform.name.toLowerCase()}`}
              >
                {platform.icon}
                {showLabel && variant !== 'compact' && <span>{platform.name}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share on {platform.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={variant === 'compact' ? 'icon' : buttonSize}
              className={`transition-colors ${variant !== 'compact' && showLabel ? 'gap-2' : ''}`}
              onClick={copyToClipboard}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
              {showLabel && variant !== 'compact' && <span>{copied ? "Copied!" : "Copy Link"}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? "Copied!" : "Copy link"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function ShareYourSupportPrompt({
  url,
  title,
  description,
  animalName,
  donorName,
  amount,
  onClose,
}: {
  url: string;
  title: string;
  description?: string;
  animalName?: string;
  donorName?: string;
  amount?: number;
  onClose?: () => void;
}) {
  const thankYouMessage = donorName 
    ? `Thank you, ${donorName}!` 
    : "Thank you for your donation!";

  const shareMessage = animalName
    ? `I just donated to help ${animalName}! Can you help too?`
    : "I just made a donation! Can you help too?";

  return (
    <div className="space-y-4 p-4 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 rounded-lg border" data-testid="share-your-support-prompt">
      <div className="text-center">
        <div className="text-4xl mb-2">💖</div>
        <h3 className="text-xl font-bold" data-testid="text-thank-you">{thankYouMessage}</h3>
        {amount && (
          <p className="text-muted-foreground">
            Your ${amount.toLocaleString()} donation makes a difference!
          </p>
        )}
      </div>

      <div className="border-t pt-4">
        <p className="text-center text-sm font-medium mb-3">
          Help us reach more supporters by sharing:
        </p>
        <SocialShareButtons
          url={url}
          title={shareMessage}
          description={description}
          animalName={animalName}
          variant="horizontal"
          showLabel={false}
          className="justify-center"
        />
      </div>

      {onClose && (
        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-share-prompt">
            Maybe later
          </Button>
        </div>
      )}
    </div>
  );
}
