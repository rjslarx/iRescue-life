import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Sparkles, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface AdCopyResult {
  headlines: string[];
  descriptions: string[];
}

interface AdCopyGeneratorDialogProps {
  animal: {
    id: string;
    name: string;
    species: string;
    bio?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdCopyGeneratorDialog({ animal, open, onOpenChange }: AdCopyGeneratorDialogProps) {
  const { toast } = useToast();
  const [adCopy, setAdCopy] = useState<AdCopyResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!animal) throw new Error("No animal selected");
      
      // apiRequest already throws on non-OK responses via throwIfResNotOk
      const response = await apiRequest('POST', `/api/animals/${animal.id}/generate-ad-copy`, {});
      return response.json() as Promise<{ success: boolean; adCopy: AdCopyResult }>;
    },
    onSuccess: (data) => {
      if (data.success && data.adCopy) {
        setAdCopy(data.adCopy);
        toast({
          title: "Ad copy generated",
          description: `Created ${data.adCopy.headlines.length} headlines and ${data.adCopy.descriptions.length} descriptions for ${animal?.name}.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate ad copy",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Ad copy copied successfully.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try copying manually.",
        variant: "destructive",
      });
    }
  };

  const handleCopyAll = async () => {
    if (!adCopy) return;
    
    const allText = [
      "HEADLINES:",
      ...adCopy.headlines.map((h, i) => `${i + 1}. ${h}`),
      "",
      "DESCRIPTIONS:",
      ...adCopy.descriptions.map((d, i) => `${i + 1}. ${d}`),
    ].join("\n");
    
    try {
      await navigator.clipboard.writeText(allText);
      toast({
        title: "All ad copy copied",
        description: "All headlines and descriptions copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try copying manually.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setAdCopy(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Ad Copy Generator
          </DialogTitle>
          <DialogDescription>
            Generate Google Ads Grant compliant ad copy for {animal?.name}. 
            All headlines are 30 characters or less with no single-word keywords.
          </DialogDescription>
        </DialogHeader>

        {!adCopy ? (
          <div className="py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-medium text-lg mb-2">Generate Ad Copy for {animal?.name}</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Our AI will create Google Ads Grant compliant headlines and descriptions 
              optimized for high click-through rates and nonprofit compliance.
            </p>
            <Button 
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Ad Copy
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Headlines</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Max 30 chars
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {adCopy.headlines.map((headline, index) => (
                  <div 
                    key={`headline-${index}`}
                    className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{headline}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({headline.length}/30)
                      </span>
                      {headline.length > 30 && (
                        <AlertTriangle className="inline h-3 w-3 text-destructive ml-1" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleCopy(headline, `headline-${index}`)}
                      data-testid={`button-copy-headline-${index}`}
                    >
                      {copiedIndex === `headline-${index}` ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Descriptions</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Max 90 chars
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {adCopy.descriptions.map((description, index) => (
                  <div 
                    key={`desc-${index}`}
                    className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{description}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({description.length}/90)
                      </span>
                      {description.length > 90 && (
                        <AlertTriangle className="inline h-3 w-3 text-destructive ml-1" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleCopy(description, `desc-${index}`)}
                      data-testid={`button-copy-description-${index}`}
                    >
                      {copiedIndex === `desc-${index}` ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-regenerate-ad-copy"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Regenerate
              </Button>
              <Button onClick={handleCopyAll} data-testid="button-copy-all-ad-copy">
                <Copy className="mr-2 h-4 w-4" />
                Copy All
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdCopyGeneratorDialog;
