import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Dog, 
  CheckCircle2, 
  Clock, 
  Camera, 
  Scale, 
  Pill, 
  FileText, 
  Package,
  ChevronRight,
  Calendar,
  AlertCircle
} from "lucide-react";
import { format, isToday, formatDistanceToNow } from "date-fns";

interface FosterAnimal {
  id: string;
  name: string;
  species: string;
  breed: string;
  primaryImageUrl: string | null;
  fosterStartDate: string;
  sessionId: string;
}

interface FosterTask {
  id: string;
  animalId: string;
  animalName: string;
  animalPhoto: string | null;
  taskType: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  dueTime: string | null;
  frequency: string;
  completedAt: string | null;
  isActive: boolean;
}

export default function FosterPortalPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("tasks");

  const { data: animals, isLoading: loadingAnimals } = useQuery<FosterAnimal[]>({
    queryKey: ["/api/foster/my-animals"],
  });

  const { data: todayTasks, isLoading: loadingTasks } = useQuery<FosterTask[]>({
    queryKey: ["/api/foster/tasks/today"],
  });

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, notes }: { taskId: string; notes?: string }) => {
      const response = await apiRequest("POST", `/api/foster/tasks/${taskId}/complete`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/tasks/today"] });
      toast({
        title: "Task completed",
        description: "Great job! Keep up the good work.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to complete task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case "medication":
        return <Pill className="h-4 w-4" />;
      case "weight_check":
        return <Scale className="h-4 w-4" />;
      case "photo_request":
        return <Camera className="h-4 w-4" />;
      case "behavior_log":
        return <FileText className="h-4 w-4" />;
      default:
        return <CheckCircle2 className="h-4 w-4" />;
    }
  };

  const pendingTasks = todayTasks?.filter(t => !t.completedAt) || [];
  const completedTasks = todayTasks?.filter(t => t.completedAt) || [];

  if (loadingAnimals || loadingTasks) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!animals || animals.length === 0) {
    return (
      <div className="container max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <Dog className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Foster Animals</h2>
            <p className="text-muted-foreground">
              You don't have any animals in your care right now.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Foster Portal</h1>
          <p className="text-muted-foreground">Your daily shift dashboard</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Dog className="h-3 w-3" />
          {animals.length} {animals.length === 1 ? "Animal" : "Animals"}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
            <Clock className="h-4 w-4" />
            Today's Tasks
            {pendingTasks.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingTasks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="animals" className="gap-2" data-testid="tab-animals">
            <Dog className="h-4 w-4" />
            My Fosters
          </TabsTrigger>
          <TabsTrigger value="supplies" className="gap-2" data-testid="tab-supplies">
            <Package className="h-4 w-4" />
            Supplies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          {pendingTasks.length === 0 && completedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <h3 className="font-semibold">All Caught Up!</h3>
                <p className="text-sm text-muted-foreground">No tasks for today</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    To Do ({pendingTasks.length})
                  </h3>
                  {pendingTasks.map((task) => (
                    <Card key={task.id} className="hover-elevate cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => completeTaskMutation.mutate({ taskId: task.id })}
                            disabled={completeTaskMutation.isPending}
                            data-testid={`checkbox-task-${task.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="gap-1">
                                {getTaskIcon(task.taskType)}
                                {task.taskType.replace("_", " ")}
                              </Badge>
                              {task.dueTime && (
                                <span className="text-sm text-muted-foreground">
                                  {task.dueTime}
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium">{task.title}</h4>
                            {task.description && (
                              <p className="text-sm text-muted-foreground">{task.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              For: {task.animalName}
                            </p>
                          </div>
                          {task.animalPhoto && (
                            <img
                              src={task.animalPhoto}
                              alt={task.animalName}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {completedTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Completed ({completedTasks.length})
                  </h3>
                  {completedTasks.map((task) => (
                    <Card key={task.id} className="opacity-60">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <Checkbox checked={true} disabled />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="secondary" className="gap-1">
                                {getTaskIcon(task.taskType)}
                                {task.taskType.replace("_", " ")}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Done {task.completedAt && formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}
                              </span>
                            </div>
                            <h4 className="font-medium line-through">{task.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              For: {task.animalName}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="animals" className="space-y-4">
          {animals.map((animal) => (
            <Card
              key={animal.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setLocation(`/my-fosters/${animal.id}`)}
              data-testid={`card-animal-${animal.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {animal.primaryImageUrl ? (
                    <img
                      src={animal.primaryImageUrl}
                      alt={animal.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Dog className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg">{animal.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {animal.breed || animal.species}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Fostering since {format(new Date(animal.fosterStartDate), "MMM d, yyyy")}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="supplies">
          <SupplyRequestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SupplyRequestSection() {
  const { toast } = useToast();
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});

  const supplyOptions = [
    { id: "puppy_food", label: "Puppy Food (Bag)", category: "Food" },
    { id: "adult_food", label: "Adult Dog Food (Bag)", category: "Food" },
    { id: "cat_food", label: "Cat Food (Bag)", category: "Food" },
    { id: "kitten_food", label: "Kitten Food (Bag)", category: "Food" },
    { id: "pee_pads", label: "Pee Pads", category: "Supplies" },
    { id: "litter", label: "Cat Litter", category: "Supplies" },
    { id: "crate", label: "Crate", category: "Equipment" },
    { id: "leash", label: "Leash & Collar", category: "Equipment" },
    { id: "dewormer", label: "Dewormer", category: "Medical" },
    { id: "flea_tick", label: "Flea/Tick Prevention", category: "Medical" },
    { id: "heartworm", label: "Heartworm Prevention", category: "Medical" },
  ];

  const { data: existingRequests, isLoading } = useQuery<any[]>({
    queryKey: ["/api/foster/supply-requests"],
  });

  const requestMutation = useMutation({
    mutationFn: async (items: Array<{ item: string; quantity: number }>) => {
      const response = await apiRequest("POST", "/api/foster/supply-requests", { items });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foster/supply-requests"] });
      setSelectedItems({});
      toast({
        title: "Request submitted",
        description: "Staff will prepare your supplies soon.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to submit request",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const items = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([item, quantity]) => ({ item, quantity }));

    if (items.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one item",
        variant: "destructive",
      });
      return;
    }

    requestMutation.mutate(items);
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: prev[itemId] ? 0 : 1,
    }));
  };

  const pendingRequests = existingRequests?.filter(r => r.status === "pending" || r.status === "preparing" || r.status === "ready") || [];

  return (
    <div className="space-y-6">
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((request: any) => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">
                    {request.items.length} {request.items.length === 1 ? "item" : "items"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant={request.status === "ready" ? "default" : "secondary"}>
                  {request.status === "ready" ? "Ready for Pickup" : request.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Supplies</CardTitle>
          <CardDescription>
            Select the items you need and we'll prepare them for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {["Food", "Supplies", "Equipment", "Medical"].map((category) => (
            <div key={category}>
              <h4 className="font-medium text-sm text-muted-foreground mb-2">{category}</h4>
              <div className="grid grid-cols-2 gap-2">
                {supplyOptions
                  .filter((opt) => opt.category === category)
                  .map((option) => (
                    <div
                      key={option.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedItems[option.id]
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => toggleItem(option.id)}
                      data-testid={`supply-item-${option.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!selectedItems[option.id]}
                          onCheckedChange={() => toggleItem(option.id)}
                        />
                        <span className="text-sm">{option.label}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={requestMutation.isPending || Object.values(selectedItems).every(v => !v)}
            data-testid="button-submit-supply-request"
          >
            {requestMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
