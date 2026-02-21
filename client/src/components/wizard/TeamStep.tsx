import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Users, UserPlus, Mail } from "lucide-react";

interface TeamStepProps {
  onNext: () => void;
}

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  fullName: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "staff", "foster", "volunteer"], {
    required_error: "Please select a role",
  }),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function TeamStep({ onNext }: TeamStepProps) {
  const { toast } = useToast();

  // Fetch existing team members
  const { data: users, isLoading: isLoadingUsers } = useQuery<{
    id: string;
    fullName: string;
    email: string;
    roles: string[];
  }[]>({
    queryKey: ['/api/users'],
  });

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      fullName: "",
      role: "volunteer",
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const payload = {
        email: data.email,
        fullName: data.fullName,
        roles: [data.role],
      };
      const response = await apiRequest("POST", "/api/invitations", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Invitation sent!",
        description: "Team member will receive an email with instructions.",
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InviteFormData) => {
    inviteMutation.mutate(data);
  };

  const onSkip = () => {
    toast({
      title: "Team invites skipped",
      description: "You can invite team members later from Settings.",
    });
    onNext();
  };

  const handleContinue = () => {
    toast({
      title: "Team setup complete",
      description: "Moving to the final step!",
    });
    onNext();
  };

  if (isLoadingUsers) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const teamMemberCount = users?.length || 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Users className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Build your team</h2>
        <p className="text-muted-foreground">
          Invite staff, volunteers, and foster parents to help manage your rescue.
        </p>
      </div>

      {teamMemberCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users?.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-2"
                  data-testid={`team-member-${user.id}`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite Team Member</CardTitle>
          <CardDescription>
            Send an invitation to join your rescue organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Jane Smith" 
                        {...field} 
                        data-testid="input-invite-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="jane@example.com" 
                        {...field} 
                        data-testid="input-invite-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin - Full access</SelectItem>
                        <SelectItem value="staff">Staff - Manage animals & applications</SelectItem>
                        <SelectItem value="foster">Foster - View assigned animals</SelectItem>
                        <SelectItem value="volunteer">Volunteer - Basic access</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the appropriate permission level for this team member
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full"
                disabled={inviteMutation.isPending}
                data-testid="button-send-invite"
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button 
          type="button"
          variant="outline"
          onClick={onSkip}
          data-testid="button-skip-team"
        >
          Skip for Now
        </Button>
        <Button 
          type="button"
          onClick={handleContinue}
          data-testid="button-continue-team"
        >
          Continue to Review
        </Button>
      </div>
    </div>
  );
}
