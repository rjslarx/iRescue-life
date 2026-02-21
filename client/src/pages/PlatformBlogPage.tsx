import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint, ArrowRight, Calendar } from "lucide-react";

export default function PlatformBlogPage() {
  useSEO({
    title: "Blog - iRescue.life",
    description: "Tips, guides, and insights for animal rescue organizations. Learn how to streamline operations and save more lives.",
    siteName: "iRescue.life",
  });

  const blogPosts = [
    {
      slug: "google-for-nonprofits-for-animal-rescues",
      title: "Stop Juggling Spreadsheets: How Your Animal Rescue Can Get Google Workspace for Free",
      excerpt: "Running an animal rescue is chaotic. See how your 501(c)(3) can get Google Workspace for Nonprofits 100% free, and how it integrates with rescue management software like iRescue.life.",
      date: "January 15, 2025",
      category: "Nonprofit Resources",
      readTime: "8 min read"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/platform">
              <a className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                  <PawPrint className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl">iRescue.life</span>
              </a>
            </Link>
            <Link href="/platform">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4" data-testid="heading-blog">
            iRescue.life Blog
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
            Tips, guides, and insights to help your animal rescue operate more efficiently and save more lives.
          </p>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <div className="container max-w-7xl mx-auto px-6 py-12 sm:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <Card key={post.slug} className="hover-elevate flex flex-col" data-testid={`blog-card-${post.slug}`}>
              <CardHeader className="flex-1">
                <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{post.date}</span>
                  <span>•</span>
                  <span>{post.readTime}</span>
                </div>
                <Badge variant="secondary" className="w-fit mb-3" data-testid={`category-${post.category.toLowerCase().replace(/\s+/g, '-')}`}>
                  {post.category}
                </Badge>
                <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                <CardDescription className="text-sm line-clamp-3">
                  {post.excerpt}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/platform/blog/${post.slug}`}>
                  <Button variant="outline" className="w-full" data-testid={`button-read-${post.slug}`}>
                    Read Article
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Newsletter CTA */}
      <section className="py-12 sm:py-20 bg-muted/30">
        <div className="container max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            Stay Updated
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Get the latest tips, product updates, and rescue success stories delivered to your inbox.
          </p>
          <Button size="lg" asChild data-testid="button-subscribe">
            <a href="mailto:[email protected]?subject=Subscribe to Newsletter">Subscribe to Newsletter</a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30 mt-12">
        <div className="container max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Turbeau, LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
