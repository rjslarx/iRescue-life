import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useSEO } from '@/hooks/useSEO';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Package, Heart, ExternalLink, AlertTriangle, Flame, List, Loader2 } from 'lucide-react';
import type { SupplyItem, SupplyCategory, Tenant } from '@shared/schema';
import PublicHeader from '@/components/PublicHeader';

type SupplyItemWithRelations = SupplyItem & {
  category: SupplyCategory | null;
};

export default function PublicWishlist() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [donatingItem, setDonatingItem] = useState<SupplyItemWithRelations | null>(null);
  const [donorCoversFees, setDonorCoversFees] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  // Fetch supply items (public endpoint)
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: SupplyItemWithRelations[] }>({
    queryKey: ['/api/supply-items'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const donationSection = (tenant as any)?.donationSection as {
    chewyWishListUrl?: string;
    amazonWishListUrl?: string;
  } | undefined;

  // Handle donation success/cancelled from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const donationStatus = urlParams.get('donation');
    
    if (donationStatus === 'success') {
      toast({
        title: 'Thank you for your donation!',
        description: 'Your generous support helps us care for animals in need.',
      });
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (donationStatus === 'cancelled') {
      toast({
        title: 'Donation cancelled',
        description: 'No worries! You can donate anytime.',
        variant: 'default',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  useSEO({
    title: `Supply Wishlist - ${rescueName}`,
    description: `Support ${rescueName} by donating needed supplies. Browse our wishlist and help us provide essential items for animals in our care.`,
    siteName: rescueName,
  });

  // Create Stripe checkout session for supply item donation
  const checkoutMutation = useMutation({
    mutationFn: async ({ itemId, quantity, donorCoversFees }: { itemId: string; quantity: number; donorCoversFees: boolean }) => {
      const response = await apiRequest('POST', `/api/supply-items/${itemId}/checkout`, {
        quantity,
        donorCoversFees,
      });
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Unable to process donation', 
        description: error.message || 'Please try again or contact support.', 
        variant: 'destructive' 
      });
    },
  });

  const items = itemsData?.items || [];
  
  // Group items by priority
  const urgentItems = items.filter(item => item.priority === 'urgent' && item.status === 'active');
  const highPriorityItems = items.filter(item => item.priority === 'high' && item.status === 'active');
  const normalItems = items.filter(item => (item.priority === 'normal' || item.priority === 'low') && item.status === 'active');

  const getProgressPercentage = (item: SupplyItemWithRelations) => {
    return Math.min((item.quantityFulfilled / item.quantityNeeded) * 100, 100);
  };

  const getRemainingNeeded = (item: SupplyItemWithRelations) => {
    return Math.max(item.quantityNeeded - item.quantityFulfilled, 0);
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

  // Render a single supply item card
  const renderSupplyCard = (item: SupplyItemWithRelations, compact: boolean = false) => {
    const progressPercentage = getProgressPercentage(item);
    const remainingNeeded = getRemainingNeeded(item);
    const primaryLink = item.chewyUrl || item.amazonUrl || item.petsmartUrl || item.otherRetailerUrl;

    if (compact) {
      return (
        <Card key={item.id} className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0" data-testid={`card-supply-${item.id}`}>
          {item.imageUrl && (
            <div className="relative h-40 w-full overflow-hidden rounded-t-lg bg-muted">
              <img 
                src={item.imageUrl} 
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <CardHeader className={`pb-2 ${!item.imageUrl ? 'pt-4' : 'pt-3'}`}>
            <CardTitle className="text-base line-clamp-2" data-testid={`text-supply-title-${item.id}`}>
              {item.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-2 pt-0">
            {item.unitPrice && (
              <p className="text-lg font-semibold">${item.unitPrice}</p>
            )}
            <div className="space-y-1">
              <Progress value={progressPercentage} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {remainingNeeded > 0 ? `${remainingNeeded} needed` : 'Fulfilled!'}
              </p>
            </div>
            <div className="flex gap-2 mt-auto pt-2">
              {primaryLink && (
                <Button size="sm" variant="outline" asChild className="flex-1" data-testid={`button-buy-${item.id}`}>
                  <a href={primaryLink} target="_blank" rel="noopener noreferrer">
                    Buy Now <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant={primaryLink ? "ghost" : "default"}
                className={primaryLink ? "" : "flex-1"}
                onClick={() => setDonatingItem(item)}
                data-testid={`button-donate-${item.id}`}
              >
                <Heart className="w-4 h-4" />
              </Button>
              <Dialog open={donatingItem?.id === item.id} onOpenChange={(open) => {
                if (!open) {
                  setDonatingItem(null);
                  setQuantity(1);
                  setDonorCoversFees(false);
                }
              }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Donate: {item.title}</DialogTitle>
                    <DialogDescription>
                      Support our animals by donating the cost of this item. Payment is processed securely through Stripe.
                    </DialogDescription>
                  </DialogHeader>
                  <CheckoutForm 
                    item={item}
                    quantity={quantity}
                    setQuantity={setQuantity}
                    donorCoversFees={donorCoversFees}
                    setDonorCoversFees={setDonorCoversFees}
                    onCheckout={() => checkoutMutation.mutate({ 
                      itemId: item.id, 
                      quantity, 
                      donorCoversFees 
                    })}
                    isPending={checkoutMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Full card for other sections
    return (
      <Card key={item.id} className="flex flex-col" data-testid={`card-supply-${item.id}`}>
        {item.imageUrl && (
          <div className="relative h-48 w-full overflow-hidden rounded-t-lg bg-muted">
            <img 
              src={item.imageUrl} 
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <CardTitle className="text-lg line-clamp-2" data-testid={`text-supply-title-${item.id}`}>
              {item.title}
            </CardTitle>
            <Badge variant={item.priority === 'high' ? 'destructive' : 'secondary'}>
              {item.priority === 'high' ? 'High Priority' : item.priority === 'normal' ? 'Needed' : 'Low Priority'}
            </Badge>
          </div>
          {item.description && (
            <CardDescription className="line-clamp-3">{item.description}</CardDescription>
          )}
          {item.publicNote && (
            <p className="text-sm text-muted-foreground italic mt-2">"{item.publicNote}"</p>
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
                    <Button size="sm" variant="outline" asChild className="text-xs" data-testid={`button-amazon-${item.id}`}>
                      <a href={item.amazonUrl} target="_blank" rel="noopener noreferrer">
                        Amazon <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                  {item.chewyUrl && (
                    <Button size="sm" variant="outline" asChild className="text-xs" data-testid={`button-chewy-${item.id}`}>
                      <a href={item.chewyUrl} target="_blank" rel="noopener noreferrer">
                        Chewy <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                  {item.petsmartUrl && (
                    <Button size="sm" variant="outline" asChild className="text-xs" data-testid={`button-petsmart-${item.id}`}>
                      <a href={item.petsmartUrl} target="_blank" rel="noopener noreferrer">
                        PetSmart <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                  {item.otherRetailerUrl && item.otherRetailerName && (
                    <Button size="sm" variant="outline" asChild className="text-xs" data-testid={`button-other-retailer-${item.id}`}>
                      <a href={item.otherRetailerUrl} target="_blank" rel="noopener noreferrer">
                        {item.otherRetailerName} <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => setDonatingItem(item)}
              data-testid={`button-donate-${item.id}`}
            >
              <Heart className="w-4 h-4 mr-2" />
              I want to donate this
            </Button>
            <Dialog open={donatingItem?.id === item.id} onOpenChange={(open) => {
              if (!open) {
                setDonatingItem(null);
                setQuantity(1);
                setDonorCoversFees(false);
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Donate: {item.title}</DialogTitle>
                  <DialogDescription>
                    Support our animals by donating the cost of this item. Payment is processed securely through Stripe.
                  </DialogDescription>
                </DialogHeader>
                <CheckoutForm 
                  item={item}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  donorCoversFees={donorCoversFees}
                  setDonorCoversFees={setDonorCoversFees}
                  onCheckout={() => checkoutMutation.mutate({ 
                    itemId: item.id, 
                    quantity, 
                    donorCoversFees 
                  })}
                  isPending={checkoutMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Horizontal scrollable row component
  const PriorityRow = ({ 
    title, 
    icon: Icon, 
    items, 
    variant = 'default',
    showChewyButton = false
  }: { 
    title: string; 
    icon: React.ElementType; 
    items: SupplyItemWithRelations[];
    variant?: 'urgent' | 'high' | 'default';
    showChewyButton?: boolean;
  }) => {
    if (items.length === 0) return null;

    const bgClass = variant === 'urgent' 
      ? 'bg-destructive/5 border-destructive/20' 
      : variant === 'high' 
        ? 'bg-orange-500/5 border-orange-500/20' 
        : 'bg-muted/30';

    return (
      <section className={`rounded-lg border p-6 ${bgClass}`} data-testid={`section-priority-${variant}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${
            variant === 'urgent' ? 'bg-destructive/10 text-destructive' : 
            variant === 'high' ? 'bg-orange-500/10 text-orange-600' : 
            'bg-muted text-muted-foreground'
          }`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-2xl font-bold ${
              variant === 'urgent' ? 'text-destructive' : 
              variant === 'high' ? 'text-orange-600' : ''
            }`}>
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? 's' : ''} needed
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent" 
               style={{ scrollBehavior: 'smooth' }}>
            {items.map((item) => renderSupplyCard(item, true))}
          </div>
        </div>

        {showChewyButton && donationSection?.chewyWishListUrl && (
          <div className="mt-4 text-center">
            <Button size="lg" asChild className="gap-2" data-testid="button-view-chewy-wishlist">
              <a href={donationSection.chewyWishListUrl} target="_blank" rel="noopener noreferrer">
                View Full Wish List on Chewy
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
      <div className="container mx-auto py-8 space-y-8" data-testid="page-public-wishlist">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Package className="w-12 h-12 text-muted-foreground" />
            <h1 className="text-4xl font-bold" data-testid="heading-wishlist">Supply Wishlist</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Help us care for our rescue animals by donating supplies or contributing funds to purchase needed items.
            Every donation makes a difference!
          </p>
        </div>

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
          <div className="space-y-8">
            {/* Urgent Needs Row */}
            <PriorityRow 
              title="Our Most Urgent Needs" 
              icon={AlertTriangle}
              items={urgentItems}
              variant="urgent"
              showChewyButton={true}
            />

            {/* High Priority Row */}
            <PriorityRow 
              title="High Priority Items" 
              icon={Flame}
              items={highPriorityItems}
              variant="high"
            />

            {/* Other Needed Items */}
            {normalItems.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-full bg-muted">
                    <List className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Other Needed Items</h2>
                    <p className="text-sm text-muted-foreground">
                      {normalItems.length} item{normalItems.length !== 1 ? 's' : ''} needed
                    </p>
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {normalItems.map((item) => renderSupplyCard(item, false))}
                </div>
              </section>
            )}

            {/* External Wishlist Links */}
            {(donationSection?.chewyWishListUrl || donationSection?.amazonWishListUrl) && (
              <div className="text-center py-8 border-t">
                <h3 className="text-lg font-semibold mb-4">Shop Our Full Wishlists</h3>
                <div className="flex justify-center gap-4 flex-wrap">
                  {donationSection?.chewyWishListUrl && (
                    <Button size="lg" asChild className="gap-2" data-testid="button-chewy-wishlist">
                      <a href={donationSection.chewyWishListUrl} target="_blank" rel="noopener noreferrer">
                        View Chewy Wishlist
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                  {donationSection?.amazonWishListUrl && (
                    <Button size="lg" variant="outline" asChild className="gap-2" data-testid="button-amazon-wishlist">
                      <a href={donationSection.amazonWishListUrl} target="_blank" rel="noopener noreferrer">
                        View Amazon Wishlist
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function CheckoutForm({
  item,
  quantity,
  setQuantity,
  donorCoversFees,
  setDonorCoversFees,
  onCheckout,
  isPending,
}: {
  item: SupplyItemWithRelations;
  quantity: number;
  setQuantity: (q: number) => void;
  donorCoversFees: boolean;
  setDonorCoversFees: (v: boolean) => void;
  onCheckout: () => void;
  isPending: boolean;
}) {
  const itemPrice = item.unitPrice ? parseFloat(item.unitPrice) : 0;
  const totalAmount = itemPrice * quantity;
  const remainingNeeded = Math.max(0, (item.quantityNeeded || 0) - (item.quantityFulfilled || 0));
  
  if (itemPrice <= 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            This item doesn't have a price set for online donations. 
            Please use the retailer links above to purchase and ship this item directly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Price per item:</span>
          <span className="font-medium">${itemPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Still needed:</span>
          <span className="font-medium">{remainingNeeded} items</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="checkout-quantity">How many would you like to donate?</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            data-testid="button-quantity-decrease"
          >
            -
          </Button>
          <span className="w-12 text-center font-medium" data-testid="text-checkout-quantity">{quantity}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setQuantity(Math.min(remainingNeeded || 100, quantity + 1))}
            disabled={quantity >= (remainingNeeded || 100)}
            data-testid="button-quantity-increase"
          >
            +
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="cover-fees"
          checked={donorCoversFees}
          onCheckedChange={(checked) => setDonorCoversFees(checked === true)}
          data-testid="checkbox-cover-fees"
        />
        <Label htmlFor="cover-fees" className="text-sm cursor-pointer">
          I'd like to cover the processing fees so 100% goes to the animals
        </Label>
      </div>

      <div className="bg-primary/5 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="font-medium">Total Donation:</span>
          <span className="text-2xl font-bold" data-testid="text-checkout-total">
            ${totalAmount.toFixed(2)}
          </span>
        </div>
        {donorCoversFees && (
          <p className="text-xs text-muted-foreground mt-1">
            + processing fees (calculated at checkout)
          </p>
        )}
      </div>

      <Button 
        className="w-full" 
        onClick={onCheckout}
        disabled={isPending}
        data-testid="button-checkout"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Heart className="w-4 h-4 mr-2" />
            Donate ${totalAmount.toFixed(2)} via Stripe
          </>
        )}
      </Button>
      
      <p className="text-xs text-muted-foreground text-center">
        Secure payment powered by Stripe. Your donation is tax-deductible.
      </p>
    </div>
  );
}
