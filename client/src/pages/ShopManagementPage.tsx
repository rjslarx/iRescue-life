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
} from "lucide-react";
import type { ShopProduct, ShopProductVariant, ShopOrder, ShopOrderItem } from "@shared/schema";

type ProductWithVariants = ShopProduct & {
  variants: ShopProductVariant[];
};

type OrderWithItems = ShopOrder & {
  items: ShopOrderItem[];
};

export default function ShopManagementPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("products");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithVariants | null>(null);
  const [editingVariantForProduct, setEditingVariantForProduct] = useState<string | null>(null);

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
    rafflePrizeDescription: '',
    raffleDrawDate: '',
  });

  const [variantForm, setVariantForm] = useState({
    name: '',
    sku: '',
    priceAdjustment: '0',
    inventory: '0',
    optionType: 'size' as 'size' | 'color' | 'style' | 'other',
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

  const products = productsData?.products || [];
  const orders = ordersData?.orders || [];

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof productForm) => {
      const response = await apiRequest('POST', '/api/shop/admin/products', {
        ...data,
        basePrice: data.basePrice || '0',
        totalInventory: data.trackInventory ? parseInt(data.totalInventory) || 0 : null,
        maxPerOrder: data.maxPerOrder ? parseInt(data.maxPerOrder) : null,
        raffleDrawDate: data.raffleDrawDate ? new Date(data.raffleDrawDate) : null,
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
      const response = await apiRequest('PATCH', `/api/shop/admin/products/${id}`, {
        ...data,
        basePrice: data.basePrice || '0',
        totalInventory: data.trackInventory ? parseInt(data.totalInventory) || 0 : null,
        maxPerOrder: data.maxPerOrder ? parseInt(data.maxPerOrder) : null,
        raffleDrawDate: data.raffleDrawDate ? new Date(data.raffleDrawDate) : null,
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
      rafflePrizeDescription: '',
      raffleDrawDate: '',
    });
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
      rafflePrizeDescription: product.rafflePrizeDescription || '',
      raffleDrawDate: product.raffleDrawDate ? new Date(product.raffleDrawDate).toISOString().split('T')[0] : '',
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
          <Button onClick={() => { resetProductForm(); setEditingProduct(null); setProductDialogOpen(true); }} data-testid="button-add-product">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
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
                  <Button onClick={() => setProductDialogOpen(true)}>
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
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Orders Yet</h3>
                  <p className="text-muted-foreground">
                    Orders will appear here once customers make purchases.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders.map(order => (
                  <Card key={order.id} data-testid={`order-row-${order.id}`}>
                    <CardContent className="py-4">
                      <div className="flex flex-wrap gap-4 items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{order.orderNumber}</span>
                            <Badge variant={order.paymentStatus === 'paid' ? 'default' : 'secondary'}>
                              {order.paymentStatus}
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
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
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
                  <Button onClick={() => { resetProductForm(); setProductForm(prev => ({ ...prev, productType: 'raffle' })); setProductDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Raffle
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {products.filter(p => p.productType === 'raffle').map(raffle => (
                  <Card key={raffle.id}>
                    <CardContent className="py-4">
                      <div className="flex flex-wrap gap-4 items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Gift className="h-5 w-5 text-primary" />
                            <span className="font-semibold">{raffle.name}</span>
                            <Badge variant={raffle.status === 'active' ? 'default' : 'secondary'}>
                              {raffle.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ${raffle.basePrice} per ticket
                          </p>
                          {raffle.raffleDrawDate && (
                            <p className="text-sm">
                              Drawing: {new Date(raffle.raffleDrawDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button variant="outline" onClick={() => openEditProduct(raffle)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

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
                  <Input
                    id="slug"
                    value={productForm.slug}
                    onChange={(e) => setProductForm(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="auto-generated-from-name"
                    data-testid="input-product-slug"
                  />
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
