import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ObjectUploader } from "@/components/ObjectUploader";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  ChevronRight,
  User,
  CreditCard,
  FileSignature,
  Search,
  Loader2,
  CheckCircle2,
  Upload,
  IdCard,
  FileText,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import type { Animal } from "@shared/schema";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const isDevelopment = import.meta.env.DEV;
const stripePublicKey = isDevelopment
  ? (import.meta.env.TESTING_VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : import.meta.env.VITE_STRIPE_PUBLIC_KEY;

const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

interface ReclaimWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animal: Animal;
  tenantName?: string;
}

type WizardStep = "owner" | "payment" | "signature";

interface OwnerData {
  contactId?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  governmentIdUrls: string[];
  vetRecordUrls: string[];
}

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

const STEPS: { key: WizardStep; label: string; icon: any }[] = [
  { key: "owner", label: "Owner Info", icon: User },
  { key: "payment", label: "Payment", icon: CreditCard },
  { key: "signature", label: "Waiver & Signature", icon: FileSignature },
];

const WAIVER_TEXT = (animalName: string, tenantName: string) => `
RECLAIM & RELEASE OF LIABILITY WAIVER

This Reclaim and Release of Liability Waiver ("Agreement") is entered into between ${tenantName} ("Organization") and the undersigned individual ("Owner").

RECLAMATION OF ANIMAL
Owner hereby reclaims the animal known as "${animalName}" and acknowledges that the Organization has held this animal in its care. Owner affirms that they are the rightful owner of this animal and assumes full responsibility for its care, health, and well-being effective immediately upon execution of this Agreement.

RELEASE OF LIABILITY
Owner hereby releases, waives, and forever discharges the Organization, its officers, directors, employees, agents, volunteers, and representatives from any and all claims, demands, actions, causes of action, suits, damages, losses, or expenses of any kind, whether known or unknown, arising out of or in connection with the Organization's custody, care, or handling of the animal.

ASSUMPTION OF RISK
Owner acknowledges and accepts that:
1. The animal may have been exposed to illness, disease, or behavioral stressors while in the Organization's care.
2. The Organization has provided reasonable care but makes no warranties regarding the animal's health, behavior, or condition.
3. Owner assumes all risks associated with reclaiming and caring for the animal.

INDEMNIFICATION
Owner agrees to indemnify, defend, and hold harmless the Organization from and against any claims, liabilities, damages, losses, or expenses arising from the animal's actions or condition after reclamation.

ACKNOWLEDGMENT OF FEES
Owner acknowledges that any applicable reclaim fees, boarding fees, or veterinary fees have been discussed and, if applicable, paid prior to the release of the animal.

GOVERNING LAW
This Agreement shall be governed by the laws of the state in which the Organization operates.

By signing below, Owner acknowledges that they have read, understand, and agree to the terms of this Reclaim and Release of Liability Waiver.
`.trim();

