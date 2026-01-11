import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Check } from "lucide-react";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  board_member: "Board Member",
  staff: "Staff",
  foster: "Foster",
  volunteer: "Volunteer",
};

export default function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  const { toast } = useToast();

  if (!user || user.roles.length <= 1) {
    // Don't show switcher if user has only one role
    return null;
  }

  const handleRoleSwitch = async (role: string) => {
    if (role === user.activeRole) return; // Already active

    const result = await switchRole(role);
    
    if (result.success) {
      toast({
        title: "Role switched",
        description: `You are now acting as ${roleLabels[role] || role}`,
      });
    } else {
      toast({
        title: "Failed to switch role",
        description: result.error || "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-role-switcher">
          <UserCog className="h-4 w-4 mr-2" />
          {roleLabels[user.activeRole] || user.activeRole}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch Role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.roles.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => handleRoleSwitch(role)}
            className="cursor-pointer"
            data-testid={`menu-item-role-${role}`}
          >
            {role === user.activeRole && <Check className="h-4 w-4 mr-2" />}
            {role !== user.activeRole && <span className="h-4 w-4 mr-2" />}
            {roleLabels[role] || role}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
