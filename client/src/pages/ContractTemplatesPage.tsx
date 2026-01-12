import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DOMPurify from 'dompurify';
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Edit, Trash2, Eye, Star, Copy, ChevronDown, GripVertical, Type, LayoutTemplate, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ContractTemplateSection {
  id: string;
  type: 'header' | 'paragraph' | 'terms' | 'signature' | 'custom';
  title: string;
  content: string;
  required: boolean;
  order: number;
}

interface ContractTemplate {
  id: number;
  tenantId: string;
  name: string;
  description?: string;
  version: string;
  editorMode: 'richText' | 'guided';
  htmlTemplate: string;
  guidedSections?: ContractTemplateSection[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

interface MergeFields {
  [key: string]: string;
}

// Default sections for guided builder
const DEFAULT_SECTIONS: ContractTemplateSection[] = [
  {
    id: 'header',
    type: 'header',
    title: 'Contract Header',
    content: '<h1>{{organization_name}} - Adoption Agreement</h1>\n<p>This Adoption Agreement is entered into on {{contract_date}}</p>',
    required: true,
    order: 0,
  },
  {
    id: 'adopter-info',
    type: 'paragraph',
    title: 'Adopter Information',
    content: '<h2>Adopter Information</h2>\n<p><strong>Name:</strong> {{adopter_name}}</p>\n<p><strong>Email:</strong> {{adopter_email}}</p>\n<p><strong>Phone:</strong> {{adopter_phone}}</p>\n<p><strong>Address:</strong> {{adopter_address}}</p>',
    required: true,
    order: 1,
  },
  {
    id: 'animal-info',
    type: 'paragraph',
    title: 'Animal Information',
    content: '<h2>Animal Information</h2>\n<p><strong>Name:</strong> {{animal_name}}</p>\n<p><strong>Species:</strong> {{animal_species}}</p>\n<p><strong>Breed:</strong> {{animal_breed}}</p>\n<p><strong>Age:</strong> {{animal_age}}</p>\n<p><strong>Sex:</strong> {{animal_sex}}</p>',
    required: true,
    order: 2,
  },
  {
    id: 'terms',
    type: 'terms',
    title: 'Terms and Conditions',
    content: '<h2>Terms and Conditions</h2>\n<ol>\n<li><strong>Veterinary Care:</strong> The adopter agrees to provide necessary veterinary care.</li>\n<li><strong>Living Conditions:</strong> The animal will be kept as an indoor pet with adequate food, water, and shelter.</li>\n<li><strong>Spay/Neuter:</strong> If not already done, the adopter agrees to spay/neuter within 30 days.</li>\n<li><strong>No Transfer:</strong> The adopter will not sell or give away the animal without written consent.</li>\n<li><strong>Return Policy:</strong> If unable to care for the animal, the adopter will contact {{organization_name}}.</li>\n</ol>',
    required: true,
    order: 3,
  },
  {
    id: 'signature',
    type: 'signature',
    title: 'Signature Section',
    content: '<h2>Adopter Signature</h2>\n<p>By signing below, I acknowledge that I have read and agree to abide by all terms.</p>\n<div class="signature-box">\n<img src="{{signature_image_url}}" alt="Signature" />\n<p><strong>Name:</strong> {{adopter_name}}</p>\n<p><strong>Date:</strong> {{contract_date}}</p>\n</div>',
    required: true,
    order: 4,
  },
];

// Generate HTML from guided sections
function generateHtmlFromSections(sections: ContractTemplateSection[], orgName?: string): string {
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const bodyContent = sortedSections.map(s => s.content).join('\n\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Adoption Contract</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a1a1a; font-size: 24px; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #2d2d2d; font-size: 18px; margin-top: 30px; }
    p { margin-bottom: 10px; }
    ol, ul { margin-left: 20px; }
    li { margin-bottom: 8px; }
    .signature-box { margin: 20px 0; padding: 20px; border: 1px solid #ddd; background: #f9f9f9; }
    .signature-box img { max-width: 300px; border-bottom: 1px solid #333; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

// Zod schema for form validation
const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  editorMode: z.enum(['richText', 'guided']).default('richText'),
  htmlTemplate: z.string().min(1, "Template content is required"),
  guidedSections: z.array(z.object({
    id: z.string(),
    type: z.enum(['header', 'paragraph', 'terms', 'signature', 'custom']),
    title: z.string(),
    content: z.string(),
    required: z.boolean(),
    order: z.number(),
  })).optional(),
  isDefault: z.boolean().default(false),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function ContractTemplatesPage() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isFieldsPanelOpen, setIsFieldsPanelOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'richText' | 'guided'>('richText');
  const [guidedSections, setGuidedSections] = useState<ContractTemplateSection[]>(DEFAULT_SECTIONS);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  // Form for creating new templates
  const createForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      editorMode: "richText",
      htmlTemplate: "",
      guidedSections: DEFAULT_SECTIONS,
      isDefault: false,
    },
  });

  // Form for editing templates
  const editForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      editorMode: "richText",
      htmlTemplate: "",
      guidedSections: DEFAULT_SECTIONS,
      isDefault: false,
    },
  });

  // Fetch templates
  const { data, isLoading } = useQuery<{ templates: ContractTemplate[]; mergeFields: MergeFields }>({
    queryKey: ['/api/contract-templates'],
  });

  const templates = data?.templates || [];
  const mergeFields = data?.mergeFields || {};

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (templateData: TemplateFormData) => {
      return apiRequest('/api/contract-templates', {
        method: 'POST',
        body: JSON.stringify(templateData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Template created",
        description: "Contract template has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Please check your input and try again",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TemplateFormData }) => {
      return apiRequest(`/api/contract-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      setIsEditDialogOpen(false);
      setSelectedTemplate(null);
      editForm.reset();
      toast({
        title: "Template updated",
        description: "Contract template has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message || "Please check your input and try again",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/contract-templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      setIsDeleteDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template deleted",
        description: "Contract template has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete template",
        description: error.message || "Cannot delete the default template",
        variant: "destructive",
      });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/contract-templates/${id}/set-default`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      toast({
        title: "Default template updated",
        description: "This template is now the default for new adoptions",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set default",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/contract-templates/${id}/preview`);
      if (!response.ok) throw new Error('Failed to generate preview');
      return response.json();
    },
    onSuccess: (data) => {
      // Sanitize HTML before setting state for extra security
      const sanitizedHtml = DOMPurify.sanitize(data.html, {
        ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
        ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
        ALLOW_DATA_ATTR: false,
      });
      setPreviewHtml(sanitizedHtml);
      setIsPreviewDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate preview",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    createForm.reset({
      name: "",
      description: "",
      editorMode: "richText",
      htmlTemplate: "",
      guidedSections: DEFAULT_SECTIONS,
      isDefault: false,
    });
    setEditorMode('richText');
    setGuidedSections(DEFAULT_SECTIONS);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    const templateMode = template.editorMode || 'richText';
    const sections = template.guidedSections || DEFAULT_SECTIONS;
    editForm.reset({
      name: template.name,
      description: template.description || "",
      editorMode: templateMode,
      htmlTemplate: template.htmlTemplate,
      guidedSections: sections,
      isDefault: template.isDefault,
    });
    setEditorMode(templateMode);
    setGuidedSections(sections);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setIsDeleteDialogOpen(true);
  };

  const handlePreview = (template: ContractTemplate) => {
    previewMutation.mutate(template.id);
  };

  const handleSetDefault = (template: ContractTemplate) => {
    setDefaultMutation.mutate(template.id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Merge field copied to clipboard",
    });
  };

  const insertPlaceholder = (field: string) => {
    const textarea = document.querySelector('[data-testid="textarea-html-template"]') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = createForm.getValues('htmlTemplate') || editForm.getValues('htmlTemplate') || '';
      const newValue = currentValue.substring(0, start) + field + currentValue.substring(end);
      if (isCreateDialogOpen) {
        createForm.setValue('htmlTemplate', newValue);
      } else {
        editForm.setValue('htmlTemplate', newValue);
      }
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + field.length, start + field.length);
      }, 0);
    }
    toast({
      title: "Inserted",
      description: `${field} added to template`,
    });
  };

  const updateSection = (sectionId: string, updates: Partial<ContractTemplateSection>) => {
    setGuidedSections(prev => prev.map(s => s.id === sectionId ? { ...s, ...updates } : s));
  };

  const addSection = () => {
    const newSection: ContractTemplateSection = {
      id: `custom-${Date.now()}`,
      type: 'custom',
      title: 'New Section',
      content: '<h2>New Section</h2>\n<p>Add your content here...</p>',
      required: false,
      order: guidedSections.length,
    };
    setGuidedSections(prev => [...prev, newSection]);
    setEditingSectionId(newSection.id);
  };

  const removeSection = (sectionId: string) => {
    setGuidedSections(prev => prev.filter(s => s.id !== sectionId));
  };

  const onSubmitCreate = (data: TemplateFormData) => {
    const finalData = { ...data, editorMode };
    if (editorMode === 'guided') {
      finalData.htmlTemplate = generateHtmlFromSections(guidedSections);
      finalData.guidedSections = guidedSections;
    }
    createMutation.mutate(finalData);
  };

  const onSubmitEdit = (data: TemplateFormData) => {
    if (selectedTemplate) {
      const finalData = { ...data, editorMode };
      if (editorMode === 'guided') {
        finalData.htmlTemplate = generateHtmlFromSections(guidedSections);
        finalData.guidedSections = guidedSections;
      }
      updateMutation.mutate({ id: selectedTemplate.id, data: finalData });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      deleteMutation.mutate(selectedTemplate.id);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout
        title="Contract Templates"
        description="Manage adoption contract templates"
        breadcrumbs={[
          { label: "Administration" },
          { label: "Contract Templates" }
        ]}
      >
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Contract Templates"
      description="Manage adoption contract templates with customizable merge fields"
      breadcrumbs={[
        { label: "Administration" },
        { label: "Contract Templates" }
      ]}
    >
      <div className="p-6 space-y-6 overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Contract Templates</h1>
            <p className="text-muted-foreground text-sm">
              Manage adoption contract templates with customizable merge fields
            </p>
          </div>
          <Button onClick={handleCreate} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Templates Grid */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No templates yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first contract template to get started
            </p>
            <Button onClick={handleCreate} data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`card-template-${template.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {template.name}
                    </CardTitle>
                    <CardDescription>Version {template.version}</CardDescription>
                  </div>
                  {template.isDefault && (
                    <Badge variant="default" className="gap-1" data-testid={`badge-default-${template.id}`}>
                      <Star className="h-3 w-3" />
                      Default
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  Last updated: {new Date(template.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
              <CardFooter className="gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePreview(template)}
                  data-testid={`button-preview-${template.id}`}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(template)}
                  data-testid={`button-edit-${template.id}`}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                {!template.isDefault && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetDefault(template)}
                      data-testid={`button-set-default-${template.id}`}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Set Default
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(template)}
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={createForm.handleSubmit(onSubmitCreate)}>
            <DialogHeader>
              <DialogTitle>Create Contract Template</DialogTitle>
              <DialogDescription>
                Choose how you want to create your adoption contract template
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    {...createForm.register("name")}
                    placeholder="e.g., Standard Adoption Contract"
                    data-testid="input-template-name"
                  />
                  {createForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    {...createForm.register("description")}
                    placeholder="Brief description of this template"
                    data-testid="input-template-description"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  {...createForm.register("isDefault")}
                  className="rounded"
                  data-testid="checkbox-set-default"
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  Set as default template
                </Label>
              </div>

              {/* Mode Selection */}
              <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as 'richText' | 'guided')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="richText" className="gap-2" data-testid="tab-rich-text">
                    <Type className="h-4 w-4" />
                    Paste Contract Text
                  </TabsTrigger>
                  <TabsTrigger value="guided" className="gap-2" data-testid="tab-guided">
                    <LayoutTemplate className="h-4 w-4" />
                    Guided Builder
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="richText" className="space-y-4 mt-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Paste your contract text or HTML below. Use placeholder variables like <code className="bg-muted px-1 rounded">{'{{adopter_name}}'}</code> that will be automatically filled in.
                    </AlertDescription>
                  </Alert>

                  {/* Merge Fields Panel */}
                  <Collapsible open={isFieldsPanelOpen} onOpenChange={setIsFieldsPanelOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between"
                        data-testid="button-toggle-merge-fields"
                      >
                        <span>Available Placeholder Variables (click to insert)</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isFieldsPanelOpen ? "rotate-180" : ""
                          }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(mergeFields).map(([field, description]) => (
                              <Badge
                                key={field}
                                variant="secondary"
                                className="cursor-pointer"
                                onClick={() => insertPlaceholder(field)}
                                title={description}
                                data-testid={`merge-field-${field.replace(/[{}]/g, '')}`}
                              >
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>

                  <div>
                    <Label htmlFor="htmlTemplate">Contract Content (HTML)</Label>
                    <Textarea
                      id="htmlTemplate"
                      {...createForm.register("htmlTemplate")}
                      placeholder="Paste your contract text or HTML here. Use placeholders like {{adopter_name}}, {{animal_name}}, etc."
                      className="font-mono text-sm min-h-80"
                      data-testid="textarea-html-template"
                    />
                    {createForm.formState.errors.htmlTemplate && (
                      <p className="text-sm text-destructive mt-1">
                        {createForm.formState.errors.htmlTemplate.message}
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="guided" className="space-y-4 mt-4">
                  <Alert>
                    <LayoutTemplate className="h-4 w-4" />
                    <AlertDescription>
                      Build your contract section by section. Each section can contain placeholder variables that will be filled in automatically.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    {guidedSections.sort((a, b) => a.order - b.order).map((section) => (
                      <Card key={section.id} className="relative" data-testid={`section-${section.id}`}>
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                              {editingSectionId === section.id ? (
                                <Input
                                  value={section.title}
                                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                                  className="h-8 w-48"
                                  data-testid={`input-section-title-${section.id}`}
                                />
                              ) : (
                                <span className="font-medium">{section.title}</span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {section.type}
                              </Badge>
                              {section.required && (
                                <Badge variant="secondary" className="text-xs">Required</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditingSectionId(editingSectionId === section.id ? null : section.id)}
                                data-testid={`button-edit-section-${section.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!section.required && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeSection(section.id)}
                                  data-testid={`button-remove-section-${section.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        {editingSectionId === section.id && (
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(mergeFields).slice(0, 8).map(([field]) => (
                                  <Badge
                                    key={field}
                                    variant="outline"
                                    className="cursor-pointer text-xs"
                                    onClick={() => {
                                      updateSection(section.id, { content: section.content + ' ' + field });
                                    }}
                                  >
                                    + {field}
                                  </Badge>
                                ))}
                              </div>
                              <Textarea
                                value={section.content}
                                onChange={(e) => updateSection(section.id, { content: e.target.value })}
                                className="font-mono text-sm min-h-32"
                                placeholder="HTML content for this section..."
                                data-testid={`textarea-section-content-${section.id}`}
                              />
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSection}
                    className="w-full"
                    data-testid="button-add-section"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Section
                  </Button>
                </TabsContent>
              </Tabs>
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
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-save-template"
              >
                {createMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={editForm.handleSubmit(onSubmitEdit)}>
            <DialogHeader>
              <DialogTitle>Edit Contract Template</DialogTitle>
              <DialogDescription>
                Update the contract template. Version will auto-increment on save.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-name">Template Name</Label>
                <Input
                  id="edit-name"
                  {...editForm.register("name")}
                  placeholder="e.g., Standard Adoption Contract"
                  data-testid="input-edit-template-name"
                />
                {editForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">
                    {editForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* Merge Fields Panel */}
              <Collapsible open={isFieldsPanelOpen} onOpenChange={setIsFieldsPanelOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    data-testid="button-toggle-merge-fields-edit"
                  >
                    <span>Available Merge Fields</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        isFieldsPanelOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <Card>
                    <CardHeader>
                      <CardDescription>
                        Copy and paste these fields into your HTML template
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {Object.entries(mergeFields).map(([field, description]) => (
                            <div
                              key={field}
                              className="flex items-center justify-between gap-2 p-2 hover-elevate rounded-md"
                              data-testid={`merge-field-edit-${field}`}
                            >
                              <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                                {field}
                              </code>
                              <span className="text-sm text-muted-foreground flex-1">
                                {description}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(field)}
                                data-testid={`button-copy-edit-${field.replace(/[{}]/g, '')}`}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <div>
                <Label htmlFor="edit-htmlTemplate">HTML Template</Label>
                <Textarea
                  id="edit-htmlTemplate"
                  {...editForm.register("htmlTemplate")}
                  placeholder="Enter your HTML template with merge fields..."
                  className="font-mono text-sm min-h-96"
                  data-testid="textarea-edit-html-template"
                />
                {editForm.formState.errors.htmlTemplate && (
                  <p className="text-sm text-destructive mt-1">
                    {editForm.formState.errors.htmlTemplate.message}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog - SECURITY: Uses iframe sandbox to prevent XSS */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview with sample data (sandboxed for security)
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-md overflow-hidden">
            <iframe
              sandbox="allow-same-origin"
              srcDoc={previewHtml}
              className="w-full h-[60vh] border-0"
              title="Template Preview"
              data-testid="iframe-template-preview"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewDialogOpen(false)} data-testid="button-close-preview">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
