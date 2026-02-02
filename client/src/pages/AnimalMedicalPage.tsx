import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import MedicalTransferPacket from "@/components/MedicalTransferPacket";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  AlertCircle, 
  Pill, 
  Stethoscope, 
  Syringe, 
  TestTube, 
  Scissors,
  FileText,
  Calendar,
  Clock,
  Receipt,
  FolderOpen,
  Upload,
  Download,
  Trash2,
  File,
  Loader2,
  Eye,
  HardDrive,
  ExternalLink,
  Cpu,
  Copy,
  Check,
  Edit,
  Shield,
  Plus,
  Star,
  Zap
} from "lucide-react";
import { useGooglePicker, PickerDocument } from "@/hooks/useGooglePicker";
import { format } from "date-fns";
import { AddVaccineDialog } from "@/components/AddVaccineDialog";
import { AddDiagnosticDialog } from "@/components/AddDiagnosticDialog";
import { AddProcedureDialog } from "@/components/AddProcedureDialog";
import { AddPrescriptionDialog } from "@/components/AddPrescriptionDialog";
import { AddMedicalBillDialog } from "@/components/AddMedicalBillDialog";
import { AddExamDialog } from "@/components/AddExamDialog";
import { MedicalFileUploadDialog } from "@/components/MedicalFileUploadDialog";
import { AddMicrochipDialog } from "@/components/AddMicrochipDialog";
import { AddPreventativeCareDialog } from "@/components/AddPreventativeCareDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { useTenant } from "@/contexts/TenantContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MedicalFileItem {
  id: string;
  animalId: string;
  tenantId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  fileSize: number | null;
  description: string | null;
  uploadedBy: string | null;
  uploadDate: string;
}

interface DriveFileItem {
  id: string;
  animalId: string;
  tenantId: string;
  driveFileId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  iconLink: string | null;
  attachedBy: string | null;
  attachedAt: string;
}

interface GoogleWorkspaceStatus {
  connected: boolean;
  features?: {
    useDrive?: boolean;
    sharedDriveId?: string;
    sharedDriveName?: string;
  };
}

