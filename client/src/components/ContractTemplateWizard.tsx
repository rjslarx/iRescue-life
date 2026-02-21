import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  Stethoscope,
  DollarSign,
  Shield,
  FileText,
  Sparkles,
  Loader2,
  Eye,
  ChevronRight,
} from "lucide-react";
import DOMPurify from "dompurify";

type ContractType = "adoption" | "foster" | "placement";

interface WizardAnswers {
  contractType: ContractType;
  templateName: string;
  orgName: string;
  orgState: string;
  orgPhone: string;
  orgEmail: string;
  orgAddress: string;
  spayNeuterRequired: boolean;
  spayNeuterDays: number;
  spayNeuterPenalty: boolean;
  spayNeuterPenaltyAmount: string;
  returnPolicyEnabled: boolean;
  returnPolicyDays: number;
  returnPolicyRefund: "full" | "partial" | "none";
  vetVisitRequired: boolean;
  vetVisitDays: number;
  vetVisitProofRequired: boolean;
  medicalDisclosure: boolean;
  behavioralAssessment: boolean;
  knownConditionsDisclosure: boolean;
  adoptionFeeIncluded: boolean;
  refundPolicy: "no_refund" | "within_period" | "case_by_case";
  refundDays: number;
  depositRequired: boolean;
  depositAmount: string;
  photoRelease: boolean;
  socialMediaConsent: boolean;
  microchipTransfer: boolean;
  homeVisitClause: boolean;
  noTieOutClause: boolean;
  indoorOnlyClause: boolean;
  noDeclaw: boolean;
  fosterCareStandards: boolean;
  fosterMedicalAuth: boolean;
  fosterSupplyProvision: boolean;
  fosterEmergencyProtocol: boolean;
  fosterAdoptionProcess: boolean;
  fosterPropertyClause: boolean;
  fosterDurationClause: boolean;
  fosterDurationDays: number;
}

const DEFAULT_ANSWERS: WizardAnswers = {
  contractType: "adoption",
  templateName: "",
  orgName: "",
  orgState: "",
  orgPhone: "",
  orgEmail: "",
  orgAddress: "",
  spayNeuterRequired: true,
  spayNeuterDays: 30,
  spayNeuterPenalty: false,
  spayNeuterPenaltyAmount: "200",
  returnPolicyEnabled: true,
  returnPolicyDays: 14,
  returnPolicyRefund: "none",
  vetVisitRequired: true,
  vetVisitDays: 7,
  vetVisitProofRequired: true,
  medicalDisclosure: true,
  behavioralAssessment: true,
  knownConditionsDisclosure: true,
  adoptionFeeIncluded: true,
  refundPolicy: "no_refund",
  refundDays: 14,
  depositRequired: false,
  depositAmount: "50",
  photoRelease: true,
  socialMediaConsent: true,
  microchipTransfer: true,
  homeVisitClause: false,
  noTieOutClause: true,
  indoorOnlyClause: false,
  noDeclaw: true,
  fosterCareStandards: true,
  fosterMedicalAuth: true,
  fosterSupplyProvision: true,
  fosterEmergencyProtocol: true,
  fosterAdoptionProcess: true,
  fosterPropertyClause: true,
  fosterDurationClause: false,
  fosterDurationDays: 90,
};

interface ContractTemplateWizardProps {
  onComplete: (data: {
    name: string;
    description: string;
    htmlTemplate: string;
    editorMode: string;
    contractType: ContractType;
  }) => void;
  onCancel: () => void;
  isPending?: boolean;
  tenantName?: string;
  contractType?: ContractType;
}

const ADOPTION_STEPS = [
  { id: "type", label: "Template Type", icon: FileText },
  { id: "org", label: "Organization", icon: Building2 },
  { id: "policies", label: "Adoption Policies", icon: Shield },
  { id: "medical", label: "Medical & Care", icon: Stethoscope },
  { id: "financial", label: "Financial Terms", icon: DollarSign },
  { id: "additional", label: "Additional Clauses", icon: FileText },
  { id: "review", label: "Review & Create", icon: Sparkles },
];

const FOSTER_STEPS = [
  { id: "type", label: "Template Type", icon: FileText },
  { id: "org", label: "Organization", icon: Building2 },
  { id: "foster_policies", label: "Foster Policies", icon: Shield },
  { id: "foster_care", label: "Care & Medical", icon: Stethoscope },
  { id: "additional", label: "Additional Clauses", icon: FileText },
  { id: "review", label: "Review & Create", icon: Sparkles },
];

function getSteps(contractType: ContractType) {
  if (contractType === "foster") return FOSTER_STEPS;
  return ADOPTION_STEPS;
}

