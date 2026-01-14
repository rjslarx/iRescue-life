import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Circle, LayoutGrid, Ban } from 'lucide-react';
import { ActionCircleSettings } from './ActionCircleSettings';
import { ThreeDoorsSettings } from './ThreeDoorsSettings';
import type { Tenant } from '@shared/schema';

type HeroLayoutType = 'none' | 'action_circle' | 'three_doors';

interface HeroLayoutSettingsProps {
  tenant?: Tenant;
}

export function HeroLayoutSettings({ tenant }: HeroLayoutSettingsProps) {
  const { toast } = useToast();
  const [layoutType, setLayoutType] = useState<HeroLayoutType>(
    (tenant?.heroLayoutType as HeroLayoutType) || 'none'
  );

  useEffect(() => {
    if (tenant?.heroLayoutType) {
      setLayoutType(tenant.heroLayoutType as HeroLayoutType);
    }
  }, [tenant?.heroLayoutType]);

  const updateMutation = useMutation({
    mutationFn: async (heroLayoutType: HeroLayoutType) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings/hero-layout', { heroLayoutType });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: "Hero layout saved",
        description: "Your hero section layout has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving layout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLayoutChange = (value: HeroLayoutType) => {
    setLayoutType(value);
    updateMutation.mutate(value);
  };

  const currentLayoutType = tenant?.heroLayoutType || 'none';

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label>Layout Type</Label>
        <RadioGroup
          value={layoutType}
          onValueChange={handleLayoutChange}
          className="grid gap-4"
        >
          <div className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${layoutType === 'none' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
            <RadioGroupItem value="none" id="layout-none" data-testid="radio-layout-none" />
            <label htmlFor="layout-none" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 font-medium">
                <Ban className="h-4 w-4 text-muted-foreground" />
                No Additional Layout
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Show only the headline, tagline, and call-to-action buttons in the hero section.
              </p>
            </label>
          </div>

          <div className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${layoutType === 'action_circle' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
            <RadioGroupItem value="action_circle" id="layout-circle" data-testid="radio-layout-circle" />
            <label htmlFor="layout-circle" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 font-medium">
                <Circle className="h-4 w-4 text-muted-foreground" />
                Action Circle
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Display a rotating circular action widget with images for Adopt, Foster, Volunteer, and Donate. Configure the images below after selecting this option.
              </p>
            </label>
          </div>

          <div className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${layoutType === 'three_doors' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
            <RadioGroupItem value="three_doors" id="layout-doors" data-testid="radio-layout-doors" />
            <label htmlFor="layout-doors" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 font-medium">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                Three Doors
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Show three action cards at the bottom of the hero: Adopt, Foster, and Volunteer. Uses your site's theme colors automatically.
              </p>
            </label>
          </div>
        </RadioGroup>
      </div>

      {updateMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving layout...
        </div>
      )}

      {currentLayoutType === 'action_circle' && (
        <div className="pt-6 border-t space-y-4">
          <div>
            <h4 className="font-medium">Action Circle Configuration</h4>
            <p className="text-sm text-muted-foreground">
              Upload images and customize the rotating action circle. Remember to enable the circle and upload at least one image.
            </p>
          </div>
          <ActionCircleSettings tenant={tenant} />
        </div>
      )}

      {currentLayoutType === 'three_doors' && (
        <div className="pt-6 border-t space-y-4">
          <div>
            <h4 className="font-medium">Three Doors Configuration</h4>
            <p className="text-sm text-muted-foreground">
              Customize the text and links for each door. Leave fields empty to use the defaults.
            </p>
          </div>
          <ThreeDoorsSettings tenant={tenant} />
        </div>
      )}
    </div>
  );
}
