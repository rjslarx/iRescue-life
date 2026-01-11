import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Cookie } from "lucide-react";

interface CookiePolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenContact?: () => void;
}

export function CookiePolicyModal({ open, onOpenChange, onOpenContact }: CookiePolicyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Cookie className="h-5 w-5 text-[#5B7B6B]" />
            <Badge variant="secondary" className="text-xs">
              Legal
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-bold">
            Cookie Policy for iRescue.life
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Last Updated: November 26, 2025
          </p>
        </DialogHeader>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-foreground">
          
          <p className="text-sm leading-relaxed">
            This Cookie Policy explains how iRescue.life, operated by Turbeau, LLC ("we," "us," or "our"), uses cookies and similar tracking technologies when you visit our website and use our animal rescue management platform (the "Service").
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">1. What Are Cookies?</h2>
          
          <p className="text-sm leading-relaxed">
            Cookies are small text files that are stored on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work more efficiently, provide a better user experience, and give website owners information about how users interact with their site.
          </p>

          <p className="text-sm leading-relaxed">
            Cookies can be "persistent" (they remain on your device until deleted or until they expire) or "session" cookies (they are deleted when you close your browser).
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">2. How We Use Cookies</h2>
          
          <p className="text-sm leading-relaxed">
            We use cookies and similar technologies for several purposes:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">A. Essential Cookies</h3>
          <p className="text-sm leading-relaxed">
            These cookies are strictly necessary for the operation of our Service. They enable core functionality such as:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Authentication:</strong> Keeping you logged in as you navigate between pages</li>
            <li><strong>Session Management:</strong> Maintaining your session state and security tokens</li>
            <li><strong>Security:</strong> Protecting against cross-site request forgery (CSRF) attacks</li>
            <li><strong>Tenant Identification:</strong> Recognizing which rescue organization's portal you are accessing</li>
          </ul>
          <p className="text-sm leading-relaxed mt-2">
            <strong>Note:</strong> You cannot opt out of essential cookies as they are required for the Service to function properly.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">B. Functional Cookies</h3>
          <p className="text-sm leading-relaxed">
            These cookies allow us to remember choices you make (such as your preferred language or theme settings) and provide enhanced, personalized features:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Preferences:</strong> Remembering your display preferences (dark/light mode)</li>
            <li><strong>Recent Activity:</strong> Storing recently visited pages for quick navigation</li>
            <li><strong>Form Data:</strong> Remembering form inputs to prevent data loss</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">C. Analytics Cookies</h3>
          <p className="text-sm leading-relaxed">
            We use analytics cookies to understand how visitors interact with our website. This helps us improve our Service and user experience:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Google Analytics (GA4):</strong> We use Google Analytics to collect information about how you use our Service. Google Analytics collects information such as how often users visit the site, what pages they visit, and what other sites they used before coming to our site.</li>
          </ul>
          <p className="text-sm leading-relaxed mt-2">
            Google Analytics uses cookies to collect this information. The information generated is used to compile reports and help us improve the Service. Google's ability to use and share information collected by Google Analytics is restricted by the Google Analytics Terms of Service and the Google Privacy Policy.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">3. Third-Party Cookies</h2>
          
          <p className="text-sm leading-relaxed">
            In addition to our own cookies, we may also use various third-party cookies to report usage statistics and deliver advertisements:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Stripe:</strong> For secure payment processing (if using paid subscription features)</li>
            <li><strong>Google:</strong> For Google Workspace integrations (if enabled by your organization)</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">4. Managing Cookies</h2>
          
          <p className="text-sm leading-relaxed">
            Most web browsers allow you to control cookies through their settings. You can typically:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li>View the cookies stored on your device</li>
            <li>Allow, block, or delete cookies (all or specific ones)</li>
            <li>Set preferences for certain websites</li>
            <li>Block third-party cookies while allowing first-party cookies</li>
          </ul>

          <p className="text-sm leading-relaxed mt-2">
            <strong>Important:</strong> If you disable or block essential cookies, some parts of the Service may become inaccessible or not function properly. For example, you may not be able to log in or access your rescue's portal.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">Browser-Specific Instructions</h3>
          <p className="text-sm leading-relaxed">
            To manage cookies in your browser, please refer to your browser's help documentation:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Chrome:</strong> Settings &gt; Privacy and security &gt; Cookies and other site data</li>
            <li><strong>Firefox:</strong> Settings &gt; Privacy & Security &gt; Cookies and Site Data</li>
            <li><strong>Safari:</strong> Preferences &gt; Privacy &gt; Manage Website Data</li>
            <li><strong>Edge:</strong> Settings &gt; Cookies and site permissions &gt; Cookies and site data</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">5. Local Storage and Similar Technologies</h2>
          
          <p className="text-sm leading-relaxed">
            In addition to cookies, we may use other similar technologies such as:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5">
            <li><strong>Local Storage:</strong> To store data locally on your browser for improved performance</li>
            <li><strong>Session Storage:</strong> To store temporary data that is cleared when you close your browser</li>
            <li><strong>Service Workers:</strong> For Progressive Web App (PWA) functionality including offline access</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">6. Do Not Track Signals</h2>
          
          <p className="text-sm leading-relaxed">
            Some browsers have a "Do Not Track" feature that lets you tell websites that you do not want to have your online activities tracked. We currently do not respond to "Do Not Track" signals as there is no industry-standard approach to implementing this feature.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">7. Updates to This Cookie Policy</h2>
          
          <p className="text-sm leading-relaxed">
            We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. The updated version will be indicated by an updated "Last Updated" date. We encourage you to review this Cookie Policy periodically.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-6 mb-3">8. Contact Us</h2>
          
          <p className="text-sm leading-relaxed">
            If you have questions about our use of cookies or this Cookie Policy, please contact us at:
          </p>
          
          <div className="bg-muted/50 rounded-lg p-4 mt-2">
            <p className="text-sm font-semibold mb-1">iRescue.life</p>
            <p className="text-sm text-muted-foreground mb-2">Operated by Turbeau, LLC</p>
            <p className="text-sm text-muted-foreground mb-2">107 Dumaine St., Lafayette, LA 70506</p>
            {onOpenContact && (
              <button 
                onClick={() => {
                  onOpenChange(false);
                  onOpenContact();
                }}
                className="text-sm text-[#5B7B6B] hover:underline font-medium"
                data-testid="link-contact-from-cookies"
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
