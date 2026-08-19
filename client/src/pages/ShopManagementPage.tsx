import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Package,
  Ticket,
  DollarSign,
  ClipboardList,
  Truck,
  Eye,
  Archive,
  Play,
  Pause,
  Gift,
  Loader2,
  ImagePlus,
  X,
  Upload,
  Share2,
  Copy,
  Printer,
  Download,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import type { ShopProduct, ShopProductVariant, ShopOrder, ShopOrderItem, Tenant } from "@shared/schema";

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
};

type OrderWithItems = ShopOrder & {
  items: ShopOrderItem[];
};

type RaffleTicket = {
  ticketNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orderNumber: string;
  orderDate: string | null;
  isBonus?: boolean;
};

type RaffleTicketsResponse = {
  raffle: { id: string; name: string; raffleDrawDate: string | null };
  totalTickets: number;
  purchasedTickets?: number;
  bonusTickets?: number;
  tickets: RaffleTicket[];
};

type RaffleStats = {
  id: string;
  ticketsSold: number;
  bonusTickets: number;
  // Split-pot fields (present when raffleMode === 'split_pot')
  splitPot?: {
    ticketSalesAmount: string;
    winnerPrizeAmount: string;
    rescueShareAmount: string;
  };
  // Drawing result fields
  ticketSalesAmount?: string;
  winnerPrizeAmount?: string;
  rescueShareAmount?: string;
  payoutStatus?: 'pending' | 'paid';
  prizePaidAt?: string | null;
  winnerName?: string | null;
  winnerEmail?: string | null;
  winningTicketNumber?: string | null;
  drawn?: boolean;
};

