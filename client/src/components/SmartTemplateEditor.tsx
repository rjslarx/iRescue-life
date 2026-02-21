import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  User, 
  PawPrint, 
  Stethoscope, 
  Calendar, 
  Building2, 
  DollarSign,
  FileSignature,
  Sparkles,
  Eye,
  Code,
  ChevronRight,
  Plus,
  ClipboardCheck,
} from "lucide-react";
import DOMPurify from 'dompurify';
import type { EditableVariable } from "@shared/schema";

type DocumentType = 'adoption' | 'foster' | 'surrender' | 'volunteer' | 'placement';

interface VariableCategory {
  name: string;
  icon: React.ElementType;
  description: string;
  variables: { token: string; label: string; description: string; smart?: boolean }[];
}

const VARIABLE_CATEGORIES: Record<DocumentType, VariableCategory[]> = {
  adoption: [
    {
      name: "Organization",
      icon: Building2,
      description: "Your organization details",
      variables: [
        { token: "{{organization_name}}", label: "Organization Name", description: "Your rescue's name" },
        { token: "{{organization_address}}", label: "Organization Address", description: "Your rescue's address" },
        { token: "{{organization_phone}}", label: "Organization Phone", description: "Contact phone" },
        { token: "{{organization_email}}", label: "Organization Email", description: "Contact email" },
      ]
    },
    {
      name: "Adopter Info",
      icon: User,
      description: "Adopter's personal information",
      variables: [
        { token: "{{adopter_name}}", label: "Full Name", description: "First and last name" },
        { token: "{{adopter_first_name}}", label: "First Name", description: "First name only" },
        { token: "{{adopter_last_name}}", label: "Last Name", description: "Last name only" },
        { token: "{{adopter_email}}", label: "Email", description: "Email address" },
        { token: "{{adopter_phone}}", label: "Phone", description: "Phone number" },
        { token: "{{adopter_address}}", label: "Full Address", description: "Complete mailing address" },
        { token: "{{adopter_street_address}}", label: "Street Address", description: "Street address line 1" },
        { token: "{{adopter_street_address_2}}", label: "Street Address 2", description: "Apt/Suite number" },
        { token: "{{adopter_city}}", label: "City", description: "City" },
        { token: "{{adopter_state}}", label: "State", description: "State" },
        { token: "{{adopter_zip}}", label: "ZIP Code", description: "Postal code" },
        { token: "{{adopter_drivers_license}}", label: "Driver's License", description: "License number" },
      ]
    },
    {
      name: "Animal Info",
      icon: PawPrint,
      description: "Details about the animal",
      variables: [
        { token: "{{animal_name}}", label: "Name", description: "Animal's name" },
        { token: "{{animal_species}}", label: "Species", description: "Dog, Cat, etc." },
        { token: "{{animal_breed}}", label: "Breed", description: "Breed information" },
        { token: "{{animal_age}}", label: "Age", description: "Current age" },
        { token: "{{animal_sex}}", label: "Sex", description: "Male/Female" },
        { token: "{{animal_color}}", label: "Color", description: "Coat color" },
        { token: "{{animal_weight}}", label: "Weight", description: "Current weight" },
        { token: "{{animal_microchip}}", label: "Microchip", description: "Microchip number" },
      ]
    },
    {
      name: "Medical",
      icon: Stethoscope,
      description: "Health and medical information",
      variables: [
        { token: "{{vet_appointment_date}}", label: "Vet Appointment", description: "Next vet visit date" },
        { token: "{{spay_neuter_date}}", label: "Spay/Neuter Date", description: "Spay/neuter deadline or 'Not applicable'" },
        { token: "{{spay_status}}", label: "Spay Status", description: "Shows 'Completed on [date]' or 'Due by [date]'", smart: true },
        { token: "{{rabies_expiry}}", label: "Rabies Expiry", description: "Rabies vaccination expiry" },
        { token: "{{medical_notes}}", label: "Medical Notes", description: "Special medical conditions" },
      ]
    },
    {
      name: "Fees & Payment",
      icon: DollarSign,
      description: "Financial details",
      variables: [
        { token: "{{adoption_fee}}", label: "Adoption Fee", description: "Base adoption fee" },
        { token: "{{donation_amount}}", label: "Donation", description: "Additional donation" },
        { token: "{{total_amount}}", label: "Total Amount", description: "Total payment" },
      ]
    },
    {
      name: "Dates & Signatures",
      icon: FileSignature,
      description: "Contract dates and signature fields",
      variables: [
        { token: "{{contract_date}}", label: "Contract Date", description: "Date of signing" },
        { token: "{{today}}", label: "Today's Date", description: "Current date", smart: true },
        { token: "{{signature_image_url}}", label: "Signature Image", description: "Digital signature" },
        { token: "{{signed_timestamp}}", label: "Signed Timestamp", description: "Exact time of signing" },
        { token: "{{signed_ip}}", label: "Signer IP", description: "IP address for verification" },
      ]
    },
  ],
  foster: [
    {
      name: "Organization",
      icon: Building2,
      description: "Your organization details",
      variables: [
        { token: "{{organization_name}}", label: "Organization Name", description: "Your rescue's name" },
      ]
    },
    {
      name: "Foster Parent",
      icon: User,
      description: "Foster parent information",
      variables: [
        { token: "{{foster_parent_name}}", label: "Full Name", description: "Foster's full name" },
        { token: "{{foster_email}}", label: "Email", description: "Email address" },
        { token: "{{foster_phone}}", label: "Phone", description: "Phone number" },
        { token: "{{foster_address}}", label: "Address", description: "Full address" },
        { token: "{{foster_start_date}}", label: "Start Date", description: "Foster care start date" },
      ]
    },
    {
      name: "Animal Info",
      icon: PawPrint,
      description: "Details about the fostered animal",
      variables: [
        { token: "{{animal_name}}", label: "Name", description: "Animal's name" },
        { token: "{{animal_species}}", label: "Species", description: "Dog, Cat, etc." },
        { token: "{{animal_breed}}", label: "Breed", description: "Breed information" },
        { token: "{{animal_age}}", label: "Age", description: "Current age" },
        { token: "{{animal_sex}}", label: "Sex", description: "Male/Female" },
        { token: "{{animal_microchip}}", label: "Microchip", description: "Microchip number" },
      ]
    },
    {
      name: "Dates & Signatures",
      icon: FileSignature,
      description: "Contract dates and signature fields",
      variables: [
        { token: "{{contract_date}}", label: "Contract Date", description: "Date of signing" },
        { token: "{{today}}", label: "Today's Date", description: "Current date", smart: true },
        { token: "{{signature_image_url}}", label: "Signature Image", description: "Digital signature" },
        { token: "{{signed_timestamp}}", label: "Signed Timestamp", description: "Exact time of signing" },
        { token: "{{signed_ip}}", label: "Signer IP", description: "IP address for verification" },
      ]
    },
  ],
  surrender: [
    {
      name: "Organization",
      icon: Building2,
      description: "Your organization details",
      variables: [
        { token: "{{organization_name}}", label: "Organization Name", description: "Your rescue's name" },
      ]
    },
    {
      name: "Owner Info",
      icon: User,
      description: "Surrendering owner information",
      variables: [
        { token: "{{owner_name}}", label: "Owner Name", description: "Owner's full name" },
        { token: "{{owner_email}}", label: "Email", description: "Email address" },
        { token: "{{owner_phone}}", label: "Phone", description: "Phone number" },
        { token: "{{owner_address}}", label: "Address", description: "Full address" },
      ]
    },
    {
      name: "Animal Info",
      icon: PawPrint,
      description: "Details about the surrendered animal",
      variables: [
        { token: "{{animal_name}}", label: "Name", description: "Animal's name" },
        { token: "{{animal_species}}", label: "Species", description: "Dog, Cat, etc." },
        { token: "{{animal_breed}}", label: "Breed", description: "Breed information" },
        { token: "{{animal_age}}", label: "Age", description: "Current age" },
        { token: "{{surrender_reason}}", label: "Surrender Reason", description: "Reason for surrender" },
      ]
    },
    {
      name: "Dates & Signatures",
      icon: FileSignature,
      description: "Contract dates and signature fields",
      variables: [
        { token: "{{contract_date}}", label: "Contract Date", description: "Date of signing" },
        { token: "{{today}}", label: "Today's Date", description: "Current date", smart: true },
        { token: "{{signature_image_url}}", label: "Signature Image", description: "Digital signature" },
      ]
    },
  ],
  volunteer: [
    {
      name: "Organization",
      icon: Building2,
      description: "Your organization details",
      variables: [
        { token: "{{organization_name}}", label: "Organization Name", description: "Your rescue's name" },
      ]
    },
    {
      name: "Volunteer Info",
      icon: User,
      description: "Volunteer information",
      variables: [
        { token: "{{volunteer_name}}", label: "Full Name", description: "Volunteer's full name" },
        { token: "{{volunteer_email}}", label: "Email", description: "Email address" },
        { token: "{{volunteer_phone}}", label: "Phone", description: "Phone number" },
        { token: "{{volunteer_address}}", label: "Address", description: "Full address" },
        { token: "{{emergency_contact}}", label: "Emergency Contact", description: "Emergency contact info" },
      ]
    },
    {
      name: "Dates & Signatures",
      icon: FileSignature,
      description: "Contract dates and signature fields",
      variables: [
        { token: "{{contract_date}}", label: "Contract Date", description: "Date of signing" },
        { token: "{{today}}", label: "Today's Date", description: "Current date", smart: true },
        { token: "{{signature_image_url}}", label: "Signature Image", description: "Digital signature" },
      ]
    },
  ],
};

