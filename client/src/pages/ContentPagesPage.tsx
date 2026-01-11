import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Eye, FileText, Copy, Image as ImageIcon, LayoutGrid, Code } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ObjectUploader } from "@/components/ObjectUploader";
import { PageBuilder, BlockRenderer } from "@/components/PageBuilder";
import type { CustomPage, PageBlock } from "@shared/schema";

// Form validation schema
const pageFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens only"),
  excerpt: z.string().max(300).optional(),
  contentMarkdown: z.string().optional().default(""),
  contentBlocks: z.array(z.any()).optional(),
  useBlockEditor: z.boolean().default(true),
  isPublished: z.boolean().default(false),
  showInNavigation: z.boolean().default(false),
});

type PageFormData = z.infer<typeof pageFormSchema>;

export default function ContentPagesPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<CustomPage | null>(null);

  // Fetch pages
  const { data, isLoading } = useQuery<{ pages: CustomPage[] }>({
    queryKey: ['/api/custom-pages'],
  });

  const pages = data?.pages || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: PageFormData) => {
      return await apiRequest('POST', '/api/custom-pages', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-pages'] });
      toast({ title: "Page created successfully" });
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create page",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PageFormData> }) => {
      return await apiRequest('PATCH', `/api/custom-pages/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-pages'] });
      toast({ title: "Page updated successfully" });
      setIsEditDialogOpen(false);
      setEditingPage(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update page",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Publish toggle mutation
  const publishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      return await apiRequest('PATCH', `/api/custom-pages/${id}/publish`, { isPublished });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-pages'] });
      toast({ title: "Page publish status updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update publish status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/custom-pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-pages'] });
      toast({ title: "Page deleted successfully" });
      setDeletePageId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete page",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate slug from title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-end">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-page">
                <Plus className="w-4 h-4 mr-2" />
                New Page
              </Button>
            </DialogTrigger>
            <PageFormDialog
              mode="create"
              onSubmit={(data) => createMutation.mutate(data)}
              isPending={createMutation.isPending}
              generateSlug={generateSlug}
            />
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : pages.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No pages yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first custom page to provide information to your visitors
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-page">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Page
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pages.map((page) => (
              <Card key={page.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle>{page.title}</CardTitle>
                        {page.isPublished ? (
                          <Badge variant="default" data-testid={`badge-published-${page.id}`}>Published</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-draft-${page.id}`}>Draft</Badge>
                        )}
                        {page.showInNavigation && (
                          <Badge variant="outline" data-testid={`badge-nav-${page.id}`}>In Navigation</Badge>
                        )}
                      </div>
                      <CardDescription>/{page.slug}</CardDescription>
                      {page.excerpt && (
                        <p className="text-sm text-muted-foreground mt-2">{page.excerpt}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={page.isPublished}
                        onCheckedChange={(checked) =>
                          publishMutation.mutate({ id: page.id, isPublished: checked })
                        }
                        disabled={publishMutation.isPending}
                        data-testid={`switch-publish-${page.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingPage(page);
                          setIsEditDialogOpen(true);
                        }}
                        data-testid={`button-edit-${page.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletePageId(page.id)}
                        data-testid={`button-delete-${page.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        {editingPage && (
          <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingPage(null);
          }}>
            <PageFormDialog
              mode="edit"
              defaultValues={editingPage}
              onSubmit={(data) => updateMutation.mutate({ id: editingPage.id, data })}
              isPending={updateMutation.isPending}
              generateSlug={generateSlug}
            />
          </Dialog>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletePageId} onOpenChange={() => setDeletePageId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Page</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this page? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletePageId && deleteMutation.mutate(deletePageId)}
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}

// Page Form Dialog Component
function PageFormDialog({
  mode,
  defaultValues,
  onSubmit,
  isPending,
  generateSlug,
}: {
  mode: 'create' | 'edit';
  defaultValues?: CustomPage;
  onSubmit: (data: PageFormData) => void;
  isPending: boolean;
  generateSlug: (title: string) => string;
}) {
  const { toast } = useToast();
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [contentBlocks, setContentBlocks] = useState<PageBlock[]>(
    (defaultValues?.contentBlocks as PageBlock[]) || []
  );
  const [useBlockEditor, setUseBlockEditor] = useState(
    defaultValues?.useBlockEditor !== false
  );

  const form = useForm<PageFormData>({
    resolver: zodResolver(pageFormSchema),
    defaultValues: defaultValues ? {
      title: defaultValues.title,
      slug: defaultValues.slug,
      excerpt: defaultValues.excerpt || '',
      contentMarkdown: defaultValues.contentMarkdown || '',
      contentBlocks: (defaultValues.contentBlocks as PageBlock[]) || [],
      useBlockEditor: defaultValues.useBlockEditor !== false,
      isPublished: defaultValues.isPublished,
      showInNavigation: defaultValues.showInNavigation || false,
    } : {
      title: '',
      slug: '',
      excerpt: '',
      contentMarkdown: '',
      contentBlocks: [],
      useBlockEditor: true,
      isPublished: false,
      showInNavigation: false,
    },
  });

  const currentContent = form.watch('contentMarkdown');

  // Handle image upload for legacy markdown editor
  const handleImageUpload = (urls: string[]) => {
    setUploadedImages(prev => [...prev, ...urls]);
  };

  // Copy image markdown to clipboard
  const copyImageMarkdown = (url: string) => {
    const markdown = `![Image](${url})`;
    navigator.clipboard.writeText(markdown);
    toast({
      title: "Copied to clipboard",
      description: "Image markdown copied. Paste it into your content.",
    });
  };

  // Auto-generate slug from title when creating
  const handleTitleChange = (value: string) => {
    if (mode === 'create') {
      const currentSlug = form.getValues('slug');
      const previousTitle = form.getValues('title');
      const expectedSlugFromPreviousTitle = generateSlug(previousTitle);
      
      if (!currentSlug || currentSlug === expectedSlugFromPreviousTitle) {
        form.setValue('slug', generateSlug(value));
      }
    }
    form.setValue('title', value);
  };

  // Handle form submission with blocks
  const handleFormSubmit = (data: PageFormData) => {
    onSubmit({
      ...data,
      contentBlocks: useBlockEditor ? contentBlocks : [],
      useBlockEditor,
      contentMarkdown: useBlockEditor ? '' : data.contentMarkdown,
    });
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'Create New Page' : 'Edit Page'}</DialogTitle>
        <DialogDescription>
          {mode === 'create' 
            ? 'Create a new informational page for your website' 
            : 'Update the page content and settings'}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 flex-1 overflow-y-auto">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Adoption Process"
                    data-testid="input-page-title"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL Slug</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="adoption-process"
                    data-testid="input-page-slug"
                  />
                </FormControl>
                <FormDescription>
                  This will be the URL path: /{field.value || 'your-slug'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="excerpt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Excerpt (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Short description for SEO and previews"
                    rows={2}
                    data-testid="input-page-excerpt"
                  />
                </FormControl>
                <FormDescription>
                  Used for SEO meta descriptions (max 300 characters)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Editor Type Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Editor Type</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {useBlockEditor ? "Visual Block Editor" : "Markdown Editor"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={useBlockEditor ? "default" : "outline"}
                size="sm"
                onClick={() => setUseBlockEditor(true)}
                data-testid="button-use-blocks"
              >
                <LayoutGrid className="w-4 h-4 mr-1" />
                Blocks
              </Button>
              <Button
                type="button"
                variant={!useBlockEditor ? "default" : "outline"}
                size="sm"
                onClick={() => setUseBlockEditor(false)}
                data-testid="button-use-markdown"
              >
                <Code className="w-4 h-4 mr-1" />
                Markdown
              </Button>
            </div>
          </div>

          {/* Content Section */}
          {useBlockEditor ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                <h3 className="font-semibold text-sm">Page Content</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Build your page using drag-and-drop blocks. Add text, images, buttons, and more.
              </p>
              <PageBuilder
                blocks={contentBlocks}
                onChange={setContentBlocks}
              />
            </div>
          ) : (
            <>
              {/* Legacy Image Upload Section for Markdown */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  <h3 className="font-semibold text-sm">Page Images</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Upload images to use in your page content. Click the copy button to get the markdown code.
                </p>
                <ObjectUploader
                  onUploadComplete={(url) => handleImageUpload([url])}
                  accept="image/*"
                  folder="page-content"
                  maxSizeMB={5}
                />
                {uploadedImages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Uploaded Images:</p>
                    <div className="grid gap-2">
                      {uploadedImages.map((url, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
                          <img src={url} alt="Uploaded" className="w-12 h-12 object-cover rounded" />
                          <code className="flex-1 text-xs bg-muted px-2 py-1 rounded overflow-x-auto">
                            {url}
                          </code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyImageMarkdown(url)}
                            data-testid={`button-copy-image-${index}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="contentMarkdown"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <Tabs defaultValue="edit">
                      <TabsList className="mb-2">
                        <TabsTrigger value="edit" data-testid="tab-edit">Edit</TabsTrigger>
                        <TabsTrigger value="preview" data-testid="tab-preview">Preview</TabsTrigger>
                      </TabsList>
                      <TabsContent value="edit">
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Write your content in Markdown..."
                            rows={15}
                            className="font-mono"
                            data-testid="textarea-page-content"
                          />
                        </FormControl>
                      </TabsContent>
                      <TabsContent value="preview">
                        <div className="border rounded-md p-4 min-h-[360px] prose prose-sm max-w-none" data-testid="preview-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {currentContent || '*No content yet*'}
                          </ReactMarkdown>
                        </div>
                      </TabsContent>
                    </Tabs>
                    <FormDescription>
                      Supports Markdown formatting (headings, lists, links, etc.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          <FormField
            control={form.control}
            name="isPublished"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Publish Page</FormLabel>
                  <FormDescription>
                    Published pages are visible to the public
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-is-published"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="showInNavigation"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Show in Navigation</FormLabel>
                  <FormDescription>
                    Display this page in the public site's navigation header
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-show-in-navigation"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
      <DialogFooter>
        <Button
          type="submit"
          onClick={form.handleSubmit(handleFormSubmit)}
          disabled={isPending}
          data-testid="button-save-page"
        >
          {isPending ? 'Saving...' : mode === 'create' ? 'Create Page' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
