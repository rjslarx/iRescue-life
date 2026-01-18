import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, GripVertical, Save, FileText, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { FosterFormField } from "@shared/schema";

// Sortable item component for drag and drop
function SortableFieldItem({ 
  field, 
  onEdit, 
  onDelete 
}: { 
  field: FosterFormField; 
  onEdit: (field: FosterFormField) => void; 
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-4 border rounded-lg hover-elevate bg-background"
      data-testid={`field-${field.id}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${field.id}`}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{field.label}</span>
          {field.required && (
            <Badge variant="secondary" className="text-xs">Required</Badge>
          )}
          <Badge variant="outline" className="text-xs capitalize">
            {field.fieldType}
          </Badge>
        </div>
        {field.helpText && (
          <p className="text-sm text-muted-foreground">{field.helpText}</p>
        )}
        {field.options && field.options.length > 0 && (
          <div className="flex gap-1 mt-2">
            {field.options.slice(0, 3).map((option, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {option}
              </Badge>
            ))}
            {field.options.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{field.options.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(field)}
          data-testid={`button-edit-${field.id}`}
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(field.id)}
          data-testid={`button-delete-${field.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

const formFieldSchema = z.object({
  label: z.string().min(1, "Label is required"),
  fieldType: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox', 'photo']),
  options: z.string().optional(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  textAbove: z.string().optional(),
  textBelow: z.string().optional(),
  order: z.number().default(0),
});

type FormFieldFormData = z.infer<typeof formFieldSchema>;

export default function FosterFormSettingsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FosterFormField | null>(null);
  const [introText, setIntroText] = useState("");
  const [showCustomText, setShowCustomText] = useState(false);

  const { data, isLoading } = useQuery<{ fields: FosterFormField[] }>({
    queryKey: ['/api/foster-form-fields'],
  });

  const { data: settingsData } = useQuery<{ setting: { introText: string | null } }>({
    queryKey: ['/api/form-settings', 'foster'],
  });

  useEffect(() => {
    if (settingsData?.setting?.introText) {
      setIntroText(settingsData.setting.introText);
    }
  }, [settingsData]);

  const saveIntroMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest('PUT', '/api/form-settings/foster', { introText: text || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/form-settings', 'foster'] });
      toast({ title: "Success", description: "Form intro text saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save intro text",
        variant: "destructive",
      });
    },
  });

  const form = useForm<FormFieldFormData>({
    resolver: zodResolver(formFieldSchema),
    defaultValues: {
      label: "",
      fieldType: "text",
      options: "",
      required: false,
      placeholder: "",
      helpText: "",
      textAbove: "",
      textBelow: "",
      order: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormFieldFormData) => {
      const payload = {
        ...data,
        options: data.options ? data.options.split('\n').filter(o => o.trim()) : undefined,
      };
      return await apiRequest('POST', '/api/foster-form-fields', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-form-fields'] });
      toast({ title: "Success", description: "Form field created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create form field",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormFieldFormData> }) => {
      const payload = {
        ...data,
        options: data.options ? data.options.split('\n').filter(o => o.trim()) : undefined,
      };
      return await apiRequest('PATCH', `/api/foster-form-fields/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-form-fields'] });
      toast({ title: "Success", description: "Form field updated successfully" });
      setIsDialogOpen(false);
      setEditingField(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update form field",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/foster-form-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-form-fields'] });
      toast({ title: "Success", description: "Form field deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete form field",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (fieldIds: string[]) => {
      return await apiRequest('POST', '/api/foster-form-fields/reorder', { fieldIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/foster-form-fields'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reorder fields",
        variant: "destructive",
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && data?.fields) {
      const oldIndex = data.fields.findIndex((f) => f.id === active.id);
      const newIndex = data.fields.findIndex((f) => f.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(data.fields, oldIndex, newIndex);
        const fieldIds = newOrder.map((f) => f.id);
        reorderMutation.mutate(fieldIds);
      }
    }
  };

  const handleOpenDialog = (field?: FosterFormField) => {
    if (field) {
      setEditingField(field);
      form.reset({
        label: field.label,
        fieldType: field.fieldType,
        options: field.options?.join('\n') || "",
        required: field.required,
        placeholder: field.placeholder || "",
        helpText: field.helpText || "",
        textAbove: field.textAbove || "",
        textBelow: field.textBelow || "",
        order: field.order,
      });
    } else {
      setEditingField(null);
      form.reset({
        label: "",
        fieldType: "text",
        options: "",
        required: false,
        placeholder: "",
        helpText: "",
        textAbove: "",
        textBelow: "",
        order: data?.fields?.length || 0,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (formData: FormFieldFormData) => {
    if (editingField) {
      updateMutation.mutate({ id: editingField.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this form field?')) {
      deleteMutation.mutate(id);
    }
  };

  const fieldType = form.watch('fieldType');

  return (
    <div className="container max-w-4xl p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Form Introduction
          </CardTitle>
          <CardDescription>
            Add introductory text that appears at the top of the foster application form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            placeholder="Thank you for considering fostering! Please fill out this application to help us match you with an animal in need..."
            rows={4}
            data-testid="input-intro-text"
          />
          <Button
            onClick={() => saveIntroMutation.mutate(introText)}
            disabled={saveIntroMutation.isPending}
            data-testid="button-save-intro"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveIntroMutation.isPending ? 'Saving...' : 'Save Introduction'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">System Fields</Badge>
            Required Foster Information
          </CardTitle>
          <CardDescription>
            These fields are automatically included on every foster application and cannot be removed. They collect essential information from applicants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Contact Information</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-name">
                  <div className="flex-1">
                    <span className="font-medium">Full Name</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Text</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-email">
                  <div className="flex-1">
                    <span className="font-medium">Email</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Email</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-phone">
                  <div className="flex-1">
                    <span className="font-medium">Phone Number</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Phone</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-address">
                  <div className="flex-1">
                    <span className="font-medium">Address</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Text</Badge>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Home Details</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-housing">
                  <div className="flex-1">
                    <span className="font-medium">Housing Type</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Dropdown</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-yard">
                  <div className="flex-1">
                    <span className="font-medium">I have a yard</span>
                    <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Checkbox</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-pets">
                  <div className="flex-1">
                    <span className="font-medium">I have other pets</span>
                    <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Checkbox</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-pets-details">
                  <div className="flex-1">
                    <span className="font-medium">Other Pets Details</span>
                    <Badge variant="outline" className="ml-2 text-xs">Conditional</Badge>
                    <p className="text-sm text-muted-foreground">Shows when "I have other pets" is checked</p>
                  </div>
                  <Badge variant="outline" className="text-xs">Long Text</Badge>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Experience & Availability</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-experience">
                  <div className="flex-1">
                    <span className="font-medium">Fostering / Pet Care Experience</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Long Text</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-availability">
                  <div className="flex-1">
                    <span className="font-medium">Time Commitment & Availability</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Long Text</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-preferences">
                  <div className="flex-1">
                    <span className="font-medium">Animal Preferences</span>
                    <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Long Text</Badge>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">References</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-vet-ref">
                  <div className="flex-1">
                    <span className="font-medium">Veterinarian Reference</span>
                    <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Text</Badge>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30" data-testid="foster-system-field-personal-ref">
                  <div className="flex-1">
                    <span className="font-medium">Personal Reference</span>
                    <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">Text</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-field">
          <Plus className="w-4 h-4 mr-2" />
          Add Question
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custom Questions</CardTitle>
          <CardDescription>
            Add additional questions that appear below the system fields. Drag to reorder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : data?.fields && data.fields.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={data.fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {data.fields.map((field) => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      onEdit={handleOpenDialog}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No custom questions yet. Add questions to customize your foster application form.
              </p>
              <Button onClick={() => handleOpenDialog()} variant="outline" data-testid="button-add-first-field">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Question
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField ? 'Edit Form Question' : 'Add Form Question'}
            </DialogTitle>
            <DialogDescription>
              Configure a custom question for your foster application form
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Label *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Have you fostered animals before?"
                        data-testid="input-label"
                      />
                    </FormControl>
                    <FormDescription>
                      The question text that applicants will see
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fieldType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Field Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-fieldtype">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="text">Short Text</SelectItem>
                        <SelectItem value="textarea">Long Text</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="radio">Radio Buttons</SelectItem>
                        <SelectItem value="checkbox">Checkboxes</SelectItem>
                        <SelectItem value="photo">Photo Upload</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How applicants will answer this question
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox') && (
                <FormField
                  control={form.control}
                  name="options"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Options *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Enter each option on a new line"
                          rows={4}
                          data-testid="input-options"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter one option per line
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="placeholder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Placeholder Text</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Tell us about your experience..."
                        data-testid="input-placeholder"
                      />
                    </FormControl>
                    <FormDescription>
                      Helper text shown inside the input field
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="helpText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Help Text</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional guidance for applicants..."
                        rows={2}
                        data-testid="input-helptext"
                      />
                    </FormControl>
                    <FormDescription>
                      Additional context shown below the field
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Collapsible open={showCustomText} onOpenChange={setShowCustomText}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" type="button" className="w-full justify-start gap-2" data-testid="button-toggle-custom-text">
                    <MessageSquare className="w-4 h-4" />
                    {showCustomText ? 'Hide Custom Text Options' : 'Add Custom Text Above/Below Question'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="textAbove"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Above Question</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Custom text to display above this question..."
                            rows={2}
                            data-testid="input-text-above"
                          />
                        </FormControl>
                        <FormDescription>
                          This text will appear directly above this question on the form
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="textBelow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Below Question</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Custom text to display below this question..."
                            rows={2}
                            data-testid="input-text-below"
                          />
                        </FormControl>
                        <FormDescription>
                          This text will appear directly below this question on the form
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CollapsibleContent>
              </Collapsible>

              <FormField
                control={form.control}
                name="required"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Required Field</FormLabel>
                      <FormDescription>
                        Applicants must answer this question
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-required"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {editingField ? 'Update Question' : 'Add Question'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
