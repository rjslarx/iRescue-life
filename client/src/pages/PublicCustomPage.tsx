import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Home, Share2, Facebook, Twitter, Linkedin, Mail, Link as LinkIcon, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import PublicHeader from "@/components/PublicHeader";
import { BlockRenderer } from "@/components/PageBuilder";
import type { CustomPage, Tenant, PageBlock } from "@shared/schema";

export default function PublicCustomPage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = params.slug || '';
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Fetch tenant data
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  // Fetch page by slug
  const { data, isLoading, error } = useQuery<{ page: CustomPage }>({
    queryKey: [`/api/custom-pages/slug/${slug}`],
    enabled: !!slug,
  });

  const page = data?.page;
  const tenant = tenantData?.tenant;

  // SEO configuration - always call hook, provide safe defaults when data not loaded
  useSEO({
    title: page && tenant ? `${page.title} | ${tenant.name}` : 'Custom Page',
    description: page?.excerpt,
    siteName: tenant?.name,
  });

  // Get the current page URL
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = page ? `${page.title} | ${tenant?.name || ''}` : '';
  const shareText = page?.excerpt || shareTitle;

  // Handle native share (Web Share API)
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: pageUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', err);
      }
    }
  };

  // Handle copy link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "The page link has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again or copy the URL manually.",
        variant: "destructive",
      });
    }
  };

  // Social media share URLs
  const shareUrls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText + '\n\n' + pageUrl)}`,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader 
          rescueName={tenant?.name || "Rescue Portal"}
          logoUrl={tenant?.logoUrl || undefined}
        />
        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader 
          rescueName={tenant?.name || "Rescue Portal"}
          logoUrl={tenant?.logoUrl || undefined}
        />
        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Page not found. This page may have been removed or is not yet published.
              </AlertDescription>
            </Alert>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader 
        rescueName={tenant?.name || "Rescue Portal"}
        logoUrl={tenant?.logoUrl || undefined}
      />
      <main className="container mx-auto px-6 py-12">
        <article className="max-w-4xl mx-auto">
          {/* Navigation and Share Buttons */}
          <div className="mb-6 flex items-center justify-between gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back-home">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>

            {/* Share Button - Use native share on mobile, dropdown on desktop */}
            {typeof navigator !== 'undefined' && navigator.share ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNativeShare}
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-share">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <a 
                      href={shareUrls.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center cursor-pointer"
                      data-testid="share-facebook"
                    >
                      <Facebook className="w-4 h-4 mr-2" />
                      Share on Facebook
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a 
                      href={shareUrls.twitter} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center cursor-pointer"
                      data-testid="share-twitter"
                    >
                      <Twitter className="w-4 h-4 mr-2" />
                      Share on X
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a 
                      href={shareUrls.linkedin} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center cursor-pointer"
                      data-testid="share-linkedin"
                    >
                      <Linkedin className="w-4 h-4 mr-2" />
                      Share on LinkedIn
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a 
                      href={shareUrls.email}
                      className="flex items-center cursor-pointer"
                      data-testid="share-email"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Share via Email
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleCopyLink}
                    data-testid="share-copy-link"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-green-600" />
                        Link Copied!
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-4 h-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <header className="mb-8">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">{page.title}</h1>
            {page.excerpt && (
              <p className="text-xl text-muted-foreground">{page.excerpt}</p>
            )}
          </header>

          <Card>
            <CardContent className="pt-6">
              {page.useBlockEditor && page.contentBlocks && (page.contentBlocks as PageBlock[]).length > 0 ? (
                <BlockRenderer blocks={page.contentBlocks as PageBlock[]} />
              ) : (
                <div className="prose prose-lg max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {page.contentMarkdown}
                  </ReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>
        </article>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t mt-16">
        <div className="container px-6 py-8">
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>{tenant?.footerText || `© ${new Date().getFullYear()} ${tenant?.name || "Animal Rescue"}. All rights reserved.`}</p>
            <p>
              Powered by <a href="https://irescue.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid="link-powered-by">iRescue.life</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
