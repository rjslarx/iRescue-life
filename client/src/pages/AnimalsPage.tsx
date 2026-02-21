import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAnimalSchema, type Animal, type Tenant, PETFINDER_TYPES, PETFINDER_AGES, PETFINDER_SIZES, PETFINDER_GENDERS, TERMINAL_STATUSES } from "@shared/schema";
import { PETFINDER_BREEDS, getBreedsForType, mapSpeciesToPetfinderType } from "@shared/petfinder-breeds";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Plus, Loader2, ExternalLink, Check, Stethoscope, Upload, X, ChevronLeft, ChevronRight, FileText, Pencil, ClipboardList, Calendar as CalendarIcon, ChevronDown, ChevronUp, Cat, Dog, Camera, Sparkles, Palette, ChevronsUpDown, AlertCircle, Wand2, FileUp, MapPin, Users, PawPrint, GitMerge, Heart, Send, ArrowUpDown, Home, Building2, Truck, History, ArrowRightLeft, Archive } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Link } from "wouter";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AssignFosterDialog } from "@/components/AssignFosterDialog";
import { AdoptionDialog } from "@/components/AdoptionDialog";
import { FinalizeAdoptionDialog } from "@/components/FinalizeAdoptionDialog";
import MarkDeceasedDialog from "@/components/MarkDeceasedDialog";
import { AnimalDetailsDialog } from "@/components/AnimalDetailsDialog";
import QuickAnimalPhoto from "@/components/QuickAnimalPhoto";
import DashboardLayout from "@/components/DashboardLayout";
import { AdCopyGeneratorDialog } from "@/components/AdCopyGeneratorDialog";
import { AiBioGeneratorDialog } from "@/components/AiBioGeneratorDialog";
import { MedicalImportDialog } from "@/components/MedicalImportDialog";
import { MedicalFundDialog } from "@/components/MedicalFundDialog";
import { HeartwormTreatmentModal } from "@/components/HeartwormTreatmentModal";
import { AnimalHudCard } from "@/components/AnimalHudCard";
import { TransferAnimalDialog } from "@/components/TransferAnimalDialog";

const MAX_PHOTOS = 6;
const MAX_PHOTO_SIZE_MB = 25;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;

const friendlyStatusEnum = z.enum(["yes", "no", "unknown"]);

const behaviorColorEnum = z.enum(["green", "yellow", "red", "purple"]);

const animalFormSchema = insertAnimalSchema.omit({ tenantId: true }).extend({
  // Petfinder-compliant primary fields (these drive the form)
  petfinderType: z.enum(PETFINDER_TYPES, { required_error: "Type is required" }),
  petfinderBreed: z.string().min(1, "Breed is required"),
  petfinderBreedSecondary: z.string().optional().nullable(),
  petfinderAge: z.enum(PETFINDER_AGES, { required_error: "Age category is required" }),
  petfinderSize: z.enum(PETFINDER_SIZES, { required_error: "Size is required" }),
  petfinderGender: z.enum(PETFINDER_GENDERS, { required_error: "Gender is required" }),
  
  // Derived fields (auto-populated from Petfinder fields on submit)
  age: z.string().optional().default(""),
  breed: z.string().optional().default(""),
  species: z.string().optional().default(""),
  
  // Core fields
  name: z.string().min(1, "Name is required"),
  bio: z.string().optional(),
  neuterStatus: z.enum(["intact", "neutered", "spayed", "unknown"]).optional(),
  dateOfBirth: z.date().optional().nullable(),
  microchipNumber: z.string().optional(),
  medicalAlertMemo: z.string().optional(),
  // Behavioral Safety Rating
  behaviorColor: behaviorColorEnum.default("green"),
  behaviorRestrictionReason: z.string().optional(),
  // Physical/Intake fields
  weight: z.string().optional(),
  intakeSource: z.enum(["stray", "owner_surrender", "transfer", "born_in_care", "other"]).optional(),
  intakeDate: z.date().optional().nullable(),
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  dietaryRestrictions: z.string().optional(),
  catFriendly: friendlyStatusEnum.optional(),
  dogFriendly: friendlyStatusEnum.optional(),
  childFriendly: friendlyStatusEnum.optional(),
  photoUrls: z.array(z.string()).optional().default([]),
  status: z.enum(["available", "adoption_pending", "transfer_pending", "medical_hold", "stray_hold", "adopted", "transported", "deceased"]).default("available"),
  postedToPetfinder: z.boolean().default(false),
  petfinderUrl: z.string().optional().refine((val) => !val || val === '' || z.string().url().safeParse(val).success, {
    message: "Must be a valid URL"
  }),
  petfinderSyncedAt: z.date().optional().nullable(),
  houseTrained: z.boolean().optional().nullable(),
  declawed: z.boolean().optional().nullable(),
  specialNeeds: z.boolean().optional().nullable(),
  shotsCurrent: z.boolean().optional().nullable(),
  heartwormPositive: z.boolean().optional().nullable(),
  medicalHold: z.boolean().optional().default(false),
  locationType: z.enum(["shelter", "foster", "clinic", "transport", "offsite"]).optional().default("shelter"),
  locationName: z.string().optional().default(""),
}).refine((data) => {
  // Require restriction reason for yellow or red behavior ratings
  if ((data.behaviorColor === "yellow" || data.behaviorColor === "red") && !data.behaviorRestrictionReason?.trim()) {
    return false;
  }
  return true;
}, {
  message: "Restriction reason is required for Yellow or Red safety ratings",
  path: ["behaviorRestrictionReason"],
});

type AnimalFormData = z.infer<typeof animalFormSchema>;

const mapSexToPetfinderGender = (sex: string | null | undefined): "Male" | "Female" | "Unknown" | undefined => {
  if (!sex) return undefined;
  const lower = sex.toLowerCase();
  if (lower === 'male') return 'Male';
  if (lower === 'female') return 'Female';
  if (lower === 'unknown') return 'Unknown';
  return undefined;
};

const mapAgeToPetfinderAge = (age: string | null | undefined): "Baby" | "Young" | "Adult" | "Senior" | undefined => {
  if (!age) return undefined;
  const lower = age.toLowerCase();
  if (lower.includes('baby') || lower.includes('kitten') || lower.includes('puppy') || lower.includes('newborn') || lower.includes('neonat')) return 'Baby';
  if (lower.includes('senior') || lower.includes('elderly') || lower.includes('geriatric')) return 'Senior';
  if (lower.includes('young') || lower.includes('juvenile') || lower.includes('adolescent')) return 'Young';
  if (lower.includes('adult')) return 'Adult';
  const ageMatch = lower.match(/(\d+)\s*(year|yr|month|mo|week|wk|day)/);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit.startsWith('year') || unit.startsWith('yr')) {
      if (num < 1) return 'Baby';
      if (num <= 2) return 'Young';
      if (num <= 7) return 'Adult';
      return 'Senior';
    }
    if (unit.startsWith('month') || unit.startsWith('mo')) {
      if (num <= 6) return 'Baby';
      return 'Young';
    }
    if (unit.startsWith('week') || unit.startsWith('wk') || unit.startsWith('day')) {
      return 'Baby';
    }
  }
  return undefined;
};

const booleanToFriendlyStatus = (value: boolean | null | undefined): "yes" | "no" | "unknown" => {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
};

const friendlyStatusToBoolean = (value: "yes" | "no" | "unknown" | undefined): boolean | null => {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
};

type KennelRow = {
  id: string;
  name: string;
  capacity: number;
  type: string;
};

type AnimalWithKennel = Animal & {
  kennelRowName?: string | null;
};

type KennelBuilding = {
  id: string;
  name: string;
  rows: KennelRow[];
};

type KennelOccupancy = {
  id: string;
  name: string;
  animalId: string;
  species: string;
  buildingId: string | null;
  rowId: string | null;
  position: number | null;
  status: string;
};

