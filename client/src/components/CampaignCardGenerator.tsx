import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Image, Heart, Loader2 } from "lucide-react";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import type { Animal } from "@shared/schema";

interface CampaignCardGeneratorProps {
  animal: Animal;
  campaignUrl: string;
  raised: number;
  goal: number | null;
  qrCodeUrl?: string | null;
  trigger?: React.ReactNode;
}

type CardStyle = 'modern' | 'classic' | 'urgent' | 'heartfelt';

const cardStyles: Record<CardStyle, {
  bgGradient: string;
  textColor: string;
  accentColor: string;
  label: string;
}> = {
  modern: {
    bgGradient: "from-blue-600 to-purple-600",
    textColor: "text-white",
    accentColor: "bg-white/20",
    label: "Modern",
  },
  classic: {
    bgGradient: "from-slate-700 to-slate-900",
    textColor: "text-white",
    accentColor: "bg-white/15",
    label: "Classic",
  },
  urgent: {
    bgGradient: "from-red-500 to-orange-500",
    textColor: "text-white",
    accentColor: "bg-white/20",
    label: "Urgent",
  },
  heartfelt: {
    bgGradient: "from-pink-500 to-rose-500",
    textColor: "text-white",
    accentColor: "bg-white/20",
    label: "Heartfelt",
  },
};

export function CampaignCardGenerator({
  animal,
  campaignUrl,
  raised,
  goal,
  qrCodeUrl,
  trigger,
}: CampaignCardGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<CardStyle>('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const progressPercentage = goal && goal > 0 
    ? Math.min((raised / goal) * 100, 100) 
    : 0;

  const style = cardStyles[selectedStyle];

  const downloadCard = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        allowTaint: true,
      });
      
      const link = document.createElement('a');
      link.download = `${animal.name.toLowerCase().replace(/\s+/g, '-')}-campaign-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast({
        title: "Card downloaded!",
        description: "Your campaign card has been saved.",
      });
    } catch (error) {
      console.error('Failed to generate card:', error);
      toast({
        title: "Download failed",
        description: "Could not generate the campaign card. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-generate-card">
            <Image className="h-4 w-4" />
            Create Share Card
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-campaign-card">
            <Image className="h-5 w-5" />
            Create Shareable Campaign Card
          </DialogTitle>
          <DialogDescription>
            Generate an attractive image to share on social media
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Style:</span>
            <Select value={selectedStyle} onValueChange={(v) => setSelectedStyle(v as CardStyle)}>
              <SelectTrigger className="w-40" data-testid="select-card-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(cardStyles).map(([key, { label }]) => (
                  <SelectItem key={key} value={key} data-testid={`select-item-${key}`}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div 
            ref={cardRef}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${style.bgGradient} p-6 ${style.textColor}`}
            style={{ aspectRatio: '1.91/1', maxWidth: '600px' }}
            data-testid="campaign-card-preview"
          >
            <div className="absolute inset-0 bg-black/10" />
            
            <div className="relative z-10 flex h-full gap-6">
              <div className="flex-shrink-0 w-1/3">
                {animal.photoUrls?.[0] ? (
                  <img
                    src={animal.photoUrls[0]}
                    alt={animal.name}
                    className="w-full h-full object-cover rounded-lg shadow-lg"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className={`w-full h-full rounded-lg ${style.accentColor} flex items-center justify-center`}>
                    <Heart className="w-12 h-12 opacity-50" />
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <Badge className={`${style.accentColor} ${style.textColor} border-0 mb-2`}>
                    Medical Fund Campaign
                  </Badge>
                  <h2 className="text-2xl font-bold mb-1">Help {animal.name}</h2>
                  <p className="text-sm opacity-90 mb-4">
                    {animal.species} needs your support for medical care
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">${raised.toLocaleString()} raised</span>
                    {goal && <span className="opacity-75">of ${goal.toLocaleString()} goal</span>}
                  </div>
                  <div className={`h-3 rounded-full ${style.accentColor} overflow-hidden`}>
                    <div 
                      className="h-full bg-white/90 rounded-full transition-all"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <p className="text-xs opacity-75 text-center">
                    {progressPercentage.toFixed(0)}% of goal reached
                  </p>
                </div>

                {qrCodeUrl && (
                  <div className="absolute bottom-4 right-4 bg-white p-1 rounded-lg shadow-lg">
                    <img src={qrCodeUrl} alt="QR Code" className="w-16 h-16" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 border-t">
            <Button 
              onClick={downloadCard} 
              disabled={isGenerating}
              className="gap-2"
              data-testid="button-download-card"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isGenerating ? "Generating..." : "Download Image"}
            </Button>

            <SocialShareButtons
              url={campaignUrl}
              title={`Help ${animal.name} with medical expenses! ${progressPercentage.toFixed(0)}% of goal reached.`}
              description={`${animal.name} needs your support for medical care. Every donation helps!`}
              animalName={animal.name}
              raised={raised}
              goal={goal || undefined}
              variant="horizontal"
              showLabel
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
