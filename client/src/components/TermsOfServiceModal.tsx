import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface TermsOfServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenContact?: () => void;
}

export function TermsOfServiceModal({ open, onOpenChange, onOpenContact }: TermsOfServiceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-[#5B7B6B]" />
            <Badge variant="secondary" className="text-xs">
              Legal
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-bold">
            Terms of Service for iRescue.life
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Last Updated: November 26, 2025
          </p>
        </DialogHeader>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-foreground">
          
          <p className="text-sm leading-relaxed">
            Welcome to iRescue.life. These Terms of Service ("Terms") constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you" or "Client") and iRescue.life ("we," "us," or "our"), concerning your access to and use of the iRescue.life website and application (the "Service").
          </p>

          <p className="text-sm leading-relaxed">
            By accessing or using the Service, you agree that you have read, understood, and agree to be bound by all of these Terms. If you do not agree with all of these terms, then you are expressly prohibited from using the Service and you must discontinue use immediately.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">1. Description of Service</h2>
          <p className="text-sm leading-relaxed">
            iRescue.life provides a cloud-based management platform designed for animal rescue organizations. The Service allows organizations to manage animal records, coordinate volunteers and fosters, track medical history, and integrate with third-party tools.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">2. Account Registration and Security</h2>
          <p className="text-sm leading-relaxed">
            To access the Service, you must register for an account. You agree to:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>Provide accurate, current, and complete information during the registration process.</li>
            <li>Maintain the security of your password and accept all risks of unauthorized access to your account.</li>
            <li>Notify us immediately if you discover or suspect any security breaches related to the Service.</li>
          </ul>
          <p className="text-sm leading-relaxed mt-3">
            You are responsible for all activities that occur under your account, including the activities of any staff members, volunteers, or fosters to whom you grant access.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">3. Subscription and Payment</h2>
          
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">A. Free Trial</h3>
          <p className="text-sm leading-relaxed">
            We offer a 30-day free trial to new organizations. You are not required to enter payment information to begin the trial. At the end of the 30-day period, you must select a subscription plan and provide valid payment information to continue using the Service. If you do not upgrade, your account access may be restricted or suspended.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">B. Fees and Billing</h3>
          <p className="text-sm leading-relaxed">
            By selecting a subscription plan, you agree to pay the fees associated with that plan. Fees are billed in advance on a recurring basis (monthly or annually) and are non-refundable, except as required by law.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">C. Cancellation</h3>
          <p className="text-sm leading-relaxed">
            You may cancel your subscription at any time via your account dashboard. Your cancellation will take effect at the end of the current paid term.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">4. User Data and Content</h2>
          
          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">A. Ownership</h3>
          <p className="text-sm leading-relaxed">
            You retain all rights, title, and interest in and to the data, files, and information you upload to the Service ("User Data"), including animal records, adopter information, and volunteer lists. iRescue.life does not claim ownership of your data.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">B. License to Host</h3>
          <p className="text-sm leading-relaxed">
            By uploading User Data to the Service, you grant iRescue.life a non-exclusive, worldwide, royalty-free license to host, copy, display, and use your User Data solely as necessary to provide the Service to you (e.g., to display records on your dashboard or public profile).
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">C. Data Responsibility</h3>
          <p className="text-sm leading-relaxed">
            You are solely responsible for the accuracy, quality, integrity, and legality of your User Data. You represent and warrant that you have obtained all necessary consents (e.g., from adopters or volunteers) to collect and store their personal information within the Service.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">5. Acceptable Use Policy</h2>
          <p className="text-sm leading-relaxed">
            You agree not to use the Service to:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>Violate any applicable federal, state, local, or international law or regulation.</li>
            <li>Upload or transmit viruses, Trojan horses, or other malicious code.</li>
            <li>Attempt to reverse engineer, decompile, or disassemble any portion of the Service.</li>
            <li>Harass, abuse, or harm another person or group.</li>
            <li>Send unsolicited mass emails (spam) utilizing the platform's communication tools.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">6. Medical Disclaimer</h2>
          <p className="text-sm leading-relaxed">
            The Service is for record-keeping and administrative purposes only. iRescue.life is not a veterinary service and does not provide medical advice, diagnosis, or treatment. The features allowing for the tracking of medical records and medication reminders are tools to assist you, but they are not a substitute for professional veterinary care. We are not liable for any health outcomes of animals managed through the Service.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">7. Third-Party Integrations</h2>
          <p className="text-sm leading-relaxed">
            The Service may contain links to or integrations with third-party websites or services (e.g., Google Workspace, payment processors, chip registries). These are provided for your convenience. iRescue.life has no control over and assumes no responsibility for the content, privacy policies, or practices of any third-party services.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">8. Intellectual Property</h2>
          <p className="text-sm leading-relaxed">
            The Service, including its underlying code, design, logos, and graphics (excluding your User Data), is the proprietary property of iRescue.life and is protected by copyright, trademark, and other intellectual property laws.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">9. Limitation of Liability</h2>
          <p className="text-sm leading-relaxed">
            To the fullest extent permitted by law, in no event will iRescue.life, its directors, employees, or agents be liable to you or any third party for any direct, indirect, consequential, exemplary, incidental, special, or punitive damages, including lost profit, lost revenue, loss of data, or other damages arising from your use of the Service, even if we have been advised of the possibility of such damages.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">10. Indemnification</h2>
          <p className="text-sm leading-relaxed">
            You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys' fees, made by any third party due to or arising out of: (1) your use of the Service; (2) breach of these Terms; or (3) your violation of the rights of a third party, including but not limited to intellectual property rights.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">11. Governing Law</h2>
          <p className="text-sm leading-relaxed">
            These Terms shall be governed by and defined following the laws of the State of Louisiana, without regard to its conflict of law provisions. You and iRescue.life consent that any legal action or proceeding related to these Terms shall be brought exclusively in the federal or state courts located in Lafayette Parish, Louisiana.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">12. Modifications to Terms</h2>
          <p className="text-sm leading-relaxed">
            We reserve the right to change, modify, or remove the contents of these Terms at any time or for any reason at our sole discretion. We will alert you about any changes by updating the "Last Updated" date of these Terms. Your continued use of the Service constitutes your acceptance of such changes.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">13. Contact Us</h2>
          <p className="text-sm leading-relaxed">
            To resolve a complaint regarding the Service or to receive further information regarding use of the Service, please contact us at:
          </p>
          
          <div className="bg-muted/50 rounded-lg p-4 mt-2">
            <p className="text-sm font-semibold mb-1">iRescue.life</p>
            <p className="text-sm text-muted-foreground mb-2">107 Dumaine St., Lafayette, LA 70506</p>
            {onOpenContact && (
              <button 
                onClick={() => {
                  onOpenChange(false);
                  onOpenContact();
                }}
                className="text-sm text-[#5B7B6B] hover:underline font-medium"
                data-testid="link-contact-from-terms"
              >
                Contact Us Form
              </button>
            )}
          </div>

        </article>
      </DialogContent>
    </Dialog>
  );
}
