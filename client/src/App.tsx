import { useState } from "react";
import { Switch, Route, Link, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { usePWAManifest } from "@/hooks/usePWAManifest";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AvailableAnimalsPage from "@/pages/AvailableAnimalsPage";
import Dashboard from "@/pages/Dashboard";
import AnimalsPage from "@/pages/AnimalsPage";
import AnimalLookupPage from "@/pages/AnimalLookupPage";
import FindDuplicatesPage from "@/pages/FindDuplicatesPage";
import ApplicationsPage from "@/pages/ApplicationsPage";
import FinancePage from "@/pages/FinancePage";
import DonationLinksPage from "@/pages/DonationLinksPage";
import GrantsPage from "@/pages/GrantsPage";
import DonorsPage from "@/pages/DonorsPage";
import ContactsPage from "@/pages/ContactsPage";
import PartnerOrganizationsPage from "@/pages/PartnerOrganizationsPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import AcceptInvitationPage from "@/pages/AcceptInvitationPage";
import VolunteerManagementPage from "@/pages/VolunteerManagementPage";
import ReportsPage from "@/pages/ReportsPage";
import FosterApplicationPage from "@/pages/FosterApplicationPage";
import MyFostersPage from "@/pages/MyFostersPage";
import FosterAnimalProfilePage from "@/pages/FosterAnimalProfilePage";
import FosterAnimalMedicalPage from "@/pages/FosterAnimalMedicalPage";
import FosterManagementPage from "@/pages/FosterManagementPage";
import FosterApplicationsPipelinePage from "@/pages/FosterApplicationsPipelinePage";
import FosterMobilePortal from "@/pages/FosterMobilePortal";
import TeamManagementPage from "@/pages/TeamManagementPage";
import EmailCampaignPage from "@/pages/EmailCampaignPage";
import CommunicationsPage from "@/pages/CommunicationsPage";
import BroadcastsPage from "@/pages/BroadcastsPage";
import NewsletterCampaignsPage from "@/pages/NewsletterCampaignsPage";
import NewsletterDesignerPage from "@/pages/NewsletterDesignerPage";
import DocumentsPage from "@/pages/DocumentsPage";
import ContractTemplatesPage from "@/pages/ContractTemplatesPage";
import CustomFormsPage from "@/pages/CustomFormsPage";
import FormTestingPage from "@/pages/FormTestingPage";
import SettingsPage from "@/pages/SettingsPage";
import MyAccountPage from "@/pages/MyAccountPage";
import ContentPagesPage from "@/pages/ContentPagesPage";
import ContentModulesPage from "@/pages/ContentModulesPage";
import Analytics from "@/pages/Analytics";
import AdoptionFormSettingsPage from "@/pages/AdoptionFormSettingsPage";
import WebsiteBuilderPage from "@/pages/WebsiteBuilderPage";
import CalendarViewPage from "@/pages/CalendarViewPage";
import CalendarManagementPage from "@/pages/CalendarManagementPage";
import AnimalMedicalPage from "@/pages/AnimalMedicalPage";
import AnimalApplicationsPage from "@/pages/AnimalApplicationsPage";
import SitePermissionsPage from "@/pages/SitePermissionsPage";
import MedicalTasksPage from "@/pages/MedicalTasksPage";
import MedicalPipelinePage from "@/pages/MedicalPipelinePage";
import PrintableHealthRecordPage from "@/pages/PrintableHealthRecordPage";
import KennelCardPage from "@/pages/KennelCardPage";
import KennelManagementPage from "@/pages/KennelManagementPage";
import PublicCustomPage from "@/pages/PublicCustomPage";
import SupplyManagementPage from "@/pages/SupplyManagementPage";
import PublicWishlist from "@/pages/PublicWishlist";
import EmailInboxPage from "@/pages/EmailInboxPage";
import HappyTailsPage from "@/pages/HappyTailsPage";
import TutorialsPage from "@/pages/TutorialsPage";
import PlatformIntegrationsPage from "@/pages/PlatformIntegrationsPage";
import ComplianceSettingsPage from "@/pages/ComplianceSettingsPage";
import PlatformLandingPage from "@/pages/PlatformLandingPage";
import PlatformPrivacyPage from "@/pages/PlatformPrivacyPage";
import PlatformTermsPage from "@/pages/PlatformTermsPage";
import PlatformIntegrationsInfoPage from "@/pages/PlatformIntegrationsInfoPage";
import PlatformSecurityPage from "@/pages/PlatformSecurityPage";
import PlatformBlogPage from "@/pages/PlatformBlogPage";
import PlatformBlogPostPage from "@/pages/PlatformBlogPostPage";
import EventDetailPage from "@/pages/EventDetailPage";
import PublicVolunteerPage from "@/pages/PublicVolunteerPage";
import VolunteerApplicationManagementPage from "@/pages/VolunteerApplicationManagementPage";
import VolunteerApplicationsPipelinePage from "@/pages/VolunteerApplicationsPipelinePage";
import PublicFosterPage from "@/pages/PublicFosterPage";
import PublicSurrenderPage from "@/pages/PublicSurrenderPage";
import FormSuccessPage from "@/pages/FormSuccessPage";
import PublicAdoptionCheckoutPage from "@/pages/PublicAdoptionCheckoutPage";
import PublicFosterAgreementPage from "@/pages/PublicFosterAgreementPage";
import PublicPlacementAgreementPage from "@/pages/PublicPlacementAgreementPage";
import PublicFormSigningPage from "@/pages/PublicFormSigningPage";
import PublicConfirmationPage from "@/pages/PublicConfirmationPage";
import FormPaymentPage from "@/pages/FormPaymentPage";
import PublicContactPage from "@/pages/PublicContactPage";
import DonatePage from "@/pages/DonatePage";
import DonationLinkRedirectPage from "@/pages/DonationLinkRedirectPage";
import EventTicketCheckoutPage from "@/pages/EventTicketCheckoutPage";
import EventSuccessPage from "@/pages/EventSuccessPage";
import GivePage from "@/pages/GivePage";
import PublicTransparencyPage from "@/pages/PublicTransparencyPage";
import PublicCampaignPage from "@/pages/PublicCampaignPage";
import PublicAnimalProfilePage from "@/pages/PublicAnimalProfilePage";
import DonationThankYouPage from "@/pages/DonationThankYouPage";
import PublicShopPage from "@/pages/PublicShopPage";
import PublicProductPage from "@/pages/PublicProductPage";
import ShopCheckoutPage from "@/pages/ShopCheckoutPage";
import ShopOrderPage from "@/pages/ShopOrderPage";
import ShopManagementPage from "@/pages/ShopManagementPage";
import CollaborationHubPage from "@/pages/CollaborationHubPage";
import RunSheetPage from "@/pages/RunSheetPage";
import ActiveTransportPage from "@/pages/ActiveTransportPage";
import TransportDriverPacketPage from "@/pages/TransportDriverPacketPage";
import AdopterPortalPage from "@/pages/AdopterPortalPage";
import AdopterPetDetailPage from "@/pages/AdopterPetDetailPage";
import AdopterLoginPage from "@/pages/AdopterLoginPage";
import AdopterCompliancePage from "@/pages/AdopterCompliancePage";
import AdopterPortalPreviewPage from "@/pages/AdopterPortalPreviewPage";
import IntakeManagerPage from "@/pages/IntakeManagerPage";
import FosterPortalPage from "@/pages/FosterPortalPage";
import FosterAnimalDetailPage from "@/pages/FosterAnimalDetailPage";
import PlatformDashboard from "@/pages/platform/PlatformDashboard";
import TenantsPage from "@/pages/platform/TenantsPage";
import UsersPage from "@/pages/platform/UsersPage";
import MfaSetup from "@/pages/platform/MfaSetup";
import FeatureFlagsPage from "@/pages/platform/FeatureFlagsPage";
import AuditLogsPage from "@/pages/platform/AuditLogsPage";
import AnnouncementsPage from "@/pages/platform/AnnouncementsPage";
import SystemHealthPage from "@/pages/platform/SystemHealthPage";
import PlatformSettingsPage from "@/pages/platform/PlatformSettingsPage";
import PlatformLoginPage from "@/pages/platform/PlatformLoginPage";
import PlatformForgotPasswordPage from "@/pages/platform/PlatformForgotPasswordPage";
import PlatformResetPasswordPage from "@/pages/platform/PlatformResetPasswordPage";
import TransfersPage from "@/pages/TransfersPage";
import TenantAuditLogsPage from "@/pages/TenantAuditLogsPage";
import TenantSignupPage from "@/pages/TenantSignupPage";
import SignupSuccessPage from "@/pages/platform/SignupSuccessPage";
import Login from "@/pages/Login";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DemoAccessDialog } from "@/components/DemoAccessDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useVisitTracking } from "@/hooks/useVisitTracking";

