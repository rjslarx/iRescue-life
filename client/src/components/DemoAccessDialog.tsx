import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface DemoAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoAccessDialog({ open, onOpenChange }: DemoAccessDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
  });

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/demo-requests", {
        leadType: "demo_access",
        email: data.email,
        fullName: data.fullName || undefined,
        landingPageUrl: window.location.href,
        referrer: document.referrer || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Access Granted!",
        description: "Opening demo site...",
      });
      
      // Open demo site in new tab using path-based routing
      // Use current hostname to support both production and dev environments
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      const demoUrl = `${protocol}//${hostname}/demo`;
      window.open(demoUrl, '_blank');
      
      // Close dialog and reset form
      onOpenChange(false);
      setTimeout(() => {
        setFormData({ email: "", fullName: "" });
      }, 300);
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address to access the demo.",
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate(formData);
  };

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setFormData({ email: "", fullName: "" });
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-demo-access">
        <DialogHeader>
          <DialogTitle data-testid="heading-demo-access">Try the Live Demo</DialogTitle>
          <DialogDescription>
            Enter your email to access our live demo site and explore the platform's features.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              data-testid="input-demo-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name (Optional)</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Smith"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              data-testid="input-demo-name"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={submitMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMutation.isPending}
              data-testid="button-submit-demo"
            >
              {submitMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {submitMutation.isPending ? "Submitting..." : "Access Demo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
