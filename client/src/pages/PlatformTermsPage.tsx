import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint } from "lucide-react";

export default function PlatformTermsPage() {
  useSEO({
    title: "Terms of Use - iRescue.life",
    description: "Terms of Use for iRescue.life animal rescue management platform, operated by Turbeau, LLC.",
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
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold" data-testid="heading-terms">
              Terms of Use
            </h1>
            <p className="text-muted-foreground text-lg">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Agreement to Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                Welcome to iRescue.life, owned and operated by Turbeau, LLC ("Company," "we," "us," or "our"). These Terms of Use ("Terms") govern your access to and use of the iRescue.life platform, website, and services (collectively, the "Services").
              </p>
              <p>
                By accessing or using our Services, you agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you may not access or use our Services.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description of Services</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                iRescue.life is a comprehensive multi-tenant SaaS platform designed for animal rescue organizations. Our Services include:
              </p>
              <ul>
                <li>Animal management and tracking systems</li>
                <li>Adoption application workflows</li>
                <li>Donation processing and financial management</li>
                <li>Volunteer and foster caregiver coordination</li>
                <li>Medical records and billing</li>
                <li>Public-facing adoption websites</li>
                <li>Communication and email campaign tools</li>
                <li>AI-powered help assistant</li>
                <li>Mobile Progressive Web App (PWA)</li>
                <li>Optional third-party integrations</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Registration and Security</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Account Creation</h3>
              <p>To use certain features of our Services, you must create an account. You agree to:</p>
              <ul>
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security of your password and account</li>
                <li>Notify us immediately of any unauthorized access or security breach</li>
                <li>Accept responsibility for all activities that occur under your account</li>
              </ul>

              <h3>Organizational Accounts</h3>
              <p>
                Accounts are created for organizations (tenants). The person creating the account represents that they have authority to bind the organization to these Terms.
              </p>

              <h3>Account Security</h3>
              <p>
                You are responsible for safeguarding your password. We recommend using strong passwords and enabling multi-factor authentication (MFA) for administrative accounts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription and Payment Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Subscription Plans</h3>
              <p>
                We offer multiple subscription tiers with varying features and pricing. Current pricing is available on our website. All fees are stated in U.S. Dollars unless otherwise specified.
              </p>

              <h3>Free Trial</h3>
              <p>
                New subscriptions include a 30-day free trial period. At the end of the trial, your subscription will automatically convert to a paid plan unless you cancel. No credit card is required to start your trial.
              </p>

              <h3>Payment</h3>
              <ul>
                <li>Subscriptions are billed in advance on a monthly or annual basis</li>
                <li>Payment is processed securely through Stripe</li>
                <li>You authorize us to charge your payment method for all applicable fees</li>
                <li>All fees are non-refundable except as required by law</li>
              </ul>

              <h3>Price Changes</h3>
              <p>
                We reserve the right to modify subscription fees. We will provide advance notice of any price changes, and you will have the opportunity to cancel before the new pricing takes effect.
              </p>

              <h3>Cancellation</h3>
              <p>
                You may cancel your subscription at any time. Cancellations take effect at the end of the current billing period. No refunds will be issued for partial subscription periods.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acceptable Use Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>You agree not to:</p>
              <ul>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe upon the rights of others, including intellectual property rights</li>
                <li>Upload or transmit viruses, malware, or other malicious code</li>
                <li>Attempt to gain unauthorized access to our systems or networks</li>
                <li>Interfere with or disrupt the Services or servers</li>
                <li>Use the Services to send spam or unsolicited communications</li>
                <li>Impersonate any person or entity or misrepresent your affiliation</li>
                <li>Collect or harvest information about other users</li>
                <li>Use automated systems to access the Services without permission</li>
                <li>Resell, redistribute, or sublicense the Services</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Data and Content</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Data Ownership</h3>
              <p>
                You retain all rights to the data and content you upload to the Services ("Your Data"). This includes animal records, applicant information, donor data, and other content you create or upload.
              </p>

              <h3>License to Us</h3>
              <p>
                You grant us a limited, non-exclusive license to use, store, and process Your Data solely to provide and improve the Services. We will not sell or share Your Data with third parties except as described in our Privacy Policy.
              </p>

              <h3>Data Security and Backup</h3>
              <p>
                We implement industry-standard security measures to protect Your Data. However, you are responsible for maintaining your own backups. We provide data export functionality for this purpose.
              </p>

              <h3>Data Deletion</h3>
              <p>
                Upon account termination, Your Data will be deleted after a grace period, except as required by law or our retention policies.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Intellectual Property Rights</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Our Intellectual Property</h3>
              <p>
                The Services, including all software, designs, text, graphics, logos, and other content (excluding Your Data), are owned by Turbeau, LLC and are protected by copyright, trademark, and other intellectual property laws.
              </p>

              <h3>Limited License</h3>
              <p>
                We grant you a limited, non-exclusive, non-transferable license to access and use the Services in accordance with these Terms.
              </p>

              <h3>Restrictions</h3>
              <p>You may not:</p>
              <ul>
                <li>Copy, modify, or create derivative works of the Services</li>
                <li>Reverse engineer, decompile, or disassemble any software</li>
                <li>Remove or alter any proprietary notices</li>
                <li>Use our trademarks or branding without permission</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Third-Party Services and Integrations</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                Our Services may integrate with third-party services such as Stripe, Google Workspace, and others. Your use of these third-party services is subject to their respective terms and privacy policies. We are not responsible for the actions or policies of third parties.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Disclaimers and Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Service Availability</h3>
              <p>
                We strive to provide reliable Services but do not guarantee uninterrupted or error-free operation. The Services are provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either express or implied.
              </p>

              <h3>Disclaimer of Warranties</h3>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>

              <h3>Limitation of Liability</h3>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, TURBEAU, LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
              <p>
                OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Indemnification</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                You agree to indemnify, defend, and hold harmless Turbeau, LLC and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses arising from:
              </p>
              <ul>
                <li>Your use of the Services</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any rights of another party</li>
                <li>Your Data or content</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Termination</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Termination by You</h3>
              <p>You may terminate your account at any time by contacting us or using the account cancellation feature.</p>

              <h3>Termination by Us</h3>
              <p>
                We reserve the right to suspend or terminate your access to the Services at any time, with or without cause, including for violation of these Terms, non-payment, or fraudulent activity.
              </p>

              <h3>Effect of Termination</h3>
              <p>
                Upon termination, your right to use the Services will immediately cease. We may delete Your Data after a grace period. Provisions that by their nature should survive termination shall survive.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dispute Resolution and Governing Law</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Governing Law</h3>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions.
              </p>

              <h3>Dispute Resolution</h3>
              <p>
                Any dispute arising from these Terms or the Services shall be resolved through binding arbitration in accordance with the American Arbitration Association's rules, except that either party may seek injunctive relief in court.
              </p>

              <h3>Class Action Waiver</h3>
              <p>
                You agree to resolve disputes on an individual basis and waive any right to participate in a class action lawsuit or class-wide arbitration.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                We may modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our website and updating the "Last Updated" date. Your continued use of the Services after changes constitute your acceptance of the modified Terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Provisions</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <h3>Entire Agreement</h3>
              <p>These Terms, together with our Privacy Policy, constitute the entire agreement between you and Turbeau, LLC.</p>

              <h3>Severability</h3>
              <p>If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full effect.</p>

              <h3>Waiver</h3>
              <p>Our failure to enforce any right or provision shall not constitute a waiver of such right or provision.</p>

              <h3>Assignment</h3>
              <p>You may not assign or transfer these Terms without our consent. We may assign these Terms without restriction.</p>

              <h3>Force Majeure</h3>
              <p>We shall not be liable for any failure to perform due to circumstances beyond our reasonable control.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none dark:prose-invert">
              <p>If you have questions about these Terms, please contact us:</p>
              <p>
                <strong>Turbeau, LLC</strong><br />
                Email: <a href="mailto:legal@irescue.life" className="text-primary hover:underline">legal@irescue.life</a><br />
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
