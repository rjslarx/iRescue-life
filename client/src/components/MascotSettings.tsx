import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Dog, MessageCircle, Save, Upload, Trash2, Video } from 'lucide-react';

interface MascotConfig {
  enabled?: boolean;
  speechText?: string;
  videoUrl?: string;
}

interface MascotSettingsProps {
  mascot?: MascotConfig;
  rescueName: string;
}

export default function MascotSettings({ mascot, rescueName }: MascotSettingsProps) {
  const [enabled, setEnabled] = useState(mascot?.enabled || false);
  const [speechText, setSpeechText] = useState(mascot?.speechText || '');
  const [videoUrl, setVideoUrl] = useState(mascot?.videoUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setEnabled(mascot?.enabled || false);
    setSpeechText(mascot?.speechText || '');
    setVideoUrl(mascot?.videoUrl || '');
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetch('/api/tenant/settings/mascot/video', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'x-tenant-id': localStorage.getItem('rescue_portal_tenant') || '',
        },
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `${res.status}: ${text}`;
        try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setVideoUrl(data.videoUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: 'Video uploaded',
        description: 'Your mascot video has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', '/api/tenant/settings/mascot/video');
    },
    onSuccess: () => {
      setVideoUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      toast({
        title: 'Video removed',
        description: 'The mascot video has been removed. The default will be used.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error removing video',
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Video must be under 20MB.',
        variant: 'destructive',
      });
      return;
    }

    uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          Display an animated mascot in the corner of your public pages with a customizable speech bubble and video.
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

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Mascot Video
          </Label>
          <p className="text-xs text-muted-foreground">
            Upload a short looping video (MP4, WebM, or MOV, max 20MB) to display in the mascot widget.
          </p>

          {videoUrl ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border shrink-0 bg-muted">
                  <video
                    src={videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    data-testid="mascot-video-preview"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Custom video uploaded</p>
                  <p className="text-xs text-muted-foreground truncate">{videoUrl}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  data-testid="button-replace-mascot-video"
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  {uploadMutation.isPending ? 'Uploading...' : 'Replace Video'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                  data-testid="button-remove-mascot-video"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {removeMutation.isPending ? 'Removing...' : 'Remove Video'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-upload-mascot-video"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Video'}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                No custom video — the default mascot will be shown.
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-mascot-video-file"
          />
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
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-lg bg-muted">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800 flex items-center justify-center">
                      <Dog className="h-8 w-8 text-amber-600 dark:text-amber-300" />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {videoUrl ? '(Custom video)' : '(Default mascot — upload a video to customize)'}
              </p>
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
