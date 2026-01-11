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
import { FileText, Plus, Edit, Trash2, Eye, Star, Copy, ChevronDown } from "lucide-react";

interface ContractTemplate {
  id: number;
  tenantId: string;
  name: string;
  version: string;
  htmlTemplate: string;
  isDefault: boolean;
  createdAt: string;
  updatedBy: string | null;
}

interface MergeFields {
  [key: string]: string;
}

// Zod schema for form validation
const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  htmlTemplate: z.string().min(1, "HTML template is required"),
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

  // Form for creating new templates
  const createForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      htmlTemplate: "",
      isDefault: false,
    },
  });

  // Form for editing templates
  const editForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      htmlTemplate: "",
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
    createForm.reset();
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    editForm.reset({
      name: template.name,
      htmlTemplate: template.htmlTemplate,
      isDefault: template.isDefault,
    });
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

  const onSubmitCreate = (data: TemplateFormData) => {
    createMutation.mutate(data);
  };

  const onSubmitEdit = (data: TemplateFormData) => {
    if (selectedTemplate) {
      updateMutation.mutate({ id: selectedTemplate.id, data });
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
                Create a new adoption contract template with merge fields
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              {/* Merge Fields Panel */}
              <Collapsible open={isFieldsPanelOpen} onOpenChange={setIsFieldsPanelOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    data-testid="button-toggle-merge-fields"
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
                              data-testid={`merge-field-${field}`}
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
                                data-testid={`button-copy-${field.replace(/[{}]/g, '')}`}
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
                <Label htmlFor="htmlTemplate">HTML Template</Label>
                <Textarea
                  id="htmlTemplate"
                  {...createForm.register("htmlTemplate")}
                  placeholder="Enter your HTML template with merge fields..."
                  className="font-mono text-sm min-h-96"
                  data-testid="textarea-html-template"
                />
                {createForm.formState.errors.htmlTemplate && (
                  <p className="text-sm text-destructive mt-1">
                    {createForm.formState.errors.htmlTemplate.message}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Use merge fields like {Object.keys(mergeFields)[0]} in your HTML
                </p>
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