const SAMPLE_DATA: Record<string, string> = {
  "{{organization_name}}": "Happy Paws Rescue",
  "{{organization_address}}": "123 Rescue Lane, Pet City, TX 75001",
  "{{organization_phone}}": "(555) 123-4567",
  "{{organization_email}}": "info@happypawsrescue.org",
  "{{adopter_name}}": "John Smith",
  "{{adopter_first_name}}": "John",
  "{{adopter_last_name}}": "Smith",
  "{{adopter_email}}": "john.smith@email.com",
  "{{adopter_phone}}": "(555) 987-6543",
  "{{adopter_address}}": "456 Home Street, Apt 2B, Your City, TX 75002",
  "{{adopter_street_address}}": "456 Home Street",
  "{{adopter_street_address_2}}": "Apt 2B",
  "{{adopter_city}}": "Your City",
  "{{adopter_state}}": "TX",
  "{{adopter_zip}}": "75002",
  "{{adopter_drivers_license}}": "DL12345678",
  "{{animal_name}}": "Buddy",
  "{{animal_species}}": "Dog",
  "{{animal_breed}}": "Golden Retriever Mix",
  "{{animal_age}}": "2 years",
  "{{animal_sex}}": "Male",
  "{{animal_color}}": "Golden",
  "{{animal_weight}}": "55 lbs",
  "{{animal_microchip}}": "985141000123456",
  "{{vet_appointment_date}}": "March 15, 2026",
  "{{spay_neuter_date}}": "Not applicable",
  "{{spay_status}}": "Completed on February 1, 2026",
  "{{rabies_expiry}}": "February 2027",
  "{{medical_notes}}": "Up to date on all vaccinations",
  "{{adoption_fee}}": "$350.00",
  "{{donation_amount}}": "$50.00",
  "{{total_amount}}": "$400.00",
  "{{contract_date}}": "February 5, 2026",
  "{{today}}": new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  "{{signature_image_url}}": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "{{signed_timestamp}}": new Date().toISOString(),
  "{{signed_ip}}": "192.168.1.1",
  "{{foster_parent_name}}": "Jane Doe",
  "{{foster_email}}": "jane.doe@email.com",
  "{{foster_phone}}": "(555) 111-2222",
  "{{foster_address}}": "789 Foster Ave, Pet Town, TX 75003",
  "{{foster_start_date}}": "February 10, 2026",
  "{{owner_name}}": "Previous Owner",
  "{{owner_email}}": "owner@email.com",
  "{{owner_phone}}": "(555) 333-4444",
  "{{owner_address}}": "999 Old Street, Former City, TX 75004",
  "{{surrender_reason}}": "Moving to a no-pet housing",
  "{{volunteer_name}}": "Helpful Helper",
  "{{volunteer_email}}": "volunteer@email.com",
  "{{volunteer_phone}}": "(555) 555-5555",
  "{{volunteer_address}}": "111 Volunteer Way, Helper City, TX 75005",
  "{{emergency_contact}}": "Emergency Contact: (555) 911-9111",
};