export default function ShopManagementPage() {
  const { toast } = useToast();
  const { basePath } = useTenant();

  const getProductUrl = (slug: string) =>
    `${window.location.origin}${basePath}/shop/${slug}`;

  const handleCopyProductLink = (slug: string) => {
    navigator.clipboard.writeText(getProductUrl(slug)).then(() => {
      toast({ title: "Link copied to clipboard!" });
    }).catch(() => {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    });
  };

  const handleShareProduct = (product: ShopProduct) => {
    const url = getProductUrl(product.slug);
    if (navigator.share) {
      navigator.share({ title: product.name, url }).catch(() => {});
    } else {
      handleCopyProductLink(product.slug);
    }
  };
  const [activeTab, setActiveTab] = useState("products");
  const [viewTicketsRaffle, setViewTicketsRaffle] = useState<ProductWithVariants | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithVariants | null>(null);
  const [editingVariantForProduct, setEditingVariantForProduct] = useState<string | null>(null);
  const [drawConfirmRaffleId, setDrawConfirmRaffleId] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
    name: '',
    slug: '',
    description: '',
    productType: 'physical' as 'physical' | 'digital' | 'raffle',
    basePrice: '',
    compareAtPrice: '',
    status: 'draft' as 'draft' | 'active' | 'paused' | 'archived',
    trackInventory: false,
    totalInventory: '',
    maxPerOrder: '',
    category: '',
    featured: false,
    raffleMode: 'fixed' as 'fixed' | 'split_pot',
    rafflePrizeDescription: '',
    raffleDrawDate: '',
    raffleIncentivesEnabled: false,
    raffleMaxReferrals: '3',
    imageUrls: [] as string[],
    bundleTiers: [] as { quantity: string; price: string }[],
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const buildBundlePricing = (tiers: { quantity: string; price: string }[]) => {
    const cleaned = tiers
      .map(t => ({ quantity: parseInt(t.quantity), price: parseFloat(t.price) }))
      .filter(t => Number.isInteger(t.quantity) && t.quantity >= 2 && Number.isFinite(t.price) && t.price >= 0)
      .map(t => ({ quantity: t.quantity, price: t.price.toFixed(2) }));
    return cleaned.length > 0 ? cleaned : null;
  };

  const [variantForm, setVariantForm] = useState({
    name: '',
    sku: '',
    priceAdjustment: '0',
    inventory: '0',
    optionType: 'size' as 'size' | 'color' | 'style' | 'other',
  });

  const { data: raffleStatsData, refetch: refetchRaffleStats } = useQuery<{ raffles: RaffleStats[] }>({
    queryKey: ['/api/shop/admin/raffles'],
  });

  const { data: productsData, isLoading: isLoadingProducts } = useQuery<{ products: ProductWithVariants[] }>({
    queryKey: ['/api/shop/admin/products'],
  });

  const { data: ordersData, isLoading: isLoadingOrders } = useQuery<{ orders: OrderWithItems[] }>({
    queryKey: ['/api/shop/admin/orders'],
  });

  const { data: statsData } = useQuery<{ 
    revenue: string; 
    orders: { total: number; pending: number; shipped: number }; 
    products: { total: number; active: number } 
  }>({
    queryKey: ['/api/shop/admin/stats'],
  });

  const { data: ticketsData, isLoading: isLoadingTickets } = useQuery<RaffleTicketsResponse>({
    queryKey: ['/api/shop/admin/raffles', viewTicketsRaffle?.id, 'tickets'],
    enabled: !!viewTicketsRaffle,
  });

  const handleExportTicketsCsv = () => {
    if (!ticketsData) return;
    const escape = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Ticket Number', 'Buyer Name', 'Email', 'Phone', 'Order Number', 'Order Date', 'Type'],
      ...ticketsData.tickets.map(t => [
        t.ticketNumber,
        t.customerName,
        t.customerEmail,
        t.customerPhone || '',
        t.orderNumber,
        t.orderDate ? new Date(t.orderDate).toLocaleDateString() : '',
        t.isBonus ? 'Bonus' : 'Purchased',
      ]),
    ];
    const csv = rows.map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ticketsData.raffle.name || 'raffle').replace(/[^a-zA-Z0-9-_ ]/g, '')} - tickets.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintTickets = () => {
    if (!ticketsData) return;
    const esc = (v: string | null) =>
      (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const w = window.open('', '_blank');
    if (!w) {
      toast({ title: "Couldn't open print view", description: "Please allow pop-ups for this site.", variant: "destructive" });
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>${esc(ticketsData.raffle.name)} — Paid Tickets</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 24px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p { color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f3f3f3; }
      </style></head><body>
      <h1>${esc(ticketsData.raffle.name)} — Raffle Tickets (Paid Orders)</h1>
      <p>${ticketsData.totalTickets} ticket${ticketsData.totalTickets !== 1 ? 's' : ''} (${ticketsData.purchasedTickets ?? ticketsData.totalTickets} purchased, ${ticketsData.bonusTickets ?? 0} bonus) &middot; Generated ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Ticket #</th><th>Buyer</th><th>Email</th><th>Phone</th><th>Order</th><th>Type</th></tr></thead><tbody>
      ${ticketsData.tickets.map(t => `<tr><td>${esc(t.ticketNumber)}</td><td>${esc(t.customerName)}</td><td>${esc(t.customerEmail)}</td><td>${esc(t.customerPhone)}</td><td>${esc(t.orderNumber)}</td><td>${t.isBonus ? 'Bonus' : 'Purchased'}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });
  const shopEnabled = (tenantData?.tenant as any)?.shopEnabled ?? false;

  const toggleShopMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('PATCH', '/api/tenant/settings', { shopEnabled: enabled });
      if (!response.ok) throw new Error('Failed to update shop visibility');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shop'] });
      toast({ title: shopEnabled ? "Shop page hidden from public site" : "Shop page is now live on your public site" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const products = productsData?.products || [];
  const orders = ordersData?.orders || [];

  // Separate paid orders from incomplete/abandoned checkouts so staff can see
  // at a glance which orders actually completed payment. Raffle drawings only
  // ever include paid orders' tickets.
  const [orderPaymentFilter, setOrderPaymentFilter] = useState("paid");
  const isIncomplete = (s: string) => s === 'pending' || s === 'processing' || s === 'failed';
  const filteredOrders = orders.filter(o => {
    if (orderPaymentFilter === 'all') return true;
    if (orderPaymentFilter === 'paid') return !isIncomplete(o.paymentStatus) && o.paymentStatus !== 'cancelled';
    if (orderPaymentFilter === 'incomplete') return isIncomplete(o.paymentStatus);
    return o.paymentStatus === 'cancelled';
  });

  const drawRaffleMutation = useMutation({
    mutationFn: async (raffleId: string) => {
      const response = await apiRequest('POST', `/api/shop/admin/raffles/${raffleId}/draw`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to draw winner');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/raffles'] });
      setDrawConfirmRaffleId(null);
      toast({ title: "Winner drawn!", description: "The raffle winner has been selected." });
    },
    onError: (error: Error) => {
      setDrawConfirmRaffleId(null);
      toast({ title: "Draw failed", description: error.message, variant: "destructive" });
    },
  });

  const markPrizePaidMutation = useMutation({
    mutationFn: async (raffleId: string) => {
      const response = await apiRequest('POST', `/api/shop/admin/raffles/${raffleId}/payout/paid`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record payout');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/raffles'] });
      toast({ title: "Prize marked as paid", description: "Payout has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't record payout", description: error.message, variant: "destructive" });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof productForm) => {
      const { bundleTiers, ...rest } = data;
      const response = await apiRequest('POST', '/api/shop/admin/products', {
        ...rest,
        basePrice: data.basePrice || '0',
        totalInventory: data.trackInventory ? parseInt(data.totalInventory) || 0 : null,
        maxPerOrder: data.maxPerOrder ? parseInt(data.maxPerOrder) : null,
        raffleDrawDate: data.raffleDrawDate ? new Date(data.raffleDrawDate) : null,
        raffleMode: data.productType === 'raffle' ? data.raffleMode : 'fixed',
        raffleIncentivesEnabled: data.productType === 'raffle' ? data.raffleIncentivesEnabled : false,
        raffleMaxReferrals: Math.max(1, parseInt(data.raffleMaxReferrals) || 3),
        imageUrls: data.imageUrls,
        bundlePricing: data.productType === 'raffle' ? buildBundlePricing(bundleTiers) : null,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create product');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/stats'] });
      setProductDialogOpen(false);
      resetProductForm();
      toast({ title: "Product created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof productForm }) => {
      const { bundleTiers, ...rest } = data;
      const response = await apiRequest('PATCH', `/api/shop/admin/products/${id}`, {
        ...rest,
        basePrice: data.basePrice || '0',
        totalInventory: data.trackInventory ? parseInt(data.totalInventory) || 0 : null,
        maxPerOrder: data.maxPerOrder ? parseInt(data.maxPerOrder) : null,
        raffleDrawDate: data.raffleDrawDate ? new Date(data.raffleDrawDate) : null,
        raffleMode: data.productType === 'raffle' ? data.raffleMode : 'fixed',
        raffleIncentivesEnabled: data.productType === 'raffle' ? data.raffleIncentivesEnabled : false,
        raffleMaxReferrals: Math.max(1, parseInt(data.raffleMaxReferrals) || 3),
        imageUrls: data.imageUrls,
        bundlePricing: data.productType === 'raffle' ? buildBundlePricing(bundleTiers) : null,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update product');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/stats'] });
      setProductDialogOpen(false);
      setEditingProduct(null);
      resetProductForm();
      toast({ title: "Product updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/shop/admin/products/${id}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete product');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/stats'] });
      toast({ title: "Product deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: async ({ productId, data }: { productId: string; data: typeof variantForm }) => {
      const response = await apiRequest('POST', `/api/shop/admin/products/${productId}/variants`, {
        ...data,
        inventory: parseInt(data.inventory) || 0,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create variant');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/products'] });
      setVariantDialogOpen(false);
      setEditingVariantForProduct(null);
      resetVariantForm();
      toast({ title: "Variant added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ShopOrder> }) => {
      const response = await apiRequest('PATCH', `/api/shop/admin/orders/${id}`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update order');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shop/admin/orders'] });
      toast({ title: "Order updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resendTicketEmailMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('POST', `/api/shop/admin/orders/${orderId}/resend-ticket-email`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resend ticket email');
      }
      return response.json() as Promise<{ success: boolean; sentTo: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "Ticket email sent", description: `Resent to ${data.sentTo}` });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't resend ticket email", description: error.message, variant: "destructive" });
    },
  });

  const resetProductForm = () => {
    setProductForm({
      name: '',
      slug: '',
      description: '',
      productType: 'physical',
      basePrice: '',
      compareAtPrice: '',
      status: 'draft',
      trackInventory: false,
      totalInventory: '',
      maxPerOrder: '',
      category: '',
      featured: false,
      raffleMode: 'fixed',
      rafflePrizeDescription: '',
      raffleDrawDate: '',
      raffleIncentivesEnabled: false,
      raffleMaxReferrals: '3',
      imageUrls: [],
      bundleTiers: [],
    });
  };

  const handleProductImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/shop/admin/products/images/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      setProductForm(prev => ({
        ...prev,
        imageUrls: [...prev.imageUrls, data.imageUrl],
      }));
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeProductImage = (index: number) => {
    setProductForm(prev => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  const resetVariantForm = () => {
    setVariantForm({
      name: '',
      sku: '',
      priceAdjustment: '0',
      inventory: '0',
      optionType: 'size',
    });
  };

  const openEditProduct = (product: ProductWithVariants) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      slug: product.slug,
      description: product.description || '',
      productType: product.productType,
      basePrice: product.basePrice,
      compareAtPrice: product.compareAtPrice || '',
      status: product.status,
      trackInventory: product.trackInventory,
      totalInventory: product.totalInventory?.toString() || '',
      maxPerOrder: product.maxPerOrder?.toString() || '',
      category: product.category || '',
      featured: product.featured,
      raffleMode: (product.raffleMode as 'fixed' | 'split_pot') || 'fixed',
      rafflePrizeDescription: product.rafflePrizeDescription || '',
      raffleDrawDate: product.raffleDrawDate ? new Date(product.raffleDrawDate).toISOString().split('T')[0] : '',
      raffleIncentivesEnabled: product.raffleIncentivesEnabled || false,
      raffleMaxReferrals: (product.raffleMaxReferrals ?? 3).toString(),
      imageUrls: product.imageUrls || [],
      bundleTiers: (product.bundlePricing || []).map(t => ({ quantity: String(t.quantity), price: t.price })),
    });
    setProductDialogOpen(true);
  };

  const openAddVariant = (productId: string) => {
    setEditingVariantForProduct(productId);
    resetVariantForm();
    setVariantDialogOpen(true);
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productForm });
    } else {
      createProductMutation.mutate(productForm);
    }
  };

  const handleVariantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVariantForProduct) {
      createVariantMutation.mutate({ productId: editingVariantForProduct, data: variantForm });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Play className="h-3 w-3" />;
      case 'paused':
        return <Pause className="h-3 w-3" />;
      case 'archived':
        return <Archive className="h-3 w-3" />;
      default:
        return <Eye className="h-3 w-3" />;
    }
  };

  return (
    <DashboardLayout pageTitle="Shop Management">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Shop Management</h1>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="shop-enabled"
                checked={shopEnabled}
                onCheckedChange={(checked) => toggleShopMutation.mutate(checked)}
                disabled={toggleShopMutation.isPending}
                data-testid="switch-shop-enabled"
              />
              <Label htmlFor="shop-enabled" className="text-sm whitespace-nowrap">
                {shopEnabled ? "Shop is live" : "Shop is hidden"}
              </Label>
            </div>
            <Button onClick={() => { resetProductForm(); setEditingProduct(null); setProductDialogOpen(true); }} data-testid="button-add-product">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">${statsData?.revenue || '0.00'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                  <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{statsData?.orders?.total || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900">
                  <Package className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending Fulfillment</p>
                  <p className="text-2xl font-bold">{statsData?.orders?.pending || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                  <ShoppingBag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Products</p>
                  <p className="text-2xl font-bold">{statsData?.products?.active || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="raffles">Raffles</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            {isLoadingProducts ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="py-4">
                      <div className="flex gap-4">
                        <Skeleton className="h-20 w-20 rounded-md" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Products Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Start adding products to your fundraising shop.
                  </p>
                  <Button onClick={() => { resetProductForm(); setEditingProduct(null); setProductDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Product
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {products.map(product => (
                  <Card key={product.id} data-testid={`product-row-${product.id}`}>
                    <CardContent className="py-4">
                      <div className="flex gap-4 flex-wrap">
                        <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          {product.imageUrls?.[0] ? (
                            <img src={product.imageUrls[0]} alt="" className="w-full h-full object-cover rounded-md" />
                          ) : product.productType === 'raffle' ? (
                            <Ticket className="h-8 w-8 text-muted-foreground" />
                          ) : (
                            <Package className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <h3 className="font-semibold">{product.name}</h3>
                              <p className="text-sm text-muted-foreground">${product.basePrice}</p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className="gap-1">
                                {getStatusIcon(product.status)}
                                {product.status}
                              </Badge>
                              <Badge variant="outline">
                                {product.productType === 'raffle' ? 'Raffle' : product.productType === 'physical' ? 'Physical' : 'Digital'}
                              </Badge>
                              {product.productType === 'raffle' && product.raffleMode === 'split_pot' && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" data-testid={`badge-split-pot-${product.id}`}>
                                  50/50 Split Pot
                                </Badge>
                              )}
                            </div>
                          </div>
                          {product.variants.length > 0 && (
                            <div className="mt-2 flex gap-1 flex-wrap">
                              {product.variants.map(v => (
                                <Badge key={v.id} variant="outline" className="text-xs">
                                  {v.name} ({v.inventory})
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button size="sm" variant="outline" onClick={() => openAddVariant(product.id)} data-testid={`button-add-variant-${product.id}`}>
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditProduct(product)} data-testid={`button-edit-product-${product.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => deleteProductMutation.mutate(product.id)}
                            disabled={deleteProductMutation.isPending}
                            data-testid={`button-delete-product-${product.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="order-payment-filter" className="text-sm text-muted-foreground whitespace-nowrap">
                Show
              </Label>
              <Select value={orderPaymentFilter} onValueChange={setOrderPaymentFilter}>
                <SelectTrigger id="order-payment-filter" className="w-52" data-testid="select-order-payment-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid orders</SelectItem>
                  <SelectItem value="incomplete">Incomplete checkouts</SelectItem>
                  <SelectItem value="cancelled">Cancelled / abandoned</SelectItem>
                  <SelectItem value="all">All orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isLoadingOrders ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="py-4">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {orders.length === 0 ? "No Orders Yet" : "No Matching Orders"}
                  </h3>
                  <p className="text-muted-foreground">
                    {orders.length === 0
                      ? "Orders will appear here once customers make purchases."
                      : "No orders match the selected filter."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map(order => (
                  <Card key={order.id} data-testid={`order-row-${order.id}`}>
                    <CardContent className="py-4">
                      <div className="flex flex-wrap gap-4 items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{order.orderNumber}</span>
                            <Badge
                              variant={
                                order.paymentStatus === 'paid'
                                  ? 'default'
                                  : order.paymentStatus === 'cancelled' || order.paymentStatus === 'failed'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              data-testid={`badge-payment-status-${order.id}`}
                            >
                              {order.paymentStatus === 'paid' ? 'Paid'
                                : order.paymentStatus === 'failed' ? 'Not completed'
                                : order.paymentStatus === 'cancelled' ? 'Cancelled'
                                : order.paymentStatus === 'refunded' ? 'Refunded'
                                : order.paymentStatus === 'partially_refunded' ? 'Partially refunded'
                                : 'Incomplete'}
                            </Badge>
                            {order.items.some(i => i.productType === 'physical') && (
                              <Badge variant={order.fulfillmentStatus === 'delivered' ? 'default' : 'outline'}>
                                {order.fulfillmentStatus}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {order.customerName} ({order.customerEmail})
                          </p>
                          <p className="text-sm">
                            {order.items.length} item{order.items.length !== 1 ? 's' : ''} - ${order.totalAmount}
                          </p>
                          {order.items.filter(i => i.productType === 'raffle' && i.raffleTicketNumbers && i.raffleTicketNumbers.length > 0).map(item => (
                            <div key={item.id} className="mt-1 rounded-md bg-muted px-3 py-2" data-testid={`ticket-numbers-${item.id}`}>
                              <p className="text-xs font-medium">
                                {item.productName} — {item.raffleTicketNumbers!.length} ticket{item.raffleTicketNumbers!.length !== 1 ? 's' : ''}
                                {order.paymentStatus !== 'paid' && (
                                  <span className="text-muted-foreground font-normal"> (not paid — excluded from drawing)</span>
                                )}
                              </p>
                              <p className="font-mono text-sm tracking-wider break-words">
                                {item.raffleTicketNumbers!.join(', ')}
                              </p>
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                        {order.items.some(i => i.productType === 'raffle') && order.paymentStatus === 'paid' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resendTicketEmailMutation.mutate(order.id)}
                            disabled={resendTicketEmailMutation.isPending && resendTicketEmailMutation.variables === order.id}
                            data-testid={`button-resend-ticket-email-${order.id}`}
                          >
                            {resendTicketEmailMutation.isPending && resendTicketEmailMutation.variables === order.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Ticket className="h-4 w-4 mr-2" />
                            )}
                            Resend Ticket Email
                          </Button>
                        )}
                        {order.items.some(i => i.productType === 'physical') && order.paymentStatus === 'paid' && (
                          <Select
                            value={order.fulfillmentStatus}
                            onValueChange={(value) => updateOrderMutation.mutate({ 
                              id: order.id, 
                              data: { fulfillmentStatus: value as any } 
                            })}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
                              <SelectItem value="processing">Processing</SelectItem>
                              <SelectItem value="shipped">Shipped</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="raffles" className="space-y-4">
            {products.filter(p => p.productType === 'raffle').length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Ticket className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Raffles Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a raffle product to start selling tickets.
                  </p>
                  <Button onClick={() => { resetProductForm(); setEditingProduct(null); setProductForm(prev => ({ ...prev, productType: 'raffle' })); setProductDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Raffle
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {products.filter(p => p.productType === 'raffle').map(raffle => {
                  const stats = raffleStatsData?.raffles?.find(s => s.id === raffle.id);
                  const isSplitPot = raffle.raffleMode === 'split_pot';
                  const isDrawn = !!stats?.drawn || !!stats?.winnerName;
                  const splitPotLive = isSplitPot && !isDrawn ? stats?.splitPot : null;
                  return (
                    <Card key={raffle.id} data-testid={`raffle-card-${raffle.id}`}>
                      <CardContent className="py-4">
                        <div className="flex flex-wrap gap-4 items-start justify-between">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Gift className="h-5 w-5 text-primary flex-shrink-0" />
                              <span className="font-semibold">{raffle.name}</span>
                              <Badge variant={raffle.status === 'active' ? 'default' : 'secondary'}>
                                {raffle.status}
                              </Badge>
                              {isSplitPot && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" data-testid={`badge-split-pot-raffle-${raffle.id}`}>
                                  50/50 Split Pot
                                </Badge>
                              )}
                              {isDrawn && (
                                <Badge className="bg-green-500" data-testid={`badge-drawn-${raffle.id}`}>
                                  Winner Drawn
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              ${raffle.basePrice} per ticket
                              {raffle.bundlePricing && raffle.bundlePricing.length > 0 && (
                                <span className="text-muted-foreground">
                                  {' '}&middot;{' '}
                                  {raffle.bundlePricing.map(t => `${t.quantity} for $${t.price}`).join(', ')}
                                </span>
                              )}
                            </p>
                            {raffle.raffleDrawDate && (
                              <p className="text-sm">
                                Drawing: {new Date(raffle.raffleDrawDate).toLocaleDateString()}
                              </p>
                            )}
                            {stats && (
                              <p className="text-sm" data-testid={`text-raffle-stats-${raffle.id}`}>
                                Tickets: {stats.ticketsSold + (stats.bonusTickets || 0)}
                                <span className="text-muted-foreground"> ({stats.ticketsSold} purchased{stats.bonusTickets ? `, ${stats.bonusTickets} bonus` : ''})</span>
                              </p>
                            )}
                            {/* Live split-pot amounts (pre-draw) */}
                            {splitPotLive && (
                              <div className="mt-2 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-3 py-2 space-y-1" data-testid={`split-pot-live-${raffle.id}`}>
                                <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Current Split-Pot Breakdown (live)</p>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Ticket Sales</p>
                                    <p className="font-semibold" data-testid={`text-ticket-sales-${raffle.id}`}>${parseFloat(splitPotLive.ticketSalesAmount).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Winner Pot</p>
                                    <p className="font-semibold text-green-600 dark:text-green-400" data-testid={`text-winner-pot-${raffle.id}`}>${parseFloat(splitPotLive.winnerPrizeAmount).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Rescue Share</p>
                                    <p className="font-semibold" data-testid={`text-rescue-share-${raffle.id}`}>${parseFloat(splitPotLive.rescueShareAmount).toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Post-draw winner info */}
                            {isDrawn && stats && (
                              <div className="mt-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 space-y-1" data-testid={`winner-info-${raffle.id}`}>
                                <p className="text-xs font-medium text-green-700 dark:text-green-300">Winner</p>
                                {stats.winnerName && (
                                  <p className="text-sm font-semibold" data-testid={`text-winner-name-${raffle.id}`}>{stats.winnerName}</p>
                                )}
                                {stats.winnerEmail && (
                                  <p className="text-sm text-muted-foreground" data-testid={`text-winner-email-${raffle.id}`}>{stats.winnerEmail}</p>
                                )}
                                {stats.winningTicketNumber && (
                                  <p className="text-sm">Winning ticket: <span className="font-mono font-semibold" data-testid={`text-winning-ticket-${raffle.id}`}>#{stats.winningTicketNumber}</span></p>
                                )}
                                {isSplitPot && stats.winnerPrizeAmount && (
                                  <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Final Ticket Sales</p>
                                      <p className="font-semibold" data-testid={`text-final-ticket-sales-${raffle.id}`}>${parseFloat(stats.ticketSalesAmount || '0').toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Winner Prize</p>
                                      <p className="font-semibold text-green-600 dark:text-green-400" data-testid={`text-final-winner-prize-${raffle.id}`}>${parseFloat(stats.winnerPrizeAmount).toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Rescue's Share</p>
                                      <p className="font-semibold" data-testid={`text-final-rescue-share-${raffle.id}`}>${parseFloat(stats.rescueShareAmount || '0').toFixed(2)}</p>
                                    </div>
                                  </div>
                                )}
                                {isSplitPot && (
                                  <div className="mt-1 flex items-center gap-2">
                                    {stats.payoutStatus === 'paid' ? (
                                      <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400" data-testid={`text-payout-paid-${raffle.id}`}>
                                        <CheckCircle2 className="h-4 w-4" />
                                        Prize paid{stats.prizePaidAt ? ` on ${new Date(stats.prizePaidAt).toLocaleDateString()}` : ''}
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => markPrizePaidMutation.mutate(raffle.id)}
                                        disabled={markPrizePaidMutation.isPending && markPrizePaidMutation.variables === raffle.id}
                                        data-testid={`button-mark-prize-paid-${raffle.id}`}
                                      >
                                        {markPrizePaidMutation.isPending && markPrizePaidMutation.variables === raffle.id ? (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                          <DollarSign className="h-4 w-4 mr-2" />
                                        )}
                                        Mark Prize Paid
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 flex-shrink-0">
                            <Button variant="outline" onClick={() => setViewTicketsRaffle(raffle)} data-testid={`button-view-tickets-${raffle.id}`}>
                              <Ticket className="h-4 w-4 mr-2" />
                              View Tickets
                            </Button>
                            {!isDrawn && (
                              <Button
                                variant="default"
                                onClick={() => setDrawConfirmRaffleId(raffle.id)}
                                data-testid={`button-draw-winner-${raffle.id}`}
                              >
                                <Trophy className="h-4 w-4 mr-2" />
                                Draw Winner
                              </Button>
                            )}
                            <Button variant="outline" onClick={() => handleShareProduct(raffle)} data-testid={`button-share-raffle-${raffle.id}`}>
                              <Share2 className="h-4 w-4 mr-2" />
                              Share
                            </Button>
                            <Button variant="outline" onClick={() => handleCopyProductLink(raffle.slug)} data-testid={`button-copy-link-raffle-${raffle.id}`}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </Button>
                            <Button variant="outline" onClick={() => openEditProduct(raffle)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Draw winner confirmation dialog */}
        <Dialog open={!!drawConfirmRaffleId} onOpenChange={(open) => { if (!open) setDrawConfirmRaffleId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draw Raffle Winner</DialogTitle>
              <DialogDescription>
                This will randomly select a winning ticket from all paid entries. This action cannot be undone.
                Are you sure you want to draw the winner now?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDrawConfirmRaffleId(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => drawConfirmRaffleId && drawRaffleMutation.mutate(drawConfirmRaffleId)}
                disabled={drawRaffleMutation.isPending}
                data-testid="button-confirm-draw"
              >
                {drawRaffleMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Drawing...</>
                ) : (
                  <><Trophy className="h-4 w-4 mr-2" />Yes, Draw Winner</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewTicketsRaffle} onOpenChange={(open) => { if (!open) setViewTicketsRaffle(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Paid Raffle Tickets — {viewTicketsRaffle?.name}</DialogTitle>
              <DialogDescription>
                Every ticket from a paid order, for running your drawing. Incomplete or refunded orders are not included.
              </DialogDescription>
            </DialogHeader>
            {isLoadingTickets ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !ticketsData || ticketsData.tickets.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground" data-testid="text-no-tickets">
                No paid tickets yet for this raffle.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-medium" data-testid="text-ticket-count">
                    {ticketsData.totalTickets} ticket{ticketsData.totalTickets !== 1 ? 's' : ''} ({ticketsData.purchasedTickets ?? ticketsData.totalTickets} purchased, {ticketsData.bonusTickets ?? 0} bonus)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportTicketsCsv} data-testid="button-export-tickets-csv">
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrintTickets} data-testid="button-print-tickets">
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  </div>
                </div>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2 font-medium">Ticket #</th>
                        <th className="px-3 py-2 font-medium">Buyer</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">Order</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsData.tickets.map((t) => (
                        <tr key={t.ticketNumber} className="border-b last:border-0" data-testid={`row-ticket-${t.ticketNumber}`}>
                          <td className="px-3 py-2 font-mono">{t.ticketNumber}</td>
                          <td className="px-3 py-2">{t.customerName}</td>
                          <td className="px-3 py-2">{t.customerEmail}</td>
                          <td className="px-3 py-2">{t.customerPhone || '—'}</td>
                          <td className="px-3 py-2">{t.orderNumber}</td>
                          <td className="px-3 py-2">
                            {t.isBonus ? <Badge className="bg-amber-500 hover:bg-amber-500">Bonus</Badge> : <span className="text-muted-foreground">Purchased</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
              <DialogDescription>
                {editingProduct ? 'Update product details' : 'Create a new product for your shop'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleProductSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={productForm.name}
                    onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                    data-testid="input-product-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground shrink-0">/shop/</span>
                    <Input
                      id="slug"
                      value={productForm.slug}
                      onChange={(e) => setProductForm(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder="auto-generated-from-name"
                      data-testid="input-product-slug"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The page address will be yoursite.com/shop/{productForm.slug || "your-slug"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={productForm.description}
                  onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  data-testid="input-product-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Product Images</Label>
                <div className="flex flex-wrap gap-3">
                  {productForm.imageUrls.map((url, index) => (
                    <div key={index} className="relative group w-20 h-20 rounded-md overflow-visible border bg-muted">
                      <img src={url} alt="" className="w-full h-full object-cover rounded-md" />
                      <button
                        type="button"
                        onClick={() => removeProductImage(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        data-testid={`button-remove-image-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label
                    className="w-20 h-20 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer hover-elevate text-muted-foreground"
                    data-testid="button-upload-product-image"
                  >
                    {uploadingImage ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-xs">Add</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProductImageUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Upload up to 5 images. First image is used as the main product photo.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productType">Product Type *</Label>
                  <Select
                    value={productForm.productType}
                    onValueChange={(value) => setProductForm(prev => ({ ...prev, productType: value as any }))}
                  >
                    <SelectTrigger data-testid="select-product-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical (T-shirts, etc.)</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="raffle">Raffle Ticket</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={productForm.status}
                    onValueChange={(value) => setProductForm(prev => ({ ...prev, status: value as any }))}
                  >
                    <SelectTrigger data-testid="select-product-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="basePrice">Price ($) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm(prev => ({ ...prev, basePrice: e.target.value }))}
                    required
                    data-testid="input-product-price"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPerOrder">Max Per Order</Label>
                  <Input
                    id="maxPerOrder"
                    type="number"
                    min="1"
                    value={productForm.maxPerOrder}
                    onChange={(e) => setProductForm(prev => ({ ...prev, maxPerOrder: e.target.value }))}
                    placeholder="Unlimited"
                    data-testid="input-max-per-order"
                  />
                </div>
              </div>

              {productForm.productType === 'physical' && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Track Inventory</Label>
                      <p className="text-sm text-muted-foreground">Enable stock tracking for this product</p>
                    </div>
                    <Switch
                      checked={productForm.trackInventory}
                      onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, trackInventory: checked }))}
                    />
                  </div>
                  {productForm.trackInventory && (
                    <div className="space-y-2">
                      <Label htmlFor="totalInventory">Total Inventory</Label>
                      <Input
                        id="totalInventory"
                        type="number"
                        min="0"
                        value={productForm.totalInventory}
                        onChange={(e) => setProductForm(prev => ({ ...prev, totalInventory: e.target.value }))}
                        data-testid="input-inventory"
                      />
                    </div>
                  )}
                </>
              )}

              {productForm.productType === 'raffle' && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    {/* Raffle Mode selector */}
                    <div className="space-y-2">
                      <Label htmlFor="raffleMode">Raffle Prize Type *</Label>
                      <Select
                        value={productForm.raffleMode}
                        onValueChange={(value) => setProductForm(prev => ({ ...prev, raffleMode: value as 'fixed' | 'split_pot' }))}
                      >
                        <SelectTrigger data-testid="select-raffle-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Prize</SelectItem>
                          <SelectItem value="split_pot">50/50 Split the Pot</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {productForm.raffleMode === 'split_pot' && (
                      <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-sm space-y-1" data-testid="text-split-pot-explanation">
                        <p className="font-medium text-purple-800 dark:text-purple-200">50/50 Split the Pot</p>
                        <p className="text-muted-foreground">
                          The winner receives exactly <strong>half</strong> of total ticket sales. Card processing fees are covered from the rescue's half — buyers pay no additional processing fees on split-pot raffles.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="raffleDrawDate">Drawing Date</Label>
                      <Input
                        id="raffleDrawDate"
                        type="date"
                        value={productForm.raffleDrawDate}
                        onChange={(e) => setProductForm(prev => ({ ...prev, raffleDrawDate: e.target.value }))}
                        data-testid="input-raffle-date"
                      />
                    </div>

                    {productForm.raffleMode === 'fixed' && (
                      <div className="space-y-2">
                        <Label htmlFor="rafflePrizeDescription">Prize Description</Label>
                        <Textarea
                          id="rafflePrizeDescription"
                          value={productForm.rafflePrizeDescription}
                          onChange={(e) => setProductForm(prev => ({ ...prev, rafflePrizeDescription: e.target.value }))}
                          placeholder="Describe what the winner will receive..."
                          rows={2}
                          data-testid="input-prize-description"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Sharing Incentives</Label>
                          <p className="text-sm text-muted-foreground">
                            Buyers earn +1 free ticket for sharing to social media, and +1 for each friend they refer by email.
                          </p>
                        </div>
                        <Switch
                          checked={productForm.raffleIncentivesEnabled}
                          onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, raffleIncentivesEnabled: checked }))}
                          data-testid="switch-raffle-incentives"
                        />
                      </div>
                      {productForm.raffleIncentivesEnabled && (
                        <div className="space-y-1">
                          <Label htmlFor="raffleMaxReferrals">Max referral bonuses per order</Label>
                          <Input
                            id="raffleMaxReferrals"
                            type="number"
                            min={1}
                            max={20}
                            value={productForm.raffleMaxReferrals}
                            onChange={(e) => setProductForm(prev => ({ ...prev, raffleMaxReferrals: e.target.value }))}
                            className="w-28"
                            data-testid="input-raffle-max-referrals"
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label>Bundle Pricing (optional)</Label>
                        <p className="text-sm text-muted-foreground">
                          Offer bulk discounts, e.g. 5 tickets for $20. Single tickets use the base price above.
                        </p>
                      </div>
                      {productForm.bundleTiers.map((tier, index) => (
                        <div key={index} className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="number"
                            min={2}
                            placeholder="Qty"
                            value={tier.quantity}
                            onChange={(e) => setProductForm(prev => ({
                              ...prev,
                              bundleTiers: prev.bundleTiers.map((t, i) => i === index ? { ...t, quantity: e.target.value } : t),
                            }))}
                            className="w-24"
                            data-testid={`input-bundle-qty-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">tickets for $</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Price"
                            value={tier.price}
                            onChange={(e) => setProductForm(prev => ({
                              ...prev,
                              bundleTiers: prev.bundleTiers.map((t, i) => i === index ? { ...t, price: e.target.value } : t),
                            }))}
                            className="w-28"
                            data-testid={`input-bundle-price-${index}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setProductForm(prev => ({
                              ...prev,
                              bundleTiers: prev.bundleTiers.filter((_, i) => i !== index),
                            }))}
                            data-testid={`button-remove-bundle-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProductForm(prev => ({
                          ...prev,
                          bundleTiers: [...prev.bundleTiers, { quantity: '', price: '' }],
                        }))}
                        data-testid="button-add-bundle-tier"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Bundle
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label>Featured Product</Label>
                  <p className="text-sm text-muted-foreground">Display prominently in the shop</p>
                </div>
                <Switch
                  checked={productForm.featured}
                  onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, featured: checked }))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createProductMutation.isPending || updateProductMutation.isPending}
                  data-testid="button-save-product"
                >
                  {(createProductMutation.isPending || updateProductMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Variant</DialogTitle>
              <DialogDescription>
                Add a size, color, or other variant option
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleVariantSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="variantName">Variant Name *</Label>
                  <Input
                    id="variantName"
                    value={variantForm.name}
                    onChange={(e) => setVariantForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Small, Medium, Large"
                    required
                    data-testid="input-variant-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="optionType">Type</Label>
                  <Select
                    value={variantForm.optionType}
                    onValueChange={(value) => setVariantForm(prev => ({ ...prev, optionType: value as any }))}
                  >
                    <SelectTrigger data-testid="select-variant-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="size">Size</SelectItem>
                      <SelectItem value="color">Color</SelectItem>
                      <SelectItem value="style">Style</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priceAdjustment">Price Adjustment ($)</Label>
                  <Input
                    id="priceAdjustment"
                    type="number"
                    step="0.01"
                    value={variantForm.priceAdjustment}
                    onChange={(e) => setVariantForm(prev => ({ ...prev, priceAdjustment: e.target.value }))}
                    placeholder="0 for same price"
                    data-testid="input-price-adjustment"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variantInventory">Inventory</Label>
                  <Input
                    id="variantInventory"
                    type="number"
                    min="0"
                    value={variantForm.inventory}
                    onChange={(e) => setVariantForm(prev => ({ ...prev, inventory: e.target.value }))}
                    data-testid="input-variant-inventory"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVariantDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createVariantMutation.isPending}
                  data-testid="button-save-variant"
                >
                  {createVariantMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Add Variant
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
