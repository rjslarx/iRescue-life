import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Plus, Edit, Trash2, Play, Video, BookOpen, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import type { Tutorial } from "@shared/schema";

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

const tutorialFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  youtubeUrl: z.string().min(1, "YouTube URL is required").refine(
    (url) => url.includes("youtube.com") || url.includes("youtu.be"),
    "Must be a valid YouTube URL"
  ),
  category: z.enum(["getting-started", "animals", "medical", "fosters", "volunteers", "communications", "finance", "website", "settings", "other"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
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

function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    return (
      <div className="aspect-video bg-muted flex items-center justify-center rounded-lg">
        <p className="text-muted-foreground">Invalid YouTube URL</p>
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

export default function TutorialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tutorialToDelete, setTutorialToDelete] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const isAdmin = user?.roles.includes("admin");

  const { data, isLoading } = useQuery<{ tutorials: Tutorial[] }>({
    queryKey: ['/api/tutorials'],
  });

  const form = useForm<TutorialFormData>({
    resolver: zodResolver(tutorialFormSchema),
    defaultValues: {
      title: "",
      description: "",
      youtubeUrl: "",
      category: "getting-started",
      sortOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TutorialFormData) => {
      const res = await apiRequest('POST', '/api/tutorials', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({
        title: "Success",
        description: "Tutorial has been added.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add tutorial",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TutorialFormData> }) => {
      const res = await apiRequest('PATCH', `/api/tutorials/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({
        title: "Success",
        description: "Tutorial has been updated.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update tutorial",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/tutorials/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tutorials'] });
      toast({
        title: "Success",
        description: "Tutorial has been deleted.",
      });
      setDeleteConfirmOpen(false);
      setTutorialToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete tutorial",
        variant: "destructive",
      });
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTutorial(null);
    form.reset({
      title: "",
      description: "",
      youtubeUrl: "",
      category: "getting-started",
      sortOrder: 0,
    });
  };

  const handleEdit = (tutorial: Tutorial) => {
    setEditingTutorial(tutorial);
    form.reset({
      title: tutorial.title,
      description: tutorial.description || "",
      youtubeUrl: tutorial.youtubeUrl,
      category: tutorial.category as any,
      sortOrder: tutorial.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: TutorialFormData) => {
    if (editingTutorial) {
      updateMutation.mutate({ id: editingTutorial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const tutorials = data?.tutorials || [];
  const filteredTutorials = selectedCategory === "all" 
    ? tutorials 
    : tutorials.filter(t => t.category === selectedCategory);

  const groupedTutorials = CATEGORIES.reduce((acc, cat) => {
    const categoryTutorials = tutorials.filter(t => t.category === cat.value);
    if (categoryTutorials.length > 0) {
      acc[cat.value] = { label: cat.label, tutorials: categoryTutorials };
    }
    return acc;
  }, {} as Record<string, { label: string; tutorials: Tutorial[] }>);

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              Video Tutorials
            </h1>
            <p className="text-muted-foreground mt-1">
              Learn how to use all the features of your rescue management platform
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-tutorial">
              <Plus className="h-4 w-4 mr-2" />
              Add Tutorial
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tutorials.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No tutorials yet</h3>
              <p className="text-muted-foreground text-center mt-2 max-w-md">
                {isAdmin 
                  ? "Add your first video tutorial to help your team learn how to use the platform."
                  : "Video tutorials will appear here once your admin adds them."
                }
              </p>
              {isAdmin && (
                <Button onClick={() => setDialogOpen(true)} className="mt-4" data-testid="button-add-first-tutorial">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tutorial
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="space-y-6">
            <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-categories">
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              {Object.entries(groupedTutorials).map(([key, { label }]) => (
                <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all" className="space-y-8">
              {Object.entries(groupedTutorials).map(([key, { label, tutorials: catTutorials }]) => (
                <div key={key}>
                  <h2 className="text-lg font-semibold mb-4">{label}</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {catTutorials.map(tutorial => (
                      <TutorialCard
                        key={tutorial.id}
                        tutorial={tutorial}
                        isAdmin={isAdmin}
                        isExpanded={expandedVideo === tutorial.id}
                        onExpand={() => setExpandedVideo(expandedVideo === tutorial.id ? null : tutorial.id)}
                        onEdit={() => handleEdit(tutorial)}
                        onDelete={() => {
                          setTutorialToDelete(tutorial.id);
                          setDeleteConfirmOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            {Object.entries(groupedTutorials).map(([key, { tutorials: catTutorials }]) => (
              <TabsContent key={key} value={key}>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {catTutorials.map(tutorial => (
                    <TutorialCard
                      key={tutorial.id}
                      tutorial={tutorial}
                      isAdmin={isAdmin}
                      isExpanded={expandedVideo === tutorial.id}
                      onExpand={() => setExpandedVideo(expandedVideo === tutorial.id ? null : tutorial.id)}
                      onEdit={() => handleEdit(tutorial)}
                      onDelete={() => {
                        setTutorialToDelete(tutorial.id);
                        setDeleteConfirmOpen(true);
                      }}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTutorial ? "Edit Tutorial" : "Add Tutorial"}</DialogTitle>
              <DialogDescription>
                Add a YouTube video tutorial to help your team learn the platform.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="youtubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>YouTube URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.youtube.com/watch?v=..." {...field} data-testid="input-youtube-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
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
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="A brief description of what this tutorial covers..." 
                          {...field} 
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-sort-order"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-tutorial"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingTutorial ? "Update" : "Add"} Tutorial
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Tutorial</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this tutorial? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => tutorialToDelete && deleteMutation.mutate(tutorialToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

function TutorialCard({
  tutorial,
  isAdmin,
  isExpanded,
  onExpand,
  onEdit,
  onDelete,
}: {
  tutorial: Tutorial;
  isAdmin?: boolean;
  isExpanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const videoId = extractYouTubeId(tutorial.youtubeUrl);
  const thumbnailUrl = videoId 
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null;

  return (
    <Card className="overflow-hidden" data-testid={`card-tutorial-${tutorial.id}`}>
      {isExpanded ? (
        <YouTubeEmbed url={tutorial.youtubeUrl} title={tutorial.title} />
      ) : (
        <div 
          className="aspect-video bg-muted relative cursor-pointer group"
          onClick={onExpand}
        >
          {thumbnailUrl ? (
            <img 
              src={thumbnailUrl} 
              alt={tutorial.title}
              className="w-full h-full object-cover"
            />
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
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2">{tutorial.title}</CardTitle>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onEdit}
                data-testid={`button-edit-${tutorial.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onDelete}
                data-testid={`button-delete-${tutorial.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <Badge variant="secondary" className="w-fit">
          {CATEGORIES.find(c => c.value === tutorial.category)?.label || tutorial.category}
        </Badge>
      </CardHeader>
      {tutorial.description && (
        <CardContent className="pt-0">
          <CardDescription className="line-clamp-2">
            {tutorial.description}
          </CardDescription>
        </CardContent>
      )}
      <CardContent className="pt-0 pb-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => window.open(tutorial.youtubeUrl, '_blank')}
          data-testid={`button-open-youtube-${tutorial.id}`}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in YouTube
        </Button>
      </CardContent>
    </Card>
  );
}
