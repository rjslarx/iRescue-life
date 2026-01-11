import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useSEO } from '@/hooks/useSEO';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Package, Heart, ExternalLink, ShoppingCart } from 'lucide-react';
import type { SupplyItem, SupplyCategory, Tenant } from '@shared/schema';

type SupplyItemWithRelations = SupplyItem & {
  category: SupplyCategory | null;
};

const donationFormSchema = z.object({
  donorName: z.string().min(1, 'Name is required').max(100),
  donorEmail: z.string().email('Valid email required').optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  donorMessage: z.string().max(500).optional(),
  donationType: z.enum(['physical', 'monetary', 'both']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal('')),
});

export default function PublicWishlist() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [donatingItem, setDonatingItem] = useState<SupplyItemWithRelations | null>(null);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  // Fetch supply items (public endpoint)
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: SupplyItemWithRelations[] }>({
    queryKey: ['/api/supply-items', { categoryId: selectedCategory !== 'all' ? selectedCategory : undefined }],
  });

  // Fetch categories
  const { data: categoriesData } = useQuery<{ categories: SupplyCategory[] }>({
    queryKey: ['/api/supply-categories'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";

  useSEO({
    title: `Supply Wishlist - ${rescueName}`,
    description: `Support ${rescueName} by donating needed supplies. Browse our wishlist and help us provide essential items for animals in our care.`,
    siteName: rescueName,
  });

  // Record donation mutation
  const recordDonationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof donationFormSchema> & { supplyItemId: string }) => {
      return apiRequest('POST', '/api/supply-donations', data);
    },
    onSuccess: () => {
      toast({
        title: 'Thank you for your donation!',
        description: 'Your support means the world to our animals.',
      });
      setDonatingItem(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const items = itemsData?.items || [];
  const categories = categoriesData?.categories || [];

  const getProgressPercentage = (item: SupplyItemWithRelations) => {
    return Math.min((item.quantityFulfilled / item.quantityNeeded) * 100, 100);
  };

  const getRemainingNeeded = (item: SupplyItemWithRelations) => {
    return Math.max(item.quantityNeeded - item.quantityFulfilled, 0);
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      urgent: { variant: 'destructive', label: 'Urgent' },
      high: { variant: 'destructive', label: 'High Priority' },
      normal: { variant: 'secondary', label: 'Needed' },
      low: { variant: 'outline', label: 'Low Priority' },
    };
    const config = variants[priority] || variants.normal;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (itemsLoading) {
    return (
      <div className="container mx-auto py-12">
        <div className="flex justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8" data-testid="page-public-wishlist">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Package className="w-12 h-12 text-primary" />
          <h1 className="text-4xl font-bold" data-testid="heading-wishlist">Supply Wishlist</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Help us care for our rescue animals by donating supplies or contributing funds to purchase needed items.
          Every donation makes a difference!
        </p>
      </div>

      {categories.length > 0 && (
        <div className="flex justify-center">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full max-w-4xl">
            <TabsList className="w-full grid grid-cols-auto">
              <TabsTrigger value="all" data-testid="tab-category-all">All Supplies</TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id} data-testid={`tab-category-${cat.id}`}>
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Heart className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-xl font-medium mb-2">Thank you!</p>
            <p className="text-muted-foreground text-center">
              We currently have all the supplies we need. Check back soon or consider a monetary donation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 justify-items-center md:justify-items-stretch">
          {items.map((item) => {
            const progressPercentage = getProgressPercentage(item);
            const remainingNeeded = getRemainingNeeded(item);

            return (
              <Card key={item.id} className="flex flex-col" data-testid={`card-supply-${item.id}`}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <CardTitle className="text-lg line-clamp-2" data-testid={`text-supply-title-${item.id}`}>
                      {item.title}
                    </CardTitle>
                    {getPriorityBadge(item.priority)}
                  </div>
                  {item.description && (
                    <CardDescription className="line-clamp-3">{item.description}</CardDescription>
                  )}
                  {item.publicNote && (
                    <p className="text-sm text-primary/80 italic mt-2">"{item.publicNote}"</p>
                  )}
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress:</span>
                      <span className="font-medium" data-testid={`text-progress-${item.id}`}>
                        {item.quantityFulfilled} / {item.quantityNeeded}
                      </span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                    {remainingNeeded > 0 && (
                      <p className="text-sm text-muted-foreground">
                        <strong>{remainingNeeded}</strong> still needed
                      </p>
                    )}
                  </div>

                  {item.unitPrice && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Estimated cost: </span>
                      <span className="font-semibold text-lg">${item.unitPrice}</span>
                      <span className="text-muted-foreground"> per item</span>
                    </div>
                  )}

                  {item.category && (
                    <Badge variant="outline" className="w-fit">
                      {item.category.name}
                    </Badge>
                  )}

                  <div className="space-y-2 mt-auto pt-4">
                    {(item.amazonUrl || item.chewyUrl || item.petsmartUrl || item.otherRetailerUrl) && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Buy from:</p>
                        <div className="flex flex-wrap gap-2">
                          {item.amazonUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="text-xs"
                              data-testid={`button-amazon-${item.id}`}
                            >
                              <a href={item.amazonUrl} target="_blank" rel="noopener noreferrer">
                                Amazon <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          )}
                          {item.chewyUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="text-xs"
                              data-testid={`button-chewy-${item.id}`}
                            >
                              <a href={item.chewyUrl} target="_blank" rel="noopener noreferrer">
                                Chewy <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          )}
                          {item.petsmartUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="text-xs"
                              data-testid={`button-petsmart-${item.id}`}
                            >
                              <a href={item.petsmartUrl} target="_blank" rel="noopener noreferrer">
                                PetSmart <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          )}
                          {item.otherRetailerUrl && item.otherRetailerName && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="text-xs"
                              data-testid={`button-other-retailer-${item.id}`}
                            >
                              <a href={item.otherRetailerUrl} target="_blank" rel="noopener noreferrer">
                                {item.otherRetailerName} <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <Dialog open={donatingItem?.id === item.id} onOpenChange={() => setDonatingItem(null)}>
                      <DialogTrigger asChild>
                        <Button
                          className="w-full"
                          onClick={() => setDonatingItem(item)}
                          data-testid={`button-donate-${item.id}`}
                        >
                          <Heart className="w-4 h-4 mr-2" />
                          I want to donate this
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Donate: {item.title}</DialogTitle>
                          <DialogDescription>
                            Let us know about your donation so we can track our supply needs and thank you!
                          </DialogDescription>
                        </DialogHeader>
                        <DonationForm
                          item={item}
                          onSubmit={(data) => recordDonationMutation.mutate({ ...data, supplyItemId: item.id })}
                          isPending={recordDonationMutation.isPending}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DonationForm({
  item,
  onSubmit,
  isPending,
}: {
  item: SupplyItemWithRelations;
  onSubmit: (data: z.infer<typeof donationFormSchema>) => void;
  isPending: boolean;
}) {
  const form = useForm<z.infer<typeof donationFormSchema>>({
    resolver: zodResolver(donationFormSchema),
    defaultValues: {
      donorName: '',
      donorEmail: '',
      quantity: 1,
      donorMessage: '',
      donationType: 'physical',
      amount: item.unitPrice || '',
    },
  });

  const donationType = form.watch('donationType');
  const quantity = form.watch('quantity');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="donorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your Name *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="John Doe" data-testid="input-donor-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="donorEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email (optional)</FormLabel>
              <FormControl>
                <Input {...field} type="email" placeholder="john@example.com" data-testid="input-donor-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="donationType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Donation Type *</FormLabel>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={field.value === 'physical' ? 'default' : 'outline'}
                  onClick={() => field.onChange('physical')}
                  data-testid="button-donation-type-physical"
                >
                  Physical Item
                </Button>
                <Button
                  type="button"
                  variant={field.value === 'monetary' ? 'default' : 'outline'}
                  onClick={() => field.onChange('monetary')}
                  data-testid="button-donation-type-monetary"
                >
                  Money
                </Button>
                <Button
                  type="button"
                  variant={field.value === 'both' ? 'default' : 'outline'}
                  onClick={() => field.onChange('both')}
                  data-testid="button-donation-type-both"
                >
                  Both
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity *</FormLabel>
              <FormControl>
                <Input {...field} type="number" min="1" data-testid="input-donation-quantity" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {(donationType === 'monetary' || donationType === 'both') && (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Donation Amount (USD)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={item.unitPrice ? `${parseFloat(item.unitPrice) * quantity}` : '25.00'}
                    data-testid="input-donation-amount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="donorMessage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Thank you for all you do!" rows={3} data-testid="input-donor-message" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-4">
          <Button type="submit" disabled={isPending} className="w-full" data-testid="button-submit-donation">
            {isPending ? 'Recording...' : 'Record My Donation'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            This form records your intent to donate. We'll follow up with delivery instructions.
          </p>
        </div>
      </form>
    </Form>
  );
}
