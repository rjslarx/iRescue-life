import { 
  Heart, 
  DollarSign, 
  FileText, 
  Calendar, 
  Mail, 
  PawPrint,
  Users,
  ClipboardList,
  Home,
  Stethoscope,
  Package,
  Inbox,
  Kanban,
  UserCheck,
  UserPlus,
  MessageSquare,
  type LucideIcon
} from "lucide-react";

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  actionType?: 'navigate' | 'callback';
  callbackName?: string;
}

export const ALL_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-animal",
    label: "Add Animal",
    description: "Register a new animal in the system",
    icon: PawPrint,
    href: "/dashboard/animals?action=add",
    actionType: "navigate",
  },
  {
    id: "record-donation",
    label: "Record Donation",
    description: "Log a new donation received",
    icon: DollarSign,
    actionType: "callback",
    callbackName: "onRecordDonation",
  },
  {
    id: "new-application",
    label: "New Application",
    description: "Create a new adoption application",
    icon: FileText,
    href: "/dashboard/applications",
    actionType: "navigate",
  },
  {
    id: "add-event",
    label: "Add Event",
    description: "Schedule a new event on the calendar",
    icon: Calendar,
    href: "/dashboard/calendar",
    actionType: "navigate",
  },
  {
    id: "send-email",
    label: "Send Email",
    description: "Compose and send an email",
    icon: Mail,
    href: "/dashboard/communications",
    actionType: "navigate",
  },
  {
    id: "invite-team-member",
    label: "Invite Team Member",
    description: "Send an invitation to join your team",
    icon: Mail,
    href: "/dashboard/team?action=invite",
    actionType: "navigate",
  },
  {
    id: "add-foster",
    label: "Add Foster",
    description: "Register a new foster parent",
    icon: Home,
    href: "/dashboard/fosters",
    actionType: "navigate",
  },
  {
    id: "medical-task",
    label: "Medical Pipeline",
    description: "Manage intake vetting, surgery queue, and active treatments",
    icon: Stethoscope,
    href: "/dashboard/medical-pipeline",
    actionType: "navigate",
  },
  {
    id: "intake-manager",
    label: "Intake Manager",
    description: "Review and process intake requests",
    icon: Inbox,
    href: "/dashboard/intake",
    actionType: "navigate",
  },
  {
    id: "add-supply",
    label: "Add Supply",
    description: "Add items to supply inventory",
    icon: Package,
    href: "/dashboard/supplies",
    actionType: "navigate",
  },
  {
    id: "view-reports",
    label: "View Reports",
    description: "Access analytics and reports",
    icon: ClipboardList,
    href: "/dashboard/analytics",
    actionType: "navigate",
  },
  {
    id: "adoption-applications",
    label: "Adoption Applications",
    description: "View and manage adoption applications",
    icon: FileText,
    href: "/dashboard/applications",
    actionType: "navigate",
  },
  {
    id: "foster-pipeline",
    label: "Foster Pipeline",
    description: "Manage foster application pipeline",
    icon: Kanban,
    href: "/dashboard/foster-pipeline",
    actionType: "navigate",
  },
  {
    id: "volunteer-pipeline",
    label: "Volunteer Pipeline",
    description: "Manage volunteer application pipeline",
    icon: UserCheck,
    href: "/dashboard/volunteer-pipeline",
    actionType: "navigate",
  },
  {
    id: "check-inbox",
    label: "Check Inbox",
    description: "View and respond to messages",
    icon: Inbox,
    href: "/dashboard/communications",
    actionType: "navigate",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "View upcoming events and schedule",
    icon: Calendar,
    href: "/dashboard/calendar",
    actionType: "navigate",
  },
  {
    id: "add-volunteer",
    label: "Add Volunteer",
    description: "Manually register a new volunteer",
    icon: UserPlus,
    href: "/dashboard/volunteers?action=add",
    actionType: "navigate",
  },
  {
    id: "collaboration-hub",
    label: "Collaboration Hub",
    description: "Team communication and collaboration",
    icon: MessageSquare,
    href: "/dashboard/collaboration",
    actionType: "navigate",
  },
];

export const DEFAULT_QUICK_ACTIONS = [
  "add-animal",
  "intake-manager",
  "medical-task",
  "invite-team-member",
  "record-donation",
  "new-application",
];

export function getQuickActionById(id: string): QuickAction | undefined {
  return ALL_QUICK_ACTIONS.find(action => action.id === id);
}

export function getQuickActionsByIds(ids: string[]): QuickAction[] {
  return ids
    .map(id => getQuickActionById(id))
    .filter((action): action is QuickAction => action !== undefined);
}
