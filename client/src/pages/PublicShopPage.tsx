import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Tag, Ticket, Package, Clock } from "lucide-react";
import type { ShopProduct, ShopProductVariant, Tenant } from "@shared/schema";

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
};

export default function PublicShopPage() {
  const { basePath } = useTenant();

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: productsData, isLoading } = useQuery<{ products: ProductWithVariants[] }>({
    queryKey: ['/api/shop/products'],
  });

  const tenant = tenantData?.tenant;
  const products = productsData?.products || [];
  const rescueName = tenant?.name || "Shop";

  useSEO({
    title: `Shop - ${rescueName} | Support Our Mission`,
    description: `Shop merchandise and raffle tickets from ${rescueName}. Every purchase supports our mission to rescue and rehome animals in need.`,
    image: tenant?.logoUrl,
    siteName: rescueName,
  });

  const getProductTypeIcon = (type: string) => {
    switch (type) {
      case 'raffle':
        return <Ticket className="h-4 w-4" />;
      case 'physical':
        return <Package className="h-4 w-4" />;
      default:
        return <Tag className="h-4 w-4" />;
    }
  };

  const getProductTypeLabel = (type: string) => {
    switch (type) {
      case 'raffle':
        return 'Raffle';
      case 'physical':
        return 'Merchandise';
      case 'digital':
        return 'Digital';
      default:
        return type;
    }
  };

  const formatPrice = (price: string) => {
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const getLowestPrice = (product: ProductWithVariants) => {
    if (product.variants.length === 0) {
      return parseFloat(product.basePrice);
    }
    const prices = product.variants.map(v => 
      parseFloat(product.basePrice) + parseFloat(v.priceAdjustment)
    );
    return Math.min(...prices);
  };

  const hasMultiplePrices = (product: ProductWithVariants) => {
    if (product.variants.length === 0) return false;
    const prices = product.variants.map(v => 
      parseFloat(product.basePrice) + parseFloat(v.priceAdjustment)
    );
    return Math.min(...prices) !== Math.max(...prices);
  };

  const isOutOfStock = (product: ProductWithVariants) => {
    if (!product.trackInventory) return false;
    if (product.variants.length === 0) {
      return product.totalInventory !== null && product.totalInventory <= 0;
    }
    return product.variants.every(v => v.inventory <= 0);
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />

      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShoppingBag className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="shop-title">Shop</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Support our rescue mission by purchasing merchandise or entering our raffles. 
            Every purchase helps us save more animals!
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Products Yet</h2>
            <p className="text-muted-foreground">
              Check back soon for merchandise and raffle opportunities!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Link 
                key={product.id} 
                href={`/shop/${product.slug}`}
                className="block"
              >
                <Card 
                  className="overflow-hidden hover-elevate cursor-pointer h-full flex flex-col"
                  data-testid={`product-card-${product.id}`}
                >
                  <div className="relative aspect-square bg-muted">
                    {product.imageUrls && product.imageUrls.length > 0 ? (
                      <img
                        src={product.imageUrls[0]}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {getProductTypeIcon(product.productType)}
                      </div>
                    )}
                    
                    <div className="absolute top-2 left-2 flex gap-1">
                      <Badge variant="secondary" className="gap-1">
                        {getProductTypeIcon(product.productType)}
                        {getProductTypeLabel(product.productType)}
                      </Badge>
                      {product.featured && (
                        <Badge variant="default">Featured</Badge>
                      )}
                    </div>

                    {isOutOfStock(product) && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Badge variant="destructive" className="text-lg py-2 px-4">
                          Sold Out
                        </Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4 flex-1">
                    <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {product.description}
                      </p>
                    )}
                    
                    {product.productType === 'raffle' && product.raffleDrawDate && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Drawing: {new Date(product.raffleDrawDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="p-4 pt-0 flex items-center justify-between gap-2">
                    <div className="font-bold text-lg">
                      {hasMultiplePrices(product) && <span className="text-sm font-normal">From </span>}
                      {formatPrice(String(getLowestPrice(product)))}
                    </div>
                    <Button 
                      size="sm" 
                      disabled={isOutOfStock(product)}
                      data-testid={`button-view-product-${product.id}`}
                    >
                      {product.productType === 'raffle' ? 'Get Tickets' : 'View'}
                    </Button>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t mt-12 py-8 text-center text-sm text-muted-foreground">
        <p>{tenant?.footerText || `${rescueName}. Supporting animals in need.`}</p>
      </footer>
    </div>
  );
}
