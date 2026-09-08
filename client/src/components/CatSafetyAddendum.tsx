import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { ShieldCheck } from "lucide-react";

export interface CatSafetyAnswers {
  residentCatDescription: string;
  residentCatHousing: string;
  primaryBarrier: string;
  secondaryBarrier: string;
  transitionsPlan: string;
  responsiblePerson: string;
  emergencyPlan: string;
  adopter1Initials: string;
  coAdopter?: { name: string; phone: string; initials: string; signatureImageData: string };
}

export const emptyCatSafetyAnswers = (): CatSafetyAnswers => ({
  residentCatDescription: "", residentCatHousing: "", primaryBarrier: "", secondaryBarrier: "",
  transitionsPlan: "", responsiblePerson: "", emergencyPlan: "", adopter1Initials: "",
});

export function CatSafetyAddendumReview({ html }: { html: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4" data-testid="cat-safety-addendum-review">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-950">
        <ShieldCheck className="h-4 w-4 text-amber-700" /> Cat safety addendum
      </div>
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function CatSafetyAddendumFields({
  value, onChange, coAdopterEnabled, onCoAdopterEnabledChange,
}: {
  value: CatSafetyAnswers; onChange: (value: CatSafetyAnswers) => void;
  coAdopterEnabled: boolean; onCoAdopterEnabledChange: (value: boolean) => void;
}) {
  const update = (key: keyof CatSafetyAnswers, next: string) => onChange({ ...value, [key]: next });
  const co = value.coAdopter || { name: "", phone: "", initials: "", signatureImageData: "" };
  const updateCo = (key: keyof typeof co, next: string) => onChange({ ...value, coAdopter: { ...co, [key]: next } });
  return (
    <Card className="border-amber-200" data-testid="card-cat-safety-fields">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-amber-700" />Cat safety addendum</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Document how you will maintain permanent separation between the dog and resident cat. Please be specific.</p>
        {([
          ["residentCatDescription", "Resident cat name or description", "Identify the cat already living in or regularly occupying the home."],
          ["residentCatHousing", "Resident cat's secure housing", "Where will the resident cat be housed so the dog cannot enter?"],
          ["primaryBarrier", "Primary physical barrier", "Describe the first secure physical barrier."],
          ["secondaryBarrier", "Secondary physical barrier", "Describe the independent backup barrier."],
          ["transitionsPlan", "Transitions and door management", "How will doors, visitors, and household transitions be managed without contact?"],
          ["responsiblePerson", "Daily separation responsibility", "Who will be responsible for maintaining permanent separation each day?"],
          ["emergencyPlan", "Escape emergency plan", "What will happen immediately if either animal escapes confinement?"],
        ] as const).map(([key, label, placeholder]) => (
          <div className="space-y-1.5" key={key}><Label htmlFor={`cat-safety-${key}`}>{label} *</Label>
            <Textarea id={`cat-safety-${key}`} value={value[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder} data-testid={`input-cat-safety-${key}`} />
          </div>
        ))}
        <div className="space-y-1.5"><Label htmlFor="cat-safety-initials">Your initials *</Label><Input id="cat-safety-initials" maxLength={8} value={value.adopter1Initials} onChange={e => update("adopter1Initials", e.target.value)} data-testid="input-cat-safety-adopter1-initials" /></div>
        <div className="flex items-center justify-between rounded-md border p-3"><div><Label htmlFor="cat-safety-co">Add a co-adopter</Label><p className="text-xs text-muted-foreground">They will complete their own acknowledgement and signature.</p></div><Switch id="cat-safety-co" checked={coAdopterEnabled} onCheckedChange={(enabled) => { onCoAdopterEnabledChange(enabled); if (!enabled) onChange({ ...value, coAdopter: undefined }); }} data-testid="switch-cat-safety-co-adopter" /></div>
        {coAdopterEnabled && <div className="space-y-4 rounded-md bg-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Co-adopter name *</Label><Input value={co.name} onChange={e => updateCo("name", e.target.value)} data-testid="input-cat-safety-co-name" /></div><div className="space-y-1.5"><Label>Co-adopter phone *</Label><Input type="tel" value={co.phone} onChange={e => updateCo("phone", e.target.value)} data-testid="input-cat-safety-co-phone" /></div><div className="space-y-1.5"><Label>Co-adopter initials *</Label><Input maxLength={8} value={co.initials} onChange={e => updateCo("initials", e.target.value)} data-testid="input-cat-safety-co-initials" /></div></div>
          <div><Label>Co-adopter signature *</Label><SignatureCanvas onSignatureChange={s => updateCo("signatureImageData", s || "")} description="Co-adopter signs here" /></div>
        </div>}
      </CardContent>
    </Card>
  );
}

export function catSafetyAnswersValid(a: CatSafetyAnswers, coEnabled: boolean) {
  const required = [a.residentCatDescription, a.residentCatHousing, a.primaryBarrier, a.secondaryBarrier, a.transitionsPlan, a.responsiblePerson, a.emergencyPlan, a.adopter1Initials];
  return required.every(v => v.trim()) && (!coEnabled || !!a.coAdopter && [a.coAdopter.name, a.coAdopter.phone, a.coAdopter.initials, a.coAdopter.signatureImageData].every(v => v.trim()));
}