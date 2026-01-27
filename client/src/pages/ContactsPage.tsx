import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Search, UserPlus, Mail, Phone, MapPin, Tag, DollarSign, Calendar, Users, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Contact {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  source: string[] | null;
  role: string[] | null;
  totalDonated: number;
  donationCount: number;
  lastDonationDate: Date | null;
  tags: string[] | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  userFullName: string | null;
  userIsActive: boolean | null;
}

const AVAILABLE_ROLES = [
  { id: "volunteer", label: "Volunteer" },
  { id: "foster", label: "Foster" },
  { id: "board_member", label: "Board Member" },
  { id: "staff", label: "Staff" },
] as const;

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  address: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

export default function ContactsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [donorFilter, setDonorFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Open dialog when ?action=add is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') {
      setDialogOpen(true);
      // Clean up URL
      setLocation('/dashboard/contacts', { replace: true });
    }
  }, [setLocation]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'update'>('skip');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importStep, setImportStep] = useState<'upload' | 'importing' | 'complete'>('upload');

  const { data, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['/api/contacts'],
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: 'skip' | 'update' }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setImportSummary(data.summary);
      setImportStep('complete');
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: "Import Complete",
        description: data.message,
      });
    },
    onError: (error: any) => {
      setImportStep('upload');
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import contacts",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: "Invalid file",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 5MB",
          variant: "destructive",
        });
        return;
      }
      setImportFile(file);
    }
  };

  const handleImport = () => {
    if (importFile) {
      setImportStep('importing');
      importMutation.mutate({ file: importFile, mode: importMode });
    }
  };

  const resetImportDialog = () => {
    setImportFile(null);
    setImportMode('skip');
    setImportSummary(null);
    setImportStep('upload');
  };

  const downloadTemplate = () => {
    window.location.href = '/api/contacts/import/template';
  };

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      tags: "",
      notes: "",
      roles: [],
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const roles = data.roles && data.roles.length > 0 ? data.roles : undefined;
      return apiRequest('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ ...data, tags, role: roles }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: "Contact added",
        description: "The contact has been added to your directory.",
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add contact",
        variant: "destructive",
      });
    },
  });

  const contacts = data?.contacts || [];

  // Filter and search contacts
  const filteredContacts = contacts.filter(contact => {
    // Search filter
    const matchesSearch = searchQuery === "" || 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone?.toLowerCase().includes(searchQuery.toLowerCase());

    // Role filter
    const matchesRole = roleFilter === "all" || 
      (contact.role && contact.role.includes(roleFilter));

    // Source filter
    const matchesSource = sourceFilter === "all" || 
      (contact.source && contact.source.includes(sourceFilter));

    // Donor filter
    const matchesDonor = donorFilter === "all" ||
      (donorFilter === "donors" && contact.totalDonated > 0) ||
      (donorFilter === "non_donors" && contact.totalDonated === 0);

    return matchesSearch && matchesRole && matchesSource && matchesDonor;
  });

  const onSubmit = (data: ContactFormData) => {
    createContactMutation.mutate(data);
  };

  // Get unique roles and sources for filters
  const allRoles = Array.from(new Set(contacts.flatMap(c => c.role || [])));
  const allSources = Array.from(new Set(contacts.flatMap(c => c.source || [])));

  return (
    <DashboardLayout
      title="Contacts Directory"
      description={`${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''}${searchQuery || roleFilter !== "all" || sourceFilter !== "all" || donorFilter !== "all" ? ` (filtered from ${contacts.length} total)` : ''}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Dialog open={importDialogOpen} onOpenChange={(open) => {
            setImportDialogOpen(open);
            if (!open) resetImportDialog();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-import-contacts">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Import Contacts from CSV
                </DialogTitle>
                <DialogDescription>
                  Upload a CSV file containing your contact list. Maximum 5,000 contacts per import.
                </DialogDescription>
              </DialogHeader>
              
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Download sample template</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={downloadTemplate} data-testid="button-download-template">
                      Download CSV
                    </Button>
                  </div>
                  
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      id="csv-upload"
                      data-testid="input-csv-file"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">
                        {importFile ? importFile.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-muted-foreground">CSV file up to 5MB</p>
                    </label>
                  </div>
                  
                  {importFile && (
                    <div className="space-y-3">
                      <Alert>
                        <FileSpreadsheet className="h-4 w-4" />
                        <AlertDescription>
                          Ready to import: <strong>{importFile.name}</strong>
                        </AlertDescription>
                      </Alert>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Handle duplicates</Label>
                        <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as 'skip' | 'update')}>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="skip" id="skip" data-testid="radio-skip" />
                            <Label htmlFor="skip" className="text-sm font-normal">Skip existing emails</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="update" id="update" data-testid="radio-update" />
                            <Label htmlFor="update" className="text-sm font-normal">Update existing contacts with new info</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleImport} 
                      disabled={!importFile}
                      data-testid="button-start-import"
                    >
                      Import Contacts
                    </Button>
                  </DialogFooter>
                </div>
              )}
              
              {importStep === 'importing' && (
                <div className="py-8 text-center space-y-4">
                  <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                  <p className="font-medium">Importing contacts...</p>
                  <p className="text-sm text-muted-foreground">This may take a moment for large files</p>
                  <Progress value={50} className="w-full" />
                </div>
              )}
              
              {importStep === 'complete' && importSummary && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Import Complete</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3">
                      <p className="text-2xl font-bold text-green-600">{importSummary.created}</p>
                      <p className="text-xs text-muted-foreground">New contacts added</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-2xl font-bold text-blue-600">{importSummary.updated}</p>
                      <p className="text-xs text-muted-foreground">Contacts updated</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-2xl font-bold text-muted-foreground">{importSummary.skipped}</p>
                      <p className="text-xs text-muted-foreground">Duplicates skipped</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-2xl font-bold text-red-600">{importSummary.errors.length}</p>
                      <p className="text-xs text-muted-foreground">Errors</p>
                    </Card>
                  </div>
                  
                  {importSummary.errors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Errors ({importSummary.errors.length})
                      </p>
                      <ScrollArea className="h-32 border rounded-md p-2">
                        <div className="space-y-1 text-xs">
                          {importSummary.errors.slice(0, 20).map((err, i) => (
                            <p key={i} className="text-muted-foreground">
                              Row {err.row}: {err.email || '(no email)'} - {err.reason}
                            </p>
                          ))}
                          {importSummary.errors.length > 20 && (
                            <p className="text-muted-foreground italic">...and {importSummary.errors.length - 20} more</p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  
                  <DialogFooter>
                    <Button onClick={() => setImportDialogOpen(false)} data-testid="button-close-import">
                      Done
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-contact">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                  <DialogDescription>
                    Manually add a contact to your directory
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name *</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tags (comma-separated)</FormLabel>
                            <FormControl>
                              <Input placeholder="VIP, Volunteer, etc." {...field} data-testid="input-tags" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Assign Roles (optional)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {AVAILABLE_ROLES.map((role) => (
                          <div key={role.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={form.watch("roles")?.includes(role.id) || false}
                              onCheckedChange={(checked) => {
                                const currentRoles = form.getValues("roles") || [];
                                if (checked) {
                                  form.setValue("roles", [...currentRoles, role.id]);
                                } else {
                                  form.setValue("roles", currentRoles.filter(r => r !== role.id));
                                }
                              }}
                              data-testid={`checkbox-role-${role.id}`}
                            />
                            <Label htmlFor={`role-${role.id}`} className="text-sm font-normal cursor-pointer">
                              {role.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select roles to integrate this contact into your volunteer, foster, or staff systems
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="textarea-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button 
                        type="submit" 
                        disabled={createContactMutation.isPending}
                        data-testid="button-submit-contact"
                      >
                        {createContactMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Contact
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-6">
            {/* Filters and Search */}
            <Card className="mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Filter & Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search by name, email, or phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        data-testid="input-search"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="donor-filter">Donor Status</Label>
                    <Select value={donorFilter} onValueChange={setDonorFilter}>
                      <SelectTrigger id="donor-filter" data-testid="select-donor-filter">
                        <SelectValue placeholder="All contacts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Contacts</SelectItem>
                        <SelectItem value="donors">Donors Only</SelectItem>
                        <SelectItem value="non_donors">Non-Donors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role-filter">Filter by Role</Label>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger id="role-filter" data-testid="select-role-filter">
                        <SelectValue placeholder="All roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {allRoles.map(role => (
                          <SelectItem key={role} value={role}>
                            {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="source-filter">Filter by Source</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger id="source-filter" data-testid="select-source-filter">
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {allSources.map(source => (
                          <SelectItem key={source} value={source}>
                            {source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(searchQuery || roleFilter !== "all" || sourceFilter !== "all" || donorFilter !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setRoleFilter("all");
                      setSourceFilter("all");
                      setDonorFilter("all");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Contacts Table */}
            {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-contacts">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <Card className="p-12 text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">
                  {contacts.length === 0 ? "No Contacts Yet" : "No Matching Contacts"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {contacts.length === 0 
                    ? "Add your first contact manually or wait for contacts to be created automatically from applications and donations."
                    : "Try adjusting your search or filters to find what you're looking for."
                  }
                </p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact Info</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Donations</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContacts.map((contact) => (
                        <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium" data-testid={`text-name-${contact.id}`}>{contact.name}</span>
                              {contact.userId && (
                                <span className="text-xs text-muted-foreground">
                                  Team Member {!contact.userIsActive && "(Inactive)"}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-sm">
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <a href={`mailto:${contact.email}`} className="hover:underline">
                                  {contact.email}
                                </a>
                              </div>
                              {contact.phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <a href={`tel:${contact.phone}`} className="hover:underline">
                                    {contact.phone}
                                  </a>
                                </div>
                              )}
                              {contact.address && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{contact.address}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {contact.role && contact.role.length > 0 ? (
                                contact.role.map(role => (
                                  <Badge key={role} variant="secondary" className="text-xs">
                                    {role.replace('_', ' ')}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {contact.source && contact.source.length > 0 ? (
                                contact.source.slice(0, 2).map(source => (
                                  <Badge key={source} variant="outline" className="text-xs">
                                    {source.replace('_', ' ')}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                              {contact.source && contact.source.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{contact.source.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {contact.donationCount > 0 ? (
                              <div className="flex flex-col text-sm">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">${(contact.totalDonated / 100).toFixed(2)}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {contact.donationCount} donation{contact.donationCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No donations</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {contact.tags && contact.tags.length > 0 ? (
                                contact.tags.slice(0, 2).map(tag => (
                                  <Badge key={tag} variant="default" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                              {contact.tags && contact.tags.length > 2 && (
                                <Badge variant="default" className="text-xs">
                                  +{contact.tags.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
      </div>
    </DashboardLayout>
  );
}
