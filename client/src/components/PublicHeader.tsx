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
import { Menu, ChevronDown } from "lucide-react";
import type { CustomPage } from "@shared/schema";

const DEFAULT_LOGO = "/icon-192.png";

interface PublicHeaderProps {
  rescueName: string;
  logoUrl?: string;
}

export default function PublicHeader({ rescueName, logoUrl }: PublicHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Fetch published pages that should show in navigation
  const { data: pagesData } = useQuery<{ pages: CustomPage[] }>({
    queryKey: ['/api/custom-pages/navigation'],
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  
  const navigationPages = pagesData?.pages || [];
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 md:gap-3 hover-elevate rounded-md px-2 md:px-3 py-2 -ml-2 md:-ml-3">
          <img 
            src={logoUrl || DEFAULT_LOGO} 
            alt={rescueName} 
            className="h-8 w-8 rounded-md object-cover flex-shrink-0" 
          />
          <span className="font-display text-lg md:text-xl font-semibold truncate">{rescueName}</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          <Link href="/volunteer">
            <Button variant="ghost" data-testid="button-volunteer">
              Volunteer
            </Button>
          </Link>
          <Link href="/become-a-foster">
            <Button variant="ghost" data-testid="button-foster">
              Foster
            </Button>
          </Link>
          <Link href="/surrender">
            <Button variant="ghost" data-testid="button-surrender">
              Surrender
            </Button>
          </Link>
          
          {/* Custom Navigation Pages - More dropdown */}
          {navigationPages.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" data-testid="button-more-pages">
                  More
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
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
          )}
          
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
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <nav className="flex flex-col gap-3 mt-8">
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
              
              {/* Custom Navigation Pages - in mobile menu */}
              {navigationPages.length > 0 && (
                <>
                  <div className="border-t my-2" />
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
