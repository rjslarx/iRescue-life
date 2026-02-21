import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Sparkles, Check, X, Plus, Wand2 } from "lucide-react";

const SUGGESTED_TAGS = [
  "Playful",
  "Energetic",
  "Calm",
  "Affectionate",
  "Loyal",
  "Curious",
  "Gentle",
  "Smart",
  "Good with Kids",
  "Good with Dogs",
  "Good with Cats",
  "House Trained",
  "Leash Trained",
  "Loves Cuddles",
  "Independent",
  "Shy at First",
  "Food Motivated",
  "Toy Lover",
  "Couch Potato",
  "Adventure Buddy",
];

interface AnimalData {
  id?: string;
  name: string;
  species: string;
  breed?: string;
  age?: string;
  sex?: string;
  childFriendly?: boolean | null;
  dogFriendly?: boolean | null;
  catFriendly?: boolean | null;
  specialNeeds?: boolean | null;
  bio?: string;
}

interface AiBioGeneratorDialogProps {
  animal: AnimalData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBioGenerated?: (bio: string) => void;
}

export function AiBioGeneratorDialog({ animal, open, onOpenChange, onBioGenerated }: AiBioGeneratorDialogProps) {
  const { toast } = useToast();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [generatedBio, setGeneratedBio] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedTags([]);
      setCustomTag("");
      setGeneratedBio(null);
      setCopied(false);
    }
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!animal) throw new Error("No animal selected");
      if (selectedTags.length === 0) throw new Error("Please select at least one personality tag");
      
      // Use the ID-based endpoint for existing animals, or the generic endpoint for new animals
      if (animal.id) {
        const response = await apiRequest('POST', `/api/animals/${animal.id}/generate-bio`, {
          tags: selectedTags,
        });
        return response.json() as Promise<{ success: boolean; bio: string }>;
      } else {
        // For new animals (no ID yet), use the generic endpoint with animal data
        const response = await apiRequest('POST', '/api/generate-bio', {
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          age: animal.age,
          sex: animal.sex,
          childFriendly: animal.childFriendly,
          dogFriendly: animal.dogFriendly,
          catFriendly: animal.catFriendly,
          specialNeeds: animal.specialNeeds,
          tags: selectedTags,
        });
        return response.json() as Promise<{ success: boolean; bio: string }>;
      }
    },
    onSuccess: (data) => {
      if (data.success && data.bio) {
        setGeneratedBio(data.bio);
        toast({
          title: "Bio generated",
          description: `Created a Petfinder-ready bio for ${animal?.name}.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate bio",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
      setCustomTag("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTag();
    }
  };

  const handleCopy = async () => {
    if (!generatedBio) return;
    try {
      await navigator.clipboard.writeText(generatedBio);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Bio copied successfully.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try copying manually.",
        variant: "destructive",
      });
    }
  };

  const handleUseBio = () => {
    if (generatedBio && onBioGenerated) {
      onBioGenerated(generatedBio);
      toast({
        title: "Bio applied",
        description: "The generated bio has been applied to the animal profile.",
      });
      onOpenChange(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedBio(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            AI Bio Generator
          </DialogTitle>
          <DialogDescription>
            Select personality tags for {animal?.name} and let AI create a heartwarming Petfinder-ready bio.
          </DialogDescription>
        </DialogHeader>

        {!generatedBio ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-3">Selected Tags ({selectedTags.length})</h4>
              <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-3 border rounded-lg bg-muted/30">
                {selectedTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Click tags below to select...</span>
                ) : (
                  selectedTags.map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="default"
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleTag(tag)}
                      data-testid={`badge-selected-tag-${tag.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-3">Suggested Tags</h4>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TAGS.filter(tag => !selectedTags.includes(tag)).map((tag) => (
                  <Badge 
                    key={tag} 
                    variant="outline"
                    className="cursor-pointer hover-elevate"
                    onClick={() => toggleTag(tag)}
                    data-testid={`badge-suggested-tag-${tag.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Add Custom Tag</h4>
              <div className="flex gap-2">
                <Input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a custom personality trait..."
                  data-testid="input-custom-tag"
                />
                <Button 
                  variant="outline" 
                  onClick={addCustomTag}
                  disabled={!customTag.trim()}
                  data-testid="button-add-custom-tag"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || selectedTags.length === 0}
                data-testid="button-generate-bio"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Bio
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Tags used:</span>
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="relative">
              <Textarea
                value={generatedBio}
                readOnly
                className="min-h-[200px] pr-12 text-sm leading-relaxed"
                data-testid="textarea-generated-bio"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleCopy}
                data-testid="button-copy-bio"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              This bio is ready to copy to Petfinder or other adoption platforms.
            </p>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleRegenerate}>
                <Sparkles className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Bio
              </Button>
              {onBioGenerated && (
                <Button onClick={handleUseBio} data-testid="button-use-bio">
                  <Check className="mr-2 h-4 w-4" />
                  Use This Bio
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
