import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";

interface PrivacyPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenContact?: () => void;
}

export function PrivacyPolicyModal({ open, onOpenChange, onOpenContact }: PrivacyPolicyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-[#5B7B6B]" />
            <Badge variant="secondary" className="text-xs">
              Legal
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-bold">
            Privacy Policy for iRescue.life
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Last Updated: November 26, 2025
          </p>
        </DialogHeader>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-foreground">
          
          <p className="text-sm leading-relaxed">
            At iRescue.life ("we," "us," or "our"), we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our animal rescue management platform (the "Service").
          </p>

          <p className="text-sm leading-relaxed">
            By accessing or using iRescue.life, you agree to the terms of this Privacy Policy. If you do not agree with the terms of this policy, please do not access the site or use our services.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">1. Information We Collect</h2>
          
          <p className="text-sm leading-relaxed">
            We collect information that you provide directly to us when you register for an account, create a rescue profile, or use the management features of the platform.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">A. Personal Information</h3>
          <p className="text-sm leading-relaxed">
            When you register for an iRescue.life account (as a Founder, Administrator, Staff, or Volunteer), we may collect personally identifiable information, including but not limited to:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>Full Name</li>
            <li>Email Address</li>
            <li>Phone Number</li>
            <li>Mailing Address</li>
            <li>Organization Name and Non-Profit Tax ID (EIN)</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">B. Operational Data (Client Data)</h3>
          <p className="text-sm leading-relaxed">
            In providing our services, you may upload data regarding your rescue operations ("Operational Data"). While iRescue.life processes and stores this data, <strong>you (the Rescue Organization) retain ownership of this data.</strong> This includes:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Animal Records:</strong> Names, medical history, microchip numbers, intake/outcome data.</li>
            <li><strong>Associate Data:</strong> Names, contact info, and notes regarding fosters, volunteers, and adopters.</li>
            <li><strong>Files:</strong> Images, PDFs, and documents uploaded to the system.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">C. Usage and Technical Data</h3>
          <p className="text-sm leading-relaxed">
            We automatically collect certain information when you visit, use, or navigate the Service. This information does not reveal your specific identity (like your name or contact information) but may include:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>IP address</li>
            <li>Browser and device characteristics</li>
            <li>Operating system</li>
            <li>Language preferences</li>
            <li>Referring URLs</li>
            <li>Information about how and when you use our Service (log data).</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">2. How We Use Your Information</h2>
          
          <p className="text-sm leading-relaxed">
            We use the information we collect or receive for the following purposes:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>To Provide the Service:</strong> To create accounts, manage logins, and facilitate the features of the platform (e.g., animal tracking, medical records management, foster coordination).</li>
            <li><strong>To Process Transactions:</strong> To manage your subscription (if applicable) and account status.</li>
            <li><strong>To Communicate:</strong> To send you administrative information, such as product updates, security alerts, and support messages.</li>
            <li><strong>To Integrate Services:</strong> To facilitate connections with third-party services (e.g., Google Workspace for Nonprofits) at your specific direction.</li>
            <li><strong>To Improve Our Platform:</strong> To analyze usage trends and improve the user experience.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">3. How We Share Your Information</h2>
          
          <p className="text-sm leading-relaxed">
            We do not sell, trade, or rent your personal information to third parties. We may share information in the following situations:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Service Providers:</strong> We may share data with third-party vendors, service providers, contractors, or agents who perform services for us or on our behalf and require access to such information to do that work (e.g., payment processing, data hosting, email delivery).</li>
            <li><strong>Legal Obligations:</strong> We may disclose your information where we are legally required to do so in order to comply with applicable law, governmental requests, a judicial proceeding, court order, or legal process.</li>
            <li><strong>Business Transfers:</strong> If iRescue.life is involved in a merger, acquisition, or sale of all or a portion of its assets, your information may be transferred as part of that transaction.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">4. Third-Party Integrations</h2>
          
          <p className="text-sm leading-relaxed">
            iRescue.life allows you to integrate with third-party services (such as Google Workspace, payment processors, or chip registries) to enhance your rescue operations. If you choose to use these integrations, you grant us permission to share your information with these third parties as necessary to provide the integration. We are not responsible for the privacy practices of these third-party services, and we encourage you to review their privacy policies.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">5. Data Security</h2>
          
          <p className="text-sm leading-relaxed">
            We use administrative, technical, and physical security measures to help protect your personal information and Operational Data. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">6. Your Data Rights</h2>
          
          <p className="text-sm leading-relaxed">
            Depending on your location, you may have the following rights regarding your data:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Access and Correction:</strong> You may review or change the information in your account settings at any time.</li>
            <li><strong>Data Portability:</strong> You can export your Operational Data through the platform's export features.</li>
            <li><strong>Account Termination:</strong> You may terminate your account at any time. Upon request to terminate your account, we will deactivate or delete your account and information from our active databases, subject to data retention required by law.</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">7. Children's Privacy</h2>
          
          <p className="text-sm leading-relaxed">
            Our Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us so that we can delete such information.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">8. Updates to This Policy</h2>
          
          <p className="text-sm leading-relaxed">
            We may update this privacy policy from time to time. The updated version will be indicated by an updated "Revised" date and the updated version will be effective as soon as it is accessible. We encourage you to review this privacy policy frequently to be informed of how we are protecting your information.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">9. Contact Us</h2>
          
          <p className="text-sm leading-relaxed">
            If you have questions or comments about this policy, you may contact us at:
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
                data-testid="link-contact-from-privacy"
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
