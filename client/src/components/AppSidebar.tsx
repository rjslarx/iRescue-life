import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useQuickActions } from "@/hooks/useQuickActions";
import { RecordOfflineDonationDialog } from "@/components/RecordOfflineDonationDialog";
import { Zap } from "lucide-react";
import {
  LayoutDashboard,
  Heart,
  HeartHandshake,
  FileText,
  Users,
  DollarSign,
  Calendar,
  CalendarCog,
  Package,
  BarChart3,
  Smile,
  UserCircle,
  Mail,
  PawPrint,
  Pill,
  Stethoscope,
  Check,
  ChevronDown,
  Loader2,
  FolderOpen,
  Eye,
  ShoppingCart,
  Inbox,
  Plug2,
  Shield,
  Settings,
  ChevronRight,
  Clock,
  Home,
  Briefcase,
  FileSignature,
  Smartphone,
  Truck,
  Radio,
  Palette,
  Video,
  Kanban,
  Building2,
} from "lucide-react";

interface AppSidebarProps {
  rescueName: string;
  userName: string;
  userRole: "owner" | "admin" | "board_member" | "staff" | "foster" | "volunteer";
}

interface NavItem {
  title: string;
  url: string;
  icon: any;
  notificationKey?: string;
  usesGoogleDrive?: boolean; // Indicates files upload to Google Drive when connected
}

interface NavGroup {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  board_member: "Board Member",
  staff: "Staff",
  foster: "Foster",
  volunteer: "Volunteer",
};

// Icon map for serializing/deserializing recent pages
const iconMap: Record<string, any> = {
  LayoutDashboard,
  Heart,
  FileText,
  Users,
  DollarSign,
  Calendar,
  CalendarCog,
  Package,
  BarChart3,
  Smile,
  UserCircle,
  Mail,
  PawPrint,
  Pill,
  FolderOpen,
  ShoppingCart,
  Inbox,
  Plug2,
  Shield,
  Settings,
  Clock,
  Home,
  Briefcase,
  FileSignature,
  Smartphone,
  Truck,
  Video,
  Kanban,
};


