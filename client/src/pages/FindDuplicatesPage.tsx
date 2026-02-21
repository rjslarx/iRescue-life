import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Loader2, 
  AlertTriangle, 
  AlertCircle,
  CheckCircle2, 
  GitMerge, 
  ArrowRight, 
  Calendar, 
  Dog, 
  Cat, 
  ChevronRight,
  Search,
  Sparkles
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Animal } from "@shared/schema";

type DuplicateGroup = {
  animals: Animal[];
  matchReason: string;
  confidence: 'high' | 'medium' | 'low';
};

type DuplicatesResponse = {
  duplicateGroups: DuplicateGroup[];
};

const MERGE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'species', label: 'Species' },
  { key: 'breed', label: 'Breed' },
  { key: 'age', label: 'Age' },
  { key: 'sex', label: 'Sex' },
  { key: 'weight', label: 'Weight' },
  { key: 'bio', label: 'Bio / Description' },
  { key: 'medicalAlertMemo', label: 'Medical Alert Memo' },
  { key: 'microchipNumber', label: 'Microchip Number' },
  { key: 'intakeDate', label: 'Intake Date' },
  { key: 'intakeSource', label: 'Intake Source' },
  { key: 'neuterStatus', label: 'Spay/Neuter Status' },
  { key: 'specialNeeds', label: 'Special Needs' },
  { key: 'shotsCurrent', label: 'Shots Current' },
  { key: 'heartwormPositive', label: 'Heartworm Positive' },
  { key: 'dogFriendly', label: 'Good with Dogs' },
  { key: 'catFriendly', label: 'Good with Cats' },
  { key: 'childFriendly', label: 'Good with Kids' },
  { key: 'houseTrained', label: 'House Trained' },
  { key: 'needsFence', label: 'Needs Fence' },
  { key: 'behaviorColor', label: 'Behavior Safety Rating' },
  { key: 'behaviorRestrictionReason', label: 'Behavior Restriction Reason' },
  { key: 'activityLevel', label: 'Activity Level' },
  { key: 'dietaryRestrictions', label: 'Dietary Restrictions' },
  { key: 'kennelLocation', label: 'Kennel Location' },
  { key: 'kennelBuildingId', label: 'Kennel Building' },
  { key: 'kennelRowId', label: 'Kennel Row' },
  { key: 'kennelPosition', label: 'Kennel Position' },
  { key: 'petfinderType', label: 'Petfinder Type' },
  { key: 'petfinderBreed', label: 'Petfinder Breed' },
  { key: 'petfinderBreedSecondary', label: 'Petfinder Secondary Breed' },
  { key: 'petfinderAge', label: 'Petfinder Age' },
  { key: 'petfinderSize', label: 'Petfinder Size' },
  { key: 'petfinderGender', label: 'Petfinder Gender' },
] as const;

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const variants = {
    high: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: AlertTriangle },
    medium: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: AlertTriangle },
    low: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Search },
  };
  
  const { className, icon: Icon } = variants[confidence];
  
  return (
    <Badge className={className}>
      <Icon className="h-3 w-3 mr-1" />
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)} Confidence
    </Badge>
  );
}