export function ReclaimWizardDialog({ open, onOpenChange, animal, tenantName = "the rescue organization" }: ReclaimWizardDialogProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>("owner");
  const [ownerData, setOwnerData] = useState<OwnerData>({
    name: "",
    email: "",
    phone: "",
    address: "",
    governmentIdUrls: [],
    vetRecordUrls: [],
  });
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Contact[]>([]);

  const [feeAmount, setFeeAmount] = useState("75.00");
  const [waiveFee, setWaiveFee] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [waiverRead, setWaiverRead] = useState(false);
  const [ownershipVerified, setOwnershipVerified] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: any }>({
    queryKey: ['/api/tenant'],
  });
  const resolvedTenantName = tenantData?.tenant?.name || tenantName;
  const stripeEnabled = tenantData?.tenant?.stripeEnabled;

  useEffect(() => {
    if (!open) {
      setCurrentStep("owner");
      setOwnerData({ name: "", email: "", phone: "", address: "", governmentIdUrls: [], vetRecordUrls: [] });
      setSelectedContact(null);
      setContactSearch("");
      setSearchResults([]);
      setFeeAmount("75.00");
      setWaiveFee(false);
      setPaymentComplete(false);
      setPaymentIntentId(null);
      setClientSecret(null);
      setPaymentError(null);
      setSignatureData(null);
      setWaiverRead(false);
      setOwnershipVerified(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSearchContacts = async () => {
    if (!contactSearch.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiRequest("GET", `/api/contacts?search=${encodeURIComponent(contactSearch)}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : (data.contacts || []));
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setOwnerData(prev => ({
      ...prev,
      contactId: contact.id,
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      address: contact.address || "",
    }));
    setSearchResults([]);
    setContactSearch("");
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setOwnerData({ name: "", email: "", phone: "", address: "", governmentIdUrls: ownerData.governmentIdUrls, vetRecordUrls: ownerData.vetRecordUrls });
  };

  const handleCreatePayment = async () => {
    const amount = parseFloat(feeAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Please enter a valid fee amount");
      return;
    }
    setIsCreatingPayment(true);
    setPaymentError(null);
    try {
      const res = await apiRequest("POST", `/api/animals/${animal.id}/reclaim-payment`, {
        amount: Math.round(amount * 100),
        description: `Reclaim fee for ${animal.name}`,
        ownerEmail: ownerData.email || undefined,
      });
      const data = await res.json();
      if (data.paymentIntentId) {
        setPaymentIntentId(data.paymentIntentId);
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          setPaymentComplete(true);
          toast({ title: "Payment recorded", description: `Reclaim fee of $${amount.toFixed(2)} has been recorded.` });
        }
      } else {
        throw new Error(data.error || "Failed to create payment");
      }
    } catch (err: any) {
      setPaymentError(err.message || "Payment failed. Please try again.");
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleStripePaymentSuccess = (intentId: string) => {
    setPaymentIntentId(intentId);
    setPaymentComplete(true);
    toast({ title: "Payment confirmed", description: `Reclaim fee of $${parseFloat(feeAmount).toFixed(2)} has been charged successfully.` });
  };

  const handleCancelStripeSetup = () => {
    setClientSecret(null);
    setPaymentIntentId(null);
    setPaymentError(null);
  };

  const reclaimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/animals/${animal.id}/reclaim`, {
        contactId: ownerData.contactId || undefined,
        newContact: !ownerData.contactId ? {
          name: ownerData.name,
          email: ownerData.email,
          phone: ownerData.phone,
          address: ownerData.address,
        } : undefined,
        reclaimFeePaid: waiveFee ? "0.00" : feeAmount,
        waiveFee,
        ownershipVerified: true,
        governmentIdUrls: ownerData.governmentIdUrls,
        vetRecordUrls: ownerData.vetRecordUrls,
        signatureData,
        paymentIntentId: paymentIntentId || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Reclaim complete", description: `${animal.name} has been returned to owner successfully.` });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Reclaim failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!signatureData) {
      toast({ title: "Signature required", description: "Please sign the waiver before completing.", variant: "destructive" });
      return;
    }
    if (!ownershipVerified) {
      toast({ title: "Verification required", description: "Please confirm ownership verification.", variant: "destructive" });
      return;
    }
    reclaimMutation.mutate();
  };

  const canAdvanceFromOwner = ownerData.name.trim().length > 0;
  const canAdvanceFromPayment = waiveFee || paymentComplete;
  const canSubmit = signatureData && ownershipVerified && waiverRead;

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setCurrentStep(STEPS[nextIdx].key);
  };
  const goBack = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setCurrentStep(STEPS[prevIdx].key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-reclaim-wizard">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5" />
            Return to Owner - {animal.name}
          </DialogTitle>
          <DialogDescription>
            Process the return of {animal.name} to their owner
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 px-1 mb-2" data-testid="progress-steps">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const isActive = idx === stepIndex;
            const isCompleted = idx < stepIndex;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1.5 w-full justify-center
                  ${isActive ? "bg-primary text-primary-foreground" : isCompleted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mx-0.5" />}
              </div>
            );
          })}
        </div>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-4 py-2 px-1">
            {currentStep === "owner" && (
              <OwnerInfoStep
                ownerData={ownerData}
                setOwnerData={setOwnerData}
                selectedContact={selectedContact}
                contactSearch={contactSearch}
                setContactSearch={setContactSearch}
                searchResults={searchResults}
                isSearching={isSearching}
                onSearch={handleSearchContacts}
                onSelectContact={handleSelectContact}
                onClearContact={handleClearContact}
              />
            )}
            {currentStep === "payment" && (
              <PaymentStep
                feeAmount={feeAmount}
                setFeeAmount={setFeeAmount}
                waiveFee={waiveFee}
                setWaiveFee={setWaiveFee}
                paymentComplete={paymentComplete}
                paymentError={paymentError}
                isCreatingPayment={isCreatingPayment}
                stripeEnabled={stripeEnabled}
                onCreatePayment={handleCreatePayment}
                onStripePaymentSuccess={handleStripePaymentSuccess}
                onCancelStripeSetup={handleCancelStripeSetup}
                clientSecret={clientSecret}
                animalName={animal.name}
              />
            )}
            {currentStep === "signature" && (
              <SignatureStep
                signatureData={signatureData}
                setSignatureData={setSignatureData}
                waiverRead={waiverRead}
                setWaiverRead={setWaiverRead}
                ownershipVerified={ownershipVerified}
                setOwnershipVerified={setOwnershipVerified}
                animalName={animal.name}
                tenantName={resolvedTenantName}
              />
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            onClick={stepIndex === 0 ? () => onOpenChange(false) : goBack}
            disabled={reclaimMutation.isPending}
            data-testid="button-reclaim-back"
          >
            {stepIndex === 0 ? "Cancel" : <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>}
          </Button>

          {currentStep !== "signature" ? (
            <Button
              onClick={goNext}
              disabled={
                (currentStep === "owner" && !canAdvanceFromOwner) ||
                (currentStep === "payment" && !canAdvanceFromPayment)
              }
              data-testid="button-reclaim-next"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || reclaimMutation.isPending}
              data-testid="button-reclaim-complete"
            >
              {reclaimMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Complete Reclaim</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OwnerInfoStep({
  ownerData,
  setOwnerData,
  selectedContact,
  contactSearch,
  setContactSearch,
  searchResults,
  isSearching,
  onSearch,
  onSelectContact,
  onClearContact,
}: {
  ownerData: OwnerData;
  setOwnerData: (fn: (prev: OwnerData) => OwnerData) => void;
  selectedContact: Contact | null;
  contactSearch: string;
  setContactSearch: (v: string) => void;
  searchResults: Contact[];
  isSearching: boolean;
  onSearch: () => void;
  onSelectContact: (c: Contact) => void;
  onClearContact: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <User className="h-4 w-4" /> Owner Information
        </h3>

        {!selectedContact && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Search existing contacts</Label>
            <div className="flex gap-2">
              <Input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Search by name, email, or phone..."
                onKeyDown={e => e.key === "Enter" && onSearch()}
                data-testid="input-contact-search"
              />
              <Button variant="outline" size="icon" onClick={onSearch} disabled={isSearching} data-testid="button-search-contacts">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 text-sm hover-elevate"
                    onClick={() => onSelectContact(c)}
                    data-testid={`button-select-contact-${c.id}`}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.email} {c.phone && `| ${c.phone}`}</div>
                  </button>
                ))}
              </div>
            )}
            <Separator className="my-2" />
            <Label className="text-xs text-muted-foreground">Or enter owner details manually</Label>
          </div>
        )}

        {selectedContact && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-md border border-primary/20">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedContact.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedContact.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClearContact} data-testid="button-clear-contact">Change</Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="owner-name">Full Name *</Label>
            <Input
              id="owner-name"
              value={ownerData.name}
              onChange={e => setOwnerData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Owner's full name"
              data-testid="input-owner-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-phone">Phone</Label>
            <Input
              id="owner-phone"
              value={ownerData.phone}
              onChange={e => setOwnerData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              data-testid="input-owner-phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-email">Email</Label>
            <Input
              id="owner-email"
              type="email"
              value={ownerData.email}
              onChange={e => setOwnerData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="owner@email.com"
              data-testid="input-owner-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-address">Address</Label>
            <Input
              id="owner-address"
              value={ownerData.address}
              onChange={e => setOwnerData(prev => ({ ...prev, address: e.target.value }))}
              placeholder="123 Main St, City, State"
              data-testid="input-owner-address"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <IdCard className="h-4 w-4" /> Government ID Photo
        </h3>
        <p className="text-xs text-muted-foreground">
          Take a photo or upload an image of the owner's government-issued ID (driver's license, passport, etc.)
        </p>
        <ObjectUploader
          value={ownerData.governmentIdUrls}
          onChange={(urls) => setOwnerData(prev => ({ ...prev, governmentIdUrls: urls }))}
          maxFiles={2}
          accept="image/*"
          uploadEndpoint="/api/animals/photos/upload"
          buttonText="Upload Government ID"
          data-testid="button-upload-gov-id"
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Proof of Ownership / Vet Records
        </h3>
        <p className="text-xs text-muted-foreground">
          Upload vet records, registration documents, or photos proving ownership of the animal
        </p>
        <ObjectUploader
          value={ownerData.vetRecordUrls}
          onChange={(urls) => setOwnerData(prev => ({ ...prev, vetRecordUrls: urls }))}
          maxFiles={5}
          accept="image/*,.pdf,.doc,.docx"
          uploadEndpoint="/api/documents/upload?category=rto-documents"
          buttonText="Upload Vet Records / Proof"
          data-testid="button-upload-vet-records"
        />
      </div>
    </div>
  );
}

function StripeCardForm({
  feeAmount,
  clientSecret,
  onSuccess,
  onError,
}: {
  feeAmount: string;
  clientSecret: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleConfirmPayment = async () => {
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      onError("Card element not found. Please try again.");
      return;
    }

    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent?.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        throw new Error(`Payment not completed. Status: ${paymentIntent?.status}`);
      }
    } catch (err: any) {
      onError(err.message || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const feeNum = parseFloat(feeAmount);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">Card Details</Label>
        <div className="border rounded-md p-3 bg-background">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "14px",
                  color: "hsl(var(--foreground))",
                  "::placeholder": { color: "hsl(var(--muted-foreground))" },
                },
              },
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the card details to charge ${!isNaN(feeNum) ? feeNum.toFixed(2) : "0.00"}
        </p>
      </div>
      <Button
        onClick={handleConfirmPayment}
        disabled={processing || !stripe}
        className="w-full"
        data-testid="button-confirm-stripe-payment"
      >
        {processing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming Payment...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" /> Confirm Payment - ${!isNaN(feeNum) ? feeNum.toFixed(2) : "0.00"}</>
        )}
      </Button>
    </div>
  );
}