// Component to handle root path routing
function RootHandler() {
  const { isPathBasedTenant, basePath } = useTenant();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  // Check if on platform subdomain OR root domain
  const isPlatformSubdomain = hostname.includes('platform.') || hostname === 'platform';
  const isRootDomain = hostname === 'irescue.life' || hostname === 'www.irescue.life';
  const isDevHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('replit.dev') || hostname.endsWith('.replit.app');
  
  // On dev hosts with demo tenant, render home directly (no redirect needed)
  if (isDevHost && basePath === '/demo') {
    return <Home />;
  }
  
  // If this is a path-based tenant (e.g., /munchkin3), show tenant home page
  if (isPathBasedTenant) {
    return <Home />;
  }
  
  // Show platform landing page for platform subdomain or root domain
  if (isPlatformSubdomain || isRootDomain) {
    return <Redirect to="/platform" />;
  }
  
  // Otherwise show tenant home page (for tenant subdomains or custom domains)
  return <Home />;
}

function RouterSwitch() {
  return (
    <Switch>
      {/* Platform routes must come before / to avoid prefix matching */}
      <Route path="/platform" component={PlatformLandingPage} />
      <Route path="/platform/privacy" component={PlatformPrivacyPage} />
      <Route path="/platform/terms" component={PlatformTermsPage} />
      <Route path="/platform/integrations" component={PlatformIntegrationsInfoPage} />
      <Route path="/platform/security" component={PlatformSecurityPage} />
      <Route path="/platform/blog" component={PlatformBlogPage} />
      <Route path="/platform/blog/:slug" component={PlatformBlogPostPage} />
      <Route path="/platform/signup" component={TenantSignupPage} />
      <Route path="/platform/signup/success" component={SignupSuccessPage} />
      <Route path="/platform/dashboard" component={PlatformDashboard} />
      <Route path="/platform/tenants" component={TenantsPage} />
      <Route path="/platform/users" component={UsersPage} />
      <Route path="/platform/feature-flags" component={FeatureFlagsPage} />
      <Route path="/platform/audit-logs" component={AuditLogsPage} />
      <Route path="/platform/announcements" component={AnnouncementsPage} />
      <Route path="/platform/health" component={SystemHealthPage} />
      <Route path="/platform/settings" component={PlatformSettingsPage} />
      <Route path="/platform/mfa-setup" component={MfaSetup} />
      <Route path="/platform/login" component={PlatformLoginPage} />
      <Route path="/platform/forgot-password" component={PlatformForgotPasswordPage} />
      <Route path="/platform/reset-password" component={PlatformResetPasswordPage} />
      
      {/* Public tenant routes - RootHandler redirects to /platform if on platform subdomain */}
      <Route path="/" component={RootHandler} />
      <Route path="/animals" component={AvailableAnimalsPage} />
      <Route path="/adopt" component={AvailableAnimalsPage} />
      <Route path="/animal/:animalId" component={PublicAnimalProfilePage} />
      <Route path="/volunteer" component={PublicVolunteerPage} />
      <Route path="/become-a-foster" component={PublicFosterPage} />
      <Route path="/surrender" component={PublicSurrenderPage} />
      <Route path="/form-success/:formType" component={FormSuccessPage} />
      <Route path="/contact" component={PublicContactPage} />
      <Route path="/donate/:linkId" component={DonationLinkRedirectPage} />
      <Route path="/donate" component={DonatePage} />
      <Route path="/event/:eventId" component={EventTicketCheckoutPage} />
      <Route path="/event-success" component={EventSuccessPage} />
      <Route path="/give" component={GivePage} />
      <Route path="/transparency" component={PublicTransparencyPage} />
      <Route path="/campaigns/:campaignId" component={PublicCampaignPage} />
      <Route path="/campaign/:animalId" component={PublicCampaignPage} />
      <Route path="/campaign/:animalId/thank-you" component={DonationThankYouPage} />
      <Route path="/foster" component={FosterApplicationPage} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/accept-invitation" component={AcceptInvitationPage} />
      <Route path="/wishlist" component={PublicWishlist} />
      <Route path="/shop" component={PublicShopPage} />
      <Route path="/shop/:slug" component={PublicProductPage} />
      <Route path="/shop/checkout" component={ShopCheckoutPage} />
      <Route path="/shop/order/:orderNumber" component={ShopOrderPage} />
      <Route path="/event/:id" component={EventDetailPage} />
      <Route path="/adoption-checkout/:token" component={PublicAdoptionCheckoutPage} />
      <Route path="/foster-agreement/sign/:token" component={PublicFosterAgreementPage} />
      <Route path="/placement-agreement/sign/:token" component={PublicPlacementAgreementPage} />
      <Route path="/run-sheet/:token" component={RunSheetPage} />
      <Route path="/form/:token" component={PublicFormSigningPage} />
      <Route path="/form/:token/payment" component={FormPaymentPage} />
      <Route path="/forms/sign/:token" component={PublicFormSigningPage} />
      <Route path="/forms/sign/:token/payment" component={FormPaymentPage} />
      <Route path="/confirm/:token" component={PublicConfirmationPage} />
      
      {/* Protected dashboard routes */}
      <ProtectedRoute path="/dashboard" pageId="dashboard" component={Dashboard} />
      <ProtectedRoute path="/dashboard/animals" pageId="animals" component={AnimalsPage} />
      <ProtectedRoute path="/dashboard/applications" pageId="applications" component={ApplicationsPage} proOnly proFeatureName="Adoption Applications" />
      <ProtectedRoute path="/dashboard/intake" pageId="intake" component={IntakeManagerPage} proOnly proFeatureName="Intake Manager" />
      <ProtectedRoute path="/dashboard/team" pageId="team" component={TeamManagementPage} />
      <ProtectedRoute path="/dashboard/analytics" pageId="analytics" component={Analytics} />
      <ProtectedRoute path="/dashboard/finance" pageId="finance" component={FinancePage} />
      <ProtectedRoute path="/dashboard/donation-links" pageId="finance" component={DonationLinksPage} />
      <ProtectedRoute path="/dashboard/grants" pageId="grants" component={GrantsPage} proOnly proFeatureName="Grants" />
      <ProtectedRoute path="/dashboard/donors" pageId="donors" component={DonorsPage} />
      <ProtectedRoute path="/dashboard/contacts" pageId="contacts" component={ContactsPage} />
      <ProtectedRoute path="/dashboard/partner-organizations" pageId="contacts" component={PartnerOrganizationsPage} />
      <ProtectedRoute path="/dashboard/volunteers" pageId="volunteers" component={VolunteerManagementPage} proOnly proFeatureName="Volunteer Management" />
      <ProtectedRoute path="/dashboard/opportunities" pageId="volunteers" component={VolunteerManagementPage} proOnly proFeatureName="Volunteer Management" />
      <ProtectedRoute path="/dashboard/reports" pageId="analytics" component={Analytics} />
      <ProtectedRoute path="/dashboard/my-fosters" pageId="my-fosters" component={MyFostersPage} />
      <ProtectedRoute path="/dashboard/my-fosters/:animalId/medical" pageId="my-fosters" component={FosterAnimalMedicalPage} />
      <ProtectedRoute path="/dashboard/my-fosters/:animalId" pageId="my-fosters" component={FosterAnimalProfilePage} />
      <ProtectedRoute path="/dashboard/foster-mobile" pageId="my-fosters" component={FosterMobilePortal} />
      <ProtectedRoute path="/dashboard/foster-management" pageId="foster-management" component={FosterManagementPage} proOnly proFeatureName="Foster Management" />
      
      {/* Adopter Portal routes - for adopter role users to access their pets */}
      <Route path="/my-pets/login" component={AdopterLoginPage} />
      <Route path="/my-pets/:animalId" component={AdopterPetDetailPage} />
      <Route path="/my-pets" component={AdopterPortalPage} />
      
      {/* Foster Portal routes - for foster role users to manage their foster animals */}
      <Route path="/my-fosters/:animalId" component={FosterAnimalDetailPage} />
      <Route path="/my-fosters" component={FosterPortalPage} />
      
      
      {/* Staff compliance dashboard for medication tracking */}
      <ProtectedRoute path="/dashboard/adopter-compliance" pageId="analytics" component={AdopterCompliancePage} />
      
      {/* Admin-only adopter portal preview */}
      <ProtectedRoute path="/dashboard/adopter-portal-preview" pageId="analytics" component={AdopterPortalPreviewPage} proOnly proFeatureName="Adopter Portal Preview" />
      <ProtectedRoute path="/dashboard/foster-pipeline" pageId="foster-management" component={FosterApplicationsPipelinePage} proOnly proFeatureName="Foster Pipeline" />
      <ProtectedRoute path="/dashboard/volunteer-applications" pageId="volunteers" component={VolunteerApplicationManagementPage} proOnly proFeatureName="Volunteer Applications" />
      <ProtectedRoute path="/dashboard/volunteer-pipeline" pageId="volunteers" component={VolunteerApplicationsPipelinePage} proOnly proFeatureName="Volunteer Pipeline" />
      <ProtectedRoute path="/dashboard/communications" pageId="communications" component={CommunicationsPage} />
      <ProtectedRoute path="/dashboard/broadcasts" pageId="communications" component={BroadcastsPage} />
      <ProtectedRoute path="/dashboard/newsletter-campaigns" pageId="communications" component={NewsletterCampaignsPage} />
      <ProtectedRoute path="/dashboard/newsletter-designer" pageId="communications" component={NewsletterDesignerPage} proOnly proFeatureName="Newsletter Designer" />
      <Route path="/dashboard/emails">
        <Redirect to="/dashboard/communications" />
      </Route>
      <Route path="/dashboard/inbox">
        <Redirect to="/dashboard/communications" />
      </Route>
      <ProtectedRoute path="/dashboard/documents" pageId="documents" component={DocumentsPage} />
      <ProtectedRoute path="/dashboard/contract-templates" pageId="settings" component={ContractTemplatesPage} proOnly proFeatureName="Contract Templates" />
      <ProtectedRoute path="/dashboard/custom-forms" pageId="settings" component={CustomFormsPage} proOnly proFeatureName="Custom Forms" />
      <ProtectedRoute path="/dashboard/form-testing" pageId="settings" component={FormTestingPage} proOnly proFeatureName="Form Testing" />
      <ProtectedRoute path="/dashboard/website-builder" pageId="custom-pages" component={WebsiteBuilderPage} />
      <ProtectedRoute path="/dashboard/content-modules" pageId="content-modules" component={ContentModulesPage} />
      <Route path="/dashboard/my-account" component={MyAccountPage} />
      <ProtectedRoute path="/dashboard/settings" pageId="branding" component={SettingsPage} />
      <ProtectedRoute path="/dashboard/platform-integrations" pageId="platform-integrations" component={PlatformIntegrationsPage} />
      <ProtectedRoute path="/dashboard/compliance" pageId="compliance" component={ComplianceSettingsPage} proOnly proFeatureName="Compliance & Watchdog" />
      <ProtectedRoute path="/dashboard/audit-logs" pageId="audit-logs" component={TenantAuditLogsPage} />
      <ProtectedRoute path="/dashboard/calendar" pageId="calendar" component={CalendarViewPage} />
      <ProtectedRoute path="/dashboard/calendar-management" pageId="calendar" component={CalendarManagementPage} />
      <ProtectedRoute path="/dashboard/site-permissions" pageId="site-permissions" component={SitePermissionsPage} proOnly proFeatureName="Site Permissions" />
      <ProtectedRoute path="/dashboard/animal-lookup" pageId="animals" component={AnimalLookupPage} />
      <ProtectedRoute path="/dashboard/animals/duplicates" pageId="animals" component={FindDuplicatesPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/medical" pageId="animals" component={AnimalMedicalPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/applications" pageId="animals" component={AnimalApplicationsPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/health-record" pageId="animals" component={PrintableHealthRecordPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/kennel-card" pageId="animals" component={KennelCardPage} />
      <ProtectedRoute path="/dashboard/medical-pipeline" pageId="medical-tasks" component={MedicalPipelinePage} proOnly proFeatureName="Medical Pipeline" />
      <ProtectedRoute path="/dashboard/medical-tasks" pageId="medical-tasks" component={MedicalPipelinePage} proOnly proFeatureName="Medical Pipeline" />
      <ProtectedRoute path="/dashboard/volunteer-medications" pageId="volunteers" component={MedicalTasksPage} />
      <ProtectedRoute path="/dashboard/supplies" pageId="supply-registry" component={SupplyManagementPage} />
      <ProtectedRoute path="/dashboard/happy-tails" pageId="happy-tails" component={HappyTailsPage} />
      <ProtectedRoute path="/dashboard/tutorials" pageId="tutorials" component={TutorialsPage} />
      <ProtectedRoute path="/dashboard/transfers" pageId="animals" component={TransfersPage} />
      <ProtectedRoute path="/dashboard/kennels" pageId="animals" component={KennelManagementPage} />
      <ProtectedRoute path="/dashboard/shop" pageId="shop" component={ShopManagementPage} />
      <ProtectedRoute path="/dashboard/collaboration" pageId="collaboration" component={CollaborationHubPage} />
      <ProtectedRoute path="/dashboard/transport/:transportId/active" pageId="collaboration" component={ActiveTransportPage} />
      <ProtectedRoute path="/dashboard/transport/:transportId/driver-packet" pageId="collaboration" component={TransportDriverPacketPage} />
      <Route path="/demo" component={DemoPage} />
      <Route path="/:slug" component={PublicCustomPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DemoPage() {
  const [demoAccessDialogOpen, setDemoAccessDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="container max-w-6xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="font-display text-5xl font-bold">Rescue Portal Demo</h1>
          <p className="text-xl text-muted-foreground">
            Multi-tenant animal rescue management platform
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Public Site</CardTitle>
              <CardDescription>Adoptable animals & donations</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button className="w-full" data-testid="button-view-public">
                  View Public Site
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Staff Dashboard</CardTitle>
              <CardDescription>Internal management portal</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard">
                <Button className="w-full" data-testid="button-view-dashboard">
                  View Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Applications</CardTitle>
              <CardDescription>Kanban workflow board</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/applications">
                <Button className="w-full" data-testid="button-view-applications">
                  View Applications
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Finance</CardTitle>
              <CardDescription>Donations & expenditures</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/finance">
                <Button className="w-full" data-testid="button-view-finance">
                  View Finance
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Volunteers</CardTitle>
              <CardDescription>Opportunity calendar</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/volunteers">
                <Button className="w-full" data-testid="button-view-volunteers">
                  View Volunteers
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>Analytics & metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/reports">
                <Button className="w-full" data-testid="button-view-reports">
                  View Reports
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Foster Portal</CardTitle>
              <CardDescription>Manage foster animals</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/my-fosters">
                <Button className="w-full" data-testid="button-view-foster">
                  View Foster Portal
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Team Login</CardTitle>
              <CardDescription>Email/password auth</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button className="w-full" variant="outline" data-testid="button-view-login">
                  View Login
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle>Live Demo</CardTitle>
              <CardDescription>Try the full platform</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={() => setDemoAccessDialogOpen(true)}
                data-testid="button-view-demo"
              >
                Try Live Demo
              </Button>
            </CardContent>
          </Card>
        </div>
        
        <DemoAccessDialog open={demoAccessDialogOpen} onOpenChange={setDemoAccessDialogOpen} />
      </div>
    </div>
  );
}

function AppContent() {
  usePageTracking();
  useVisitTracking();
  usePWAManifest();
  useTenantBranding();
  const { basePath } = useTenant();
  
  return (
    <>
      <ImpersonationBanner />
      <WouterRouter base={basePath}>
        <RouterSwitch />
      </WouterRouter>
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AuthProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}
