import { useState } from "react";
import { ChevronDown, ChevronUp, Heart, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildTenantUrl, getTenantHeaders } from "@/lib/tenantApi";
import { FeatheredAvatar } from "@/components/vip/FeatheredAvatar";

export interface TributeFormValue {
  enabled: boolean;
  kind: "memory" | "honor" | null;
  name: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  photoUrl: string;
  wallOptIn: boolean;
}

export const emptyTribute: TributeFormValue = {
  enabled: false,
  kind: null,
  name: "",
  recipientName: "",
  recipientEmail: "",
  message: "",
  photoUrl: "",
  wallOptIn: true,
};

interface TributeSectionProps {
  value: TributeFormValue;
  onChange: (next: TributeFormValue) => void;
  errors?: Partial<Record<keyof TributeFormValue, string>>;
}

export default function TributeSection({ value, onChange, errors }: TributeSectionProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const update = (patch: Partial<TributeFormValue>) => onChange({ ...value, ...patch });

  const toggleSection = () => {
    update({ enabled: !value.enabled });
  };

  const handlePhotoSelect = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Photo too large",
        description: "Memorial photos must be under 5MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("formType", "tribute");
      formData.append("fieldId", "memorial-photo");
      const res = await fetch(buildTenantUrl("/api/public/form-photos/upload"), {
        method: "POST",
        credentials: "include",
        headers: getTenantHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      if (data.fileUrl) {
        update({ photoUrl: data.fileUrl });
      }
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20 overflow-hidden" data-testid="tribute-section">
      <button
        type="button"
        onClick={toggleSection}
        className="w-full flex items-center justify-between px-4 py-3 hover-elevate text-left"
        data-testid="button-tribute-toggle"
      >
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />
          <span className="text-sm font-medium">
            Make this gift in memory of or in honor of someone
          </span>
        </div>
        {value.enabled ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {value.enabled && (
        <div className="p-4 pt-2 space-y-4 border-t bg-background">
          <div>
            <Label className="text-sm font-medium">This gift is</Label>
            <RadioGroup
              value={value.kind || ""}
              onValueChange={(v) => update({ kind: v as "memory" | "honor" })}
              className="flex gap-4 mt-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="memory" id="tribute-memory" data-testid="radio-tribute-memory" />
                <Label htmlFor="tribute-memory" className="cursor-pointer text-sm">
                  In memory of
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="honor" id="tribute-honor" data-testid="radio-tribute-honor" />
                <Label htmlFor="tribute-honor" className="cursor-pointer text-sm">
                  In honor of
                </Label>
              </div>
            </RadioGroup>
            {errors?.kind && <p className="text-xs text-destructive mt-1">{errors.kind}</p>}
          </div>

          <div>
            <Label htmlFor="tribute-name" className="text-sm">
              Honoree name
            </Label>
            <Input
              id="tribute-name"
              value={value.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. Buddy, Grandma Rose, John Smith"
              maxLength={120}
              className="mt-1"
              data-testid="input-tribute-name"
            />
            {errors?.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Memorial photo (optional)</Label>
            <div className="flex items-start gap-3">
              <FeatheredAvatar
                photoUrl={value.photoUrl || null}
                name={value.name || "tribute"}
                sizePx={64}
              />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    id="tribute-photo-input"
                    className="hidden"
                    onChange={(e) => handlePhotoSelect(e.target.files?.[0] || null)}
                    data-testid="input-tribute-photo"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => document.getElementById("tribute-photo-input")?.click()}
                    data-testid="button-tribute-photo-upload"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Uploading…
                      </>
                    ) : value.photoUrl ? (
                      "Change photo"
                    ) : (
                      "Upload photo"
                    )}
                  </Button>
                  {value.photoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ photoUrl: "" })}
                      data-testid="button-tribute-photo-remove"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Notify a family member or friend (optional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tribute-recipient-name" className="text-xs">
                  Recipient name
                </Label>
                <Input
                  id="tribute-recipient-name"
                  value={value.recipientName}
                  onChange={(e) => update({ recipientName: e.target.value })}
                  placeholder="Name of family member"
                  maxLength={120}
                  className="mt-1"
                  data-testid="input-tribute-recipient-name"
                />
              </div>
              <div>
                <Label htmlFor="tribute-recipient-email" className="text-xs">
                  Recipient email
                </Label>
                <Input
                  id="tribute-recipient-email"
                  type="email"
                  value={value.recipientEmail}
                  onChange={(e) => update({ recipientEmail: e.target.value })}
                  placeholder="family@example.com"
                  maxLength={200}
                  className="mt-1"
                  data-testid="input-tribute-recipient-email"
                />
                {errors?.recipientEmail && (
                  <p className="text-xs text-destructive mt-1">{errors.recipientEmail}</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="tribute-message" className="text-xs">
                Personal message (optional)
              </Label>
              <Textarea
                id="tribute-message"
                value={value.message}
                onChange={(e) => update({ message: e.target.value })}
                placeholder="A short note for the family. Your donation amount will not be shared."
                maxLength={1000}
                rows={3}
                className="mt-1 resize-none"
                data-testid="input-tribute-message"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We never share the donation amount with the recipient.
            </p>
          </div>

          <div
            className="flex items-start gap-3 p-3 rounded-md border bg-muted/30 cursor-pointer hover-elevate"
            onClick={() => update({ wallOptIn: !value.wallOptIn })}
            data-testid="checkbox-tribute-wall-container"
          >
            <Checkbox
              checked={value.wallOptIn}
              onCheckedChange={(c) => update({ wallOptIn: c === true })}
              className="mt-0.5"
              data-testid="checkbox-tribute-wall"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Display on our public Tribute Wall</p>
              <p className="text-xs text-muted-foreground">
                A tile honoring this name will appear on our Wall of Heroes for 12 months.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
