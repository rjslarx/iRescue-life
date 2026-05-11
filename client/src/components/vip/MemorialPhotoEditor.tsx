import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { MemorialFrame, type FrameStyle } from "./MemorialFrame";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/webp,image/heic,image/heif";

export interface MemorialPhotoEditorProps {
  subscriptionId: string;
  donorName?: string | null;
  displayName?: string | null;
  memorialPhotoUrl: string | null;
  memorialFrameStyle: FrameStyle | null;
  /** Endpoint base, e.g. `/api/vip-portal/subscriptions/${id}` or
   *  `/api/vip-club/members/${id}`. Append `/memorial-photo` /
   *  `/memorial-frame` to it. */
  endpointBase: string;
  /** Optional query string (e.g. `?token=xxx`) appended after suffix. */
  querySuffix?: string;
  /** Optional auth header injection (donor token / tenant headers). */
  buildHeaders?: () => Record<string, string>;
  onChanged?: () => void;
  compact?: boolean;
}

export function MemorialPhotoEditor({
  subscriptionId: _subscriptionId,
  donorName,
  displayName,
  memorialPhotoUrl,
  memorialFrameStyle,
  endpointBase,
  querySuffix = "",
  buildHeaders,
  onChanged,
  compact,
}: MemorialPhotoEditorProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Local optimistic frame style so the radio reflects user choice immediately
  // even before a successful round-trip.
  const [frameDraft, setFrameDraft] = useState<FrameStyle>(
    memorialFrameStyle === "paw" ? "paw" : "heart",
  );

  const heroName = displayName?.trim() || donorName?.trim() || "Anonymous";

  const apiCall = async (
    method: "POST" | "DELETE" | "PATCH",
    suffix: string,
    body?: BodyInit,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(buildHeaders ? buildHeaders() : {}),
      ...(extraHeaders || {}),
    };
    return fetch(`${endpointBase}${suffix}${querySuffix}`, {
      method,
      headers,
      credentials: "include",
      body,
    });
  };

  const onPick = () => fileRef.current?.click();

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast({
        title: "Photo too large",
        description: "Memorial photos must be 5 MB or smaller.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("frameStyle", frameDraft);
      const res = await apiCall("POST", "/memorial-photo", form);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      toast({ title: "Memorial photo updated" });
      onChanged?.();
    } catch (err: any) {
      toast({
        title: "Could not upload photo",
        description: err?.message || "Please try a different image.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      const res = await apiCall("DELETE", "/memorial-photo");
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Memorial photo removed" });
      onChanged?.();
    } catch (err: any) {
      toast({
        title: "Could not remove photo",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onFrameChange = async (next: FrameStyle) => {
    setFrameDraft(next);
    if (!memorialPhotoUrl) return; // nothing persisted yet
    setBusy(true);
    try {
      const res = await apiCall(
        "PATCH",
        "/memorial-frame",
        JSON.stringify({ frameStyle: next }),
        { "Content-Type": "application/json" },
      );
      if (!res.ok) throw new Error(await res.text());
      onChanged?.();
    } catch (err: any) {
      toast({
        title: "Could not update frame",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex ${compact ? "items-center gap-3" : "flex-col sm:flex-row gap-4"} items-start`}
      data-testid="memorial-photo-editor"
    >
      <MemorialFrame
        photoUrl={memorialPhotoUrl}
        name={heroName}
        frameStyle={frameDraft}
        size={compact ? "sm" : "md"}
      />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Frame style</Label>
          <RadioGroup
            value={frameDraft}
            onValueChange={(v) => onFrameChange(v as FrameStyle)}
            className="flex gap-3"
            data-testid="radio-memorial-frame"
          >
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <RadioGroupItem value="heart" id="frame-heart" />
              Heart
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <RadioGroupItem value="paw" id="frame-paw" />
              Paw
            </label>
          </RadioGroup>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={onFileChosen}
            data-testid="input-memorial-photo"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onPick}
            disabled={busy}
            data-testid="button-upload-memorial-photo"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {memorialPhotoUrl ? "Replace photo" : "Add memorial photo"}
          </Button>
          {memorialPhotoUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={busy}
              data-testid="button-remove-memorial-photo"
            >
              <X className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Optional. PNG, JPG, WebP, or HEIC up to 5 MB. Your photo will appear
          framed with a {frameDraft === "paw" ? "paw print" : "heart"} on our
          public Wall of Heroes.
        </p>
      </div>
    </div>
  );
}