export default function AppSidebar({ rescueName, userName, userRole }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const { user, switchRole, logout } = useAuth();
  const { toast } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);
  const [showDonationDialog, setShowDonationDialog] = useState(false);
  const { canAccessPage } = usePagePermissions();
  const { actions: allFavoriteActions, handleAction: handleFavoriteAction } = useQuickActions({
    onRecordDonation: () => setShowDonationDialog(true),
  });
  
  // Show all favorite actions including callback-only (record-donation now supported)
  const favoriteActions = allFavoriteActions;
  
  // Use activeRole from auth context if available, otherwise fall back to prop
  const effectiveRole = user?.activeRole || userRole;


  // Fetch notification counts
  const { data: notificationData } = useQuery<{ counts: {
    applications: number;
    medicalTasks: number;
    supplyRequests: number;
    fosterUpdates: number;
    teamInvitations: number;
  } }>({
    queryKey: ['/api/notifications/counts'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const notifications = notificationData?.counts || {
    applications: 0,
    medicalTasks: 0,
    supplyRequests: 0,
    fosterUpdates: 0,
    teamInvitations: 0,
  };

  // Default pages for each role
  const roleDefaultPages: Record<string, string> = {
    admin: "/dashboard",
    board_member: "/dashboard",
    staff: "/dashboard",
    foster: "/dashboard/my-fosters",
    volunteer: "/dashboard/calendar",
  };

  const handleRoleSwitch = async (role: string) => {
    if (!user || role === effectiveRole || isSwitching) return;

    setIsSwitching(true);
    try {
      const result = await switchRole(role);
      
      if (result && result.success) {
        toast({
          title: "Role switched",
          description: `You are now acting as ${roleLabels[role] || role}`,
        });
        
        const defaultPage = roleDefaultPages[role] || "/dashboard";
        navigate(defaultPage);
      } else {
        toast({
          title: "Failed to switch role",
          description: result?.error || "Unable to switch roles",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Role switch error:', error);
      toast({
        title: "Failed to switch role",
        description: "Network error. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  // Admin navigation groups
  const adminGroups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        { title: "Command Center", url: "/dashboard", icon: LayoutDashboard },
      ],
      defaultOpen: true,
    },
    {
      title: "Operations",
      items: [
        { title: "Animals", url: "/dashboard/animals", icon: Heart, usesGoogleDrive: true },
        { title: "Kennels", url: "/dashboard/kennels", icon: Home },
        { title: "Medical Pipeline", url: "/dashboard/medical-pipeline", icon: Stethoscope, notificationKey: "medicalTasks", usesGoogleDrive: true },
        { title: "Adoption Applications", url: "/dashboard/applications", icon: FileText, notificationKey: "applications" },
        { title: "Intake Manager", url: "/dashboard/intake", icon: Inbox },
      ],
      defaultOpen: true,
    },
    {
      title: "People",
      items: [
        { title: "Team", url: "/dashboard/team", icon: Users, notificationKey: "teamInvitations" },
        { title: "Foster Management", url: "/dashboard/foster-management", icon: PawPrint, notificationKey: "fosterUpdates", usesGoogleDrive: true },
        { title: "Foster Pipeline", url: "/dashboard/foster-pipeline", icon: Kanban },
        { title: "Volunteer Management", url: "/dashboard/volunteers", icon: UserCircle },
        { title: "Volunteer Pipeline", url: "/dashboard/volunteer-pipeline", icon: Kanban },
        { title: "Contacts", url: "/dashboard/contacts", icon: UserCircle },
        { title: "Partner Organizations", url: "/dashboard/partner-organizations", icon: Building2 },
        { title: "Collaboration Hub", url: "/dashboard/collaboration", icon: Truck },
      ],
      defaultOpen: false,
    },
    {
      title: "Communications",
      items: [
        { title: "Communications", url: "/dashboard/communications", icon: Mail },
        { title: "Broadcasts", url: "/dashboard/broadcasts", icon: Radio },
        { title: "Newsletter Designer", url: "/dashboard/newsletter-designer", icon: Palette },
      ],
      defaultOpen: false,
    },
    {
      title: "Content & Public Site",
      items: [
        { title: "Website Builder", url: "/dashboard/website-builder", icon: FileText, usesGoogleDrive: true },
        { title: "Happy Tails", url: "/dashboard/happy-tails", icon: Smile, usesGoogleDrive: true },
        { title: "Supply Registry", url: "/dashboard/supplies", icon: ShoppingCart, notificationKey: "supplyRequests" },
      ],
      defaultOpen: false,
    },
    {
      title: "Administration",
      items: [
        { title: "Finance", url: "/dashboard/finance", icon: DollarSign },
        { title: "Donation Links", url: "/dashboard/donation-links", icon: DollarSign },
        { title: "Grants", url: "/dashboard/grants", icon: Briefcase },
        { title: "Calendar", url: "/dashboard/calendar", icon: Calendar },
        { title: "Calendar Management", url: "/dashboard/calendar-management", icon: CalendarCog },
        { title: "Documents", url: "/dashboard/documents", icon: FolderOpen, usesGoogleDrive: true },
        { title: "Contract Templates", url: "/dashboard/contract-templates", icon: FileSignature, usesGoogleDrive: true },
        { title: "Custom Forms", url: "/dashboard/custom-forms", icon: FileSignature },
        { title: "Site Permissions", url: "/dashboard/site-permissions", icon: Shield },
        { title: "Compliance & Watchdog", url: "/dashboard/compliance", icon: Shield },
        { title: "Platform Integrations", url: "/dashboard/platform-integrations", icon: Plug2 },
        { title: "Analytics & Reports", url: "/dashboard/analytics", icon: BarChart3 },
        { title: "Adopter Portal Preview", url: "/dashboard/adopter-portal-preview", icon: Eye },
        { title: "Settings", url: "/dashboard/settings", icon: Settings },
      ],
      defaultOpen: false,
    },
    {
      title: "Help & Training",
      items: [
        { title: "Video Tutorials", url: "/dashboard/tutorials", icon: Video },
      ],
      defaultOpen: false,
    },
  ];

  // Board member groups (similar to admin but fewer admin items)
  const boardMemberGroups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        { title: "Command Center", url: "/dashboard", icon: LayoutDashboard },
      ],
      defaultOpen: true,
    },
    {
      title: "Operations",
      items: [
        { title: "Animals", url: "/dashboard/animals", icon: Heart, usesGoogleDrive: true },
        { title: "Kennels", url: "/dashboard/kennels", icon: Home },
        { title: "Medical Pipeline", url: "/dashboard/medical-pipeline", icon: Stethoscope, notificationKey: "medicalTasks", usesGoogleDrive: true },
        { title: "Adoption Applications", url: "/dashboard/applications", icon: FileText, notificationKey: "applications" },
        { title: "Intake Manager", url: "/dashboard/intake", icon: Inbox },
      ],
      defaultOpen: true,
    },
    {
      title: "People",
      items: [
        { title: "Team", url: "/dashboard/team", icon: Users },
        { title: "Foster Management", url: "/dashboard/foster-management", icon: PawPrint, notificationKey: "fosterUpdates", usesGoogleDrive: true },
        { title: "Foster Pipeline", url: "/dashboard/foster-pipeline", icon: Kanban },
        { title: "Volunteer Management", url: "/dashboard/volunteers", icon: UserCircle },
        { title: "Volunteer Pipeline", url: "/dashboard/volunteer-pipeline", icon: Kanban },
        { title: "Contacts", url: "/dashboard/contacts", icon: UserCircle },
        { title: "Partner Organizations", url: "/dashboard/partner-organizations", icon: Building2 },
        { title: "Collaboration Hub", url: "/dashboard/collaboration", icon: Truck },
      ],
      defaultOpen: false,
    },
    {
      title: "Content & Reports",
      items: [
        { title: "Finance", url: "/dashboard/finance", icon: DollarSign },
        { title: "Donation Links", url: "/dashboard/donation-links", icon: DollarSign },
        { title: "Grants", url: "/dashboard/grants", icon: Briefcase },
        { title: "Supply Registry", url: "/dashboard/supplies", icon: ShoppingCart },
        { title: "Communications", url: "/dashboard/communications", icon: Mail },
        { title: "Broadcasts", url: "/dashboard/broadcasts", icon: Radio },
        { title: "Newsletter Designer", url: "/dashboard/newsletter-designer", icon: Palette },
        { title: "Calendar", url: "/dashboard/calendar", icon: Calendar },
        { title: "Documents", url: "/dashboard/documents", icon: FolderOpen, usesGoogleDrive: true },
        { title: "Contract Templates", url: "/dashboard/contract-templates", icon: FileSignature, usesGoogleDrive: true },
        { title: "Custom Forms", url: "/dashboard/custom-forms", icon: FileSignature },
        { title: "Analytics & Reports", url: "/dashboard/analytics", icon: BarChart3 },
        { title: "Happy Tails", url: "/dashboard/happy-tails", icon: Smile, usesGoogleDrive: true },
        { title: "Settings", url: "/dashboard/settings", icon: Settings },
      ],
      defaultOpen: false,
    },
    {
      title: "Help & Training",
      items: [
        { title: "Video Tutorials", url: "/dashboard/tutorials", icon: Video },
      ],
      defaultOpen: false,
    },
  ];

  // Staff groups (simplified)
  const staffGroups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        { title: "Command Center", url: "/dashboard", icon: LayoutDashboard },
      ],
      defaultOpen: true,
    },
    {
      title: "Daily Tasks",
      items: [
        { title: "Animals", url: "/dashboard/animals", icon: Heart, usesGoogleDrive: true },
        { title: "Kennels", url: "/dashboard/kennels", icon: Home },
        { title: "Medical Pipeline", url: "/dashboard/medical-pipeline", icon: Stethoscope, notificationKey: "medicalTasks", usesGoogleDrive: true },
        { title: "Adoption Applications", url: "/dashboard/applications", icon: FileText, notificationKey: "applications" },
        { title: "Intake Manager", url: "/dashboard/intake", icon: Inbox },
        { title: "Supply Registry", url: "/dashboard/supplies", icon: ShoppingCart },
        { title: "Volunteer Management", url: "/dashboard/volunteers", icon: UserCircle },
        { title: "Volunteer Pipeline", url: "/dashboard/volunteer-pipeline", icon: Kanban },
        { title: "Collaboration Hub", url: "/dashboard/collaboration", icon: Truck },
      ],
      defaultOpen: true,
    },
    {
      title: "Resources",
      items: [
        { title: "Email Inbox", url: "/dashboard/inbox", icon: Inbox },
        { title: "Calendar", url: "/dashboard/calendar", icon: Calendar },
        { title: "Video Tutorials", url: "/dashboard/tutorials", icon: Video },
      ],
      defaultOpen: false,
    },
  ];

  // Foster groups
  const fosterGroups: NavGroup[] = [
    {
      title: "My Foster Animals",
      items: [
        { title: "My Fosters", url: "/dashboard/my-fosters", icon: Heart, usesGoogleDrive: true },
        { title: "Quick Updates", url: "/dashboard/foster-mobile", icon: Smartphone, usesGoogleDrive: true },
        { title: "Kennels", url: "/dashboard/kennels", icon: Home },
        { title: "Video Tutorials", url: "/dashboard/tutorials", icon: Video },
      ],
      defaultOpen: true,
    },
  ];

  // Volunteer groups
  const volunteerGroups: NavGroup[] = [
    {
      title: "My Activities",
      items: [
        { title: "Calendar", url: "/dashboard/calendar", icon: Calendar },
        { title: "Opportunities", url: "/dashboard/opportunities", icon: UserCircle },
        { title: "Animals", url: "/dashboard/animals", icon: Heart, usesGoogleDrive: true },
        { title: "Video Tutorials", url: "/dashboard/tutorials", icon: Video },
      ],
      defaultOpen: true,
    },
  ];

  // Mapping of URLs to page IDs for permission checking
  const urlToPageId: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/dashboard/animals': 'animals',
    '/dashboard/kennels': 'animals',
    '/dashboard/medical-pipeline': 'medical-tasks',
    '/dashboard/applications': 'applications',
    '/dashboard/foster-management': 'foster-management',
    '/dashboard/team': 'team',
    '/dashboard/finance': 'finance',
    '/dashboard/grants': 'grants',
    '/dashboard/donors': 'donors',
    '/dashboard/supplies': 'supply-registry',
    '/dashboard/emails': 'emails',
    '/dashboard/inbox': 'email-inbox',
    '/dashboard/volunteers': 'volunteers',
    '/dashboard/calendar': 'calendar',
    '/dashboard/site-permissions': 'site-permissions',
    '/dashboard/contacts': 'donors',
    '/dashboard/partner-organizations': 'donors',
    '/dashboard/documents': 'documents',
    '/dashboard/content-pages': 'custom-pages',
    '/dashboard/reports': 'analytics',
    '/dashboard/analytics': 'analytics',
    '/dashboard/happy-tails': 'custom-pages',
    '/dashboard/platform-integrations': 'platform-integrations',
    '/dashboard/compliance': 'compliance',
    '/dashboard/settings': 'branding',
    '/dashboard/my-fosters': 'my-fosters',
    '/dashboard/foster-mobile': 'my-fosters',
    '/dashboard/opportunities': 'volunteers',
    '/dashboard/website-builder': 'custom-pages',
    '/dashboard/collaboration': 'collaboration',
    '/dashboard/tutorials': 'tutorials',
  };

  // Helper function to check if menu item should be shown
  const shouldShowMenuItem = (url: string): boolean => {
    const pageId = urlToPageId[url];
    
    if (!pageId) {
      return effectiveRole === 'admin';
    }
    
    return canAccessPage(pageId);
  };

  // Get navigation groups based on role
  const navigationGroups = 
    (effectiveRole === "admin" || effectiveRole === "owner") ? adminGroups :
    effectiveRole === "board_member" ? boardMemberGroups :
    effectiveRole === "staff" ? staffGroups :
    effectiveRole === "foster" ? fosterGroups :
    volunteerGroups;

  // Filter groups and items based on permissions
  const filteredGroups = navigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => shouldShowMenuItem(item.url))
    }))
    .filter(group => group.items.length > 0);

  const getRoleBadgeVariant = (role: string) => {
    if (role === "admin") return "default";
    if (role === "board_member") return "secondary";
    return "outline";
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-semibold truncate">{rescueName}</p>
            <p className="text-xs text-muted-foreground">Management Portal</p>
          </div>
          <Badge 
            variant="secondary" 
            className="text-xs shrink-0"
            data-testid="badge-current-role"
          >
            {roleLabels[effectiveRole] || effectiveRole}
          </Badge>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {favoriteActions.length > 0 && (
          <Collapsible defaultOpen={false} className="group/collapsible">
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="hover-elevate cursor-pointer">
                  <Zap className="h-4 w-4 mr-1" />
                  <span>Quick Actions</span>
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {favoriteActions.map((action, index) => {
                      const IconComponent = action.icon;
                      return (
                        <SidebarMenuItem key={action.id}>
                          <SidebarMenuButton 
                            isActive={action.href ? location === action.href : false}
                            onClick={() => handleFavoriteAction(action.id)}
                            data-testid={`link-quick-action-${action.id}`}
                          >
                            <IconComponent className="h-4 w-4" />
                            <span>{action.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
        {filteredGroups.map((group) => (
          <Collapsible
            key={group.title}
            defaultOpen={group.defaultOpen}
            className="group/collapsible"
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="hover-elevate cursor-pointer">
                  <span>{group.title}</span>
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const notificationCount = item.notificationKey 
                        ? notifications[item.notificationKey as keyof typeof notifications] 
                        : 0;
                      
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild isActive={location === item.url}>
                            <Link href={item.url} data-testid={`link-sidebar-${item.url.replace(/\//g, '-')}`}>
                              <item.icon className="h-4 w-4" />
                              <span className="flex items-center gap-1">
                                {item.title}
                                {item.usesGoogleDrive && (
                                  <span className="text-red-500 text-xs font-bold" title="Files upload to Google Drive when connected">*</span>
                                )}
                              </span>
                              {notificationCount > 0 && (
                                <Badge 
                                  variant="secondary" 
                                  className="ml-auto h-5 min-w-5 px-1 text-xs"
                                  data-testid={`badge-${item.notificationKey}`}
                                >
                                  {notificationCount}
                                </Badge>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>
              {userName ? userName.split(' ').map(n => n[0]).join('') : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName || 'User'}</p>
            {user && user.roles.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-0 py-0 gap-1"
                    data-testid="button-role-switcher"
                    disabled={isSwitching}
                  >
                    {(() => {
                      const isAdminOrOwner = user.roles.includes('admin') || user.roles.includes('owner');
                      const isPreviewingRole = isAdminOrOwner && !user.roles.includes(effectiveRole);
                      return (
                        <>
                          {isPreviewingRole && <Eye className="h-3 w-3 text-muted-foreground mr-1" />}
                          <Badge variant={getRoleBadgeVariant(effectiveRole)} className="text-xs">
                            {isSwitching ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />switching...</>
                            ) : (
                              <>
                                {roleLabels[effectiveRole] || effectiveRole}
                                {isPreviewingRole && <span className="ml-1 opacity-70">(preview)</span>}
                              </>
                            )}
                          </Badge>
                        </>
                      );
                    })()}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>
                    {(user.roles.includes('admin') || user.roles.includes('owner')) ? 'Switch / Preview Role' : 'Switch Role'}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(() => {
                    // Admins and owners can preview any role
                    const isAdminOrOwner = user.roles.includes('admin') || user.roles.includes('owner');
                    const allRoles = ['owner', 'admin', 'board_member', 'staff', 'foster', 'volunteer'];
                    const rolesToShow = isAdminOrOwner ? allRoles : user.roles;
                    
                    return rolesToShow.map((role) => {
                      const isOwnRole = user.roles.includes(role);
                      return (
                        <DropdownMenuItem
                          key={role}
                          onClick={() => handleRoleSwitch(role)}
                          className="cursor-pointer"
                          disabled={isSwitching || role === effectiveRole}
                          data-testid={`menu-item-role-${role}`}
                        >
                          <div className="w-4 mr-2 flex items-center justify-center" aria-hidden="true">
                            {role === effectiveRole && <Check className="h-4 w-4" />}
                          </div>
                          {roleLabels[role] || role}
                          {isAdminOrOwner && !isOwnRole && (
                            <span className="ml-auto text-xs text-muted-foreground">preview</span>
                          )}
                        </DropdownMenuItem>
                      );
                    });
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge variant={getRoleBadgeVariant(effectiveRole)} className="mt-1 text-xs">
                {roleLabels[effectiveRole] || effectiveRole}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            <span className="text-red-500 font-bold">*</span> Files upload to Google Drive when connected
          </p>
        </div>
      </SidebarFooter>
      
      <RecordOfflineDonationDialog 
        open={showDonationDialog} 
        onOpenChange={setShowDonationDialog} 
      />
    </Sidebar>
  );
}
