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
import { FileText, Plus, Edit, Trash2, Eye, Star, Copy, ChevronDown, GripVertical, Type, LayoutTemplate, AlertCircle, Heart, PawPrint, Sparkles, Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SmartTemplateEditor, type DocumentType } from "@/components/SmartTemplateEditor";
import type { EditableVariable } from "@shared/schema";
import { ContractTemplateWizard } from "@/components/ContractTemplateWizard";

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
  editorMode: 'richText' | 'guided' | 'smart';
  htmlTemplate: string;
  guidedSections?: ContractTemplateSection[];
  editableVariables?: EditableVariable[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

interface MergeFields {
  [key: string]: string;
}

type ContractType = 'adoption' | 'foster' | 'placement';

// Default adoption sections for guided builder
const DEFAULT_ADOPTION_SECTIONS: ContractTemplateSection[] = [
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

// Default foster sections for guided builder
const DEFAULT_FOSTER_SECTIONS: ContractTemplateSection[] = [
  {
    id: 'header',
    type: 'header',
    title: 'Contract Header',
    content: '<h1>{{organization_name}} - Foster Care Agreement</h1>\n<p>This Foster Care Agreement is entered into on {{contract_date}}</p>',
    required: true,
    order: 0,
  },
  {
    id: 'foster-info',
    type: 'paragraph',
    title: 'Foster Parent Information',
    content: '<h2>Foster Parent Information</h2>\n<p><strong>Name:</strong> {{foster_parent_name}}</p>\n<p><strong>Email:</strong> {{foster_email}}</p>\n<p><strong>Phone:</strong> {{foster_phone}}</p>\n<p><strong>Address:</strong> {{foster_address}}</p>\n<p><strong>Start Date:</strong> {{foster_start_date}}</p>',
    required: true,
    order: 1,
  },
  {
    id: 'animal-info',
    type: 'paragraph',
    title: 'Foster Animal Information',
    content: '<h2>Foster Animal Information</h2>\n<p><strong>Name:</strong> {{animal_name}}</p>\n<p><strong>Species:</strong> {{animal_species}}</p>\n<p><strong>Breed:</strong> {{animal_breed}}</p>\n<p><strong>Age:</strong> {{animal_age}}</p>\n<p><strong>Sex:</strong> {{animal_sex}}</p>\n<p><strong>Microchip:</strong> {{animal_microchip}}</p>',
    required: true,
    order: 2,
  },
  {
    id: 'terms',
    type: 'terms',
    title: 'Terms of Foster Care',
    content: '<h2>Terms of Foster Care</h2>\n<div class="warning-box"><strong>IMPORTANT:</strong> The Animal remains the sole property of {{organization_name}}.</div>\n<ol>\n<li><strong>Temporary Custody:</strong> I understand I am providing temporary care and ownership remains with the Rescue.</li>\n<li><strong>Medical Authorization:</strong> I will not arrange veterinary care without prior approval, except in emergencies.</li>\n<li><strong>Adoption Process:</strong> All potential adopters must go through the official application process.</li>\n<li><strong>Care Standards:</strong> I will keep the Animal indoors as a household pet.</li>\n</ol>',
    required: true,
    order: 3,
  },
  {
    id: 'signature',
    type: 'signature',
    title: 'Signature Section',
    content: '<h2>Foster Parent Signature</h2>\n<p>By signing below, I acknowledge that I have read and agree to abide by all terms.</p>\n<div class="signature-box">\n<img src="{{signature_image_url}}" alt="Signature" />\n<p><strong>Name:</strong> {{foster_parent_name}}</p>\n<p><strong>Date:</strong> {{contract_date}}</p>\n</div>',
    required: true,
    order: 4,
  },
];

// Merge fields for adoption contracts
const ADOPTION_MERGE_FIELDS: MergeFields = {
  '{{organization_name}}': 'Your organization name',
  '{{adopter_name}}': 'Adopter full name',
  '{{adopter_email}}': 'Adopter email address',
  '{{adopter_phone}}': 'Adopter phone number',
  '{{adopter_address}}': 'Adopter full address',
  '{{animal_name}}': 'Animal name',
  '{{animal_species}}': 'Animal species (Dog, Cat, etc.)',
  '{{animal_breed}}': 'Animal breed',
  '{{animal_sex}}': 'Animal sex',
  '{{animal_age}}': 'Animal age',
  '{{adoption_fee}}': 'Adoption fee amount',
  '{{donation_amount}}': 'Additional donation amount',
  '{{total_amount}}': 'Total payment amount',
  '{{contract_date}}': 'Contract signing date',
  '{{signature_image_url}}': 'Digital signature image',
  '{{signed_timestamp}}': 'Signature timestamp',
  '{{signed_ip}}': 'Signer IP address',
};

// Merge fields for foster contracts
const FOSTER_MERGE_FIELDS: MergeFields = {
  '{{tenant_name}}': 'Your organization name',
  '{{organization_name}}': 'Organization name (alias)',
  '{{user.first_name}}': 'Foster parent first name',
  '{{user.last_name}}': 'Foster parent last name',
  '{{foster_parent_name}}': 'Foster parent full name (alias)',
  '{{foster_email}}': 'Foster parent email',
  '{{foster_phone}}': 'Foster parent phone',
  '{{foster_address}}': 'Foster parent address',
  '{{date_today}}': "Today's date",
  '{{contract_date}}': 'Contract signing date (alias)',
  '{{foster_start_date}}': 'Foster start date (alias)',
  '{{signature_image_url}}': 'Digital signature image',
  '{{signed_timestamp}}': 'Signature timestamp',
  '{{signed_ip}}': 'Signer IP address',
};

const PLACEMENT_MERGE_FIELDS: MergeFields = {
  '{{organization_name}}': 'Your organization name',
  '{{animal_name}}': 'Animal name',
  '{{animal_id}}': 'Animal internal ID',
  '{{animal_breed}}': 'Breed',
  '{{animal_species}}': 'Species',
  '{{animal_sex}}': 'Sex',
  '{{animal_age}}': 'Age',
  '{{animal_microchip}}': 'Microchip number',
  '{{animal_weight}}': 'Weight',
  '{{foster_name}}': 'Foster parent name',
  '{{foster_email}}': 'Foster email',
  '{{foster_phone}}': 'Foster phone',
  '{{medical_disclosures}}': 'Medical alert memo',
  '{{behavioral_notes}}': 'Behavioral assessment',
  '{{special_needs}}': 'Special needs',
  '{{dietary_restrictions}}': 'Dietary restrictions',
  '{{needs_fence}}': 'Fenced yard requirement',
  '{{date}}': 'Current date',
  '{{signature_image}}': 'Signature image (auto-inserted)',
};

const DEFAULT_PLACEMENT_SECTIONS: ContractTemplateSection[] = [
  {
    id: 'header',
    type: 'header',
    title: 'Agreement Header',
    content: '<h1>Animal Placement Agreement</h1>\n<p style="text-align:center;color:#666;">{{organization_name}}</p>',
    required: true,
    order: 0,
  },
  {
    id: 'animal-info',
    type: 'paragraph',
    title: 'Animal Information',
    content: '<h2>Animal Information</h2>\n<table><tr><td>Name</td><td>{{animal_name}}</td></tr>\n<tr><td>ID</td><td>{{animal_id}}</td></tr>\n<tr><td>Breed</td><td>{{animal_breed}}</td></tr>\n<tr><td>Species</td><td>{{animal_species}}</td></tr>\n<tr><td>Sex</td><td>{{animal_sex}}</td></tr>\n<tr><td>Age</td><td>{{animal_age}}</td></tr></table>',
    required: true,
    order: 1,
  },
  {
    id: 'disclosures',
    type: 'paragraph',
    title: 'Medical & Behavioral Disclosures',
    content: '<h2>Medical &amp; Behavioral Disclosures</h2>\n<p><strong>Medical Notes:</strong> {{medical_disclosures}}</p>\n<p><strong>Behavioral Assessment:</strong> {{behavioral_notes}}</p>\n<p><strong>Special Needs:</strong> {{special_needs}}</p>\n<p><strong>Dietary Restrictions:</strong> {{dietary_restrictions}}</p>\n<p><strong>Requires Fenced Yard:</strong> {{needs_fence}}</p>',
    required: true,
    order: 2,
  },
  {
    id: 'master-reference',
    type: 'terms',
    title: 'Master Agreement Reference',
    content: '<div class="warning-box"><strong>Subject to Master Foster Agreement:</strong> This placement is subject to the Master Foster Agreement previously signed with {{organization_name}}.</div>',
    required: true,
    order: 3,
  },
  {
    id: 'signature',
    type: 'signature',
    title: 'Signature',
    content: '<p><strong>Date:</strong> {{date}}</p>\n<div class="signature-box">\n<p><strong>Foster Signature:</strong></p>\n{{signature_image}}\n<p>{{foster_name}} &mdash; {{date}}</p>\n</div>',
    required: true,
    order: 4,
  },
];

// Generate HTML from guided sections
function generateHtmlFromSections(sections: ContractTemplateSection[], contractType: ContractType): string {
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const bodyContent = sortedSections.map(s => s.content).join('\n\n');
  const title = contractType === 'adoption' ? 'Adoption Contract' : contractType === 'foster' ? 'Foster Care Agreement' : 'Animal Placement Agreement';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a1a1a; font-size: 24px; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
    h2 { color: #2d2d2d; font-size: 18px; margin-top: 30px; }
    p { margin-bottom: 10px; }
    ol, ul { margin-left: 20px; }
    li { margin-bottom: 8px; }
    .signature-box { margin: 20px 0; padding: 20px; border: 1px solid #ddd; background: #f9f9f9; }
    .signature-box img { max-width: 300px; border-bottom: 1px solid #333; }
    .warning-box { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; }
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
  editorMode: z.enum(['richText', 'guided', 'smart']).default('smart'),
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
  
  // Contract type tab state
  const [activeContractType, setActiveContractType] = useState<ContractType>('adoption');
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isFieldsPanelOpen, setIsFieldsPanelOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'richText' | 'guided' | 'smart'>('smart');
  const [guidedSections, setGuidedSections] = useState<ContractTemplateSection[]>(DEFAULT_ADOPTION_SECTIONS);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editableVariables, setEditableVariables] = useState<EditableVariable[]>([]);

  // Get current merge fields and default sections based on active contract type
  const currentMergeFields = activeContractType === 'adoption' ? ADOPTION_MERGE_FIELDS : activeContractType === 'foster' ? FOSTER_MERGE_FIELDS : PLACEMENT_MERGE_FIELDS;
  const currentDefaultSections = activeContractType === 'adoption' ? DEFAULT_ADOPTION_SECTIONS : activeContractType === 'foster' ? DEFAULT_FOSTER_SECTIONS : DEFAULT_PLACEMENT_SECTIONS;

  // Form for creating new templates
  const createForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      editorMode: "richText",
      htmlTemplate: "",
      guidedSections: currentDefaultSections,
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
      guidedSections: currentDefaultSections,
      isDefault: false,
    },
  });

  // Fetch adoption templates
  const { data: adoptionData, isLoading: adoptionLoading } = useQuery<{ templates: ContractTemplate[]; mergeFields: MergeFields }>({
    queryKey: ['/api/contract-templates'],
  });

  // Fetch foster templates
  const { data: fosterData, isLoading: fosterLoading } = useQuery<{ templates: ContractTemplate[]; mergeFields: MergeFields }>({
    queryKey: ['/api/foster-contract-templates'],
  });

  // Fetch placement agreement templates
  const { data: placementData, isLoading: placementLoading } = useQuery<{ templates: ContractTemplate[]; mergeFields: MergeFields }>({
    queryKey: ['/api/placement-agreement-templates'],
  });

  const adoptionTemplates = adoptionData?.templates || [];
  const fosterTemplates = fosterData?.templates || [];
  const placementTemplates = placementData?.templates || [];
  const templates = activeContractType === 'adoption' ? adoptionTemplates : activeContractType === 'foster' ? fosterTemplates : placementTemplates;
  const isLoading = activeContractType === 'adoption' ? adoptionLoading : activeContractType === 'foster' ? fosterLoading : placementLoading;

  // API endpoint based on contract type
  const getApiEndpoint = (type: ContractType) => 
    type === 'adoption' ? '/api/contract-templates' : type === 'foster' ? '/api/foster-contract-templates' : '/api/placement-agreement-templates';

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (templateData: TemplateFormData) => {
      return apiRequest('POST', getApiEndpoint(activeContractType), templateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getApiEndpoint(activeContractType)] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Template created",
        description: `${({ adoption: 'Adoption', foster: 'Foster', placement: 'Placement' } as const)[activeContractType]} contract template has been created successfully`,
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

  // Wizard create mutation
  const wizardCreateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; htmlTemplate: string; editorMode: string; contractType: ContractType }) => {
      const endpoint = getApiEndpoint(data.contractType);
      return apiRequest('POST', endpoint, {
        name: data.name,
        description: data.description,
        htmlTemplate: data.htmlTemplate,
        editorMode: data.editorMode,
        isDefault: false,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [getApiEndpoint(variables.contractType)] });
      setIsWizardOpen(false);
      setActiveContractType(variables.contractType);
      toast({
        title: "Template created",
        description: "Your contract template has been built and saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TemplateFormData }) => {
      return apiRequest('PUT', `${getApiEndpoint(activeContractType)}/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getApiEndpoint(activeContractType)] });
      setIsEditDialogOpen(false);
      setSelectedTemplate(null);
      editForm.reset();
      toast({
        title: "Template updated",
        description: `${({ adoption: 'Adoption', foster: 'Foster', placement: 'Placement' } as const)[activeContractType]} contract template has been updated successfully`,
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
      return apiRequest('DELETE', `${getApiEndpoint(activeContractType)}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getApiEndpoint(activeContractType)] });
      setIsDeleteDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template deleted",
        description: `${({ adoption: 'Adoption', foster: 'Foster', placement: 'Placement' } as const)[activeContractType]} contract template has been deleted successfully`,
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
      return apiRequest('PUT', `${getApiEndpoint(activeContractType)}/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getApiEndpoint(activeContractType)] });
      toast({
        title: "Default template updated",
        description: `This template is now the default for new ${{ adoption: 'adoptions', foster: 'foster placements', placement: 'animal placements' }[activeContractType]}`,
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
      const response = await fetch(`${getApiEndpoint(activeContractType)}/${id}/preview`);
      if (!response.ok) throw new Error('Failed to generate preview');
      return response.json();
    },
    onSuccess: (data) => {
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
      guidedSections: currentDefaultSections,
      isDefault: false,
    });
    setEditorMode('smart');
    setGuidedSections(currentDefaultSections);
    setEditableVariables([]);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    const templateMode = template.editorMode === 'guided' ? 'guided' : 'smart';
    const sections = template.guidedSections || currentDefaultSections;
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
    setEditableVariables(template.editableVariables || []);
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
    const finalData: any = { ...data, editorMode, editableVariables };
    if (editorMode === 'guided') {
      finalData.htmlTemplate = generateHtmlFromSections(guidedSections, activeContractType);
      finalData.guidedSections = guidedSections;
    }
    createMutation.mutate(finalData);
  };

  const onSubmitEdit = (data: TemplateFormData) => {
    if (selectedTemplate) {
      const finalData: any = { ...data, editorMode, editableVariables };
      if (editorMode === 'guided') {
        finalData.htmlTemplate = generateHtmlFromSections(guidedSections, activeContractType);
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

  // Handle tab change - reset guided sections to match new contract type
  const handleTabChange = (value: string) => {
    const newType = value as ContractType;
    setActiveContractType(newType);
    setGuidedSections(newType === 'adoption' ? DEFAULT_ADOPTION_SECTIONS : newType === 'foster' ? DEFAULT_FOSTER_SECTIONS : DEFAULT_PLACEMENT_SECTIONS);
  };

  if (adoptionLoading && fosterLoading && placementLoading) {
    return (
      <DashboardLayout
        title="Contract Templates"
        description="Manage adoption and foster contract templates"
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
      description="Manage adoption, foster, and placement agreement templates with customizable merge fields"
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
              Manage adoption, foster, and placement agreement templates with customizable merge fields
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsWizardOpen(true)} data-testid="button-wizard-template">
              <Wand2 className="h-4 w-4 mr-2" />
              Build with Wizard
            </Button>
            <Button onClick={handleCreate} data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>

        {/* Contract Type Tabs */}
        <Tabs value={activeContractType} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="adoption" className="gap-2" data-testid="tab-adoption-contracts">
              <PawPrint className="h-4 w-4" />
              Adoption
              {adoptionTemplates.length > 0 && (
                <Badge variant="secondary" className="ml-1">{adoptionTemplates.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="foster" className="gap-2" data-testid="tab-foster-contracts">
              <Heart className="h-4 w-4" />
              Foster
              {fosterTemplates.length > 0 && (
                <Badge variant="secondary" className="ml-1">{fosterTemplates.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="placement" className="gap-2" data-testid="tab-placement-contracts">
              <FileText className="h-4 w-4" />
              Placement
              {placementTemplates.length > 0 && (
                <Badge variant="secondary" className="ml-1">{placementTemplates.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adoption" className="mt-6">
            {renderTemplateGrid(adoptionTemplates, adoptionLoading)}
          </TabsContent>

          <TabsContent value="foster" className="mt-6">
            {renderTemplateGrid(fosterTemplates, fosterLoading)}
          </TabsContent>

          <TabsContent value="placement" className="mt-6">
            {renderTemplateGrid(placementTemplates, placementLoading)}
          </TabsContent>
        </Tabs>

        {/* Wizard Dialog */}
        <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <ContractTemplateWizard
              onComplete={(data) => wizardCreateMutation.mutate(data)}
              onCancel={() => setIsWizardOpen(false)}
              isPending={wizardCreateMutation.isPending}
              tenantName={tenant?.name || ""}
              contractType={activeContractType === "placement" ? "adoption" : activeContractType}
            />
          </DialogContent>
        </Dialog>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={createForm.handleSubmit(onSubmitCreate)}>
              <DialogHeader>
                <DialogTitle>
                  Create {({ adoption: 'Adoption', foster: 'Foster', placement: 'Placement' } as const)[activeContractType]} Contract Template
                </DialogTitle>
                <DialogDescription>
                  Create a new {{ adoption: 'adoption', foster: 'foster care', placement: 'placement agreement' }[activeContractType]} template with merge fields.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    {...createForm.register("name")}
                    placeholder={`e.g., Standard ${activeContractType === 'adoption' ? 'Adoption' : 'Foster Care'} Contract`}
                    data-testid="input-template-name"
                  />
                  {createForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {createForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    {...createForm.register("description")}
                    placeholder="Brief description of this template..."
                    data-testid="input-template-description"
                  />
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
                          Copy and paste these fields into your HTML template. Fields will be replaced with actual data when the contract is generated.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-64">
                          <div className="space-y-2">
                            {Object.entries(currentMergeFields).map(([field, description]) => (
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

                {/* Editor Mode Tabs */}
                <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as 'richText' | 'guided' | 'smart')}>
                  <TabsList className="grid w-full max-w-md grid-cols-3">
                    <TabsTrigger value="smart" className="gap-2" data-testid="tab-smart-mode">
                      <Sparkles className="h-4 w-4" />
                      Smart Editor
                    </TabsTrigger>
                    <TabsTrigger value="richText" className="gap-2" data-testid="tab-richtext-mode">
                      <Type className="h-4 w-4" />
                      HTML
                    </TabsTrigger>
                    <TabsTrigger value="guided" className="gap-2" data-testid="tab-guided-mode">
                      <LayoutTemplate className="h-4 w-4" />
                      Guided
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="smart" className="mt-4">
                    <SmartTemplateEditor
                      value={createForm.watch("htmlTemplate") || ""}
                      onChange={(value) => createForm.setValue("htmlTemplate", value)}
                      documentType={activeContractType as DocumentType}
                      editableVariables={editableVariables}
                      onEditableVariablesChange={setEditableVariables}
                    />
                    {createForm.formState.errors.htmlTemplate && (
                      <p className="text-sm text-destructive mt-1">
                        {createForm.formState.errors.htmlTemplate.message}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="richText" className="mt-4">
                    <div>
                      <Label htmlFor="htmlTemplate">HTML Template</Label>
                      <Alert className="my-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Paste your full HTML contract template here. Use merge fields like {`{{adopter_name}}`} for dynamic content.
                        </AlertDescription>
                      </Alert>
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
                    </div>
                  </TabsContent>

                  <TabsContent value="guided" className="mt-4 space-y-4">
                    <Alert>
                      <LayoutTemplate className="h-4 w-4" />
                      <AlertDescription>
                        Build your contract section by section. Click on a section to edit its content.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      {guidedSections.map((section, index) => (
                        <Card key={section.id} className="relative">
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                <span className="font-medium">{section.title}</span>
                                {section.required && (
                                  <Badge variant="outline" className="text-xs">Required</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingSectionId(
                                    editingSectionId === section.id ? null : section.id
                                  )}
                                  data-testid={`button-toggle-section-${section.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!section.required && (
                                  <Button
                                    type="button"
                                    size="sm"
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
                                  {Object.entries(currentMergeFields).slice(0, 8).map(([field]) => (
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
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
                    placeholder={`e.g., Standard ${activeContractType === 'adoption' ? 'Adoption' : 'Foster Care'} Contract`}
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
                            {Object.entries(currentMergeFields).map(([field, description]) => (
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

                {/* Editor Mode Tabs for Edit Dialog */}
                <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as 'richText' | 'guided' | 'smart')}>
                  <TabsList className="grid w-full max-w-md grid-cols-3">
                    <TabsTrigger value="smart" className="gap-2" data-testid="tab-edit-smart-mode">
                      <Sparkles className="h-4 w-4" />
                      Smart Editor
                    </TabsTrigger>
                    <TabsTrigger value="richText" className="gap-2" data-testid="tab-edit-richtext-mode">
                      <Type className="h-4 w-4" />
                      HTML
                    </TabsTrigger>
                    <TabsTrigger value="guided" className="gap-2" data-testid="tab-edit-guided-mode">
                      <LayoutTemplate className="h-4 w-4" />
                      Guided
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="smart" className="mt-4">
                    <SmartTemplateEditor
                      value={editForm.watch("htmlTemplate") || ""}
                      onChange={(value) => editForm.setValue("htmlTemplate", value)}
                      documentType={activeContractType as DocumentType}
                      editableVariables={editableVariables}
                      onEditableVariablesChange={setEditableVariables}
                    />
                    {editForm.formState.errors.htmlTemplate && (
                      <p className="text-sm text-destructive mt-1">
                        {editForm.formState.errors.htmlTemplate.message}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="richText" className="mt-4">
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
                  </TabsContent>

                  <TabsContent value="guided" className="mt-4 space-y-4">
                    <Alert>
                      <LayoutTemplate className="h-4 w-4" />
                      <AlertDescription>
                        Build your contract section by section. Click on a section to edit its content.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      {guidedSections.map((section) => (
                        <Card key={section.id} className="relative">
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                <span className="font-medium">{section.title}</span>
                                {section.required && (
                                  <Badge variant="outline" className="text-xs">Required</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingSectionId(
                                    editingSectionId === section.id ? null : section.id
                                  )}
                                  data-testid={`button-edit-toggle-section-${section.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!section.required && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeSection(section.id)}
                                    data-testid={`button-edit-remove-section-${section.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          {editingSectionId === section.id && (
                            <CardContent className="pt-0">
                              <Textarea
                                value={section.content}
                                onChange={(e) => updateSection(section.id, { content: e.target.value })}
                                className="font-mono text-sm min-h-32"
                                placeholder="HTML content for this section..."
                                data-testid={`textarea-edit-section-content-${section.id}`}
                              />
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
                      data-testid="button-edit-add-section"
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

        {/* Preview Dialog */}
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

  // Helper function to render template grid
  function renderTemplateGrid(templateList: ContractTemplate[], loading: boolean) {
    if (loading) {
      return (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      );
    }

    if (templateList.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {activeContractType === 'adoption' ? (
              <PawPrint className="h-12 w-12 text-muted-foreground mb-4" />
            ) : activeContractType === 'foster' ? (
              <Heart className="h-12 w-12 text-muted-foreground mb-4" />
            ) : (
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            )}
            <p className="text-lg font-medium mb-2">No {activeContractType} templates yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first {{ adoption: 'adoption', foster: 'foster care', placement: 'placement agreement' }[activeContractType]} template to get started
            </p>
            <Button onClick={handleCreate} data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {templateList.map((template) => (
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
                {template.description || `Last updated: ${new Date(template.updatedAt || template.createdAt).toLocaleDateString()}`}
              </p>
            </CardContent>
            <CardFooter className="gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePreview(template)}
                data-testid={`button-preview-${template.id}`}
              >
                <Eye className="h-4 w-4 mr-1" />
                Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(template)}
                data-testid={`button-edit-${template.id}`}
              >
                <Edit className="h-4 w-4 mr-1" />
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
                    <Star className="h-4 w-4 mr-1" />
                    Set Default
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(template)}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-${template.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }
}
