import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint, Shield, Lock, CheckCircle, Server, Eye, FileCheck, AlertTriangle } from "lucide-react";

export default function PlatformSecurityPage() {
  useSEO({
    title: "Security - iRescue.life",
    description: "Learn about iRescue.life's comprehensive security measures and data protection practices.",
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

      {/* Hero Section */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <div className="inline-flex h-16 w-16 rounded-full bg-primary/10 items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4" data-testid="heading-security">
            Enterprise-Grade Security
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
            Your data security is our top priority. We employ industry-leading practices to protect your rescue's sensitive information.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <div className="container max-w-7xl mx-auto px-6 py-12 sm:py-16">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Data Encryption</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">AES-256-GCM Encryption</strong>
                    <p className="text-sm text-muted-foreground">All sensitive data is encrypted at rest using military-grade AES-256-GCM encryption, including passwords, payment information, and personal data.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">TLS/HTTPS Encryption</strong>
                    <p className="text-sm text-muted-foreground">All data transmitted between your browser and our servers is encrypted in transit using TLS 1.3, ensuring secure communication.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Bcrypt Password Hashing</strong>
                    <p className="text-sm text-muted-foreground">User passwords are hashed using bcrypt with adaptive cost factors, making them impossible to reverse-engineer.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Multi-Tenant Data Isolation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                iRescue.life uses a secure multi-tenant architecture where each organization's data is logically isolated from all other tenants.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Tenant-Level Isolation</strong>
                    <p className="text-sm text-muted-foreground">Every database query is scoped to your organization's tenant ID, ensuring you can only access your own data.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Subdomain Security</strong>
                    <p className="text-sm text-muted-foreground">Each organization operates on its own subdomain, providing an additional layer of separation and security.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">No Cross-Tenant Access</strong>
                    <p className="text-sm text-muted-foreground">Your organization's data is never accessible to other organizations or visible in shared queries.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Access Control & Authentication</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Role-Based Access Control (RBAC)</strong>
                    <p className="text-sm text-muted-foreground">Granular permissions system ensures users only access features and data appropriate for their role (Admin, Staff, Volunteer, etc.).</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Multi-Factor Authentication (MFA)</strong>
                    <p className="text-sm text-muted-foreground">Platform administrators and organization admins can enable TOTP-based MFA for an extra layer of account security.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Session Management</strong>
                    <p className="text-sm text-muted-foreground">Secure, encrypted sessions with automatic timeouts and the ability to remotely revoke access.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Page-Level Permissions</strong>
                    <p className="text-sm text-muted-foreground">Customize which pages and features each role can access within your organization.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Infrastructure Security</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Rate Limiting</strong>
                    <p className="text-sm text-muted-foreground">Automatic rate limiting prevents abuse and protects against brute-force attacks.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Helmet Security Headers</strong>
                    <p className="text-sm text-muted-foreground">Comprehensive HTTP security headers including strict Content Security Policy (CSP) to prevent XSS attacks.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">CORS Protection</strong>
                    <p className="text-sm text-muted-foreground">Fail-closed CORS policy ensures only authorized domains can access your data.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Environment Validation</strong>
                    <p className="text-sm text-muted-foreground">All environment variables and secrets are validated on startup to prevent misconfigurations.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileCheck className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Compliance & Auditing</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Comprehensive Audit Logs</strong>
                    <p className="text-sm text-muted-foreground">All critical actions are logged with timestamps, user information, and change details for accountability.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Regular Security Monitoring</strong>
                    <p className="text-sm text-muted-foreground">Continuous monitoring of system health, security events, and potential threats.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Data Retention Policies</strong>
                    <p className="text-sm text-muted-foreground">Clear retention policies with automated archiving of old records and secure deletion upon account termination.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">GDPR & Privacy Compliance</strong>
                    <p className="text-sm text-muted-foreground">Data handling practices designed with privacy regulations in mind, including data export and deletion capabilities.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl">Payment Security</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Stripe PCI Compliance</strong>
                    <p className="text-sm text-muted-foreground">All payment processing is handled by Stripe, a PCI DSS Level 1 certified provider. We never store credit card numbers.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block">Secure Payment Forms</strong>
                    <p className="text-sm text-muted-foreground">Payment information is entered directly into Stripe's secure forms, keeping sensitive data out of our systems.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle className="text-2xl">Responsible Disclosure</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Security researchers and users who discover vulnerabilities are encouraged to report them responsibly. We take all security reports seriously and will respond promptly.
              </p>
              <Button asChild data-testid="button-report-vulnerability">
                <a href="mailto:security@irescue.life">Report a Security Issue</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trust Section */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Your Data, Your Control
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            You own your data. Export it anytime, delete it when you close your account, and rest assured it's protected with enterprise-grade security.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild data-testid="button-privacy-policy">
              <Link href="/platform/privacy"><a>Privacy Policy</a></Link>
            </Button>
            <Button size="lg" variant="outline" asChild data-testid="button-contact-security">
              <a href="mailto:security@irescue.life">Contact Security Team</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30 mt-12">
        <div className="container max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Turbeau, LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
