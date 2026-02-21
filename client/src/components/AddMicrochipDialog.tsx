import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ExternalLink } from "lucide-react";

const microchipSchema = z.object({
  microchipNumber: z.string().min(9, "Microchip number must be at least 9 digits").max(50, "Microchip number cannot exceed 50 characters"),
  manufacturer: z.enum(["homeagain", "24petwatch", "fi", "akc", "avid", "foundanimals", "petlink", "other"], { required_error: "Manufacturer is required" }),
  implantDate: z.string().optional(),
  implantLocation: z.string().optional(),
  chipOrigin: z.enum(["implanted_by_rescue", "found", "transferred_in"], { required_error: "Chip origin is required" }),
  registrationStatus: z.enum(["unregistered", "registered_rescue", "found_unknown", "transferred"], { required_error: "Registration status is required" }),
  registryName: z.string().optional(),
  registeredToName: z.string().optional(),
  registeredToPhone: z.string().optional(),
  registeredToEmail: z.string().optional(),
  notes: z.string().optional(),
});

type MicrochipFormData = z.infer<typeof microchipSchema>;

interface Microchip {
  id: string;
  microchipNumber: string;
  manufacturer: string;
  implantDate?: string | null;
  implantLocation?: string | null;
  chipOrigin: string;
  registrationStatus: string;
  registryName?: string | null;
  registeredToName?: string | null;
  registeredToPhone?: string | null;
  registeredToEmail?: string | null;
  notes?: string | null;
}

interface AddMicrochipDialogProps {
  animalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  microchip?: Microchip | null;
}

const MANUFACTURERS = [
  { value: "homeagain", label: "HomeAgain" },
  { value: "24petwatch", label: "24PetWatch" },
  { value: "fi", label: "Fi" },
  { value: "akc", label: "AKC Reunite" },
  { value: "avid", label: "AVID" },
  { value: "foundanimals", label: "Found Animals" },
  { value: "petlink", label: "PetLink" },
  { value: "other", label: "Other" },
];

const CHIP_ORIGINS = [
  { value: "found", label: "Arrived with chip (intake)" },
  { value: "implanted_by_rescue", label: "Implanted by rescue" },
  { value: "transferred_in", label: "Transferred in from another org" },
];

const REGISTRATION_STATUSES = [
  { value: "unregistered", label: "Unregistered" },
  { value: "registered_rescue", label: "Registered to Rescue" },
  { value: "found_unknown", label: "Found - Unknown Registry" },
  { value: "transferred", label: "Transferred to Adopter" },
];

