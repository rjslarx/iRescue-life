import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Plus, AlertCircle, Info, CheckCircle2, AlertTriangle, Edit } from "lucide-react";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  targetTenants: string[] | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  const { data: announcementsData, isLoading } = useQuery<{ announcements: Announcement[] }>({
    queryKey: ['/api/platform/announcements'],
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/platform/announcements', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/announcements'] });
      setIsDialogOpen(false);
      setEditingAnnouncement(null);
      toast({
        title: "Success",
        description: "Announcement created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create announcement",
        variant: "destructive",
      });
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/platform/announcements/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/announcements'] });
      setIsDialogOpen(false);
      setEditingAnnouncement(null);
      toast({
        title: "Success",
        description: "Announcement updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update announcement",
        variant: "destructive",
      });
    },
  });

  const toggleAnnouncementMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest('PATCH', `/api/platform/announcements/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/announcements'] });
      toast({
        title: "Success",
        description: "Announcement updated",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      title: formData.get('title'),
      message: formData.get('message'),
      type: formData.get('type'),
      priority: formData.get('priority'),
      isActive: formData.get('isActive') === 'on',
    };

    if (editingAnnouncement) {
      updateAnnouncementMutation.mutate({ id: editingAnnouncement.id, data });
    } else {
      createAnnouncementMutation.mutate(data);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setIsDialogOpen(true);
  };

  if (isCheckingAccess) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const style = {
    "--sidebar-width": "16rem",
  };

  const announcements = announcementsData?.announcements || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'success': return <CheckCircle2 className="h-4 w-4" />;
      case 'error': return <AlertCircle className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getTypeVariant = (type: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      case 'success': return 'default';
      default: return 'outline';
    }
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.fullName || "Administrator"} />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-4 border-b p-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1">
              <h1 className="text-2xl font-semibold" data-testid="heading-announcements">Platform Announcements</h1>
              <p className="text-sm text-muted-foreground">Manage system-wide messages for all tenants</p>
            </div>
            <Button onClick={() => { setEditingAnnouncement(null); setIsDialogOpen(true); }} data-testid="button-create-announcement">
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-64" />
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : announcements.length > 0 ? (
                <div className="grid gap-4">
                  {announcements.map((announcement) => (
                    <Card key={announcement.id} data-testid={`announcement-card-${announcement.id}`} className="hover-elevate">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={getTypeVariant(announcement.type)} className="gap-1">
                                {getTypeIcon(announcement.type)}
                                {announcement.type}
                              </Badge>
                              <Badge variant="outline">{announcement.priority}</Badge>
                              {announcement.isActive && <Badge variant="default">Active</Badge>}
                            </div>
                            <CardTitle className="text-lg">{announcement.title}</CardTitle>
                            <CardDescription className="mt-2">{announcement.message}</CardDescription>
                            <div className="text-xs text-muted-foreground mt-2">
                              Created {format(new Date(announcement.createdAt), 'PPP')}
                              {announcement.endDate && ` • Expires ${format(new Date(announcement.endDate), 'PPP')}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(announcement)} data-testid={`button-edit-announcement-${announcement.id}`}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Switch
                              checked={announcement.isActive}
                              onCheckedChange={(checked) => 
                                toggleAnnouncementMutation.mutate({ id: announcement.id, isActive: checked })
                              }
                              data-testid={`switch-active-${announcement.id}`}
                            />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No announcements created</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent data-testid="dialog-create-announcement">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
              <DialogDescription>
                {editingAnnouncement ? 'Update announcement details' : 'Create a platform-wide announcement for all tenants'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="System Maintenance Scheduled"
                  defaultValue={editingAnnouncement?.title}
                  required
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder="We will be performing scheduled maintenance on..."
                  defaultValue={editingAnnouncement?.message}
                  required
                  rows={4}
                  data-testid="input-message"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select name="type" defaultValue={editingAnnouncement?.type || "info"}>
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select name="priority" defaultValue={editingAnnouncement?.priority || "normal"}>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="isActive" name="isActive" defaultChecked={editingAnnouncement?.isActive ?? true} data-testid="switch-active" />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditingAnnouncement(null); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending}
                data-testid="button-submit"
              >
                {editingAnnouncement ? 'Save Changes' : createAnnouncementMutation.isPending ? 'Creating...' : 'Create Announcement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
