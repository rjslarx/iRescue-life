import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import HelpAssistant from "@/components/HelpAssistant";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ExternalLink, HelpCircle, MessageSquare } from "lucide-react";
import { useQuickActions } from "@/hooks/useQuickActions";
import NotificationBell from "@/components/NotificationBell";
import { useState } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
}

export default function DashboardLayout({ children, title, description, actions, breadcrumbs }: DashboardLayoutProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { actions: quickActions, handleAction } = useQuickActions();
  const [helpOpen, setHelpOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  
  const style = {
    "--sidebar-width": "16rem",
  };

  const rescueName = tenantData?.tenant?.name || "Rescue Portal";
  const activeRole = user?.activeRole || "staff";
  const showQuickActions = activeRole === "admin" || activeRole === "staff";
  const showHelpAssistant = activeRole === "admin" || activeRole === "staff";
  
  const tenant = tenantData?.tenant;
  const publicUrl = tenant?.customDomain && tenant.customDomainVerified
    ? `https://${tenant.customDomain}`
    : tenant?.subdomain 
      ? `https://irescue.life/${tenant.subdomain}`
      : null;

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar 
          rescueName={rescueName}
          userName={user?.fullName || "User"}
          userRole={(user?.activeRole || "staff") as "admin" | "board_member" | "staff" | "foster" | "volunteer"}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex items-center gap-2 lg:gap-4 min-w-0 shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <div className="min-w-0">
                  <Breadcrumbs items={breadcrumbs} />
                </div>
              ) : title ? (
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-semibold truncate">{title}</h1>
                  {description && (
                    <p className="text-sm text-muted-foreground truncate">{description}</p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto justify-start lg:justify-end shrink-0 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible scrollbar-none">
              {publicUrl && (
                <Button
                  variant="outline"
                  size="default"
                  className="gap-2 shrink-0"
                  asChild
                  data-testid="button-view-public-site"
                >
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden sm:inline">View Public Site</span>
                  </a>
                </Button>
              )}
              {showQuickActions && quickActions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      className="gap-2 shrink-0"
                      data-testid="button-quick-actions"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Quick Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {quickActions.map((action) => (
                      <DropdownMenuItem
                        key={action.id}
                        onClick={() => handleAction(action.id)}
                        data-testid={`menu-item-${action.id}`}
                      >
                        <action.icon className="mr-2 h-4 w-4" />
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {showQuickActions && <NotificationBell />}
              {actions}
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:p-6">
            <div className="w-full min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>

      {showHelpAssistant && (
        <>
          <HelpAssistant externalOpen={helpOpen} onExternalOpenChange={setHelpOpen} />
          <FeedbackDialog externalOpen={feedbackOpen} onExternalOpenChange={setFeedbackOpen} />
          <div className="fixed bottom-6 left-6 z-50 flex flex-col-reverse items-start gap-3" data-testid="fab-help-container">
            {fabOpen && (
              <div className="flex flex-col-reverse gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <Button
                  variant="secondary"
                  className="shadow-lg gap-2 pr-4 shrink-0"
                  onClick={() => { setFabOpen(false); setHelpOpen(true); }}
                  data-testid="fab-action-help-assistant"
                >
                  <HelpCircle className="h-4 w-4" />
                  Help Assistant
                </Button>
                <Button
                  variant="secondary"
                  className="shadow-lg gap-2 pr-4 shrink-0"
                  onClick={() => { setFabOpen(false); setFeedbackOpen(true); }}
                  data-testid="fab-action-send-feedback"
                >
                  <MessageSquare className="h-4 w-4" />
                  Send Feedback
                </Button>
              </div>
            )}
            <Button
              size="icon"
              variant="outline"
              className={`rounded-full shadow-md transition-transform duration-200 ${fabOpen ? "rotate-45" : ""}`}
              onClick={() => setFabOpen(!fabOpen)}
              data-testid="fab-help-toggle"
            >
              {fabOpen ? (
                <Plus className="h-4 w-4" />
              ) : (
                <HelpCircle className="h-4 w-4" />
              )}
            </Button>
          </div>
        </>
      )}
    </SidebarProvider>
  );
}