function AnimalCard({ animal, isSelected, onClick }: { animal: Animal; isSelected?: boolean; onClick?: () => void }) {
  const photoUrl = animal.photoUrls?.[0];
  const SpeciesIcon = animal.species.toLowerCase().includes('dog') ? Dog : Cat;
  
  return (
    <Card 
      className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary border-primary' : 'hover-elevate'}`}
      onClick={onClick}
      data-testid={`card-animal-${animal.id}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt={animal.name} 
              className="w-20 h-20 rounded-lg object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
              <SpeciesIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{animal.name}</h3>
              <Badge variant="outline" className="text-xs">{animal.animalId}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{animal.breed}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Intake: {animal.intakeDate ? new Date(animal.intakeDate).toLocaleDateString() : 'N/A'}</span>
            </div>
            <Badge variant="secondary" className="mt-2 text-xs">
              {animal.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MergeWizardDialog({ 
  open, 
  onOpenChange, 
  animals 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  animals: Animal[];
}) {
  const [primaryId, setPrimaryId] = useState<string>(animals[0]?.id || '');
  const [secondaryId, setSecondaryId] = useState<string>('');
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'primary' | 'secondary'>>({});
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'select' | 'fields' | 'confirm'>('select');
  const { toast } = useToast();
  
  useEffect(() => {
    if (open) {
      setPrimaryId(animals[0]?.id || '');
      setSecondaryId('');
      setFieldChoices({});
      setNotes('');
      setStep('select');
    }
  }, [open, animals]);
  
  const hasMultipleSecondaries = animals.length > 2;
  const primaryAnimal = animals.find(a => a.id === primaryId);
  const secondaryAnimal = hasMultipleSecondaries 
    ? animals.find(a => a.id === secondaryId)
    : animals.find(a => a.id !== primaryId);
  
  const canProceedFromSelect = primaryId && (hasMultipleSecondaries ? !!secondaryId : true);
  
  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!primaryAnimal || !secondaryAnimal) throw new Error('Invalid selection');
      return apiRequest('POST', '/api/animals/merge', {
        primaryAnimalId: primaryAnimal.id,
        secondaryAnimalId: secondaryAnimal.id,
        fieldChoices,
        notes,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Profiles merged successfully",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/animals/duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      onOpenChange(false);
      setStep('select');
      setFieldChoices({});
      setNotes('');
      setSecondaryId('');
    },
    onError: (error: any) => {
      toast({
        title: "Merge failed",
        description: error.message || "Failed to merge profiles. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleFieldChoice = (field: string, choice: 'primary' | 'secondary') => {
    setFieldChoices(prev => ({ ...prev, [field]: choice }));
  };
  
  const getFieldValue = (animal: Animal | undefined, field: string) => {
    if (!animal) return 'N/A';
    const value = (animal as any)[field];
    if (value === null || value === undefined || value === '') return 'Not set';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Animal Profiles
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && "Select which profile to keep as the primary record."}
            {step === 'fields' && "Choose which data to keep for each field."}
            {step === 'confirm' && "Review and confirm the merge."}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {hasMultipleSecondaries 
                  ? "This group has more than 2 profiles. First select which profile to keep as primary, then select which profile to merge into it."
                  : "The primary profile will be kept, and all records (medical, notes, applications) from the secondary profile will be moved to it."
                }
              </p>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Primary Profile (will be kept)</Label>
                <div className="grid gap-3">
                  {animals.map(animal => (
                    <div key={animal.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`primary-${animal.id}`}
                        name="primaryAnimal"
                        checked={primaryId === animal.id}
                        onChange={() => {
                          setPrimaryId(animal.id);
                          setSecondaryId('');
                          setFieldChoices({});
                        }}
                        className="h-4 w-4"
                        data-testid={`radio-primary-${animal.id}`}
                      />
                      <label htmlFor={`primary-${animal.id}`} className="flex-1">
                        <AnimalCard animal={animal} isSelected={primaryId === animal.id} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              {hasMultipleSecondaries && primaryId && (
                <div className="space-y-2">
                  <Separator />
                  <Label className="text-sm font-medium">Select Profile to Merge Into Primary</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose one profile to merge. You can repeat this process for additional profiles.
                  </p>
                  <div className="grid gap-3">
                    {animals.filter(a => a.id !== primaryId).map(animal => (
                      <div key={animal.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          id={`secondary-${animal.id}`}
                          name="secondaryAnimal"
                          checked={secondaryId === animal.id}
                          onChange={() => setSecondaryId(animal.id)}
                          className="h-4 w-4"
                          data-testid={`radio-secondary-${animal.id}`}
                        />
                        <label htmlFor={`secondary-${animal.id}`} className="flex-1">
                          <AnimalCard animal={animal} isSelected={secondaryId === animal.id} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {step === 'fields' && primaryAnimal && secondaryAnimal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                For each field, choose whether to keep the value from the primary profile or use the value from the secondary profile.
              </p>
              
              <div className="space-y-4">
                {MERGE_FIELDS.map(({ key, label }) => {
                  const primaryValue = getFieldValue(primaryAnimal, key);
                  const secondaryValue = getFieldValue(secondaryAnimal, key);
                  const hasConflict = primaryValue !== secondaryValue;
                  
                  if (!hasConflict) return null;
                  
                  return (
                    <div key={key} className="border rounded-lg p-4">
                      <Label className="text-sm font-medium mb-3 block">{label}</Label>
                      <RadioGroup
                        value={fieldChoices[key] || 'primary'}
                        onValueChange={(value) => handleFieldChoice(key, value as 'primary' | 'secondary')}
                        className="space-y-2"
                      >
                        <div className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                          <RadioGroupItem value="primary" id={`${key}-primary`} className="mt-1" />
                          <div className="flex-1">
                            <Label htmlFor={`${key}-primary`} className="text-sm font-normal cursor-pointer">
                              <span className="text-muted-foreground">Primary:</span> {primaryValue}
                            </Label>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                          <RadioGroupItem value="secondary" id={`${key}-secondary`} className="mt-1" />
                          <div className="flex-1">
                            <Label htmlFor={`${key}-secondary`} className="text-sm font-normal cursor-pointer">
                              <span className="text-muted-foreground">Secondary:</span> {secondaryValue}
                            </Label>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  );
                })}
              </div>
              
              <Separator className="my-4" />
              
              <div>
                <Label htmlFor="merge-notes" className="text-sm font-medium">
                  Merge Notes (Optional)
                </Label>
                <Textarea
                  id="merge-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this merge..."
                  className="mt-2"
                  data-testid="input-merge-notes"
                />
              </div>
            </div>
          )}
          
          {step === 'confirm' && primaryAnimal && secondaryAnimal && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-destructive">This action cannot be undone</h4>
                    <p className="text-sm text-destructive/80 mt-1">
                      Once merged, the secondary profile will be permanently archived and all its records will be moved to the primary profile.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Merge Summary</h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Will be archived</p>
                    <Badge variant="outline">{secondaryAnimal.name}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{secondaryAnimal.animalId}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Primary (kept)</p>
                    <Badge>{primaryAnimal.name}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{primaryAnimal.animalId}</p>
                  </div>
                </div>
              </div>
              
              {Object.keys(fieldChoices).filter(k => fieldChoices[k] === 'secondary').length > 0 && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Fields from Secondary Profile</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    These values will be copied from the archived profile:
                  </p>
                  <div className="space-y-1">
                    {Object.entries(fieldChoices)
                      .filter(([_, choice]) => choice === 'secondary')
                      .map(([field]) => {
                        const fieldConfig = MERGE_FIELDS.find(f => f.key === field);
                        const value = getFieldValue(secondaryAnimal, field);
                        return (
                          <div key={field} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{fieldConfig?.label || field}:</span>
                            <span className="font-medium">{value}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              <div className="text-sm space-y-2">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Medical records will be moved to the primary profile
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Notes and applications will be transferred
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Primary profile photos will be kept (secondary photos remain in archive)
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  The secondary profile will be archived (not deleted)
                </p>
              </div>
              
              {notes && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                  <p className="text-sm">{notes}</p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <DialogFooter className="flex gap-2">
          {step !== 'select' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'confirm' ? 'fields' : 'select')}
              data-testid="button-back"
            >
              Back
            </Button>
          )}
          {step === 'select' && (
            <Button
              onClick={() => setStep('fields')}
              disabled={!canProceedFromSelect}
              data-testid="button-next"
            >
              Next: Review Fields
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 'fields' && (
            <Button
              onClick={() => setStep('confirm')}
              data-testid="button-next"
            >
              Next: Confirm
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 'confirm' && (
            <Button
              onClick={() => mergeMutation.mutate()}
              disabled={mergeMutation.isPending}
              data-testid="button-confirm-merge"
            >
              {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <GitMerge className="h-4 w-4 mr-2" />
              Confirm Merge
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FindDuplicatesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  
  const { data, isLoading, error } = useQuery<DuplicatesResponse>({
    queryKey: ['/api/animals/duplicates'],
  });
  
  if (!user) {
    navigate('/login');
    return null;
  }
  
  return (
    <DashboardLayout 
      title="Find Duplicate Profiles"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Animals", href: "/animals" },
        { label: "Find Duplicates", href: "/animals/duplicates" },
      ]}
    >
      <div className="p-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Duplicate Detection</CardTitle>
            </div>
            <CardDescription>
              Review potential duplicate animal profiles based on name similarity, breed, and intake date. 
              Merge duplicates to keep your records clean and consolidated.
            </CardDescription>
          </CardHeader>
        </Card>
        
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Scanning for duplicates...</span>
          </div>
        )}
        
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Failed to load duplicates. Please try again.</p>
            </CardContent>
          </Card>
        )}
        
        {data && data.duplicateGroups.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <h3 className="text-lg font-semibold mb-2">No Duplicates Found</h3>
              <p className="text-muted-foreground">
                Great news! No potential duplicate profiles were detected in your animal records.
              </p>
            </CardContent>
          </Card>
        )}
        
        {data && data.duplicateGroups.length > 0 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Found {data.duplicateGroups.length} potential duplicate group{data.duplicateGroups.length === 1 ? '' : 's'}. 
              Review each group and merge if appropriate.
            </p>
            
            {data.duplicateGroups.map((group, index) => (
              <Card key={index} data-testid={`card-duplicate-group-${index}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ConfidenceBadge confidence={group.confidence} />
                      <span className="text-sm text-muted-foreground">
                        {group.matchReason}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setSelectedGroup(group)}
                      data-testid={`button-merge-group-${index}`}
                    >
                      <GitMerge className="h-4 w-4 mr-2" />
                      Review & Merge
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {group.animals.map(animal => (
                      <AnimalCard key={animal.id} animal={animal} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {selectedGroup && (
          <MergeWizardDialog
            open={!!selectedGroup}
            onOpenChange={(open) => !open && setSelectedGroup(null)}
            animals={selectedGroup.animals}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
