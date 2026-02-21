import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle } from "lucide-react";
import { TermsOfServiceModal } from "./TermsOfServiceModal";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";

interface DemoRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoRequestModal({ open, onOpenChange }: DemoRequestModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    organizationName: "",
    phone: "",
    message: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/demo-requests", data);
      return response;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request Submitted!",
        description: "We'll be in touch shortly with demo access details.",
      });
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
    submitMutation.mutate(formData);
  };

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    // Reset form after closing
    if (!isOpen) {
      setTimeout(() => {
        setFormData({
          fullName: "",
          email: "",
          organizationName: "",
          phone: "",
          message: "",
        });
        setAgreedToTerms(false);
        setSubmitted(false);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-demo-request">
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>Request a Demo</DialogTitle>
              <DialogDescription>
                Fill out the form below and we'll send you personalized demo access with sample data.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  data-testid="input-full-name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="john@rescue.org"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationName">
                  Organization Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="organizationName"
                  data-testid="input-organization"
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  required
                  placeholder="Happy Paws Rescue"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  data-testid="input-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Additional Information (Optional)</Label>
                <Textarea
                  id="message"
                  data-testid="input-message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Tell us about your rescue and what you're looking for..."
                  rows={3}
                />
              </div>

              <div className="flex items-start space-x-3 pt-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  data-testid="checkbox-agree-terms"
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setTermsModalOpen(true)}
                      className="text-[#5B7B6B] hover:underline font-medium"
                      data-testid="link-terms-in-form"
                    >
                      Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setPrivacyModalOpen(true)}
                      className="text-[#5B7B6B] hover:underline font-medium"
                      data-testid="link-privacy-in-form"
                    >
                      Privacy Policy
                    </button>
                    <span className="text-destructive"> *</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="flex-1"
                  data-testid="button-cancel"
                  disabled={submitMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  data-testid="button-submit-demo-request"
                  disabled={submitMutation.isPending || !agreedToTerms}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Request Demo"
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <DialogHeader>
              <DialogTitle>Thank You!</DialogTitle>
              <DialogDescription className="text-base space-y-2">
                <p>
                  We've received your demo request for <strong>{formData.organizationName}</strong>.
                </p>
                <p>
                  We'll send demo details to <strong>{formData.email}</strong> within 24 hours.
                </p>
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => handleClose(false)} className="w-full" data-testid="button-close">
              Close
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Nested modals for Terms and Privacy */}
      <TermsOfServiceModal 
        open={termsModalOpen} 
        onOpenChange={setTermsModalOpen}
      />
      <PrivacyPolicyModal 
        open={privacyModalOpen} 
        onOpenChange={setPrivacyModalOpen}
      />
    </Dialog>
  );
}
