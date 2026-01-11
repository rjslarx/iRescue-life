import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Eye, EyeOff, Palette, Image as ImageIcon, Type } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { ContentModule } from "@shared/schema";

// Sanitize color values with strict allowlist
function sanitizeColor(value: string | undefined): string | undefined {
  if (!value || value === "") return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow hex colors (#RGB, #RRGGBB, #RRGGBBAA) - with end anchor
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  
  // Allow rgb/rgba colors with strict numeric range validation
  // RGB values: 0-255, Alpha: 0.0-1.0 (no scientific notation)
  // Returns CANONICAL format to prevent injection
  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const rNum = parseInt(r);
    const gNum = parseInt(g);
    const bNum = parseInt(b);
    
    if (rNum <= 255 && gNum <= 255 && bNum <= 255) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical rgba format, NOT user input
          return `rgba(${rNum}, ${gNum}, ${bNum}, ${aNum})`;
        }
      } else {
        // Return canonical rgb format, NOT user input
        return `rgb(${rNum}, ${gNum}, ${bNum})`;
      }
    }
  }
  
  // Allow HSL colors with strict numeric range validation
  // Hue: 0-360, Saturation/Lightness: 0-100%, Alpha: 0.0-1.0
  // Returns CANONICAL format to prevent injection
  const hslaMatch = trimmed.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i);
  if (hslaMatch) {
    const [, h, s, l, a] = hslaMatch;
    const hNum = parseInt(h);
    const sNum = parseInt(s);
    const lNum = parseInt(l);
    
    if (hNum <= 360 && sNum <= 100 && lNum <= 100) {
      if (a) {
        const aNum = parseFloat(a);
        if (aNum >= 0 && aNum <= 1) {
          // Return canonical hsla format, NOT user input
          return `hsla(${hNum}, ${sNum}%, ${lNum}%, ${aNum})`;
        }
      } else {
        // Return canonical hsl format, NOT user input
        return `hsl(${hNum}, ${sNum}%, ${lNum}%)`;
      }
    }
  }
  
  // Allow named colors (common safe ones) - return canonical lowercase value
  const namedColors: { [key: string]: string } = {
    'transparent': 'transparent',
    'black': 'black',
    'white': 'white',
    'red': 'red',
    'blue': 'blue',
    'green': 'green',
    'yellow': 'yellow',
    'orange': 'orange',
    'purple': 'purple',
    'pink': 'pink',
    'gray': 'gray',
    'grey': 'grey',
    'brown': 'brown',
    'cyan': 'cyan',
    'magenta': 'magenta',
    'navy': 'navy',
    'teal': 'teal',
    'lime': 'lime',
    'aqua': 'aqua',
    'maroon': 'maroon',
    'olive': 'olive',
    'silver': 'silver',
    'fuchsia': 'fuchsia'
  };
  
  return namedColors[trimmed] || undefined;
}

// Sanitize font family with allowlist
function sanitizeFontFamily(value: string | undefined): string | undefined {
  if (!value || value === "") return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow common safe font families - return ONLY the canonical safe value
  const safeFonts: { [key: string]: string } = {
    'inherit': 'inherit',
    'arial': 'Arial',
    'helvetica': 'Helvetica',
    'sans-serif': 'sans-serif',
    'serif': 'serif',
    'monospace': 'monospace',
    'times new roman': 'Times New Roman',
    'georgia': 'Georgia',
    'courier new': 'Courier New',
    'verdana': 'Verdana',
    'tahoma': 'Tahoma',
    'trebuchet ms': 'Trebuchet MS',
    'comic sans ms': 'Comic Sans MS',
    'impact': 'Impact',
    'palatino': 'Palatino',
    'garamond': 'Garamond',
    'bookman': 'Bookman',
    'courier': 'Courier',
    'monaco': 'Monaco',
    'lucida console': 'Lucida Console'
  };
  
  // Return the canonical safe value, NOT the user's input
  // This prevents attackers from appending extra CSS directives
  return safeFonts[trimmed] || undefined;
}

