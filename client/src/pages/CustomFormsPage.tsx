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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  FileText, Plus, Edit, Trash2, Eye, Copy, ChevronDown, 
  Send, FileSignature, PawPrint, Users, Link as LinkIcon,
  Clock, CheckCircle, XCircle, Mail
} from "lucide-react";
import { format } from "date-fns";

interface CustomForm {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  formType: 'animal_specific' | 'standalone';
  htmlTemplate: string;
  requiresSignature: boolean;
  isActive: boolean;
  isPublic: boolean;
  publicSlug?: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomFormSubmission {
  id: string;
  tenantId: string;
  formId: string;
  animalId?: string;
  signerName: string;
  signerEmail: string;
  signerPhone?: string;
  signedAt?: string;
  pdfUrl?: string;
  emailedAt?: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  createdAt: string;
}

interface MergeFields {
  [key: string]: string;
}

interface Animal {
  id: string;
  name: string;
  species: string;
  breed?: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Form name is required"),
  description: z.string().optional(),
  formType: z.enum(['animal_specific', 'standalone']),
  htmlTemplate: z.string().min(1, "Form content is required"),
  requiresSignature: z.boolean().default(true),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

const sendFormSchema = z.object({
  signerName: z.string().min(1, "Name is required"),
  signerEmail: z.string().email("Valid email is required"),
  signerPhone: z.string().optional(),
  animalId: z.string().optional(),
});

type SendFormData = z.infer<typeof sendFormSchema>;

export default function CustomFormsPage() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isSubmissionsDialogOpen, setIsSubmissionsDialogOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<CustomForm | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isFieldsPanelOpen, setIsFieldsPanelOpen] = useState(false);
  const [formLink, setFormLink] = useState<string>("");

