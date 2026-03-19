import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlatformAdminSidebar } from "@/components/PlatformAdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Loader2, Plus, Edit, Trash2, Video, BookOpen, Globe,
  FileText, Upload, File, Lock, Eye,
} from "lucide-react";
import type { Tutorial, HelpDocument } from "@shared/schema";

const CATEGORIES = [
  { value: "getting-started", label: "Getting Started" },
  { value: "animals", label: "Animals & Intake" },
  { value: "medical", label: "Medical Records" },
  { value: "fosters", label: "Foster Management" },
  { value: "volunteers", label: "Volunteers" },
  { value: "communications", label: "Communications" },
  { value: "finance", label: "Finance & Donations" },
  { value: "website", label: "Website & Content" },
  { value: "settings", label: "Settings" },
  { value: "other", label: "Other" },
] as const;

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "board_member", label: "Board Member" },
  { value: "staff", label: "Staff" },
  { value: "foster", label: "Foster" },
  { value: "volunteer", label: "Volunteer" },
] as const;

type RoleValue = typeof ROLES[number]["value"];

function RolePicker({ value, onChange }: { value: RoleValue[]; onChange: (roles: RoleValue[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Visible To Roles</span>
      </div>
      <p className="text-xs text-muted-foreground">Leave all unchecked to show to everyone.</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {ROLES.map(role => (
          <label key={role.value} className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={value.includes(role.value)}
              onCheckedChange={() => {
                if (value.includes(role.value)) onChange(value.filter(r => r !== role.value));
                else onChange([...value, role.value]);
              }}
            />
            <span className="text-sm">{role.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function VisibilityBadge({ roles }: { roles: RoleValue[] | null | undefined }) {
  if (!roles || roles.length === 0) return null;
  const label = roles.length === ROLES.length
    ? "All roles"
    : roles.map(r => ROLES.find(ro => ro.value === r)?.label ?? r).join(" · ");
  return (
    <Badge variant="outline" className="w-fit gap-1 text-xs">
      <Lock className="h-3 w-3" /> {label}
    </Badge>
  );
}

function getCategoryLabel(value: string) {
  return CATEGORIES.find(c => c.value === value)?.label || value;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return (
    <div className="aspect-video bg-muted flex items-center justify-center rounded-lg">
      <p className="text-muted-foreground text-sm">Invalid YouTube URL</p>
    </div>
  );
  return (
    <div className="aspect-video rounded-lg overflow-hidden">
      <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}`} title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen className="border-0" />
    </div>
  );
}

const tutorialFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  youtubeUrl: z.string().min(1, "Video URL is required").url("Must be a valid URL"),
  category: z.enum(["getting-started", "animals", "medical", "fosters", "volunteers", "communications", "finance", "website", "settings", "other"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  visibleToRoles: z.array(z.enum(["admin", "board_member", "staff", "foster", "volunteer"])).optional(),
});
type TutorialFormData = z.infer<typeof tutorialFormSchema>;

const docFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["getting-started", "animals", "medical", "fosters", "volunteers", "communications", "finance", "website", "settings", "other"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  visibleToRoles: z.array(z.enum(["admin", "board_member", "staff", "foster", "volunteer"])).optional(),
});
type DocFormData = z.infer<typeof docFormSchema>;

export default function PlatformGlobalContentPage() {
  const { user } = useAuth();
  const { isLoading: isCheckingAccess } = usePlatformAdmin();
  const { toast } = useToast();

  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [deleteVideoConfirm, setDeleteVideoConfirm] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<HelpDocument | null>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: tutData, isLoading: tutLoading } = useQuery<{ tutorials: Tutorial[] }>({
    queryKey: ['/api/platform/global-tutorials'],
  });
  const { data: docData, isLoading: docLoading } = useQuery<{ documents: HelpDocument[] }>({
    queryKey: ['/api/platform/global-help-documents'],
  });

  const videoForm = useForm<TutorialFormData>({
    resolver: zodResolver(tutorialFormSchema),
    defaultValues: { title: "", description: "", youtubeUrl: "", category: "getting-started", sortOrder: 0, visibleToRoles: [] },
  });

  const createVideoMutation = useMutation({
    mutationFn: async (data: TutorialFormData) => (await apiRequest('POST', '/api/platform/global-tutorials', {
      ...data, visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-tutorials'] });
      toast({ title: "Global tutorial added" });
      closeVideoDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateVideoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TutorialFormData> }) =>
      (await apiRequest('PATCH', `/api/platform/global-tutorials/${id}`, {
        ...data, visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-tutorials'] });
      toast({ title: "Global tutorial updated" });
      closeVideoDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/platform/global-tutorials/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-tutorials'] });
      toast({ title: "Global tutorial deleted" });
      setDeleteVideoConfirm(false);
      setVideoToDelete(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function closeVideoDialog() {
    setVideoDialogOpen(false);
    setEditingTutorial(null);
    videoForm.reset({ title: "", description: "", youtubeUrl: "", category: "getting-started", sortOrder: 0, visibleToRoles: [] });
  }

  function handleEditVideo(tutorial: Tutorial) {
    setEditingTutorial(tutorial);
    videoForm.reset({
      title: tutorial.title, description: tutorial.description || "", youtubeUrl: tutorial.youtubeUrl,
      category: tutorial.category as any, sortOrder: tutorial.sortOrder,
      visibleToRoles: (tutorial.visibleToRoles as RoleValue[]) || [],
    });
    setVideoDialogOpen(true);
  }

  function handleSubmitVideo(data: TutorialFormData) {
    if (editingTutorial) updateVideoMutation.mutate({ id: editingTutorial.id, data });
    else createVideoMutation.mutate(data);
  }

  const docForm = useForm<DocFormData>({
    resolver: zodResolver(docFormSchema),
    defaultValues: { title: "", description: "", category: "getting-started", sortOrder: 0, visibleToRoles: [] },
  });

  const createDocMutation = useMutation({
    mutationFn: async (data: DocFormData & { fileUrl: string; fileName: string; mimeType: string }) =>
      (await apiRequest('POST', '/api/platform/global-help-documents', {
        ...data, visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-help-documents'] });
      toast({ title: "Global document added" });
      closeDocDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DocFormData> }) =>
      (await apiRequest('PATCH', `/api/platform/global-help-documents/${id}`, {
        ...data, visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-help-documents'] });
      toast({ title: "Global document updated" });
      closeDocDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/platform/global-help-documents/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/global-help-documents'] });
      toast({ title: "Global document deleted" });
      setDeleteDocConfirm(false);
      setDocToDelete(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function closeDocDialog() {
    setDocDialogOpen(false);
    setEditingDoc(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    docForm.reset({ title: "", description: "", category: "getting-started", sortOrder: 0, visibleToRoles: [] });
  }

  function handleEditDoc(doc: HelpDocument) {
    setEditingDoc(doc);
    docForm.reset({
      title: doc.title, description: doc.description || "",
      category: doc.category as any, sortOrder: doc.sortOrder,
      visibleToRoles: (doc.visibleToRoles as RoleValue[]) || [],
    });
    setDocDialogOpen(true);
  }

  async function handleSubmitDoc(data: DocFormData) {
    if (editingDoc) {
      updateDocMutation.mutate({ id: editingDoc.id, data });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Please select a file", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadRes = await fetch("/api/platform/global-help-documents/upload", { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { uploadedPath } = await uploadRes.json();
      if (!uploadedPath) throw new Error("No file URL returned");
      createDocMutation.mutate({
        ...data, fileUrl: uploadedPath, fileName: selectedFile.name, mimeType: selectedFile.type,
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const tutorials = tutData?.tutorials || [];
  const documents = docData?.documents || [];

  if (isCheckingAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <PlatformAdminSidebar userName={user?.name || "Admin"} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center gap-2 p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <h1 className="text-lg font-semibold">Global Help & Training Content</h1>
          </header>
          <main className="flex-1 overflow-auto p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold" data-testid="text-page-title">Global Content</h2>
              </div>
              <p className="text-muted-foreground text-sm">
                Videos and documents added here appear in every tenant's Help & Training page.
              </p>
            </div>

            <Tabs defaultValue="videos" className="space-y-6">
              <TabsList data-testid="tabs-global-content">
                <TabsTrigger value="videos" data-testid="tab-global-videos">Videos</TabsTrigger>
                <TabsTrigger value="documents" data-testid="tab-global-documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="videos" className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-sm text-muted-foreground">YouTube tutorial videos visible to all tenants</p>
                  <Button onClick={() => setVideoDialogOpen(true)} data-testid="button-add-global-video">
                    <Plus className="h-4 w-4 mr-2" /> Add Global Video
                  </Button>
                </div>

                {tutLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : tutorials.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Video className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No global videos yet</h3>
                      <p className="text-muted-foreground text-center mt-2 max-w-md">
                        Add YouTube video tutorials that will be visible to all rescue organizations.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tutorials.map(tut => (
                      <Card key={tut.id} className="flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-medium truncate">{tut.title}</CardTitle>
                              {tut.description && <CardDescription className="text-xs mt-1 line-clamp-2">{tut.description}</CardDescription>}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleEditVideo(tut)} data-testid={`button-edit-video-${tut.id}`}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => { setVideoToDelete(tut.id); setDeleteVideoConfirm(true); }} data-testid={`button-delete-video-${tut.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-2">
                          {expandedVideo === tut.id ? (
                            <YouTubeEmbed url={tut.youtubeUrl} title={tut.title} />
                          ) : (
                            <button onClick={() => setExpandedVideo(tut.id)} className="w-full aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-2 hover-elevate" data-testid={`button-play-video-${tut.id}`}>
                              <Video className="h-8 w-8 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Click to play</span>
                            </button>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">{getCategoryLabel(tut.category)}</Badge>
                            <VisibilityBadge roles={tut.visibleToRoles as RoleValue[]} />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-sm text-muted-foreground">Documents and guides visible to all tenants</p>
                  <Button onClick={() => setDocDialogOpen(true)} data-testid="button-add-global-document">
                    <Plus className="h-4 w-4 mr-2" /> Add Global Document
                  </Button>
                </div>

                {docLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : documents.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No global documents yet</h3>
                      <p className="text-muted-foreground text-center mt-2 max-w-md">
                        Upload PDF documents or images that will be visible to all rescue organizations.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {documents.map(doc => (
                      <Card key={doc.id} className="flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0 flex items-start gap-3">
                              {doc.mimeType === "application/pdf" ? <FileText className="h-8 w-8 text-red-500 shrink-0" /> : <File className="h-8 w-8 text-muted-foreground shrink-0" />}
                              <div className="min-w-0">
                                <CardTitle className="text-sm font-medium truncate">{doc.title}</CardTitle>
                                {doc.description && <CardDescription className="text-xs mt-1 line-clamp-2">{doc.description}</CardDescription>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleEditDoc(doc)} data-testid={`button-edit-doc-${doc.id}`}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => { setDocToDelete(doc.id); setDeleteDocConfirm(true); }} data-testid={`button-delete-doc-${doc.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">{getCategoryLabel(doc.category)}</Badge>
                            <VisibilityBadge roles={doc.visibleToRoles as RoleValue[]} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 truncate">{doc.fileName}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      <Dialog open={videoDialogOpen} onOpenChange={(open) => { if (!open) closeVideoDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTutorial ? "Edit Global Video" : "Add Global Video"}</DialogTitle>
            <DialogDescription>This video will appear in every tenant's Help & Training page.</DialogDescription>
          </DialogHeader>
          <Form {...videoForm}>
            <form onSubmit={videoForm.handleSubmit(handleSubmitVideo)} className="space-y-4">
              <FormField control={videoForm.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} data-testid="input-video-title" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={videoForm.control} name="youtubeUrl" render={({ field }) => (
                <FormItem><FormLabel>YouTube URL</FormLabel><FormControl><Input {...field} placeholder="https://youtube.com/watch?v=..." data-testid="input-video-url" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={videoForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea {...field} rows={2} className="resize-none" data-testid="input-video-description" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={videoForm.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel><FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-video-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={videoForm.control} name="sortOrder" render={({ field }) => (
                <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" {...field} data-testid="input-video-sort" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={videoForm.control} name="visibleToRoles" render={({ field }) => (
                <FormItem><FormControl>
                  <RolePicker value={(field.value as RoleValue[]) || []} onChange={field.onChange} />
                </FormControl></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeVideoDialog}>Cancel</Button>
                <Button type="submit" disabled={createVideoMutation.isPending || updateVideoMutation.isPending} data-testid="button-save-video">
                  {(createVideoMutation.isPending || updateVideoMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingTutorial ? "Update" : "Add Video"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={docDialogOpen} onOpenChange={(open) => { if (!open) closeDocDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Global Document" : "Add Global Document"}</DialogTitle>
            <DialogDescription>This document will appear in every tenant's Help & Training page.</DialogDescription>
          </DialogHeader>
          <Form {...docForm}>
            <form onSubmit={docForm.handleSubmit(handleSubmitDoc)} className="space-y-4">
              <FormField control={docForm.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} data-testid="input-doc-title" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={docForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea {...field} rows={2} className="resize-none" data-testid="input-doc-description" /></FormControl><FormMessage /></FormItem>
              )} />
              {!editingDoc && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">File</label>
                  <Input type="file" accept=".pdf,image/*" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} data-testid="input-doc-file" />
                </div>
              )}
              <FormField control={docForm.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel><FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-doc-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={docForm.control} name="sortOrder" render={({ field }) => (
                <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" {...field} data-testid="input-doc-sort" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={docForm.control} name="visibleToRoles" render={({ field }) => (
                <FormItem><FormControl>
                  <RolePicker value={(field.value as RoleValue[]) || []} onChange={field.onChange} />
                </FormControl></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDocDialog}>Cancel</Button>
                <Button type="submit" disabled={uploading || createDocMutation.isPending || updateDocMutation.isPending} data-testid="button-save-doc">
                  {(uploading || createDocMutation.isPending || updateDocMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingDoc ? "Update" : "Upload Document"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteVideoConfirm} onOpenChange={setDeleteVideoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Global Video?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the video from all tenants' Help & Training pages. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => videoToDelete && deleteVideoMutation.mutate(videoToDelete)} data-testid="button-confirm-delete-video">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDocConfirm} onOpenChange={setDeleteDocConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Global Document?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the document from all tenants' Help & Training pages. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => docToDelete && deleteDocMutation.mutate(docToDelete)} data-testid="button-confirm-delete-doc">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
