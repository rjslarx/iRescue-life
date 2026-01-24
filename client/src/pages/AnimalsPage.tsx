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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAnimalSchema, type Animal, type Tenant, PETFINDER_TYPES, PETFINDER_AGES, PETFINDER_SIZES, PETFINDER_GENDERS } from "@shared/schema";
import { PETFINDER_BREEDS, getBreedsForType, mapSpeciesToPetfinderType } from "@shared/petfinder-breeds";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Plus, Loader2, ExternalLink, Check, Stethoscope, Upload, X, ChevronLeft, ChevronRight, FileText, Pencil, ClipboardList, Calendar, ChevronDown, ChevronUp, Cat, Dog, Camera, Sparkles, Palette, ChevronsUpDown, AlertCircle, Wand2, FileUp, MapPin, Users } from "lucide-react";
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
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  dietaryRestrictions: z.string().optional(),
  catFriendly: friendlyStatusEnum.optional(),
  dogFriendly: friendlyStatusEnum.optional(),
  childFriendly: friendlyStatusEnum.optional(),
  photoUrls: z.array(z.string()).optional().default([]),
  status: z.enum(["available", "pending", "adopted", "foster", "medical_hold", "deceased"]).default("available"),
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
  isEditing = false
}: { 
  onSubmit: (data: AnimalFormData) => void;
  isPending: boolean;
  uploadedPhotos: string[];
  setUploadedPhotos: (photos: string[]) => void;
  initialData?: Animal;
  isEditing?: boolean;
}) {
  const { toast } = useToast();
  
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
  
  const form = useForm<AnimalFormData>({
    resolver: zodResolver(animalFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      // Petfinder-compliant primary fields
      petfinderType: initialData.petfinderType || mapSpeciesToPetfinderType(initialData.species) || undefined,
      petfinderBreed: initialData.petfinderBreed || initialData.breed || "",
      petfinderBreedSecondary: initialData.petfinderBreedSecondary || null,
      petfinderAge: initialData.petfinderAge || undefined,
      petfinderSize: initialData.petfinderSize || undefined,
      petfinderGender: initialData.petfinderGender || undefined,
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
      setUploadedPhotos(initialData.photoUrls);
    }
  }, [initialData, setUploadedPhotos]);


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
      // Kennel assignment - structured fields only
      kennelBuildingId: selectedBuildingId || null,
      kennelRowId: selectedRowId || null,
      kennelPosition: selectedPosition,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="neuterStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spay/Neuter Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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

          {/* Cascading Kennel Location Selector */}
          <div className="mt-4">
            <Label className="text-sm font-medium">Kennel Location</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {/* Building Select */}
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
              
              {/* Row Select */}
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
              
              {/* Position Select */}
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
                        {pos.label} {pos.occupied ? `(Occupied: ${pos.occupantName})` : '✓ Available'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {!buildingsData?.length 
                ? 'Set up kennel locations in Facility Manager first'
                : selectedBuildingId && selectedRowId && selectedPosition !== null
                  ? `Assigned to kennel #${selectedPosition + 1}`
                  : 'Select building, row, and kennel number (or leave empty for foster/offsite)'}
            </p>
          </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  <Select onValueChange={field.onChange} value={field.value}>
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

        {/* General Info */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-animal-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="adopted">Adopted</SelectItem>
                  <SelectItem value="foster">Foster</SelectItem>
                  <SelectItem value="medical_hold">Medical Hold</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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

export default function AnimalsPage() {
  const { user } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
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

  const { data, isLoading } = useQuery<{ animals: AnimalWithKennel[] }>({
    queryKey: ['/api/animals'],
  });

  const animals = data?.animals || [];

  // Check for ?action=add query parameter to auto-open add dialog
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
      setDialogOpen(true);
      // Clean up the URL after opening the dialog
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  
  // Separate animals into active, adopted, and deceased
  const allActiveAnimals = animals.filter(animal => animal.status !== "adopted" && animal.status !== "deceased");
  const adoptedAnimals = animals.filter(animal => animal.status === "adopted");
  const deceasedAnimals = animals.filter(animal => animal.status === "deceased");
  
  // Filter active animals based on status filter
  const activeAnimals = statusFilter === "all" 
    ? allActiveAnimals 
    : allActiveAnimals.filter(animal => animal.status === statusFilter);

  const createAnimalMutation = useMutation({
    mutationFn: async (animalData: AnimalFormData) => {
      const response = await apiRequest('POST', '/api/animals', animalData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Animal added",
        description: "The animal has been added successfully.",
      });
      setDialogOpen(false);
      setUploadedPhotos([]);
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
    setEditingAnimal(animal);
    setOriginalEditStatus(animal.status); // Store original status
    setEditUploadedPhotos(animal.photoUrls || []);
    setEditDialogOpen(true);
  };

  const handleCreateSubmit = (data: AnimalFormData) => {
    createAnimalMutation.mutate(data);
  };

  const handleEditSubmit = (data: AnimalFormData) => {
    if (!editingAnimal) return;
    
    // If changing status to foster, show assignment dialog
    // Compare against the original status, not the current editingAnimal.status which may have been mutated
    if (data.status === "foster" && originalEditStatus !== "foster") {
      // Store the pending edit data (excluding status) to apply after foster assignment
      const { status, ...otherData } = data;
      setPendingEditData(otherData);
      
      // Close edit dialog first
      setEditDialogOpen(false);
      setOriginalEditStatus(null); // Clear the stored status
      // Create animal object with updated data for assignment
      const animalForAssignment = { ...editingAnimal, ...data };
      setAnimalToAssign(animalForAssignment as Animal);
      setAssignFosterDialogOpen(true);
      return;
    }

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

  const handleStatusChange = (animalId: string, newStatus: "available" | "pending" | "adopted" | "foster" | "medical_hold" | "deceased") => {
    // If changing to foster status, show assignment dialog
    if (newStatus === "foster") {
      const animal = animals.find(a => a.id === animalId);
      if (animal) {
        setAnimalToAssign(animal);
        setAssignFosterDialogOpen(true);
      }
      return;
    }
    
    // For other status changes, update directly
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "adopted":
        return "bg-blue-500";
      case "foster":
        return "bg-purple-500";
      case "medical_hold":
        return "bg-red-500";
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-animal">
              <Plus className="h-4 w-4 mr-2" />
              Add Animal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Animal</DialogTitle>
              <DialogDescription>
                Add a new animal to your rescue's inventory
              </DialogDescription>
            </DialogHeader>
            <AnimalForm
              onSubmit={handleCreateSubmit}
              isPending={createAnimalMutation.isPending}
              uploadedPhotos={uploadedPhotos}
              setUploadedPhotos={setUploadedPhotos}
            />
          </DialogContent>
        </Dialog>
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
              <div className="space-y-6">
                {/* Filter Controls */}
                {allActiveAnimals.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium">Filter by Status:</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-48 max-w-full" data-testid="select-status-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Active ({allActiveAnimals.length})</SelectItem>
                        <SelectItem value="available">
                          Available ({allActiveAnimals.filter(a => a.status === "available").length})
                        </SelectItem>
                        <SelectItem value="foster">
                          Foster ({allActiveAnimals.filter(a => a.status === "foster").length})
                        </SelectItem>
                        <SelectItem value="pending">
                          Pending ({allActiveAnimals.filter(a => a.status === "pending").length})
                        </SelectItem>
                        <SelectItem value="medical_hold">
                          Medical Hold ({allActiveAnimals.filter(a => a.status === "medical_hold").length})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Active Animals Section */}
                {activeAnimals.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-semibold mb-4" data-testid="heading-active-animals">
                      {statusFilter === "all" 
                        ? `Animals in Care (${activeAnimals.length})`
                        : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).replace('_', ' ')} Animals (${activeAnimals.length})`
                      }
                    </h2>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {activeAnimals.map((animal) => (
                        <Card key={animal.id} className="hover-elevate" data-testid={`card-animal-${animal.id}`}>
                          <CardHeader className="p-3 sm:p-6">
                            <div className="flex items-start justify-between flex-wrap gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {/* Behavior Safety Indicator */}
                                  <div 
                                    className={cn(
                                      "w-3 h-3 rounded-full shrink-0",
                                      animal.behaviorColor === "green" && "bg-green-500",
                                      animal.behaviorColor === "yellow" && "bg-yellow-500",
                                      animal.behaviorColor === "red" && "bg-red-500",
                                      animal.behaviorColor === "purple" && "bg-purple-500",
                                      !animal.behaviorColor && "bg-green-500"
                                    )}
                                    title={
                                      animal.behaviorColor === "green" ? "Safe for All" :
                                      animal.behaviorColor === "yellow" ? `Caution: ${animal.behaviorRestrictionReason || "Trained Volunteers Only"}` :
                                      animal.behaviorColor === "red" ? `DANGER: ${animal.behaviorRestrictionReason || "Staff Only"}` :
                                      animal.behaviorColor === "purple" ? "Medical Isolation" :
                                      "Caution - Trained Volunteers Only"
                                    }
                                    data-testid={`indicator-behavior-${animal.id}`}
                                  />
                                  <CardTitle data-testid={`text-animal-name-${animal.id}`} className="break-words">{animal.name}</CardTitle>
                                  {animal.animalId && (
                                    <Badge variant="outline" className="text-xs font-mono shrink-0">
                                      {animal.animalId}
                                    </Badge>
                                  )}
                                </div>
                                <CardDescription className="text-sm break-words">
                                  {animal.breed} • {animal.age}
                                </CardDescription>
                                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span data-testid={`text-days-in-care-${animal.id}`}>
                                    {calculateDaysInCare(animal)} {calculateDaysInCare(animal) === 1 ? 'day' : 'days'} in care
                                  </span>
                                </div>
                                {animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Badge variant="secondary" className="text-sm font-bold bg-primary/10 text-primary border-primary/20" data-testid={`badge-kennel-location-${animal.id}`}>
                                      <MapPin className="h-3 w-3 mr-1" />
                                      {animal.kennelRowName} - #{animal.kennelPosition + 1}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              <Badge className={`${getStatusColor(animal.status)} shrink-0`}>
                                {animal.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
                            {animal.photoUrls && animal.photoUrls.length > 0 && (
                              <div className="relative w-full aspect-[16/9] sm:aspect-[4/3] bg-muted rounded-md overflow-hidden">
                                <img
                                  src={animal.photoUrls[currentPhotoIndex[animal.id] || 0]}
                                  alt={`${animal.name} - Photo ${(currentPhotoIndex[animal.id] || 0) + 1}`}
                                  className="w-full h-full object-cover object-center"
                                  data-testid={`img-animal-photo-${animal.id}`}
                                />
                                {animal.photoUrls.length > 1 && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-80 hover:opacity-100"
                                      onClick={() => prevPhoto(animal.id, animal.photoUrls!.length)}
                                      data-testid={`button-prev-photo-${animal.id}`}
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-80 hover:opacity-100"
                                      onClick={() => nextPhoto(animal.id, animal.photoUrls!.length)}
                                      data-testid={`button-next-photo-${animal.id}`}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                      {animal.photoUrls.map((_, index) => (
                                        <div
                                          key={index}
                                          className={`h-1.5 w-1.5 rounded-full ${
                                            index === (currentPhotoIndex[animal.id] || 0)
                                              ? 'bg-white'
                                              : 'bg-white/50'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            <div className="text-sm space-y-1">
                              <p><span className="font-medium">Species:</span> {animal.species}</p>
                              {animal.petfinderGender && <p><span className="font-medium">Gender:</span> {animal.petfinderGender}</p>}
                              {animal.neuterStatus && <p><span className="font-medium">Neuter Status:</span> {animal.neuterStatus}</p>}
                              {animal.microchipNumber && <p><span className="font-medium">Microchip:</span> {animal.microchipNumber}</p>}
                              
                              {/* Cat and Dog Friendly Indicators */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-2" data-testid={`friendly-indicators-${animal.id}`}>
                                <div className="flex items-center gap-1.5" data-testid={`cat-friendly-${animal.id}`}>
                                  <Cat className="h-4 w-4 text-muted-foreground" />
                                  {animal.catFriendly === true && (
                                    <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                                      <Check className="h-3 w-3 mr-1" />
                                      Friendly
                                    </Badge>
                                  )}
                                  {animal.catFriendly === false && (
                                    <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700">
                                      <X className="h-3 w-3 mr-1" />
                                      Not Friendly
                                    </Badge>
                                  )}
                                  {animal.catFriendly === null && (
                                    <span className="text-xs text-muted-foreground">Unknown</span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1.5" data-testid={`dog-friendly-${animal.id}`}>
                                  <Dog className="h-4 w-4 text-muted-foreground" />
                                  {animal.dogFriendly === true && (
                                    <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                                      <Check className="h-3 w-3 mr-1" />
                                      Friendly
                                    </Badge>
                                  )}
                                  {animal.dogFriendly === false && (
                                    <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700">
                                      <X className="h-3 w-3 mr-1" />
                                      Not Friendly
                                    </Badge>
                                  )}
                                  {animal.dogFriendly === null && (
                                    <span className="text-xs text-muted-foreground">Unknown</span>
                                  )}
                                </div>
                              </div>
                              
                              {animal.bio && (
                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="flex items-center gap-1 p-0 h-auto text-muted-foreground hover:text-foreground" data-testid={`button-toggle-bio-${animal.id}`}>
                                      <FileText className="h-3 w-3" />
                                      <span className="text-xs">Bio</span>
                                      <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="pt-2">
                                    <p className="text-muted-foreground text-sm">{animal.bio}</p>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                            {animal.postedToPetfinder && (
                              <div className="border-t pt-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Posted to Petfinder
                                  </Badge>
                                </div>
                                {animal.petfinderUrl && (
                                  <a
                                    href={animal.petfinderUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                    data-testid={`link-petfinder-${animal.id}`}
                                  >
                                    View on Petfinder
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {animal.petfinderSyncedAt && (
                                  <p className="text-xs text-muted-foreground">
                                    Last synced: {new Date(animal.petfinderSyncedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 min-w-0">
                              <Button
                                onClick={() => handleViewDetails(animal)}
                                variant="default"
                                size="sm"
                                className="col-span-2 sm:col-span-1 justify-center"
                                data-testid={`button-view-details-${animal.id}`}
                              >
                                <Users className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Foster Management</span>
                                <span className="sm:hidden ml-2">Foster</span>
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-center"
                                    data-testid={`button-edit-${animal.id}`}
                                  >
                                    <Pencil className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Edit</span>
                                    <ChevronDown className="w-4 h-4 sm:ml-2" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem
                                    onClick={() => handleEditAnimal(animal)}
                                    data-testid={`menu-edit-details-${animal.id}`}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleMarkDeceased(animal)}
                                    data-testid={`menu-mark-deceased-${animal.id}`}
                                  >
                                    Mark Deceased
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleGenerateBio(animal)}
                                    data-testid={`menu-generate-bio-${animal.id}`}
                                  >
                                    <Wand2 className="w-4 h-4 mr-2" />
                                    AI Bio Generator
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleGenerateAdCopy(animal)}
                                    data-testid={`menu-generate-ad-copy-${animal.id}`}
                                  >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    Generate Ad Copy
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleMedicalImport(animal)}
                                    data-testid={`menu-import-medical-${animal.id}`}
                                  >
                                    <FileUp className="w-4 h-4 mr-2" />
                                    Import Vet Records
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <MedicalFundDialog animal={animal} />
                              <Button
                                onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                                variant="outline"
                                size="sm"
                                className="justify-center"
                                data-testid={`button-medical-${animal.id}`}
                              >
                                <Stethoscope className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Medical</span>
                              </Button>
                              <Button
                                onClick={() => navigate(`/dashboard/animals/${animal.id}/applications`)}
                                variant="outline"
                                size="sm"
                                className="justify-center"
                                data-testid={`button-applications-${animal.id}`}
                              >
                                <ClipboardList className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Applications</span>
                              </Button>
                              <Button
                                onClick={() => {
                                  const template = localStorage.getItem('kennel-card-template') || 'public';
                                  window.open(`${basePath}/dashboard/animals/${animal.id}/kennel-card?template=${template}`, '_blank');
                                }}
                                variant="outline"
                                size="sm"
                                className="justify-center"
                                data-testid={`button-kennel-card-${animal.id}`}
                              >
                                <FileText className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Kennel Card</span>
                              </Button>
                              <Button
                                onClick={() => handleQuickPhoto(animal)}
                                variant="outline"
                                size="icon"
                                data-testid={`button-quick-photo-${animal.id}`}
                                title="Quick Photo"
                              >
                                <Camera className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
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

                {/* Adopted Animals Accordion */}
                {adoptedAnimals.length > 0 && (
                  <Accordion type="single" collapsible className="w-full" data-testid="accordion-adopted-animals">
                    <AccordionItem value="adopted">
                      <AccordionTrigger data-testid="trigger-adopted-animals">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">Adopted Animals ({adoptedAnimals.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pt-4">
                          {adoptedAnimals.map((animal) => (
                  <Card key={animal.id} className="hover-elevate" data-testid={`card-animal-${animal.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {/* Behavior Safety Indicator */}
                            <div 
                              className={cn(
                                "w-3 h-3 rounded-full shrink-0",
                                animal.behaviorColor === "green" && "bg-green-500",
                                animal.behaviorColor === "yellow" && "bg-yellow-500",
                                animal.behaviorColor === "red" && "bg-red-500",
                                animal.behaviorColor === "purple" && "bg-purple-500",
                                !animal.behaviorColor && "bg-green-500"
                              )}
                              title={
                                animal.behaviorColor === "green" ? "Safe for All" :
                                animal.behaviorColor === "yellow" ? `Caution: ${animal.behaviorRestrictionReason || "Trained Volunteers Only"}` :
                                animal.behaviorColor === "red" ? `DANGER: ${animal.behaviorRestrictionReason || "Staff Only"}` :
                                animal.behaviorColor === "purple" ? "Medical Isolation" :
                                "Caution - Trained Volunteers Only"
                              }
                              data-testid={`indicator-behavior-${animal.id}`}
                            />
                            <CardTitle data-testid={`text-animal-name-${animal.id}`} className="break-words">{animal.name}</CardTitle>
                            {animal.animalId && (
                              <Badge variant="outline" className="text-xs font-mono shrink-0">
                                {animal.animalId}
                              </Badge>
                            )}
                          </div>
                          <CardDescription>
                            {animal.breed} • {animal.age}
                          </CardDescription>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-days-in-care-${animal.id}`}>
                              {calculateDaysInCare(animal)} {calculateDaysInCare(animal) === 1 ? 'day' : 'days'} in care
                            </span>
                          </div>
                          {animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined && (
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="secondary" className="text-sm font-bold bg-primary/10 text-primary border-primary/20" data-testid={`badge-kennel-location-${animal.id}`}>
                                <MapPin className="h-3 w-3 mr-1" />
                                {animal.kennelRowName} - #{animal.kennelPosition + 1}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <Badge className={`${getStatusColor(animal.status)} shrink-0`}>
                          {animal.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {animal.photoUrls && animal.photoUrls.length > 0 && (
                        <div className="relative w-full aspect-[16/9] sm:aspect-[4/3] bg-muted rounded-md overflow-hidden">
                          <img
                            src={animal.photoUrls[currentPhotoIndex[animal.id] || 0]}
                            alt={`${animal.name} - Photo ${(currentPhotoIndex[animal.id] || 0) + 1}`}
                            className="w-full h-full object-cover object-center"
                            data-testid={`img-animal-photo-${animal.id}`}
                          />
                          {animal.photoUrls.length > 1 && (
                            <>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-80 hover:opacity-100"
                                onClick={() => prevPhoto(animal.id, animal.photoUrls!.length)}
                                data-testid={`button-prev-photo-${animal.id}`}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-80 hover:opacity-100"
                                onClick={() => nextPhoto(animal.id, animal.photoUrls!.length)}
                                data-testid={`button-next-photo-${animal.id}`}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                {animal.photoUrls.map((_, index) => (
                                  <div
                                    key={index}
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      index === (currentPhotoIndex[animal.id] || 0)
                                        ? 'bg-white'
                                        : 'bg-white/50'
                                    }`}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <div className="text-sm space-y-1">
                        <p><span className="font-medium">Species:</span> {animal.species}</p>
                        {animal.petfinderGender && <p><span className="font-medium">Gender:</span> {animal.petfinderGender}</p>}
                        {animal.neuterStatus && <p><span className="font-medium">Neuter Status:</span> {animal.neuterStatus}</p>}
                        {animal.microchipNumber && <p><span className="font-medium">Microchip:</span> {animal.microchipNumber}</p>}
                        {animal.bio && (
                          <Collapsible className="mt-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="flex items-center gap-1 p-0 h-auto text-muted-foreground hover:text-foreground" data-testid={`button-toggle-bio-list-${animal.id}`}>
                                <FileText className="h-3 w-3" />
                                <span className="text-xs">Bio</span>
                                <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2">
                              <p className="text-muted-foreground text-sm">{animal.bio}</p>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                      {animal.postedToPetfinder && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Posted to Petfinder
                            </Badge>
                          </div>
                          {animal.petfinderUrl && (
                            <a
                              href={animal.petfinderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                              data-testid={`link-petfinder-${animal.id}`}
                            >
                              View on Petfinder
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {animal.petfinderSyncedAt && (
                            <p className="text-xs text-muted-foreground">
                              Last synced: {new Date(animal.petfinderSyncedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => handleViewDetails(animal)}
                          variant="default"
                          size="sm"
                          data-testid={`button-view-details-${animal.id}`}
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Foster Management
                        </Button>
                        <Button
                          onClick={() => handleEditAnimal(animal)}
                          variant="outline"
                          size="sm"
                          data-testid={`button-edit-${animal.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                          variant="outline"
                          size="sm"
                          data-testid={`button-medical-${animal.id}`}
                        >
                          <Stethoscope className="w-4 h-4 mr-2" />
                          Medical
                        </Button>
                        <Button
                          onClick={() => navigate(`/dashboard/animals/${animal.id}/applications`)}
                          variant="outline"
                          size="sm"
                          data-testid={`button-applications-${animal.id}`}
                        >
                          <ClipboardList className="w-4 h-4 mr-2" />
                          Applications
                        </Button>
                        <Button
                          onClick={() => {
                            const template = localStorage.getItem('kennel-card-template') || 'public';
                            window.open(`${basePath}/dashboard/animals/${animal.id}/kennel-card?template=${template}`, '_blank');
                          }}
                          variant="outline"
                          size="sm"
                          data-testid={`button-kennel-card-${animal.id}`}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Kennel Card
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}

                {/* Deceased Animals Accordion */}
                {deceasedAnimals.length > 0 && (
                  <Accordion type="single" collapsible className="w-full mt-4" data-testid="accordion-deceased-animals">
                    <AccordionItem value="deceased">
                      <AccordionTrigger data-testid="trigger-deceased-animals">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">Deceased Animals ({deceasedAnimals.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pt-4">
                          {deceasedAnimals.map((animal) => (
                            <Card key={animal.id} className="hover-elevate opacity-75" data-testid={`card-animal-${animal.id}`}>
                              <CardHeader>
                                <div className="flex items-start justify-between flex-wrap gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      {/* Behavior Safety Indicator */}
                                      <div 
                                        className={cn(
                                          "w-3 h-3 rounded-full shrink-0",
                                          animal.behaviorColor === "green" && "bg-green-500",
                                          animal.behaviorColor === "yellow" && "bg-yellow-500",
                                          animal.behaviorColor === "red" && "bg-red-500",
                                          animal.behaviorColor === "purple" && "bg-purple-500",
                                          !animal.behaviorColor && "bg-green-500"
                                        )}
                                        title={
                                          animal.behaviorColor === "green" ? "Safe for All" :
                                          animal.behaviorColor === "yellow" ? `Caution: ${animal.behaviorRestrictionReason || "Trained Volunteers Only"}` :
                                          animal.behaviorColor === "red" ? `DANGER: ${animal.behaviorRestrictionReason || "Staff Only"}` :
                                          animal.behaviorColor === "purple" ? "Medical Isolation" :
                                          "Caution - Trained Volunteers Only"
                                        }
                                        data-testid={`indicator-behavior-${animal.id}`}
                                      />
                                      <CardTitle data-testid={`text-animal-name-${animal.id}`} className="break-words">{animal.name}</CardTitle>
                                      {animal.animalId && (
                                        <Badge variant="outline" className="text-xs font-mono shrink-0">
                                          {animal.animalId}
                                        </Badge>
                                      )}
                                    </div>
                                    <CardDescription>
                                      {animal.breed} • {animal.age}
                                    </CardDescription>
                                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      <span data-testid={`text-days-in-care-${animal.id}`}>
                                        {calculateDaysInCare(animal)} {calculateDaysInCare(animal) === 1 ? 'day' : 'days'} in care
                                      </span>
                                    </div>
                                  </div>
                                  <Badge className={`${getStatusColor(animal.status)} shrink-0`}>
                                    {animal.status}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {animal.deceasedDate && (
                                  <div className="bg-muted p-3 rounded-md text-sm">
                                    <p className="font-medium">Date of Death</p>
                                    <p className="text-muted-foreground">
                                      {new Date(animal.deceasedDate).toLocaleDateString()}
                                    </p>
                                  </div>
                                )}
                                {animal.causeOfDeath && (
                                  <div className="bg-muted p-3 rounded-md text-sm">
                                    <p className="font-medium">Cause</p>
                                    <p className="text-muted-foreground">
                                      {animal.causeOfDeath.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </p>
                                  </div>
                                )}
                                {animal.deceasedNotes && (
                                  <div className="bg-muted p-3 rounded-md text-sm">
                                    <p className="font-medium mb-1">Details</p>
                                    <p className="text-muted-foreground text-xs">
                                      {animal.deceasedNotes}
                                    </p>
                                  </div>
                                )}
                                
                                {/* Cat and Dog Friendly Indicators */}
                                <div className="flex items-center gap-3 pt-2" data-testid={`friendly-indicators-${animal.id}`}>
                                  <div className="flex items-center gap-1.5" data-testid={`cat-friendly-${animal.id}`}>
                                    <Cat className="h-4 w-4 text-muted-foreground" />
                                    {animal.catFriendly === true && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                                        <Check className="h-3 w-3 mr-1" />
                                        Friendly
                                      </Badge>
                                    )}
                                    {animal.catFriendly === false && (
                                      <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700">
                                        <X className="h-3 w-3 mr-1" />
                                        Not Friendly
                                      </Badge>
                                    )}
                                    {animal.catFriendly === null && (
                                      <span className="text-xs text-muted-foreground">Unknown</span>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5" data-testid={`dog-friendly-${animal.id}`}>
                                    <Dog className="h-4 w-4 text-muted-foreground" />
                                    {animal.dogFriendly === true && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                                        <Check className="h-3 w-3 mr-1" />
                                        Friendly
                                      </Badge>
                                    )}
                                    {animal.dogFriendly === false && (
                                      <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700">
                                        <X className="h-3 w-3 mr-1" />
                                        Not Friendly
                                      </Badge>
                                    )}
                                    {animal.dogFriendly === null && (
                                      <span className="text-xs text-muted-foreground">Unknown</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                  <Button
                                    onClick={() => handleViewDetails(animal)}
                                    variant="default"
                                    size="sm"
                                    data-testid={`button-view-details-${animal.id}`}
                                  >
                                    <Users className="w-4 h-4 mr-2" />
                                    Foster Management
                                  </Button>
                                  <Button
                                    onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                                    variant="outline"
                                    size="sm"
                                    data-testid={`button-medical-${animal.id}`}
                                  >
                                    <Stethoscope className="w-4 h-4 mr-2" />
                                    View Medical History
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
    </DashboardLayout>
  );
}
