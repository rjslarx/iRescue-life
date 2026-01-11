import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Edit, Trash2, Package, ShoppingCart, Check, Pause, AlertCircle } from 'lucide-react';
import type { SupplyItem, SupplyCategory, InsertSupplyItem, InsertSupplyCategory } from '@shared/schema';
import DashboardLayout from '@/components/DashboardLayout';

const supplyItemFormSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().optional(),
  quantityNeeded: z.coerce.number().int().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['active', 'fulfilled', 'paused']),
  amazonUrl: z.string().url().optional().or(z.literal('')),
  chewyUrl: z.string().url().optional().or(z.literal('')),
  petsmartUrl: z.string().url().optional().or(z.literal('')),
  otherRetailerUrl: z.string().url().optional().or(z.literal('')),
  otherRetailerName: z.string().optional(),
  notes: z.string().optional(),
  publicNote: z.string().optional(),
});

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  icon: z.string().optional(),
  displayOrder: z.coerce.number().int(),
  isActive: z.boolean().default(true),
});

type SupplyItemWithRelations = SupplyItem & {
  category: SupplyCategory | null;
  creator: { fullName: string } | null;
};

export default function SupplyManagementPage() {
  const { toast } = useToast();
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SupplyItemWithRelations | null>(null);
  const [editingCategory, setEditingCategory] = useState<SupplyCategory | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Fetch supply items
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: SupplyItemWithRelations[] }>({
    queryKey: ['/api/supply-items', { status: filterStatus !== 'all' ? filterStatus : undefined, categoryId: filterCategory !== 'all' ? filterCategory : undefined }],
  });

  // Fetch categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<{ categories: SupplyCategory[] }>({
    queryKey: ['/api/supply-categories'],
  });

  // Create supply item mutation
  const createItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof supplyItemFormSchema>) => {
      return apiRequest('POST', '/api/supply-items', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-items'] });
      toast({ title: 'Success', description: 'Supply item created successfully' });
      setIsAddItemDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update supply item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<z.infer<typeof supplyItemFormSchema>> }) => {
      return apiRequest('PATCH', `/api/supply-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-items'] });
      toast({ title: 'Success', description: 'Supply item updated successfully' });
      setEditingItem(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete supply item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/supply-items/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-items'] });
      toast({ title: 'Success', description: 'Supply item deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof categoryFormSchema>) => {
      return apiRequest('POST', '/api/supply-categories', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-categories'] });
      toast({ title: 'Success', description: 'Category created successfully' });
      setIsAddCategoryDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<z.infer<typeof categoryFormSchema>> }) => {
      return apiRequest('PATCH', `/api/supply-categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-categories'] });
      toast({ title: 'Success', description: 'Category updated successfully' });
      setEditingCategory(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/supply-categories/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supply-categories'] });
      toast({ title: 'Success', description: 'Category deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const items = itemsData?.items || [];
  const categories = categoriesData?.categories || [];

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      urgent: { variant: 'destructive', label: 'Urgent' },
      high: { variant: 'destructive', label: 'High' },
      normal: { variant: 'secondary', label: 'Normal' },
      low: { variant: 'outline', label: 'Low' },
    };
    const config = variants[priority] || variants.normal;
    return <Badge variant={config.variant} data-testid={`badge-priority-${priority}`}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; label: string }> = {
      active: { variant: 'default', icon: ShoppingCart, label: 'Active' },
      fulfilled: { variant: 'secondary', icon: Check, label: 'Fulfilled' },
      paused: { variant: 'outline', icon: Pause, label: 'Paused' },
    };
    const config = variants[status] || variants.active;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} data-testid={`badge-status-${status}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout 
      title="Supply Registry Management"
      description="Manage supply needs and wishlist items for your organization"
    >
      <div className="overflow-auto h-full p-6 space-y-6">
        <Tabs defaultValue="items" className="w-full">
        <TabsList>
          <TabsTrigger value="items" data-testid="tab-items">Supply Items</TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40" data-testid="select-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-52" data-testid="select-filter-category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supply Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Supply Item</DialogTitle>
                  <DialogDescription>
                    Create a new supply need for your wishlist
                  </DialogDescription>
                </DialogHeader>
                <SupplyItemForm
                  onSubmit={(data) => createItemMutation.mutate(data)}
                  isPending={createItemMutation.isPending}
                  categories={categories}
                />
              </DialogContent>
            </Dialog>
          </div>

          {itemsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No supply items yet</p>
                <p className="text-sm text-muted-foreground mb-4">Create your first supply item to get started</p>
                <Button onClick={() => setIsAddItemDialogOpen(true)} data-testid="button-add-first-item">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supply Item
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {items.map((item) => (
                <Card key={item.id} data-testid={`card-supply-item-${item.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg" data-testid={`text-item-title-${item.id}`}>{item.title}</CardTitle>
                          {getPriorityBadge(item.priority)}
                          {getStatusBadge(item.status)}
                        </div>
                        {item.description && (
                          <CardDescription>{item.description}</CardDescription>
                        )}
                        {item.category && (
                          <Badge variant="outline" className="mt-2" data-testid={`badge-category-${item.id}`}>
                            {item.category.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setEditingItem(item)}
                          data-testid={`button-edit-item-${item.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this supply item?')) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                          data-testid={`button-delete-item-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Quantity Needed:</span>
                          <span className="font-medium" data-testid={`text-quantity-${item.id}`}>{item.quantityNeeded}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Fulfilled:</span>
                          <span className="font-medium" data-testid={`text-fulfilled-${item.id}`}>{item.quantityFulfilled}</span>
                        </div>
                        {item.unitPrice && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Unit Price:</span>
                            <span className="font-medium">${item.unitPrice}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        {item.amazonUrl && (
                          <a href={item.amazonUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            Amazon →
                          </a>
                        )}
                        {item.chewyUrl && (
                          <a href={item.chewyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            Chewy →
                          </a>
                        )}
                        {item.petsmartUrl && (
                          <a href={item.petsmartUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            PetSmart →
                          </a>
                        )}
                        {item.otherRetailerUrl && item.otherRetailerName && (
                          <a href={item.otherRetailerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            {item.otherRetailerName} →
                          </a>
                        )}
                      </div>
                    </div>

                    {item.publicNote && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground"><strong>Public Note:</strong> {item.publicNote}</p>
                      </div>
                    )}

                    {item.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground"><strong>Internal Notes:</strong> {item.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {editingItem && (
            <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Supply Item</DialogTitle>
                  <DialogDescription>
                    Update the supply item details
                  </DialogDescription>
                </DialogHeader>
                <SupplyItemForm
                  initialData={editingItem}
                  onSubmit={(data) => updateItemMutation.mutate({ id: editingItem.id, data })}
                  isPending={updateItemMutation.isPending}
                  categories={categories}
                />
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-category">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Category</DialogTitle>
                  <DialogDescription>
                    Create a new supply category
                  </DialogDescription>
                </DialogHeader>
                <CategoryForm
                  onSubmit={(data) => createCategoryMutation.mutate(data)}
                  isPending={createCategoryMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {categoriesLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : categories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No categories yet</p>
                <p className="text-sm text-muted-foreground mb-4">Create your first category to organize supplies</p>
                <Button onClick={() => setIsAddCategoryDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {categories.map((category) => (
                <Card key={category.id} data-testid={`card-category-${category.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle data-testid={`text-category-name-${category.id}`}>{category.name}</CardTitle>
                        {category.description && (
                          <CardDescription>{category.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setEditingCategory(category)}
                          data-testid={`button-edit-category-${category.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this category?')) {
                              deleteCategoryMutation.mutate(category.id);
                            }
                          }}
                          data-testid={`button-delete-category-${category.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          {editingCategory && (
            <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Category</DialogTitle>
                  <DialogDescription>
                    Update the category details
                  </DialogDescription>
                </DialogHeader>
                <CategoryForm
                  initialData={editingCategory}
                  onSubmit={(data) => updateCategoryMutation.mutate({ id: editingCategory.id, data })}
                  isPending={updateCategoryMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}

// Supply Item Form Component
function SupplyItemForm({
  initialData,
  onSubmit,
  isPending,
  categories,
}: {
  initialData?: SupplyItemWithRelations;
  onSubmit: (data: z.infer<typeof supplyItemFormSchema>) => void;
  isPending: boolean;
  categories: SupplyCategory[];
}) {
  const form = useForm<z.infer<typeof supplyItemFormSchema>>({
    resolver: zodResolver(supplyItemFormSchema),
    defaultValues: {
      categoryId: initialData?.categoryId || undefined,
      title: initialData?.title || '',
      description: initialData?.description || '',
      imageUrl: initialData?.imageUrl || '',
      quantityNeeded: initialData?.quantityNeeded || 1,
      unitPrice: initialData?.unitPrice || '',
      priority: initialData?.priority || 'normal',
      status: initialData?.status || 'active',
      amazonUrl: initialData?.amazonUrl || '',
      chewyUrl: initialData?.chewyUrl || '',
      petsmartUrl: initialData?.petsmartUrl || '',
      otherRetailerUrl: initialData?.otherRetailerUrl || '',
      otherRetailerName: initialData?.otherRetailerName || '',
      notes: initialData?.notes || '',
      publicNote: initialData?.publicNote || '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Purina Pro Plan Large Breed Puppy Food" data-testid="input-item-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Details about this supply need" rows={3} data-testid="input-item-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-item-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quantityNeeded"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity Needed *</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="1" data-testid="input-item-quantity" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="unitPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Price (USD)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="29.99" data-testid="input-item-price" />
                </FormControl>
                <FormDescription>Optional - helps donors know the cost</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-item-priority">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-item-status">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <div className="space-y-3">
          <h4 className="font-medium">Retailer Links</h4>
          <FormField
            control={form.control}
            name="amazonUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amazon URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://amazon.com/..." data-testid="input-item-amazon-url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="chewyUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chewy URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://chewy.com/..." data-testid="input-item-chewy-url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="petsmartUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PetSmart URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://petsmart.com/..." data-testid="input-item-petsmart-url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="otherRetailerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Retailer Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Petco" data-testid="input-item-other-retailer-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="otherRetailerUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Retailer URL</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://..." data-testid="input-item-other-retailer-url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        <FormField
          control={form.control}
          name="publicNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Public Note</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Note visible to donors (e.g., 'For our puppies in foster care')" rows={2} data-testid="input-item-public-note" />
              </FormControl>
              <FormDescription>This note will be visible on the public wishlist</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Internal Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Internal staff notes (not visible to public)" rows={2} data-testid="input-item-notes" />
              </FormControl>
              <FormDescription>These notes are only visible to staff</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending} data-testid="button-submit-item">
            {isPending ? 'Saving...' : initialData ? 'Update Item' : 'Create Item'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Category Form Component
function CategoryForm({
  initialData,
  onSubmit,
  isPending,
}: {
  initialData?: SupplyCategory;
  onSubmit: (data: z.infer<typeof categoryFormSchema>) => void;
  isPending: boolean;
}) {
  const form = useForm<z.infer<typeof categoryFormSchema>>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      icon: initialData?.icon || '',
      displayOrder: initialData?.displayOrder || 0,
      isActive: initialData?.isActive ?? true,
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
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Dog Food" data-testid="input-category-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Brief description of this category" rows={2} data-testid="input-category-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="displayOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl>
                <Input {...field} type="number" min="0" data-testid="input-category-display-order" />
              </FormControl>
              <FormDescription>Lower numbers appear first</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending} data-testid="button-submit-category">
            {isPending ? 'Saving...' : initialData ? 'Update Category' : 'Create Category'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
