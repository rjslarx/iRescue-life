import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertGrantSchema, type Grant, type GrantDocument } from "@shared/schema";
import { z } from "zod";
import {
  Loader2,
  Plus,
  FileText,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  Download,
  Upload,
  Trash2,
  Edit,
  Heart,
  PawPrint,
  Search,
  Filter,
  ExternalLink,
  Shield,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";

const documentTypeLabels: Record<string, string> = {
  "501c3_letter": "501(c)(3) Letter",
  "board_list": "Board List",
  "budget": "Budget",
  "financial_statement": "Financial Statement",
  "mission_statement": "Mission Statement",
  "application": "Application",
  "final_report": "Final Report",
  "other": "Other",
};

type GrantMetrics = {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  animalStatistics: {
    totalIntake: number;
    adoptions: number;
    avgLengthOfStay: number;
    currentInFoster: number;
    currentInShelter: number;
    spayNeuterCount: number;
    bySpecies: {
      dogs: number;
      cats: number;
      other: number;
    };
  };
  financial: {
    totalAwarded: string;
    totalRequested: string;
    totalExpenses: string;
    costPerAnimal: string;
  };
  operational: {
    totalVolunteerHours: number;
    activeFosterHomes: number;
    pendingApplications: number;
  };
};

type SuccessStoryAnimal = {
  id: string;
  name: string;
  species: string;
  status: string;
  flaggedForStory: boolean;
  storyTags: string[] | null;
  intakeDate: Date | null;
  adoptionDate: Date | null;
  recentNotes: Array<{
    id: string;
    note: string;
    createdAt: Date;
  }>;
};

type BudgetGrant = {
  id: string;
  name: string;
  funderName: string;
  amountAwarded: string;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  expenditures: Array<{
    id: string;
    vendor: string;
    amount: number;
    category: string;
    date: Date;
    notes: string | null;
  }>;
};

const statusColors = {
  researching: "bg-gray-500",
  in_progress: "bg-blue-500",
  submitted: "bg-yellow-500",
  awarded: "bg-green-500",
  denied: "bg-red-500",
  completed: "bg-purple-500",
};

const programAreaLabels = {
  medical: "Medical Care",
  operations: "Operations",
  spay_neuter: "Spay/Neuter",
  senior_program: "Senior Program",
  special_needs: "Special Needs",
  foster_program: "Foster Program",
  facility: "Facility",
  unrestricted: "Unrestricted",
  other: "Other",
};

export default function GrantsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [createGrantOpen, setCreateGrantOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  const [uploadDocumentOpen, setUploadDocumentOpen] = useState(false);
  const [selectedGrantForDoc, setSelectedGrantForDoc] = useState<string | null>(null);
  const [storyTagFilter, setStoryTagFilter] = useState<string>("all");
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState({
    title: "",
    documentType: "other" as string,
    grantId: "" as string,
    notes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [datePreset, setDatePreset] = useState<string>("this_quarter");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "this_quarter": {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const qEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
        return { startDate: qStart, endDate: qEnd };
      }
      case "last_quarter": {
        const q = Math.floor(now.getMonth() / 3);
        const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevQ = q === 0 ? 3 : q - 1;
        const qStart = new Date(year, prevQ * 3, 1);
        const qEnd = new Date(year, prevQ * 3 + 3, 0);
        return { startDate: qStart, endDate: qEnd };
      }
      case "ytd": {
        return { startDate: new Date(now.getFullYear(), 0, 1), endDate: now };
      }
      case "last_12": {
        const start = new Date(now);
        start.setFullYear(start.getFullYear() - 1);
        return { startDate: start, endDate: now };
      }
      case "all_time":
        return { startDate: null, endDate: null };
      case "custom":
        if (customDateRange.from && customDateRange.to) {
          return { startDate: customDateRange.from, endDate: customDateRange.to };
        }
        return { startDate: null, endDate: null };
      default: {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const qEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
        return { startDate: qStart, endDate: qEnd };
      }
    }
  }, [datePreset, customDateRange]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange.startDate || !dateRange.endDate) return "All Time";
    return `${format(dateRange.startDate, "MMM d, yyyy")} – ${format(dateRange.endDate, "MMM d, yyyy")}`;
  }, [dateRange]);

  const presetLabels: Record<string, string> = {
    this_quarter: "This Quarter",
    last_quarter: "Last Quarter",
    ytd: "Year to Date",
    last_12: "Last 12 Months",
    all_time: "All Time",
    custom: "Custom",
  };

  // Fetch grants
  const { data: grantsData, isLoading: grantsLoading } = useQuery<{ grants: Grant[] }>({
    queryKey: ['/api/grants'],
  });

  const metricsQueryParams = useMemo(() => {
    if (dateRange.startDate && dateRange.endDate) {
      return `?startDate=${format(dateRange.startDate, 'yyyy-MM-dd')}&endDate=${format(dateRange.endDate, 'yyyy-MM-dd')}`;
    }
    return '';
  }, [dateRange]);

  const { data: metricsData, isLoading: metricsLoading } = useQuery<GrantMetrics>({
    queryKey: ['/api/grants/metrics', metricsQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/grants/metrics${metricsQueryParams}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: activeTab === 'overview',
  });

  // Fetch documents
  const { data: documentsData, isLoading: documentsLoading } = useQuery<{ documents: any[] }>({
    queryKey: ['/api/grants/documents'],
    enabled: activeTab === 'documents',
  });

  // Fetch success stories
  const { data: storiesData, isLoading: storiesLoading } = useQuery<{ animals: SuccessStoryAnimal[] }>({
    queryKey: ['/api/grants/success-stories', storyTagFilter],
    queryFn: async () => {
      const url = storyTagFilter && storyTagFilter !== 'all' 
        ? `/api/grants/success-stories?tag=${encodeURIComponent(storyTagFilter)}`
        : '/api/grants/success-stories';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch success stories');
      }
      return response.json();
    },
    enabled: activeTab === 'stories',
  });

  // Fetch budget report
  const { data: budgetData, isLoading: budgetLoading } = useQuery<{ grants: BudgetGrant[] }>({
    queryKey: ['/api/grants/budget-report'],
    enabled: activeTab === 'budget',
  });

  // Fetch compliance data
  const { data: complianceData, isLoading: complianceLoading } = useQuery<{ compliance: any }>({
    queryKey: ['/api/grants/compliance'],
    enabled: activeTab === 'readiness',
  });

  // Data matrix state
  const [matrixStartDate, setMatrixStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [matrixEndDate, setMatrixEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-12-31`;
  });

  const { data: matrixData, isLoading: matrixLoading, refetch: refetchMatrix } = useQuery<any>({
    queryKey: ['/api/grants/data-matrix', matrixStartDate, matrixEndDate],
    queryFn: async () => {
      const res = await fetch(`/api/grants/data-matrix?startDate=${matrixStartDate}&endDate=${matrixEndDate}`);
      if (!res.ok) throw new Error('Failed to generate data matrix');
      return res.json();
    },
    enabled: false,
  });

  // Compliance update mutation
  const updateComplianceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', '/api/grants/compliance', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants/compliance'] });
      toast({ title: "Compliance updated" });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<z.infer<typeof insertGrantSchema>>({
    resolver: zodResolver(insertGrantSchema),
    defaultValues: {
      funderName: "",
      programName: "",
      funderWebsite: "",
      status: "researching",
      programArea: "unrestricted",
      notes: "",
    },
  });

  // Create grant mutation
  const createGrantMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertGrantSchema>) => {
      const response = await apiRequest('POST', '/api/grants', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      setCreateGrantOpen(false);
      form.reset();
      toast({
        title: "Grant created",
        description: "The grant has been added to your pipeline.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create grant",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update grant mutation
  const updateGrantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Grant> }) => {
      const response = await apiRequest('PATCH', `/api/grants/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      setEditingGrant(null);
      toast({
        title: "Grant updated",
        description: "Changes have been saved.",
      });
    },
  });

  // Delete grant mutation
  const deleteGrantMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/grants/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants'] });
      toast({
        title: "Grant deleted",
        description: "The grant has been removed.",
      });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/grants/documents/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/grants/documents'] });
      setDeleteDocumentId(null);
      toast({
        title: "Document deleted",
        description: "The document has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete document",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Document upload handler
  const handleDocumentUpload = async () => {
    if (!selectedFile || !documentForm.title || !documentForm.documentType) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields and select a file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingDocument(true);
    try {
      // Step 1: Get presigned upload URL
      const urlResponse = await apiRequest('POST', '/api/documents/upload-url', {});
      const { uploadUrl, objectPath } = await urlResponse.json();

      // Step 2: Upload file to object storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type || 'application/octet-stream',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Create document record
      const documentData = {
        title: documentForm.title,
        documentType: documentForm.documentType,
        grantId: documentForm.grantId || null,
        notes: documentForm.notes || null,
        fileUrl: objectPath,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      };

      const createResponse = await apiRequest('POST', '/api/grants/documents', documentData);
      if (!createResponse.ok) {
        throw new Error('Failed to create document record');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/grants/documents'] });
      toast({
        title: "Document uploaded",
        description: "The document has been added to your vault.",
      });

      // Reset form
      setUploadDocumentOpen(false);
      setDocumentForm({ title: "", documentType: "other", grantId: "", notes: "" });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingDocument(false);
    }
  };

  // Download document handler
  const handleDocumentDownload = async (doc: any) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = (data: z.infer<typeof insertGrantSchema>) => {
    if (editingGrant) {
      updateGrantMutation.mutate({ id: editingGrant.id, data });
    } else {
      createGrantMutation.mutate(data);
    }
  };

  const handleEdit = (grant: Grant) => {
    setEditingGrant(grant);
    form.reset({
      funderName: grant.funderName,
      programName: grant.programName,
      funderWebsite: grant.funderWebsite || "",
      status: grant.status,
      applicationDeadline: grant.applicationDeadline || undefined,
      amountRequested: grant.amountRequested || undefined,
      amountAwarded: grant.amountAwarded || undefined,
      awardDate: grant.awardDate || undefined,
      finalReportDeadline: grant.finalReportDeadline || undefined,
      finalReportSubmitted: grant.finalReportSubmitted,
      programArea: grant.programArea || "unrestricted",
      notes: grant.notes || "",
    });
    setCreateGrantOpen(true);
  };

  const grants = grantsData?.grants || [];
  const activeGrants = grants.filter(g => !['denied', 'completed'].includes(g.status));
  const metrics = metricsData;
  const documents = documentsData?.documents || [];
  const stories = storiesData?.animals || [];
  const budgetGrants = budgetData?.grants || [];

  // Group documents by type
  const boilerplateDocuments = documents.filter(d => !d.grantId);
  const grantSpecificDocuments = documents.filter(d => d.grantId);

  // Get unique story tags
  const allStoryTags = new Set<string>();
  stories.forEach(animal => {
    animal.storyTags?.forEach(tag => allStoryTags.add(tag));
  });

  return (
    <DashboardLayout
      title="Grant Management"
      description="Track grant applications, reporting metrics, and success stories"
    >
      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList data-testid="tabs-grants">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <TrendingUp className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="lifecycle" data-testid="tab-lifecycle">
              <Calendar className="h-4 w-4 mr-2" />
              Lifecycle
            </TabsTrigger>
            <TabsTrigger value="budget" data-testid="tab-budget">
              <DollarSign className="h-4 w-4 mr-2" />
              Budget Report
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="stories" data-testid="tab-stories">
              <Heart className="h-4 w-4 mr-2" />
              Success Stories
            </TabsTrigger>
            <TabsTrigger value="readiness" data-testid="tab-readiness">
              <Shield className="h-4 w-4 mr-2" />
              Readiness
            </TabsTrigger>
            <TabsTrigger value="data-matrix" data-testid="tab-data-matrix">
              <BarChart3 className="h-4 w-4 mr-2" />
              Data Matrix
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab - Reporting Metrics */}
          <TabsContent value="overview" className="space-y-6">
            <div className="flex flex-wrap items-center gap-2" data-testid="date-range-selector">
              {Object.entries(presetLabels).map(([key, label]) => (
                key !== "custom" ? (
                  <Button
                    key={key}
                    variant={datePreset === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDatePreset(key)}
                    data-testid={`btn-preset-${key}`}
                  >
                    {label}
                  </Button>
                ) : (
                  <Popover key={key} open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={datePreset === "custom" ? "default" : "outline"}
                        size="sm"
                        data-testid="btn-preset-custom"
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Custom
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarWidget
                        mode="range"
                        selected={customDateRange.from && customDateRange.to ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                        onSelect={(range: any) => {
                          if (range?.from && range?.to) {
                            setCustomDateRange({ from: range.from, to: range.to });
                            setDatePreset("custom");
                            setCustomPickerOpen(false);
                          } else if (range?.from) {
                            setCustomDateRange({ from: range.from, to: undefined });
                          }
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                )
              ))}
              <span className="text-sm text-muted-foreground ml-2" data-testid="text-date-range-label">
                {dateRangeLabel}
              </span>
            </div>

            {metricsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : metrics ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card data-testid="card-total-intake">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Intake</CardTitle>
                      <PawPrint className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-total-intake">
                        {metrics.animalStatistics.totalIntake}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        animals received
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-adoptions">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Adoptions</CardTitle>
                      <Heart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-adoptions">
                        {metrics.animalStatistics.adoptions}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        animals adopted
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-grants-awarded">
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Grants Awarded</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-grants-awarded">
                        ${metrics.financial.totalAwarded}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ${metrics.financial.totalRequested} requested
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-volunteer-hours">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Volunteer Hours</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-volunteer-hours">
                        {metrics.operational.totalVolunteerHours}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {metrics.operational.activeFosterHomes} active foster homes
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card data-testid="card-animal-breakdown">
                    <CardHeader>
                      <CardTitle>Animal Statistics</CardTitle>
                      <CardDescription>Breakdown by species and current status</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Dogs</span>
                          <span className="font-medium">{metrics.animalStatistics.bySpecies.dogs}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Cats</span>
                          <span className="font-medium">{metrics.animalStatistics.bySpecies.cats}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Other</span>
                          <span className="font-medium">{metrics.animalStatistics.bySpecies.other}</span>
                        </div>
                      </div>
                      <div className="pt-4 border-t space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">In Foster</span>
                          <span className="font-medium">{metrics.animalStatistics.currentInFoster}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">In Shelter</span>
                          <span className="font-medium">{metrics.animalStatistics.currentInShelter}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Avg Length of Stay</span>
                          <span className="font-medium">{metrics.animalStatistics.avgLengthOfStay} days</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Spay/Neuter Count</span>
                          <span className="font-medium">{metrics.animalStatistics.spayNeuterCount}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-financial-summary">
                    <CardHeader>
                      <CardTitle>Grant Financial Summary</CardTitle>
                      <CardDescription>Grant funding and expenses overview</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Total Awarded</span>
                          <span className="font-medium">${metrics.financial.totalAwarded}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Total Requested</span>
                          <span className="font-medium">${metrics.financial.totalRequested}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Total Expenses</span>
                          <span className="font-medium">${metrics.financial.totalExpenses}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Cost Per Animal</span>
                          <span className="font-medium">${metrics.financial.costPerAnimal}</span>
                        </div>
                      </div>
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Net Balance</span>
                          <span className="text-lg font-bold">
                            ${(parseFloat(metrics.financial.totalAwarded) - parseFloat(metrics.financial.totalExpenses)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* Lifecycle Tab - Grant Tracking */}
          <TabsContent value="lifecycle" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Active Grants</h3>
                <p className="text-sm text-muted-foreground">
                  {activeGrants.length} grant{activeGrants.length !== 1 ? 's' : ''} in pipeline
                </p>
              </div>
              <Button onClick={() => {
                setEditingGrant(null);
                form.reset();
                setCreateGrantOpen(true);
              }} data-testid="button-create-grant">
                <Plus className="h-4 w-4 mr-2" />
                Add Grant
              </Button>
            </div>

            {grantsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funder</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Program Area</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeGrants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No active grants. Click "Add Grant" to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeGrants.map((grant) => (
                        <TableRow key={grant.id} data-testid={`row-grant-${grant.id}`}>
                          <TableCell className="font-medium">{grant.funderName}</TableCell>
                          <TableCell>{grant.programName}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[grant.status]} data-testid={`badge-status-${grant.id}`}>
                              {grant.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {grant.amountAwarded 
                              ? `$${parseFloat(grant.amountAwarded).toLocaleString()}` 
                              : grant.amountRequested 
                              ? `$${parseFloat(grant.amountRequested).toLocaleString()}` 
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {grant.applicationDeadline
                              ? format(new Date(grant.applicationDeadline), 'MMM d, yyyy')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {grant.programArea ? programAreaLabels[grant.programArea] : '-'}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(grant)}
                              data-testid={`button-edit-${grant.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this grant?')) {
                                  deleteGrantMutation.mutate(grant.id);
                                }
                              }}
                              data-testid={`button-delete-${grant.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Budget Report Tab */}
          <TabsContent value="budget" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Budget Report</h3>
                <p className="text-sm text-muted-foreground">
                  Track grant expenditures and budget utilization
                </p>
              </div>
            </div>

            {budgetLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : budgetGrants.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center space-y-2">
                    <DollarSign className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-lg font-medium">No Awarded Grants Yet</p>
                    <p className="text-sm text-muted-foreground">
                      Budget tracking will appear here once you have awarded grants with expenditures.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Accordion type="single" collapsible className="space-y-4">
                  {budgetGrants.map((grant) => (
                    <AccordionItem 
                      key={grant.id} 
                      value={grant.id} 
                      className="border rounded-lg"
                      data-testid={`accordion-grant-${grant.id}`}
                    >
                      <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex-1 text-left">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-base" data-testid={`text-grant-name-${grant.id}`}>
                                {grant.name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {grant.funderName}
                              </p>
                            </div>
                            <div className="flex gap-8 shrink-0">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Awarded</p>
                                <p className="font-semibold" data-testid={`text-awarded-${grant.id}`}>
                                  ${parseFloat(grant.amountAwarded).toLocaleString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Spent</p>
                                <p className="font-semibold" data-testid={`text-spent-${grant.id}`}>
                                  ${grant.totalSpent.toLocaleString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Remaining</p>
                                <p className={`font-semibold ${grant.remaining < 0 ? 'text-red-500' : ''}`} data-testid={`text-remaining-${grant.id}`}>
                                  ${grant.remaining.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Budget Utilization</span>
                              <span className="font-medium" data-testid={`text-percent-used-${grant.id}`}>
                                {grant.percentUsed.toFixed(1)}%
                              </span>
                            </div>
                            <Progress 
                              value={Math.min(grant.percentUsed, 100)} 
                              className="h-2" 
                              data-testid={`progress-${grant.id}`}
                            />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium">Expenditures</h5>
                            <span className="text-sm text-muted-foreground">
                              {grant.expenditures.length} transaction{grant.expenditures.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {grant.expenditures.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              No expenditures recorded for this grant yet.
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Vendor</TableHead>
                                  <TableHead>Category</TableHead>
                                  <TableHead>Amount</TableHead>
                                  <TableHead>Notes</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {grant.expenditures.map((exp) => (
                                  <TableRow key={exp.id} data-testid={`row-expenditure-${exp.id}`}>
                                    <TableCell>
                                      {format(new Date(exp.date), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="font-medium">{exp.vendor}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {exp.category.replace('_', ' ')}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      ${exp.amount.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {exp.notes || '-'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Document Vault</h3>
                <p className="text-sm text-muted-foreground">
                  Organize boilerplate and grant-specific documents
                </p>
              </div>
              <Button onClick={() => setUploadDocumentOpen(true)} data-testid="button-upload-document">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>

            {documentsLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Boilerplate Documents</CardTitle>
                    <CardDescription>Reusable documents for multiple grant applications</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {boilerplateDocuments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No boilerplate documents yet. Upload documents like your 501(c)(3) letter, board list, and mission statement.
                      </p>
                    ) : (
                      <Accordion type="single" collapsible>
                        {['501c3_letter', 'board_list', 'budget', 'financial_statement', 'mission_statement', 'other'].map((type) => {
                          const typeDocs = boilerplateDocuments.filter(d => d.documentType === type);
                          if (typeDocs.length === 0) return null;
                          
                          return (
                            <AccordionItem key={type} value={type}>
                              <AccordionTrigger>
                                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ({typeDocs.length})
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2">
                                  {typeDocs.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between p-2 border rounded-md" data-testid={`doc-${doc.id}`}>
                                      <div className="flex items-center gap-3">
                                        <FileText className="h-4 w-4" />
                                        <div>
                                          <p className="text-sm font-medium">{doc.title}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {doc.uploadedByName} • {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                                            {doc.fileSize && ` • ${(doc.fileSize / 1024).toFixed(0)} KB`}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          onClick={() => handleDocumentDownload(doc)}
                                          data-testid={`button-download-${doc.id}`}
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          onClick={() => setDeleteDocumentId(doc.id)}
                                          data-testid={`button-delete-${doc.id}`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>

                {grantSpecificDocuments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Grant-Specific Documents</CardTitle>
                      <CardDescription>Documents tied to individual grant applications</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {grantSpecificDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-2 border rounded-md" data-testid={`doc-grant-${doc.id}`}>
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4" />
                              <div>
                                <p className="text-sm font-medium">{doc.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {doc.uploadedByName} • {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                                  {doc.fileSize && ` • ${(doc.fileSize / 1024).toFixed(0)} KB`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDocumentDownload(doc)}
                                data-testid={`button-download-grant-${doc.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setDeleteDocumentId(doc.id)}
                                data-testid={`button-delete-grant-${doc.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Success Stories Tab */}
          <TabsContent value="stories" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Success Story Finder</h3>
                <p className="text-sm text-muted-foreground">
                  Animals flagged for grant narratives and reports
                </p>
              </div>
              <Select value={storyTagFilter} onValueChange={setStoryTagFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-story-filter">
                  <SelectValue placeholder="Filter by tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stories</SelectItem>
                  {Array.from(allStoryTags).map((tag) => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {storiesLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : stories.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    No success stories flagged yet. Go to the Animals page to flag animals for grant narratives.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {stories.map((animal) => (
                  <Card key={animal.id} data-testid={`card-story-${animal.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{animal.name}</CardTitle>
                          <CardDescription>
                            {animal.species} • {animal.status}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">Success Story</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {animal.storyTags && animal.storyTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {animal.storyTags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Recent Notes:</p>
                        <ScrollArea className="h-32">
                          {animal.recentNotes && animal.recentNotes.length > 0 ? (
                            <div className="space-y-2">
                              {animal.recentNotes.slice(0, 3).map((note) => (
                                <div key={note.id} className="text-sm p-2 bg-muted rounded-md">
                                  <p>{note.note}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(new Date(note.createdAt), 'MMM d, yyyy')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No recent notes</p>
                          )}
                        </ScrollArea>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
                        <span>
                          Intake: {animal.intakeDate ? format(new Date(animal.intakeDate), 'MMM d, yyyy') : 'N/A'}
                        </span>
                        {animal.adoptionDate && (
                          <span>
                            Adopted: {format(new Date(animal.adoptionDate), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Readiness Tab - Compliance Tracker */}
          <TabsContent value="readiness" className="space-y-6">
            {complianceLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <ReadinessTab
                compliance={complianceData?.compliance}
                onUpdate={(data: any) => updateComplianceMutation.mutate(data)}
                isPending={updateComplianceMutation.isPending}
              />
            )}
          </TabsContent>

          {/* Data Matrix Tab */}
          <TabsContent value="data-matrix" className="space-y-6">
            <DataMatrixTab
              startDate={matrixStartDate}
              endDate={matrixEndDate}
              onStartDateChange={setMatrixStartDate}
              onEndDateChange={setMatrixEndDate}
              matrixData={matrixData}
              isLoading={matrixLoading}
              onGenerate={() => refetchMatrix()}
            />
          </TabsContent>
        </Tabs>

        {/* Create/Edit Grant Dialog */}
        <Dialog open={createGrantOpen} onOpenChange={setCreateGrantOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingGrant ? 'Edit Grant' : 'Create New Grant'}</DialogTitle>
              <DialogDescription>
                {editingGrant ? 'Update grant information' : 'Add a new grant to your pipeline'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="funderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Funder Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="PetSmart Charities" {...field} data-testid="input-funder-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="programName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Fall 2026 Grant" {...field} data-testid="input-program-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="funderWebsite"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Funder Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} data-testid="input-funder-website" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="researching">Researching</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="submitted">Submitted</SelectItem>
                            <SelectItem value="awarded">Awarded</SelectItem>
                            <SelectItem value="denied">Denied</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="programArea"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program Area</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-program-area">
                              <SelectValue placeholder="Select area" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(programAreaLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amountRequested"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Requested</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="25000.00"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value || ''}
                            data-testid="input-amount-requested"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amountAwarded"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Awarded</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="25000.00"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value || ''}
                            data-testid="input-amount-awarded"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="applicationDeadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Application Deadline</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                            data-testid="input-application-deadline"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="finalReportDeadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Report Deadline</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                            data-testid="input-final-report-deadline"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add notes about this grant..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="textarea-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateGrantOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createGrantMutation.isPending || updateGrantMutation.isPending}
                    data-testid="button-submit-grant"
                  >
                    {(createGrantMutation.isPending || updateGrantMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingGrant ? 'Save Changes' : 'Create Grant'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Document Upload Dialog */}
        <Dialog open={uploadDocumentOpen} onOpenChange={(open) => {
          setUploadDocumentOpen(open);
          if (!open) {
            setDocumentForm({ title: "", documentType: "other", grantId: "", notes: "" });
            setSelectedFile(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Add a document to your grant vault. Documents can be boilerplate (reusable) or tied to a specific grant.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="document-title">Document Title *</Label>
                <Input
                  id="document-title"
                  placeholder="e.g., 2024 Form 990"
                  value={documentForm.title}
                  onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                  data-testid="input-document-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select
                  value={documentForm.documentType}
                  onValueChange={(value) => setDocumentForm({ ...documentForm, documentType: value })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(documentTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Associated Grant (Optional)</Label>
                <Select
                  value={documentForm.grantId}
                  onValueChange={(value) => setDocumentForm({ ...documentForm, grantId: value })}
                >
                  <SelectTrigger data-testid="select-document-grant">
                    <SelectValue placeholder="Boilerplate (no specific grant)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Boilerplate (no specific grant)</SelectItem>
                    {grants.map((grant) => (
                      <SelectItem key={grant.id} value={grant.id}>
                        {grant.programName} - {grant.funderName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave empty for reusable boilerplate documents like 501(c)(3) letters
                </p>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes about this document..."
                  value={documentForm.notes}
                  onChange={(e) => setDocumentForm({ ...documentForm, notes: e.target.value })}
                  data-testid="textarea-document-notes"
                />
              </div>

              <div className="space-y-2">
                <Label>File *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    data-testid="input-document-file"
                    className="cursor-pointer"
                  />
                </div>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadDocumentOpen(false)}
                disabled={isUploadingDocument}
                data-testid="button-cancel-upload"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDocumentUpload}
                disabled={!selectedFile || !documentForm.title || !documentForm.documentType || isUploadingDocument}
                data-testid="button-submit-upload"
              >
                {isUploadingDocument ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Document Confirmation */}
        <AlertDialog open={!!deleteDocumentId} onOpenChange={(open) => !open && setDeleteDocumentId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Document</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this document? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteDocumentId && deleteDocumentMutation.mutate(deleteDocumentId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteDocumentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

function getDeadlineStatus(date: string | Date | null | undefined): { label: string; variant: "destructive" | "outline" | "default"; icon: any } {
  if (!date) return { label: "Not Set", variant: "outline" as const, icon: XCircle };
  const now = new Date();
  const due = new Date(date);
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return { label: `${Math.abs(daysUntil)} days overdue`, variant: "destructive" as const, icon: XCircle };
  if (daysUntil <= 30) return { label: `Due in ${daysUntil} days`, variant: "default" as const, icon: AlertTriangle };
  return { label: `Due ${format(due, "MMM d, yyyy")}`, variant: "outline" as const, icon: CheckCircle2 };
}

function ReadinessTab({ compliance, onUpdate, isPending }: { compliance: any; onUpdate: (data: any) => void; isPending: boolean }) {
  const deadlines = [
    { key: "irs990DueDate", label: "IRS Form 990 Filing", description: "Annual tax-exempt filing deadline" },
    { key: "stateCharityRenewalDate", label: "State Charity Registration", description: "Annual state charity renewal" },
    { key: "agLicenseExpiration", label: "Agriculture License", description: "State agriculture department license" },
  ];

  const documents = [
    { key: "hasIrsDeterminationLetter", label: "IRS Determination Letter", description: "501(c)(3) tax-exempt status letter" },
    { key: "hasW9", label: "W-9 Form", description: "Request for Taxpayer Identification Number" },
    { key: "hasBoardList", label: "Board of Directors List", description: "Current board members with titles" },
  ];

  const totalItems = deadlines.length + documents.length;
  let compliantCount = 0;
  deadlines.forEach(d => {
    const val = compliance?.[d.key];
    if (val) {
      const daysUntil = Math.ceil((new Date(val).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil > 0) compliantCount++;
    }
  });
  documents.forEach(d => {
    if (compliance?.[d.key]) compliantCount++;
  });
  const readinessScore = totalItems > 0 ? Math.round((compliantCount / totalItems) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card data-testid="card-readiness-score">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Grant Readiness Score
          </CardTitle>
          <CardDescription>Overall compliance status for national grant eligibility</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold" data-testid="text-readiness-score">{readinessScore}%</div>
            <Progress value={readinessScore} className="flex-1" />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {compliantCount} of {totalItems} items compliant
          </p>
        </CardContent>
      </Card>

      <Card data-testid="card-deadlines">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Compliance Deadlines
          </CardTitle>
          <CardDescription>Track critical filing and renewal deadlines</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deadlines.map((item) => {
            const currentValue = compliance?.[item.key];
            const status = getDeadlineStatus(currentValue);
            const StatusIcon = status.icon;
            return (
              <div key={item.key} className="flex items-center justify-between gap-4 p-4 rounded-lg border" data-testid={`deadline-${item.key}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <StatusIcon className={`h-5 w-5 shrink-0 ${status.variant === 'destructive' ? 'text-destructive' : status.variant === 'default' ? 'text-yellow-500' : 'text-green-500'}`} />
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={status.variant} data-testid={`badge-status-${item.key}`}>{status.label}</Badge>
                  <Input
                    type="date"
                    className="w-40"
                    value={currentValue ? new Date(currentValue).toISOString().split('T')[0] : ""}
                    onChange={(e) => onUpdate({ [item.key]: e.target.value || null })}
                    disabled={isPending}
                    data-testid={`input-date-${item.key}`}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card data-testid="card-document-vault">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Document Vault
          </CardTitle>
          <CardDescription>Essential documents required for grant applications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.map((item) => {
            const hasDoc = !!compliance?.[item.key];
            return (
              <div key={item.key} className="flex items-center justify-between gap-4 p-4 rounded-lg border" data-testid={`document-${item.key}`}>
                <div className="flex items-center gap-3">
                  {hasDoc ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Button
                  variant={hasDoc ? "outline" : "default"}
                  size="sm"
                  onClick={() => onUpdate({ [item.key]: !hasDoc })}
                  disabled={isPending}
                  data-testid={`button-toggle-${item.key}`}
                >
                  {hasDoc ? "Mark Missing" : "Mark On File"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

const intakeTypeLabels: Record<string, string> = {
  stray: "Stray / At-Large",
  owner_surrender: "Owner Surrender",
  transfer: "Transfer In",
  born_in_care: "Born in Care",
  other: "Other",
  unknown: "Unknown",
};

const outcomeStatusLabels: Record<string, string> = {
  adopted: "Adopted",
  returned_to_owner: "Returned to Owner",
  transported: "Transferred / Transported",
  deceased: "Died in Care / Euthanized",
  returned_to_field: "Returned to Field (TNR)",
};

function DataMatrixTab({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  matrixData,
  isLoading,
  onGenerate,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  matrixData: any;
  isLoading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card data-testid="card-data-matrix-controls">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Shelter Animals Count - Grant Data Matrix
          </CardTitle>
          <CardDescription>Generate aggregated intake/outcome statistics for grant reporting periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => onStartDateChange(e.target.value)} className="w-44" data-testid="input-matrix-start" />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => onEndDateChange(e.target.value)} className="w-44" data-testid="input-matrix-end" />
            </div>
            <Button onClick={onGenerate} disabled={isLoading} data-testid="button-generate-matrix">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              Generate Grant Data Matrix
            </Button>
          </div>
        </CardContent>
      </Card>

      {matrixData && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="card-total-intakes">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Intakes</CardTitle>
                <PawPrint className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-intakes">{matrixData.intake.total}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-total-outcomes">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Outcomes</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-outcomes">{matrixData.outcomes.total}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-live-release-rate">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Live Release Rate</CardTitle>
                <Heart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-live-release-rate">{matrixData.liveReleaseRate}%</div>
                <Progress value={matrixData.liveReleaseRate} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card data-testid="card-intake-breakdown">
              <CardHeader>
                <CardTitle>Intake Breakdown</CardTitle>
                <CardDescription>Animals received by intake type</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Intake Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(matrixData.intake.byType).length > 0 ? (
                      Object.entries(matrixData.intake.byType)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([type, count]) => (
                          <TableRow key={type} data-testid={`row-intake-${type}`}>
                            <TableCell>{intakeTypeLabels[type] || type}</TableCell>
                            <TableCell className="text-right font-medium">{count as number}</TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No intake data for this period</TableCell></TableRow>
                    )}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{matrixData.intake.total}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {Object.keys(matrixData.intake.bySpecies || {}).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-muted-foreground mb-2">By Species</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(matrixData.intake.bySpecies).map(([species, count]) => (
                        <Badge key={species} variant="outline" data-testid={`badge-species-${species}`}>
                          {species}: {count as number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-outcome-breakdown">
              <CardHeader>
                <CardTitle>Outcome Breakdown</CardTitle>
                <CardDescription>Animals dispositioned by outcome type</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Outcome Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(matrixData.outcomes.byStatus).length > 0 ? (
                      Object.entries(matrixData.outcomes.byStatus)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([status, count]) => (
                          <TableRow key={status} data-testid={`row-outcome-${status}`}>
                            <TableCell>{outcomeStatusLabels[status] || status}</TableCell>
                            <TableCell className="text-right font-medium">{count as number}</TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No outcome data for this period</TableCell></TableRow>
                    )}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{matrixData.outcomes.total}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
