import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Stethoscope, Users, Pencil, ClipboardList, FileText, Camera,
  MapPin, Home, Building2, Truck, Cat, Dog, Baby, Heart,
  Scissors, AlertTriangle, Shield, ShieldAlert, ShieldX,
  Send, X, Wand2, Sparkles, FileUp, History, PawPrint,
  Calendar as CalendarIcon, Check, ExternalLink, ArrowRightLeft, Mail, Phone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Animal } from "@shared/schema";
import { MedicalFundDialog } from "@/components/MedicalFundDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AnimalWithKennel = Animal & {
  kennelRowName?: string | null;
};

export function getHudStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case "available":
      return { bg: "bg-green-100 dark:bg-green-950", text: "text-green-700 dark:text-green-300", border: "border-green-300 dark:border-green-700" };
    case "medical_hold":
      return { bg: "bg-red-100 dark:bg-red-950", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" };
    case "stray_hold":
      return { bg: "bg-orange-100 dark:bg-orange-950", text: "text-orange-700 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" };
    case "adoption_pending":
      return { bg: "bg-yellow-100 dark:bg-yellow-950", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-300 dark:border-yellow-700" };
    case "transfer_pending":
      return { bg: "bg-yellow-100 dark:bg-yellow-950", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-300 dark:border-yellow-700" };
    case "transported":
      return { bg: "bg-teal-100 dark:bg-teal-950", text: "text-teal-700 dark:text-teal-300", border: "border-teal-300 dark:border-teal-700" };
    case "adopted":
      return { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" };
    case "deceased":
      return { bg: "bg-gray-100 dark:bg-gray-900", text: "text-gray-600 dark:text-gray-400", border: "border-gray-300 dark:border-gray-700" };
    default:
      return { bg: "bg-gray-100 dark:bg-gray-900", text: "text-gray-600 dark:text-gray-400", border: "border-gray-300 dark:border-gray-700" };
  }
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface AnimalHudCardProps {
  animal: AnimalWithKennel;
  currentPhotoIndex: Record<string, number>;
  onNextPhoto: (animalId: string, maxIndex: number) => void;
  onPrevPhoto: (animalId: string, maxIndex: number) => void;
  onViewDetails: (animal: Animal) => void;
  onEditAnimal: (animal: Animal) => void;
  onMarkDeceased?: (animal: Animal) => void;
  onGenerateBio?: (animal: Animal) => void;
  onGenerateAdCopy?: (animal: Animal) => void;
  onMedicalImport?: (animal: Animal) => void;
  onHeartwormTreatment?: (animal: Animal) => void;
  onQuickPhoto?: (animal: Animal) => void;
  onChangeLocation?: (animal: Animal) => void;
  onTransferAnimal?: (animal: Animal) => void;
  calculateDaysInCare: (animal: Animal) => number;
  basePath: string;
  navigate: (path: string) => void;
  variant?: "active" | "adopted" | "transported" | "deceased";
  locationTab?: "all" | "facility" | "foster";
  auditSlot?: React.ReactNode;
}

export function AnimalHudCard({
  animal,
  currentPhotoIndex,
  onNextPhoto,
  onPrevPhoto,
  onViewDetails,
  onEditAnimal,
  onMarkDeceased,
  onGenerateBio,
  onGenerateAdCopy,
  onMedicalImport,
  onHeartwormTreatment,
  onQuickPhoto,
  onChangeLocation,
  onTransferAnimal,
  calculateDaysInCare,
  basePath,
  navigate,
  variant = "active",
  locationTab = "all",
  auditSlot,
}: AnimalHudCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const statusColors = getHudStatusColor(animal.status);
  const photoIdx = currentPhotoIndex[animal.id] || 0;
  const hasPhotos = animal.photoUrls && animal.photoUrls.length > 0;
  const isDeceased = variant === "deceased";

  const genderDisplay = animal.petfinderGender
    ? animal.petfinderGender === "Male" ? "M" : animal.petfinderGender === "Female" ? "F" : animal.petfinderGender.charAt(0)
    : "?";

  const breedDisplay = animal.breed || "Unknown";

  return (
    <Card
      className={cn(
        "animal-hud-card shadcn-card rounded-xl border border-card-border text-card-foreground shadow-sm min-w-0 flex flex-col bg-card",
        dropdownOpen && "dropdown-open"
      )}
      data-testid={`card-animal-${animal.id}`}
    >
      <div className="flex flex-row min-h-[160px]">
        <div className="relative w-[42%] shrink-0 bg-muted overflow-hidden rounded-l-md">
          {hasPhotos ? (
            <>
              <img
                src={animal.photoUrls![photoIdx]}
                alt={`${animal.name} - Photo ${photoIdx + 1}`}
                className="w-full h-full object-cover object-top absolute inset-0"
                data-testid={`img-animal-photo-${animal.id}`}
              />
              {animal.photoUrls!.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-70 scale-75"
                    onClick={() => onPrevPhoto(animal.id, animal.photoUrls!.length)}
                    data-testid={`button-prev-photo-${animal.id}`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-70 scale-75"
                    onClick={() => onNextPhoto(animal.id, animal.photoUrls!.length)}
                    data-testid={`button-next-photo-${animal.id}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                    {animal.photoUrls!.map((_, index) => (
                      <div
                        key={index}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          index === photoIdx ? "bg-white" : "bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center min-h-[140px]">
              <PawPrint className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute top-1.5 left-1.5" data-testid={`indicator-behavior-${animal.id}`}>
            <div
              className={cn(
                "w-4 h-4 rounded-full border border-white/50 shadow-sm",
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
                "Safe for All"
              }
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5">
            <h3 className="font-bold text-white text-sm leading-tight truncate drop-shadow-sm" data-testid={`text-animal-name-${animal.id}`}>
              {animal.name}
            </h3>
            {animal.animalId && (
              <span className="text-white/80 text-[10px] font-mono drop-shadow-sm" data-testid={`text-animal-id-${animal.id}`}>
                ({animal.animalId})
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col bg-card">
          <div className="flex justify-end p-1.5 pb-0 gap-1 flex-wrap">
            {animal.medicalHold && (
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border px-1.5 py-0 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                data-testid={`badge-medical-hold-${animal.id}`}
              >
                <ShieldAlert className="w-3 h-3 mr-0.5" />
                Med Hold
              </Badge>
            )}
            {animal.pendingFosterUserId ? (
              <PendingFosterBadge animal={animal} />
            ) : (
              <Badge
                variant="outline"
                className={cn("text-[10px] font-semibold border px-1.5 py-0", statusColors.bg, statusColors.text, statusColors.border)}
                data-testid={`badge-status-${animal.id}`}
              >
                {formatStatus(animal.status)}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 border-t border-b mx-1.5 my-1" data-testid={`stats-grid-${animal.id}`}>
            <div className="border-r border-b px-2 py-1.5 text-center">
              <span className="text-xs font-bold text-foreground" data-testid={`stat-gender-${animal.id}`}>{genderDisplay}</span>
            </div>
            <div className="border-b px-2 py-1.5 text-center">
              <span className="text-xs font-bold text-foreground" data-testid={`stat-age-${animal.id}`}>{animal.age || "?"}</span>
            </div>
            <div className="border-r px-2 py-1.5 text-center">
              <span className="text-xs font-bold text-foreground" data-testid={`stat-weight-${animal.id}`}>{animal.weight ? `${animal.weight} lbs` : "?"}</span>
            </div>
            <div className="px-2 py-1.5 flex items-center justify-center">
              <span className="text-[10px] text-foreground leading-tight line-clamp-1 font-bold" data-testid={`stat-breed-${animal.id}`} title={breedDisplay}>{breedDisplay}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 px-1.5 py-1.5 flex-wrap" data-testid={`hud-icons-${animal.id}`}>
            {animal.heartwormPositive && (
              <HudBadgeIcon
                icon={<Heart className="h-3 w-3" />}
                variant="danger"
                label="HW+"
                title="Heartworm Positive"
                testId={`badge-hw-positive-${animal.id}`}
              />
            )}
            {animal.biteHistory && (
              <HudBadgeIcon
                icon={<ShieldX className="h-3 w-3" />}
                variant="danger"
                label="Bite"
                title="Bite History"
                testId={`badge-bite-history-${animal.id}`}
              />
            )}
            {animal.isFlightRisk && (
              <HudBadgeIcon
                icon={<AlertTriangle className="h-3 w-3" />}
                variant="warning"
                label="Flight"
                title="Flight Risk - Escape Artist"
                testId={`badge-flight-risk-${animal.id}`}
              />
            )}
            {animal.needsSpayNeuter && (
              <HudBadgeIcon
                icon={<Scissors className="h-3 w-3" />}
                variant="warning"
                label="S/N"
                title="Needs Spay/Neuter"
                testId={`badge-needs-sn-${animal.id}`}
              />
            )}
            {animal.specialDiet && (
              <HudBadgeIcon
                icon={<Shield className="h-3 w-3" />}
                variant="info"
                label="Diet"
                title="Special Diet Required"
                testId={`badge-special-diet-${animal.id}`}
              />
            )}
            {animal.dogFriendly === false && (
              <HudBadgeIcon
                icon={<Dog className="h-3 w-3" />}
                variant="danger"
                label="No Dogs"
                title="Not Dog Friendly"
                testId={`badge-no-dogs-${animal.id}`}
              />
            )}
            {animal.catFriendly === false && (
              <HudBadgeIcon
                icon={<Cat className="h-3 w-3" />}
                variant="danger"
                label="No Cats"
                title="Not Cat Friendly"
                testId={`badge-no-cats-${animal.id}`}
              />
            )}
            {animal.childFriendly === false && (
              <HudBadgeIcon
                icon={<Baby className="h-3 w-3" />}
                variant="danger"
                label="No Kids"
                title="Not Child Friendly"
                testId={`badge-no-kids-${animal.id}`}
              />
            )}
          </div>

          <LocationBar animal={animal} locationTab={locationTab} className="mx-1.5 mb-1" />
        </div>
      </div>
      {animal.needsFence && (
        <div className="px-3 pt-1">
          <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
            Fence Required
          </Badge>
        </div>
      )}
      {animal.specialNeeds && (
        <div className="px-3 pt-1">
          <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">
            Special Needs
          </Badge>
        </div>
      )}
      {isDeceased && animal.deceasedDate && (
        <div className="mx-3 mt-1 bg-muted p-2 rounded-md text-xs space-y-1">
          <p className="font-medium">
            Passed: {new Date(animal.deceasedDate).toLocaleDateString()}
          </p>
          {animal.causeOfDeath && (
            <p className="text-muted-foreground">
              {animal.causeOfDeath.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </p>
          )}
        </div>
      )}
      {animal.postedToPetfinder && (
        <div className="flex items-center gap-2 text-xs px-3 pt-1">
          <Badge variant="outline" className="text-xs gap-1">
            <Check className="h-3 w-3" />
            Petfinder
          </Badge>
          {animal.petfinderUrl && (
            <a
              href={animal.petfinderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-0.5"
              data-testid={`link-petfinder-${animal.id}`}
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
      <div className="px-2 pb-2 pt-1 bg-card">
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between gap-1 bg-accent"
              data-testid={`button-expand-actions-${animal.id}`}
            >
              <span className="text-xs">Actions</span>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-2 space-y-2">
              {animal.microchipNumber && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <PawPrint className="h-3 w-3" />
                  Chip: {animal.microchipNumber}
                </div>
              )}
              {animal.intakeDate && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  Intake: {new Date(animal.intakeDate).toLocaleDateString()}
                </div>
              )}
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {calculateDaysInCare(animal)} {calculateDaysInCare(animal) === 1 ? "day" : "days"} in care
              </div>

              {animal.bio && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center gap-1 p-0 h-auto text-muted-foreground" data-testid={`button-toggle-bio-${animal.id}`}>
                      <FileText className="h-3 w-3" />
                      <span className="text-xs">Bio</span>
                      <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-1">
                    <p className="text-muted-foreground text-xs">{animal.bio}</p>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {isDeceased && animal.deceasedNotes && (
                <div className="bg-muted p-2 rounded-md text-xs">
                  <p className="font-medium mb-0.5">Notes</p>
                  <p className="text-muted-foreground">{animal.deceasedNotes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {variant === "active" && (
                  <>
                    <Button
                      onClick={() => onViewDetails(animal)}
                      variant="default"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-view-details-${animal.id}`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Foster
                    </Button>

                    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-center"
                          data-testid={`button-edit-${animal.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1.5" />
                          Edit
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={4} avoidCollisions={false}>
                        <DropdownMenuItem
                          onClick={() => onEditAnimal(animal)}
                          data-testid={`menu-edit-details-${animal.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        {onMarkDeceased && (
                          <DropdownMenuItem
                            onClick={() => onMarkDeceased(animal)}
                            data-testid={`menu-mark-deceased-${animal.id}`}
                          >
                            Mark Deceased
                          </DropdownMenuItem>
                        )}
                        {onGenerateBio && (
                          <DropdownMenuItem
                            onClick={() => onGenerateBio(animal)}
                            data-testid={`menu-generate-bio-${animal.id}`}
                          >
                            <Wand2 className="w-4 h-4 mr-2" />
                            AI Bio Generator
                          </DropdownMenuItem>
                        )}
                        {onGenerateAdCopy && (
                          <DropdownMenuItem
                            onClick={() => onGenerateAdCopy(animal)}
                            data-testid={`menu-generate-ad-copy-${animal.id}`}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Ad Copy
                          </DropdownMenuItem>
                        )}
                        {onMedicalImport && (
                          <DropdownMenuItem
                            onClick={() => onMedicalImport(animal)}
                            data-testid={`menu-import-medical-${animal.id}`}
                          >
                            <FileUp className="w-4 h-4 mr-2" />
                            Import Vet Records
                          </DropdownMenuItem>
                        )}
                        {onHeartwormTreatment && animal.heartwormPositive && ["adoption_pending", "adopted"].includes(animal.status) && (
                          <DropdownMenuItem
                            onClick={() => onHeartwormTreatment(animal)}
                            data-testid={`menu-heartworm-treatment-${animal.id}`}
                          >
                            <Heart className="w-4 h-4 mr-2" />
                            Heartworm Treatment Plan
                          </DropdownMenuItem>
                        )}
                        {onChangeLocation && (
                          <DropdownMenuItem
                            onClick={() => onChangeLocation(animal)}
                            data-testid={`menu-change-location-${animal.id}`}
                          >
                            <ArrowRightLeft className="w-4 h-4 mr-2" />
                            Change Location
                          </DropdownMenuItem>
                        )}
                        {onTransferAnimal && variant === "active" && (
                          <DropdownMenuItem
                            onClick={() => onTransferAnimal(animal)}
                            data-testid={`menu-transfer-animal-${animal.id}`}
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Transfer to Network Rescue
                          </DropdownMenuItem>
                        )}
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
                      <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                      Medical
                    </Button>

                    <Button
                      onClick={() => navigate(`/dashboard/animals/${animal.id}/applications`)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-applications-${animal.id}`}
                    >
                      <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                      Apps
                    </Button>

                    {auditSlot}

                    <Button
                      onClick={() => {
                        const template = localStorage.getItem("kennel-card-template") || "public";
                        window.open(
                          `${basePath}/dashboard/animals/${animal.id}/kennel-card?template=${template}`,
                          "_blank"
                        );
                      }}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-kennel-card-${animal.id}`}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      Kennel
                    </Button>

                    {onQuickPhoto && (
                      <Button
                        onClick={() => onQuickPhoto(animal)}
                        variant="outline"
                        size="sm"
                        className="justify-center"
                        data-testid={`button-quick-photo-${animal.id}`}
                        title="Quick Photo"
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" />
                        Photo
                      </Button>
                    )}
                  </>
                )}

                {variant === "adopted" && (
                  <>
                    <Button
                      onClick={() => onViewDetails(animal)}
                      variant="default"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-view-details-${animal.id}`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Foster
                    </Button>
                    <Button
                      onClick={() => onEditAnimal(animal)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-edit-${animal.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-medical-${animal.id}`}
                    >
                      <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                      Medical
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/animals/${animal.id}/applications`)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-applications-${animal.id}`}
                    >
                      <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                      Applications
                    </Button>
                    <Button
                      onClick={() => {
                        const template = localStorage.getItem("kennel-card-template") || "public";
                        window.open(
                          `${basePath}/dashboard/animals/${animal.id}/kennel-card?template=${template}`,
                          "_blank"
                        );
                      }}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-kennel-card-${animal.id}`}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      Kennel Card
                    </Button>
                  </>
                )}

                {variant === "transported" && (
                  <>
                    <Button
                      onClick={() => onViewDetails(animal)}
                      variant="default"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-view-details-${animal.id}`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Foster
                    </Button>
                    <Button
                      onClick={() => onEditAnimal(animal)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-edit-${animal.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-medical-${animal.id}`}
                    >
                      <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                      Medical
                    </Button>
                  </>
                )}

                {variant === "deceased" && (
                  <>
                    <Button
                      onClick={() => onViewDetails(animal)}
                      variant="default"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-view-details-${animal.id}`}
                    >
                      <Users className="w-3.5 h-3.5 mr-1.5" />
                      Foster
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/animals/${animal.id}/medical`)}
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      data-testid={`button-medical-${animal.id}`}
                    >
                      <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                      Medical
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}

function HudBadgeIcon({
  icon,
  variant,
  label,
  title,
  testId,
}: {
  icon: React.ReactNode;
  variant: "danger" | "warning" | "info";
  label: string;
  title: string;
  testId: string;
}) {
  const variantStyles = {
    danger: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700",
    warning: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    info: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold shrink-0",
        variantStyles[variant]
      )}
      title={title}
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function LocationBar({ animal, locationTab, className }: { animal: AnimalWithKennel; locationTab?: string; className?: string }) {
  if (locationTab === "foster" && animal.locationType === "foster") {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1.5 rounded-md", className)} data-testid={`badge-foster-location-${animal.id}`}>
        <Home className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="font-medium text-indigo-700 dark:text-indigo-300 truncate">{animal.locationName || "Foster Home"}</span>
      </div>
    );
  }

  if (locationTab === "facility") {
    if (animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined) {
      return (
        <div className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-[#fcfc9d80]", className)} data-testid={`badge-kennel-location-${animal.id}`}>
          <Building2 className="h-3 w-3 text-primary shrink-0" />
          <span className="font-medium text-foreground truncate">{animal.kennelRowName} - #{animal.kennelPosition + 1}</span>
        </div>
      );
    }
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md", className)} data-testid={`badge-location-${animal.id}`}>
        <Building2 className="h-3 w-3 shrink-0" />
        <span>No kennel assigned</span>
      </div>
    );
  }

  if (animal.kennelRowName && animal.kennelPosition !== null && animal.kennelPosition !== undefined) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded-md bg-[#fcfc9d80]", className)} data-testid={`badge-kennel-location-${animal.id}`}>
        <MapPin className="h-3 w-3 text-primary shrink-0" />
        <span className="font-medium text-foreground truncate">{animal.kennelRowName} - #{animal.kennelPosition + 1}</span>
      </div>
    );
  }

  if (animal.locationType && animal.locationType !== "shelter") {
    const locationIcons: Record<string, typeof Home> = {
      foster: Home,
      clinic: Building2,
      transport: Truck,
      offsite: MapPin,
    };
    const locationLabels: Record<string, string> = {
      foster: "Foster:",
      clinic: "Clinic:",
      transport: "Transport:",
      offsite: "Offsite:",
    };
    const LocIcon = locationIcons[animal.locationType] || MapPin;
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md", className)} data-testid={`badge-location-${animal.id}`}>
        <LocIcon className="h-3 w-3 shrink-0" />
        <span>{locationLabels[animal.locationType] || animal.locationType}</span>
        {animal.locationName && <span className="text-foreground font-medium truncate">{animal.locationName}</span>}
      </div>
    );
  }

  return null;
}

function PendingFosterBadge({ animal }: { animal: Animal }) {
  const { toast } = useToast();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="text-[10px] font-semibold border cursor-pointer px-1.5 py-0 bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700"
          data-testid={`badge-pending-foster-${animal.id}`}
        >
          Waiting for Sig
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2"
            data-testid={`button-resend-placement-${animal.id}`}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await apiRequest("POST", `/api/animals/${animal.id}/resend-placement-link`);
                const data = await res.json();
                toast({
                  title: "Link Resent",
                  description: data.message || "Signing link has been resent.",
                });
              } catch (err: any) {
                toast({
                  title: "Error",
                  description: err.message || "Failed to resend link",
                  variant: "destructive",
                });
              }
            }}
          >
            <Send className="h-4 w-4" />
            Resend Signing Link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 text-destructive"
            data-testid={`button-cancel-placement-${animal.id}`}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await apiRequest("POST", `/api/animals/${animal.id}/cancel-placement`);
                const data = await res.json();
                toast({
                  title: "Placement Cancelled",
                  description: data.message || "Foster placement has been cancelled.",
                });
                queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
              } catch (err: any) {
                toast({
                  title: "Error",
                  description: err.message || "Failed to cancel placement",
                  variant: "destructive",
                });
              }
            }}
          >
            <X className="h-4 w-4" />
            Cancel Transfer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