function PaymentStep({
  feeAmount,
  setFeeAmount,
  waiveFee,
  setWaiveFee,
  paymentComplete,
  paymentError,
  isCreatingPayment,
  stripeEnabled,
  onCreatePayment,
  onStripePaymentSuccess,
  onCancelStripeSetup,
  clientSecret,
  animalName,
}: {
  feeAmount: string;
  setFeeAmount: (v: string) => void;
  waiveFee: boolean;
  setWaiveFee: (v: boolean) => void;
  paymentComplete: boolean;
  paymentError: string | null;
  isCreatingPayment: boolean;
  stripeEnabled: boolean;
  onCreatePayment: () => void;
  onStripePaymentSuccess: (paymentIntentId: string) => void;
  onCancelStripeSetup: () => void;
  clientSecret: string | null;
  animalName: string;
}) {
  const [stripePaymentError, setStripePaymentError] = useState<string | null>(null);
  const feeNum = parseFloat(feeAmount);
  const isValidFee = !isNaN(feeNum) && feeNum > 0;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <DollarSign className="h-4 w-4" /> Reclaim Fee
      </h3>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="fee-amount">Fee Amount ($)</Label>
            <Input
              id="fee-amount"
              type="number"
              step="0.01"
              min="0"
              value={feeAmount}
              onChange={e => setFeeAmount(e.target.value)}
              disabled={waiveFee || paymentComplete || !!clientSecret}
              data-testid="input-reclaim-fee"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
          <Switch
            checked={waiveFee}
            onCheckedChange={(checked) => {
              setWaiveFee(checked);
            }}
            disabled={paymentComplete || !!clientSecret}
            data-testid="switch-waive-fee"
          />
          <div>
            <Label className="text-sm font-medium">Waive Fee</Label>
            <p className="text-xs text-muted-foreground">No payment required - fee will be waived</p>
          </div>
        </div>
      </div>

      {!waiveFee && (
        <div className="space-y-3">
          {paymentComplete ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Payment Confirmed</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  ${parseFloat(feeAmount).toFixed(2)} reclaim fee has been charged for {animalName}
                </p>
              </div>
            </div>
          ) : clientSecret && stripePromise ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Enter card details below to process the ${isValidFee ? feeNum.toFixed(2) : "0.00"} reclaim fee.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelStripeSetup}
                  className="text-xs text-blue-600 dark:text-blue-400 shrink-0"
                  data-testid="button-cancel-stripe-setup"
                >
                  Change Amount
                </Button>
              </div>
              <Elements stripe={stripePromise}>
                <StripeCardForm
                  feeAmount={feeAmount}
                  clientSecret={clientSecret}
                  onSuccess={onStripePaymentSuccess}
                  onError={setStripePaymentError}
                />
              </Elements>
              {stripePaymentError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-300">{stripePaymentError}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {stripeEnabled ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Click below to set up card payment for the reclaim fee via Stripe.
                  </p>
                  <Button
                    onClick={onCreatePayment}
                    disabled={!isValidFee || isCreatingPayment}
                    className="w-full"
                    data-testid="button-process-payment"
                  >
                    {isCreatingPayment ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting Up Payment...</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" /> Set Up Payment - ${isValidFee ? feeNum.toFixed(2) : "0.00"}</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Stripe is not configured. Payment will be recorded manually. You can collect payment separately (cash, check, etc.) and record it here.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      onCreatePayment();
                    }}
                    disabled={!isValidFee || isCreatingPayment}
                    className="w-full"
                    data-testid="button-record-manual-payment"
                  >
                    {isCreatingPayment ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</>
                    ) : (
                      <><DollarSign className="h-4 w-4 mr-2" /> Record Manual Payment - ${isValidFee ? feeNum.toFixed(2) : "0.00"}</>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {paymentError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{paymentError}</p>
            </div>
          )}
        </div>
      )}

      {waiveFee && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
          <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Fee Waived</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">No payment is required for this reclaim</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SignatureStep({
  signatureData,
  setSignatureData,
  waiverRead,
  setWaiverRead,
  ownershipVerified,
  setOwnershipVerified,
  animalName,
  tenantName,
}: {
  signatureData: string | null;
  setSignatureData: (v: string | null) => void;
  waiverRead: boolean;
  setWaiverRead: (v: boolean) => void;
  ownershipVerified: boolean;
  setOwnershipVerified: (v: boolean) => void;
  animalName: string;
  tenantName: string;
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <FileSignature className="h-4 w-4" /> Reclaim & Release of Liability Waiver
      </h3>

      <div className="border rounded-md">
        <ScrollArea className="h-48 p-4">
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-muted-foreground">
            {WAIVER_TEXT(animalName, tenantName)}
          </pre>
        </ScrollArea>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="waiver-read"
          checked={waiverRead}
          onCheckedChange={(checked) => setWaiverRead(!!checked)}
          data-testid="checkbox-waiver-read"
        />
        <Label htmlFor="waiver-read" className="text-sm leading-relaxed cursor-pointer">
          I have read and explained the Reclaim & Release of Liability Waiver to the owner
        </Label>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Owner Signature</h3>
        <p className="text-xs text-muted-foreground">
          Have the owner sign below using their finger (on mobile/tablet) or mouse
        </p>
        <SignatureCanvas onSignatureChange={setSignatureData} />
      </div>

      <Separator />

      <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
        <Checkbox
          id="ownership-verified"
          checked={ownershipVerified}
          onCheckedChange={(checked) => setOwnershipVerified(!!checked)}
          data-testid="checkbox-ownership-verified"
        />
        <Label htmlFor="ownership-verified" className="text-sm leading-relaxed cursor-pointer">
          I verify that I have confirmed the owner's identity and proof of ownership of <strong>{animalName}</strong> through government-issued ID and/or documentation provided
        </Label>
      </div>
    </div>
  );
}