// Sanitize font size with strict pattern
// Returns CANONICAL format to prevent injection
function sanitizeFontSize(value: string | undefined): string | undefined {
  if (!value || value === "") return undefined;
  
  const trimmed = value.trim().toLowerCase();
  
  // Allow rem, em, px with numbers - validate single decimal point
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)(rem|em|px)$/i);
  if (unitMatch) {
    const [, num, unit] = unitMatch;
    // Ensure single decimal point (no 1.2.3)
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}${unit.toLowerCase()}`;
    }
  }
  
  // Allow percentage - validate single decimal point
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    const [, num] = pctMatch;
    // Ensure single decimal point
    if ((num.match(/\./g) || []).length <= 1) {
      // Return canonical format
      return `${parseFloat(num)}%`;
    }
  }
  
  return undefined;
}

// Validate and sanitize background image URLs
// Returns CANONICAL URL (for storage) - caller wraps in url() for rendering
// Accepts both full URLs (https://...) and relative paths (/objects/...)
function sanitizeBgImageUrl(url: string | undefined): string | undefined {
  if (!url || url === "") return undefined;
  
  // Handle already-wrapped url() format from stored data
  const urlMatch = url.match(/^url\(['"]?([^'"()]+)['"]?\)$/i);
  const trimmed = urlMatch ? urlMatch[1].trim() : url.trim();
  
  // Allow relative paths from object storage (e.g., /objects/animals/uuid)
  if (trimmed.startsWith('/objects/')) {
    return trimmed;
  }
  
  try {
    const parsed = new URL(trimmed);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }
    // Return canonical URL (fully resolved, no trailing junk)
    // Caller will wrap in url() with proper escaping
    return parsed.href;
  } catch {
    return undefined;
  }
}

// Custom validator for background image - accepts URLs or relative object storage paths
const backgroundImageValidator = z.string().refine(
  (val) => {
    if (!val || val === "") return true;
    // Allow relative paths from object storage
    if (val.startsWith('/objects/')) return true;
    // Allow full URLs
    try {
      const parsed = new URL(val);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: "Must be a valid URL or uploaded image path" }
).optional().or(z.literal("")).transform(sanitizeBgImageUrl);

// Form validation schema
const moduleFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required"),
  displayOrder: z.number().int().min(0).max(10).default(0),
  isActive: z.boolean().default(true),
  styling: z.object({
    backgroundColor: z.string().optional().transform(sanitizeColor),
    backgroundImage: backgroundImageValidator,
    imagePosition: z.enum(["background", "above", "below"]).optional(),
    textColor: z.string().optional().transform(sanitizeColor),
    fontFamily: z.string().optional().transform(sanitizeFontFamily),
    fontSize: z.string().optional().transform(sanitizeFontSize),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    showBorder: z.boolean().optional(),
  }).optional(),
});

type ModuleFormData = z.infer<typeof moduleFormSchema>;

export default function ContentModulesPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteModuleId, setDeleteModuleId] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<ContentModule | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("");

  // Fetch modules
  const { data, isLoading } = useQuery<{ modules: ContentModule[] }>({
    queryKey: ['/api/content-modules'],
  });

  const modules = data?.modules || [];

  // Create form
  const createForm = useForm<ModuleFormData>({
    resolver: zodResolver(moduleFormSchema),
    defaultValues: {
      title: "",
      content: "",
      displayOrder: modules.length,
      isActive: true,
      styling: {
        backgroundColor: "",
        backgroundImage: "",
        imagePosition: "background",
        textColor: "",
        fontFamily: "inherit",
        fontSize: "1rem",
        textAlign: "left",
        showBorder: false,
      },
    },
  });

  // Edit form
  const editForm = useForm<ModuleFormData>({
    resolver: zodResolver(moduleFormSchema),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ModuleFormData) => {
      return await apiRequest('POST', '/api/content-modules', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-modules'] });
      toast({ title: "Module created successfully" });
      setIsCreateDialogOpen(false);
      createForm.reset();
      setBackgroundImageUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create module",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ModuleFormData> }) => {
      return await apiRequest('PATCH', `/api/content-modules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-modules'] });
      toast({ title: "Module updated successfully" });
      setIsEditDialogOpen(false);
      setEditingModule(null);
      editForm.reset();
      setBackgroundImageUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update module",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/content-modules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-modules'] });
      toast({ title: "Module deleted successfully" });
      setDeleteModuleId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete module",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateSubmit = (data: ModuleFormData) => {
    createMutation.mutate(data);
  };

  const handleEditSubmit = (data: ModuleFormData) => {
    if (editingModule) {
      updateMutation.mutate({ id: editingModule.id, data });
    }
  };

  const handleEdit = (module: ContentModule) => {
    setEditingModule(module);
    editForm.reset({
      title: module.title,
      content: module.content,
      displayOrder: module.displayOrder,
      isActive: module.isActive,
      styling: module.styling || {},
    });
    setBackgroundImageUrl(module.styling?.backgroundImage || "");
    setIsEditDialogOpen(true);
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { isActive: !currentStatus } });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Home Page Modules</h1>
          <p className="text-muted-foreground mt-1">
            Customize content cards displayed on your public home page
          </p>
        </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-module">
                <Plus className="w-4 h-4 mr-2" />
                Create Module
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Content Module</DialogTitle>
                <DialogDescription>
                  Add a new customizable card to your home page
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Our History" {...field} data-testid="input-module-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell your story..."
                            className="min-h-[150px]"
                            {...field}
                            data-testid="textarea-module-content"
                          />
                        </FormControl>
                        <FormDescription>
                          The main text content for this card
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="displayOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Order</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-module-order"
                            />
                          </FormControl>
                          <FormDescription>Lower numbers appear first</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Show on public site
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-module-active"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Styling Options
                    </h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createForm.control}
                          name="styling.backgroundColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Background Color</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="#ffffff or rgb(255,255,255)"
                                  {...field}
                                  data-testid="input-module-bg-color"
                                />
                              </FormControl>
                              <FormDescription>Hex or CSS color</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={createForm.control}
                          name="styling.textColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Text Color</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="#000000 or rgb(0,0,0)"
                                  {...field}
                                  data-testid="input-module-text-color"
                                />
                              </FormControl>
                              <FormDescription>Hex or CSS color</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={createForm.control}
                        name="styling.backgroundImage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Background Image URL</FormLabel>
                            <FormControl>
                              <div className="space-y-2">
                                <Input
                                  placeholder="https://..."
                                  value={backgroundImageUrl}
                                  onChange={(e) => {
                                    setBackgroundImageUrl(e.target.value);
                                    field.onChange(e.target.value);
                                  }}
                                  data-testid="input-module-bg-image"
                                />
                                <ObjectUploader
                                  value={backgroundImageUrl ? [backgroundImageUrl] : []}
                                  onChange={(urls) => {
                                    const url = urls[0] || "";
                                    setBackgroundImageUrl(url);
                                    field.onChange(url);
                                  }}
                                  maxFiles={1}
                                  showPreview={false}
                                  buttonText="Upload Image"
                                  data-testid="uploader-module-bg"
                                />
                              </div>
                            </FormControl>
                            <FormDescription>Optional image for this module</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createForm.control}
                        name="styling.imagePosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Image Position</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value || "background"}>
                              <FormControl>
                                <SelectTrigger data-testid="select-module-image-position">
                                  <SelectValue placeholder="Select position" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="background">Background (behind content)</SelectItem>
                                <SelectItem value="above">Above title and content</SelectItem>
                                <SelectItem value="below">Below title and content</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>Where to display the uploaded image</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={createForm.control}
                          name="styling.fontFamily"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Font Family</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-module-font">
                                    <SelectValue placeholder="Select font" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="inherit">Default</SelectItem>
                                  <SelectItem value="Arial">Arial</SelectItem>
                                  <SelectItem value="Georgia">Georgia</SelectItem>
                                  <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                                  <SelectItem value="Courier New">Courier</SelectItem>
                                  <SelectItem value="Verdana">Verdana</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={createForm.control}
                          name="styling.fontSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Font Size</FormLabel>
                              <FormControl>
                                <Input placeholder="1rem or 16px" {...field} data-testid="input-module-font-size" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={createForm.control}
                          name="styling.textAlign"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Text Align</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-module-text-align">
                                    <SelectValue placeholder="Alignment" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={createForm.control}
                          name="styling.showBorder"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>Show Border</FormLabel>
                                <FormDescription className="text-xs">
                                  Display a border around the module
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-module-border"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel-create"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                      {createMutation.isPending ? "Creating..." : "Create Module"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-1/3" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : modules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Type className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No content modules yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create customizable cards to showcase your organization's story
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Module
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {modules.map((module) => (
              <Card key={module.id} data-testid={`card-module-${module.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{module.title}</CardTitle>
                        <Badge variant={module.isActive ? "default" : "secondary"}>
                          {module.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">Order: {module.displayOrder}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(module.id, module.isActive)}
                        data-testid={`button-toggle-${module.id}`}
                      >
                        {module.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(module)}
                        data-testid={`button-edit-${module.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteModuleId(module.id)}
                        data-testid={`button-delete-${module.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {module.content.length > 200
                          ? `${module.content.substring(0, 200)}...`
                          : module.content}
                      </p>
                    </div>

                    {module.styling && Object.keys(module.styling).filter(key => module.styling![key as keyof typeof module.styling]).length > 0 && (
                      <div className="border-t pt-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Styling:</p>
                        <div className="flex flex-wrap gap-2">
                          {module.styling.backgroundColor && (
                            <Badge variant="outline" className="text-xs">
                              BG: {module.styling.backgroundColor}
                            </Badge>
                          )}
                          {module.styling.textColor && (
                            <Badge variant="outline" className="text-xs">
                              Text: {module.styling.textColor}
                            </Badge>
                          )}
                          {module.styling.backgroundImage && (
                            <Badge variant="outline" className="text-xs">
                              <ImageIcon className="w-3 h-3 mr-1" />
                              Image
                            </Badge>
                          )}
                          {module.styling.fontFamily && module.styling.fontFamily !== 'inherit' && (
                            <Badge variant="outline" className="text-xs">
                              {module.styling.fontFamily.split(',')[0].replace(/['"]/g, '')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Content Module</DialogTitle>
              <DialogDescription>
                Update the content and styling for this module
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Our History" {...field} data-testid="input-edit-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell your story..."
                          className="min-h-[150px]"
                          {...field}
                          data-testid="textarea-edit-content"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="displayOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-edit-order"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Active</FormLabel>
                          <FormDescription>
                            Show on public site
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-edit-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Styling Options
                  </h3>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="styling.backgroundColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Background Color</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="#ffffff or rgb(255,255,255)"
                                {...field}
                                data-testid="input-edit-bg-color"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={editForm.control}
                        name="styling.textColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Text Color</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="#000000 or rgb(0,0,0)"
                                {...field}
                                data-testid="input-edit-text-color"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={editForm.control}
                      name="styling.backgroundImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Background Image URL</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                placeholder="https://..."
                                value={backgroundImageUrl}
                                onChange={(e) => {
                                  setBackgroundImageUrl(e.target.value);
                                  field.onChange(e.target.value);
                                }}
                                data-testid="input-edit-bg-image"
                              />
                              <ObjectUploader
                                value={backgroundImageUrl ? [backgroundImageUrl] : []}
                                onChange={(urls) => {
                                  const url = urls[0] || "";
                                  setBackgroundImageUrl(url);
                                  field.onChange(url);
                                }}
                                maxFiles={1}
                                showPreview={false}
                                buttonText="Upload Image"
                                data-testid="uploader-edit-module-bg"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="styling.imagePosition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image Position</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "background"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-image-position">
                                <SelectValue placeholder="Select position" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="background">Background (behind content)</SelectItem>
                              <SelectItem value="above">Above title and content</SelectItem>
                              <SelectItem value="below">Below title and content</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>Where to display the uploaded image</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={editForm.control}
                        name="styling.fontFamily"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Font Family</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-font">
                                  <SelectValue placeholder="Select font" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="inherit">Default</SelectItem>
                                <SelectItem value="Arial">Arial</SelectItem>
                                <SelectItem value="Georgia">Georgia</SelectItem>
                                <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                                <SelectItem value="Courier New">Courier</SelectItem>
                                <SelectItem value="Verdana">Verdana</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={editForm.control}
                        name="styling.fontSize"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Font Size</FormLabel>
                            <FormControl>
                              <Input placeholder="1rem or 16px" {...field} data-testid="input-edit-font-size" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={editForm.control}
                        name="styling.textAlign"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Text Align</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-text-align">
                                  <SelectValue placeholder="Alignment" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={editForm.control}
                      name="styling.showBorder"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Show Border</FormLabel>
                            <FormDescription className="text-xs">
                              Display a border around the module
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-edit-module-border"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingModule(null);
                      editForm.reset();
                      setBackgroundImageUrl("");
                    }}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                    {updateMutation.isPending ? "Updating..." : "Update Module"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteModuleId} onOpenChange={() => setDeleteModuleId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Content Module</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this module? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteModuleId && deleteMutation.mutate(deleteModuleId)}
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
