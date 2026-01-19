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
    id: "add-volunteer",
    label: "Add Volunteer",
    description: "Register a new volunteer",
    icon: Users,
    href: "/dashboard/volunteers",
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
    label: "Medical Task",
    description: "Create a new medical task",
    icon: Stethoscope,
    href: "/dashboard/medical-tasks",
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
];

export const DEFAULT_QUICK_ACTIONS = [
  "add-animal",
  "record-donation",
  "new-application",
  "add-event",
  "send-email",
];

export function getQuickActionById(id: string): QuickAction | undefined {
  return ALL_QUICK_ACTIONS.find(action => action.id === id);
}

export function getQuickActionsByIds(ids: string[]): QuickAction[] {
  return ids
    .map(id => getQuickActionById(id))
    .filter((action): action is QuickAction => action !== undefined);
}
