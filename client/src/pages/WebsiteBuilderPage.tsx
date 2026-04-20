import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContentPagesPage from "@/pages/ContentPagesPage";
import ContentModulesPage from "@/pages/ContentModulesPage";
import AdoptionFormSettingsPage from "@/pages/AdoptionFormSettingsPage";
import VolunteerFormSettingsPage from "@/pages/VolunteerFormSettingsPage";
import FosterFormSettingsPage from "@/pages/FosterFormSettingsPage";
import SurrenderFormSettingsPage from "@/pages/SurrenderFormSettingsPage";
import DonationPageSettingsPage from "@/pages/DonationPageSettingsPage";
import DonatePageSettingsPage from "@/pages/DonatePageSettingsPage";
import VipTiersSettingsPage from "@/pages/VipTiersSettingsPage";
import DashboardLayout from "@/components/DashboardLayout";
import LegalPagesSettings from "@/components/LegalPagesSettings";

const VALID_TABS = [
  "modules", "pages", "give", "donate", "vip-tiers",
  "adoption", "volunteer", "foster", "surrender", "legal",
];

export default function WebsiteBuilderPage() {
  const [location] = useLocation();

  // Resolve the initial tab from the URL — honor `?tab=<name>` (any valid tab)
  // and the `?wizard=vip` shortcut from the onboarding checklist, which deep
  // links into the VIP Donor Tiers tab so the wizard can auto-open.
  const resolveTabFromUrl = (): string => {
    if (typeof window === 'undefined') return 'modules';
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested && VALID_TABS.includes(requested)) return requested;
    if (params.get('wizard') === 'vip') return 'vip-tiers';
    return 'modules';
  };

  const [tab, setTab] = useState<string>(resolveTabFromUrl);

  useEffect(() => {
    setTab(resolveTabFromUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <DashboardLayout
      title="Website Builder"
      description="Customize your public website content and application forms"
    >
      <div className="flex-1 overflow-hidden">
            <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
              <div className="border-b px-6 py-4 overflow-x-auto">
                <TabsList className="inline-flex w-max">
                  <TabsTrigger value="modules" data-testid="tab-modules">Homepage Modules</TabsTrigger>
                  <TabsTrigger value="pages" data-testid="tab-pages">Custom Pages</TabsTrigger>
                  <TabsTrigger value="give" data-testid="tab-give">Give Page</TabsTrigger>
                  <TabsTrigger value="donate" data-testid="tab-donate">Donate Page</TabsTrigger>
                  <TabsTrigger value="vip-tiers" data-testid="tab-vip-tiers">VIP Donor Tiers</TabsTrigger>
                  <TabsTrigger value="adoption" data-testid="tab-adoption">Adoption Form</TabsTrigger>
                  <TabsTrigger value="volunteer" data-testid="tab-volunteer">Volunteer Form</TabsTrigger>
                  <TabsTrigger value="foster" data-testid="tab-foster">Foster Form</TabsTrigger>
                  <TabsTrigger value="surrender" data-testid="tab-surrender">Surrender Form</TabsTrigger>
                  <TabsTrigger value="legal" data-testid="tab-legal">Legal Pages</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="modules" className="flex-1 overflow-auto m-0">
                <ContentModulesPage />
              </TabsContent>

              <TabsContent value="pages" className="flex-1 overflow-auto m-0">
                <ContentPagesPage />
              </TabsContent>

              <TabsContent value="give" className="flex-1 overflow-auto m-0">
                <DonationPageSettingsPage />
              </TabsContent>

              <TabsContent value="donate" className="flex-1 overflow-auto m-0">
                <DonatePageSettingsPage />
              </TabsContent>

              <TabsContent value="vip-tiers" className="flex-1 overflow-auto m-0">
                <VipTiersSettingsPage />
              </TabsContent>

              <TabsContent value="adoption" className="flex-1 overflow-auto m-0">
                <AdoptionFormSettingsPage />
              </TabsContent>

              <TabsContent value="volunteer" className="flex-1 overflow-auto m-0">
                <VolunteerFormSettingsPage />
              </TabsContent>

              <TabsContent value="foster" className="flex-1 overflow-auto m-0">
                <FosterFormSettingsPage />
              </TabsContent>

              <TabsContent value="surrender" className="flex-1 overflow-auto m-0">
                <SurrenderFormSettingsPage />
              </TabsContent>

              <TabsContent value="legal" className="flex-1 overflow-auto m-0">
                <LegalPagesSettings />
              </TabsContent>
            </Tabs>
      </div>
    </DashboardLayout>
  );
}
