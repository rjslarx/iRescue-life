import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ObjectUploader } from '@/components/ObjectUploader';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Heart, Home, Users, HandHeart } from 'lucide-react';
import type { Tenant } from '@shared/schema';

interface ActionConfig {
  imageUrl?: string;
  title?: string;
  description?: string;
}

type CirclePosition = 'top-right' | 'bottom-right' | 'center';
type CircleSize = 'sm' | 'md' | 'lg';

interface ActionCircleConfig {
  enabled?: boolean;
  rotationSpeed?: number;
  position?: CirclePosition;
  size?: CircleSize;
  actions?: {
    adopt?: ActionConfig;
    foster?: ActionConfig;
    volunteer?: ActionConfig;
    donate?: ActionConfig;
  };
}

interface ActionCircleSettingsProps {
  tenant?: Tenant;
}

const ACTION_TYPES = [
  { 
    key: 'adopt' as const, 
    label: 'Adopt', 
    icon: Home,
    defaultTitle: 'Meet Your Match',
    defaultDescription: 'See all available pets at our shelter and in foster care.',
    path: '/animals'
  },
  { 
    key: 'foster' as const, 
    label: 'Foster', 
    icon: Heart,
    defaultTitle: 'Open Your Home',
    defaultDescription: 'Provide temporary love and care for animals in need.',
    path: '/foster'
  },
  { 
    key: 'volunteer' as const, 
    label: 'Volunteer', 
    icon: Users,
    defaultTitle: 'Make a Difference',
    defaultDescription: 'Join our team and help save more lives.',
    path: '/volunteer'
  },
  { 
    key: 'donate' as const, 
    label: 'Donate', 
    icon: HandHeart,
    defaultTitle: 'Support Our Mission',
    defaultDescription: 'Your generosity helps us rescue and care for animals.',
    path: '/donate'
  },
];

