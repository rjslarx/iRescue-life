import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAnimalSchema, type Animal, PETFINDER_TYPES, PETFINDER_AGES, PETFINDER_SIZES, PETFINDER_GENDERS } from "@shared/schema";
import { PETFINDER_BREEDS, getBreedsForType, mapSpeciesToPetfinderType } from "@shared/petfinder-breeds";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, AlertCircle, Wand2, ChevronsUpDown } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AiBioGeneratorDialog } from "@/components/AiBioGeneratorDialog";

const MAX_PHOTOS = 6;
const MAX_PHOTO_SIZE_MB = 25;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;

const friendlyStatusEnum = z.enum(["yes", "no", "unknown"]);
const behaviorColorEnum = z.enum(["green", "yellow", "red", "purple"]);

const animalFormSchema = insertAnimalSchema.omit({ tenantId: true }).extend({
  petfinderType: z.enum(PETFINDER_TYPES, { required_error: "Type is required" }),
  petfinderBreed: z.string().min(1, "Breed is required"),
  petfinderBreedSecondary: z.string().optional().nullable(),
  petfinderAge: z.enum(PETFINDER_AGES, { required_error: "Age category is required" }),
  petfinderSize: z.enum(PETFINDER_SIZES, { required_error: "Size is required" }),
  petfinderGender: z.enum(PETFINDER_GENDERS, { required_error: "Gender is required" }),
  age: z.string().optional().default(""),
  breed: z.string().optional().default(""),
  species: z.string().optional().default(""),
  name: z.string().min(1, "Name is required"),
  bio: z.string().optional(),
  neuterStatus: z.enum(["intact", "neutered", "spayed", "unknown"]).optional(),
  dateOfBirth: z.date().optional().nullable(),
  microchipNumber: z.string().optional(),
  medicalAlertMemo: z.string().optional(),
  behaviorColor: behaviorColorEnum.default("green"),
  behaviorRestrictionReason: z.string().optional(),
  weight: z.string().optional(),
  intakeSource: z.enum(["stray", "owner_surrender", "transfer", "born_in_care", "other"]).optional(),
  intakeDate: z.date().optional().nullable(),
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  dietaryRestrictions: z.string().optional(),
  catFriendly: friendlyStatusEnum.optional(),
  dogFriendly: friendlyStatusEnum.optional(),
  childFriendly: friendlyStatusEnum.optional(),
  photoUrls: z.array(z.string()).optional().default([]),
  status: z.enum(["available", "pending", "adopted", "foster", "medical_hold", "deceased", "bite_hold", "stray_hold", "transfer_pending"]).default("available"),
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

export type AnimalDataFormMode = 'add' | 'edit' | 'copy';

interface AnimalDataFormProps {
  animalId?: string;
  initialData?: Partial<Animal>;
  onSuccess?: (animal: Animal) => void;
  onCancel?: () => void;
}

export function AnimalDataForm({ animalId, initialData, onSuccess, onCancel }: AnimalDataFormProps) {
  const { toast } = useToast();
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [bioGeneratorOpen, setBioGeneratorOpen] = useState(false);
  
  const mode: AnimalDataFormMode = animalId ? 'edit' : (initialData ? 'copy' : 'add');
  
  const { data: fetchedAnimal, isLoading: isLoadingAnimal } = useQuery<Animal>({
    queryKey: ['/api/animals', animalId],
    enabled: !!animalId,
  });
  
  const animalData = animalId ? fetchedAnimal : initialData;
  
  const { data: buildingsData } = useQuery<KennelBuilding[]>({
    queryKey: ['/api/kennel-buildings'],
  });
  
  const { data: occupancyData } = useQuery<KennelOccupancy[]>({
    queryKey: ['/api/kennel-occupancy'],
  });
  
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [selectedRowId, setSelectedRowId] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  
  useEffect(() => {
    if (animalData) {
      setSelectedBuildingId(animalData.kennelBuildingId || '');
      setSelectedRowId(animalData.kennelRowId || '');
      setSelectedPosition(animalData.kennelPosition ?? null);
      setUploadedPhotos(animalData.photoUrls || []);
    } else if (mode === 'add') {
      setSelectedBuildingId('');
      setSelectedRowId('');
      setSelectedPosition(null);
      setUploadedPhotos([]);
    }
  }, [animalData, mode]);
  
  const handleBuildingChange = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    setSelectedRowId('');
    setSelectedPosition(null);
  };
  
  const handleRowChange = (rowId: string) => {
    setSelectedRowId(rowId);
    setSelectedPosition(null);
  };
  
  const availableRows = useMemo(() => {
    if (!selectedBuildingId || !buildingsData) return [];
    const building = buildingsData.find(b => b.id === selectedBuildingId);
    return building?.rows || [];
  }, [selectedBuildingId, buildingsData]);
  
  const selectedRow = useMemo(() => {
    if (!selectedRowId || !availableRows.length) return null;
    return availableRows.find(r => r.id === selectedRowId) || null;
  }, [selectedRowId, availableRows]);
  
  const positionOptions = useMemo(() => {
    if (!selectedRow || !selectedBuildingId) return [];
    const positions = [];
    for (let i = 0; i < selectedRow.capacity; i++) {
      const occupant = occupancyData?.find(
        o => o.buildingId === selectedBuildingId && 
             o.rowId === selectedRowId && 
             o.position === i
      );
      const isCurrentAnimalPosition = occupant && animalId === occupant.animalId;
      positions.push({
        position: i,
        label: `#${i + 1}`,
        occupied: !!occupant && !isCurrentAnimalPosition,
        occupantName: occupant?.name || null,
      });
    }
    return positions;
  }, [selectedRow, selectedBuildingId, selectedRowId, occupancyData, animalId]);
  
  const form = useForm<AnimalFormData>({
    resolver: zodResolver(animalFormSchema),
    defaultValues: {
      name: "",
      petfinderType: undefined,
      petfinderBreed: "",
      petfinderBreedSecondary: null,
      petfinderAge: undefined,
      petfinderSize: undefined,
      petfinderGender: undefined,
      species: "",
      breed: "",
      age: "",
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
    },
  });
  
  useEffect(() => {
    if (animalData) {
      form.reset({
        name: animalData.name || "",
        petfinderType: animalData.petfinderType || mapSpeciesToPetfinderType(animalData.species) || undefined,
        petfinderBreed: animalData.petfinderBreed || animalData.breed || "",
        petfinderBreedSecondary: animalData.petfinderBreedSecondary || null,
        petfinderAge: animalData.petfinderAge || undefined,
        petfinderSize: animalData.petfinderSize || undefined,
        petfinderGender: animalData.petfinderGender || undefined,
        species: animalData.species || "",
        breed: animalData.breed || "",
        age: animalData.age || "",
        neuterStatus: animalData.neuterStatus || undefined,
        dateOfBirth: animalData.dateOfBirth ? new Date(animalData.dateOfBirth) : null,
        microchipNumber: animalData.microchipNumber || "",
        medicalAlertMemo: animalData.medicalAlertMemo || "",
        behaviorColor: animalData.behaviorColor || "green",
        behaviorRestrictionReason: animalData.behaviorRestrictionReason || "",
        weight: animalData.weight || "",
        intakeSource: animalData.intakeSource || undefined,
        intakeDate: animalData.intakeDate ? new Date(animalData.intakeDate) : null,
        activityLevel: animalData.activityLevel || undefined,
        dietaryRestrictions: animalData.dietaryRestrictions || "",
        catFriendly: booleanToFriendlyStatus(animalData.catFriendly),
        dogFriendly: booleanToFriendlyStatus(animalData.dogFriendly),
        childFriendly: booleanToFriendlyStatus(animalData.childFriendly),
        bio: animalData.bio || "",
        photoUrls: animalData.photoUrls || [],
        status: animalData.status || "available",
        postedToPetfinder: animalData.postedToPetfinder || false,
        petfinderUrl: animalData.petfinderUrl || "",
        petfinderSyncedAt: animalData.petfinderSyncedAt ? new Date(animalData.petfinderSyncedAt) : null,
        houseTrained: animalData.houseTrained ?? null,
        declawed: animalData.declawed ?? null,
        specialNeeds: animalData.specialNeeds ?? null,
        shotsCurrent: animalData.shotsCurrent ?? null,
        heartwormPositive: animalData.heartwormPositive ?? null,
      });
      if (animalData.photoUrls) {
        setUploadedPhotos(animalData.photoUrls);
      }
    }
  }, [animalData, form]);
  
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/animals', data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-occupancy'] });
      toast({
        title: "Animal Created",
        description: `${data.animal?.name || 'Animal'} has been added successfully.`,
      });
      onSuccess?.(data.animal);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create animal",
        variant: "destructive",
      });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', `/api/animals/${animalId}`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals', animalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/kennel-occupancy'] });
      toast({
        title: "Animal Updated",
        description: `${data.animal?.name || 'Animal'} has been updated successfully.`,
      });
      onSuccess?.(data.animal);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update animal",
        variant: "destructive",
      });
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
  
  const handleSubmit = (data: AnimalFormData) => {
    if (data.postedToPetfinder && uploadedPhotos.length === 0) {
      toast({
        title: "Photo Required",
        description: "At least 1 photo is required when marking an animal as posted to Petfinder.",
        variant: "destructive",
      });
      return;
    }
    
    const derivedSpecies = data.petfinderType || "";
    const derivedBreed = data.petfinderBreedSecondary 
      ? `${data.petfinderBreed} / ${data.petfinderBreedSecondary}` 
      : (data.petfinderBreed || "");
    const derivedAge = data.age || data.petfinderAge || "";
    
    const submitData = {
      ...data,
      species: derivedSpecies,
      breed: derivedBreed,
      age: derivedAge,
      catFriendly: friendlyStatusToBoolean(data.catFriendly),
      dogFriendly: friendlyStatusToBoolean(data.dogFriendly),
      childFriendly: friendlyStatusToBoolean(data.childFriendly),
      photoUrls: uploadedPhotos,
      petfinderSyncedAt: data.petfinderSyncedAt ? data.petfinderSyncedAt.toISOString() : null,
      dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toISOString() : null,
      intakeDate: data.intakeDate ? data.intakeDate.toISOString() : null,
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
      kennelBuildingId: selectedBuildingId || null,
      kennelRowId: selectedRowId || null,
      kennelPosition: selectedPosition,
    };
    
    if (mode === 'edit') {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };
  
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isFormDisabled = isPending || (mode === 'edit' && isLoadingAnimal);
  
  if (animalId && isLoadingAnimal) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading animal data...</span>
      </div>
    );
  }
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                <Select onValueChange={field.onChange} value={field.value || ""}>
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

          <div className="mt-4">
            <Label className="text-sm font-medium">Kennel Location</Label>
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
                  <Select onValueChange={field.onChange} value={field.value || "green"}>
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
                  <SelectItem value="bite_hold">Bite Hold</SelectItem>
                  <SelectItem value="stray_hold">Stray Hold</SelectItem>
                  <SelectItem value="transfer_pending">Transfer Pending</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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
        
        <AiBioGeneratorDialog
          animal={form.watch('name') && form.watch('petfinderType') ? {
            name: form.watch('name'),
            species: (() => {
              const petfinderType = form.watch('petfinderType');
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
            id: animalId,
          } : null}
          open={bioGeneratorOpen}
          onOpenChange={setBioGeneratorOpen}
          onBioGenerated={(bio) => {
            form.setValue('bio', bio);
          }}
        />

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
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-animal">
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isFormDisabled}
            data-testid="button-submit-animal"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'edit' ? 'Update Animal' : mode === 'copy' ? 'Create Copy' : 'Add Animal'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
