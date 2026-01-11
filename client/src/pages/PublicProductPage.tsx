import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShoppingBag, 
  ArrowLeft, 
  Ticket, 
  Package, 
  Tag, 
  Clock, 
  Share2,
  Check,
  Minus,
  Plus,
} from "lucide-react";
import { SiFacebook, SiX } from "react-icons/si";
import type { ShopProduct, ShopProductVariant, Tenant } from "@shared/schema";

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
};

export default function PublicProductPage() {
  const { basePath, subdomain } = useTenant();
  const [, params] = useRoute(`${basePath}/shop/:slug`);
  const slug = params?.slug;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: productData, isLoading } = useQuery<{ product: ProductWithVariants }>({
    queryKey: ['/api/shop/products', slug],
    enabled: !!slug,
  });

  const tenant = tenantData?.tenant;
  const product = productData?.product;
  const rescueName = tenant?.name || "Shop";

  useSEO({
    title: product ? `${product.name} - ${rescueName} Shop` : `Shop - ${rescueName}`,
    description: product?.description || product?.metaDescription || `Shop at ${rescueName}`,
    image: product?.imageUrls?.[0] || tenant?.logoUrl,
    siteName: rescueName,
  });

  const selectedVariant = useMemo(() => {
    if (!product || !selectedVariantId) return null;
    return product.variants.find(v => v.id === selectedVariantId);
  }, [product, selectedVariantId]);

  const currentPrice = useMemo(() => {
    if (!product) return 0;
    const base = parseFloat(product.basePrice);
    if (selectedVariant) {
      return base + parseFloat(selectedVariant.priceAdjustment);
    }
    return base;
  }, [product, selectedVariant]);

  const isOutOfStock = useMemo(() => {
    if (!product || !product.trackInventory) return false;
    if (product.variants.length === 0) {
      return product.totalInventory !== null && product.totalInventory <= 0;
    }
    if (selectedVariant) {
      return selectedVariant.inventory <= 0;
    }
    return product.variants.every(v => v.inventory <= 0);
  }, [product, selectedVariant]);

  const maxQuantity = useMemo(() => {
    if (!product) return 1;
    let max = product.maxPerOrder || 99;
    if (product.trackInventory) {
      if (selectedVariant) {
        max = Math.min(max, selectedVariant.inventory);
      } else if (product.totalInventory !== null) {
        max = Math.min(max, product.totalInventory);
      }
    }
    return Math.max(1, max);
  }, [product, selectedVariant]);

  const handleQuantityChange = (delta: number) => {
    setQuantity(prev => Math.max(1, Math.min(maxQuantity, prev + delta)));
  };

  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  };

  const handleShare = async () => {
    const url = getShareUrl();
    const text = product ? `Check out ${product.name} from ${rescueName}!` : '';
    
    if (navigator.share) {
      try {
        await navigator.share({ title: product?.name, text, url });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFacebookShare = () => {
    const url = encodeURIComponent(getShareUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400');
  };

  const handleTwitterShare = () => {
    const url = encodeURIComponent(getShareUrl());
    const text = encodeURIComponent(
      product ? `Check out ${product.name} from ${rescueName}! Support a great cause!` : ''
    );
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'width=600,height=400');
  };

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

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const handleAddToCheckout = () => {
    const checkoutParams = new URLSearchParams();
    checkoutParams.set('product', product!.id);
    if (selectedVariantId) {
      checkoutParams.set('variant', selectedVariantId);
    }
    checkoutParams.set('quantity', String(quantity));
    
    window.location.href = `${basePath}/shop/checkout?${checkoutParams.toString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
        <main className="container max-w-4xl mx-auto px-4 py-8">
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="aspect-square rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />
        <main className="container max-w-4xl mx-auto px-4 py-16 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Product Not Found</h2>
          <p className="text-muted-foreground mb-4">
            This product may have been removed or is no longer available.
          </p>
          <Link href={`${basePath}/shop`}>
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shop
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />

      <main className="container max-w-4xl mx-auto px-4 py-8">
        <Link href={`${basePath}/shop`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted">
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
            </div>

            {product.imageUrls && product.imageUrls.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.imageUrls.map((url, i) => (
                  <div 
                    key={i} 
                    className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0 bg-muted"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="gap-1">
                  {getProductTypeIcon(product.productType)}
                  {product.productType === 'raffle' ? 'Raffle' : 
                   product.productType === 'physical' ? 'Merchandise' : 'Digital'}
                </Badge>
                {product.featured && <Badge>Featured</Badge>}
              </div>

              <h1 className="text-2xl font-bold" data-testid="product-name">
                {product.name}
              </h1>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold" data-testid="product-price">
                  {formatPrice(currentPrice)}
                </span>
                {product.compareAtPrice && parseFloat(product.compareAtPrice) > currentPrice && (
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(parseFloat(product.compareAtPrice))}
                  </span>
                )}
              </div>
            </div>

            {product.description && (
              <p className="text-muted-foreground">{product.description}</p>
            )}

            {product.productType === 'raffle' && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  {product.raffleDrawDate && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>
                        Drawing: {new Date(product.raffleDrawDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                  {product.rafflePrizeDescription && (
                    <div className="text-sm">
                      <span className="font-semibold">Prize: </span>
                      {product.rafflePrizeDescription}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {product.variants.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {product.variants[0].optionType === 'size' ? 'Size' :
                   product.variants[0].optionType === 'color' ? 'Color' : 'Option'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => {
                    const variantOutOfStock = product.trackInventory && variant.inventory <= 0;
                    return (
                      <Button
                        key={variant.id}
                        variant={selectedVariantId === variant.id ? "default" : "outline"}
                        size="sm"
                        disabled={variantOutOfStock}
                        onClick={() => setSelectedVariantId(variant.id)}
                        className="toggle-elevate"
                        data-testid={`button-variant-${variant.id}`}
                      >
                        {variant.name}
                        {variantOutOfStock && " (Sold Out)"}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1}
                  data-testid="button-decrease-quantity"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value) || 1)))}
                  className="w-20 text-center"
                  min={1}
                  max={maxQuantity}
                  data-testid="input-quantity"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(1)}
                  disabled={quantity >= maxQuantity}
                  data-testid="button-increase-quantity"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {product.maxPerOrder && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Max {product.maxPerOrder} per order
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                size="lg" 
                className="w-full"
                disabled={isOutOfStock || (product.variants.length > 0 && !selectedVariantId)}
                onClick={handleAddToCheckout}
                data-testid="button-buy-now"
              >
                <ShoppingBag className="h-4 w-4 mr-2" />
                {isOutOfStock ? 'Sold Out' : 
                 product.productType === 'raffle' ? `Buy ${quantity} Ticket${quantity > 1 ? 's' : ''} - ${formatPrice(currentPrice * quantity)}` : 
                 `Buy Now - ${formatPrice(currentPrice * quantity)}`}
              </Button>

              {product.variants.length > 0 && !selectedVariantId && (
                <p className="text-sm text-muted-foreground text-center">
                  Please select an option above
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Share this product</p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleShare}
                  data-testid="button-share"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleFacebookShare}
                  data-testid="button-share-facebook"
                >
                  <SiFacebook className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleTwitterShare}
                  data-testid="button-share-twitter"
                >
                  <SiX className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t mt-12 py-8 text-center text-sm text-muted-foreground">
        <p>{tenant?.footerText || `${rescueName}. Supporting animals in need.`}</p>
      </footer>
    </div>
  );
}