export default function AnimalMedicalPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const [, navigate] = useLocation();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<any>(null);
  const [vaccineDialogOpen, setVaccineDialogOpen] = useState(false);
  const [editingVaccine, setEditingVaccine] = useState<any>(null);
  const [diagnosticDialogOpen, setDiagnosticDialogOpen] = useState(false);
  const [editingDiagnostic, setEditingDiagnostic] = useState<any>(null);
  const [procedureDialogOpen, setProcedureDialogOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<any>(null);
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<any>(null);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [microchipDialogOpen, setMicrochipDialogOpen] = useState(false);
  const [editingMicrochip, setEditingMicrochip] = useState<any>(null);
  const [preventativeCareDialogOpen, setPreventativeCareDialogOpen] = useState(false);
  const [editingPreventativeCare, setEditingPreventativeCare] = useState<any>(null);
  const [copiedAdopterInfo, setCopiedAdopterInfo] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState('');
  const [applyingProtocol, setApplyingProtocol] = useState(false);

  // Fetch animal details
  const { data: animalData, isLoading: animalLoading } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}`],
    enabled: !!animalId,
  });

  const animal = animalData?.animal;

  // Fetch medical history
  const { data: historyData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/history`],
    enabled: !!animalId,
  });

  // Fetch exams
  const { data: examsData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/exams`],
    enabled: !!animalId,
  });

  // Fetch vaccines
  const { data: vaccinesData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/vaccines`],
    enabled: !!animalId,
  });

  // Fetch microchips
  const { data: microchipsData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/microchips`],
    enabled: !!animalId,
  });

  // Fetch preventative care records
  interface PreventativeCareRecord {
    id: string;
    careTypeId: string;
    dateAdministered: string;
    nextDueDate: string | null;
    administeredBy: string | null;
    notes: string | null;
    lotNumber: string | null;
    manufacturer: string | null;
  }
  interface PreventativeCareType {
    id: string;
    name: string;
    category: string;
    isCore: boolean;
    defaultIntervalDays: number | null;
  }
  const { data: preventativeCareData } = useQuery<{ records: PreventativeCareRecord[] }>({
    queryKey: [`/api/animals/${animalId}/preventative-care`],
    enabled: !!animalId,
  });

  const { data: preventativeCareTypesData } = useQuery<{ types: PreventativeCareType[] }>({
    queryKey: ['/api/medical/preventative-care/types', { species: animal?.species || 'Dog' }],
    enabled: !!animal?.species,
  });

  const preventativeCareRecords = preventativeCareData?.records || [];
  const preventativeCareTypes = preventativeCareTypesData?.types || [];
  
  const getPreventativeCareTypeName = (typeId: string) => {
    const type = preventativeCareTypes.find(t => t.id === typeId);
    return type?.name || 'Unknown';
  };

  const getPreventativeCareType = (typeId: string) => {
    return preventativeCareTypes.find(t => t.id === typeId);
  };

  // Fetch diagnostics
  const { data: diagnosticsData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/diagnostics`],
    enabled: !!animalId,
  });

  // Fetch procedures
  const { data: proceduresData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/procedures`],
    enabled: !!animalId,
  });

  // Fetch prescriptions
  const { data: prescriptionsData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/prescriptions`],
    enabled: !!animalId,
  });

  // Fetch medical bills
  const { data: billsData } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}/medical/bills`],
    enabled: !!animalId,
  });

  // Fetch medical documents
  const { data: filesData, isLoading: isLoadingFiles } = useQuery<{ files: MedicalFileItem[] }>({
    queryKey: ['/api/animals', animalId, 'files'],
    enabled: !!animalId,
  });

  // Check Google Workspace connection status (must be before Drive files query)
  const { data: googleStatus } = useQuery<GoogleWorkspaceStatus>({
    queryKey: ['/api/google-workspace/status'],
  });

  const isDriveEnabled = googleStatus?.connected && googleStatus?.features?.useDrive;

  // Fetch Google Drive files attached to this animal (only when Drive is enabled)
  const { data: driveFilesData, isLoading: isLoadingDriveFiles } = useQuery<{ files: DriveFileItem[] }>({
    queryKey: ['/api/animals', animalId, 'drive-files'],
    enabled: !!animalId && isDriveEnabled,
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest('DELETE', `/api/animals/${animalId}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'files'] });
      toast({
        title: "File deleted",
        description: "The document has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the file. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation to attach a Drive file
  const attachDriveFileMutation = useMutation({
    mutationFn: async (file: PickerDocument) => {
      await apiRequest('POST', `/api/animals/${animalId}/drive-files`, {
        driveFileId: file.id,
        fileName: file.name,
        fileUrl: file.url || `https://drive.google.com/file/d/${file.id}/view`,
        mimeType: file.mimeType,
        iconLink: file.iconUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'drive-files'] });
      toast({
        title: "File attached",
        description: "The Google Drive file has been linked to this animal.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to attach the file. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a Drive file attachment
  const deleteDriveFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest('DELETE', `/api/animals/${animalId}/drive-files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'drive-files'] });
      toast({
        title: "File removed",
        description: "The Google Drive file link has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove the file link. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Google Picker hook for file upload/selection (uses drive.file scope for CASA compliance)
  const { openPicker: openDrivePicker, isLoading: isPickerLoading } = useGooglePicker({
    mode: 'upload',
    title: 'Upload or Select a File',
    onFileUploaded: (file) => {
      attachDriveFileMutation.mutate(file);
    },
    onFileSelected: (file) => {
      attachDriveFileMutation.mutate(file);
    },
  });

  const medicalFiles = filesData?.files || [];
  const driveFiles = driveFilesData?.files || [];

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (animalLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading medical records...</p>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Animal not found</p>
      </div>
    );
  }

  const history = historyData?.history || [];
  const exams = examsData?.exams || [];
  const vaccines = vaccinesData?.vaccines || [];
  const microchips = microchipsData?.microchips || [];
  const diagnostics = diagnosticsData?.diagnostics || [];
  const procedures = proceduresData?.procedures || [];
  const prescriptions = prescriptionsData?.prescriptions || [];
  const bills = billsData?.bills || [];

  // Copy adopter info to clipboard
  const copyAdopterInfo = async () => {
    try {
      const response = await apiRequest(`/api/animals/${animalId}/microchips/adopter-info`);
      if (response.adopterInfo?.formatted) {
        await navigator.clipboard.writeText(response.adopterInfo.formatted);
        setCopiedAdopterInfo(true);
        setTimeout(() => setCopiedAdopterInfo(false), 2000);
        toast({
          title: "Copied!",
          description: "Adopter info copied to clipboard for microchip registration",
        });
      }
    } catch (error: any) {
      toast({
        title: "No Adopter Found",
        description: "No approved adoption application found for this animal",
        variant: "destructive",
      });
    }
  };

  // Get microchip status badge color
  const getMicrochipStatusBadge = (status: string) => {
    switch (status) {
      case 'transferred':
        return <Badge className="bg-green-500">Transferred</Badge>;
      case 'registered_rescue':
        return <Badge className="bg-blue-500">Registered to Rescue</Badge>;
      case 'found_unknown':
        return <Badge variant="secondary">Found - Unknown</Badge>;
      default:
        return <Badge variant="outline">Unregistered</Badge>;
    }
  };

  const breadcrumbs = [
    { label: "Animals", href: "/dashboard/animals" },
    { label: animal?.name || "Animal", href: `/dashboard/animals` },
    { label: "Medical Records" }
  ];

  return (
    <DashboardLayout breadcrumbs={breadcrumbs}>
      <div className="h-full overflow-auto">
        <div className="container mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/animals')}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl md:text-3xl font-bold" data-testid="text-page-title">
                    {animal.name} - Medical Records
                  </h1>
                  {animal.animalId && (
                    <Badge variant="outline" className="text-sm md:text-base font-mono">
                      {animal.animalId}
                    </Badge>
                  )}
                </div>
                <p className="text-sm md:text-base text-muted-foreground">
                  {animal.species} • {animal.breed}
                </p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <MedicalTransferPacket 
                animalId={animalId} 
                animalName={animal?.name || 'Animal'}
              />
              <Button
                onClick={() => window.open(`${basePath}/dashboard/animals/${animalId}/health-record`, '_blank')}
                data-testid="button-print-records"
                className="w-full md:w-auto"
              >
                <FileText className="w-4 h-4 mr-2" />
                Print Health Record
              </Button>
            </div>
          </div>
        </div>

        {/* Medical Alerts */}
        {animal.medicalAlertMemo && (
          <Card className="border-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                Medical Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{animal.medicalAlertMemo}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="glance" className="w-full">
          <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
            <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-10 gap-1">
              <TabsTrigger value="glance" data-testid="tab-glance" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">At a Glance</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">History</TabsTrigger>
              <TabsTrigger value="exams" data-testid="tab-exams" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Exams</TabsTrigger>
              <TabsTrigger value="vaccines" data-testid="tab-vaccines" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Vaccines</TabsTrigger>
              <TabsTrigger value="diagnostics" data-testid="tab-diagnostics" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Diagnostics</TabsTrigger>
              <TabsTrigger value="procedures" data-testid="tab-procedures" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Procedures</TabsTrigger>
              <TabsTrigger value="medications" data-testid="tab-medications" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Meds</TabsTrigger>
              <TabsTrigger value="billing" data-testid="tab-billing" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Billing</TabsTrigger>
              <TabsTrigger value="preventative" data-testid="tab-preventative" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">Preventative</TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents" className="whitespace-nowrap text-xs md:text-sm px-3 md:px-4">
                <FolderOpen className="w-4 h-4 mr-1" />
                Docs
              </TabsTrigger>
            </TabsList>
          </div>

          {/* At a Glance Tab */}
          <TabsContent value="glance" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Animal Photo */}
                  <div className="flex justify-center">
                    <Avatar className="w-32 h-32" data-testid="img-animal-thumbnail">
                      <AvatarImage 
                        src={animal.photoUrls?.[0]} 
                        alt={animal.name}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-2xl">
                        {animal.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    {animal.animalId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-medium font-mono text-sm">{animal.animalId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gender:</span>
                      <span className="font-medium">{animal.petfinderGender || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Neutered:</span>
                      <span className="font-medium">{animal.neuterStatus || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date of Birth:</span>
                      <span className="font-medium">
                        {animal.dateOfBirth ? format(new Date(animal.dateOfBirth), 'MMM d, yyyy') : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Microchip:</span>
                      <span className="font-medium text-xs">{animal.microchipNumber || 'None'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Exams */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Stethoscope className="w-4 h-4" />
                    Recent Exams
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {exams.length > 0 ? (
                    <div className="space-y-3">
                      {exams.slice(0, 3).map((exam: any) => (
                        <div key={exam.id} className="text-sm">
                          <p className="font-medium">{format(new Date(exam.examDate), 'MMM d, yyyy')}</p>
                          <p className="text-muted-foreground truncate">
                            {exam.soapFields?.assessment || 'No assessment'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No exams recorded</p>
                  )}
                </CardContent>
              </Card>

              {/* Active Medications */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Pill className="w-4 h-4" />
                    Active Medications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {prescriptions.length > 0 ? (
                    <div className="space-y-3">
                      {prescriptions.filter((p: any) => !p.endDate || new Date(p.endDate) >= new Date()).slice(0, 3).map((rx: any) => (
                        <div key={rx.id} className="text-sm">
                          <p className="font-medium">{rx.medicationName}</p>
                          <p className="text-muted-foreground">{rx.dosage} - {rx.frequency}</p>
                          {rx.controlledSubstance && (
                            <Badge variant="destructive" className="text-xs mt-1">Controlled</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No active medications</p>
                  )}
                </CardContent>
              </Card>

              {/* Vaccine Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Syringe className="w-4 h-4" />
                    Vaccine Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vaccines.length > 0 ? (
                    <div className="space-y-2">
                      {vaccines.slice(0, 3).map((vaccine: any) => (
                        <div key={vaccine.id} className="flex justify-between text-sm">
                          <span>{vaccine.vaccineName}</span>
                          <span className="text-muted-foreground">
                            {format(new Date(vaccine.dateGiven), 'MMM yyyy')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No vaccines recorded</p>
                  )}
                </CardContent>
              </Card>

              {/* Microchip Status */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Microchip
                    </CardTitle>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => { setEditingMicrochip(null); setMicrochipDialogOpen(true); }}
                      data-testid="button-add-microchip"
                    >
                      {microchips.length > 0 ? <Edit className="w-3 h-3" /> : 'Add'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {microchips.length > 0 ? (
                    <div className="space-y-3">
                      {microchips.slice(0, 1).map((chip: any) => (
                        <div key={chip.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm">{chip.microchipNumber}</span>
                            {getMicrochipStatusBadge(chip.registrationStatus)}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Manufacturer: {chip.manufacturer || 'Unknown'}</p>
                            {chip.implantDate && (
                              <p>Implanted: {format(new Date(chip.implantDate), 'MMM d, yyyy')}</p>
                            )}
                          </div>
                          {animal?.status === 'adopted' && chip.registrationStatus !== 'transferred' && (
                            <div className="pt-2 border-t">
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs"
                                onClick={copyAdopterInfo}
                                data-testid="button-copy-adopter-info"
                              >
                                {copiedAdopterInfo ? (
                                  <><Check className="w-3 h-3 mr-1" /> Copied!</>
                                ) : (
                                  <><Copy className="w-3 h-3 mr-1" /> Copy Reg Info for Transfer</>
                                )}
                              </Button>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-xs"
                            onClick={() => { setEditingMicrochip(chip); setMicrochipDialogOpen(true); }}
                            data-testid={`button-edit-microchip-${chip.id}`}
                          >
                            <Edit className="w-3 h-3 mr-1" /> Edit Details
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-sm text-muted-foreground mb-2">No microchip recorded</p>
                      <Button 
                        size="sm" 
                        onClick={() => { setEditingMicrochip(null); setMicrochipDialogOpen(true); }}
                        data-testid="button-add-microchip-empty"
                      >
                        <Cpu className="w-3 h-3 mr-1" /> Add Microchip
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Procedures */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Scissors className="w-4 h-4" />
                    Recent Procedures
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {procedures.length > 0 ? (
                    <div className="space-y-2">
                      {procedures.slice(0, 3).map((proc: any) => (
                        <div key={proc.id} className="text-sm">
                          <p className="font-medium">{proc.procedureName}</p>
                          <p className="text-muted-foreground">
                            {format(new Date(proc.procedureDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No procedures recorded</p>
                  )}
                </CardContent>
              </Card>

              {/* Lab Work */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TestTube className="w-4 h-4" />
                    Recent Lab Work
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {diagnostics.length > 0 ? (
                    <div className="space-y-2">
                      {diagnostics.slice(0, 3).map((test: any) => (
                        <div key={test.id} className="text-sm">
                          <p className="font-medium">{test.testName}</p>
                          <p className="text-muted-foreground">
                            {format(new Date(test.testDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No lab work recorded</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Medical History Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length > 0 ? (
                  <div className="space-y-4">
                    {history.map((entry: any, index: number) => (
                      <div key={index}>
                        <div className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="rounded-full bg-primary p-2">
                              {entry.type === 'exam' && <Stethoscope className="w-4 h-4 text-primary-foreground" />}
                              {entry.type === 'vaccine' && <Syringe className="w-4 h-4 text-primary-foreground" />}
                              {entry.type === 'diagnostic' && <TestTube className="w-4 h-4 text-primary-foreground" />}
                              {entry.type === 'procedure' && <Scissors className="w-4 h-4 text-primary-foreground" />}
                              {entry.type === 'prescription' && <Pill className="w-4 h-4 text-primary-foreground" />}
                            </div>
                            {index < history.length - 1 && (
                              <div className="w-0.5 bg-border flex-1 min-h-8" />
                            )}
                          </div>
                          <div className="flex-1 pb-8">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="capitalize">
                                {entry.type}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(entry.date), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <Card>
                              <CardContent className="pt-4">
                                {entry.type === 'exam' && (
                                  <div>
                                    <p className="font-medium mb-2">Veterinary Exam</p>
                                    {entry.data.soapFields && (
                                      <div className="space-y-2 text-sm">
                                        {entry.data.soapFields.subjective && (
                                          <p><span className="font-medium">S:</span> {entry.data.soapFields.subjective}</p>
                                        )}
                                        {entry.data.soapFields.assessment && (
                                          <p><span className="font-medium">A:</span> {entry.data.soapFields.assessment}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {entry.type === 'vaccine' && (
                                  <div>
                                    <p className="font-medium">{entry.data.vaccineName}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Administered by {entry.data.veterinarian || 'Unknown'}
                                    </p>
                                  </div>
                                )}
                                {entry.type === 'diagnostic' && (
                                  <div>
                                    <p className="font-medium">{entry.data.testName}</p>
                                    <p className="text-sm text-muted-foreground">{entry.data.testType}</p>
                                  </div>
                                )}
                                {entry.type === 'procedure' && (
                                  <div>
                                    <p className="font-medium">{entry.data.procedureName}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {entry.data.veterinarian || 'Unknown'}
                                    </p>
                                  </div>
                                )}
                                {entry.type === 'prescription' && (
                                  <div>
                                    <p className="font-medium">{entry.data.medicationName}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {entry.data.dosage} - {entry.data.frequency}
                                    </p>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No medical history recorded
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Medical Exams</h2>
              <Button onClick={() => { setEditingExam(null); setExamDialogOpen(true); }} data-testid="button-add-exam">
                <Stethoscope className="w-4 h-4 mr-2" />
                Add Exam
              </Button>
            </div>
            <div className="grid gap-4">
              {exams.map((exam: any) => (
                <Card key={exam.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {format(new Date(exam.examDate), 'MMMM d, yyyy')}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Veterinarian: {exam.veterinarian || 'Not specified'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingExam(exam);
                            setExamDialogOpen(true);
                          }}
                          data-testid={`button-edit-exam-${exam.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-exam-${exam.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {exam.soapFields && (
                      <div className="space-y-3">
                        {exam.soapFields.subjective && (
                          <div>
                            <p className="font-medium text-sm mb-1">Subjective (S):</p>
                            <p className="text-sm text-muted-foreground">{exam.soapFields.subjective}</p>
                          </div>
                        )}
                        {exam.soapFields.objective && (
                          <div>
                            <p className="font-medium text-sm mb-1">Objective (O):</p>
                            <p className="text-sm text-muted-foreground">{exam.soapFields.objective}</p>
                          </div>
                        )}
                        {exam.soapFields.assessment && (
                          <div>
                            <p className="font-medium text-sm mb-1">Assessment (A):</p>
                            <p className="text-sm text-muted-foreground">{exam.soapFields.assessment}</p>
                          </div>
                        )}
                        {exam.soapFields.plan && (
                          <div>
                            <p className="font-medium text-sm mb-1">Plan (P):</p>
                            <p className="text-sm text-muted-foreground">{exam.soapFields.plan}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {exams.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No medical exams recorded
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Vaccines Tab */}
          <TabsContent value="vaccines" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Vaccine Records</h2>
              <Button onClick={() => { setEditingVaccine(null); setVaccineDialogOpen(true); }} data-testid="button-add-vaccine">
                <Syringe className="w-4 h-4 mr-2" />
                Add Vaccine
              </Button>
            </div>
            <div className="grid gap-4">
              {vaccines.map((vaccine: any) => {
                const isExpired = vaccine.dueDate && new Date(vaccine.dueDate) < new Date();
                return (
                <Card key={vaccine.id} className={isExpired ? "border-destructive bg-destructive/5" : ""}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{vaccine.vaccineName}</CardTitle>
                          {isExpired && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Given: {format(new Date(vaccine.dateGiven), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingVaccine(vaccine);
                            setVaccineDialogOpen(true);
                          }}
                          data-testid={`button-edit-vaccine-${vaccine.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-vaccine-${vaccine.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground block">Due Date</span>
                        <span className={`font-medium ${isExpired ? "text-destructive" : ""}`}>
                          {vaccine.dueDate ? format(new Date(vaccine.dueDate), 'MMM d, yyyy') : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Lot Number</span>
                        <span className="font-medium">{vaccine.lotNumber || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Manufacturer</span>
                        <span className="font-medium">{vaccine.manufacturer || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Administered By</span>
                        <span className="font-medium">{vaccine.veterinarian || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Clinic</span>
                        <span className="font-medium">{vaccine.clinicName || "In-House"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Injection Site</span>
                        <span className="font-medium">{vaccine.anatomicalSite || "—"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
              {vaccines.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No vaccine records
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Diagnostics Tab */}
          <TabsContent value="diagnostics" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Diagnostic Tests</h2>
              <Button onClick={() => { setEditingDiagnostic(null); setDiagnosticDialogOpen(true); }} data-testid="button-add-diagnostic">
                <TestTube className="w-4 h-4 mr-2" />
                Add Test
              </Button>
            </div>
            <div className="grid gap-4">
              {diagnostics.map((test: any) => (
                <Card key={test.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{test.testName}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {test.testType} • {format(new Date(test.testDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingDiagnostic(test);
                            setDiagnosticDialogOpen(true);
                          }}
                          data-testid={`button-edit-diagnostic-${test.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-diagnostic-${test.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {test.results && (
                      <div>
                        <p className="font-medium text-sm mb-1">Results:</p>
                        <p className="text-sm text-muted-foreground">{test.results}</p>
                      </div>
                    )}
                    {test.veterinarian && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Veterinarian:</span>
                        <span className="font-medium">{test.veterinarian}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {diagnostics.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No diagnostic tests recorded
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Procedures Tab */}
          <TabsContent value="procedures" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Procedures</h2>
              <Button onClick={() => { setEditingProcedure(null); setProcedureDialogOpen(true); }} data-testid="button-add-procedure">
                <Scissors className="w-4 h-4 mr-2" />
                Add Procedure
              </Button>
            </div>
            <div className="grid gap-4">
              {procedures.map((proc: any) => (
                <Card key={proc.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{proc.procedureName}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(new Date(proc.procedureDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingProcedure(proc);
                            setProcedureDialogOpen(true);
                          }}
                          data-testid={`button-edit-procedure-${proc.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-procedure-${proc.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {proc.veterinarian && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Veterinarian:</span>
                        <span className="font-medium">{proc.veterinarian}</span>
                      </div>
                    )}
                    {proc.cost && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="font-medium">${proc.cost}</span>
                      </div>
                    )}
                    {proc.outcome && (
                      <div>
                        <p className="font-medium text-sm mb-1">Outcome:</p>
                        <p className="text-sm text-muted-foreground">{proc.outcome}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {procedures.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No procedures recorded
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Medications Tab */}
          <TabsContent value="medications" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Medications & Prescriptions</h2>
              <Button onClick={() => { setEditingPrescription(null); setPrescriptionDialogOpen(true); }} data-testid="button-add-prescription">
                <Pill className="w-4 h-4 mr-2" />
                Add Prescription
              </Button>
            </div>
            <div className="grid gap-4">
              {prescriptions.map((rx: any) => (
                <Card key={rx.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{rx.medicationName}</CardTitle>
                          {rx.controlledSubstance && (
                            <Badge variant="destructive">Controlled</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rx.dosage} - {rx.frequency}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingPrescription(rx);
                            setPrescriptionDialogOpen(true);
                          }}
                          data-testid={`button-edit-prescription-${rx.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-prescription-${rx.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Start Date:</span>
                      <span className="font-medium">{format(new Date(rx.startDate), 'MMM d, yyyy')}</span>
                    </div>
                    {rx.endDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">End Date:</span>
                        <span className="font-medium">{format(new Date(rx.endDate), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                    {rx.prescribedBy && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Prescribed By:</span>
                        <span className="font-medium">{rx.prescribedBy}</span>
                      </div>
                    )}
                    {rx.instructions && (
                      <div>
                        <p className="font-medium text-sm mb-1">Instructions:</p>
                        <p className="text-sm text-muted-foreground">{rx.instructions}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {prescriptions.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No prescriptions recorded
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                <h2 className="text-xl font-semibold">Medical Bills</h2>
              </div>
              <Button
                onClick={() => { setEditingBill(null); setBillDialogOpen(true); }}
                data-testid="button-add-bill"
              >
                Add Bill
              </Button>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {bills.map((bill: any) => (
                <Card key={bill.id} data-testid={`card-bill-${bill.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{bill.vendor}</CardTitle>
                          <Badge 
                            variant={
                              bill.paymentStatus === 'paid' ? 'default' :
                              bill.paymentStatus === 'partially_paid' ? 'secondary' :
                              bill.paymentStatus === 'insurance_pending' ? 'outline' :
                              'destructive'
                            }
                            data-testid={`badge-payment-status-${bill.id}`}
                          >
                            {bill.paymentStatus === 'paid' ? 'Paid' :
                             bill.paymentStatus === 'partially_paid' ? 'Partially Paid' :
                             bill.paymentStatus === 'insurance_pending' ? 'Insurance Pending' :
                             'Unpaid'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{bill.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingBill(bill);
                            setBillDialogOpen(true);
                          }}
                          data-testid={`button-edit-bill-${bill.id}`}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-bill-${bill.id}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bill Date:</span>
                      <span className="font-medium">{format(new Date(bill.billDate), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Amount:</span>
                      <span className="font-medium">${parseFloat(bill.amount).toFixed(2)}</span>
                    </div>
                    {bill.paidAmount && parseFloat(bill.paidAmount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Paid Amount:</span>
                        <span className="font-medium">${parseFloat(bill.paidAmount).toFixed(2)}</span>
                      </div>
                    )}
                    {bill.invoiceNumber && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Invoice #:</span>
                        <span className="font-medium font-mono text-xs">{bill.invoiceNumber}</span>
                      </div>
                    )}
                    {bill.notes && (
                      <div>
                        <p className="font-medium text-sm mb-1">Notes:</p>
                        <p className="text-sm text-muted-foreground">{bill.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {bills.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No medical bills recorded
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Preventative Care Tab */}
          <TabsContent value="preventative" className="space-y-4">
            {/* Medical Setup Card - Quick Protocol Application */}
            <Card className="bg-muted/50" data-testid="card-medical-setup">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Medical Quick Setup
                </CardTitle>
                <CardDescription>
                  Apply a standard protocol to quickly create multiple medical tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select
                    value={selectedProtocol}
                    onValueChange={setSelectedProtocol}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-protocol">
                      <SelectValue placeholder="Select a protocol..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adult_dog">Adult Dog Standard (Rabies, DHPP, Heartworm, Flea/Tick, Bordetella)</SelectItem>
                      <SelectItem value="puppy">Puppy Protocol (Dewormer, DHPP, Flea/Tick, Heartworm)</SelectItem>
                      <SelectItem value="adult_cat">Adult Cat Standard (Rabies, FVRCP, Heartworm, Flea/Tick)</SelectItem>
                      <SelectItem value="kitten">Kitten Protocol (Dewormer, FVRCP, Flea/Tick, Heartworm)</SelectItem>
                      <SelectItem value="intake_dog">Intake Default - Dog (Dewormer, Flea/Tick, HW Test, Microchip)</SelectItem>
                      <SelectItem value="intake_cat">Intake Default - Cat (Dewormer, Flea/Tick, FeLV/FIV Test, Microchip)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={async () => {
                      if (!selectedProtocol) {
                        toast({
                          title: 'Select a protocol',
                          description: 'Please choose a protocol from the dropdown first',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setApplyingProtocol(true);
                      try {
                        const res = await apiRequest('POST', `/api/animals/${animalId}/preventative-care/apply-protocol`, { 
                          protocolName: selectedProtocol,
                          dateAdministered: new Date().toISOString().split('T')[0] 
                        });
                        const response = await res.json();
                        if (response.created > 0) {
                          toast({
                            title: 'Protocol applied',
                            description: response.message,
                          });
                          queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/preventative-care`] });
                          setSelectedProtocol('');
                        } else {
                          toast({
                            title: 'All set',
                            description: response.message,
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: 'Error',
                          description: error.message || 'Failed to apply protocol',
                          variant: 'destructive',
                        });
                      } finally {
                        setApplyingProtocol(false);
                      }
                    }}
                    disabled={!selectedProtocol || applyingProtocol}
                    data-testid="button-apply-protocol"
                  >
                    {applyingProtocol ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Apply Protocol
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Preventative Care Records
              </h3>
              <Button
                onClick={() => {
                  setEditingPreventativeCare(null);
                  setPreventativeCareDialogOpen(true);
                }}
                data-testid="button-add-preventative-care"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
            </div>
            
            <div className="space-y-4">
              {preventativeCareRecords.map((record) => {
                const careType = getPreventativeCareType(record.careTypeId);
                const isOverdue = record.nextDueDate && new Date(record.nextDueDate) < new Date();
                const daysUntilDue = record.nextDueDate 
                  ? Math.ceil((new Date(record.nextDueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <Card 
                    key={record.id} 
                    className={isOverdue ? "border-destructive" : ""}
                    data-testid={`card-preventative-care-${record.id}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2">
                            {getPreventativeCareTypeName(record.careTypeId)}
                            {careType?.isCore && (
                              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            )}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Given: {format(new Date(record.dateAdministered), "MMM d, yyyy")}
                            {record.nextDueDate && (
                              <>
                                <span className="mx-2">|</span>
                                <Clock className="w-4 h-4" />
                                Next Due: {format(new Date(record.nextDueDate), "MMM d, yyyy")}
                              </>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOverdue && (
                            <Badge variant="destructive">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Overdue
                            </Badge>
                          )}
                          {!isOverdue && daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0 && (
                            <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                              Due in {daysUntilDue} days
                            </Badge>
                          )}
                          {careType && (
                            <Badge variant="outline">{careType.category}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingPreventativeCare(record);
                              setPreventativeCareDialogOpen(true);
                            }}
                            data-testid={`button-edit-preventative-${record.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {(record.administeredBy || record.notes || record.lotNumber || record.manufacturer) && (
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {record.administeredBy && (
                            <div>
                              <span className="text-muted-foreground">Administered By:</span>
                              <span className="ml-2">{record.administeredBy}</span>
                            </div>
                          )}
                          {record.lotNumber && (
                            <div>
                              <span className="text-muted-foreground">Lot #:</span>
                              <span className="ml-2">{record.lotNumber}</span>
                            </div>
                          )}
                          {record.manufacturer && (
                            <div>
                              <span className="text-muted-foreground">Manufacturer:</span>
                              <span className="ml-2">{record.manufacturer}</span>
                            </div>
                          )}
                          {record.notes && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Notes:</span>
                              <span className="ml-2">{record.notes}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
              {preventativeCareRecords.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No preventative care records yet</p>
                    <p className="text-sm mt-2">
                      Add vaccines, heartworm prevention, flea/tick treatments, and other preventative care items
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-semibold">Medical Documents</h3>
              <div className="flex items-center gap-2">
                {isDriveEnabled && (
                  <Button
                    variant="outline"
                    onClick={() => openDrivePicker()}
                    disabled={isPickerLoading || attachDriveFileMutation.isPending}
                    data-testid="button-upload-to-drive"
                  >
                    {isPickerLoading || attachDriveFileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload to Google Drive
                  </Button>
                )}
                <Button
                  onClick={() => setDocumentDialogOpen(true)}
                  data-testid="button-upload-document"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </div>

            {/* Google Drive Files Section */}
            {isDriveEnabled && driveFiles.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Google Drive Files
                </h4>
                {driveFiles.map((file) => (
                  <Card key={file.id} data-testid={`card-drive-file-${file.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1 flex items-center gap-3">
                          {file.iconLink ? (
                            <img src={file.iconLink} alt="" className="h-8 w-8 shrink-0" />
                          ) : (
                            <HardDrive className="h-8 w-8 text-muted-foreground shrink-0" />
                          )}
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {file.fileName}
                              <Badge variant="secondary" className="text-xs">Drive</Badge>
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              Attached {format(new Date(file.attachedAt), 'MMM d, yyyy h:mm a')}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(file.fileUrl, '_blank')}
                            title="Open in Google Drive"
                            data-testid={`button-open-drive-${file.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={deleteDriveFileMutation.isPending}
                                data-testid={`button-delete-drive-${file.id}`}
                              >
                                {deleteDriveFileMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Drive File Link</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove the link to "{file.fileName}"? This will not delete the file from Google Drive.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-cancel-delete-drive-${file.id}`}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteDriveFileMutation.mutate(file.id)}
                                  data-testid={`button-confirm-delete-drive-${file.id}`}
                                >
                                  Remove Link
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}

            {/* Uploaded Files Section */}
            {(isLoadingFiles || isLoadingDriveFiles) ? (
              <div className="flex justify-center py-8" data-testid="loading-documents">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : medicalFiles.length === 0 && driveFiles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground" data-testid="no-documents">
                  No documents uploaded for this animal
                </CardContent>
              </Card>
            ) : medicalFiles.length > 0 ? (
              <div className="space-y-3">
                {driveFiles.length > 0 && (
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Uploaded Files
                  </h4>
                )}
                {medicalFiles.map((file) => (
                  <Card key={file.id} data-testid={`card-document-${file.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1 flex items-center gap-3">
                          <File className="h-8 w-8 text-muted-foreground shrink-0" />
                          <div>
                            <CardTitle className="text-base">{file.fileName}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {formatFileSize(file.fileSize)} • {format(new Date(file.uploadDate), 'MMM d, yyyy h:mm a')}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(file.fileUrl, '_blank')}
                            title="View document"
                            data-testid={`button-view-${file.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = file.fileUrl;
                              link.download = file.fileName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            title="Download document"
                            data-testid={`button-download-${file.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={deleteFileMutation.isPending}
                                data-testid={`button-delete-${file.id}`}
                              >
                                {deleteFileMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{file.fileName}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-cancel-delete-${file.id}`}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteFileMutation.mutate(file.id)}
                                  data-testid={`button-confirm-delete-${file.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    {file.description && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground" data-testid={`text-description-${file.id}`}>
                          {file.description}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {animalId && (
        <>
          <AddExamDialog
            animalId={animalId}
            open={examDialogOpen}
            onOpenChange={(open) => {
              setExamDialogOpen(open);
              if (!open) setEditingExam(null);
            }}
            exam={editingExam}
          />
          <AddVaccineDialog
            animalId={animalId}
            open={vaccineDialogOpen}
            onOpenChange={(open) => {
              setVaccineDialogOpen(open);
              if (!open) setEditingVaccine(null);
            }}
            vaccine={editingVaccine}
          />
          <AddMicrochipDialog
            animalId={animalId}
            open={microchipDialogOpen}
            onOpenChange={(open) => {
              setMicrochipDialogOpen(open);
              if (!open) setEditingMicrochip(null);
            }}
            microchip={editingMicrochip}
          />
          <AddPreventativeCareDialog
            animalId={animalId}
            animalSpecies={animal?.species || 'Dog'}
            open={preventativeCareDialogOpen}
            onOpenChange={(open) => {
              setPreventativeCareDialogOpen(open);
              if (!open) setEditingPreventativeCare(null);
            }}
            record={editingPreventativeCare}
          />
          <AddDiagnosticDialog
            animalId={animalId}
            open={diagnosticDialogOpen}
            onOpenChange={(open) => {
              setDiagnosticDialogOpen(open);
              if (!open) setEditingDiagnostic(null);
            }}
            diagnostic={editingDiagnostic}
          />
          <AddProcedureDialog
            animalId={animalId}
            open={procedureDialogOpen}
            onOpenChange={(open) => {
              setProcedureDialogOpen(open);
              if (!open) setEditingProcedure(null);
            }}
            procedure={editingProcedure}
          />
          <AddPrescriptionDialog
            animalId={animalId}
            open={prescriptionDialogOpen}
            onOpenChange={(open) => {
              setPrescriptionDialogOpen(open);
              if (!open) setEditingPrescription(null);
            }}
            prescription={editingPrescription}
          />
          <AddMedicalBillDialog
            animalId={animalId}
            open={billDialogOpen}
            onOpenChange={(open) => {
              setBillDialogOpen(open);
              if (!open) setEditingBill(null);
            }}
            bill={editingBill}
          />
          <MedicalFileUploadDialog
            animalId={animalId}
            animalName={animal?.name || 'Animal'}
            open={documentDialogOpen}
            onOpenChange={setDocumentDialogOpen}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'files'] });
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
}
