import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { 
  ArrowLeft, 
  Dog, 
  FileText, 
  Camera, 
  Scale, 
  Heart, 
  Syringe,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Send
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FosterAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  primaryImageUrl: string | null;
  birthDate: string | null;
  sex: string;
  description: string | null;
  fosterStartDate: string;
}

export default function FosterAnimalDetailPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: animal, isLoading } = useQuery<FosterAnimal>({
    queryKey: ["/api/foster/animals", animalId],
    enabled: !!animalId,
  });

  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="container max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <Dog className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Animal Not Found</h2>
            <Button variant="outline" onClick={() => setLocation("/my-fosters")}>
              Back to Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <Button
        variant="ghost"
        onClick={() => setLocation("/my-fosters")}
        className="gap-2"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portal
      </Button>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {animal.primaryImageUrl ? (
              <img
                src={animal.primaryImageUrl}
                alt={animal.name}
                className="w-24 h-24 rounded-xl object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-muted flex items-center justify-center">
                <Dog className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{animal.name}</h1>
              <p className="text-muted-foreground">{animal.breed || animal.species}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">
                  {animal.sex === "male" ? "Male" : animal.sex === "female" ? "Female" : "Unknown"}
                </Badge>
                {animal.birthDate && (
                  <Badge variant="secondary">
                    {formatDistanceToNow(new Date(animal.birthDate))} old
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Fostering since {format(new Date(animal.fosterStartDate), "MMMM d, yyyy")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="bio" data-testid="tab-bio">Bio Builder</TabsTrigger>
          <TabsTrigger value="photos" data-testid="tab-photos">Photos</TabsTrigger>
          <TabsTrigger value="weight" data-testid="tab-weight">Weight</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab animalId={animalId!} />
        </TabsContent>

        <TabsContent value="bio">
          <BioBuilderTab animalId={animalId!} animalName={animal.name} />
        </TabsContent>

        <TabsContent value="photos">
          <PhotosTab animalId={animalId!} />
        </TabsContent>

        <TabsContent value="weight">
          <WeightTab animalId={animalId!} animalName={animal.name} />
        </TabsContent>

        <TabsContent value="notes">
          <BehaviorNotesTab animalId={animalId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ animalId }: { animalId: string }) {
  const { data: medical, isLoading } = useQuery<{ vaccines: any[]; procedures: any[] }>({
    queryKey: ["/api/foster/animals", animalId, "medical"],
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Syringe className="h-5 w-5" />
            Medical Records
          </CardTitle>
          <CardDescription>View-only access to medical history</CardDescription>
        </CardHeader>
        <CardContent>
          {(!medical?.vaccines?.length && !medical?.procedures?.length) ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No medical records available yet
            </p>
          ) : (
            <div className="space-y-4">
              {medical?.vaccines && medical.vaccines.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Vaccinations</h4>
                  <div className="space-y-2">
                    {medical.vaccines.slice(0, 5).map((vaccine: any) => (
                      <div key={vaccine.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                        <span>{vaccine.vaccineName || vaccine.type}</span>
                        <span className="text-muted-foreground">
                          {format(new Date(vaccine.administeredAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {medical?.procedures && medical.procedures.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Procedures</h4>
                  <div className="space-y-2">
                    {medical.procedures.slice(0, 5).map((proc: any) => (
                      <div key={proc.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                        <span>{proc.procedureName || proc.type}</span>
                        <span className="text-muted-foreground">
                          {format(new Date(proc.performedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BioBuilderTab({ animalId, animalName }: { animalId: string; animalName: string }) {
  const { toast } = useToast();

  const { data: existingBio, isLoading } = useQuery<any>({
    queryKey: ["/api/foster/animals", animalId, "bio"],
  });

  const form = useForm({
    defaultValues: {
      isPottyTrained: false,
      isCrateTrained: false,
      isGoodWithKids: false,
      isGoodWithCats: false,
      isGoodWithDogs: false,
      energyLevel: "medium" as "low" | "medium" | "high",
      funniestQuirk: "",
      favoriteActivity: "",
      idealHome: "",
      additionalNotes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/foster/animals/${animalId}/bio`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/animals", animalId, "bio"] });
      toast({
        title: "Bio submitted",
        description: "Your bio has been submitted for staff review.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to submit bio",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (existingBio && existingBio.status === "pending") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-yellow-500 mb-3" />
          <h3 className="font-semibold">Bio Submitted</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your bio is pending staff review
          </p>
          {existingBio.generatedBio && (
            <div className="text-left p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Preview:</h4>
              <p className="text-sm">{existingBio.generatedBio}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (existingBio && existingBio.status === "approved") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
          <h3 className="font-semibold">Bio Approved!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This bio is now live on {animalName}'s profile
          </p>
          {existingBio.generatedBio && (
            <div className="text-left p-4 bg-muted rounded-lg">
              <p className="text-sm">{existingBio.generatedBio}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Get {animalName} Adopted
        </CardTitle>
        <CardDescription>
          Answer a few questions and we'll generate an adoption bio
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => submitMutation.mutate(data))} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="isPottyTrained"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 border rounded-lg">
                    <FormLabel>Potty Trained?</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isCrateTrained"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 border rounded-lg">
                    <FormLabel>Crate Trained?</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isGoodWithKids"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 border rounded-lg">
                    <FormLabel>Good with Kids?</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isGoodWithCats"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 border rounded-lg">
                    <FormLabel>Good with Cats?</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isGoodWithDogs"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-3 border rounded-lg">
                    <FormLabel>Good with Dogs?</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="energyLevel"
                render={({ field }) => (
                  <FormItem className="p-3 border rounded-lg">
                    <FormLabel>Energy Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select energy level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low - Couch Potato</SelectItem>
                        <SelectItem value="medium">Medium - Balanced</SelectItem>
                        <SelectItem value="high">High - Very Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="funniestQuirk"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Funniest Quirk</FormLabel>
                  <FormDescription>What's their cutest or funniest habit?</FormDescription>
                  <FormControl>
                    <Textarea {...field} placeholder="e.g., Does a little dance when excited..." />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="favoriteActivity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Favorite Activity</FormLabel>
                  <FormDescription>What do they love to do most?</FormDescription>
                  <FormControl>
                    <Textarea {...field} placeholder="e.g., Playing fetch in the backyard..." />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="idealHome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ideal Home</FormLabel>
                  <FormDescription>What type of home would be best for them?</FormDescription>
                  <FormControl>
                    <Textarea {...field} placeholder="e.g., A home with a fenced yard..." />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="additionalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anything Else?</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Any other details adopters should know..." />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full gap-2" disabled={submitMutation.isPending} data-testid="button-submit-bio">
              <Send className="h-4 w-4" />
              {submitMutation.isPending ? "Submitting..." : "Generate & Submit Bio"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PhotosTab({ animalId }: { animalId: string }) {
  const { toast } = useToast();
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");

  const { data: photos, isLoading } = useQuery<any[]>({
    queryKey: ["/api/foster/animals", animalId, "photos"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { photoUrl: string; caption: string }) => {
      const response = await apiRequest("POST", `/api/foster/animals/${animalId}/photos`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/animals", animalId, "photos"] });
      setPhotoUrl("");
      setCaption("");
      toast({
        title: "Photo uploaded",
        description: "Your photo has been submitted for review.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to upload photo",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Upload Photo
          </CardTitle>
          <CardDescription>
            Share cute photos to help them get adopted! Golden hour photos work best.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Photo URL</Label>
            <Input
              placeholder="Paste image URL here..."
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              data-testid="input-photo-url"
            />
            <p className="text-xs text-muted-foreground">
              Tip: Upload to a free image host and paste the link here
            </p>
          </div>
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Input
              placeholder="Add a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              data-testid="input-photo-caption"
            />
          </div>
          <Button
            onClick={() => uploadMutation.mutate({ photoUrl, caption })}
            disabled={!photoUrl || uploadMutation.isPending}
            className="w-full"
            data-testid="button-upload-photo"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Photo"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : photos && photos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Photos ({photos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo: any) => (
                <div key={photo.id} className="relative">
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || "Foster photo"}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                  <Badge
                    className="absolute top-2 right-2"
                    variant={photo.isApproved ? "default" : "secondary"}
                  >
                    {photo.isApproved ? "Approved" : "Pending"}
                  </Badge>
                  {photo.caption && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No photos uploaded yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WeightTab({ animalId, animalName }: { animalId: string; animalName: string }) {
  const { toast } = useToast();
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [notes, setNotes] = useState("");

  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/foster/animals", animalId, "weight-logs"],
  });

  const logMutation = useMutation({
    mutationFn: async (data: { weight: string; unit: string; notes: string }) => {
      const response = await apiRequest("POST", `/api/foster/animals/${animalId}/weight-logs`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/animals", animalId, "weight-logs"] });
      setWeight("");
      setNotes("");
      toast({
        title: "Weight logged",
        description: "Weight entry has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to log weight",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const chartData = logs?.map((log: any) => ({
    date: format(new Date(log.loggedAt), "MM/dd"),
    weight: log.weight,
  })).reverse() || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Log Weight
          </CardTitle>
          <CardDescription>
            Track {animalName}'s weight progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number"
                step="0.1"
                placeholder="Weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                data-testid="input-weight"
              />
            </div>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lbs">lbs</SelectItem>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="oz">oz</SelectItem>
                <SelectItem value="g">g</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-weight-notes"
          />
          <Button
            onClick={() => logMutation.mutate({ weight, unit, notes })}
            disabled={!weight || logMutation.isPending}
            className="w-full"
            data-testid="button-log-weight"
          >
            {logMutation.isPending ? "Saving..." : "Log Weight"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : chartData.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Weight Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : logs && logs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Weight History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="font-medium">{log.weight} {log.unit}</span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(log.loggedAt), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No weight entries yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BehaviorNotesTab({ animalId }: { animalId: string }) {
  const { toast } = useToast();
  const [noteType, setNoteType] = useState<"observation" | "concern" | "milestone" | "medical">("observation");
  const [content, setContent] = useState("");
  const [isFlagged, setIsFlagged] = useState(false);

  const { data: notes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/foster/animals", animalId, "behavior-notes"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { noteType: string; content: string; isFlagged: boolean }) => {
      const response = await apiRequest("POST", `/api/foster/animals/${animalId}/behavior-notes`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/animals", animalId, "behavior-notes"] });
      setContent("");
      setIsFlagged(false);
      toast({
        title: "Note saved",
        description: isFlagged ? "Staff has been notified." : "Your note has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const getNoteTypeBadge = (type: string) => {
    switch (type) {
      case "concern":
        return <Badge variant="destructive">Concern</Badge>;
      case "milestone":
        return <Badge variant="default">Milestone</Badge>;
      case "medical":
        return <Badge variant="secondary">Medical</Badge>;
      default:
        return <Badge variant="outline">Observation</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Add Note
          </CardTitle>
          <CardDescription>
            Log observations, milestones, or concerns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={noteType} onValueChange={(v: any) => setNoteType(v)}>
            <SelectTrigger data-testid="select-note-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="observation">General Observation</SelectItem>
              <SelectItem value="milestone">Milestone</SelectItem>
              <SelectItem value="medical">Medical Note</SelectItem>
              <SelectItem value="concern">Concern</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            placeholder="What's happening with this animal?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            data-testid="textarea-note-content"
          />

          <div className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm">Flag for Staff Attention?</span>
            </div>
            <Switch
              checked={isFlagged}
              onCheckedChange={setIsFlagged}
              data-testid="switch-flag-note"
            />
          </div>

          <Button
            onClick={() => submitMutation.mutate({ noteType, content, isFlagged })}
            disabled={!content.trim() || submitMutation.isPending}
            className="w-full"
            data-testid="button-submit-note"
          >
            {submitMutation.isPending ? "Saving..." : "Save Note"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : notes && notes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Previous Notes ({notes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notes.map((note: any) => (
              <div key={note.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  {getNoteTypeBadge(note.noteType)}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <p className="text-sm">{note.content}</p>
                {note.isFlagged && !note.staffReviewedAt && (
                  <Badge variant="outline" className="mt-2 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Pending Staff Review
                  </Badge>
                )}
                {note.staffReviewedAt && (
                  <Badge variant="secondary" className="mt-2 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Reviewed
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No notes yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
