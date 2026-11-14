import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, PackageOpen, Save } from "lucide-react";
import { vendingMenuSchema, VENDING_ITEMS, type VendingMenu } from "@shared/rescue-vend";
import { useTenant } from "@/contexts/TenantContext";
import { tenantApiRequest } from "@/lib/tenantApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Draft = Omit<VendingMenu, "items"> & {
  items: Array<VendingMenu["items"][number] & { dollars: string }>;
};

function toDraft(menu: VendingMenu): Draft {
  return {
    version: menu.version,
    showInNavigation: menu.showInNavigation,
    machineStyle: menu.machineStyle ?? "classic",
    shortName: menu.shortName ?? "",
    items: VENDING_ITEMS.map(slot => {
      const item = menu.items.find(entry => entry.id === slot.id)!;
      return { ...item, dollars: (item.priceCents / 100).toFixed(2) };
    }),
  };
}

// Parse decimal text rather than rounding floating-point dollars.
function cents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export default function RescueVendCatalogDialog({ onClose }: { onClose: () => void }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const baseline = useRef("");
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadError, setReloadError] = useState(false);
  const queryKey = ["rescue-vend-settings", tenantId];
  const settings = useQuery({
    queryKey,
    queryFn: async () => vendingMenuSchema.parse(await (await tenantApiRequest("GET", "/api/public/rescue-vend/settings")).json()),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (settings.data && !baseline.current) {
      const initial = toDraft(settings.data);
      baseline.current = JSON.stringify(initial);
      setDraft(initial);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (menu: VendingMenu) => vendingMenuSchema.parse(
      await (await tenantApiRequest("PUT", "/api/public/rescue-vend/settings", menu)).json(),
    ),
    onSuccess: menu => {
      const saved = toDraft(menu);
      baseline.current = JSON.stringify(saved);
      setDraft(saved);
      setSubmitted(false);
      setReloadError(false);
      setNotice("Catalog saved. Your public machine is up to date.");
      queryClient.setQueryData(queryKey, menu);
      void queryClient.invalidateQueries({ queryKey: ["rescue-vend", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["rescue-vend-navigation", tenantId] });
    },
  });
  const conflict = save.error instanceof Error && /^409:/.test(save.error.message);
  const invalidSave = save.error instanceof Error && /^400:/.test(save.error.message);
  const dirty = !!draft && JSON.stringify(draft) !== baseline.current;
  const parsed = draft ? vendingMenuSchema.safeParse({
    version: draft.version,
    showInNavigation: draft.showInNavigation,
    machineStyle: draft.machineStyle,
    shortName: draft.shortName,
    items: draft.items.map(({ dollars, ...item }) => ({ ...item, priceCents: cents(dollars) })),
  }) : null;
  const errors: Record<string, string> = {};
  if (parsed && !parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "shortName") errors.shortName = "Use one or two words, up to 60 characters.";
      const [, index, field] = issue.path;
      if (typeof index === "number" && typeof field === "string") {
        errors[`${index}.${field}`] = field === "priceCents"
          ? "Enter $1.00–$1,000.00, with no more than two decimal places."
          : field === "name" ? "Enter a name between 1 and 80 characters."
          : "Enter a symbolic impact description between 1 and 180 characters.";
      }
    }
  }

  function update(index: number, patch: Partial<Draft["items"][number]>) {
    setDraft(current => current && ({
      ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item),
    }));
    setNotice("");
  }
  function close() {
    if (save.isPending || settings.isFetching) return;
    if (!dirty || window.confirm("Discard your unsaved catalog changes?")) onClose();
  }
  async function reload() {
    if (dirty && !window.confirm("Reload the latest catalog? This will discard your unsaved changes.")) return;
    setReloadError(false);
    const result = await settings.refetch();
    if (result.isSuccess && result.data) {
      const latest = toDraft(result.data);
      baseline.current = JSON.stringify(latest);
      setDraft(latest);
      save.reset();
      setSubmitted(false);
      setNotice("Latest catalog loaded.");
    } else {
      setReloadError(true);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0" data-testid="dialog-rescue-vend-catalog">
      <DialogHeader className="shrink-0 border-b p-5 pr-10 sm:p-6">
        <DialogTitle className="flex items-center gap-2"><PackageOpen className="h-5 w-5 text-teal-700" aria-hidden="true" />Edit Rescue Vend catalog</DialogTitle>
        <DialogDescription>Eight familiar slots. Make the names, symbolic impact, and gift amounts your own.</DialogDescription>
      </DialogHeader>
      <div className="shrink-0 border-b bg-teal-50/60 px-5 py-3 text-xs leading-relaxed text-teal-950 dark:bg-teal-950/30 dark:text-teal-100 sm:px-6">
        <strong>Symbolic supplies, real support.</strong> These are donations, not purchases. No physical goods are provided, and gifts are not guaranteed to be earmarked for the pictured or described supply. Fees are deducted from the gift total, not added on top.
      </div>
      <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={event => {
        event.preventDefault();
        setSubmitted(true);
        setNotice("");
        if (parsed?.success && !conflict && dirty) save.mutate(parsed.data);
      }}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6" aria-busy={settings.isFetching || save.isPending}>
          {!draft && settings.isLoading && <div role="status" aria-label="Loading catalog" className="space-y-4">
            {[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
          </div>}
          {!draft && settings.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-5">
            <p className="font-medium">We couldn’t load your catalog.</p>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">Your machine has not been changed. Try connecting again.</p>
            <Button type="button" variant="outline" disabled={settings.isFetching} onClick={() => void reload()}>{settings.isFetching ? "Loading…" : "Try again"}</Button>
          </div>}
          {draft && <fieldset disabled={save.isPending || settings.isFetching} className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
              <div>
                <Label htmlFor="vend-show-navigation">Show Rescue Vend in website navigation</Label>
                <p className="mt-1 text-xs text-muted-foreground">Adds a link to the desktop More menu and mobile menu. Turning this off does not disable your public machine.</p>
              </div>
              <Switch id="vend-show-navigation" data-testid="switch-vend-navigation" checked={draft.showInNavigation} onCheckedChange={checked => { setDraft(current => current && ({ ...current, showInNavigation: checked })); setNotice(""); }} />
            </div>
            <fieldset className="min-w-0 rounded-lg border bg-card p-4">
              <legend className="px-2 text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-300">YOUR MACHINE</legend>
              <p id="vend-style-help" className="mb-3 text-sm text-muted-foreground">Same supplies and secure Stripe checkout. Choose the cabinet your donors will see.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-describedby="vend-style-help">
                {([
                  { value: "classic", title: "Classic", detail: "Bright illustrated cabinet with playful arcade details." },
                  { value: "photorealistic", title: "Photorealistic", detail: "Brushed-charcoal steel, warm shelf lights, and tactile metal keys." },
                ] as const).map(style => <label key={style.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${draft.machineStyle === style.value ? "border-teal-600 bg-teal-50/70 dark:bg-teal-950/30" : "border-border hover:bg-muted/50"}`}>
                  <input type="radio" name="vend-machine-style" value={style.value} checked={draft.machineStyle === style.value} className="mt-1 accent-teal-700" onChange={() => { setDraft(current => current && ({ ...current, machineStyle: style.value })); setNotice(""); }} />
                  <span><span className="block text-sm font-semibold">{style.title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{style.detail}</span></span>
                </label>)}
              </div>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="vend-short-name">Short rescue name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="vend-short-name" value={draft.shortName} maxLength={60} placeholder="Automatic — from your rescue’s name" aria-invalid={submitted && !!errors.shortName} aria-describedby="vend-short-name-help" onChange={event => { setDraft(current => current && ({ ...current, shortName: event.target.value })); setNotice(""); }} />
                <p id="vend-short-name-help" className={submitted && errors.shortName ? "text-xs leading-relaxed text-destructive" : "text-xs leading-relaxed text-muted-foreground"}>{submitted && errors.shortName ? errors.shortName : draft.shortName.trim() ? `Machine title: ${draft.shortName.trim()} Rescue Vend. Use one or two words, up to 60 characters.` : "Automatic: we shorten your rescue’s name and add “Rescue Vend”, for example Haseya’s Rescue Vend. Or enter a one- or two-word rescue name for either machine."}</p>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{draft.items.filter(item => item.enabled).length} of 8 slots enabled</span>
              <span>Changes go live when you save</span>
            </div>
            {draft.items.map((item, index) => {
              const slot = VENDING_ITEMS[index];
              const prefix = `vend-${item.id}`;
              const fieldError = (field: string) => submitted ? errors[`${index}.${field}`] : undefined;
              return <fieldset key={item.id} className="min-w-0 rounded-lg border bg-card p-4">
                <legend className="px-2 text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-300">SLOT {slot.code}</legend>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">{item.enabled ? "Visible on your machine" : "Hidden from donors"}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${prefix}-enabled`} className="text-xs">Enabled</Label>
                    <Switch id={`${prefix}-enabled`} checked={item.enabled} onCheckedChange={enabled => update(index, { enabled })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_10rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${prefix}-name`}>Supply name</Label>
                    <Input id={`${prefix}-name`} value={item.name} maxLength={80} required aria-invalid={!!fieldError("name")} aria-describedby={fieldError("name") ? `${prefix}-name-error` : undefined} onChange={e => update(index, { name: e.target.value })} />
                    {fieldError("name") && <p id={`${prefix}-name-error`} className="text-xs text-destructive">{fieldError("name")}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${prefix}-price`}>Gift amount (USD)</Label>
                    <Input id={`${prefix}-price`} inputMode="decimal" value={item.dollars} required aria-invalid={!!fieldError("priceCents")} aria-describedby={`${prefix}-price-help`} onChange={e => update(index, { dollars: e.target.value })} />
                    <p id={`${prefix}-price-help`} className={fieldError("priceCents") ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{fieldError("priceCents") || "$1.00–$1,000.00"}</p>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`${prefix}-impact`}>Symbolic impact description</Label>
                    <Textarea id={`${prefix}-impact`} className="min-h-[72px]" rows={2} maxLength={180} required value={item.impactNote} aria-invalid={!!fieldError("impactNote")} aria-describedby={fieldError("impactNote") ? `${prefix}-impact-error` : undefined} onChange={e => update(index, { impactNote: e.target.value })} />
                    {fieldError("impactNote") && <p id={`${prefix}-impact-error`} className="text-xs text-destructive">{fieldError("impactNote")}</p>}
                  </div>
                </div>
              </fieldset>;
            })}
          </fieldset>}
        </div>
        <div className="shrink-0 border-t bg-background p-5 sm:px-6">
          {(save.isError || reloadError) && <div role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{reloadError ? "Couldn’t reload the catalog. Your edits are still here; try again." : conflict ? "Someone saved a newer catalog. Your edits are still here. Reload the latest version before editing and saving again." : invalidSave ? "The catalog wasn’t accepted. Check the names, descriptions, and amounts, then try saving again. Your edits are still here." : "Couldn’t save your catalog. Your edits are still here. Please try again."}</span></p>
            {(conflict || reloadError) && <Button type="button" className="mt-3" variant="outline" disabled={settings.isFetching} onClick={() => void reload()}>{settings.isFetching ? "Reloading…" : "Reload latest catalog"}</Button>}
          </div>}
          {submitted && parsed && !parsed.success && <p role="alert" className="mb-3 text-sm text-destructive">Check the highlighted fields in your catalog before saving.</p>}
          {notice && <p role="status" className="mb-3 flex items-center gap-2 text-sm text-teal-700 dark:text-teal-300"><Check className="h-4 w-4" aria-hidden="true" />{notice}</p>}
          <DialogFooter className="gap-2 sm:items-center">
            <span className="mr-auto self-center text-xs text-muted-foreground" role="status">{save.isPending ? "Saving your catalog…" : dirty ? "You have unsaved changes" : draft ? "All changes saved" : ""}</span>
            <Button type="button" variant="outline" disabled={save.isPending || settings.isFetching} onClick={close}>{dirty ? "Cancel" : "Close"}</Button>
            <Button type="submit" disabled={!draft || !dirty || save.isPending || settings.isFetching || conflict} data-testid="button-save-rescue-vend-catalog"><Save className="mr-2 h-4 w-4" aria-hidden="true" />{save.isPending ? "Saving…" : "Save catalog"}</Button>
          </DialogFooter>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
