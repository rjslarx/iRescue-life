import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Save, GripVertical, Zap } from "lucide-react";
import { ALL_QUICK_ACTIONS, DEFAULT_QUICK_ACTIONS, type QuickAction } from "@/lib/quick-actions";

interface QuickActionsResponse {
  quickActions: string[];
}

export default function QuickActionsSettings() {
  const { toast } = useToast();
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<QuickActionsResponse>({
    queryKey: ['/api/tenant/settings/quick-actions'],
  });

  useEffect(() => {
    if (data?.quickActions) {
      setSelectedActions(data.quickActions);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async (quickActions: string[]) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/quick-actions', { quickActions });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings/quick-actions'] });
      toast({
        title: "Quick Actions saved",
        description: "Your dashboard quick actions have been updated.",
      });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to save",
        description: error.message,
      });
    },
  });

  const handleToggleAction = (actionId: string) => {
    setSelectedActions((prev) => {
      const newSelection = prev.includes(actionId)
        ? prev.filter((id) => id !== actionId)
        : [...prev, actionId];
      setHasChanges(true);
      return newSelection;
    });
  };

  const handleMoveUp = (actionId: string) => {
    setSelectedActions((prev) => {
      const index = prev.indexOf(actionId);
      if (index <= 0) return prev;
      const newArray = [...prev];
      [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
      setHasChanges(true);
      return newArray;
    });
  };

  const handleMoveDown = (actionId: string) => {
    setSelectedActions((prev) => {
      const index = prev.indexOf(actionId);
      if (index < 0 || index >= prev.length - 1) return prev;
      const newArray = [...prev];
      [newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]];
      setHasChanges(true);
      return newArray;
    });
  };

  const handleSave = () => {
    if (selectedActions.length === 0) {
      toast({
        variant: "destructive",
        title: "At least one action required",
        description: "Please select at least one quick action.",
      });
      return;
    }
    updateMutation.mutate(selectedActions);
  };

  const handleReset = () => {
    setSelectedActions(DEFAULT_QUICK_ACTIONS);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const selectedActionObjects = selectedActions
    .map((id) => ALL_QUICK_ACTIONS.find((a) => a.id === id))
    .filter((a): a is QuickAction => a !== undefined);

  const unselectedActions = ALL_QUICK_ACTIONS.filter(
    (a) => !selectedActions.includes(a.id)
  );

  return (
    <Card data-testid="card-quick-actions-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Dashboard Quick Actions
        </CardTitle>
        <CardDescription>
          Choose which quick actions appear on your dashboard. These will be shown in the header dropdown, floating action button, and dashboard section.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {selectedActionObjects.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Selected Actions (in order)</Label>
            <div className="space-y-2 rounded-md border p-3">
              {selectedActionObjects.map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                  data-testid={`selected-action-${action.id}`}
                >
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveUp(action.id)}
                      disabled={index === 0}
                      data-testid={`button-move-up-${action.id}`}
                    >
                      <span className="text-xs">↑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveDown(action.id)}
                      disabled={index === selectedActionObjects.length - 1}
                      data-testid={`button-move-down-${action.id}`}
                    >
                      <span className="text-xs">↓</span>
                    </Button>
                  </div>
                  <action.icon className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleAction(action.id)}
                    data-testid={`button-remove-${action.id}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {unselectedActions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Available Actions</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {unselectedActions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover-elevate"
                  onClick={() => handleToggleAction(action.id)}
                  data-testid={`available-action-${action.id}`}
                >
                  <action.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={updateMutation.isPending}
            data-testid="button-reset-quick-actions"
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            data-testid="button-save-quick-actions"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