export function AddMicrochipDialog({ animalId, open, onOpenChange, microchip }: AddMicrochipDialogProps) {
  const { toast } = useToast();
  const isEditing = !!microchip;

  const form = useForm<MicrochipFormData>({
    resolver: zodResolver(microchipSchema),
    defaultValues: {
      microchipNumber: "",
      manufacturer: "",
      implantDate: new Date().toISOString().split('T')[0],
      implantLocation: "between_shoulder_blades",
      chipOrigin: "implanted_by_rescue",
      registrationStatus: "unregistered",
      registryName: "",
      registeredToName: "",
      registeredToPhone: "",
      registeredToEmail: "",
      notes: "",
    },
  });

  const VALID_MANUFACTURERS = ["homeagain", "24petwatch", "fi", "akc", "avid", "foundanimals", "petlink", "other"] as const;
  const VALID_CHIP_ORIGINS = ["implanted_by_rescue", "found", "transferred_in"] as const;
  const VALID_REG_STATUSES = ["unregistered", "registered_rescue", "found_unknown", "transferred"] as const;

  const normalizeEnum = <T extends string>(value: string | undefined | null, valid: readonly T[], fallback: T): T =>
    valid.includes(value as T) ? (value as T) : fallback;

  useEffect(() => {
    if (microchip) {
      form.reset({
        microchipNumber: microchip.microchipNumber || "",
        manufacturer: normalizeEnum(microchip.manufacturer, VALID_MANUFACTURERS, "other"),
        implantDate: microchip.implantDate ? new Date(microchip.implantDate).toISOString().split('T')[0] : "",
        implantLocation: microchip.implantLocation || "between_shoulder_blades",
        chipOrigin: normalizeEnum(microchip.chipOrigin, VALID_CHIP_ORIGINS, "found"),
        registrationStatus: normalizeEnum(microchip.registrationStatus, VALID_REG_STATUSES, "unregistered"),
        registryName: microchip.registryName || "",
        registeredToName: microchip.registeredToName || "",
        registeredToPhone: microchip.registeredToPhone || "",
        registeredToEmail: microchip.registeredToEmail || "",
        notes: microchip.notes || "",
      });
    } else {
      form.reset({
        microchipNumber: "",
        manufacturer: "",
        implantDate: new Date().toISOString().split('T')[0],
        implantLocation: "between_shoulder_blades",
        chipOrigin: "implanted_by_rescue",
        registrationStatus: "unregistered",
        registryName: "",
        registeredToName: "",
        registeredToPhone: "",
        registeredToEmail: "",
        notes: "",
      });
    }
  }, [microchip, form, open]);

  const createMutation = useMutation({
    mutationFn: async (data: MicrochipFormData) => {
      const payload = {
        microchipNumber: data.microchipNumber,
        manufacturer: data.manufacturer,
        implantDate: data.implantDate || null,
        implantLocation: data.implantLocation || null,
        chipOrigin: data.chipOrigin,
        registrationStatus: data.registrationStatus,
        registryName: data.registryName || null,
        registeredToName: data.registeredToName || null,
        registeredToPhone: data.registeredToPhone || null,
        registeredToEmail: data.registeredToEmail || null,
        notes: data.notes || null,
      };
      
      return await apiRequest(`/api/animals/${animalId}/microchips`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/microchips`] });
      toast({
        title: "Success",
        description: "Microchip record created successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create microchip record",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: MicrochipFormData) => {
      const payload = {
        microchipNumber: data.microchipNumber,
        manufacturer: data.manufacturer,
        implantDate: data.implantDate || null,
        implantLocation: data.implantLocation || null,
        chipOrigin: data.chipOrigin,
        registrationStatus: data.registrationStatus,
        registryName: data.registryName || null,
        registeredToName: data.registeredToName || null,
        registeredToPhone: data.registeredToPhone || null,
        registeredToEmail: data.registeredToEmail || null,
        notes: data.notes || null,
      };
      
      return await apiRequest(`/api/microchips/${microchip!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/animals/${animalId}/microchips`] });
      toast({
        title: "Success",
        description: "Microchip record updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update microchip record",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MicrochipFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Microchip Record" : "Add Microchip Record"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update microchip details" : "Enter microchip information for this animal"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="microchipNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Microchip Number *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Enter 9-15 digit number"
                        data-testid="input-microchip-number"
                      />
                    </FormControl>
                    <FormDescription>
                      <a 
                        href="https://www.petmicrochiplookup.org/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-xs"
                      >
                        Lookup chip <ExternalLink className="w-3 h-3" />
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacturer *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-manufacturer">
                          <SelectValue placeholder="Select manufacturer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MANUFACTURERS.map((mfr) => (
                          <SelectItem key={mfr.value} value={mfr.value}>
                            {mfr.label}
                          </SelectItem>
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
                name="implantDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Implant Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        data-testid="input-implant-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="implantLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Implant Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-implant-location">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="between_shoulder_blades">Between Shoulder Blades</SelectItem>
                        <SelectItem value="left_shoulder">Left Shoulder</SelectItem>
                        <SelectItem value="right_shoulder">Right Shoulder</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
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
                name="chipOrigin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chip Origin *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-chip-origin">
                          <SelectValue placeholder="How did animal get chip?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CHIP_ORIGINS.map((origin) => (
                          <SelectItem key={origin.value} value={origin.value}>
                            {origin.label}
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
                name="registrationStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-registration-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REGISTRATION_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="registryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registry Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., HomeAgain, 24PetWatch"
                      data-testid="input-registry-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-3">Current Registration Info</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="registeredToName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered To</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Name"
                          data-testid="input-registered-to-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registeredToPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Phone number"
                          data-testid="input-registered-to-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registeredToEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Email address"
                          data-testid="input-registered-to-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Additional notes about this microchip..."
                      data-testid="textarea-microchip-notes"
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
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-microchip"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-save-microchip"
              >
                {isPending ? "Saving..." : isEditing ? "Update" : "Add Microchip"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