const AUTO_FILLED_TOKENS = new Set([
  'organization_name', 'organization_address', 'organization_phone', 'organization_email',
  'adopter_name', 'adopter_first_name', 'adopter_last_name', 'adopter_email', 'adopter_phone',
  'adopter_address', 'adopter_street_address', 'adopter_street_address_2', 'adopter_city',
  'adopter_state', 'adopter_zip', 'adopter_drivers_license',
  'animal_name', 'animal_species', 'animal_breed', 'animal_age', 'animal_sex',
  'animal_color', 'animal_weight', 'animal_microchip',
  'adoption_fee', 'donation_amount', 'total_amount',
  'contract_date', 'today', 'signature_image_url', 'signed_timestamp', 'signed_ip',
  'foster_parent_name', 'foster_email', 'foster_phone', 'foster_address', 'foster_start_date',
  'owner_name', 'owner_email', 'owner_phone', 'owner_address', 'surrender_reason',
  'volunteer_name', 'volunteer_email', 'volunteer_phone', 'volunteer_address', 'emergency_contact',
]);

function guessFieldType(token: string): EditableVariable['fieldType'] {
  if (token.includes('date') || token.includes('expiry')) return 'date';
  if (token.includes('notes') || token.includes('conditions')) return 'textarea';
  return 'text';
}

