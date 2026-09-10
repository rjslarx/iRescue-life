import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { canAttestOpenedRequirement } from "@shared/volunteer-training";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Loader2, Plus, Edit, Trash2, Play, Video, BookOpen,
  ExternalLink, FileText, Upload, Download, File, Lock, Eye, X, Globe,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
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

const VISIBLE_TO_ROLES_SCHEMA = z.array(z.enum(["admin", "board_member", "staff", "foster", "volunteer"])).optional();

// ── Role Picker ────────────────────────────────────────────────────────────────

function RolePicker({
  value,
  onChange,
}: {
  value: RoleValue[];
  onChange: (roles: RoleValue[]) => void;
}) {
  function toggle(role: RoleValue) {
    if (value.includes(role)) {
      onChange(value.filter(r => r !== role));
    } else {
      onChange([...value, role]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Visible To</span>
      </div>
      <p className="text-xs text-muted-foreground">Leave all unchecked to show to everyone.</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {ROLES.map(role => (
          <label
            key={role.value}
            className="flex items-center gap-2 cursor-pointer select-none"
            data-testid={`checkbox-role-${role.value}`}
          >
            <Checkbox
              checked={value.includes(role.value)}
              onCheckedChange={() => toggle(role.value)}
            />
            <span className="text-sm">{role.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Visibility badge helper ────────────────────────────────────────────────────

function VisibilityBadge({ roles }: { roles: RoleValue[] | null | undefined }) {
  if (!roles || roles.length === 0) return null;
  const label = roles.length === ROLES.length
    ? "All roles"
    : roles.map(r => ROLES.find(ro => ro.value === r)?.label ?? r).join(" · ");
  return (
    <Badge variant="outline" className="w-fit gap-1 text-xs" data-testid="badge-visibility">
      <Lock className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// ── Video helpers ──────────────────────────────────────────────────────────────

const tutorialFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  youtubeUrl: z.string().min(1, "Video URL is required").url("Must be a valid URL"),
  category: z.enum(["getting-started", "animals", "medical", "fosters", "volunteers", "communications", "finance", "website", "settings", "other"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  visibleToRoles: VISIBLE_TO_ROLES_SCHEMA,
  requiredForVolunteers: z.boolean().default(false),
  renewalMonths: z.coerce.number().int().min(1).max(120).default(12),
});
type TutorialFormData = z.infer<typeof tutorialFormSchema>;

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isYouTubeUrl(url: string) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return (
      <div className="aspect-video bg-muted flex items-center justify-center rounded-lg">
        <p className="text-muted-foreground text-sm">Invalid YouTube URL</p>
      </div>
    );
  }
  return (
    <div className="aspect-video rounded-lg overflow-hidden">
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="border-0"
      />
    </div>
  );
}

// ── Document helpers ───────────────────────────────────────────────────────────

const docFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["getting-started", "animals", "medical", "fosters", "volunteers", "communications", "finance", "website", "settings", "other"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
  visibleToRoles: VISIBLE_TO_ROLES_SCHEMA,
});
type DocFormData = z.infer<typeof docFormSchema>;

function getFileIcon(mimeType: string | null | undefined) {
  if (!mimeType) return <File className="h-8 w-8 text-muted-foreground" />;
  if (mimeType === "application/pdf") return <FileText className="h-8 w-8 text-red-500" />;
  if (mimeType.startsWith("image/")) return <File className="h-8 w-8 text-blue-500" />;
  return <FileText className="h-8 w-8 text-muted-foreground" />;
}

function getCategoryLabel(value: string) {
  return CATEGORIES.find(c => c.value === value)?.label || value;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TutorialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.roles.includes("admin") || user?.roles.includes("owner");
  const canManageTutorials = isAdmin || !!user?.roles.includes("staff");
  const isVolunteer = !!user?.roles.includes("volunteer");

  // ── Video state ──────────────────────────────────────────────────────────────
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [deleteVideoConfirm, setDeleteVideoConfirm] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [openedRequiredVideos, setOpenedRequiredVideos] = useState<Map<string, number>>(new Map());

  // ── Document state ───────────────────────────────────────────────────────────
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<HelpDocument | null>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: tutData, isLoading: tutLoading } = useQuery<{ tutorials: Tutorial[] }>({
    queryKey: ['/api/tutorials'],
  });
  const { data: myTraining } = useQuery<{
    requirements: Array<{ tutorialId: string; requirementVersion: number; status: string; completion: { renewalDueAt: string } | null }>;
  }>({
    queryKey: ['/api/volunteer-training/me'],
    enabled: !!user,
    retry: false,
  });
  const attestMutation = useMutation({
    mutationFn: async ({ tutorialId, requirementVersion }: { tutorialId: string; requirementVersion: number }) =>
      (await apiRequest('POST', `/api/volunteer-training/${tutorialId}/attest`, { attested: true, requirementVersion })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volunteer-training/me'] });
      toast({ title: "Training attestation recorded", description: "Your completion and renewal date are now on file." });
    },
    onError: (e: any) => toast({ title: "Unable to record attestation", description: e.message, variant: "destructive" }),
  });
  const { data: docData, isLoading: docLoading } = useQuery<{ documents: HelpDocument[] }>({
    queryKey: ['/api/help-documents'],
  });

  // ── Video form ───────────────────────────────────────────────────────────────
  const videoForm = useForm<TutorialFormData>({
    resolver: zodResolver(tutorialFormSchema),
    defaultValues: { title: "", description: "", youtubeUrl: "", category: "getting-started", sortOrder: 0, visibleToRoles: [], requiredForVolunteers: false, renewalMonths: 12 },
  });

  const createVideoMutation = useMutation({
    mutationFn: async (data: TutorialFormData) => (await apiRequest('POST', '/api/tutorials', {
      ...data,
      visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({ title: "Tutorial added" });
      closeVideoDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateVideoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TutorialFormData> }) =>
      (await apiRequest('PATCH', `/api/tutorials/${id}`, {
        ...data,
        visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({ title: "Tutorial updated" });
      closeVideoDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/tutorials/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({ title: "Tutorial deleted" });
      setDeleteVideoConfirm(false);
      setVideoToDelete(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function closeVideoDialog() {
    setVideoDialogOpen(false);
    setEditingTutorial(null);
    videoForm.reset({ title: "", description: "", youtubeUrl: "", category: "getting-started", sortOrder: 0, visibleToRoles: [], requiredForVolunteers: false, renewalMonths: 12 });
  }

  function handleEditVideo(tutorial: Tutorial) {
    setEditingTutorial(tutorial);
    videoForm.reset({
      title: tutorial.title,
      description: tutorial.description || "",
      youtubeUrl: tutorial.youtubeUrl,
      category: tutorial.category as any,
      sortOrder: tutorial.sortOrder,
      visibleToRoles: (tutorial.visibleToRoles as RoleValue[]) || [],
      requiredForVolunteers: tutorial.requiredForVolunteers,
      renewalMonths: tutorial.renewalMonths,
    });
    setVideoDialogOpen(true);
  }

  function handleSubmitVideo(data: TutorialFormData) {
    if (editingTutorial) {
      updateVideoMutation.mutate({ id: editingTutorial.id, data });
    } else {
      createVideoMutation.mutate(data);
    }
  }

  // ── Document form ────────────────────────────────────────────────────────────
  const docForm = useForm<DocFormData>({
    resolver: zodResolver(docFormSchema),
    defaultValues: { title: "", description: "", category: "getting-started", sortOrder: 0, visibleToRoles: [] },
  });

  const createDocMutation = useMutation({
    mutationFn: async (data: DocFormData & { fileUrl: string; fileName: string; mimeType: string }) =>
      (await apiRequest('POST', '/api/help-documents', {
        ...data,
        visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/help-documents'] });
      toast({ title: "Document uploaded" });
      closeDocDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DocFormData> }) =>
      (await apiRequest('PATCH', `/api/help-documents/${id}`, {
        ...data,
        visibleToRoles: data.visibleToRoles?.length ? data.visibleToRoles : null,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/help-documents'] });
      toast({ title: "Document updated" });
      closeDocDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest('DELETE', `/api/help-documents/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/help-documents'] });
      toast({ title: "Document deleted" });
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
      title: doc.title,
      description: doc.description || "",
      category: doc.category as any,
      sortOrder: doc.sortOrder,
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
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(selectedFile.type) && !selectedFile.type.startsWith('image/')) {
      toast({ title: 'Unsupported file type', description: 'Please upload a PDF or image file. Word documents and other formats cannot be previewed in the browser.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", selectedFile);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { uploadedPaths } = await uploadRes.json();
      if (!uploadedPaths?.length) throw new Error("No file URL returned");
      createDocMutation.mutate({
        ...data,
        fileUrl: uploadedPaths[0],
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const tutorials = tutData?.tutorials || [];
  const documents = docData?.documents || [];

  const groupedTutorials = CATEGORIES.reduce((acc, cat) => {
    const catTuts = tutorials.filter(t => t.category === cat.value);
    if (catTuts.length > 0) acc[cat.value] = { label: cat.label, tutorials: catTuts };
    return acc;
  }, {} as Record<string, { label: string; tutorials: Tutorial[] }>);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Help &amp; Training
          </h1>
          <p className="text-muted-foreground mt-1">
            Video tutorials and reference documents for your team
          </p>
        </div>

        <Tabs defaultValue="documents" className="space-y-6">
          <TabsList data-testid="tabs-main">
            <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
            <TabsTrigger value="videos" data-testid="tab-videos">Videos</TabsTrigger>
          </TabsList>

          {/* ── DOCUMENTS TAB ──────────────────────────────────────────────── */}
          <TabsContent value="documents" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">Reference documents, guides, and resources for your team</p>
              {isAdmin && (
                <Button onClick={() => setDocDialogOpen(true)} data-testid="button-upload-document">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              )}
            </div>

            {docLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No documents yet</h3>
                  <p className="text-muted-foreground text-center mt-2 max-w-md">
                    {isAdmin
                      ? "Upload PDFs, Word documents, or images to share resources with your team."
                      : "Training documents will appear here once your admin uploads them."}
                  </p>
                  {isAdmin && (
                    <Button onClick={() => setDocDialogOpen(true)} className="mt-4" data-testid="button-upload-first-document">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Document
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {documents.map(doc => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isAdmin={isAdmin}
                    onEdit={() => handleEditDoc(doc)}
                    onDelete={() => { setDocToDelete(doc.id); setDeleteDocConfirm(true); }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── VIDEOS TAB ─────────────────────────────────────────────────── */}
          <TabsContent value="videos" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">Video tutorials to help your team learn the platform</p>
              {canManageTutorials && (
                <Button onClick={() => setVideoDialogOpen(true)} data-testid="button-add-tutorial">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Video
                </Button>
              )}
            </div>

            {tutLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tutorials.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Video className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No videos yet</h3>
                  <p className="text-muted-foreground text-center mt-2 max-w-md">
                    {canManageTutorials
                      ? "Add your first video tutorial to help your team learn how to use the platform."
                      : "Video tutorials will appear here once your admin adds them."}
                  </p>
                  {canManageTutorials && (
                    <Button onClick={() => setVideoDialogOpen(true)} className="mt-4" data-testid="button-add-first-tutorial">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Video
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-6">
                <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-categories">
                  <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                  {Object.entries(groupedTutorials).map(([key, { label }]) => (
                    <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>{label}</TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="all" className="space-y-8">
                  {Object.entries(groupedTutorials).map(([key, { label, tutorials: catTuts }]) => (
                    <div key={key}>
                      <h2 className="text-lg font-semibold mb-4">{label}</h2>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {catTuts.map(tutorial => (
                          <TutorialCard
                            key={tutorial.id}
                            tutorial={tutorial}
                            isAdmin={canManageTutorials}
                            isExpanded={expandedVideo === tutorial.id}
                            onExpand={() => {
                              setExpandedVideo(expandedVideo === tutorial.id ? null : tutorial.id);
                              if (tutorial.requiredForVolunteers) setOpenedRequiredVideos(previous => new Map(previous).set(tutorial.id, tutorial.requirementVersion));
                            }}
                            onEdit={() => handleEditVideo(tutorial)}
                            onDelete={() => { setVideoToDelete(tutorial.id); setDeleteVideoConfirm(true); }}
                            trainingStatus={myTraining?.requirements.find(item => item.tutorialId === tutorial.id)}
                            hasOpened={canAttestOpenedRequirement(openedRequiredVideos.get(tutorial.id), tutorial.requirementVersion)}
                            onOpened={() => setOpenedRequiredVideos(previous => new Map(previous).set(tutorial.id, tutorial.requirementVersion))}
                            onAttest={() => attestMutation.mutate({ tutorialId: tutorial.id, requirementVersion: openedRequiredVideos.get(tutorial.id)! })}
                            attesting={attestMutation.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {Object.entries(groupedTutorials).map(([key, { tutorials: catTuts }]) => (
                  <TabsContent key={key} value={key}>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {catTuts.map(tutorial => (
                        <TutorialCard
                          key={tutorial.id}
                          tutorial={tutorial}
                          isAdmin={canManageTutorials}
                          isExpanded={expandedVideo === tutorial.id}
                          onExpand={() => {
                            setExpandedVideo(expandedVideo === tutorial.id ? null : tutorial.id);
                            if (tutorial.requiredForVolunteers) setOpenedRequiredVideos(previous => new Map(previous).set(tutorial.id, tutorial.requirementVersion));
                          }}
                          onEdit={() => handleEditVideo(tutorial)}
                          onDelete={() => { setVideoToDelete(tutorial.id); setDeleteVideoConfirm(true); }}
                          trainingStatus={myTraining?.requirements.find(item => item.tutorialId === tutorial.id)}
                          hasOpened={canAttestOpenedRequirement(openedRequiredVideos.get(tutorial.id), tutorial.requirementVersion)}
                          onOpened={() => setOpenedRequiredVideos(previous => new Map(previous).set(tutorial.id, tutorial.requirementVersion))}
                          onAttest={() => attestMutation.mutate({ tutorialId: tutorial.id, requirementVersion: openedRequiredVideos.get(tutorial.id)! })}
                          attesting={attestMutation.isPending}
                        />
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>

        </Tabs>

        {/* ── VIDEO DIALOG ──────────────────────────────────────────────────── */}
        <Dialog open={videoDialogOpen} onOpenChange={(open) => !open && closeVideoDialog()}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTutorial ? "Edit Video" : "Add Video"}</DialogTitle>
              <DialogDescription>
                Add a video link (YouTube, Vimeo, Loom, or any video URL) to help your team.
              </DialogDescription>
            </DialogHeader>
            <Form {...videoForm}>
              <form onSubmit={videoForm.handleSubmit(handleSubmitVideo)} className="space-y-4">
                <FormField
                  control={videoForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., How to Add a New Animal" {...field} data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="youtubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Video URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.youtube.com/watch?v=... or any video link" {...field} data-testid="input-video-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A brief description of what this video covers..." {...field} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="visibleToRoles"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RolePicker
                          value={(field.value as RoleValue[]) || []}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-sort-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={videoForm.control}
                  name="requiredForVolunteers"
                  render={({ field }) => (
                    <FormItem className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-required-volunteer-training" />
                        </FormControl>
                        <FormLabel className="m-0">Required volunteer training</FormLabel>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Volunteers must explicitly attest after opening this video. The system does not verify playback.
                      </p>
                    </FormItem>
                  )}
                />
                {videoForm.watch("requiredForVolunteers") && (
                  <FormField
                    control={videoForm.control}
                    name="renewalMonths"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Renew every (months)</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={120} {...field} data-testid="input-training-renewal-months" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeVideoDialog}>Cancel</Button>
                  <Button type="submit" disabled={createVideoMutation.isPending || updateVideoMutation.isPending} data-testid="button-submit-tutorial">
                    {(createVideoMutation.isPending || updateVideoMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingTutorial ? "Update" : "Add"} Video
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* ── DOCUMENT DIALOG ───────────────────────────────────────────────── */}
        <Dialog open={docDialogOpen} onOpenChange={(open) => !open && closeDocDialog()}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDoc ? "Edit Document" : "Upload Document"}</DialogTitle>
              <DialogDescription>
                {editingDoc ? "Update the document details." : "Upload a PDF, Word document, or image to share with your team."}
              </DialogDescription>
            </DialogHeader>
            <Form {...docForm}>
              <form onSubmit={docForm.handleSubmit(handleSubmitDoc)} className="space-y-4">
                <FormField
                  control={docForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Intake Procedures Guide" {...field} data-testid="input-doc-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={docForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-doc-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={docForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A brief description of this document..." {...field} data-testid="input-doc-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={docForm.control}
                  name="visibleToRoles"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RolePicker
                          value={(field.value as RoleValue[]) || []}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!editingDoc && (
                  <div className="space-y-2">
                    <FormLabel>File</FormLabel>
                    <div
                      className="border-2 border-dashed rounded-md p-6 flex flex-col items-center gap-2 cursor-pointer hover-elevate"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="dropzone-document"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      {selectedFile ? (
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium">Click to select a file</p>
                          <p className="text-xs text-muted-foreground">PDF or image files (JPG, PNG, GIF, WebP) — up to 15 MB</p>
                        </>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                      data-testid="input-doc-file"
                    />
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDocDialog}>Cancel</Button>
                  <Button
                    type="submit"
                    disabled={uploading || createDocMutation.isPending || updateDocMutation.isPending}
                    data-testid="button-submit-document"
                  >
                    {(uploading || createDocMutation.isPending || updateDocMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingDoc ? "Update" : "Upload"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* ── DELETE VIDEO CONFIRM ──────────────────────────────────────────── */}
        <AlertDialog open={deleteVideoConfirm} onOpenChange={setDeleteVideoConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Video</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete this video tutorial? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => videoToDelete && deleteVideoMutation.mutate(videoToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-video"
              >
                {deleteVideoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── DELETE DOCUMENT CONFIRM ───────────────────────────────────────── */}
        <AlertDialog open={deleteDocConfirm} onOpenChange={setDeleteDocConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Document</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete this document? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => docToDelete && deleteDocMutation.mutate(docToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-document"
              >
                {deleteDocMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TutorialCard({
  tutorial, isAdmin, isExpanded, onExpand, onEdit, onDelete,
  trainingStatus, hasOpened, onOpened, onAttest, attesting,
}: {
  tutorial: Tutorial;
  isAdmin?: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  trainingStatus?: { status: string; completion: { renewalDueAt: string } | null };
  hasOpened: boolean;
  onOpened: () => void;
  onAttest: () => void;
  attesting: boolean;
}) {
  const isYT = isYouTubeUrl(tutorial.youtubeUrl);
  const videoId = isYT ? extractYouTubeId(tutorial.youtubeUrl) : null;
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

  return (
    <Card className="overflow-hidden" data-testid={`card-tutorial-${tutorial.id}`}>
      {isYT ? (
        isExpanded ? (
          <YouTubeEmbed url={tutorial.youtubeUrl} title={tutorial.title} />
        ) : (
          <div className="aspect-video bg-muted relative cursor-pointer group" onClick={onExpand}>
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={tutorial.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-white/90 rounded-full p-3">
                <Play className="h-8 w-8 text-primary" />
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <Video className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">{tutorial.title}</CardTitle>
          {isAdmin && !tutorial.isGlobal && (
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-${tutorial.id}`}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-${tutorial.id}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="w-fit">
            {CATEGORIES.find(c => c.value === tutorial.category)?.label || tutorial.category}
          </Badge>
          {tutorial.isGlobal && (
            <Badge variant="outline" className="w-fit gap-1 text-xs" data-testid={`badge-platform-${tutorial.id}`}>
              <Globe className="h-3 w-3" /> Platform
            </Badge>
          )}
          {tutorial.requiredForVolunteers && (
            <Badge variant="destructive" className="w-fit" data-testid={`badge-required-training-${tutorial.id}`}>
              Required · v{tutorial.requirementVersion} · renew every {tutorial.renewalMonths} months
            </Badge>
          )}
          {isAdmin && !tutorial.isGlobal && <VisibilityBadge roles={tutorial.visibleToRoles as RoleValue[] | null} />}
        </div>
      </CardHeader>

      {tutorial.description && (
        <CardContent className="pt-0">
          <CardDescription className="line-clamp-2">{tutorial.description}</CardDescription>
        </CardContent>
      )}

      <CardContent className="pt-0 pb-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            window.open(tutorial.youtubeUrl, '_blank', 'noopener,noreferrer');
            onOpened();
          }}
          data-testid={`button-open-video-${tutorial.id}`}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          {isYT ? "Open in YouTube" : "Watch Video"}
        </Button>
        {tutorial.requiredForVolunteers && trainingStatus && (
          <div className="mt-3 space-y-2">
            {trainingStatus.completion && trainingStatus.status === 'current' ? (
              <p className="text-xs text-green-700 dark:text-green-400" data-testid={`training-current-${tutorial.id}`}>
                Attested · renew by {new Date(trainingStatus.completion.renewalDueAt).toLocaleDateString()}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {trainingStatus.status === 'due_soon'
                    ? `Renewal is available now. Your current term remains valid through ${new Date(trainingStatus.completion!.renewalDueAt).toLocaleDateString()}. Open the current video before renewing.`
                    : 'Open the video, then confirm that you watched this assigned training. Opening it alone does not complete training.'}
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!hasOpened || attesting}
                  onClick={onAttest}
                  data-testid={`button-attest-training-${tutorial.id}`}
                >
                  {attesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {trainingStatus.status === 'due_soon' ? 'I attest and renew this training' : 'I attest that I watched this training'}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getViewerUrl(fileUrl: string, token: string): string {
  return `${window.location.origin}${fileUrl}?view_token=${token}`;
}

function DocumentCard({
  doc, isAdmin, onEdit, onDelete,
}: {
  doc: HelpDocument;
  isAdmin?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const isPdf = doc.mimeType === 'application/pdf';
  const isImage = (doc.mimeType ?? '').startsWith('image/');
  const isPreviewable = isPdf || isImage;

  async function openViewer() {
    setOpening(true);
    try {
      const res = await apiRequest('POST', `/api/help-documents/${doc.id}/view-token`);
      const data = await res.json();
      setViewToken(data.token);
      setViewerOpen(true);
    } catch {
      toast({ title: 'Unable to open document', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setOpening(false);
    }
  }

  async function handleDownload() {
    if (!viewToken) return;
    const url = `${window.location.origin}${doc.fileUrl}?view_token=${viewToken}`;
    setDownloading(true);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = doc.fileName || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  }

  const viewerUrl = viewToken ? getViewerUrl(doc.fileUrl, viewToken) : null;

  return (
    <>
      <Card data-testid={`card-document-${doc.id}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 mt-0.5">{getFileIcon(doc.mimeType)}</div>
              <CardTitle className="text-base line-clamp-2">{doc.title}</CardTitle>
            </div>
            {isAdmin && !doc.isGlobal && (
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-doc-${doc.id}`}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-doc-${doc.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="w-fit">{getCategoryLabel(doc.category)}</Badge>
            {doc.isGlobal && (
              <Badge variant="outline" className="w-fit gap-1 text-xs" data-testid={`badge-platform-doc-${doc.id}`}>
                <Globe className="h-3 w-3" /> Platform
              </Badge>
            )}
            {isAdmin && !doc.isGlobal && <VisibilityBadge roles={doc.visibleToRoles as RoleValue[] | null} />}
          </div>
        </CardHeader>

        {doc.description && (
          <CardContent className="pt-0">
            <CardDescription className="line-clamp-2">{doc.description}</CardDescription>
          </CardContent>
        )}

        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-muted-foreground mb-2 truncate">{doc.fileName}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={opening}
            onClick={openViewer}
            data-testid={`button-open-doc-${doc.id}`}
          >
            {opening
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : isPreviewable
                ? <Eye className="h-4 w-4 mr-2" />
                : <Download className="h-4 w-4 mr-2" />}
            {opening ? 'Opening…' : isPreviewable ? 'View Document' : 'Open / Download'}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={viewerOpen} onOpenChange={(open) => { setViewerOpen(open); if (!open) setViewToken(null); }}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden flex flex-col" style={{ height: '90vh' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0">{getFileIcon(doc.mimeType)}</div>
              <span className="font-semibold text-sm truncate">{doc.title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {viewerUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloading}
                  onClick={handleDownload}
                  data-testid={`button-download-doc-${doc.id}`}
                >
                  {downloading
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <Download className="h-4 w-4 mr-1.5" />}
                  {downloading ? 'Downloading…' : 'Download'}
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setViewerOpen(false)} data-testid={`button-close-viewer-${doc.id}`}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-muted/30">
            {viewerUrl && isImage && (
              <div className="flex items-center justify-center h-full p-4">
                <img src={viewerUrl} alt={doc.title} className="max-h-full max-w-full object-contain rounded-md" />
              </div>
            )}
            {viewerUrl && isPdf && (
              <iframe
                src={viewerUrl}
                title={doc.title}
                className="w-full h-full border-0"
              />
            )}
            {viewerUrl && !isImage && !isPdf && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
                <FileText className="h-16 w-16" />
                <p className="text-sm text-center max-w-xs">
                  This file type cannot be previewed in the browser. Use the Download button above to open it.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
