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
import { Plus, ExternalLink } from "lucide-react";
import { useQuickActions } from "@/hooks/useQuickActions";

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
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 border-b p-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <div className="flex-1 min-w-0">
                  <Breadcrumbs items={breadcrumbs} />
                </div>
              ) : title ? (
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-semibold">{title}</h1>
                  {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
              {publicUrl && (
                <Button
                  variant="outline"
                  size="default"
                  className="gap-2"
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
                      className="gap-2"
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
              {showHelpAssistant && <HelpAssistant />}
              {showHelpAssistant && <FeedbackDialog />}
              {actions}
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-4 sm:p-6">
            <div className="w-full min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
