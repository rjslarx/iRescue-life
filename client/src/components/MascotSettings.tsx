import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Dog, MessageCircle, Save } from 'lucide-react';

interface MascotConfig {
  enabled?: boolean;
  speechText?: string;
}

interface MascotSettingsProps {
  mascot?: MascotConfig;
  rescueName: string;
}

export default function MascotSettings({ mascot, rescueName }: MascotSettingsProps) {
  const [enabled, setEnabled] = useState(mascot?.enabled || false);
  const [speechText, setSpeechText] = useState(mascot?.speechText || '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setEnabled(mascot?.enabled || false);
    setSpeechText(mascot?.speechText || '');
  }, [mascot]);

  const saveMutation = useMutation({
    mutationFn: async (data: MascotConfig) => {
      return apiRequest('PATCH', '/api/tenant/settings/mascot', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: 'Mascot settings saved',
        description: 'Your mascot widget settings have been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      enabled,
      speechText: speechText.trim() || undefined,
    });
  };

  const defaultText = `${rescueName} needs you!`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dog className="h-5 w-5" />
          Mascot Widget
        </CardTitle>
        <CardDescription>
          Display an animated dog mascot in the corner of your public pages with a customizable speech bubble.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="mascot-enabled">Enable Mascot</Label>
            <p className="text-sm text-muted-foreground">
              Show the animated mascot on your public pages
            </p>
          </div>
          <Switch
            id="mascot-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="switch-mascot-enabled"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="speech-text" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Speech Bubble Text
          </Label>
          <Input
            id="speech-text"
            value={speechText}
            onChange={(e) => setSpeechText(e.target.value)}
            placeholder={defaultText}
            maxLength={120}
            disabled={!enabled}
            data-testid="input-mascot-speech"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use default: "{defaultText}"
          </p>
        </div>

        {enabled && (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium mb-2">Preview:</p>
            <div className="flex items-end gap-3">
              <div className="relative">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <div className="relative bg-white dark:bg-card rounded-xl px-3 py-1.5 shadow-md border text-xs">
                    {speechText.trim() || defaultText}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white dark:border-t-card" />
                  </div>
                </div>
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800 flex items-center justify-center border-2 border-white shadow-lg">
                  <Dog className="h-8 w-8 text-amber-600 dark:text-amber-300" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">(Actual video will play here)</p>
            </div>
          </div>
        )}

        <Button 
          onClick={handleSave} 
          disabled={saveMutation.isPending}
          className="w-full sm:w-auto"
          data-testid="button-save-mascot"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Mascot Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
