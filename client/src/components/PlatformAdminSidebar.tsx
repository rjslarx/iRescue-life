import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Building2, Users, Settings, LogOut, Flag, FileText, Megaphone, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const navigationItems = [
  {
    title: "Dashboard",
    url: "/platform/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Tenants",
    url: "/platform/tenants",
    icon: Building2,
  },
  {
    title: "Users",
    url: "/platform/users",
    icon: Users,
  },
  {
    title: "Feature Flags",
    url: "/platform/feature-flags",
    icon: Flag,
  },
  {
    title: "Audit Logs",
    url: "/platform/audit-logs",
    icon: FileText,
  },
  {
    title: "Announcements",
    url: "/platform/announcements",
    icon: Megaphone,
  },
  {
    title: "System Health",
    url: "/platform/health",
    icon: Activity,
  },
  {
    title: "Settings",
    url: "/platform/settings",
    icon: Settings,
  },
];

interface PlatformAdminSidebarProps {
  userName: string;
}

export function PlatformAdminSidebar({ userName }: PlatformAdminSidebarProps) {
  const [location] = useLocation();
  const { toast } = useToast();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/logout', {});
      return response.json();
    },
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: () => {
      toast({
        title: "Logout failed",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Sidebar data-testid="platform-admin-sidebar">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">iR</span>
          </div>
          <div>
            <div className="font-semibold text-sm">iRescue Platform</div>
            <div className="text-xs text-muted-foreground">Administration</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <div className="space-y-2">
          <div className="text-sm">
            <div className="font-medium" data-testid="user-name">{userName}</div>
            <div className="text-xs text-muted-foreground">Platform Administrator</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
