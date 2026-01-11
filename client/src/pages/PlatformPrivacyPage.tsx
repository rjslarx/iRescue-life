import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint } from "lucide-react";

export default function PlatformPrivacyPage() {
  useSEO({
    title: "Privacy Policy - iRescue.life",
    description: "Privacy Policy for iRescue.life animal rescue management platform, operated by Turbeau, LLC.",
    siteName: "iRescue.life",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/platform">
              <a className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                  <PawPrint className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl">iRescue.life</span>
              </a>
            </Link>
            <Link href="/platform">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container max-w-4xl mx-auto px-6 py-12 sm:py-16">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold" data-testid="heading-privacy">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground text-lg">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Introduction</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                iRescue.life is owned and operated by Turbeau, LLC ("we," "us," or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our animal rescue management platform and services.
              </p>
              <p>
                We are committed to protecting your privacy and ensuring the security of your personal information. By using iRescue.life, you agree to the collection and use of information in accordance with this policy.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Information We Collect</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Personal Information</h3>
              <p>We may collect the following types of personal information:</p>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, password, organization details</li>
                <li><strong>Contact Information:</strong> Phone number, mailing address</li>
                <li><strong>Payment Information:</strong> Billing address, payment card details (processed securely by Stripe)</li>
                <li><strong>Profile Information:</strong> Job title, role within organization, preferences</li>
              </ul>

              <h3>Animal and Rescue Data</h3>
              <p>As a multi-tenant SaaS platform for animal rescues, we store:</p>
              <ul>
                <li>Animal records (names, species, medical information, photos)</li>
                <li>Adoption applications and applicant information</li>
                <li>Volunteer and foster caregiver information</li>
                <li>Donation and donor records</li>
                <li>Event and calendar information</li>
                <li>Communication and newsletter subscriber data</li>
              </ul>

              <h3>Technical Information</h3>
              <ul>
                <li>IP address, browser type, device information</li>
                <li>Usage data, analytics, and interaction with our platform</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How We Use Your Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send transaction notifications</li>
                <li>Send administrative information, updates, and security alerts</li>
                <li>Respond to customer service requests and support needs</li>
                <li>Monitor and analyze usage trends and improve user experience</li>
                <li>Detect, prevent, and address technical issues or fraudulent activity</li>
                <li>Comply with legal obligations and enforce our terms</li>
                <li>Send marketing communications (with your consent, where required)</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Sharing and Disclosure</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Multi-Tenant Data Isolation</h3>
              <p>
                iRescue.life is a multi-tenant platform. Your organization's data is logically isolated from other tenants and is not shared with other rescue organizations using the platform.
              </p>

              <h3>Third-Party Service Providers</h3>
              <p>We may share your information with trusted third-party service providers who assist us in operating our platform:</p>
              <ul>
                <li><strong>Stripe:</strong> Payment processing</li>
                <li><strong>Resend:</strong> Email delivery services</li>
                <li><strong>Google Workspace:</strong> Optional integration for email, calendar, and storage (if enabled by your organization)</li>
                <li><strong>OpenAI:</strong> AI-powered help assistant features</li>
                <li><strong>Cloud Infrastructure Providers:</strong> Hosting and data storage</li>
              </ul>

              <h3>Legal Requirements</h3>
              <p>We may disclose your information if required to do so by law or in response to valid requests by public authorities.</p>

              <h3>Business Transfers</h3>
              <p>In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Security</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>We implement appropriate technical and organizational security measures to protect your information, including:</p>
              <ul>
                <li>AES-256-GCM encryption for sensitive data</li>
                <li>Secure password hashing using bcrypt</li>
                <li>HTTPS/TLS encryption for data in transit</li>
                <li>Role-based access control (RBAC)</li>
                <li>Multi-factor authentication (MFA) for administrative accounts</li>
                <li>Regular security audits and monitoring</li>
                <li>Secure session management</li>
              </ul>
              <p>
                However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee its absolute security.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We retain your information for as long as your account is active or as needed to provide you services. We will retain and use your information as necessary to comply with our legal obligations, resolve disputes, and enforce our agreements.
              </p>
              <p>
                Organizations may export their data at any time. Upon account cancellation, data is retained for a grace period before permanent deletion, unless otherwise required by law.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Rights and Choices</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>Depending on your location, you may have certain rights regarding your personal information:</p>
              <ul>
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Data Portability:</strong> Request a copy of your data in a structured format</li>
                <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              </ul>
              <p>
                To exercise these rights, please contact us at the information provided below.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cookies and Tracking</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We use cookies and similar tracking technologies to track activity on our platform and store certain information. You can instruct your browser to refuse all cookies or indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our service.
              </p>
              <p>We use Google Analytics to analyze usage of our platform. You can opt-out of Google Analytics tracking.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>International Data Transfers</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ. By using iRescue.life, you consent to such transfers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changes to This Privacy Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>If you have questions about this Privacy Policy, please contact us:</p>
              <p>
                <strong>Turbeau, LLC</strong><br />
                Email: <a href="mailto:privacy@irescue.life" className="text-primary hover:underline">privacy@irescue.life</a><br />
                Website: <a href="https://irescue.life" className="text-primary hover:underline">https://irescue.life</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30 mt-12">
        <div className="container max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Turbeau, LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
