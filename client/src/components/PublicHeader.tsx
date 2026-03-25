import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, ChevronDown, Package, Heart, TicketPercent, HeartHandshake, ShoppingBag } from "lucide-react";
import type { CustomPage, SupplyItem, Tenant } from "@shared/schema";

interface ActiveCampaign {
  id: string;
  title: string;
}
import { useTenant } from "@/contexts/TenantContext";

const DEFAULT_LOGO = "/icon-192.png";

interface PublicHeaderProps {
  rescueName: string;
  logoUrl?: string;
}

export default function PublicHeader({ rescueName, logoUrl }: PublicHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { tenantId } = useTenant();
  
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant', tenantId],
    staleTime: 1000 * 60 * 5,
  });

  const tenant = tenantData?.tenant;
  const isLiteTier = (tenant as any)?.subscriptionTier === 'lite';
  const jotformVolunteerUrl = isLiteTier ? (tenant as any)?.jotformVolunteerUrl : null;
  const jotformFosterUrl = isLiteTier ? (tenant as any)?.jotformFosterUrl : null;
  const jotformSurrenderUrl = isLiteTier ? (tenant as any)?.jotformSurrenderUrl : null;
  
  // Fetch published pages that should show in navigation
  const { data: pagesData } = useQuery<{ pages: CustomPage[] }>({
    queryKey: ['/api/custom-pages/navigation'],
    staleTime: 1000 * 60 * 5,
  });
  
  // Fetch supply items to check if wishlist should show
  const { data: supplyData } = useQuery<{ items: SupplyItem[] }>({
    queryKey: ['/api/supply-items'],
    staleTime: 1000 * 60 * 5,
  });
  
  const { data: campaignsData } = useQuery<{ campaigns: ActiveCampaign[] }>({
    queryKey: ['/api/public-emergency-campaigns'],
    staleTime: 1000 * 60 * 5,
  });

  const { data: fundraiserData } = useQuery<{ events: Array<{ id: string }> }>({
    queryKey: ['/api/fundraiser-events/public', tenantId],
    queryFn: async () => {
      const res = await fetch('/api/fundraiser-events/public', {
        headers: { 'x-tenant-id': tenantId || '' },
      });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  });

  const navigationPages = pagesData?.pages || [];
  const hasWishlistItems = (supplyData?.items?.length || 0) > 0;
  const activeCampaigns = campaignsData?.campaigns || [];
  const hasActiveFundraisers = (fundraiserData?.events?.length || 0) > 0;
  
  const shopEnabled = (tenant as any)?.shopEnabled ?? false;
  const hasStartFundraiser = true;
  const showMoreDropdown = hasStartFundraiser || navigationPages.length > 0 || hasWishlistItems || activeCampaigns.length > 0 || shopEnabled;
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 md:gap-3 hover-elevate rounded-md px-2 md:px-3 py-2 -ml-2 md:-ml-3 flex-1 min-w-0 overflow-hidden">
          <img 
            src={logoUrl || DEFAULT_LOGO} 
            alt={rescueName} 
            className="h-8 w-8 rounded-md object-cover flex-shrink-0" 
          />
          <span className="font-display text-lg md:text-xl font-semibold truncate">{rescueName}</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          {jotformVolunteerUrl ? (
            <a href={jotformVolunteerUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" data-testid="button-volunteer">
                Volunteer
              </Button>
            </a>
          ) : (
            <Link href="/volunteer">
              <Button variant="ghost" data-testid="button-volunteer">
                Volunteer
              </Button>
            </Link>
          )}
          {jotformFosterUrl ? (
            <a href={jotformFosterUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" data-testid="button-foster">
                Foster
              </Button>
            </a>
          ) : (
            <Link href="/become-a-foster">
              <Button variant="ghost" data-testid="button-foster">
                Foster
              </Button>
            </Link>
          )}
          {jotformSurrenderUrl ? (
            <a href={jotformSurrenderUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" data-testid="button-surrender">
                Surrender
              </Button>
            </a>
          ) : (
            <Link href="/surrender">
              <Button variant="ghost" data-testid="button-surrender">
                Surrender
              </Button>
            </Link>
          )}
          
          {/* Custom Navigation Pages, Wishlist & Fundraisers - More dropdown or standalone */}
          {showMoreDropdown ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" data-testid="button-more-pages">
                  More
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link
                    href="/fundraise"
                    className="cursor-pointer w-full flex items-center gap-2"
                    data-testid="link-nav-start-fundraiser"
                  >
                    <HeartHandshake className="h-4 w-4" />
                    Start a Fundraiser
                  </Link>
                </DropdownMenuItem>
                {hasActiveFundraisers && (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/fundraisers"
                      className="cursor-pointer w-full flex items-center gap-2"
                      data-testid="link-nav-fundraisers"
                    >
                      <TicketPercent className="h-4 w-4" />
                      Fundraisers
                    </Link>
                  </DropdownMenuItem>
                )}
                {shopEnabled && (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/shop"
                      className="cursor-pointer w-full flex items-center gap-2"
                      data-testid="link-nav-shop"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Shop
                    </Link>
                  </DropdownMenuItem>
                )}
                {hasWishlistItems && (
                  <DropdownMenuItem asChild>
                    <Link 
                      href="/wishlist"
                      className="cursor-pointer w-full flex items-center gap-2"
                      data-testid="link-nav-wishlist"
                    >
                      <Package className="h-4 w-4" />
                      Supply Wishlist
                    </Link>
                  </DropdownMenuItem>
                )}
                {activeCampaigns.map((campaign) => (
                  <DropdownMenuItem key={campaign.id} asChild>
                    <Link 
                      href={`/campaigns/${campaign.id}`}
                      className="cursor-pointer w-full flex items-center gap-2"
                      data-testid={`link-nav-campaign-${campaign.id}`}
                    >
                      <Heart className="h-4 w-4" />
                      {campaign.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {navigationPages.map((page) => (
                  <DropdownMenuItem key={page.id} asChild>
                    <Link 
                      href={`/${page.slug}`}
                      className="cursor-pointer w-full"
                      data-testid={`link-nav-page-${page.slug}`}
                    >
                      {page.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : hasActiveFundraisers ? (
            <Link href="/fundraisers">
              <Button variant="ghost" data-testid="button-fundraisers">
                <TicketPercent className="h-4 w-4 mr-1.5" />
                Fundraisers
              </Button>
            </Link>
          ) : null}
          <Link href="/donate">
            <Button variant="default" data-testid="button-donate">
              Donate
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" data-testid="button-login">
              Team Login
            </Button>
          </Link>
        </nav>

        {/* Mobile Navigation */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="md:hidden flex-shrink-0">
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <nav className="flex flex-col gap-3 mt-8">
              {jotformVolunteerUrl ? (
                <a href={jotformVolunteerUrl} target="_blank" rel="noopener noreferrer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-volunteer-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Volunteer
                  </Button>
                </a>
              ) : (
                <Link href="/volunteer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-volunteer-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Volunteer
                  </Button>
                </Link>
              )}
              {jotformFosterUrl ? (
                <a href={jotformFosterUrl} target="_blank" rel="noopener noreferrer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-foster-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Foster
                  </Button>
                </a>
              ) : (
                <Link href="/become-a-foster">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-foster-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Foster
                  </Button>
                </Link>
              )}
              {jotformSurrenderUrl ? (
                <a href={jotformSurrenderUrl} target="_blank" rel="noopener noreferrer">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-surrender-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Surrender
                  </Button>
                </a>
              ) : (
                <Link href="/surrender">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start" 
                    data-testid="button-surrender-mobile"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Surrender
                  </Button>
                </Link>
              )}
              
              {/* Custom Navigation Pages, Campaigns, Wishlist & Fundraisers - in mobile menu */}
              {(showMoreDropdown || hasActiveFundraisers) && (
                <>
                  <div className="border-t my-2" />
                  <Link href="/fundraise">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      data-testid="button-start-fundraiser-mobile"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <HeartHandshake className="h-4 w-4 mr-2" />
                      Start a Fundraiser
                    </Button>
                  </Link>
                  {hasActiveFundraisers && (
                    <Link href="/fundraisers">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        data-testid="button-fundraisers-mobile"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <TicketPercent className="h-4 w-4 mr-2" />
                        Fundraisers
                      </Button>
                    </Link>
                  )}
                  {shopEnabled && (
                    <Link href="/shop">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        data-testid="button-shop-mobile"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Shop
                      </Button>
                    </Link>
                  )}
                  {hasWishlistItems && (
                    <Link href="/wishlist">
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        data-testid="button-wishlist-mobile"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Package className="h-4 w-4 mr-2" />
                        Supply Wishlist
                      </Button>
                    </Link>
                  )}
                  {activeCampaigns.map((campaign) => (
                    <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        data-testid={`button-nav-campaign-${campaign.id}-mobile`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        {campaign.title}
                      </Button>
                    </Link>
                  ))}
                  {navigationPages.map((page) => (
                    <Link key={page.id} href={`/${page.slug}`}>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        data-testid={`button-nav-page-${page.slug}-mobile`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {page.title}
                      </Button>
                    </Link>
                  ))}
                  <div className="border-t my-2" />
                </>
              )}
              <Link href="/donate">
                <Button 
                  variant="default" 
                  className="w-full justify-start" 
                  data-testid="button-donate-mobile"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Donate
                </Button>
              </Link>
              <Link href="/login">
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  data-testid="button-login-mobile"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Team Login
                </Button>
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
