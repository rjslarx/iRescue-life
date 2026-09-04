import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useSEO, useJsonLd } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  Trophy,
  HeartHandshake,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { SiFacebook, SiX } from "react-icons/si";
import type { ShopProduct, ShopProductVariant, Tenant } from "@shared/schema";
import { computeBundledPrice, bundleSavingsPercent } from "@shared/raffle-pricing";
import { shareOrCopy } from "@/lib/share";

type SplitPotInfo = {
  ticketSalesAmount: string;
  winnerPrizeAmount: string;
  rescueShareAmount: string;
  isDrawn?: boolean;
  drawnAt?: string | null;
};

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
  raffleClosed?: boolean;
  splitPot?: SplitPotInfo;
  ticketsSold?: number;
};

export default function PublicProductPage() {
  const { basePath, subdomain } = useTenant();
  const [, params] = useRoute("/shop/:slug");
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

  const bundleTiers = useMemo(() => {
    if (!product || product.productType !== 'raffle' || !product.bundlePricing) return [];
    return [...product.bundlePricing].sort((a, b) => a.quantity - b.quantity);
  }, [product]);

  // Total for the selected quantity, applying the cheapest combination of
  // bundles + single tickets (mirrors the server's authoritative calculation).
  const orderTotal = useMemo(() => {
    if (!product) return 0;
    if (bundleTiers.length > 0 && !selectedVariant) {
      return computeBundledPrice(quantity, product.basePrice, bundleTiers);
    }
    return currentPrice * quantity;
  }, [product, bundleTiers, selectedVariant, quantity, currentPrice]);

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

  const isSplitPot = product?.productType === 'raffle' && product?.raffleMode === 'split_pot';
  const isDrawn = isSplitPot && !!product?.splitPot?.isDrawn;
  const isClosed = !!product?.raffleClosed || isDrawn;
  const winnerPot = isSplitPot && product?.splitPot
    ? parseFloat(product.splitPot.winnerPrizeAmount)
    : null;
  const ticketsSold = product?.productType === 'raffle' ? Math.max(0, product.ticketsSold || 0) : 0;
  const ticketGoal = product?.productType === 'raffle' ? Math.max(1, product.raffleTicketGoal || 100) : 100;
  const ticketGoalProgress = Math.min(100, (ticketsSold / ticketGoal) * 100);

  const tenantOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  useJsonLd(product ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "name": product.name,
        "description": product.description || undefined,
        "image": product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : undefined,
        "sku": product.id,
        "offers": {
          "@type": "Offer",
          "price": currentPrice.toFixed(2),
          "priceCurrency": "USD",
          "availability": isOutOfStock
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
          "url": typeof window !== 'undefined' ? window.location.href : undefined
        }
      },
      {
        "@type": "WebSite",
        "name": rescueName,
        "url": tenantOrigin
      },
      {
        "@type": "Organization",
        "name": rescueName,
        "url": tenantOrigin,
        ...(tenant?.logoUrl ? { "logo": tenant.logoUrl } : {})
      }
    ]
  } : null);

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
    
    try {
      const result = await shareOrCopy(
        { title: product?.name, text, url },
        url,
        product?.imageUrls?.[0],
      );
      if (result !== "copied") return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
          <Link href="/shop">
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
    <div className={`min-h-screen ${isSplitPot ? 'bg-gradient-to-b from-purple-50/70 via-background to-background dark:from-purple-950/20' : 'bg-background'}`}>
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl} />

      <main className="container max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <Link href="/shop" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Shop
        </Link>

        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-12">
          <div className="space-y-4">
            <div className={`aspect-square overflow-hidden bg-muted shadow-sm ${isSplitPot ? 'rounded-3xl ring-1 ring-purple-200/80 dark:ring-purple-800' : 'rounded-lg'}`}>
              {product.imageUrls && product.imageUrls.length > 0 ? (
                <img
                  src={product.imageUrls[0]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={`flex h-full w-full items-center justify-center ${isSplitPot ? 'bg-gradient-to-br from-purple-700 via-violet-600 to-fuchsia-500 text-white' : ''}`}>
                  {isSplitPot ? (
                    <div className="space-y-4 text-center">
                      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
                        <Trophy className="h-12 w-12" />
                      </div>
                      <div>
                        <p className="text-4xl font-black tracking-tight">50 / 50</p>
                        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.25em] text-white/80">Split the Pot</p>
                      </div>
                    </div>
                  ) : getProductTypeIcon(product.productType)}
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

          <div className={`space-y-6 ${isSplitPot ? 'md:sticky md:top-6' : ''}`}>
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  {getProductTypeIcon(product.productType)}
                  {product.productType === 'raffle' ? 'Raffle' :
                   product.productType === 'physical' ? 'Merchandise' : 'Digital'}
                </Badge>
                {isSplitPot && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 gap-1" data-testid="badge-split-pot-product">
                    <Trophy className="h-3 w-3" />
                    50/50 Split the Pot
                  </Badge>
                )}
                {isClosed && (
                  <Badge variant="secondary" data-testid="badge-drawing-complete-product">
                    Drawing Complete
                  </Badge>
                )}
                {product.featured && <Badge>Featured</Badge>}
              </div>

              <h1 className={`${isSplitPot ? 'text-3xl sm:text-4xl font-black tracking-tight' : 'text-2xl font-bold'}`} data-testid="product-name">
                {product.name}
              </h1>

              <div className="flex items-baseline gap-2 mt-3">
                <span className="text-2xl font-bold" data-testid="product-price">
                  {formatPrice(currentPrice)}
                </span>
                {product.compareAtPrice && parseFloat(product.compareAtPrice) > currentPrice && (
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(parseFloat(product.compareAtPrice))}
                  </span>
                )}
                {isSplitPot && !isClosed && (
                  <span className="text-sm text-muted-foreground">per ticket · no processing fee</span>
                )}
              </div>
            </div>

            {isSplitPot && (
              <section
                className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6 ${
                  isDrawn
                    ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100 dark:border-amber-800 dark:from-amber-950/50 dark:to-yellow-950/30'
                    : 'border-purple-200 bg-gradient-to-br from-purple-700 via-violet-700 to-fuchsia-600 text-white dark:border-purple-700'
                }`}
                data-testid="split-pot-product-info"
              >
                <Sparkles className={`absolute -right-4 -top-4 h-28 w-28 ${isDrawn ? 'text-amber-300/30' : 'text-white/10'}`} aria-hidden="true" />
                <div className="relative">
                  <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em]">
                    <Trophy className="h-5 w-5" />
                    {isDrawn ? 'Drawing complete' : 'Live 50/50 jackpot'}
                  </div>
                  <p className={`text-sm font-medium ${isDrawn ? 'text-amber-900/70 dark:text-amber-100/70' : 'text-white/75'}`}>
                    {isDrawn ? 'Final winner prize' : 'Current winner pot'}
                  </p>
                  <p
                    className={`mt-1 text-5xl font-black tracking-tight sm:text-6xl ${isDrawn ? 'text-amber-950 dark:text-amber-50' : 'text-white'}`}
                    data-testid="text-winner-pot-product"
                  >
                    ${(winnerPot ?? 0).toFixed(2)}
                  </p>
                  {!isDrawn && (
                    <>
                      <p className="mt-2 font-semibold text-white/90">The pot grows with every ticket sold.</p>
                      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm">
                        <div className="text-center">
                          <Trophy className="mx-auto mb-1.5 h-5 w-5 text-yellow-200" />
                          <p className="text-xl font-black">50%</p>
                          <p className="text-xs text-white/70">to the winner</p>
                        </div>
                        <div className="h-12 w-px bg-white/25" aria-hidden="true" />
                        <div className="text-center">
                          <HeartHandshake className="mx-auto mb-1.5 h-5 w-5 text-pink-200" />
                          <p className="text-xl font-black">50%</p>
                          <p className="text-xs text-white/70">supports the rescue</p>
                        </div>
                      </div>
                      <p className="mt-3 text-center text-xs text-white/65">
                        No added card fee — processing costs come from the rescue's share.
                      </p>
                    </>
                  )}
                </div>
              </section>
            )}

            {product.description && (
              <p className="text-base leading-relaxed text-muted-foreground">{product.description}</p>
            )}

            {product.productType === 'raffle' && (
              <Card className={isSplitPot ? "rounded-2xl border-purple-100 shadow-sm dark:border-purple-900" : ""}>
                <CardContent className="p-4 space-y-4">
                  {product.raffleDrawDate && (
                    <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isClosed ? 'Drawn' : 'Drawing date'}</p>
                        <p className="font-semibold">
                          {new Date(
                            (isDrawn && product.splitPot?.drawnAt) || product.raffleDrawDate
                          ).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  <div
                    className="rounded-xl border bg-primary/5 px-4 py-4 space-y-3"
                    data-testid="raffle-ticket-progress"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">Raffle momentum</span>
                      <span className="text-sm font-medium" data-testid="text-raffle-ticket-progress">
                        {ticketsSold.toLocaleString()} of {ticketGoal.toLocaleString()} tickets sold
                      </span>
                    </div>
                    <Progress
                      value={ticketGoalProgress}
                      aria-label={`${ticketsSold} of ${ticketGoal} tickets sold`}
                      aria-valuetext={`${ticketsSold} of ${ticketGoal} tickets sold`}
                      data-testid="progress-raffle-ticket-goal"
                    />
                    {ticketsSold >= ticketGoal && (
                      <p className="text-xs font-medium text-primary" data-testid="text-raffle-goal-reached">
                        Goal reached! Every additional ticket still supports the rescue.
                      </p>
                    )}
                  </div>

                  {!isSplitPot && (
                    product.rafflePrizeDescription && (
                      <div className="text-sm">
                        <span className="font-semibold">Prize: </span>
                        {product.rafflePrizeDescription}
                      </div>
                    )
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

            {bundleTiers.length > 0 && (
              <div className={`space-y-3 ${isSplitPot ? 'rounded-2xl border border-purple-100 bg-card p-4 shadow-sm dark:border-purple-900' : ''}`}>
                <div>
                  <label className="font-semibold">Choose your tickets</label>
                  {isSplitPot && <p className="text-sm text-muted-foreground">More tickets mean more chances to win — and a bigger pot.</p>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(1)}
                    className={`rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm active-elevate-2 ${quantity === 1 ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-background'}`}
                    data-testid="button-bundle-single"
                  >
                    <div className="font-semibold">1 Ticket</div>
                    <div className="text-sm text-muted-foreground">{formatPrice(parseFloat(product.basePrice))}</div>
                  </button>
                  {bundleTiers.map((tier) => {
                    const savings = bundleSavingsPercent(tier.quantity, product.basePrice, tier.price);
                    return (
                      <button
                        key={tier.quantity}
                        type="button"
                        onClick={() => setQuantity(Math.min(maxQuantity, tier.quantity))}
                        className={`relative rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm active-elevate-2 ${quantity === tier.quantity ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-background'}`}
                        data-testid={`button-bundle-${tier.quantity}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 font-semibold">
                          {tier.quantity} Tickets
                          {savings > 0 && (
                            <Badge variant="secondary" className="bg-green-100 text-xs text-green-800 dark:bg-green-900 dark:text-green-100">Save {savings}%</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{formatPrice(parseFloat(tier.price))}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold">{product.productType === 'raffle' ? 'Or choose a custom quantity' : 'Quantity'}</label>
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

            <div className={`flex flex-col gap-3 ${isSplitPot ? 'rounded-2xl border border-purple-200 bg-purple-50/70 p-4 shadow-sm dark:border-purple-800 dark:bg-purple-950/30' : ''}`}>
              {isSplitPot && !isClosed && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your entry</p>
                    <p className="font-bold">{quantity} ticket{quantity > 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-2xl font-black">{formatPrice(orderTotal)}</p>
                </div>
              )}
              <Button
                size="lg"
                className={isSplitPot ? "h-14 w-full rounded-xl text-base font-bold shadow-md" : "w-full"}
                disabled={isClosed || isOutOfStock || (product.variants.length > 0 && !selectedVariantId)}
                onClick={isClosed ? undefined : handleAddToCheckout}
                data-testid="button-buy-now"
              >
                {product.productType === 'raffle' ? <Ticket className="mr-2 h-5 w-5" /> : <ShoppingBag className="h-4 w-4 mr-2" />}
                {isClosed
                  ? 'Drawing Complete'
                  : isOutOfStock
                    ? 'Sold Out'
                    : product.productType === 'raffle'
                      ? isSplitPot
                        ? <>Get My Tickets <ArrowRight className="ml-2 h-5 w-5" /></>
                        : `Buy ${quantity} Ticket${quantity > 1 ? 's' : ''} - ${formatPrice(orderTotal)}`
                      : `Buy Now - ${formatPrice(orderTotal)}`}
              </Button>

              {!isClosed && (isSplitPot ? (
                <p className="text-xs text-muted-foreground text-center" data-testid="text-split-pot-no-fee">
                  No card processing fee — covered by rescue's share of the pot
                </p>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Card processing fee added at checkout
                </p>
              ))}

              {product.variants.length > 0 && !selectedVariantId && !isClosed && (
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