  const createForm = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      formType: "standalone",
      htmlTemplate: "",
      requiresSignature: true,
      isActive: true,
      isPublic: false,
    },
  });

  const editForm = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      formType: "standalone",
      htmlTemplate: "",
      requiresSignature: true,
      isActive: true,
      isPublic: false,
    },
  });

  const sendForm = useForm<SendFormData>({
    resolver: zodResolver(sendFormSchema),
    defaultValues: {
      signerName: "",
      signerEmail: "",
      signerPhone: "",
      animalId: "",
    },
  });

  const { data, isLoading } = useQuery<{ 
    forms: CustomForm[]; 
    mergeFields: { standalone: MergeFields; animal_specific: MergeFields } 
  }>({
    queryKey: ['/api/custom-forms'],
  });

  const { data: animalsData } = useQuery<{ animals: Animal[] }>({
    queryKey: ['/api/animals'],
  });

  const { data: submissionsData, isLoading: submissionsLoading } = useQuery<{ submissions: CustomFormSubmission[] }>({
    queryKey: ['/api/custom-forms', selectedForm?.id, 'submissions'],
    enabled: !!selectedForm && isSubmissionsDialogOpen,
  });

  const forms = data?.forms || [];
  const mergeFields = data?.mergeFields || { standalone: {}, animal_specific: {} };
  const animals = animalsData?.animals || [];

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return apiRequest('POST', '/api/custom-forms', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-forms'] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Form created",
        description: "Custom form has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create form",
        description: error.message || "Please check your input and try again",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      return apiRequest('PUT', `/api/custom-forms/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-forms'] });
      setIsEditDialogOpen(false);
      setSelectedForm(null);
      editForm.reset();
      toast({
        title: "Form updated",
        description: "Custom form has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update form",
        description: error.message || "Please check your input and try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/custom-forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-forms'] });
      setIsDeleteDialogOpen(false);
      setSelectedForm(null);
      toast({
        title: "Form deleted",
        description: "Custom form has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete form",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('GET', `/api/custom-forms/${id}/preview`);
      return response.json();
    },
    onSuccess: (data: { html: string }) => {
      setPreviewHtml(data.html);
      setIsPreviewDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Preview failed",
        description: error.message || "Could not generate preview",
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ formId, data }: { formId: string; data: SendFormData }) => {
      const response = await apiRequest('POST', `/api/custom-forms/${formId}/send`, data);
      return response.json();
    },
    onSuccess: (data: { formUrl: string; emailSent?: boolean }) => {
      setFormLink(data.formUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/custom-forms', selectedForm?.id, 'submissions'] });
      sendForm.reset();
      toast({
        title: data.emailSent ? "Form emailed" : "Form link created",
        description: data.emailSent 
          ? "The form has been emailed to the recipient."
          : "Copy the link below to share with the recipient.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send form",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (form: CustomForm) => {
    setSelectedForm(form);
    editForm.reset({
      name: form.name,
      description: form.description || "",
      formType: form.formType,
      htmlTemplate: form.htmlTemplate,
      requiresSignature: form.requiresSignature,
      isActive: form.isActive,
      isPublic: form.isPublic,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (form: CustomForm) => {
    setSelectedForm(form);
    setIsDeleteDialogOpen(true);
  };

  const handlePreview = (form: CustomForm) => {
    setSelectedForm(form);
    previewMutation.mutate(form.id);
  };

  const handleSend = (form: CustomForm) => {
    setSelectedForm(form);
    setFormLink("");
    sendForm.reset();
    setIsSendDialogOpen(true);
  };

  const handleViewSubmissions = (form: CustomForm) => {
    setSelectedForm(form);
    setIsSubmissionsDialogOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
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

  const onSubmitCreate = (data: FormData) => {
    createMutation.mutate(data);
  };

  const onSubmitEdit = (data: FormData) => {
    if (selectedForm) {
      updateMutation.mutate({ id: selectedForm.id, data });
    }
  };

  const onSubmitSend = (data: SendFormData) => {
    if (selectedForm) {
      sendMutation.mutate({ formId: selectedForm.id, data });
    }
  };

  const currentFormType = isCreateDialogOpen 
    ? createForm.watch('formType') 
    : editForm.watch('formType');
  
  const currentMergeFields = currentFormType === 'animal_specific' 
    ? mergeFields.animal_specific 
    : mergeFields.standalone;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'expired':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const FormEditor = ({ form, onSubmit, isPending }: { 
    form: ReturnType<typeof useForm<FormData>>; 
    onSubmit: (data: FormData) => void;
    isPending: boolean;
  }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Form Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Spay/Neuter Consent Form" 
                  {...field} 
                  data-testid="input-form-name"
                />
              </FormControl>
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
                <Input 
                  placeholder="Brief description of this form" 
                  {...field} 
                  data-testid="input-form-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="formType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Form Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-form-type">
                    <SelectValue placeholder="Select form type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="standalone">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Standalone (not linked to animal)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="animal_specific">
                    <div className="flex items-center gap-2">
                      <PawPrint className="h-4 w-4" />
                      <span>Animal-Specific (linked to an animal)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {field.value === 'animal_specific' 
                  ? "This form will be linked to a specific animal and can use animal merge fields."
                  : "This form is standalone and not linked to any animal."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-6">
          <FormField
            control={form.control}
            name="requiresSignature"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-requires-signature"
                  />
                </FormControl>
                <FormLabel className="!mt-0">Requires Signature</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-is-active"
                  />
                </FormControl>
                <FormLabel className="!mt-0">Active</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <Collapsible open={isFieldsPanelOpen} onOpenChange={setIsFieldsPanelOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="w-full">
              <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${isFieldsPanelOpen ? 'rotate-180' : ''}`} />
              Available Merge Fields
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border p-3 bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">
                Click on a field to insert it at your cursor position:
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(currentMergeFields).map(([field, description]) => (
                  <Button
                    key={field}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => insertPlaceholder(field)}
                    title={description}
                    data-testid={`button-insert-${field.replace(/[{}]/g, '')}`}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {field}
                  </Button>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <FormField
          control={form.control}
          name="htmlTemplate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Form Content (HTML)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Paste your HTML form content here. Use merge fields like {{signer_name}} for dynamic content."
                  className="min-h-[300px] font-mono text-sm"
                  {...field}
                  data-testid="textarea-html-template"
                />
              </FormControl>
              <FormDescription>
                Use HTML to design your form. Include merge fields that will be replaced with actual data.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" disabled={isPending} data-testid="button-submit-form">
            {isPending ? "Saving..." : "Save Form"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="h-6 w-6" />
              Custom Forms
            </h1>
            <p className="text-muted-foreground">
              Create and manage forms with e-signature capability
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-form">
            <Plus className="h-4 w-4 mr-2" />
            New Form
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : forms.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Custom Forms Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first custom form to collect signatures and information.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-form">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Form
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <Card key={form.id} className={!form.isActive ? "opacity-60" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{form.name}</CardTitle>
                      {form.description && (
                        <CardDescription>{form.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge variant={form.formType === 'animal_specific' ? 'default' : 'secondary'}>
                        {form.formType === 'animal_specific' ? (
                          <><PawPrint className="h-3 w-3 mr-1" /> Animal</>
                        ) : (
                          <><Users className="h-3 w-3 mr-1" /> Standalone</>
                        )}
                      </Badge>
                      {!form.isActive && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {form.requiresSignature && (
                      <span className="flex items-center gap-1">
                        <FileSignature className="h-3 w-3" /> Signature required
                      </span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(form)}
                    data-testid={`button-preview-${form.id}`}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(form)}
                    disabled={!form.isActive}
                    data-testid={`button-send-${form.id}`}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewSubmissions(form)}
                    data-testid={`button-submissions-${form.id}`}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Submissions
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(form)}
                    data-testid={`button-edit-${form.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(form)}
                    data-testid={`button-delete-${form.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Form</DialogTitle>
              <DialogDescription>
                Create a new form with optional e-signature capability
              </DialogDescription>
            </DialogHeader>
            <FormEditor 
              form={createForm} 
              onSubmit={onSubmitCreate} 
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Form</DialogTitle>
              <DialogDescription>
                Update the form details and content
              </DialogDescription>
            </DialogHeader>
            <FormEditor 
              form={editForm} 
              onSubmit={onSubmitEdit} 
              isPending={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Form Preview</DialogTitle>
              <DialogDescription>
                This is how the form will appear with sample data
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[70vh] border rounded-md">
              <div 
                className="p-4"
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(previewHtml) 
                }} 
              />
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Form</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedForm?.name}"? This will also delete all submissions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedForm && deleteMutation.mutate(selectedForm.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send Form</DialogTitle>
              <DialogDescription>
                Enter the recipient's information to send this form
              </DialogDescription>
            </DialogHeader>
            
            {formLink ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-md">
                  <Label className="text-sm font-medium">Form Link</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input 
                      value={formLink} 
                      readOnly 
                      className="font-mono text-sm"
                      data-testid="input-form-link"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(formLink)}
                      data-testid="button-copy-link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Share this link with the recipient. It expires in 72 hours.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setFormLink("")}
                  data-testid="button-send-another"
                >
                  Send to Another Person
                </Button>
              </div>
            ) : (
              <Form {...sendForm}>
                <form onSubmit={sendForm.handleSubmit(onSubmitSend)} className="space-y-4">
                  <FormField
                    control={sendForm.control}
                    name="signerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipient Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="John Doe" 
                            {...field} 
                            data-testid="input-signer-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={sendForm.control}
                    name="signerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipient Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="john@example.com" 
                            {...field} 
                            data-testid="input-signer-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={sendForm.control}
                    name="signerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="(555) 123-4567" 
                            {...field} 
                            data-testid="input-signer-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedForm?.formType === 'animal_specific' && (
                    <FormField
                      control={sendForm.control}
                      name="animalId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Animal</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-animal">
                                <SelectValue placeholder="Select an animal" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {animals.map((animal) => (
                                <SelectItem key={animal.id} value={animal.id}>
                                  {animal.name} ({animal.species})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <DialogFooter>
                    <Button type="submit" disabled={sendMutation.isPending} data-testid="button-send-form">
                      <Send className="h-4 w-4 mr-2" />
                      {sendMutation.isPending ? "Sending..." : "Send Form"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isSubmissionsDialogOpen} onOpenChange={setIsSubmissionsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Form Submissions</DialogTitle>
              <DialogDescription>
                View all submissions for "{selectedForm?.name}"
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="h-[400px]">
              {submissionsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !submissionsData?.submissions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2" />
                  No submissions yet
                </div>
              ) : (
                <div className="space-y-2">
                  {submissionsData.submissions.map((submission) => (
                    <Card key={submission.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{submission.signerName}</p>
                          <p className="text-sm text-muted-foreground">{submission.signerEmail}</p>
                          <p className="text-xs text-muted-foreground">
                            Created: {format(new Date(submission.createdAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(submission.status)}
                          {submission.pdfUrl && (
                            <Button variant="outline" size="sm" data-testid={`button-download-${submission.id}`}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
