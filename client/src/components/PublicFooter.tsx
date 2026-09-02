import { Link } from "wouter";
import { SiFacebook, SiInstagram, SiTiktok, SiYoutube } from "react-icons/si";
import type { Tenant } from "@shared/schema";
import NewsletterSubscribe from "@/components/NewsletterSubscribe";
import MobileSponsorCarousel from "@/components/MobileSponsorCarousel";
import { useIsMobile } from "@/hooks/use-mobile";

interface PublicFooterProps {
  tenant?: Tenant;
  basePath?: string;
}

export default function PublicFooter({ tenant, basePath = "" }: PublicFooterProps) {
  const isMobile = useIsMobile();
  const rescueName = tenant?.name || "Animal Rescue";
  const path = (route: string) => `${basePath}${route}`;
  const sponsors = ((tenant as any)?.sponsorLogos || []) as Array<{
    id: string;
    imageUrl: string;
    altText: string;
    linkUrl?: string;
  }>;

  return (
    <footer className="mt-auto border-t bg-card py-8 sm:py-12" data-testid="public-footer">
      <div className="container px-6 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 md:grid-cols-4">
          <div>
            <h3 className="font-display mb-4 text-lg font-semibold">About Us</h3>
            <p className="text-sm text-muted-foreground" data-testid="text-mission-statement">
              {tenant?.missionStatement || tenant?.tagline || `${rescueName} is dedicated to rescuing, rehabilitating, and rehoming animals in need.`}
            </p>
          </div>

          <div>
            <h3 className="font-display mb-4 text-lg font-semibold">Contact</h3>
            <div className="flex flex-col gap-2 text-sm">
              <Link href={path("/contact")} className="text-muted-foreground transition-colors hover:text-foreground">
                Send us a message
              </Link>
              {tenant?.contactPhone && (
                <a href={`tel:${tenant.contactPhone}`} className="text-muted-foreground transition-colors hover:text-foreground">
                  {tenant.contactPhone}
                </a>
              )}
              {tenant?.footerAddress && <p className="text-muted-foreground">{tenant.footerAddress}</p>}
              {tenant?.footerHours && <p className="text-muted-foreground">{tenant.footerHours}</p>}
              {(tenant?.socialFacebook || tenant?.socialInstagram || tenant?.socialYoutube || tenant?.socialTiktok) && (
                <div className="mt-3 flex items-center gap-3" data-testid="social-media-links">
                  {tenant.socialFacebook && <a href={tenant.socialFacebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"><SiFacebook className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" /></a>}
                  {tenant.socialInstagram && <a href={tenant.socialInstagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><SiInstagram className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" /></a>}
                  {tenant.socialYoutube && <a href={tenant.socialYoutube} target="_blank" rel="noopener noreferrer" aria-label="YouTube"><SiYoutube className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" /></a>}
                  {tenant.socialTiktok && <a href={tenant.socialTiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"><SiTiktok className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" /></a>}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display mb-4 text-lg font-semibold">Get Involved</h3>
            <div className="flex flex-col gap-2 text-sm">
              <Link href={path("/volunteer")} className="text-muted-foreground transition-colors hover:text-foreground">Volunteer</Link>
              <Link href={path("/become-a-foster")} className="text-muted-foreground transition-colors hover:text-foreground">Become a Foster</Link>
              <Link href={path("/surrender")} className="text-muted-foreground transition-colors hover:text-foreground">Surrender an Animal</Link>
              <Link href={path("/surgery-day-request")} className="text-muted-foreground transition-colors hover:text-foreground">Request a Surgery Day</Link>
            </div>
          </div>

          <NewsletterSubscribe variant="inline" />
        </div>

        {sponsors.length > 0 && (
          <div className="mt-8 border-t pt-8">
            <h4 className="mb-4 text-center text-sm font-medium text-muted-foreground">Our Sponsors &amp; Partners</h4>
            {isMobile ? (
              <MobileSponsorCarousel sponsors={sponsors} />
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-6">
                {sponsors.map((sponsor) => {
                  const logo = <img src={sponsor.imageUrl} alt={sponsor.altText} className="h-14 w-auto object-contain" />;
                  return sponsor.linkUrl
                    ? <a key={sponsor.id} href={sponsor.linkUrl} target="_blank" rel="noopener noreferrer" className="opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0">{logo}</a>
                    : <div key={sponsor.id} className="opacity-70 grayscale">{logo}</div>;
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 space-y-2 border-t pt-8 text-center text-sm text-muted-foreground">
          <p>{tenant?.footerText || `© ${new Date().getFullYear()} ${rescueName}. All rights reserved.`}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href={tenant?.privacyPolicyUrl || path("/platform/privacy")} target={tenant?.privacyPolicyUrl ? "_blank" : undefined} rel={tenant?.privacyPolicyUrl ? "noopener noreferrer" : undefined} className="transition-colors hover:text-foreground">Privacy Policy</a>
            <span className="text-muted-foreground/50">•</span>
            <a href={tenant?.termsOfServiceUrl || path("/platform/terms")} target={tenant?.termsOfServiceUrl ? "_blank" : undefined} rel={tenant?.termsOfServiceUrl ? "noopener noreferrer" : undefined} className="transition-colors hover:text-foreground">Terms of Service</a>
          </div>
          <p>Powered by <a href="https://irescue.life" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">iRescue.life</a></p>
        </div>
      </div>
    </footer>
  );
}