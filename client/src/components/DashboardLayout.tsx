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
import { Plus, Heart, FileText, Calendar, Mail, ExternalLink } from "lucide-react";
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
  
  // Calculate public site URL
  const tenant = tenantData?.tenant;
  const publicUrl = tenant?.customDomain && tenant.customDomainVerified
    ? `https://${tenant.customDomain}`
    : tenant?.subdomain 
      ? `https://irescue.life/${tenant.subdomain}`
      : null;

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "add-animal":
        navigate("/dashboard/animals");
        break;
      case "create-application":
        navigate("/dashboard/applications");
        break;
      case "add-event":
        navigate("/dashboard/calendar");
        break;
      case "send-email":
        navigate("/dashboard/communications");
        break;
    }
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar 
          rescueName={rescueName}
          userName={user?.fullName || "User"}
          userRole={(user?.activeRole || "staff") as "admin" | "board_member" | "staff" | "foster" | "volunteer"}
        />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between gap-4 border-b p-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
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
            <div className="flex items-center gap-2">
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
              {showQuickActions && (
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
                    <DropdownMenuItem
                      onClick={() => handleQuickAction("add-animal")}
                      data-testid="menu-item-add-animal"
                    >
                      <Heart className="mr-2 h-4 w-4" />
                      Add Animal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleQuickAction("create-application")}
                      data-testid="menu-item-create-application"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Create Application
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleQuickAction("add-event")}
                      data-testid="menu-item-add-event"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      Add Event
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleQuickAction("send-email")}
                      data-testid="menu-item-send-email"
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {showHelpAssistant && <HelpAssistant />}
              {showHelpAssistant && <FeedbackDialog />}
              {actions}
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