function AnimalForm({ 
  onSubmit, 
  isPending, 
  uploadedPhotos, 
  setUploadedPhotos,
  initialData,
  isEditing = false,
  surrenderPrefill,
}: { 
  onSubmit: (data: AnimalFormData) => void;
  isPending: boolean;
  uploadedPhotos: string[];
  setUploadedPhotos: (photos: string[]) => void;
  initialData?: Animal;
  isEditing?: boolean;
  surrenderPrefill?: any;
}) {
  const { toast } = useToast();
  
  const { data: enrichedAnimalData } = useQuery<any>({
    queryKey: ['/api/animals', initialData?.id],
    enabled: !!isEditing && !!initialData?.id,
  });
  
  const effectiveInitialData = useMemo(() => {
    if (enrichedAnimalData?.animal) {
      return { ...initialData, ...enrichedAnimalData.animal };
    }
    return initialData;
  }, [enrichedAnimalData, initialData]);

  // Fetch buildings with rows for kennel location dropdown
  const { data: buildingsData } = useQuery<KennelBuilding[]>({
    queryKey: ['/api/kennel-buildings'],
  });
  
  // Fetch kennel occupancy to know which positions are taken
  const { data: occupancyData } = useQuery<KennelOccupancy[]>({
    queryKey: ['/api/kennel-occupancy'],
  });
  
  // State for cascading kennel selection
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    initialData?.kennelBuildingId || ''
  );
  const [selectedRowId, setSelectedRowId] = useState<string>(
    initialData?.kennelRowId || ''
  );
  const [selectedPosition, setSelectedPosition] = useState<number | null>(
    initialData?.kennelPosition ?? null
  );
  
  // State for AI Bio Generator dialog
  const [bioGeneratorOpen, setBioGeneratorOpen] = useState(false);
  
  // Reset row and position when building changes
  const handleBuildingChange = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    setSelectedRowId('');
    setSelectedPosition(null);
  };
  
  // Reset position when row changes
  const handleRowChange = (rowId: string) => {
    setSelectedRowId(rowId);
    setSelectedPosition(null);
  };
  
  // Get available rows for selected building
  const availableRows = useMemo(() => {
    if (!selectedBuildingId || !buildingsData) return [];
    const building = buildingsData.find(b => b.id === selectedBuildingId);
    return building?.rows || [];
  }, [selectedBuildingId, buildingsData]);
  
  // Get the selected row's capacity and which positions are occupied
  const selectedRow = useMemo(() => {
    if (!selectedRowId || !availableRows.length) return null;
    return availableRows.find(r => r.id === selectedRowId) || null;
  }, [selectedRowId, availableRows]);
  
  // Get position options with availability status
  const positionOptions = useMemo(() => {
    if (!selectedRow || !selectedBuildingId) return [];
    const positions = [];
    for (let i = 0; i < selectedRow.capacity; i++) {
      const occupant = occupancyData?.find(
        o => o.buildingId === selectedBuildingId && 
             o.rowId === selectedRowId && 
             o.position === i
      );
      // Show as available if unoccupied OR if it's this animal's current position
      // Use animalId from occupancy data to match current animal
      const isCurrentAnimalPosition = occupant && initialData?.id === occupant.animalId;
      positions.push({
        position: i,
        label: `#${i + 1}`,
        occupied: !!occupant && !isCurrentAnimalPosition,
        occupantName: occupant?.name || null,
      });
    }
    return positions;
  }, [selectedRow, selectedBuildingId, selectedRowId, occupancyData, initialData?.id]);

  const fosterAutoMode = useMemo(() => {
    if (!isEditing || !effectiveInitialData) return false;
    const hasActiveFoster = !!(effectiveInitialData as any).activeFosterName;
    if (!hasActiveFoster) return false;
    const hasKennel = !!(effectiveInitialData as any).kennelBuildingId && !!(effectiveInitialData as any).kennelRowId && (effectiveInitialData as any).kennelPosition !== null && (effectiveInitialData as any).kennelPosition !== undefined;
    if (!hasKennel) return true;
    const kennelUpdated = effectiveInitialData.updatedAt ? new Date(effectiveInitialData.updatedAt).getTime() : 0;
    const fosterStart = (effectiveInitialData as any).activeFosterStartDate ? new Date((effectiveInitialData as any).activeFosterStartDate).getTime() : 0;
    return fosterStart > kennelUpdated;
  }, [effectiveInitialData, isEditing]);

  const activeFosterName = useMemo(() => {
    return fosterAutoMode ? ((effectiveInitialData as any)?.activeFosterName || 'Foster Parent') : '';
  }, [fosterAutoMode, effectiveInitialData]);
  
  const form = useForm<AnimalFormData>({
    resolver: zodResolver(animalFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      // Petfinder-compliant primary fields
      petfinderType: initialData.petfinderType || mapSpeciesToPetfinderType(initialData.species) || undefined,
      petfinderBreed: initialData.petfinderBreed || initialData.breed || "",
      petfinderBreedSecondary: initialData.petfinderBreedSecondary || null,
      petfinderAge: initialData.petfinderAge || mapAgeToPetfinderAge(initialData.age) || undefined,
      petfinderSize: initialData.petfinderSize || undefined,
      petfinderGender: initialData.petfinderGender || mapSexToPetfinderGender(initialData.sex) || undefined,
      // Derived fields (will be auto-populated on submit)
      species: initialData.species,
      breed: initialData.breed,
      age: initialData.age,
      // Other fields
      neuterStatus: initialData.neuterStatus || undefined,
      dateOfBirth: initialData.dateOfBirth ? new Date(initialData.dateOfBirth) : null,
      microchipNumber: initialData.microchipNumber || "",
      medicalAlertMemo: initialData.medicalAlertMemo || "",
      behaviorColor: initialData.behaviorColor || "green",
      behaviorRestrictionReason: initialData.behaviorRestrictionReason || "",
      weight: initialData.weight || "",
      intakeSource: initialData.intakeSource || undefined,
      intakeDate: initialData.intakeDate ? new Date(initialData.intakeDate) : null,
      activityLevel: initialData.activityLevel || undefined,
      dietaryRestrictions: initialData.dietaryRestrictions || "",
      catFriendly: booleanToFriendlyStatus(initialData.catFriendly),
      dogFriendly: booleanToFriendlyStatus(initialData.dogFriendly),
      childFriendly: booleanToFriendlyStatus(initialData.childFriendly),
      bio: initialData.bio || "",
      photoUrls: initialData.photoUrls || [],
      status: initialData.status || "available",
      postedToPetfinder: initialData.postedToPetfinder || false,
      petfinderUrl: initialData.petfinderUrl || "",
      petfinderSyncedAt: initialData.petfinderSyncedAt ? new Date(initialData.petfinderSyncedAt) : null,
      houseTrained: initialData.houseTrained ?? null,
      declawed: initialData.declawed ?? null,
      specialNeeds: initialData.specialNeeds ?? null,
      shotsCurrent: initialData.shotsCurrent ?? null,
      heartwormPositive: initialData.heartwormPositive ?? null,
      medicalHold: initialData.medicalHold || false,
      locationFound: initialData.locationFound || "",
      strayHoldUntil: initialData.strayHoldUntil ? new Date(initialData.strayHoldUntil) : null,
      locationType: initialData.locationType || "shelter",
      locationName: initialData.locationName || "",
    } : {
      name: "",
      // Petfinder-compliant primary fields (user must fill these)
      petfinderType: undefined,
      petfinderBreed: "",
      petfinderBreedSecondary: null,
      petfinderAge: undefined,
      petfinderSize: undefined,
      petfinderGender: undefined,
      // Derived fields
      species: "",
      breed: "",
      age: "",
      // Other fields
      bio: "",
      behaviorColor: "green",
      behaviorRestrictionReason: "",
      weight: "",
      intakeSource: undefined,
      intakeDate: null,
      activityLevel: undefined,
      dietaryRestrictions: "",
      catFriendly: "unknown",
      dogFriendly: "unknown",
      childFriendly: "unknown",
      photoUrls: [],
      status: "available",
      postedToPetfinder: false,
      petfinderUrl: "",
      petfinderSyncedAt: null,
      houseTrained: null,
      declawed: null,
      specialNeeds: null,
      shotsCurrent: null,
      heartwormPositive: null,
      medicalHold: false,
      locationFound: "",
      strayHoldUntil: null,
      locationType: "shelter",
      locationName: "",
    },
  });
  
  const selectedPetfinderType = form.watch("petfinderType");
  const watchedBehaviorColor = form.watch("behaviorColor");
  const [breedPopoverOpen, setBreedPopoverOpen] = useState(false);
  const [secondaryBreedPopoverOpen, setSecondaryBreedPopoverOpen] = useState(false);
  
  const availableBreeds = useMemo(() => {
    if (!selectedPetfinderType) return [];
    return getBreedsForType(selectedPetfinderType as keyof typeof PETFINDER_BREEDS);
  }, [selectedPetfinderType]);

  useEffect(() => {
    if (initialData?.photoUrls) {
      const validPhotos = initialData.photoUrls.filter(url => 
        url.startsWith('/objects/') || url.startsWith('objects/')
      );
      setUploadedPhotos(validPhotos);
    }
  }, [initialData, setUploadedPhotos]);

  useEffect(() => {
    if (surrenderPrefill?.animalFields && !isEditing) {
      const a = surrenderPrefill.animalFields;
      const friendlyMap = (val: boolean | undefined | null) => val === true ? 'yes' : val === false ? 'no' : 'unknown';
      form.reset({
        name: a.name || "",
        petfinderType: a.petfinderType || undefined,
        petfinderBreed: a.petfinderBreed || a.breed || "",
        petfinderBreedSecondary: null,
        petfinderAge: a.petfinderAge || undefined,
        petfinderSize: a.petfinderSize || undefined,
        petfinderGender: a.petfinderGender || undefined,
        species: a.species || "",
        breed: a.breed || "",
        age: a.age || "",
        neuterStatus: a.neuterStatus || undefined,
        dateOfBirth: a.dateOfBirth ? new Date(a.dateOfBirth) : null,
        microchipNumber: a.microchipNumber || "",
        weight: a.weight || "",
        intakeSource: a.intakeSource || 'owner_surrender',
        intakeDate: null,
        status: a.status || "intake",
        medicalAlertMemo: "",
        behaviorColor: "green",
        behaviorRestrictionReason: "",
        activityLevel: undefined,
        dietaryRestrictions: "",
        catFriendly: friendlyMap(a.catFriendly),
        dogFriendly: friendlyMap(a.dogFriendly),
        childFriendly: friendlyMap(a.childFriendly),
        bio: "",
        photoUrls: a.photoUrls || [],
        postedToPetfinder: false,
        petfinderUrl: "",
        petfinderSyncedAt: null,
        houseTrained: null,
        declawed: null,
        specialNeeds: null,
        shotsCurrent: null,
        heartwormPositive: null,
        locationFound: "",
        strayHoldUntil: null,
        locationType: "shelter",
        locationName: "",
      });
      if (a.photoUrls?.length) {
        const validPhotos = a.photoUrls.filter((url: string) => 
          url.startsWith('/objects/') || url.startsWith('objects/')
        );
        if (validPhotos.length > 0) {
          setUploadedPhotos(validPhotos);
        }
      }
    }
  }, [surrenderPrefill, isEditing]);


  const handleSubmit = (data: AnimalFormData) => {
    if (data.postedToPetfinder && uploadedPhotos.length === 0) {
      toast({
        title: "Photo Required",
        description: "At least 1 photo is required when marking an animal as posted to Petfinder.",
        variant: "destructive",
      });
      return;
    }
    
    // Auto-derive species from petfinderType
    const derivedSpecies = data.petfinderType || "";
    
    // Auto-derive breed from petfinderBreed (+ secondary if mixed)
    const derivedBreed = data.petfinderBreedSecondary 
      ? `${data.petfinderBreed} / ${data.petfinderBreedSecondary}` 
      : (data.petfinderBreed || "");
    
    // Use specific age if provided, otherwise use age category
    const derivedAge = data.age || data.petfinderAge || "";
    
    const animalData = {
      ...data,
      // Auto-populated derived fields
      species: derivedSpecies,
      breed: derivedBreed,
      age: derivedAge,
      catFriendly: friendlyStatusToBoolean(data.catFriendly),
      dogFriendly: friendlyStatusToBoolean(data.dogFriendly),
      childFriendly: friendlyStatusToBoolean(data.childFriendly),
      photoUrls: uploadedPhotos,
      petfinderSyncedAt: data.petfinderSyncedAt ? data.petfinderSyncedAt.toISOString() : null,
      dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toISOString() : null,
      petfinderType: data.petfinderType || null,
      petfinderBreed: data.petfinderBreed || null,
      petfinderBreedSecondary: data.petfinderBreedSecondary || null,
      petfinderAge: data.petfinderAge || null,
      petfinderSize: data.petfinderSize || null,
      petfinderGender: data.petfinderGender || null,
      houseTrained: data.houseTrained ?? null,
      declawed: data.petfinderType === 'Cat' ? (data.declawed ?? null) : null,
      specialNeeds: data.specialNeeds ?? null,
      shotsCurrent: data.shotsCurrent ?? null,
      heartwormPositive: data.heartwormPositive ?? null,
      // Stray hold fields
      locationFound: data.status === 'stray_hold' ? (data.locationFound || null) : null,
      strayHoldUntil: data.status === 'stray_hold' && data.strayHoldUntil ? data.strayHoldUntil.toISOString() : null,
      // Kennel assignment - only when shelter location
      kennelBuildingId: data.locationType === 'shelter' ? (selectedBuildingId || null) : null,
      kennelRowId: data.locationType === 'shelter' ? (selectedRowId || null) : null,
      kennelPosition: data.locationType === 'shelter' ? selectedPosition : null,
      // Auto-derive locationName from kennel when shelter
      locationName: data.locationType === 'shelter' 
        ? (selectedBuildingId && selectedRowId && selectedPosition !== null
          ? (() => {
              const building = buildingsData?.find(b => b.id === selectedBuildingId);
              const row = building?.rows?.find((r: any) => r.id === selectedRowId);
              return `${building?.name || ''} > ${row?.name || ''} > #${(selectedPosition ?? 0) + 1}`;
            })()
          : '')
        : (data.locationName || ''),
    };
    onSubmit(animalData as any);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Basic Info Section - Using Petfinder-compliant fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Buddy" data-testid="input-animal-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="petfinderType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type *</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue('petfinderBreed', "");
                    form.setValue('petfinderBreedSecondary', null);
                    if (value !== 'Cat') {
                      form.setValue('declawed', null);
                    }
                  }} 
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-animal-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PETFINDER_TYPES.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`option-type-${type}`}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Breed Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="petfinderBreed"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Breed *</FormLabel>
                <Popover open={breedPopoverOpen} onOpenChange={setBreedPopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={!selectedPetfinderType}
                        className={cn(
                          "justify-between font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="select-animal-breed"
                      >
                        {field.value || "Select breed..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search breeds..." />
                      <CommandList>
                        <CommandEmpty>No breed found.</CommandEmpty>
                        <CommandGroup className="max-h-[200px] overflow-y-auto">
                          {availableBreeds.map((breed) => (
                            <CommandItem
                              key={breed}
                              value={breed}
                              onSelect={() => {
                                field.onChange(breed);
                                setBreedPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  field.value === breed ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {breed}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {!selectedPetfinderType && (
                  <FormDescription>Select a type first</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="petfinderBreedSecondary"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Secondary Breed (Mixed)</FormLabel>
                <Popover open={secondaryBreedPopoverOpen} onOpenChange={setSecondaryBreedPopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={!selectedPetfinderType}
                        className={cn(
                          "justify-between font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="select-animal-breed-secondary"
                      >
                        {field.value || "None (purebred)"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search breeds..." />
                      <CommandList>
                        <CommandEmpty>No breed found.</CommandEmpty>
                        <CommandGroup className="max-h-[200px] overflow-y-auto">
                          <CommandItem
                            value=""
                            onSelect={() => {
                              field.onChange(null);
                              setSecondaryBreedPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !field.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            None (purebred)
                          </CommandItem>
                          {availableBreeds.map((breed) => (
                            <CommandItem
                              key={breed}
                              value={breed}
                              onSelect={() => {
                                field.onChange(breed);
                                setSecondaryBreedPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  field.value === breed ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {breed}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Size & Gender */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="petfinderSize"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Size *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-animal-size">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PETFINDER_SIZES.map((size) => (
                      <SelectItem key={size} value={size} data-testid={`option-size-${size}`}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="petfinderGender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-animal-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PETFINDER_GENDERS.map((gender) => (
                      <SelectItem key={gender} value={gender} data-testid={`option-gender-${gender}`}>
                        {gender}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Age Category & Specific Age */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="petfinderAge"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Age Category *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-animal-age-category">
                      <SelectValue placeholder="Select age category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PETFINDER_AGES.map((age) => (
                      <SelectItem key={age} value={age} data-testid={`option-age-${age}`}>
                        {age}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Baby, Young, Adult, or Senior</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specific Age</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 3 years, 6 months" data-testid="input-animal-age" {...field} />
                </FormControl>
                <FormDescription>Optional: More specific age</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Medical Info Section */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Medical Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="neuterStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spay/Neuter Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-animal-neuter">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="intact">Intact</SelectItem>
                      <SelectItem value="neutered">Neutered</SelectItem>
                      <SelectItem value="spayed">Spayed</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      data-testid="input-animal-dob"
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <FormField
              control={form.control}
              name="microchipNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Microchip Number</FormLabel>
                  <FormControl>
                    <Input placeholder="123456789" data-testid="input-microchip" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel className="bg-[#d7faa5]">Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-animal-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="adoption_pending">Adoption Pending</SelectItem>
                    <SelectItem value="transfer_pending">Transfer Pending</SelectItem>
                    <SelectItem value="medical_hold">Medical Hold</SelectItem>
                    <SelectItem value="stray_hold">Stray Hold</SelectItem>
                    <SelectItem value="adopted">Adopted</SelectItem>
                    <SelectItem value="transported">Transported</SelectItem>
                    <SelectItem value="deceased">Deceased</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {fosterAutoMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <FormItem>
                <FormLabel>Location</FormLabel>
                <Input
                  value="Foster Home"
                  disabled
                  data-testid="input-location-type-auto"
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-set from active foster placement
                </p>
              </FormItem>
              <FormItem>
                <FormLabel>Location Detail</FormLabel>
                <Input
                  value={activeFosterName}
                  disabled
                  data-testid="input-location-name-auto"
                  className="bg-muted"
                />
              </FormItem>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <FormField
                  control={form.control}
                  name="locationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== 'shelter') {
                          handleBuildingChange('');
                        }
                      }} value={field.value || "shelter"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-location-type">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="shelter">Shelter</SelectItem>
                          <SelectItem value="foster">Foster Home</SelectItem>
                          <SelectItem value="clinic">Vet Clinic</SelectItem>
                          <SelectItem value="transport">In Transport</SelectItem>
                          <SelectItem value="offsite">Offsite</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("locationType") !== "shelter" && (
                  <FormField
                    control={form.control}
                    name="locationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Detail</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              form.watch("locationType") === "foster" ? "Foster parent name" :
                              form.watch("locationType") === "clinic" ? "Vet clinic name" :
                              form.watch("locationType") === "transport" ? "Transport details" :
                              form.watch("locationType") === "offsite" ? "Location name" :
                              "Location details"
                            }
                            data-testid="input-location-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {form.watch("locationType") === "shelter" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Building</Label>
                    <Select
                      value={selectedBuildingId || 'none'}
                      onValueChange={(value) => handleBuildingChange(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger data-testid="select-kennel-building">
                        <SelectValue placeholder="Select building" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No kennel</SelectItem>
                        {(buildingsData || []).map((building) => (
                          <SelectItem
                            key={building.id}
                            value={building.id}
                            data-testid={`option-building-${building.id}`}
                          >
                            {building.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Row</Label>
                    <Select
                      value={selectedRowId || 'none'}
                      onValueChange={(value) => handleRowChange(value === 'none' ? '' : value)}
                      disabled={!selectedBuildingId}
                    >
                      <SelectTrigger data-testid="select-kennel-row">
                        <SelectValue placeholder={selectedBuildingId ? "Select row" : "Select building first"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {availableRows.map((row) => (
                          <SelectItem
                            key={row.id}
                            value={row.id}
                            data-testid={`option-row-${row.id}`}
                          >
                            {row.name} ({row.capacity} units)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Kennel #</Label>
                    <Select
                      value={selectedPosition !== null ? String(selectedPosition) : 'none'}
                      onValueChange={(value) => setSelectedPosition(value === 'none' ? null : parseInt(value))}
                      disabled={!selectedRowId}
                    >
                      <SelectTrigger data-testid="select-kennel-position">
                        <SelectValue placeholder={selectedRowId ? "Select #" : "Select row first"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {positionOptions.map((pos) => (
                          <SelectItem
                            key={pos.position}
                            value={String(pos.position)}
                            disabled={pos.occupied}
                            data-testid={`option-position-${pos.position}`}
                            className={pos.occupied ? 'text-muted-foreground line-through' : ''}
                          >
                            {pos.label} {pos.occupied ? `(Occupied: ${pos.occupantName})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!buildingsData?.length && (
                    <p className="text-xs text-muted-foreground col-span-3">
                      Set up kennel locations in Facility Manager first
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {form.watch("status") === "stray_hold" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 mt-4">
              <FormField
                control={form.control}
                name="locationFound"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Found</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Address or intersection where animal was found"
                        data-testid="input-location-found"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Where the stray animal was found (address or intersection)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="strayHoldUntil"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>On Stray Hold Until</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-stray-hold-until"
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Select stray hold expiry date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Date when the stray hold period expires
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <FormField
            control={form.control}
            name="medicalAlertMemo"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Medical Alert Memo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Important medical information or alerts..."
                    data-testid="input-medical-alert"
                    className="min-h-[60px]"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Use this for important medical alerts that staff should know
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Behavioral Safety Rating Section */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Behavioral Safety Rating</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Rate this animal's safety level for handling by staff and volunteers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="behaviorColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Safety Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "yellow"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-behavior-color">
                        <SelectValue placeholder="Select safety level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="green" data-testid="option-behavior-green">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span>Green - Safe for All</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="yellow" data-testid="option-behavior-yellow">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                          <span>Yellow - Caution / Trained Vols Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="red" data-testid="option-behavior-red">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span>Red - STAFF ONLY / DANGER</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="purple" data-testid="option-behavior-purple">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-500" />
                          <span>Purple - Medical Isolation</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {(watchedBehaviorColor === "yellow" || watchedBehaviorColor === "red") && (
              <FormField
                control={form.control}
                name="behaviorRestrictionReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Restriction Reason <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Why is this animal restricted?"
                        data-testid="input-behavior-restriction-reason"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Required for Yellow and Red ratings
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </div>

        {/* Physical & Intake Information Section */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Physical & Intake Information</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Additional details for kennel cards and internal records.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 25 lbs"
                      data-testid="input-weight"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="intakeSource"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intake Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-intake-source">
                        <SelectValue placeholder="How did this animal arrive?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="stray" data-testid="option-intake-stray">Stray</SelectItem>
                      <SelectItem value="owner_surrender" data-testid="option-intake-surrender">Owner Surrender</SelectItem>
                      <SelectItem value="transfer" data-testid="option-intake-transfer">Transfer from Another Org</SelectItem>
                      <SelectItem value="born_in_care" data-testid="option-intake-born">Born in Care</SelectItem>
                      <SelectItem value="other" data-testid="option-intake-other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="intakeDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intake Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      data-testid="input-intake-date"
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        const dateValue = e.target.value ? new Date(e.target.value) : null;
                        field.onChange(dateValue);
                      }}
                    />
                  </FormControl>
                  <FormDescription>When did this animal arrive at the rescue?</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="activityLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-activity-level">
                        <SelectValue placeholder="Energy level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low" data-testid="option-activity-low">Low - Couch Potato</SelectItem>
                      <SelectItem value="moderate" data-testid="option-activity-moderate">Moderate - Balanced</SelectItem>
                      <SelectItem value="high" data-testid="option-activity-high">High - Very Active</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="dietaryRestrictions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dietary Restrictions</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Special diet requirements..."
                      data-testid="input-dietary-restrictions"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Note any special food requirements or allergies
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Temperament & Behavior Section - Petfinder Environment */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Environment Compatibility</h3>
          <p className="text-sm text-muted-foreground mb-3">These fields are used by Petfinder to help match pets with families.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="childFriendly"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Good with Children</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-child-friendly">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="yes" data-testid="option-child-friendly-yes">Yes</SelectItem>
                      <SelectItem value="no" data-testid="option-child-friendly-no">No</SelectItem>
                      <SelectItem value="unknown" data-testid="option-child-friendly-unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="catFriendly"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Good with Cats</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-cat-friendly">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="yes" data-testid="option-cat-friendly-yes">Yes</SelectItem>
                      <SelectItem value="no" data-testid="option-cat-friendly-no">No</SelectItem>
                      <SelectItem value="unknown" data-testid="option-cat-friendly-unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dogFriendly"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Good with Dogs</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-dog-friendly">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="yes" data-testid="option-dog-friendly-yes">Yes</SelectItem>
                      <SelectItem value="no" data-testid="option-dog-friendly-no">No</SelectItem>
                      <SelectItem value="unknown" data-testid="option-dog-friendly-unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Photos Section - Petfinder requires at least 1, max 6 */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <FormLabel>Animal Photos</FormLabel>
            <Badge variant="outline" className="text-xs">1-{MAX_PHOTOS} photos for Petfinder</Badge>
          </div>
          {uploadedPhotos.length === 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-400">At least 1 photo is required for Petfinder listings</span>
            </div>
          )}
          <ObjectUploader
            value={uploadedPhotos}
            onChange={setUploadedPhotos}
            maxFiles={MAX_PHOTOS}
            maxFileSize={MAX_PHOTO_SIZE_BYTES}
            previewSize="lg"
            data-testid="uploader-animal-photos"
          />
          <p className="text-sm text-muted-foreground">
            Upload up to {MAX_PHOTOS} photos (max {MAX_PHOTO_SIZE_MB}MB each, JPG/PNG/GIF)
          </p>
        </div>

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Bio / Description</FormLabel>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setBioGeneratorOpen(true)}
                  disabled={!form.watch('name') || !form.watch('petfinderType')}
                  data-testid="button-ai-bio-generator"
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  AI Bio Generator
                </Button>
              </div>
              <FormControl>
                <Textarea
                  placeholder="Tell us about this animal's personality, history, and what makes them special..."
                  data-testid="input-animal-bio"
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                A good description helps animals get adopted faster on Petfinder
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* AI Bio Generator Dialog */}
        <AiBioGeneratorDialog
          animal={form.watch('name') && form.watch('petfinderType') ? {
            name: form.watch('name'),
            // Convert petfinderType to canonical species name for AI bio generation
            species: (() => {
              const petfinderType = form.watch('petfinderType');
              // Map petfinder types to canonical species names
              const typeToSpecies: Record<string, string> = {
                'Dog': 'Dog',
                'Cat': 'Cat',
                'Rabbit': 'Rabbit',
                'Horse': 'Horse',
                'Bird': 'Bird',
                'Small & Furry': 'Small Animal',
                'Scales, Fins & Other': 'Reptile/Fish',
                'Barnyard': 'Farm Animal',
              };
              return typeToSpecies[petfinderType] || petfinderType;
            })(),
            breed: form.watch('petfinderBreed') || undefined,
            age: form.watch('petfinderAge') || undefined,
            sex: form.watch('petfinderGender') || undefined,
            childFriendly: form.watch('childFriendly') === 'yes' ? true : form.watch('childFriendly') === 'no' ? false : null,
            dogFriendly: form.watch('dogFriendly') === 'yes' ? true : form.watch('dogFriendly') === 'no' ? false : null,
            catFriendly: form.watch('catFriendly') === 'yes' ? true : form.watch('catFriendly') === 'no' ? false : null,
            specialNeeds: form.watch('specialNeeds') ?? null,
            id: initialData?.id, // Include ID if editing existing animal
          } : null}
          open={bioGeneratorOpen}
          onOpenChange={setBioGeneratorOpen}
          onBioGenerated={(bio) => {
            form.setValue('bio', bio);
          }}
        />

        {/* Health & Training Attributes */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Health & Training</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="shotsCurrent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-shots-current"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">Shots Current</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="houseTrained"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-house-trained"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">House Trained</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="specialNeeds"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-special-needs"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">Special Needs</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="heartwormPositive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-heartworm-positive"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">Heartworm Positive</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            {selectedPetfinderType === 'Cat' && (
              <FormField
                control={form.control}
                name="declawed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-declawed"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">Declawed</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            )}
          </div>
        </div>

        {/* Petfinder Listing Status */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Petfinder Listing</h3>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="postedToPetfinder"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked) {
                          form.setValue('petfinderSyncedAt', new Date());
                        } else {
                          form.setValue('petfinderSyncedAt', null);
                        }
                      }}
                      data-testid="checkbox-posted-to-petfinder"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal">Posted to Petfinder</FormLabel>
                    <FormDescription>
                      Check this after posting to Petfinder.com
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="petfinderUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Listing URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://www.petfinder.com/..."
                      data-testid="input-petfinder-url"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            disabled={isPending}
            data-testid="button-submit-animal"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Animal' : 'Add Animal'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

interface AnimalNote {
  id: string;
  noteText: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: {
    fullName: string;
    email: string;
  };
}

function AnimalNotes({ animalId }: { animalId: string }) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const { data, isLoading } = useQuery<{ notes: AnimalNote[] }>({
    queryKey: ['/api/animals', animalId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/animals/${animalId}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (noteData: { noteText: string }) => {
      const response = await apiRequest('POST', `/api/animals/${animalId}/notes`, noteData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'notes'] });
      setNoteText("");
      toast({
        title: "Note added",
        description: "The note has been successfully added.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add note",
        variant: "destructive",
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, noteText }: { id: string; noteText: string }) => {
      const response = await apiRequest('PATCH', `/api/animal-notes/${id}`, { noteText });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'notes'] });
      setEditingNoteId(null);
      setEditingNoteText("");
      toast({
        title: "Note updated",
        description: "The note has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update note",
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiRequest('DELETE', `/api/animal-notes/${noteId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId, 'notes'] });
      toast({
        title: "Note deleted",
        description: "The note has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete note",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (noteText.trim()) {
      createNoteMutation.mutate({ noteText: noteText.trim() });
    }
  };

  const handleUpdate = (noteId: string) => {
    if (editingNoteText.trim()) {
      updateNoteMutation.mutate({ id: noteId, noteText: editingNoteText.trim() });
    }
  };

  const notes = data?.notes || [];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Notes</h3>
      
      {/* Add Note Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note about this animal..."
          className="min-h-[100px]"
          data-testid="textarea-add-note"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!noteText.trim() || createNoteMutation.isPending}
            data-testid="button-add-note"
          >
            {createNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Note
          </Button>
        </div>
      </form>

      {/* Notes List */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} data-testid={`card-note-${note.id}`}>
              <CardContent className="pt-4">
                {editingNoteId === note.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      className="min-h-[100px]"
                      data-testid={`textarea-edit-note-${note.id}`}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingNoteId(null);
                          setEditingNoteText("");
                        }}
                        data-testid={`button-cancel-edit-${note.id}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(note.id)}
                        disabled={!editingNoteText.trim() || updateNoteMutation.isPending}
                        data-testid={`button-save-edit-${note.id}`}
                      >
                        {updateNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="whitespace-pre-wrap text-sm" data-testid={`text-note-${note.id}`}>
                      {note.noteText}
                    </p>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingNoteText(note.noteText);
                          }}
                          data-testid={`button-edit-note-${note.id}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          disabled={deleteNoteMutation.isPending}
                          data-testid={`button-delete-note-${note.id}`}
                        >
                          {deleteNoteMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <X className="h-3 w-3 mr-1" />
                          )}
                          Delete
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground text-right" data-testid={`text-note-meta-${note.id}`}>
                        <div>{note.user?.fullName || 'Unknown'}</div>
                        <div>
                          {new Date(note.updatedAt).toLocaleDateString()} {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface AuditLogEntry {
  id: string;
  changeType: "status" | "location" | "status_and_location";
  previousStatus: string | null;
  newStatus: string | null;
  previousLocationType: string | null;
  newLocationType: string | null;
  previousLocationName: string | null;
  newLocationName: string | null;
  changedByName: string | null;
  notes: string | null;
  createdAt: string;
}

function formatStatusLabel(status: string | null): string {
  if (!status) return "None";
  const labels: Record<string, string> = {
    available: "Available",
    adoption_pending: "Adoption Pending",
    transfer_pending: "Transfer Pending",
    medical_hold: "Medical Hold",
    stray_hold: "Stray Hold",
    adopted: "Adopted",
    transported: "Transported",
    deceased: "Deceased",
  };
  return labels[status] || status;
}

function formatLocationLabel(locationType: string | null, locationName: string | null): string {
  if (!locationType) return "None";
  const typeLabels: Record<string, string> = {
    shelter: "Shelter",
    foster: "Foster Home",
    clinic: "Vet Clinic",
    transport: "In Transport",
    offsite: "Offsite",
  };
  const label = typeLabels[locationType] || locationType;
  return locationName ? `${label} (${locationName})` : label;
}

function AnimalAuditTimeline({ animalId, animalName }: { animalId: string; animalName: string }) {
  const [open, setOpen] = useState(false);
  
  const { data, isLoading } = useQuery<{ auditLogs: AuditLogEntry[] }>({
    queryKey: ['/api/animals', animalId, 'audit-log'],
    queryFn: async () => {
      const res = await fetch(`/api/animals/${animalId}/audit-log`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch audit log');
      return res.json();
    },
    enabled: open,
  });

  const logs = data?.auditLogs || [];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="justify-center"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Status/Location History"
        data-testid={`button-audit-log-${animalId}`}
      >
        <History className="w-3.5 h-3.5 mr-1.5" />
        History
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-audit-log-title">History: {animalName}</DialogTitle>
            <DialogDescription>Status and location change timeline</DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-audit-log-empty">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No status or location changes recorded yet.</p>
              <p className="text-xs mt-1">Changes will appear here as they happen.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-0" data-testid="audit-log-timeline">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              {logs.map((log, index) => (
                <div key={log.id} className="relative pb-6 last:pb-0" data-testid={`audit-log-entry-${log.id}`}>
                  <div className={`absolute left-[-17px] top-1.5 w-3 h-3 rounded-full border-2 ${
                    index === 0 ? 'bg-primary border-primary' : 'bg-background border-muted-foreground/40'
                  }`} />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString(undefined, { 
                        year: 'numeric', month: 'short', day: 'numeric', 
                        hour: 'numeric', minute: '2-digit'
                      })}
                    </p>
                    {(log.changeType === 'status' || log.changeType === 'status_and_location') && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">Status:</span>
                        <Badge variant="secondary" className="text-xs">{formatStatusLabel(log.previousStatus)}</Badge>
                        <span className="text-xs text-muted-foreground">&rarr;</span>
                        <Badge variant="default" className="text-xs">{formatStatusLabel(log.newStatus)}</Badge>
                      </div>
                    )}
                    {(log.changeType === 'location' || log.changeType === 'status_and_location') && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">Location:</span>
                        <span className="text-xs">{formatLocationLabel(log.previousLocationType, log.previousLocationName)}</span>
                        <span className="text-xs text-muted-foreground">&rarr;</span>
                        <span className="text-xs font-medium">{formatLocationLabel(log.newLocationType, log.newLocationName)}</span>
                      </div>
                    )}
                    {log.notes && (
                      <p className="text-xs text-muted-foreground italic">{log.notes}</p>
                    )}
                    {log.changedByName && (
                      <p className="text-xs text-muted-foreground">by {log.changedByName}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type TeamUser = { id: string; fullName: string; email: string; phone?: string | null; roles: string[] };

function ChangeLocationDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (open: boolean) => void; animal: Animal }) {
  const { toast } = useToast();
  const [newLocationType, setNewLocationType] = useState<string>(animal.locationType || "shelter");
  const [locationName, setLocationName] = useState(animal.locationName || "");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [selectedRowId, setSelectedRowId] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [selectedFosterId, setSelectedFosterId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setNewLocationType(animal.locationType || "shelter");
      setLocationName(animal.locationName || "");
      setSelectedBuildingId(animal.kennelBuildingId || "");
      setSelectedRowId(animal.kennelRowId || "");
      setSelectedPosition(animal.kennelPosition != null ? String(animal.kennelPosition) : "");
      setSelectedFosterId("");
    }
  }, [open, animal.id]);

  const { data: buildingsData } = useQuery<{ buildings: KennelBuilding[] }>({
    queryKey: ['/api/kennel-buildings'],
    enabled: open && newLocationType === "shelter",
  });

  const { data: usersData } = useQuery<{ users: TeamUser[] }>({
    queryKey: ['/api/users'],
    enabled: open && newLocationType === "foster",
  });

  const buildings = buildingsData?.buildings || [];
  const fosterUsers = (usersData?.users || []).filter(u => u.roles?.includes("foster"));
  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);
  const selectedRow = selectedBuilding?.rows.find(r => r.id === selectedRowId);

  const changeLocationMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = { locationType: newLocationType };

      if (newLocationType === "shelter") {
        payload.locationName = selectedBuilding?.name 
          ? `${selectedBuilding.name}${selectedRow ? ` - ${selectedRow.name}` : ""}`
          : "";
        payload.kennelBuildingId = selectedBuildingId || null;
        payload.kennelRowId = selectedRowId || null;
        payload.kennelPosition = selectedPosition ? parseInt(selectedPosition) : null;
      } else if (newLocationType === "foster") {
        const foster = fosterUsers.find(u => u.id === selectedFosterId);
        payload.locationName = foster?.fullName || locationName;
        payload.kennelBuildingId = null;
        payload.kennelRowId = null;
        payload.kennelPosition = null;
      } else {
        payload.locationName = locationName;
        payload.kennelBuildingId = null;
        payload.kennelRowId = null;
        payload.kennelPosition = null;
      }

      await apiRequest("PATCH", `/api/animals/${animal.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({ title: "Location updated", description: `${animal.name} has been moved successfully.` });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update location", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-change-location">
        <DialogHeader>
          <DialogTitle>Change Location</DialogTitle>
          <DialogDescription>Move {animal.name} to a new location</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Location Type</Label>
            <Select value={newLocationType} onValueChange={(v) => { setNewLocationType(v); setLocationName(""); setSelectedBuildingId(""); setSelectedRowId(""); setSelectedPosition(""); setSelectedFosterId(""); }}>
              <SelectTrigger data-testid="select-location-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shelter"><div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Facility / Shelter</div></SelectItem>
                <SelectItem value="foster"><div className="flex items-center gap-2"><Home className="h-4 w-4" /> Foster Home</div></SelectItem>
                <SelectItem value="clinic"><div className="flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Vet Clinic</div></SelectItem>
                <SelectItem value="transport"><div className="flex items-center gap-2"><Truck className="h-4 w-4" /> Transport</div></SelectItem>
                <SelectItem value="offsite"><div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Offsite</div></SelectItem>
              </SelectContent>
            </Select>
          </div>

          {newLocationType === "shelter" && buildings.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Building</Label>
                <Select value={selectedBuildingId} onValueChange={(v) => { setSelectedBuildingId(v); setSelectedRowId(""); setSelectedPosition(""); }}>
                  <SelectTrigger data-testid="select-building">
                    <SelectValue placeholder="Select building..." />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBuilding && selectedBuilding.rows.length > 0 && (
                <div className="space-y-2">
                  <Label>Row / Run</Label>
                  <Select value={selectedRowId} onValueChange={(v) => { setSelectedRowId(v); setSelectedPosition(""); }}>
                    <SelectTrigger data-testid="select-row">
                      <SelectValue placeholder="Select row..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedBuilding.rows.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name} (capacity: {r.capacity})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedRow && (
                <div className="space-y-2">
                  <Label>Kennel Position</Label>
                  <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                    <SelectTrigger data-testid="select-position">
                      <SelectValue placeholder="Select position..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: selectedRow.capacity }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>Position #{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {newLocationType === "foster" && (
            <div className="space-y-2">
              <Label>Foster Parent</Label>
              {fosterUsers.length > 0 ? (
                <Select value={selectedFosterId} onValueChange={setSelectedFosterId}>
                  <SelectTrigger data-testid="select-foster-parent">
                    <SelectValue placeholder="Select foster parent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fosterUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}{u.email ? ` (${u.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Foster parent name"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  data-testid="input-foster-name"
                />
              )}
            </div>
          )}

          {(newLocationType === "clinic" || newLocationType === "transport" || newLocationType === "offsite") && (
            <div className="space-y-2">
              <Label>{newLocationType === "clinic" ? "Clinic Name" : newLocationType === "transport" ? "Transport Details" : "Location Name"}</Label>
              <Input
                placeholder={newLocationType === "clinic" ? "e.g., Rice City Animal Hospital" : newLocationType === "transport" ? "e.g., Nashville run - Van 2" : "e.g., PetSmart adoption event"}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                data-testid="input-location-name"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-location">Cancel</Button>
            <Button
              onClick={() => changeLocationMutation.mutate()}
              disabled={changeLocationMutation.isPending || (newLocationType === "foster" && fosterUsers.length > 0 && !selectedFosterId) || ((newLocationType === "clinic" || newLocationType === "transport" || newLocationType === "offsite") && !locationName.trim())}
              data-testid="button-save-location"
            >
              {changeLocationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
              Move Animal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AnimalsPage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locationTab, setLocationTab] = useState<"all" | "facility" | "foster">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("recent");
  const [showArchived, setShowArchived] = useState(false);
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [editUploadedPhotos, setEditUploadedPhotos] = useState<string[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<Record<string, number>>({});
  const [assignFosterDialogOpen, setAssignFosterDialogOpen] = useState(false);
  const [adoptionDialogOpen, setAdoptionDialogOpen] = useState(false);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [animalToAssign, setAnimalToAssign] = useState<Animal | null>(null);
  const [animalToAdopt, setAnimalToAdopt] = useState<Animal | null>(null);
  const [animalToFinalize, setAnimalToFinalize] = useState<Animal | null>(null);
  const [animalToMarkDeceased, setAnimalToMarkDeceased] = useState<Animal | null>(null);
  const [markDeceasedDialogOpen, setMarkDeceasedDialogOpen] = useState(false);
  const [originalEditStatus, setOriginalEditStatus] = useState<string | null>(null);
  const [pendingEditData, setPendingEditData] = useState<Partial<AnimalFormData> | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [animalForDetails, setAnimalForDetails] = useState<Animal | null>(null);
  const [quickPhotoDialogOpen, setQuickPhotoDialogOpen] = useState(false);
  const [animalForQuickPhoto, setAnimalForQuickPhoto] = useState<Animal | null>(null);
  const [adCopyDialogOpen, setAdCopyDialogOpen] = useState(false);
  const [animalForAdCopy, setAnimalForAdCopy] = useState<Animal | null>(null);
  const [bioGeneratorDialogOpen, setBioGeneratorDialogOpen] = useState(false);
  const [animalForBioGenerator, setAnimalForBioGenerator] = useState<Animal | null>(null);
  const [medicalImportDialogOpen, setMedicalImportDialogOpen] = useState(false);
  const [animalForMedicalImport, setAnimalForMedicalImport] = useState<Animal | null>(null);
  const [heartwormTreatmentModalOpen, setHeartwormTreatmentModalOpen] = useState(false);
  const [animalForHeartwormTreatment, setAnimalForHeartwormTreatment] = useState<Animal | null>(null);
  const [changeLocationDialogOpen, setChangeLocationDialogOpen] = useState(false);
  const [animalForChangeLocation, setAnimalForChangeLocation] = useState<Animal | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [animalForTransfer, setAnimalForTransfer] = useState<Animal | null>(null);
  const [surrenderPrefill, setSurrenderPrefill] = useState<any>(null);

  const { data, isLoading } = useQuery<{ animals: AnimalWithKennel[] }>({
    queryKey: ['/api/animals'],
  });

  const animals = data?.animals || [];

  // Check for URL query parameters to handle navigation from KPI cards
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Handle ?from_surrender= to auto-open add dialog with pre-filled data
    const fromSurrender = urlParams.get('from_surrender');
    if (fromSurrender) {
      try {
        const stored = sessionStorage.getItem('surrenderPrefill');
        if (stored) {
          const prefillData = JSON.parse(stored);
          sessionStorage.removeItem('surrenderPrefill');
          setSurrenderPrefill(prefillData);
          setDialogOpen(true);
          toast({
            title: "Form pre-filled from Surrender Application",
            description: "Please review carefully before saving.",
          });
        }
      } catch (e) {
        console.error('Failed to parse surrender prefill data:', e);
      }
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      return;
    }

    // Handle ?action=add to auto-open add dialog
    if (urlParams.get('action') === 'add') {
      setDialogOpen(true);
      // Clean up the URL after opening the dialog
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    
    const location = urlParams.get('location');
    if (location === 'foster') {
      setLocationTab('foster');
    } else if (location === 'shelter') {
      setLocationTab('facility');
    }
  }, []);
  
  const allActiveAnimals = animals.filter(animal => !TERMINAL_STATUSES.includes(animal.status as any));
  const archivedAnimals = animals.filter(animal => TERMINAL_STATUSES.includes(animal.status as any));
  
  const sortAnimals = (list: AnimalWithKennel[]) => {
    if (sortOrder === "name_asc") {
      return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortOrder === "name_desc") {
      return [...list].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    }
    return list;
  };

  const facilityAnimals = allActiveAnimals.filter(a => a.locationType === "shelter" || !a.locationType);
  const fosterAnimals = allActiveAnimals.filter(a => a.locationType === "foster");

  const activeAnimals = useMemo(() => {
    let baseList;
    if (showArchived) {
      baseList = archivedAnimals;
    } else if (locationTab === "facility") {
      baseList = facilityAnimals;
    } else if (locationTab === "foster") {
      baseList = fosterAnimals;
    } else {
      baseList = allActiveAnimals;
    }

    let filtered;
    if (statusFilter === "all") {
      filtered = baseList;
    } else {
      filtered = baseList.filter(animal => animal.status === statusFilter);
    }
    return sortAnimals(filtered);
  }, [allActiveAnimals, archivedAnimals, facilityAnimals, fosterAnimals, locationTab, statusFilter, sortOrder, showArchived]);

  const createAnimalMutation = useMutation({
    mutationFn: async (animalData: AnimalFormData) => {
      const response = await apiRequest('POST', '/api/animals', animalData);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Animal added",
        description: "The animal has been added successfully.",
      });
      setDialogOpen(false);
      setUploadedPhotos([]);
      if (data?.id) {
        navigate(`/dashboard/animals/${data.id}/medical?new_intake=true`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add animal",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const updateAnimalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AnimalFormData> }) => {
      const response = await apiRequest('PATCH', `/api/animals/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Animal updated",
        description: "The animal has been updated successfully.",
      });
      setEditDialogOpen(false);
      setEditingAnimal(null);
      setOriginalEditStatus(null); // Clear the stored status
      setEditUploadedPhotos([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update animal",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleEditAnimal = (animal: Animal) => {
    if (animal.status === 'merged') {
      toast({
        title: "Cannot edit merged profile",
        description: `This profile was merged into another animal record. Please edit the primary profile instead.`,
        variant: "destructive",
      });
      return;
    }
    setEditingAnimal(animal);
    setOriginalEditStatus(animal.status); // Store original status
    // Filter out legacy invalid photo URLs (external links like Google Drive)
    // Only keep object storage paths that start with /objects/ or objects/
    const validPhotos = (animal.photoUrls || []).filter(url => 
      url.startsWith('/objects/') || url.startsWith('objects/')
    );
    setEditUploadedPhotos(validPhotos);
    setEditDialogOpen(true);
  };

  const handleCreateSubmit = (data: AnimalFormData) => {
    const payload: any = { ...data };
    if (surrenderPrefill) {
      payload.surrenderRequestId = surrenderPrefill.surrenderRequestId;
      payload.ownerInfo = surrenderPrefill.ownerInfo;
      payload.internalNotes = surrenderPrefill.animalFields?.internalNotes;
      if (surrenderPrefill.attachedDocuments?.length > 0) {
        payload.attachedDocuments = surrenderPrefill.attachedDocuments;
      }
    }
    createAnimalMutation.mutate(payload);
  };

  const handleEditSubmit = (data: AnimalFormData) => {
    if (!editingAnimal) return;
    
    // If changing status to adopted, show adoption dialog
    if (data.status === "adopted" && originalEditStatus !== "adopted") {
      // Store the pending edit data (excluding status) to apply after adoption recording
      const { status, ...otherData } = data;
      setPendingEditData(otherData);
      
      // Close edit dialog first
      setEditDialogOpen(false);
      setOriginalEditStatus(null); // Clear the stored status
      // Create animal object with updated data for adoption
      const animalForAdoption = { ...editingAnimal, ...data };
      setAnimalToAdopt(animalForAdoption as Animal);
      setAdoptionDialogOpen(true);
      return;
    }
    
    updateAnimalMutation.mutate({ id: editingAnimal.id, data });
  };

  const handleStatusChange = (animalId: string, newStatus: "available" | "pending" | "adopted" | "medical_hold" | "deceased") => {
    updateAnimalMutation.mutate({ id: animalId, data: { status: newStatus } });
  };

  const nextPhoto = (animalId: string, maxIndex: number) => {
    setCurrentPhotoIndex((prev) => ({
      ...prev,
      [animalId]: ((prev[animalId] || 0) + 1) % maxIndex,
    }));
  };

  const prevPhoto = (animalId: string, maxIndex: number) => {
    setCurrentPhotoIndex((prev) => ({
      ...prev,
      [animalId]: ((prev[animalId] || 0) - 1 + maxIndex) % maxIndex,
    }));
  };

  // Auto-rotate photos continuously every 4 seconds for all animals with multiple photos
  useEffect(() => {
    const animalsWithMultiplePhotos = animals.filter(
      (animal) => animal.photoUrls && animal.photoUrls.length > 1
    );

    if (animalsWithMultiplePhotos.length === 0) return;

    const interval = setInterval(() => {
      setCurrentPhotoIndex((prev) => {
        const newIndex = { ...prev };
        animalsWithMultiplePhotos.forEach((animal) => {
          const maxIndex = animal.photoUrls!.length;
          newIndex[animal.id] = ((prev[animal.id] || 0) + 1) % maxIndex;
        });
        return newIndex;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [animals]);

  const handleMarkDeceased = (animal: Animal) => {
    setAnimalToMarkDeceased(animal);
    setMarkDeceasedDialogOpen(true);
  };

  const handleViewDetails = (animal: Animal) => {
    setAnimalForDetails(animal);
    setDetailsDialogOpen(true);
  };

  const handleQuickPhoto = (animal: Animal) => {
    setAnimalForQuickPhoto(animal);
    setQuickPhotoDialogOpen(true);
  };

  const handleGenerateAdCopy = (animal: Animal) => {
    setAnimalForAdCopy(animal);
    setAdCopyDialogOpen(true);
  };

  const handleGenerateBio = (animal: Animal) => {
    setAnimalForBioGenerator(animal);
    setBioGeneratorDialogOpen(true);
  };

  const handleMedicalImport = (animal: Animal) => {
    setAnimalForMedicalImport(animal);
    setMedicalImportDialogOpen(true);
  };

  const handleHeartwormTreatment = (animal: Animal) => {
    setAnimalForHeartwormTreatment(animal);
    setHeartwormTreatmentModalOpen(true);
  };

  const handleChangeLocation = (animal: Animal) => {
    setAnimalForChangeLocation(animal);
    setChangeLocationDialogOpen(true);
  };

  const handleTransferAnimal = (animal: Animal) => {
    setAnimalForTransfer(animal);
    setTransferDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "adopted":
        return "bg-blue-500";
      case "medical_hold":
        return "bg-red-500";
      case "bite_hold":
        return "bg-orange-600";
      case "stray_hold":
        return "bg-amber-600";
      case "transfer_pending":
        return "bg-cyan-600";
      case "transported":
        return "bg-indigo-500";
      case "intake":
        return "bg-teal-500";
      case "deceased":
        return "bg-gray-700";
      default:
        return "bg-gray-500";
    }
  };

  const calculateDaysInCare = (animal: Animal): number => {
    const startDate = new Date(animal.intakeDate);
    const endDate = animal.adoptionDate 
      ? new Date(animal.adoptionDate)
      : animal.deceasedDate
        ? new Date(animal.deceasedDate)
        : new Date();
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <DashboardLayout
      title="Animals Management"
      description="Manage your rescue's animals"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/animals/duplicates">
            <Button variant="outline" data-testid="button-find-duplicates">
              <GitMerge className="h-4 w-4 mr-2" />
              Find Duplicates
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setSurrenderPrefill(null);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-animal">
                <PawPrint className="h-4 w-4 mr-2" />
                Add Animal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{surrenderPrefill ? 'Intake from Surrender Application' : 'Add New Animal'}</DialogTitle>
                <DialogDescription>
                  {surrenderPrefill 
                    ? `Pre-filled from surrender request for ${surrenderPrefill.animalFields?.name || 'this animal'}. Review and edit before saving.`
                    : 'Add a new animal to your rescue\'s inventory'}
                </DialogDescription>
              </DialogHeader>
              {surrenderPrefill?.ownerInfo && (
                <div className="bg-muted/50 p-3 rounded-md text-sm space-y-1 border">
                  <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Previous Owner</div>
                  <div>{surrenderPrefill.ownerInfo.name}</div>
                  <div className="text-muted-foreground">{surrenderPrefill.ownerInfo.email}{surrenderPrefill.ownerInfo.phone ? ` | ${surrenderPrefill.ownerInfo.phone}` : ''}</div>
                  {surrenderPrefill.ownerInfo.address && <div className="text-muted-foreground">{surrenderPrefill.ownerInfo.address}</div>}
                </div>
              )}
              <AnimalForm
                onSubmit={handleCreateSubmit}
                isPending={createAnimalMutation.isPending}
                uploadedPhotos={uploadedPhotos}
                setUploadedPhotos={setUploadedPhotos}
                surrenderPrefill={surrenderPrefill}
              />
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64" data-testid="loading-animals">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : animals.length === 0 ? (
              <div className="text-center py-12" data-testid="no-animals">
                <p className="text-muted-foreground">No animals yet. Add your first animal to get started!</p>
              </div>
            ) : (
              <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
                {(allActiveAnimals.length > 0 || archivedAnimals.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {!showArchived && (
                        <Tabs value={locationTab} onValueChange={(v) => { setLocationTab(v as "all" | "facility" | "foster"); setStatusFilter("all"); }} data-testid="tabs-location">
                          <TabsList className="w-full sm:w-auto" data-testid="tabslist-location">
                            <TabsTrigger value="all" className="gap-1.5" data-testid="tab-all-active">
                              <PawPrint className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">All Active</span>
                              <span className="sm:hidden">All</span>
                              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">{allActiveAnimals.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="facility" className="gap-1.5" data-testid="tab-in-facility">
                              <Building2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">In Facility</span>
                              <span className="sm:hidden">Facility</span>
                              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">{facilityAnimals.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="foster" className="gap-1.5" data-testid="tab-in-foster">
                              <Home className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">In Foster</span>
                              <span className="sm:hidden">Foster</span>
                              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">{fosterAnimals.length}</Badge>
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      )}
                      {archivedAnimals.length > 0 && (
                        <Button
                          variant={showArchived ? "default" : "outline"}
                          size="sm"
                          onClick={() => { setShowArchived(!showArchived); setStatusFilter("all"); }}
                          className="gap-1.5"
                          data-testid="button-toggle-archived"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{showArchived ? "Show Active" : "Show Archived"}</span>
                          <span className="sm:hidden">{showArchived ? "Active" : "Archived"}</span>
                          <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">{archivedAnimals.length}</Badge>
                        </Button>
                      )}
                    </div>

                    {(() => {
                      const currentBase = showArchived
                        ? archivedAnimals
                        : locationTab === "facility" ? facilityAnimals : locationTab === "foster" ? fosterAnimals : allActiveAnimals;
                      const statusCounts = currentBase.reduce<Record<string, number>>((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
                      return (
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-sm font-medium">Filter by Status:</label>
                          <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-56 max-w-full" data-testid="select-status-filter">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All ({currentBase.length})</SelectItem>
                              {showArchived ? (
                                <>
                                  {(statusCounts["adopted"] ?? 0) > 0 && <SelectItem value="adopted">Adopted ({statusCounts["adopted"]})</SelectItem>}
                                  {(statusCounts["transported"] ?? 0) > 0 && <SelectItem value="transported">Transported ({statusCounts["transported"]})</SelectItem>}
                                  {(statusCounts["deceased"] ?? 0) > 0 && <SelectItem value="deceased">Deceased ({statusCounts["deceased"]})</SelectItem>}
                                </>
                              ) : (
                                <>
                                  {(statusCounts["available"] ?? 0) > 0 && <SelectItem value="available">Available ({statusCounts["available"]})</SelectItem>}
                                  {(statusCounts["adoption_pending"] ?? 0) > 0 && <SelectItem value="adoption_pending">Adoption Pending ({statusCounts["adoption_pending"]})</SelectItem>}
                                  {(statusCounts["medical_hold"] ?? 0) > 0 && <SelectItem value="medical_hold">Medical Hold ({statusCounts["medical_hold"]})</SelectItem>}
                                  {(statusCounts["stray_hold"] ?? 0) > 0 && <SelectItem value="stray_hold">Stray Hold ({statusCounts["stray_hold"]})</SelectItem>}
                                  {(statusCounts["transfer_pending"] ?? 0) > 0 && <SelectItem value="transfer_pending">Transfer Pending ({statusCounts["transfer_pending"]})</SelectItem>}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                            <Select value={sortOrder} onValueChange={setSortOrder}>
                              <SelectTrigger className="w-44 max-w-full" data-testid="select-sort-order">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="recent">Recently Added</SelectItem>
                                <SelectItem value="name_asc">Name A-Z</SelectItem>
                                <SelectItem value="name_desc">Name Z-A</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Active Animals Section */}
                {activeAnimals.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-semibold mb-4" data-testid="heading-active-animals">
                      {(() => {
                        const locationLabel = showArchived ? "Archived Animals" : locationTab === "facility" ? "In Facility" : locationTab === "foster" ? "In Foster" : "Animals in Care";
                        const statusLabel = statusFilter !== "all" ? ` - ${statusFilter.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` : "";
                        return `${locationLabel}${statusLabel} (${activeAnimals.length})`;
                      })()}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 min-w-0 max-w-full">
                      {activeAnimals.map((animal) => (
                        <AnimalHudCard
                          key={animal.id}
                          animal={animal}
                          variant="active"
                          locationTab={locationTab}
                          currentPhotoIndex={currentPhotoIndex}
                          onNextPhoto={nextPhoto}
                          onPrevPhoto={prevPhoto}
                          onViewDetails={handleViewDetails}
                          onEditAnimal={handleEditAnimal}
                          onMarkDeceased={handleMarkDeceased}
                          onGenerateBio={handleGenerateBio}
                          onGenerateAdCopy={handleGenerateAdCopy}
                          onMedicalImport={handleMedicalImport}
                          onHeartwormTreatment={handleHeartwormTreatment}
                          onQuickPhoto={handleQuickPhoto}
                          onChangeLocation={handleChangeLocation}
                          onTransferAnimal={handleTransferAnimal}
                          calculateDaysInCare={calculateDaysInCare}
                          basePath={basePath}
                          navigate={navigate}
                          auditSlot={<AnimalAuditTimeline animalId={animal.id} animalName={animal.name} />}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  allActiveAnimals.length > 0 && (
                    <div className="text-center py-12" data-testid="no-matching-animals">
                      <p className="text-muted-foreground">
                        No animals match the selected status filter.
                      </p>
                    </div>
                  )
                )}

              </div>
            )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Edit Animal</DialogTitle>
            <DialogDescription>
              Update information for {editingAnimal?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="pr-2">
            {editingAnimal && (
              <>
                <AnimalForm
                  key={editingAnimal.id}
                  onSubmit={handleEditSubmit}
                  isPending={updateAnimalMutation.isPending}
                  uploadedPhotos={editUploadedPhotos}
                  setUploadedPhotos={setEditUploadedPhotos}
                  initialData={editingAnimal}
                  isEditing={true}
                />
                
                {/* Notes Section */}
                <div className="mt-6 pt-6 border-t">
                  <AnimalNotes animalId={editingAnimal.id} />
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Foster Dialog */}
      <AssignFosterDialog
        animal={animalToAssign}
        open={assignFosterDialogOpen}
        onOpenChange={setAssignFosterDialogOpen}
        pendingEdits={pendingEditData}
        onSuccess={() => {
          setAnimalToAssign(null);
          setPendingEditData(null);
        }}
      />

      {/* Adoption Dialog */}
      <AdoptionDialog
        animal={animalToAdopt}
        open={adoptionDialogOpen}
        onOpenChange={setAdoptionDialogOpen}
        pendingEdits={pendingEditData}
        onSuccess={() => {
          setAnimalToAdopt(null);
          setPendingEditData(null);
        }}
      />

      {/* Mark Deceased Dialog */}
      {animalToMarkDeceased && (
        <MarkDeceasedDialog
          open={markDeceasedDialogOpen}
          onOpenChange={setMarkDeceasedDialogOpen}
          animalId={animalToMarkDeceased.id}
          animalName={animalToMarkDeceased.name}
        />
      )}

      {/* Animal Details Dialog */}
      {animalForDetails && (
        <AnimalDetailsDialog
          animal={animalForDetails}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      )}

      {/* Finalize Adoption Dialog */}
      {animalToFinalize && (
        <FinalizeAdoptionDialog
          open={finalizeDialogOpen}
          onOpenChange={(open) => {
            setFinalizeDialogOpen(open);
            if (!open) {
              setAnimalToFinalize(null);
            }
          }}
          animal={animalToFinalize}
        />
      )}

      {/* Quick Animal Photo Dialog */}
      {animalForQuickPhoto && (
        <QuickAnimalPhoto
          open={quickPhotoDialogOpen}
          onOpenChange={(open) => {
            setQuickPhotoDialogOpen(open);
            if (!open) {
              setAnimalForQuickPhoto(null);
            }
          }}
          animal={animalForQuickPhoto}
        />
      )}

      {/* Ad Copy Generator Dialog */}
      {animalForAdCopy && (
        <AdCopyGeneratorDialog
          open={adCopyDialogOpen}
          onOpenChange={(open) => {
            setAdCopyDialogOpen(open);
            if (!open) {
              setAnimalForAdCopy(null);
            }
          }}
          animal={animalForAdCopy}
        />
      )}

      {/* AI Bio Generator Dialog */}
      {animalForBioGenerator && (
        <AiBioGeneratorDialog
          open={bioGeneratorDialogOpen}
          onOpenChange={(open) => {
            setBioGeneratorDialogOpen(open);
            if (!open) {
              setAnimalForBioGenerator(null);
            }
          }}
          animal={animalForBioGenerator}
          onBioGenerated={(bio) => {
            updateAnimalMutation.mutate({
              id: animalForBioGenerator.id,
              data: { bio }
            });
          }}
        />
      )}

      {/* Medical Import Dialog */}
      {animalForMedicalImport && (
        <MedicalImportDialog
          open={medicalImportDialogOpen}
          onOpenChange={(open) => {
            setMedicalImportDialogOpen(open);
            if (!open) {
              setAnimalForMedicalImport(null);
            }
          }}
          animal={animalForMedicalImport}
        />
      )}

      {/* Heartworm Treatment Modal */}
      {animalForHeartwormTreatment && (
        <HeartwormTreatmentModal
          open={heartwormTreatmentModalOpen}
          onOpenChange={(open) => {
            setHeartwormTreatmentModalOpen(open);
            if (!open) {
              setAnimalForHeartwormTreatment(null);
            }
          }}
          animalId={animalForHeartwormTreatment.id}
          animalName={animalForHeartwormTreatment.name}
        />
      )}

      {/* Change Location Dialog */}
      {animalForChangeLocation && (
        <ChangeLocationDialog
          open={changeLocationDialogOpen}
          onOpenChange={(open) => {
            setChangeLocationDialogOpen(open);
            if (!open) setAnimalForChangeLocation(null);
          }}
          animal={animalForChangeLocation}
        />
      )}

      {/* Transfer Animal Dialog */}
      <TransferAnimalDialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) setAnimalForTransfer(null);
        }}
        animal={animalForTransfer}
      />
    </DashboardLayout>
  );
}
