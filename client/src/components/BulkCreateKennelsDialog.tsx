import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const bulkCreateSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required').refine(
    (val) => val.includes('{number}'),
    'Pattern must include {number} placeholder'
  ),
  startNumber: z.coerce.number().int().min(1, 'Start number must be at least 1'),
  endNumber: z.coerce.number().int().min(1, 'End number must be at least 1'),
  startDisplayOrder: z.coerce.number().int().min(0, 'Display order must be 0 or greater'),
});

type BulkCreateFormData = z.infer<typeof bulkCreateSchema>;

interface BulkCreateKennelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkCreateKennelsDialog({
  open,
  onOpenChange,
}: BulkCreateKennelsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string[]>([]);

  const form = useForm<BulkCreateFormData>({
    resolver: zodResolver(bulkCreateSchema),
    defaultValues: {
      pattern: 'Kennel {number}',
      startNumber: 1,
      endNumber: 10,
      startDisplayOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: BulkCreateFormData) => {
      return await apiRequest('POST', '/api/kennels/bulk', data);
    },
    onSuccess: (_data, variables) => {
      const count = variables.endNumber - variables.startNumber + 1;
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({
        title: 'Kennels created',
        description: `Successfully created ${count} kennels`,
      });
      onOpenChange(false);
      form.reset();
      setPreview([]);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create kennels',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const generatePreview = (data: BulkCreateFormData) => {
    const { pattern, startNumber, endNumber } = data;
    
    if (endNumber < startNumber) {
      return [];
    }

    const maxPreview = 10;
    const total = endNumber - startNumber + 1;
    const previews: string[] = [];

    for (let i = startNumber; i <= Math.min(startNumber + maxPreview - 1, endNumber); i++) {
      previews.push(pattern.replace('{number}', i.toString()));
    }

    if (total > maxPreview) {
      previews.push(`... and ${total - maxPreview} more`);
    }

    return previews;
  };

  const watchedValues = form.watch();
  const currentPreview = generatePreview(watchedValues);
  const totalCount = Math.max(0, watchedValues.endNumber - watchedValues.startNumber + 1);

  const handleSubmit = (data: BulkCreateFormData) => {
    if (data.endNumber < data.startNumber) {
      form.setError('endNumber', {
        message: 'End number must be greater than or equal to start number',
      });
      return;
    }
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Create Kennels</DialogTitle>
          <DialogDescription>
            Create multiple kennels at once using a naming pattern
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="pattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Naming Pattern</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Building A - Kennel {number}"
                      data-testid="input-pattern"
                    />
                  </FormControl>
                  <FormDescription>
                    Use {'{number}'} as a placeholder for the kennel number
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        data-testid="input-start-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        data-testid="input-end-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="startDisplayOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starting Display Order</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      data-testid="input-display-order"
                    />
                  </FormControl>
                  <FormDescription>
                    Display order will increment for each kennel (e.g., 0, 1, 2, 3...)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {currentPreview.length > 0 && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">
                    Preview ({totalCount} kennel{totalCount !== 1 ? 's' : ''})
                  </Label>
                </div>
                <div className="space-y-1 text-sm">
                  {currentPreview.map((name, index) => (
                    <div key={index} className="text-muted-foreground" data-testid={`preview-item-${index}`}>
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalCount > 100 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You're about to create {totalCount} kennels. This may take a moment.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || totalCount === 0}
                data-testid="button-create-bulk"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create {totalCount} Kennel{totalCount !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
