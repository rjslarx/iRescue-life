import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, MapPin, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecentDonation {
  id: string;
  displayName: string;
  amount: number;
  location: string | null;
  createdAt: string;
}

interface RecentDonationsWidgetProps {
  tenantSubdomain: string;
  className?: string;
}

export function RecentDonationsWidget({ tenantSubdomain, className }: RecentDonationsWidgetProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const { data: donations = [], isLoading } = useQuery<RecentDonation[]>({
    queryKey: [`/api/compliance/public/recent-donations`, tenantSubdomain],
    enabled: !isDismissed && !!tenantSubdomain,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const cycleToNext = useCallback(() => {
    if (donations.length <= 1) return;
    
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % donations.length);
      setIsAnimating(false);
    }, 300);
  }, [donations.length]);

  useEffect(() => {
    if (donations.length <= 1 || isDismissed) return;
    
    const interval = setInterval(cycleToNext, 5000);
    return () => clearInterval(interval);
  }, [donations.length, isDismissed, cycleToNext]);

  useEffect(() => {
    if (isDismissed) return;
    
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);
    
    return () => clearTimeout(showTimer);
  }, [isDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => setIsDismissed(true), 300);
  };

  const handleDonateClick = () => {
    const donationSection = document.getElementById('donation-section');
    if (donationSection) {
      donationSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (isDismissed || isLoading || donations.length === 0) {
    return null;
  }

  const currentDonation = donations[currentIndex];
  const amountFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(currentDonation.amount / 100);

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 transition-all duration-300 ease-in-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className
      )}
      data-testid="recent-donations-widget"
    >
      <div className="bg-background border border-border rounded-lg shadow-lg p-4 max-w-sm relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 opacity-60 hover:opacity-100"
          onClick={handleDismiss}
          data-testid="button-dismiss-widget"
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div 
          className={cn(
            'transition-opacity duration-300',
            isAnimating ? 'opacity-0' : 'opacity-100'
          )}
        >
          <div className="flex items-start gap-3 pr-6">
            <div className="flex-shrink-0 mt-0.5">
              <Heart className="h-5 w-5 text-primary fill-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground" data-testid="text-donation-info">
                <span className="text-primary font-semibold">{currentDonation.displayName}</span>
                {' '}donated{' '}
                <span className="font-semibold">{amountFormatted}</span>
              </p>
              
              {currentDonation.location && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground" data-testid="text-donation-location">
                  <MapPin className="h-3 w-3" />
                  <span>{currentDonation.location}</span>
                </div>
              )}
            </div>
            
            <div className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="text-primary border-primary hover:bg-primary/10"
                onClick={handleDonateClick}
                data-testid="button-donate-widget"
              >
                Donate
              </Button>
            </div>
          </div>
        </div>
        
        {donations.length > 1 && (
          <div className="flex justify-center gap-1 mt-3" data-testid="widget-pagination-dots">
            {donations.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
                aria-label={`Go to donation ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
