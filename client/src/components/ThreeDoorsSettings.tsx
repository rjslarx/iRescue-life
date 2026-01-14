import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, PawPrint, Home, Heart, DollarSign } from 'lucide-react';
import type { Tenant } from '@shared/schema';

type IconType = 'paw' | 'home' | 'heart' | 'dollar';

interface DoorConfig {
  title?: string;
  description?: string;
  linkText?: string;
  linkUrl?: string;
  icon?: IconType;
}

interface ThreeDoorsConfig {
  door1?: DoorConfig;
  door2?: DoorConfig;
  door3?: DoorConfig;
}

interface ThreeDoorsSettingsProps {
  tenant?: Tenant;
}

const ICON_OPTIONS: { value: IconType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'paw', label: 'Paw Print', icon: PawPrint },
  { value: 'home', label: 'Home', icon: Home },
  { value: 'heart', label: 'Heart', icon: Heart },
  { value: 'dollar', label: 'Dollar', icon: DollarSign },
];

const DEFAULT_DOORS: { doorKey: 'door1' | 'door2' | 'door3'; defaults: Required<DoorConfig>; colorLabel: string }[] = [
  {
    doorKey: 'door1',
    defaults: { title: 'Adopt', description: 'Find a friend.', linkText: 'See Pets >', linkUrl: '/animals', icon: 'paw' },
    colorLabel: 'Primary Color',
  },
  {
    doorKey: 'door2',
    defaults: { title: 'Foster', description: 'Save a life.', linkText: 'Apply Now >', linkUrl: '/foster', icon: 'home' },
    colorLabel: 'Accent Color',
  },
  {
    doorKey: 'door3',
    defaults: { title: 'Volunteer', description: 'Help us out.', linkText: 'Get Involved >', linkUrl: '/volunteer', icon: 'heart' },
    colorLabel: 'Muted Color',
  },
];

export function ThreeDoorsSettings({ tenant }: ThreeDoorsSettingsProps) {
  const { toast } = useToast();
  const existingConfig = (tenant?.threeDoorsConfig as ThreeDoorsConfig) || {};

  const [config, setConfig] = useState<ThreeDoorsConfig>({
    door1: existingConfig.door1 || {},
    door2: existingConfig.door2 || {},
    door3: existingConfig.door3 || {},
  });

  useEffect(() => {
    if (tenant?.threeDoorsConfig) {
      const existing = tenant.threeDoorsConfig as ThreeDoorsConfig;
      setConfig({
        door1: existing.door1 || {},
        door2: existing.door2 || {},
        door3: existing.door3 || {},
      });
    }
  }, [tenant?.threeDoorsConfig]);

  const updateMutation = useMutation({
    mutationFn: async (newConfig: ThreeDoorsConfig) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/three-doors', newConfig);
      return response.json();
    },
    onSuccess: (data) => {
      // Update local state from mutation result to reflect saved values immediately
      if (data?.tenant?.threeDoorsConfig) {
        const savedConfig = data.tenant.threeDoorsConfig as ThreeDoorsConfig;
        setConfig({
          door1: savedConfig.door1 || {},
          door2: savedConfig.door2 || {},
          door3: savedConfig.door3 || {},
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Three Doors saved",
        description: "Your door customizations have been updated.",
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

  const updateDoor = (doorKey: 'door1' | 'door2' | 'door3', field: keyof DoorConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [doorKey]: {
        ...prev[doorKey],
        [field]: value || undefined,
      },
    }));
  };

  const handleSave = () => {
    updateMutation.mutate(config);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {DEFAULT_DOORS.map(({ doorKey, defaults, colorLabel }) => {
          const doorConfig = config[doorKey] || {};
          const IconComponent = ICON_OPTIONS.find(i => i.value === (doorConfig.icon || defaults.icon))?.icon || PawPrint;

          return (
            <Card key={doorKey}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <IconComponent className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">
                    Door {doorKey.slice(-1)} - {doorConfig.title || defaults.title}
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Uses your {colorLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${doorKey}-title`}>Title</Label>
                    <Input
                      id={`${doorKey}-title`}
                      placeholder={defaults.title}
                      value={doorConfig.title || ''}
                      onChange={(e) => updateDoor(doorKey, 'title', e.target.value)}
                      data-testid={`input-${doorKey}-title`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${doorKey}-icon`}>Icon</Label>
                    <Select
                      value={doorConfig.icon || defaults.icon}
                      onValueChange={(value) => updateDoor(doorKey, 'icon', value)}
                    >
                      <SelectTrigger id={`${doorKey}-icon`} data-testid={`select-${doorKey}-icon`}>
                        <SelectValue placeholder="Select icon" />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="h-4 w-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${doorKey}-description`}>Description</Label>
                  <Input
                    id={`${doorKey}-description`}
                    placeholder={defaults.description}
                    value={doorConfig.description || ''}
                    onChange={(e) => updateDoor(doorKey, 'description', e.target.value)}
                    data-testid={`input-${doorKey}-description`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${doorKey}-linkText`}>Link Text</Label>
                    <Input
                      id={`${doorKey}-linkText`}
                      placeholder={defaults.linkText}
                      value={doorConfig.linkText || ''}
                      onChange={(e) => updateDoor(doorKey, 'linkText', e.target.value)}
                      data-testid={`input-${doorKey}-linkText`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${doorKey}-linkUrl`}>Link URL</Label>
                    <Input
                      id={`${doorKey}-linkUrl`}
                      placeholder={defaults.linkUrl}
                      value={doorConfig.linkUrl || ''}
                      onChange={(e) => updateDoor(doorKey, 'linkUrl', e.target.value)}
                      data-testid={`input-${doorKey}-linkUrl`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a path like /donate or /about
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button 
        onClick={handleSave}
        disabled={updateMutation.isPending}
        data-testid="button-save-three-doors"
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Save Door Settings
          </>
        )}
      </Button>
    </div>
  );
}
