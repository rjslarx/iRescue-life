import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Edit, Trash2, Home, ListPlus } from 'lucide-react';
import type { Kennel } from '@shared/schema';
import DashboardLayout from '@/components/DashboardLayout';
import BulkCreateKennelsDialog from '@/components/BulkCreateKennelsDialog';

const kennelFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  rowLabel: z.string().max(50).optional(),
  kennelNumber: z.string().max(50).optional(),
  displayOrder: z.coerce.number().int().min(0),
  isActive: z.boolean().default(true),
});

export default function KennelSetupPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [editingKennel, setEditingKennel] = useState<Kennel | null>(null);
  const [deleteKennel, setDeleteKennel] = useState<Kennel | null>(null);

  const { data: kennelsData, isLoading } = useQuery<{ kennels: Kennel[] }>({
    queryKey: ['/api/kennels'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof kennelFormSchema>) => {
      return apiRequest('POST', '/api/kennels', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({ title: 'Success', description: 'Kennel created successfully' });
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<z.infer<typeof kennelFormSchema>> }) => {
      return apiRequest('PATCH', `/api/kennels/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({ title: 'Success', description: 'Kennel updated successfully' });
      setEditingKennel(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/kennels/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kennels'] });
      toast({ title: 'Success', description: 'Kennel deleted successfully' });
      setDeleteKennel(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const kennels = kennelsData?.kennels || [];

  return (
    <DashboardLayout
      title="Kennel Setup"
      description="Configure kennel locations for your facility"
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              Set up kennel locations to track where onsite animals are housed
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsBulkCreateOpen(true)}
              data-testid="button-bulk-create-kennels"
            >
              <ListPlus className="h-4 w-4 mr-2" />
              Bulk Create
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-kennel">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Kennel
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-add-kennel">
                <DialogHeader>
                  <DialogTitle>Add Kennel Location</DialogTitle>
                  <DialogDescription>
                    Create a new kennel location for tracking onsite animals
                  </DialogDescription>
                </DialogHeader>
                <KennelForm
                  onSubmit={(data) => createMutation.mutate(data)}
                  isPending={createMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <BulkCreateKennelsDialog
          open={isBulkCreateOpen}
          onOpenChange={setIsBulkCreateOpen}
        />

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading kennels...</p>
          </div>
        ) : kennels.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Home className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">No kennels configured</p>
              <p className="text-sm text-muted-foreground mb-4">
                Get started by adding your first kennel location
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-kennel">
                <Plus className="h-4 w-4 mr-2" />
                Add Kennel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {kennels.map((kennel) => (
              <Card key={kennel.id} data-testid={`card-kennel-${kennel.id}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg font-medium">
                    {kennel.name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Dialog
                      open={editingKennel?.id === kennel.id}
                      onOpenChange={(open) => setEditingKennel(open ? kennel : null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-edit-kennel-${kennel.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid={`dialog-edit-kennel-${kennel.id}`}>
                        <DialogHeader>
                          <DialogTitle>Edit Kennel Location</DialogTitle>
                          <DialogDescription>
                            Update kennel location details
                          </DialogDescription>
                        </DialogHeader>
                        <KennelForm
                          defaultValues={kennel}
                          onSubmit={(data) => updateMutation.mutate({ id: kennel.id, data })}
                          isPending={updateMutation.isPending}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteKennel(kennel)}
                      data-testid={`button-delete-kennel-${kennel.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Display Order: {kennel.displayOrder}
                  </p>
                  {!kennel.isActive && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Status: Inactive
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={deleteKennel !== null} onOpenChange={(open) => !open && setDeleteKennel(null)}>
          <AlertDialogContent data-testid="dialog-confirm-delete">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the kennel "{deleteKennel?.name}".
                Animals currently assigned to this kennel will have their kennel location cleared.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteKennel && deleteMutation.mutate(deleteKennel.id)}
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

interface KennelFormProps {
  defaultValues?: Partial<z.infer<typeof kennelFormSchema>>;
  onSubmit: (data: z.infer<typeof kennelFormSchema>) => void;
  isPending: boolean;
}

function KennelForm({ defaultValues, onSubmit, isPending }: KennelFormProps) {
  const form = useForm<z.infer<typeof kennelFormSchema>>({
    resolver: zodResolver(kennelFormSchema),
    defaultValues: defaultValues || {
      name: '',
      displayOrder: 0,
      isActive: true,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kennel Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Building A, Kennel 12"
                  {...field}
                  data-testid="input-kennel-name"
                />
              </FormControl>
              <FormDescription>
                A descriptive name for this kennel location
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="rowLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Row Label (Optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., A, B, 1, 2"
                    {...field}
                    value={field.value || ''}
                    data-testid="input-row-label"
                  />
                </FormControl>
                <FormDescription>
                  Row identifier for grid layout
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="kennelNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kennel Number (Optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., 1, 2, 3A"
                    {...field}
                    value={field.value || ''}
                    data-testid="input-kennel-number"
                  />
                </FormControl>
                <FormDescription>
                  Kennel number within row
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="displayOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  data-testid="input-display-order"
                />
              </FormControl>
              <FormDescription>
                Lower numbers appear first in the list
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending} data-testid="button-submit-kennel">
            {isPending ? 'Saving...' : defaultValues ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
