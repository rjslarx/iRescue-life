import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, Link, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { usePWAManifest } from "@/hooks/usePWAManifest";
import { useTenantBranding } from "@/hooks/useTenantBranding";
const NotFound = lazy(() => import("@/pages/not-found"));
const ResalePausedPage = lazy(() => import("@/pages/ResalePausedPage"));
import { isPausedResalePage, RESALE_PUBLIC_ENABLED } from "@shared/resale-availability";
// Keep routes behind import boundaries: visiting marketing must not execute
// dashboard, game, document-generation, or payment SDK modules.
const Home = lazy(() => import("@/pages/Home"));
const AvailableAnimalsPage = lazy(() => import("@/pages/AvailableAnimalsPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const TeamGamesPage = lazy(() => import("@/pages/TeamGamesPage"));
const AnimalsPage = lazy(() => import("@/pages/AnimalsPage"));
const ProfileContributionsPage = lazy(() => import("@/pages/ProfileContributionsPage"));
const AnimalLookupPage = lazy(() => import("@/pages/AnimalLookupPage"));
const AnimalRosterPage = lazy(() => import("@/pages/AnimalRosterPage"));
const TemperaturePage = lazy(() => import("@/pages/TemperaturePage"));
const FindDuplicatesPage = lazy(() => import("@/pages/FindDuplicatesPage"));
const ApplicationsPage = lazy(() => import("@/pages/ApplicationsPage"));
const FinancePage = lazy(() => import("@/pages/FinancePage"));
const DonationLinksPage = lazy(() => import("@/pages/DonationLinksPage"));
const FreeSquaresPage = lazy(() => import("@/pages/free-squares/FreeSquaresPage"));
const PublicFreeSquaresPage = lazy(() => import("@/pages/free-squares/PublicFreeSquaresPage"));
const PublicPuzzlePage = lazy(() => import("@/pages/PublicPuzzlePage"));
const GrantsPage = lazy(() => import("@/pages/GrantsPage"));
const DonorsPage = lazy(() => import("@/pages/DonorsPage"));
const VipClubPage = lazy(() => import("@/pages/VipClubPage"));
const WallOfHeroesPage = lazy(() => import("@/pages/WallOfHeroesPage"));
const VipMembersPage = lazy(() => import("@/pages/VipMembersPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const PartnerOrganizationsPage = lazy(() => import("@/pages/PartnerOrganizationsPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const AcceptInvitationPage = lazy(() => import("@/pages/AcceptInvitationPage"));
const VolunteerManagementPage = lazy(() => import("@/pages/VolunteerManagementPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const MyFostersPage = lazy(() => import("@/pages/MyFostersPage"));
const FosterAnimalProfilePage = lazy(() => import("@/pages/FosterAnimalProfilePage"));
const FosterAnimalMedicalPage = lazy(() => import("@/pages/FosterAnimalMedicalPage"));
const FosterManagementPage = lazy(() => import("@/pages/FosterManagementPage"));
const FosterApplicationsPipelinePage = lazy(() => import("@/pages/FosterApplicationsPipelinePage"));
const FosterMobilePortal = lazy(() => import("@/pages/FosterMobilePortal"));
const TeamManagementPage = lazy(() => import("@/pages/TeamManagementPage"));
const EmailCampaignPage = lazy(() => import("@/pages/EmailCampaignPage"));
const CommunicationsPage = lazy(() => import("@/pages/CommunicationsPage"));
const CommunicationsSwitchboardPage = lazy(() => import("@/pages/CommunicationsSwitchboardPage"));
const BroadcastsPage = lazy(() => import("@/pages/BroadcastsPage"));
const NewsletterCampaignsPage = lazy(() => import("@/pages/NewsletterCampaignsPage"));
const NewsletterDesignerPage = lazy(() => import("@/pages/NewsletterDesignerPage"));
const PostOptimizerPage = lazy(() => import("@/pages/PostOptimizerPage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const ContractTemplatesPage = lazy(() => import("@/pages/ContractTemplatesPage"));
const CustomFormsPage = lazy(() => import("@/pages/CustomFormsPage"));
const FormTestingPage = lazy(() => import("@/pages/FormTestingPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const BrandingSettingsPage = lazy(() => import("@/pages/BrandingSettingsPage"));
const NotificationsSettingsPage = lazy(() => import("@/pages/NotificationsSettingsPage"));
const IntegrationsSettingsPage = lazy(() => import("@/pages/IntegrationsSettingsPage"));
const BillingSettingsPage = lazy(() => import("@/pages/BillingSettingsPage"));
const SecuritySettingsPage = lazy(() => import("@/pages/SecuritySettingsPage"));
const MedicalSettingsPage = lazy(() => import("@/pages/MedicalSettingsPage"));
const DataBackupsPage = lazy(() => import("@/pages/DataBackupsPage"));
const MyAccountPage = lazy(() => import("@/pages/MyAccountPage"));
const ContentPagesPage = lazy(() => import("@/pages/ContentPagesPage"));
const ContentModulesPage = lazy(() => import("@/pages/ContentModulesPage"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const AdoptionFormSettingsPage = lazy(() => import("@/pages/AdoptionFormSettingsPage"));
const WebsiteBuilderPage = lazy(() => import("@/pages/WebsiteBuilderPage"));
const CalendarViewPage = lazy(() => import("@/pages/CalendarViewPage"));
const CalendarManagementPage = lazy(() => import("@/pages/CalendarManagementPage"));
const AnimalMedicalPage = lazy(() => import("@/pages/AnimalMedicalPage"));
const AnimalApplicationsPage = lazy(() => import("@/pages/AnimalApplicationsPage"));
const SitePermissionsPage = lazy(() => import("@/pages/SitePermissionsPage"));
const MedicalTasksPage = lazy(() => import("@/pages/MedicalTasksPage"));
const MedicalPipelinePage = lazy(() => import("@/pages/MedicalPipelinePage"));
const DailyRosterPage = lazy(() => import("@/pages/DailyRosterPage"));
const TnrLogPage = lazy(() => import("@/pages/TnrLogPage"));
const MicrochipClinicLogPage = lazy(() => import("@/pages/MicrochipClinicLogPage"));
const PrintableHealthRecordPage = lazy(() => import("@/pages/PrintableHealthRecordPage"));
const KennelCardPage = lazy(() => import("@/pages/KennelCardPage"));
const KennelManagementPage = lazy(() => import("@/pages/KennelManagementPage"));
const PublicCustomPage = lazy(() => import("@/pages/PublicCustomPage"));
const SupplyManagementPage = lazy(() => import("@/pages/SupplyManagementPage"));
const PublicWishlist = lazy(() => import("@/pages/PublicWishlist"));
const EmailInboxPage = lazy(() => import("@/pages/EmailInboxPage"));
const HappyTailsPage = lazy(() => import("@/pages/HappyTailsPage"));
const TutorialsPage = lazy(() => import("@/pages/TutorialsPage"));
const PublicVolunteerTrainingPage = lazy(() => import("@/pages/PublicVolunteerTrainingPage"));
const PlatformIntegrationsPage = lazy(() => import("@/pages/PlatformIntegrationsPage"));
const ComplianceSettingsPage = lazy(() => import("@/pages/ComplianceSettingsPage"));
const PeerCampaignPage = lazy(() => import("@/pages/PeerCampaignPage"));
const P2PCampaignLandingPage = lazy(() => import("@/pages/P2PCampaignLandingPage"));
const VotingContestPage = lazy(() => import("@/pages/VotingContestPage"));
const PlatformLandingPage = lazy(() => import("@/pages/PlatformLandingPage"));
const PlatformPrivacyPage = lazy(() => import("@/pages/PlatformPrivacyPage"));
const PlatformTermsPage = lazy(() => import("@/pages/PlatformTermsPage"));
const PlatformIntegrationsInfoPage = lazy(() => import("@/pages/PlatformIntegrationsInfoPage"));
const PlatformSecurityPage = lazy(() => import("@/pages/PlatformSecurityPage"));
const PlatformBlogPage = lazy(() => import("@/pages/PlatformBlogPage"));
const PlatformBlogPostPage = lazy(() => import("@/pages/PlatformBlogPostPage"));
const EventDetailPage = lazy(() => import("@/pages/EventDetailPage"));
const PublicVolunteerPage = lazy(() => import("@/pages/PublicVolunteerPage"));
const VolunteerApplicationManagementPage = lazy(() => import("@/pages/VolunteerApplicationManagementPage"));
const VolunteerApplicationsPipelinePage = lazy(() => import("@/pages/VolunteerApplicationsPipelinePage"));
const PublicFosterPage = lazy(() => import("@/pages/PublicFosterPage"));
const PublicMatchmakerPage = lazy(() => import("@/pages/PublicMatchmakerPage"));
const PublicSurrenderPage = lazy(() => import("@/pages/PublicSurrenderPage"));
const PublicSurgeryDayRequestPage = lazy(() => import("@/pages/PublicSurgeryDayRequestPage"));
const SurgeryDayRequestsPage = lazy(() => import("@/pages/SurgeryDayRequestsPage"));
const FormSuccessPage = lazy(() => import("@/pages/FormSuccessPage"));
const PublicAdoptionCheckoutPage = lazy(() => import("@/pages/PublicAdoptionCheckoutPage"));
const PublicFosterAgreementPage = lazy(() => import("@/pages/PublicFosterAgreementPage"));
const PublicSurrenderAgreementPage = lazy(() => import("@/pages/PublicSurrenderAgreementPage"));
const PublicAdoptionAgreementDirectPage = lazy(() => import("@/pages/PublicAdoptionAgreementDirectPage"));
const PublicPlacementAgreementPage = lazy(() => import("@/pages/PublicPlacementAgreementPage"));
const PublicFormSigningPage = lazy(() => import("@/pages/PublicFormSigningPage"));
const PublicCustomFormPage = lazy(() => import("@/pages/PublicCustomFormPage"));
const PublicWaiverPage = lazy(() => import("@/pages/PublicWaiverPage"));
const PublicConfirmationPage = lazy(() => import("@/pages/PublicConfirmationPage"));
const FormPaymentPage = lazy(() => import("@/pages/FormPaymentPage"));
const PublicContactPage = lazy(() => import("@/pages/PublicContactPage"));
const DonatePage = lazy(() => import("@/pages/DonatePage"));
const FiveDollarFridayPage = lazy(() => import("@/pages/FiveDollarFridayPage"));
const DonationLinkRedirectPage = lazy(() => import("@/pages/DonationLinkRedirectPage"));
const FundraiserEventPage = lazy(() => import("@/pages/FundraiserEventPage"));
const FundraisersPage = lazy(() => import("@/pages/FundraisersPage"));
const FundraiserFulfillmentPage = lazy(() => import("@/pages/FundraiserFulfillmentPage"));
const PublicFundraisersPage = lazy(() => import("@/pages/PublicFundraisersPage"));
const RescueVendPage = lazy(() => import("@/pages/RescueVendPage"));
const RescueResalePage = lazy(() => import("@/pages/RescueResalePage"));
const RescueResaleAdminPage = lazy(() => import("@/pages/RescueResaleAdminPage"));
const CommunityResalePage = lazy(() => import("@/pages/CommunityResalePage"));
const CommunityCreatePage = lazy(() => import("@/pages/CommunityResalePage").then(m => ({ default: m.CommunityCreatePage })));
const CommunityManagePage = lazy(() => import("@/pages/CommunityResalePage").then(m => ({ default: m.CommunityManagePage })));
const CommunityItemPage = lazy(() => import("@/pages/CommunityResalePage").then(m => ({ default: m.CommunityItemPage })));
const CommunityOrderPage = lazy(() => import("@/pages/CommunityResalePage").then(m => ({ default: m.CommunityOrderPage })));
const CommunityResaleAdminPage = lazy(() => import("@/pages/CommunityResaleAdminPage"));
const PlatformCommunityResalePage = lazy(() => import("@/pages/CommunityResaleAdminPage").then(m => ({ default: m.PlatformCommunityResalePage })));
const RescueInboxPage = lazy(() => import("@/pages/RescueInboxPage"));
const RescuePhonePage = lazy(() => import("@/pages/RescueInboxPage").then(m => ({ default: m.RescuePhonePage })));
const EventTicketCheckoutPage = lazy(() => import("@/pages/EventTicketCheckoutPage"));
const EventSuccessPage = lazy(() => import("@/pages/EventSuccessPage"));
const GivePage = lazy(() => import("@/pages/GivePage"));
const PublicTransparencyPage = lazy(() => import("@/pages/PublicTransparencyPage"));
const PublicCampaignPage = lazy(() => import("@/pages/PublicCampaignPage"));
const PublicExpenseCampaignPage = lazy(() => import("@/pages/PublicExpenseCampaignPage"));
const PublicAnimalProfilePage = lazy(() => import("@/pages/PublicAnimalProfilePage"));
const DonationThankYouPage = lazy(() => import("@/pages/DonationThankYouPage"));
const PublicShopPage = lazy(() => import("@/pages/PublicShopPage"));
const PublicProductPage = lazy(() => import("@/pages/PublicProductPage"));
const ShopCheckoutPage = lazy(() => import("@/pages/ShopCheckoutPage"));
const ShopOrderPage = lazy(() => import("@/pages/ShopOrderPage"));
const ShopManagementPage = lazy(() => import("@/pages/ShopManagementPage"));
const CollaborationHubPage = lazy(() => import("@/pages/CollaborationHubPage"));
const RunSheetPage = lazy(() => import("@/pages/RunSheetPage"));
const ActiveTransportPage = lazy(() => import("@/pages/ActiveTransportPage"));
const TransportDriverPacketPage = lazy(() => import("@/pages/TransportDriverPacketPage"));
const AdopterPortalPage = lazy(() => import("@/pages/AdopterPortalPage"));
const AdopterPetDetailPage = lazy(() => import("@/pages/AdopterPetDetailPage"));
const AdopterLoginPage = lazy(() => import("@/pages/AdopterLoginPage"));
const AdopterCompliancePage = lazy(() => import("@/pages/AdopterCompliancePage"));
const AdopterPortalPreviewPage = lazy(() => import("@/pages/AdopterPortalPreviewPage"));
const IntakeManagerPage = lazy(() => import("@/pages/IntakeManagerPage"));
const FosterPortalPage = lazy(() => import("@/pages/FosterPortalPage"));
const FosterAnimalDetailPage = lazy(() => import("@/pages/FosterAnimalDetailPage"));
const PlatformDashboard = lazy(() => import("@/pages/platform/PlatformDashboard"));
const TenantsPage = lazy(() => import("@/pages/platform/TenantsPage"));
const UsersPage = lazy(() => import("@/pages/platform/UsersPage"));
const MfaSetup = lazy(() => import("@/pages/platform/MfaSetup"));
const FeatureFlagsPage = lazy(() => import("@/pages/platform/FeatureFlagsPage"));
const VipGamePilotPage = lazy(() => import("@/pages/platform/VipGamePilotPage"));
const AuditLogsPage = lazy(() => import("@/pages/platform/AuditLogsPage"));
const AnnouncementsPage = lazy(() => import("@/pages/platform/AnnouncementsPage"));
const SystemHealthPage = lazy(() => import("@/pages/platform/SystemHealthPage"));
const PlatformSettingsPage = lazy(() => import("@/pages/platform/PlatformSettingsPage"));
const PlatformGlobalContentPage = lazy(() => import("@/pages/platform/PlatformGlobalContentPage"));
const PlatformVideoScriptPage = lazy(() => import("@/pages/platform/PlatformVideoScriptPage"));
const StripeEconomicsPage = lazy(() => import("@/pages/platform/StripeEconomicsPage"));
const PlatformPricingPage = lazy(() => import("@/pages/PlatformPricingPage"));
const PlatformLoginPage = lazy(() => import("@/pages/platform/PlatformLoginPage"));
const PlatformForgotPasswordPage = lazy(() => import("@/pages/platform/PlatformForgotPasswordPage"));
const PlatformResetPasswordPage = lazy(() => import("@/pages/platform/PlatformResetPasswordPage"));
const TransfersPage = lazy(() => import("@/pages/TransfersPage"));
const EventTicketSalesPage = lazy(() => import("@/pages/EventTicketSalesPage"));
const FundraisingHubPage = lazy(() => import("@/pages/FundraisingHubPage"));
const PeerCampaignCreatePage = lazy(() => import("@/pages/PeerCampaignCreatePage"));
const ParticipantSubPage = lazy(() => import("@/pages/ParticipantSubPage"));
const TenantAuditLogsPage = lazy(() => import("@/pages/TenantAuditLogsPage"));
const MedicalImportsPage = lazy(() => import("@/pages/MedicalImportsPage"));
const CampaignIntakePage = lazy(() => import("@/pages/CampaignIntakePage"));
const TenantSignupPage = lazy(() => import("@/pages/TenantSignupPage"));
const SignupSuccessPage = lazy(() => import("@/pages/platform/SignupSuccessPage"));
const Login = lazy(() => import("@/pages/Login"));
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DemoAccessDialog } from "@/components/DemoAccessDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useVisitTracking } from "@/hooks/useVisitTracking";
import { isSensitiveVolunteerTrainingUrl, tokenFreeCanonical } from "@shared/sensitive-routes";
import { RouteLoadBoundary } from "@/components/RouteLoadBoundary";
import { platformCanonical } from "@shared/platform-seo";

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
    return <PlatformLandingPage />;
  }
  
  // Otherwise show tenant home page (for tenant subdomains or custom domains)
  return <Home />;
}

function RouterSwitch() {
  return (
    <Switch>
      {/* Platform routes must come before / to avoid prefix matching */}
      <Route path="/platform" component={PlatformLandingPage} />
      <Route path="/platform/pricing" component={PlatformPricingPage} />
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
      <Route path="/platform/vip-game-pilot" component={VipGamePilotPage} />
      <Route path="/platform/community-resale" component={PlatformCommunityResalePage} />
      <Route path="/platform/audit-logs" component={AuditLogsPage} />
      <Route path="/platform/announcements" component={AnnouncementsPage} />
      <Route path="/platform/health" component={SystemHealthPage} />
      <Route path="/platform/settings" component={PlatformSettingsPage} />
      <Route path="/platform/global-content" component={PlatformGlobalContentPage} />
      <Route path="/platform/video-scripts" component={PlatformVideoScriptPage} />
      <Route path="/platform/stripe-economics" component={StripeEconomicsPage} />
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
      <Route path="/matchmaker" component={PublicMatchmakerPage} />
      <Route path="/surrender" component={PublicSurrenderPage} />
      <Route path="/surgery-day-request" component={PublicSurgeryDayRequestPage} />
      <Route path="/form-success/:formType" component={FormSuccessPage} />
      <Route path="/contact" component={PublicContactPage} />
      <Route path="/squares/:id" component={PublicFreeSquaresPage} />
      <Route path="/fundraise/:slug" component={PeerCampaignPage} />
      <Route path="/fundraisers" component={PublicFundraisersPage} />
      <Route path="/rescue-vend" component={RescueVendPage} />
      <Route path="/puzzle" component={PublicPuzzlePage} />
      <Route path="/rescue-resale">{() => isPausedResalePage("/rescue-resale", window.location.search) ? <ResalePausedPage /> : <RescueResalePage />}</Route>
      <Route path="/resale" component={RESALE_PUBLIC_ENABLED ? CommunityResalePage : ResalePausedPage} />
      <Route path="/resale/create" component={RESALE_PUBLIC_ENABLED ? CommunityCreatePage : ResalePausedPage} />
      <Route path="/resale/manage" component={CommunityManagePage} />
      <Route path="/resale/item/:id" component={RESALE_PUBLIC_ENABLED ? CommunityItemPage : ResalePausedPage} />
      <Route path="/resale/order/:id" component={CommunityOrderPage} />
      <Route path="/donate/event/:eventId" component={FundraiserEventPage} />
      <Route path="/donate/:linkId" component={DonationLinkRedirectPage} />
      <Route path="/five-dollar-friday" component={FiveDollarFridayPage} />
      <Route path="/donate" component={DonatePage} />
      <Route path="/vip-club" component={VipClubPage} />
      <Route path="/wall-of-heroes" component={WallOfHeroesPage} />
      <Route path="/event/:eventId" component={EventTicketCheckoutPage} />
      <Route path="/event-success" component={EventSuccessPage} />
      <Route path="/give" component={GivePage} />
      <Route path="/transparency" component={PublicTransparencyPage} />
      <Route path="/campaigns/:campaignId" component={PublicCampaignPage} />
      <Route path="/campaign/:animalId/thank-you" component={DonationThankYouPage} />
      <Route path="/campaign/:slug/p/:participantId" component={ParticipantSubPage} />
      <Route path="/campaign/:slug" component={P2PCampaignLandingPage} />
      <Route path="/expense-campaign/:slug" component={PublicExpenseCampaignPage} />
      <Route path="/contest/:slug" component={VotingContestPage} />
      <Route path="/intake/:token" component={CampaignIntakePage} />
      <Route path="/fundraise" component={PeerCampaignCreatePage} />
      <Route path="/foster">
        <Redirect to="/become-a-foster" replace />
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/accept-invitation" component={AcceptInvitationPage} />
      <Route path="/wishlist" component={PublicWishlist} />
      <Route path="/shop" component={PublicShopPage} />
      <Route path="/shop/checkout" component={ShopCheckoutPage} />
      <Route path="/shop/order/:orderNumber" component={ShopOrderPage} />
      <Route path="/shop/:slug" component={PublicProductPage} />
      <Route path="/event/:id" component={EventDetailPage} />
      <Route path="/adoption-checkout/:token" component={PublicAdoptionCheckoutPage} />
      <Route path="/foster-agreement/sign/:token" component={PublicFosterAgreementPage} />
      <Route path="/surrender-agreement/sign/:token" component={PublicSurrenderAgreementPage} />
      <Route path="/adoption-agreement/sign/:token" component={PublicAdoptionAgreementDirectPage} />
      <Route path="/placement-agreement/sign/:token" component={PublicPlacementAgreementPage} />
      <Route path="/run-sheet/:token" component={RunSheetPage} />
      <Route path="/volunteer-waiver" component={PublicWaiverPage} />
      <Route path="/volunteer-training/:token" component={PublicVolunteerTrainingPage} />
      <Route path="/f/:slug" component={PublicCustomFormPage} />
      <Route path="/form/:token" component={PublicFormSigningPage} />
      <Route path="/form/:token/payment" component={FormPaymentPage} />
      <Route path="/forms/sign/:token" component={PublicFormSigningPage} />
      <Route path="/forms/sign/:token/payment" component={FormPaymentPage} />
      <Route path="/confirm/:token" component={PublicConfirmationPage} />
      
      {/* Protected dashboard routes */}
      {/* This page enforces its explicit active-role and stable tenant-ID allowlist. */}
      <Route path="/dashboard/free-squares" component={FreeSquaresPage} />
      {/* Team games use session + server eligibility, not dashboard page grants. */}
      <Route path="/dashboard/games" component={TeamGamesPage} />
      {/* Explicit rescue-help team membership is enforced by the API. */}
      <Route path="/dashboard/rescue-inbox" component={RescueInboxPage} />
      <Route path="/phone" component={RescuePhonePage} />
      <ProtectedRoute path="/dashboard" pageId="dashboard" component={Dashboard} />
      <ProtectedRoute path="/dashboard/animals" pageId="animals" component={AnimalsPage} />
      <ProtectedRoute path="/dashboard/profile-contributions" pageId="profile-contributions" component={ProfileContributionsPage} />
      <ProtectedRoute path="/dashboard/applications" pageId="applications" component={ApplicationsPage} proOnly proFeatureName="Adoption Applications" />
      <ProtectedRoute path="/dashboard/intake" pageId="intake" component={IntakeManagerPage} proOnly proFeatureName="Intake Manager" />
      <ProtectedRoute path="/dashboard/surgery-day-requests" pageId="intake" component={SurgeryDayRequestsPage} />
      <ProtectedRoute path="/dashboard/team" pageId="team" component={TeamManagementPage} />
      <ProtectedRoute path="/dashboard/analytics" pageId="analytics" component={Analytics} />
      <ProtectedRoute path="/dashboard/finance" pageId="finance" component={FinancePage} />
      <ProtectedRoute path="/dashboard/rescue-resale" pageId="finance" component={RescueResaleAdminPage} />
      <ProtectedRoute path="/dashboard/community-resale" pageId="finance" component={CommunityResaleAdminPage} />
      <ProtectedRoute path="/dashboard/donation-links" pageId="finance" component={DonationLinksPage} />
      <ProtectedRoute path="/dashboard/fundraising" pageId="finance" component={FundraisingHubPage} />
      <ProtectedRoute path="/dashboard/fundraisers/:eventId" pageId="fundraiser-events" component={FundraiserFulfillmentPage} />
      <ProtectedRoute path="/dashboard/fundraisers" pageId="fundraiser-events" component={FundraisersPage} />
      <ProtectedRoute path="/dashboard/grants" pageId="grants" component={GrantsPage} proOnly proFeatureName="Grants" />
      <ProtectedRoute path="/dashboard/donors" pageId="donors" component={DonorsPage} />
      <ProtectedRoute path="/dashboard/vip-club-members" pageId="donors" component={VipMembersPage} />
      <ProtectedRoute path="/dashboard/contacts" pageId="contacts" component={ContactsPage} />
      <ProtectedRoute path="/dashboard/partner-organizations" pageId="contacts" component={PartnerOrganizationsPage} />
      <ProtectedRoute path="/dashboard/volunteers" pageId="volunteers" component={VolunteerManagementPage} proOnly proFeatureName="Volunteer Management" />
      <ProtectedRoute path="/dashboard/opportunities" pageId="volunteers" component={VolunteerManagementPage} proOnly proFeatureName="Volunteer Management" />
      <ProtectedRoute path="/dashboard/reports" pageId="analytics" component={Analytics} />
      <ProtectedRoute path="/dashboard/medical-imports" pageId="medical-imports" component={MedicalImportsPage} />
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
      <ProtectedRoute path="/dashboard/communications-switchboard" pageId="communications-switchboard" component={CommunicationsSwitchboardPage} />
      <ProtectedRoute path="/dashboard/communications" pageId="communications" component={CommunicationsPage} />
      <ProtectedRoute path="/dashboard/broadcasts" pageId="communications" component={BroadcastsPage} />
      <ProtectedRoute path="/dashboard/newsletter-campaigns" pageId="communications" component={NewsletterCampaignsPage} />
      <ProtectedRoute path="/dashboard/newsletter-designer" pageId="communications" component={NewsletterDesignerPage} proOnly proFeatureName="Newsletter Designer" />
      <ProtectedRoute path="/dashboard/post-optimizer" pageId="post-optimizer" component={PostOptimizerPage} />
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
      <ProtectedRoute path="/dashboard/settings/branding" pageId="branding" component={BrandingSettingsPage} />
      <ProtectedRoute path="/dashboard/settings/notifications" pageId="branding" component={NotificationsSettingsPage} />
      <ProtectedRoute path="/dashboard/settings/integrations" pageId="branding" component={IntegrationsSettingsPage} />
      <ProtectedRoute path="/dashboard/settings/billing" pageId="branding" component={BillingSettingsPage} />
      <ProtectedRoute path="/dashboard/settings/security" pageId="branding" component={SecuritySettingsPage} />
      <ProtectedRoute path="/dashboard/settings/medical" pageId="branding" component={MedicalSettingsPage} />
      <ProtectedRoute path="/dashboard/settings" pageId="branding" component={SettingsPage} />
      <ProtectedRoute path="/dashboard/data-backups" pageId="data-backups" component={DataBackupsPage} />
      <ProtectedRoute path="/dashboard/platform-integrations" pageId="platform-integrations" component={PlatformIntegrationsPage} />
      <ProtectedRoute path="/dashboard/compliance" pageId="compliance" component={ComplianceSettingsPage} proOnly proFeatureName="Compliance & Watchdog" />
      <ProtectedRoute path="/dashboard/audit-logs" pageId="audit-logs" component={TenantAuditLogsPage} />
      <ProtectedRoute path="/dashboard/calendar" pageId="calendar" component={CalendarViewPage} />
      <ProtectedRoute path="/dashboard/calendar-management" pageId="calendar" component={CalendarManagementPage} />
      <ProtectedRoute path="/dashboard/site-permissions" pageId="site-permissions" component={SitePermissionsPage} proOnly proFeatureName="Site Permissions" />
      <ProtectedRoute path="/dashboard/animal-lookup" pageId="animals" component={AnimalLookupPage} />
      <ProtectedRoute path="/dashboard/animal-roster" pageId="animal-roster" component={AnimalRosterPage} />
      <ProtectedRoute path="/dashboard/temperature" pageId="temperature" component={TemperaturePage} />
      <ProtectedRoute path="/dashboard/animals/duplicates" pageId="animals" component={FindDuplicatesPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/medical" pageId="animals" component={AnimalMedicalPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/applications" pageId="animals" component={AnimalApplicationsPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/health-record" pageId="animals" component={PrintableHealthRecordPage} />
      <ProtectedRoute path="/dashboard/animals/:animalId/kennel-card" pageId="animals" component={KennelCardPage} />
      <ProtectedRoute path="/dashboard/medical-pipeline" pageId="medical-tasks" component={MedicalPipelinePage} proOnly proFeatureName="Medical Pipeline" />
      <ProtectedRoute path="/dashboard/medical-tasks" pageId="medical-tasks" component={MedicalPipelinePage} proOnly proFeatureName="Medical Pipeline" />
      <ProtectedRoute path="/dashboard/daily-roster" pageId="daily-roster" component={DailyRosterPage} />
      <ProtectedRoute path="/dashboard/tnr-log" pageId="tnr-log" component={TnrLogPage} />
      <ProtectedRoute path="/dashboard/microchip-clinic-log" pageId="microchip-clinic-log" component={MicrochipClinicLogPage} />
      <ProtectedRoute path="/dashboard/volunteer-medications" pageId="volunteers" component={MedicalTasksPage} />
      <ProtectedRoute path="/dashboard/supplies" pageId="supply-registry" component={SupplyManagementPage} />
      <ProtectedRoute path="/dashboard/happy-tails" pageId="happy-tails" component={HappyTailsPage} />
      <ProtectedRoute path="/dashboard/tutorials" pageId="tutorials" component={TutorialsPage} />
      <ProtectedRoute path="/dashboard/event-ticket-sales" pageId="event-ticket-sales" component={EventTicketSalesPage} />
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

function useCanonicalUrl() {
  useEffect(() => {
    const sensitive = isSensitiveVolunteerTrainingUrl(window.location.href);
    let referrerMeta = document.querySelector('meta[name="referrer"]') as HTMLMetaElement | null;
    if (sensitive && !referrerMeta) {
      referrerMeta = document.createElement('meta');
      referrerMeta.name = 'referrer';
      document.head.appendChild(referrerMeta);
    }
    if (sensitive && referrerMeta) referrerMeta.content = 'no-referrer';
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.setAttribute('href', platformCanonical(tokenFreeCanonical(window.location.href, window.location.origin)));
    }
  });
}

function AppContent() {
  usePageTracking();
  useVisitTracking();
  usePWAManifest();
  useTenantBranding();
  useCanonicalUrl();
  const { basePath } = useTenant();
  
  return (
    <>
      <ImpersonationBanner />
      <WouterRouter base={basePath}>
        <RouteLoadBoundary>
          <Suspense fallback={<div role="status" className="p-8 text-center">Loading page…</div>}>
            <RouterSwitch />
          </Suspense>
        </RouteLoadBoundary>
      </WouterRouter>
      <Toaster />
    </>
  );
}

function App() {
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

export default App;
