import { useEffect, useState } from "react";
import { CalendarDays, HelpCircle, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";

type RequestType = "question" | "meet_and_greet";

export function AnimalInquiryDialog({ animalId, animalName, open, onOpenChange }: {
  animalId: string;
  animalName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [requestType, setRequestType] = useState<RequestType>("question");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"email" | "phone">("email");
  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("");
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", `/api/public/animals/${animalId}/inquiries`, {
        requestType, name, email, phone: phone || null, preferredContact, message,
        availability: requestType === "meet_and_greet" ? availability : null,
        website,
      });
      const result = await response.json();
      setSuccess(result.message);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not send your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ask about {animalName}</DialogTitle>
          <DialogDescription>Send the rescue a quick question or request a time to meet. A team member will follow up to confirm details.</DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="space-y-5 py-4 text-center" role="status">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10"><Send className="h-6 w-6 text-primary" /></div>
            <p className="font-medium">{success}</p>
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <RadioGroup value={requestType} onValueChange={(value) => setRequestType(value as RequestType)} className="grid gap-3 sm:grid-cols-2">
              <Label htmlFor="inquiry-question" className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${requestType === "question" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem id="inquiry-question" value="question" /><span><span className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4" />I have a question</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Ask about personality, care, or adoption.</span></span>
              </Label>
              <Label htmlFor="inquiry-meet" className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${requestType === "meet_and_greet" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem id="inquiry-meet" value="meet_and_greet" /><span><span className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" />Request a meet-and-greet</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Suggest times; the rescue will confirm.</span></span>
              </Label>
            </RadioGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="inquiry-name">Name</Label><Input id="inquiry-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoComplete="name" /></div>
              <div className="space-y-2"><Label htmlFor="inquiry-email">Email</Label><Input id="inquiry-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="inquiry-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="inquiry-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} autoComplete="tel" /></div>
              <div className="space-y-2"><Label htmlFor="inquiry-contact">Preferred contact</Label><select id="inquiry-contact" value={preferredContact} onChange={(e) => setPreferredContact(e.target.value as "email" | "phone")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="email">Email</option><option value="phone">Phone</option></select></div>
            </div>
            <div className="space-y-2"><Label htmlFor="inquiry-message">{requestType === "meet_and_greet" ? "Anything the rescue should know?" : `What would you like to know about ${animalName}?`}</Label><Textarea id="inquiry-message" value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={2000} className="min-h-24" placeholder={requestType === "meet_and_greet" ? "Tell us who would attend or share any questions." : "Write a short question for the rescue."} /></div>
            {requestType === "meet_and_greet" && <div className="space-y-2"><Label htmlFor="inquiry-availability">Preferred days or times</Label><Textarea id="inquiry-availability" value={availability} onChange={(e) => setAvailability(e.target.value)} required maxLength={1000} className="min-h-20" placeholder="For example: weekday evenings after 5, or Saturday morning" /><p className="text-xs text-muted-foreground">This is a request, not a confirmed appointment.</p></div>}
            <div className="absolute -left-[10000px]" aria-hidden="true"><Label htmlFor="inquiry-website">Website</Label><Input id="inquiry-website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isSubmitting ? "Sending" : requestType === "meet_and_greet" ? "Request a meet-and-greet" : `Ask about ${animalName}`}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}