interface SmartTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  documentType: DocumentType;
  className?: string;
  editableVariables?: EditableVariable[];
  onEditableVariablesChange?: (variables: EditableVariable[]) => void;
}

export function SmartTemplateEditor({ 
  value, 
  onChange, 
  documentType,
  className,
  editableVariables = [],
  onEditableVariablesChange,
}: SmartTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  const categories = VARIABLE_CATEGORIES[documentType] || VARIABLE_CATEGORIES.adoption;

  const insertVariable = useCallback((token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + token + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newPosition = start + token.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  }, [value, onChange]);

  useEffect(() => {
    if (activeTab === 'preview' && value) {
      let rendered = value;
      Object.entries(SAMPLE_DATA).forEach(([token, sampleValue]) => {
        rendered = rendered.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), sampleValue);
      });
      const sanitized = DOMPurify.sanitize(rendered, {
        ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'b', 'i', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a', 'section', 'article', 'header', 'footer'],
        ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
        ALLOW_DATA_ATTR: false,
      });
      setPreviewHtml(sanitized);
    }
  }, [activeTab, value]);

  return (
    <div className={`flex gap-4 ${className}`}>
      <Card className="flex-1 min-w-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Template Content</CardTitle>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
              <TabsList className="h-8">
                <TabsTrigger value="edit" className="text-xs gap-1 px-3" data-testid="tab-edit-mode">
                  <Code className="h-3 w-3" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs gap-1 px-3" data-testid="tab-preview-mode">
                  <Eye className="h-3 w-3" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === 'edit' ? (
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Write your contract in plain English. Click the variables on the right to insert them where the cursor is..."
              className="font-mono text-sm min-h-[500px] resize-none"
              data-testid="textarea-smart-template"
            />
          ) : (
            <div className="border rounded-md min-h-[500px] bg-white overflow-auto">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[500px] border-0"
                title="Template Preview"
                sandbox="allow-same-origin"
                data-testid="iframe-template-preview"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="w-72 shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Insert Variable
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[540px]">
            <div className="space-y-1 p-3">
              {categories.map((category) => {
                const Icon = category.icon;
                const isExpanded = expandedCategory === category.name;
                
                return (
                  <div key={category.name} className="border rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                      className="w-full flex items-center gap-2 p-2 hover-elevate text-left"
                      data-testid={`button-category-${category.name.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium">{category.name}</span>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    
                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-2 space-y-1">
                        {category.variables.map((variable) => {
                          const tokenKey = variable.token.replace(/^\{\{|\}\}$/g, '');
                          const isEditable = editableVariables.some(v => v.token === tokenKey);
                          const canBeEditable = !AUTO_FILLED_TOKENS.has(tokenKey) && !variable.smart && onEditableVariablesChange;

                          return (
                            <div key={variable.token} className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => insertVariable(variable.token)}
                                className="flex-1 flex items-center gap-2 p-2 rounded-md hover-elevate text-left group min-w-0"
                                title={variable.description}
                                data-testid={`button-insert-${variable.token.replace(/[{}]/g, '')}`}
                              >
                                <Plus className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm truncate">{variable.label}</span>
                                    {variable.smart && (
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                        Smart
                                      </Badge>
                                    )}
                                    {isEditable && (
                                      <Badge variant="default" className="text-[10px] px-1 py-0">
                                        Staff
                                      </Badge>
                                    )}
                                  </div>
                                  <code className="text-[10px] text-muted-foreground block truncate">
                                    {variable.token}
                                  </code>
                                </div>
                              </button>
                              {canBeEditable && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant={isEditable ? "default" : "ghost"}
                                      className="shrink-0 toggle-elevate"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isEditable) {
                                          onEditableVariablesChange!(editableVariables.filter(v => v.token !== tokenKey));
                                        } else {
                                          onEditableVariablesChange!([...editableVariables, {
                                            token: tokenKey,
                                            label: variable.label,
                                            fieldType: guessFieldType(tokenKey),
                                            required: false,
                                          }]);
                                        }
                                      }}
                                      data-testid={`button-toggle-editable-${tokenKey}`}
                                    >
                                      <ClipboardCheck className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p className="text-xs">
                                      {isEditable 
                                        ? "Remove from checkout confirmation" 
                                        : "Require staff to confirm/edit at checkout"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export { VARIABLE_CATEGORIES, SAMPLE_DATA };
export type { DocumentType, VariableCategory };