export function ActionCircleSettings({ tenant }: ActionCircleSettingsProps) {
  const { toast } = useToast();
  const currentConfig = (tenant?.actionCircle || {}) as ActionCircleConfig;

  const [enabled, setEnabled] = useState(currentConfig.enabled || false);
  const [rotationSpeed, setRotationSpeed] = useState(currentConfig.rotationSpeed || 5);
  const [position, setPosition] = useState<CirclePosition>(currentConfig.position || 'top-right');
  const [size, setSize] = useState<CircleSize>(currentConfig.size || 'md');
  const [actions, setActions] = useState<ActionCircleConfig['actions']>(currentConfig.actions || {});

  // Update state when tenant data changes
  useEffect(() => {
    if (tenant?.actionCircle) {
      const config = tenant.actionCircle as ActionCircleConfig;
      setEnabled(config.enabled || false);
      setRotationSpeed(config.rotationSpeed || 5);
      setPosition(config.position || 'top-right');
      setSize(config.size || 'md');
      setActions(config.actions || {});
    }
  }, [tenant?.actionCircle]);

  const updateMutation = useMutation({
    mutationFn: async (settings: ActionCircleConfig) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/action-circle', settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Action Circle saved",
        description: "Your hero action circle settings have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      enabled,
      rotationSpeed,
      position,
      size,
      actions,
    });
  };

  const updateAction = (key: keyof NonNullable<ActionCircleConfig['actions']>, field: keyof ActionConfig, value: string) => {
    setActions(prev => ({
      ...prev,
      [key]: {
        ...prev?.[key],
        [field]: value,
      },
    }));
  };

  const handleImageUpload = (key: keyof NonNullable<ActionCircleConfig['actions']>, url: string) => {
    if (url) {
      updateAction(key, 'imageUrl', url);
      toast({
        title: "Image uploaded",
        description: `${key.charAt(0).toUpperCase() + key.slice(1)} image ready. Click "Save Action Circle" to apply changes.`,
      });
    }
  };

  // Check if any action has an image configured
  const hasAnyImage = Object.values(actions || {}).some(action => action?.imageUrl);

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="action-circle-enabled">Enable Action Circle</Label>
          <p className="text-sm text-muted-foreground">
            Show a rotating action circle in the hero section of your homepage
          </p>
        </div>
        <Switch
          id="action-circle-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
          data-testid="switch-action-circle-enabled"
        />
      </div>

      {/* Rotation Speed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Rotation Speed</Label>
          <span className="text-sm text-muted-foreground">{rotationSpeed} seconds</span>
        </div>
        <Slider
          value={[rotationSpeed]}
          onValueChange={([value]) => setRotationSpeed(value)}
          min={2}
          max={15}
          step={1}
          disabled={!enabled}
          data-testid="slider-rotation-speed"
        />
        <p className="text-xs text-muted-foreground">
          How long each action image displays before rotating to the next
        </p>
      </div>

      {/* Position and Size Controls */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Position */}
        <div className="space-y-3">
          <Label>Position</Label>
          <Select
            value={position}
            onValueChange={(value: CirclePosition) => setPosition(value)}
            disabled={!enabled}
          >
            <SelectTrigger data-testid="select-position">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top-right">Top Right</SelectItem>
              <SelectItem value="bottom-right">Bottom Right</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Where the action circle appears in the hero section (desktop only)
          </p>
        </div>

        {/* Size */}
        <div className="space-y-3">
          <Label>Size</Label>
          <Select
            value={size}
            onValueChange={(value: CircleSize) => setSize(value)}
            disabled={!enabled}
          >
            <SelectTrigger data-testid="select-size">
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The size of the action circle
          </p>
        </div>
      </div>

      {/* Action Images */}
      <div className="space-y-6 pt-4 border-t">
        <div>
          <h4 className="font-medium mb-1">Action Images</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Upload circular images for each action. Only actions with images will appear in the rotation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {ACTION_TYPES.map((actionType) => {
            const IconComponent = actionType.icon;
            const actionConfig = actions?.[actionType.key] || {};
            
            return (
              <div key={actionType.key} className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <IconComponent className="h-5 w-5" />
                  <h5 className="font-medium">{actionType.label}</h5>
                </div>

                {/* Image Upload */}
                <div className="space-y-2">
                  <Label>Image</Label>
                  <ObjectUploader
                    value={actionConfig.imageUrl ? [actionConfig.imageUrl] : []}
                    onChange={(urls) => {
                      console.log(`[ActionCircle] Image upload for ${actionType.key}:`, urls);
                      handleImageUpload(actionType.key, urls[0] || '');
                    }}
                    accept="image/*"
                    maxFiles={1}
                    className="w-full"
                    previewSize="lg"
                    data-testid={`uploader-${actionType.key}-image`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: Square image, at least 400x400px
                  </p>
                </div>

                {/* Custom Title */}
                <div className="space-y-2">
                  <Label htmlFor={`${actionType.key}-title`}>Hover Title</Label>
                  <Input
                    id={`${actionType.key}-title`}
                    placeholder={actionType.defaultTitle}
                    value={actionConfig.title || ''}
                    onChange={(e) => updateAction(actionType.key, 'title', e.target.value)}
                    data-testid={`input-${actionType.key}-title`}
                  />
                </div>

                {/* Custom Description */}
                <div className="space-y-2">
                  <Label htmlFor={`${actionType.key}-description`}>Hover Description</Label>
                  <Input
                    id={`${actionType.key}-description`}
                    placeholder={actionType.defaultDescription}
                    value={actionConfig.description || ''}
                    onChange={(e) => updateAction(actionType.key, 'description', e.target.value)}
                    data-testid={`input-${actionType.key}-description`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning if enabled but no images */}
      {enabled && !hasAnyImage && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            The action circle is enabled but no images have been uploaded. Upload at least one action image for the circle to appear on your homepage.
          </p>
        </div>
      )}

      {/* Save Button */}
      <Button 
        onClick={handleSave}
        disabled={updateMutation.isPending}
        data-testid="button-save-action-circle"
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Save Action Circle
          </>
        )}
      </Button>
    </div>
  );
}
