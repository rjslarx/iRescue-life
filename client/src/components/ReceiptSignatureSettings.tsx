import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Trash2, PenLine } from "lucide-react";

interface TenantReceiptSignature {
  receiptSignatureUrl?: string | null;
  receiptSignatureName?: string | null;
  receiptSignatureTitle?: string | null;
}

export function ReceiptSignatureSettings({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ tenant: TenantReceiptSignature }>({
    queryKey: ["/api/tenant/settings"],
  });
  const tenant = data?.tenant;

  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (tenant && !initialized) {
      setName(tenant.receiptSignatureName ?? "");
      setTitle(tenant.receiptSignatureTitle ?? "");
      setInitialized(true);
    }
  }, [tenant, initialized]);

  const hasSavedSignature = !!tenant?.receiptSignatureUrl;

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/tenant/settings/receipt-signature", {
        signature: signature ?? undefined,
        name,
        title,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      setSignature(null);
      toast({ title: "Signature saved", description: "It will be stamped on every donation receipt." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save signature",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/tenant/settings/receipt-signature");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      setSignature(null);
      setName("");
      setTitle("");
      toast({ title: "Signature removed", description: "Receipts will no longer include a signature." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not remove signature",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = canEdit && (hasSavedSignature || !!signature);

  return (
    <Card data-testid="card-receipt-signature">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Donation Receipt Signature
        </CardTitle>
        <CardDescription>
          Save one authorized signature on file. It is automatically added to every donation
          receipt PDF — offline, online, re-sends, and downloads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading…</span>
          </div>
        ) : (
          <>
            {hasSavedSignature && (
              <div className="space-y-2">
                <Label>Current signature on file</Label>
                <div className="rounded-md border border-border bg-card p-4 inline-block">
                  <img
                    src={tenant!.receiptSignatureUrl!}
                    alt="Saved signature"
                    className="max-h-20 max-w-[260px] object-contain"
                    data-testid="img-saved-signature"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Draw below to replace it, or remove it entirely.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{hasSavedSignature ? "Replace signature" : "Draw signature"}</Label>
              <SignatureCanvas
                onSignatureChange={setSignature}
                disabled={!canEdit}
                description="This signature is stamped onto every donation receipt PDF."
              />
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receipt-signer-name">Signer name</Label>
                <Input
                  id="receipt-signer-name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canEdit}
                  maxLength={120}
                  data-testid="input-receipt-signer-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-signer-title">Signer title</Label>
                <Input
                  id="receipt-signer-title"
                  placeholder="Executive Director"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEdit}
                  maxLength={120}
                  data-testid="input-receipt-signer-title"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {hasSavedSignature && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => clearMutation.mutate()}
                  disabled={!canEdit || clearMutation.isPending}
                  data-testid="button-remove-receipt-signature"
                >
                  {clearMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Remove
                </Button>
              )}
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!canSubmit || saveMutation.isPending}
                data-testid="button-save-receipt-signature"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Signature
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