function buildAdoptionHtml(a: WizardAnswers): string {
  const sections: string[] = [];

  sections.push(`<h1 style="text-align:center; color:#1a1a1a; font-size:24px; border-bottom:2px solid #4F46E5; padding-bottom:10px;">
  ${a.orgName || "{{organization_name}}"} &mdash; Adoption Agreement
</h1>
<p style="text-align:center; color:#666; margin-bottom:30px;">This Adoption Agreement ("Agreement") is entered into on <strong>{{contract_date}}</strong></p>`);

  sections.push(`<h2>1. Adopter Information</h2>
<p><strong>Name:</strong> {{adopter_name}}</p>
<p><strong>Email:</strong> {{adopter_email}}</p>
<p><strong>Phone:</strong> {{adopter_phone}}</p>
<p><strong>Address:</strong> {{adopter_address}}</p>`);

  sections.push(`<h2>2. Animal Information</h2>
<p><strong>Name:</strong> {{animal_name}}</p>
<p><strong>Species:</strong> {{animal_species}}</p>
<p><strong>Breed:</strong> {{animal_breed}}</p>
<p><strong>Age:</strong> {{animal_age}}</p>
<p><strong>Sex:</strong> {{animal_sex}}</p>
<p><strong>Color/Markings:</strong> {{animal_color}}</p>
<p><strong>Microchip #:</strong> {{animal_microchip}}</p>`);

  let termsCount = 1;
  const terms: string[] = [];

  terms.push(`<li><strong>Ownership Transfer:</strong> Upon execution of this Agreement and receipt of the adoption fee, ${a.orgName || "{{organization_name}}"} transfers ownership of the above-described animal to the Adopter, subject to the terms and conditions herein.</li>`);

  terms.push(`<li><strong>General Care:</strong> The Adopter agrees to provide the animal with adequate food, fresh water, shelter, and veterinary care for the duration of the animal's life. The animal shall be treated humanely and kept as a companion animal.</li>`);

  if (a.spayNeuterRequired) {
    let spayClause = `<li><strong>Spay/Neuter Requirement:</strong> If the animal has not already been spayed or neutered at the time of adoption, the Adopter agrees to have the animal spayed or neutered within <strong>${a.spayNeuterDays} days</strong> of the adoption date and provide proof to ${a.orgName || "{{organization_name}}"}.`;
    if (a.spayNeuterPenalty) {
      spayClause += ` Failure to comply may result in a penalty of <strong>$${a.spayNeuterPenaltyAmount}</strong> and/or the animal being reclaimed by ${a.orgName || "{{organization_name}}"}.`;
    }
    spayClause += `</li>`;
    terms.push(spayClause);
  }

  if (a.vetVisitRequired) {
    let vetClause = `<li><strong>Veterinary Visit:</strong> The Adopter agrees to take the animal to a licensed veterinarian within <strong>${a.vetVisitDays} days</strong> of the adoption date for a wellness examination.`;
    if (a.vetVisitProofRequired) {
      vetClause += ` Proof of this visit must be provided to ${a.orgName || "{{organization_name}}"}.`;
    }
    vetClause += `</li>`;
    terms.push(vetClause);
  }

  if (a.noTieOutClause) {
    terms.push(`<li><strong>No Chaining/Tethering:</strong> The animal shall not be kept chained, tied, or tethered outdoors unattended at any time.</li>`);
  }

  if (a.indoorOnlyClause) {
    terms.push(`<li><strong>Indoor Living:</strong> The animal shall be kept primarily indoors as a household companion. Outdoor access should be supervised or within a securely fenced area.</li>`);
  }

  if (a.noDeclaw) {
    terms.push(`<li><strong>No Declawing:</strong> The Adopter agrees not to have the animal declawed. If the animal is a cat, appropriate scratching surfaces shall be provided.</li>`);
  }

  if (a.homeVisitClause) {
    terms.push(`<li><strong>Home Visit:</strong> ${a.orgName || "{{organization_name}}"} reserves the right to conduct a home visit at a mutually agreeable time to ensure the well-being of the animal.</li>`);
  }

  terms.push(`<li><strong>No Transfer:</strong> The Adopter agrees not to sell, give away, abandon, or transfer the animal to any third party without the prior written consent of ${a.orgName || "{{organization_name}}"}.</li>`);

  if (a.returnPolicyEnabled) {
    let returnClause = `<li><strong>Return Policy:</strong> If the Adopter is unable to keep the animal for any reason, the Adopter must contact ${a.orgName || "{{organization_name}}"} to arrange for the animal's return.`;
    if (a.returnPolicyDays > 0) {
      returnClause += ` Returns within <strong>${a.returnPolicyDays} days</strong> of adoption`;
      if (a.returnPolicyRefund === "full") {
        returnClause += ` are eligible for a full refund of the adoption fee.`;
      } else if (a.returnPolicyRefund === "partial") {
        returnClause += ` are eligible for a partial refund of the adoption fee (less any incurred veterinary or care costs).`;
      } else {
        returnClause += ` will be accepted; however, adoption fees are non-refundable.`;
      }
    }
    returnClause += `</li>`;
    terms.push(returnClause);
  }

  sections.push(`<h2>3. Terms and Conditions</h2>\n<ol>\n${terms.join("\n")}\n</ol>`);

  if (a.medicalDisclosure || a.knownConditionsDisclosure || a.behavioralAssessment) {
    const disclosures: string[] = [];
    if (a.knownConditionsDisclosure) {
      disclosures.push(`<p><strong>Known Medical Conditions:</strong> ${a.orgName || "{{organization_name}}"} has disclosed any known medical conditions of the animal to the best of its knowledge. The Adopter acknowledges that rescue animals may have undiscovered health conditions, and ${a.orgName || "{{organization_name}}"} cannot guarantee the future health of the animal.</p>`);
    }
    if (a.medicalDisclosure) {
      disclosures.push(`<p><strong>Vaccination & Treatment History:</strong> The animal's known vaccination and medical treatment history has been provided. The Adopter understands that some history may be incomplete or unknown, particularly for animals surrendered or found as strays.</p>`);
    }
    if (a.behavioralAssessment) {
      disclosures.push(`<p><strong>Behavioral Assessment:</strong> ${a.orgName || "{{organization_name}}"} has provided information about the animal's known behavioral traits. The Adopter understands that animal behavior can change in new environments and that an adjustment period is normal.</p>`);
    }
    sections.push(`<h2>4. Medical & Behavioral Disclosures</h2>\n${disclosures.join("\n")}`);
  }

  if (a.adoptionFeeIncluded) {
    const financialParts: string[] = [];
    financialParts.push(`<p><strong>Adoption Fee:</strong> {{adoption_fee}}</p>`);
    if (a.depositRequired) {
      financialParts.push(`<p><strong>Deposit Required:</strong> A non-refundable deposit of $${a.depositAmount} was required to hold this animal.</p>`);
    }
    if (a.refundPolicy === "no_refund") {
      financialParts.push(`<p><strong>Refund Policy:</strong> All adoption fees are non-refundable.</p>`);
    } else if (a.refundPolicy === "within_period") {
      financialParts.push(`<p><strong>Refund Policy:</strong> Adoption fees may be refunded if the animal is returned within ${a.refundDays} days. After this period, fees are non-refundable.</p>`);
    } else {
      financialParts.push(`<p><strong>Refund Policy:</strong> Refund requests are considered on a case-by-case basis at the discretion of ${a.orgName || "{{organization_name}}"}.</p>`);
    }
    sections.push(`<h2>5. Financial Terms</h2>\n${financialParts.join("\n")}`);
  }

  const additional: string[] = [];
  if (a.photoRelease) {
    additional.push(`<p><strong>Photo Release:</strong> The Adopter grants ${a.orgName || "{{organization_name}}"} permission to use photographs of the animal taken before and after adoption for promotional and fundraising purposes.</p>`);
  }
  if (a.socialMediaConsent) {
    additional.push(`<p><strong>Social Media:</strong> The Adopter consents to ${a.orgName || "{{organization_name}}"} sharing the animal's adoption story on social media platforms. Personal information of the Adopter will not be shared without consent.</p>`);
  }
  if (a.microchipTransfer) {
    additional.push(`<p><strong>Microchip Transfer:</strong> If the animal is microchipped, ${a.orgName || "{{organization_name}}"} will assist in transferring the microchip registration to the Adopter. The Adopter agrees to keep the microchip registration current.</p>`);
  }
  if (additional.length > 0) {
    sections.push(`<h2>6. Additional Provisions</h2>\n${additional.join("\n")}`);
  }

  sections.push(`<div style="margin-top:30px; padding:15px; border:1px solid #ccc; background:#f9f9f9;">
<p><strong>Limitation of Liability:</strong> ${a.orgName || "{{organization_name}}"} makes no warranties regarding the health, temperament, or training of the animal beyond what has been disclosed. The Adopter assumes full responsibility for the animal upon execution of this Agreement.</p>
</div>`);

  sections.push(`<h2>Adopter Acknowledgment & Signature</h2>
<p>By signing below, I, the Adopter, acknowledge that I have read, understand, and agree to abide by all terms and conditions set forth in this Agreement.</p>
<div style="margin:20px 0; padding:20px; border:1px solid #ddd; background:#f9f9f9;">
  <p><strong>Adopter Signature:</strong></p>
  <img src="{{signature_image_url}}" alt="Signature" style="max-width:300px; border-bottom:1px solid #333;" />
  <p><strong>Printed Name:</strong> {{adopter_name}}</p>
  <p><strong>Date:</strong> {{contract_date}}</p>
</div>
<p style="font-size:11px; color:#888;">Signed electronically via ${a.orgName || "{{organization_name}}"} adoption portal. IP: {{signed_ip}} | Timestamp: {{signed_timestamp}}</p>`);

  const body = sections.join("\n\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${a.orgName || "{{organization_name}}"} - Adoption Agreement</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a1a1a; font-size: 24px; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #2d2d2d; font-size: 18px; margin-top: 30px; }
    p { margin-bottom: 10px; }
    ol, ul { margin-left: 20px; }
    li { margin-bottom: 8px; }
    .signature-box { margin: 20px 0; padding: 20px; border: 1px solid #ddd; background: #f9f9f9; }
    .signature-box img { max-width: 300px; border-bottom: 1px solid #333; }
    .warning-box { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function buildFosterHtml(a: WizardAnswers): string {
  const sections: string[] = [];

  sections.push(`<h1 style="text-align:center; color:#1a1a1a; font-size:24px; border-bottom:2px solid #4F46E5; padding-bottom:10px;">
  ${a.orgName || "{{organization_name}}"} &mdash; Foster Care Agreement
</h1>
<p style="text-align:center; color:#666; margin-bottom:30px;">This Foster Care Agreement ("Agreement") is entered into on <strong>{{contract_date}}</strong></p>`);

  sections.push(`<h2>1. Foster Parent Information</h2>
<p><strong>Name:</strong> {{foster_parent_name}}</p>
<p><strong>Email:</strong> {{foster_email}}</p>
<p><strong>Phone:</strong> {{foster_phone}}</p>
<p><strong>Address:</strong> {{foster_address}}</p>
<p><strong>Start Date:</strong> {{foster_start_date}}</p>`);

  sections.push(`<h2>2. Animal Information</h2>
<p><strong>Name:</strong> {{animal_name}}</p>
<p><strong>Species:</strong> {{animal_species}}</p>
<p><strong>Breed:</strong> {{animal_breed}}</p>
<p><strong>Age:</strong> {{animal_age}}</p>
<p><strong>Sex:</strong> {{animal_sex}}</p>
<p><strong>Microchip #:</strong> {{animal_microchip}}</p>`);

  const terms: string[] = [];

  if (a.fosterPropertyClause) {
    terms.push(`<li><strong>Ownership:</strong> The Foster Parent understands and acknowledges that the Animal remains the sole property of ${a.orgName || "{{organization_name}}"} at all times during the foster period. The Foster Parent has no ownership rights to the Animal.</li>`);
  }

  if (a.fosterCareStandards) {
    terms.push(`<li><strong>Standard of Care:</strong> The Foster Parent agrees to provide the Animal with adequate food, fresh water, a safe and clean living environment, exercise, and affection. The Animal shall be kept indoors as a household pet and shall not be left outdoors unattended.</li>`);
  }

  if (a.fosterMedicalAuth) {
    terms.push(`<li><strong>Medical Authorization:</strong> The Foster Parent shall not arrange or authorize any veterinary care, procedures, or treatments without prior written approval from ${a.orgName || "{{organization_name}}"}, except in the case of a life-threatening emergency. All approved veterinary expenses will be covered by ${a.orgName || "{{organization_name}}"}.</li>`);
  }

  if (a.fosterEmergencyProtocol) {
    terms.push(`<li><strong>Emergency Protocol:</strong> In the event of a medical emergency, the Foster Parent shall immediately contact ${a.orgName || "{{organization_name}}"} at <strong>${a.orgPhone || "{{org_phone}}"}</strong>. If unable to reach ${a.orgName || "{{organization_name}}"}, the Foster Parent may seek emergency veterinary care at the nearest emergency veterinary clinic and notify ${a.orgName || "{{organization_name}}"} as soon as possible.</li>`);
  }

  if (a.fosterAdoptionProcess) {
    terms.push(`<li><strong>Adoption Process:</strong> All potential adopters must go through ${a.orgName || "{{organization_name}}"}'s official adoption application process. The Foster Parent shall not make adoption arrangements independently or allow anyone to take possession of the Animal without authorization.</li>`);
  }

  if (a.fosterSupplyProvision) {
    terms.push(`<li><strong>Supplies:</strong> ${a.orgName || "{{organization_name}}"} will provide necessary supplies including food, crate, and basic medical supplies. The Foster Parent may request additional supplies as needed through the foster portal.</li>`);
  }

  if (a.fosterDurationClause) {
    terms.push(`<li><strong>Duration:</strong> This foster arrangement is expected to last approximately <strong>${a.fosterDurationDays} days</strong>, but may be extended or shortened based on the Animal's needs and adoption status. Either party may terminate this agreement with <strong>48 hours</strong> written notice.</li>`);
  } else {
    terms.push(`<li><strong>Duration:</strong> This foster arrangement continues until the Animal is adopted, transferred, or ${a.orgName || "{{organization_name}}"} requests the Animal's return. Either party may terminate this agreement with <strong>48 hours</strong> written notice.</li>`);
  }

  terms.push(`<li><strong>Return of Animal:</strong> The Foster Parent agrees to return the Animal to ${a.orgName || "{{organization_name}}"} upon request within 48 hours, or at any time the Foster Parent can no longer provide care.</li>`);

  if (a.noTieOutClause) {
    terms.push(`<li><strong>No Chaining/Tethering:</strong> The Animal shall not be chained, tied, or tethered outdoors unattended at any time.</li>`);
  }

  sections.push(`<h2>3. Terms of Foster Care</h2>
<div style="background:#fff3cd; border:1px solid #ffc107; padding:10px; margin:10px 0;"><strong>IMPORTANT:</strong> The Animal remains the sole property of ${a.orgName || "{{organization_name}}"}.</div>
<ol>\n${terms.join("\n")}\n</ol>`);

  const additional: string[] = [];
  if (a.photoRelease) {
    additional.push(`<p><strong>Photo Release:</strong> The Foster Parent grants ${a.orgName || "{{organization_name}}"} permission to use photographs and updates of the Animal for promotional and adoption purposes.</p>`);
  }
  if (a.socialMediaConsent) {
    additional.push(`<p><strong>Social Media:</strong> The Foster Parent consents to sharing the Animal's foster journey on ${a.orgName || "{{organization_name}}"}'s social media platforms.</p>`);
  }
  if (additional.length > 0) {
    sections.push(`<h2>4. Additional Provisions</h2>\n${additional.join("\n")}`);
  }

  sections.push(`<div style="margin-top:30px; padding:15px; border:1px solid #ccc; background:#f9f9f9;">
<p><strong>Hold Harmless:</strong> The Foster Parent agrees to hold ${a.orgName || "{{organization_name}}"} harmless from any claims, damages, or injuries arising from the foster care of the Animal, except in cases of gross negligence by ${a.orgName || "{{organization_name}}"}.</p>
</div>`);

  sections.push(`<h2>Foster Parent Acknowledgment & Signature</h2>
<p>By signing below, I acknowledge that I have read, understand, and agree to abide by all terms and conditions of this Foster Care Agreement.</p>
<div style="margin:20px 0; padding:20px; border:1px solid #ddd; background:#f9f9f9;">
  <p><strong>Foster Parent Signature:</strong></p>
  <img src="{{signature_image_url}}" alt="Signature" style="max-width:300px; border-bottom:1px solid #333;" />
  <p><strong>Printed Name:</strong> {{foster_parent_name}}</p>
  <p><strong>Date:</strong> {{contract_date}}</p>
</div>
<p style="font-size:11px; color:#888;">Signed electronically via ${a.orgName || "{{organization_name}}"} foster portal. IP: {{signed_ip}} | Timestamp: {{signed_timestamp}}</p>`);

  const body = sections.join("\n\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${a.orgName || "{{organization_name}}"} - Foster Care Agreement</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a1a1a; font-size: 24px; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #2d2d2d; font-size: 18px; margin-top: 30px; }
    p { margin-bottom: 10px; }
    ol, ul { margin-left: 20px; }
    li { margin-bottom: 8px; }
    .signature-box { margin: 20px 0; padding: 20px; border: 1px solid #ddd; background: #f9f9f9; }
    .signature-box img { max-width: 300px; border-bottom: 1px solid #333; }
    .warning-box { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export function ContractTemplateWizard({
  onComplete,
  onCancel,
  isPending,
  tenantName,
  contractType: initialContractType,
}: ContractTemplateWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({
    ...DEFAULT_ANSWERS,
    contractType: initialContractType || "adoption",
    orgName: tenantName || "",
  });
  const [showPreview, setShowPreview] = useState(false);

  const steps = getSteps(answers.contractType);
  const progress = ((currentStep + 1) / steps.length) * 100;

  const update = (partial: Partial<WizardAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...partial }));
  };

  const canGoNext = () => {
    const step = steps[currentStep];
    if (step.id === "type") return true;
    if (step.id === "org") return answers.orgName.trim().length > 0;
    if (step.id === "review") return answers.templateName.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleComplete = () => {
    const html =
      answers.contractType === "foster"
        ? buildFosterHtml(answers)
        : buildAdoptionHtml(answers);
    const typeLabel =
      answers.contractType === "adoption"
        ? "Adoption"
        : answers.contractType === "foster"
        ? "Foster"
        : "Placement";
    onComplete({
      name: answers.templateName || `${answers.orgName} ${typeLabel} Agreement`,
      description: `Generated by Template Wizard for ${answers.orgName}`,
      htmlTemplate: html,
      editorMode: "richText",
      contractType: answers.contractType,
    });
  };

  const generatedHtml =
    answers.contractType === "foster"
      ? buildFosterHtml(answers)
      : buildAdoptionHtml(answers);

  const renderStep = () => {
    const step = steps[currentStep];

    if (step.id === "type") {
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Choose the type of agreement you want to create. The wizard will
            guide you through the relevant policy questions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                value: "adoption" as ContractType,
                label: "Adoption Agreement",
                desc: "For finalizing animal adoptions with adopters",
              },
              {
                value: "foster" as ContractType,
                label: "Foster Care Agreement",
                desc: "For placing animals with foster families",
              },
            ].map((opt) => (
              <Card
                key={opt.value}
                className={`cursor-pointer transition-colors ${
                  answers.contractType === opt.value
                    ? "border-primary bg-primary/5"
                    : "hover-elevate"
                }`}
                onClick={() => {
                  update({ contractType: opt.value });
                  setCurrentStep(0);
                }}
                data-testid={`card-type-${opt.value}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{opt.label}</CardTitle>
                  <CardDescription className="text-xs">
                    {opt.desc}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (step.id === "org") {
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Your organization details will be embedded throughout the agreement.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Organization Name *</Label>
              <Input
                value={answers.orgName}
                onChange={(e) => update({ orgName: e.target.value })}
                placeholder="e.g., Happy Tails Animal Rescue"
                data-testid="input-wizard-org-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input
                  value={answers.orgState}
                  onChange={(e) => update({ orgState: e.target.value })}
                  placeholder="e.g., Arizona"
                  data-testid="input-wizard-org-state"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={answers.orgPhone}
                  onChange={(e) => update({ orgPhone: e.target.value })}
                  placeholder="e.g., (555) 123-4567"
                  data-testid="input-wizard-org-phone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={answers.orgEmail}
                onChange={(e) => update({ orgEmail: e.target.value })}
                placeholder="e.g., adoptions@happytails.org"
                data-testid="input-wizard-org-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={answers.orgAddress}
                onChange={(e) => update({ orgAddress: e.target.value })}
                placeholder="e.g., 123 Main St, Phoenix, AZ 85001"
                data-testid="input-wizard-org-address"
              />
            </div>
          </div>
        </div>
      );
    }

    if (step.id === "policies") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Configure your core adoption policies. These will be written into
            your contract as legally binding terms.
          </p>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">
                  Spay/Neuter Requirement
                </CardTitle>
                <Switch
                  checked={answers.spayNeuterRequired}
                  onCheckedChange={(v) => update({ spayNeuterRequired: v })}
                  data-testid="switch-spay-neuter"
                />
              </div>
            </CardHeader>
            {answers.spayNeuterRequired && (
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Days to complete</Label>
                    <Input
                      type="number"
                      value={answers.spayNeuterDays}
                      onChange={(e) =>
                        update({
                          spayNeuterDays: parseInt(e.target.value) || 30,
                        })
                      }
                      data-testid="input-spay-neuter-days"
                    />
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={answers.spayNeuterPenalty}
                        onCheckedChange={(v) =>
                          update({ spayNeuterPenalty: v })
                        }
                        data-testid="switch-spay-penalty"
                      />
                      <Label className="text-xs">Include penalty clause</Label>
                    </div>
                  </div>
                </div>
                {answers.spayNeuterPenalty && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Penalty amount ($)</Label>
                    <Input
                      value={answers.spayNeuterPenaltyAmount}
                      onChange={(e) =>
                        update({ spayNeuterPenaltyAmount: e.target.value })
                      }
                      data-testid="input-spay-penalty-amount"
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">Return Policy</CardTitle>
                <Switch
                  checked={answers.returnPolicyEnabled}
                  onCheckedChange={(v) => update({ returnPolicyEnabled: v })}
                  data-testid="switch-return-policy"
                />
              </div>
            </CardHeader>
            {answers.returnPolicyEnabled && (
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Return window (days)</Label>
                    <Input
                      type="number"
                      value={answers.returnPolicyDays}
                      onChange={(e) =>
                        update({
                          returnPolicyDays: parseInt(e.target.value) || 14,
                        })
                      }
                      data-testid="input-return-days"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Refund type</Label>
                    <Select
                      value={answers.returnPolicyRefund}
                      onValueChange={(v: "full" | "partial" | "none") =>
                        update({ returnPolicyRefund: v })
                      }
                    >
                      <SelectTrigger data-testid="select-refund-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No refund</SelectItem>
                        <SelectItem value="full">Full refund</SelectItem>
                        <SelectItem value="partial">Partial refund</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">
                  Veterinary Visit Requirement
                </CardTitle>
                <Switch
                  checked={answers.vetVisitRequired}
                  onCheckedChange={(v) => update({ vetVisitRequired: v })}
                  data-testid="switch-vet-visit"
                />
              </div>
            </CardHeader>
            {answers.vetVisitRequired && (
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Days to complete visit</Label>
                    <Input
                      type="number"
                      value={answers.vetVisitDays}
                      onChange={(e) =>
                        update({ vetVisitDays: parseInt(e.target.value) || 7 })
                      }
                      data-testid="input-vet-days"
                    />
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={answers.vetVisitProofRequired}
                        onCheckedChange={(v) =>
                          update({ vetVisitProofRequired: v })
                        }
                        data-testid="switch-vet-proof"
                      />
                      <Label className="text-xs">Require proof</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      );
    }

    if (step.id === "medical") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Configure medical disclosure and animal care clauses for your
            contract.
          </p>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Medical History Disclosure
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Include vaccination & treatment history clause
                  </p>
                </div>
                <Switch
                  checked={answers.medicalDisclosure}
                  onCheckedChange={(v) => update({ medicalDisclosure: v })}
                  data-testid="switch-medical-disclosure"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Known Conditions Disclosure
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Disclose any known health conditions
                  </p>
                </div>
                <Switch
                  checked={answers.knownConditionsDisclosure}
                  onCheckedChange={(v) =>
                    update({ knownConditionsDisclosure: v })
                  }
                  data-testid="switch-known-conditions"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Behavioral Assessment</p>
                  <p className="text-xs text-muted-foreground">
                    Include behavioral traits disclosure
                  </p>
                </div>
                <Switch
                  checked={answers.behavioralAssessment}
                  onCheckedChange={(v) => update({ behavioralAssessment: v })}
                  data-testid="switch-behavioral"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Animal Care Restrictions</CardTitle>
              <CardDescription className="text-xs">
                Select which care requirements to include in the agreement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm">No chaining / tethering</Label>
                <Switch
                  checked={answers.noTieOutClause}
                  onCheckedChange={(v) => update({ noTieOutClause: v })}
                  data-testid="switch-no-tieout"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm">Indoor-only requirement</Label>
                <Switch
                  checked={answers.indoorOnlyClause}
                  onCheckedChange={(v) => update({ indoorOnlyClause: v })}
                  data-testid="switch-indoor-only"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm">No declawing</Label>
                <Switch
                  checked={answers.noDeclaw}
                  onCheckedChange={(v) => update({ noDeclaw: v })}
                  data-testid="switch-no-declaw"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm">Home visit clause</Label>
                <Switch
                  checked={answers.homeVisitClause}
                  onCheckedChange={(v) => update({ homeVisitClause: v })}
                  data-testid="switch-home-visit"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (step.id === "financial") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Configure the financial terms for your adoption agreement.
          </p>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">
                  Adoption Fee Section
                </CardTitle>
                <Switch
                  checked={answers.adoptionFeeIncluded}
                  onCheckedChange={(v) => update({ adoptionFeeIncluded: v })}
                  data-testid="switch-adoption-fee"
                />
              </div>
            </CardHeader>
            {answers.adoptionFeeIncluded && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">Refund Policy</Label>
                  <Select
                    value={answers.refundPolicy}
                    onValueChange={(
                      v: "no_refund" | "within_period" | "case_by_case"
                    ) => update({ refundPolicy: v })}
                  >
                    <SelectTrigger data-testid="select-refund-policy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_refund">
                        Non-refundable
                      </SelectItem>
                      <SelectItem value="within_period">
                        Refundable within time period
                      </SelectItem>
                      <SelectItem value="case_by_case">
                        Case-by-case basis
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {answers.refundPolicy === "within_period" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Refund window (days)</Label>
                    <Input
                      type="number"
                      value={answers.refundDays}
                      onChange={(e) =>
                        update({ refundDays: parseInt(e.target.value) || 14 })
                      }
                      data-testid="input-refund-days"
                    />
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium">Deposit Required</p>
                    <p className="text-xs text-muted-foreground">
                      Require a non-refundable deposit to hold animals
                    </p>
                  </div>
                  <Switch
                    checked={answers.depositRequired}
                    onCheckedChange={(v) => update({ depositRequired: v })}
                    data-testid="switch-deposit"
                  />
                </div>
                {answers.depositRequired && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Deposit amount ($)</Label>
                    <Input
                      value={answers.depositAmount}
                      onChange={(e) =>
                        update({ depositAmount: e.target.value })
                      }
                      data-testid="input-deposit-amount"
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      );
    }

    if (step.id === "foster_policies") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Configure the core policies for your foster care agreement.
          </p>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Property/Ownership Clause
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Animal remains property of the rescue
                  </p>
                </div>
                <Switch
                  checked={answers.fosterPropertyClause}
                  onCheckedChange={(v) => update({ fosterPropertyClause: v })}
                  data-testid="switch-foster-property"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Adoption Process Control
                  </p>
                  <p className="text-xs text-muted-foreground">
                    All adopters must go through official process
                  </p>
                </div>
                <Switch
                  checked={answers.fosterAdoptionProcess}
                  onCheckedChange={(v) => update({ fosterAdoptionProcess: v })}
                  data-testid="switch-foster-adoption"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">No chaining / tethering</p>
                  <p className="text-xs text-muted-foreground">
                    Animal shall not be kept chained or tied outdoors
                  </p>
                </div>
                <Switch
                  checked={answers.noTieOutClause}
                  onCheckedChange={(v) => update({ noTieOutClause: v })}
                  data-testid="switch-foster-no-tieout"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">
                  Foster Duration Clause
                </CardTitle>
                <Switch
                  checked={answers.fosterDurationClause}
                  onCheckedChange={(v) => update({ fosterDurationClause: v })}
                  data-testid="switch-foster-duration"
                />
              </div>
            </CardHeader>
            {answers.fosterDurationClause && (
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Expected duration (days)
                  </Label>
                  <Input
                    type="number"
                    value={answers.fosterDurationDays}
                    onChange={(e) =>
                      update({
                        fosterDurationDays: parseInt(e.target.value) || 90,
                      })
                    }
                    data-testid="input-foster-duration-days"
                  />
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      );
    }

    if (step.id === "foster_care") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Configure care standards and medical authorization clauses for your
            foster agreement.
          </p>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Care Standards</p>
                  <p className="text-xs text-muted-foreground">
                    Food, water, shelter, indoor requirements
                  </p>
                </div>
                <Switch
                  checked={answers.fosterCareStandards}
                  onCheckedChange={(v) => update({ fosterCareStandards: v })}
                  data-testid="switch-foster-care-standards"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">
                    Medical Authorization Required
                  </p>
                  <p className="text-xs text-muted-foreground">
                    No vet care without rescue approval (except emergencies)
                  </p>
                </div>
                <Switch
                  checked={answers.fosterMedicalAuth}
                  onCheckedChange={(v) => update({ fosterMedicalAuth: v })}
                  data-testid="switch-foster-medical-auth"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Emergency Protocol</p>
                  <p className="text-xs text-muted-foreground">
                    Instructions for medical emergencies
                  </p>
                </div>
                <Switch
                  checked={answers.fosterEmergencyProtocol}
                  onCheckedChange={(v) =>
                    update({ fosterEmergencyProtocol: v })
                  }
                  data-testid="switch-foster-emergency"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Supply Provision</p>
                  <p className="text-xs text-muted-foreground">
                    Rescue provides food, crate, and basic supplies
                  </p>
                </div>
                <Switch
                  checked={answers.fosterSupplyProvision}
                  onCheckedChange={(v) => update({ fosterSupplyProvision: v })}
                  data-testid="switch-foster-supply"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (step.id === "additional") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Choose additional provisions to include in your agreement.
          </p>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Photo Release</p>
                  <p className="text-xs text-muted-foreground">
                    Permission to use animal photos for promotion
                  </p>
                </div>
                <Switch
                  checked={answers.photoRelease}
                  onCheckedChange={(v) => update({ photoRelease: v })}
                  data-testid="switch-photo-release"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">Social Media Consent</p>
                  <p className="text-xs text-muted-foreground">
                    Share adoption/foster story on social media
                  </p>
                </div>
                <Switch
                  checked={answers.socialMediaConsent}
                  onCheckedChange={(v) => update({ socialMediaConsent: v })}
                  data-testid="switch-social-media"
                />
              </div>
              {answers.contractType === "adoption" && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        Microchip Transfer
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Transfer microchip registration to adopter
                      </p>
                    </div>
                    <Switch
                      checked={answers.microchipTransfer}
                      onCheckedChange={(v) => update({ microchipTransfer: v })}
                      data-testid="switch-microchip"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    if (step.id === "review") {
      return (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            Review your selections and give your template a name. You can edit
            the full contract in the template editor after creation.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Template Name *</Label>
              <Input
                value={answers.templateName}
                onChange={(e) => update({ templateName: e.target.value })}
                placeholder={`e.g., ${answers.orgName || "My Rescue"} ${answers.contractType === "foster" ? "Foster" : "Adoption"} Agreement`}
                data-testid="input-wizard-template-name"
              />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Configuration Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium capitalize">
                  {answers.contractType}
                </span>
                <span className="text-muted-foreground">Organization:</span>
                <span className="font-medium">{answers.orgName || "-"}</span>
                {answers.contractType === "adoption" && (
                  <>
                    <span className="text-muted-foreground">
                      Spay/Neuter:
                    </span>
                    <span>
                      {answers.spayNeuterRequired
                        ? `Required within ${answers.spayNeuterDays} days`
                        : "Not required"}
                    </span>
                    <span className="text-muted-foreground">
                      Return Policy:
                    </span>
                    <span>
                      {answers.returnPolicyEnabled
                        ? `${answers.returnPolicyDays}-day window`
                        : "No return policy"}
                    </span>
                    <span className="text-muted-foreground">
                      Vet Visit:
                    </span>
                    <span>
                      {answers.vetVisitRequired
                        ? `Within ${answers.vetVisitDays} days`
                        : "Not required"}
                    </span>
                    <span className="text-muted-foreground">
                      Refund Policy:
                    </span>
                    <span className="capitalize">
                      {answers.refundPolicy.replace("_", " ")}
                    </span>
                  </>
                )}
                {answers.contractType === "foster" && (
                  <>
                    <span className="text-muted-foreground">
                      Property Clause:
                    </span>
                    <span>
                      {answers.fosterPropertyClause ? "Included" : "Not included"}
                    </span>
                    <span className="text-muted-foreground">
                      Medical Auth:
                    </span>
                    <span>
                      {answers.fosterMedicalAuth ? "Required" : "Not required"}
                    </span>
                    <span className="text-muted-foreground">Duration:</span>
                    <span>
                      {answers.fosterDurationClause
                        ? `~${answers.fosterDurationDays} days`
                        : "Until adopted/returned"}
                    </span>
                  </>
                )}
              </div>

              <Separator className="my-3" />

              <div className="flex flex-wrap gap-1.5">
                {answers.photoRelease && (
                  <Badge variant="secondary">Photo Release</Badge>
                )}
                {answers.socialMediaConsent && (
                  <Badge variant="secondary">Social Media</Badge>
                )}
                {answers.contractType === "adoption" &&
                  answers.microchipTransfer && (
                    <Badge variant="secondary">Microchip Transfer</Badge>
                  )}
                {answers.noTieOutClause && (
                  <Badge variant="secondary">No Tethering</Badge>
                )}
                {answers.contractType === "adoption" &&
                  answers.indoorOnlyClause && (
                    <Badge variant="secondary">Indoor Only</Badge>
                  )}
                {answers.contractType === "adoption" && answers.noDeclaw && (
                  <Badge variant="secondary">No Declaw</Badge>
                )}
                {answers.contractType === "adoption" &&
                  answers.homeVisitClause && (
                    <Badge variant="secondary">Home Visit</Badge>
                  )}
                {answers.medicalDisclosure && (
                  <Badge variant="secondary">Medical Disclosure</Badge>
                )}
                {answers.behavioralAssessment && (
                  <Badge variant="secondary">Behavioral Assessment</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowPreview(!showPreview)}
            data-testid="button-preview-contract"
          >
            <Eye className="h-4 w-4 mr-2" />
            {showPreview ? "Hide Preview" : "Preview Generated Contract"}
          </Button>

          {showPreview && (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div
                    className="p-6 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(generatedHtml, {
                        ALLOWED_TAGS: [
                          "html", "head", "body", "title", "meta", "style",
                          "div", "span", "p", "h1", "h2", "h3", "h4",
                          "strong", "em", "u", "br", "hr", "ul", "ol", "li",
                          "table", "thead", "tbody", "tr", "th", "td", "img",
                          "a",
                        ],
                        ALLOWED_ATTR: [
                          "class", "id", "style", "href", "src", "alt",
                          "title", "target", "colspan", "rowspan",
                        ],
                        ALLOW_DATA_ATTR: false,
                      }),
                    }}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-md bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Contract Template Wizard</h2>
          <p className="text-sm text-muted-foreground">
            Answer a few questions and we'll build your contract template
          </p>
        </div>
      </div>

      <Progress value={progress} className="h-1.5" />

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              )}
              <button
                type="button"
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : isDone
                    ? "text-muted-foreground cursor-pointer"
                    : "text-muted-foreground/50 cursor-default"
                }`}
                disabled={i > currentStep}
                data-testid={`wizard-step-${step.id}`}
              >
                {isDone ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {step.label}
              </button>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {(() => {
              const Icon = steps[currentStep].icon;
              return <Icon className="h-4 w-4" />;
            })()}
            {steps[currentStep].label}
          </CardTitle>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={currentStep === 0 ? onCancel : handleBack}
          data-testid="button-wizard-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 0 ? "Cancel" : "Back"}
        </Button>

        {currentStep < steps.length - 1 ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext()}
            data-testid="button-wizard-next"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleComplete}
            disabled={!canGoNext() || isPending}
            data-testid="button-wizard-create"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Template
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
