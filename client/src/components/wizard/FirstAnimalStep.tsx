import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, Heart } from "lucide-react";

interface FirstAnimalStepProps {
  onNext: () => void;
}

const animalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  breed: z.string().min(1, "Breed is required"),
  age: z.string().min(1, "Age is required"),
  sex: z.enum(["male", "female", "unknown"], {
    required_error: "Please select a sex",
  }),
  photoUrls: z.array(z.string()).optional(),
});

type AnimalFormData = z.infer<typeof animalSchema>;

export default function FirstAnimalStep({ onNext }: FirstAnimalStepProps) {
  const { toast } = useToast();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const form = useForm<AnimalFormData>({
    resolver: zodResolver(animalSchema),
    defaultValues: {
      name: "",
      species: "",
      breed: "",
      age: "",
      sex: "unknown",
      photoUrls: [],
    },
  });

  const createAnimalMutation = useMutation({
    mutationFn: async (data: AnimalFormData) => {
      const payload = {
        ...data,
        photoUrls: photoUrls,
        status: "available",
        neuterStatus: "unknown",
      };
      const response = await apiRequest("POST", "/api/animals", payload);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/animals'] });
      toast({
        title: "Animal added!",
        description: `${data.animal.name} has been added to your rescue.`,
      });
      setTimeout(() => onNext(), 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add animal",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });


  const onSubmit = (data: AnimalFormData) => {
    createAnimalMutation.mutate(data);
  };

  const onSkip = () => {
    toast({
      title: "Animal skipped",
      description: "You can add animals later from the dashboard.",
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Add your first animal</h2>
        <p className="text-muted-foreground">
          Let's start showcasing the amazing animals waiting for homes!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Animal Profile</CardTitle>
          <CardDescription>
            Basic information about this animal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Buddy" 
                        {...field} 
                        data-testid="input-animal-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="species"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Species *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Dog" 
                          {...field} 
                          data-testid="input-animal-species"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="breed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breed *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Labrador Mix" 
                          {...field} 
                          data-testid="input-animal-breed"
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
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="2 years" 
                          {...field} 
                          data-testid="input-animal-age"
                        />
                      </FormControl>
                      <FormDescription>
                        e.g., "3 months", "2 years", "Senior"
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sex *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-animal-sex">
                            <SelectValue placeholder="Select sex" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <FormLabel>Photos (Optional)</FormLabel>
                <div className="mt-2 space-y-3">
                  {photoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {photoUrls.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-24 object-cover rounded-md border"
                            data-testid={`img-animal-photo-${index}`}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setPhotoUrls(prev => prev.filter((_, i) => i !== index))}
                            data-testid={`button-remove-photo-${index}`}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ObjectUploader
                    value={photoUrls}
                    onChange={setPhotoUrls}
                    maxFiles={5}
                    uploadEndpoint="/api/animals/photos/upload"
                    showPreview={false}
                    buttonText="Add Photos"
                    data-testid="uploader-animal-photos"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Upload up to 5 photos of this animal
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onSkip}
                  data-testid="button-skip-animal"
                >
                  Skip for Now
                </Button>
                <Button 
                  type="submit" 
                  disabled={createAnimalMutation.isPending}
                  data-testid="button-save-animal"
                >
                  {createAnimalMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Add Animal & Continue"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
