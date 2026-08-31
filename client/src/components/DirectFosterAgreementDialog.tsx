import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Adopter { id: string; name: string; email?: string | null; phone?: string | null; address?: string | null; }
interface Template { id: number; name: string; isActive: boolean; isDefault?: boolean; }

export function DirectFosterAgreementDialog({
  open,
  onOpenChange,
  initialTemplateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplateId?: number | null;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [contact, setContact] = useState<Adopter | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [sendMethod, setSendMethod] = useState<"email" | "sms" | "both">("email");
  const { data: adoptersData, isLoading: adoptersLoading, isError: adoptersError } = useQuery<{ adopters: Adopter[] }>({
    queryKey: ["/api/foster-agreements/approved-adopters"], enabled: open,
  });
  const { data: templatesData } = useQuery<{ templates: Template[] }>({
    queryKey: ["/api/foster-contract-templates"], enabled: open,
  });
  const { data: tenantData } = useQuery<{ tenant: { twilioEnabled?: boolean } }>({ queryKey: ["/api/tenant"], enabled: open });
  const activeTemplates = useMemo(() => (templatesData?.templates || []).filter(template => template.isActive), [templatesData]);
  const smsEnabled = !!tenantData?.tenant?.twilioEnabled;
  const hasEmail = !!contact?.email;
  const hasSms = !!contact?.phone && smsEnabled;
  const filtered = (adoptersData?.adopters || []).filter(adopter =>
    `${adopter.name} ${adopter.email || ""} ${adopter.phone || ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (open) {
      setTemplateId(initialTemplateId ? String(initialTemplateId) : "");
      return;
    }
    setSearch(""); setContact(null); setTemplateId(""); setSendMethod("email");
  }, [open, initialTemplateId]);
  useEffect(() => {
    if (!hasEmail && hasSms) setSendMethod("sms");
    else if (hasEmail && !hasSms && sendMethod !== "email") setSendMethod("email");
  }, [hasEmail, hasSms, sendMethod]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("Choose an approved adopter.");
      const response = await apiRequest("POST", "/api/foster-agreements/direct-send", {
        contactId: contact.id, ...(templateId ? { templateId: Number(templateId) } : {}), sendMethod,
      });
      return response.json();
    },
    onSuccess: (data: { warning?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster-agreements/sessions"] });
      toast({
        title: data.warning ? "Agreement sent with a delivery warning" : "Agreement sent",
        description: data.warning || `A foster agreement was sent to ${contact?.name}.`,
        variant: data.warning ? "destructive" : "default",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Could not send agreement", description: error.message || "Please try again.", variant: "destructive" }),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-send-foster-agreement-directly">
      <DialogHeader>
        <DialogTitle>Send Foster Agreement Directly</DialogTitle>
        <DialogDescription>Send an agreement to an approved adopter without creating or changing a foster application.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Approved adopter</Label>
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, or phone" data-testid="input-direct-foster-adopter-search" />
          <div className="max-h-44 overflow-y-auto rounded-md border">
            {adoptersLoading ? <div className="p-3 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading adopters...</div>
              : adoptersError ? <p className="p-3 text-sm text-destructive">Approved adopters could not be loaded.</p>
              : filtered.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No approved adopters match your search.</p>
              : filtered.map(adopter => <button type="button" key={adopter.id} onClick={() => setContact(adopter)}
                className={`block w-full p-3 text-left border-b last:border-0 hover-elevate ${contact?.id === adopter.id ? "bg-accent" : ""}`}
                data-testid={`button-select-direct-foster-adopter-${adopter.id}`}>
                <span className="block font-medium">{adopter.name}</span>
                <span className="block text-xs text-muted-foreground">{adopter.email || "No email"} · {adopter.phone || "No phone"}</span>
              </button>)}
          </div>
        </div>
        {contact && <>
          <div className="rounded-md bg-muted p-3 text-sm space-y-1" data-testid="text-direct-foster-contact-details">
            <p><Mail className="inline h-4 w-4 mr-2" />{contact.email || "No saved email"}</p>
            <p><MessageSquare className="inline h-4 w-4 mr-2" />{contact.phone || "No saved phone"}</p>
          </div>
          {activeTemplates.length > 1 && <div className="space-y-2">
            <Label htmlFor="direct-foster-template">Agreement template (optional)</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="direct-foster-template" data-testid="select-direct-foster-template"><SelectValue placeholder="Use the default active template" /></SelectTrigger>
              <SelectContent>{activeTemplates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name}{template.isDefault ? " (default)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          <div className="space-y-2"><Label>Delivery method</Label>
            <RadioGroup value={sendMethod} onValueChange={value => setSendMethod(value as "email" | "sms" | "both")}>
              {hasEmail && <Label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"><RadioGroupItem value="email" data-testid="radio-direct-foster-email" />Email</Label>}
              {hasSms && <Label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"><RadioGroupItem value="sms" data-testid="radio-direct-foster-sms" />SMS</Label>}
              {hasEmail && hasSms && <Label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"><RadioGroupItem value="both" data-testid="radio-direct-foster-both" />Email & SMS</Label>}
            </RadioGroup>
            {!hasSms && <p className="text-xs text-muted-foreground">{smsEnabled ? "This adopter has no saved phone number." : "SMS is unavailable because Twilio is not enabled."}</p>}
            {!hasEmail && !hasSms && <p className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 shrink-0" />This adopter has no deliverable saved contact information.</p>}
          </div>
        </>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendMutation.isPending}>Cancel</Button>
        <Button onClick={() => sendMutation.mutate()} disabled={!contact || (!hasEmail && !hasSms) || sendMutation.isPending} data-testid="button-send-foster-agreement-directly">
          {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send agreement
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}