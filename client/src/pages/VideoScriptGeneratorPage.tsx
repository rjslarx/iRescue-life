import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Video, Copy, Download, Sparkles } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const FEATURES = [
  "Animal Management",
  "Kennel Management",
  "Adoption Pipeline",
  "Medical Records",
  "Foster Care",
  "Fundraising",
  "Volunteer Management",
  "Happy Tails",
  "Communications",
  "Contacts",
  "E-Signatures",
  "Supplies & Expenditures",
  "Events",
  "Documents & AI Import",
  "TNR Log",
  "Grants Dashboard",
  "Help & Training",
  "Adopter Compliance",
  "Network Transfers",
  "Settings & Configuration",
  "Public Website",
  "Emergency Medical Fund",
];

export default function VideoScriptGeneratorPage() {
  const { toast } = useToast();
  const [selectedFeature, setSelectedFeature] = useState<string>("");
  const [customNotes, setCustomNotes] = useState("");
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (data: { feature: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/tools/generate-video-script", data);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedScript(data.script);
      toast({ title: "Script generated", description: "Your how-to video script is ready below." });
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message || "Could not generate script.", variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    if (!selectedFeature) {
      toast({ title: "Select a feature", description: "Please choose a feature topic first.", variant: "destructive" });
      return;
    }
    setGeneratedScript(null);
    generateMutation.mutate({ feature: selectedFeature, notes: customNotes || undefined });
  };

  const handleCopy = async () => {
    if (!generatedScript) return;
    try {
      await navigator.clipboard.writeText(generatedScript);
      toast({ title: "Copied", description: "Script copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    if (!generatedScript) return;
    const safeName = selectedFeature.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([generatedScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-script-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Help & Training", href: "/dashboard/tutorials" },
        { label: "Video Script Generator" },
      ]}
    >
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Video Script Generator</h1>
          <p className="text-muted-foreground mt-1">
            Generate professional how-to video scripts for any platform feature using AI.
          </p>
        </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Generate a Script
          </CardTitle>
          <CardDescription>
            Pick a feature, optionally add notes to guide the content, and let AI write a ready-to-record script.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feature-select">Feature Topic</Label>
            <Select value={selectedFeature} onValueChange={setSelectedFeature}>
              <SelectTrigger id="feature-select" data-testid="select-feature-topic">
                <SelectValue placeholder="Choose a feature..." />
              </SelectTrigger>
              <SelectContent>
                {FEATURES.map((f) => (
                  <SelectItem key={f} value={f} data-testid={`option-feature-${f.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-notes">Additional Notes (optional)</Label>
            <Textarea
              id="custom-notes"
              data-testid="input-custom-notes"
              placeholder="E.g., 'Focus on the fast-track adoption option' or 'This is for new foster parents'"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedFeature || generateMutation.isPending}
            data-testid="button-generate-script"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Video className="h-4 w-4 mr-2" />
                Generate Script
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {generateMutation.isPending && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>AI is writing your script... This usually takes 15-30 seconds.</p>
          </CardContent>
        </Card>
      )}

      {generatedScript && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle data-testid="text-script-title">
                Script: {selectedFeature}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy-script">
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-script">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed bg-muted/50 rounded-md p-4"
              data-testid="text-generated-script"
            >
              {generatedScript}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </DashboardLayout>
  );
}
