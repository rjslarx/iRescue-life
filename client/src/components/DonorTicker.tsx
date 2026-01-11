import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Donation {
  id: string;
  donorName: string;
  amount: string;
  message: string | null;
  donatedAt: Date | string;
  animalName?: string;
}

interface DonorTickerProps {
  animalId?: string;
  limit?: number;
  showCard?: boolean;
  title?: string;
}

export function DonorTicker({ 
  animalId, 
  limit = 10, 
  showCard = true,
  title = "Wall of Love" 
}: DonorTickerProps) {
  const queryUrl = `/api/donations/wall-of-love?${new URLSearchParams({
    ...(animalId && { animalId }),
    limit: limit.toString(),
  }).toString()}`;

  const { data, isLoading } = useQuery<{ donations: Donation[] }>({
    queryKey: ['/api/donations/wall-of-love', animalId, limit],
    queryFn: async () => {
      const response = await fetch(queryUrl);
      if (!response.ok) throw new Error('Failed to fetch donations');
      return response.json();
    },
  });

  const donations = data?.donations || [];

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const formatTime = (dateString: Date | string) => {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const content = (
    <>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : donations.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No donations yet</p>
          <p className="text-xs">Be the first to donate!</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {donations.map((donation) => (
            <div 
              key={donation.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover-elevate transition-colors"
              data-testid={`donation-item-${donation.id}`}
            >
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-pink-500" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate" data-testid="text-donor-name">
                    {donation.donorName}
                  </span>
                  <Badge variant="secondary" className="text-xs" data-testid="text-donation-amount">
                    {formatAmount(donation.amount)}
                  </Badge>
                </div>
                {donation.message && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2" data-testid="text-donation-message">
                    "{donation.message}"
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {donation.animalName && (
                    <span className="text-xs text-muted-foreground">
                      for {donation.animalName}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatTime(donation.donatedAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card data-testid="card-donor-ticker">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Heart className="h-5 w-5 text-pink-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}

export function DonorTickerMarquee({ limit = 20 }: { limit?: number }) {
  const queryUrl = `/api/donations/wall-of-love?limit=${limit}`;
  
  const { data, isLoading } = useQuery<{ donations: Donation[] }>({
    queryKey: ['/api/donations/wall-of-love', null, limit],
    queryFn: async () => {
      const response = await fetch(queryUrl);
      if (!response.ok) throw new Error('Failed to fetch donations');
      return response.json();
    },
    refetchInterval: 30000,
  });

  const donations = data?.donations || [];

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  if (isLoading || donations.length === 0) {
    return null;
  }

  return (
    <div className="w-full overflow-hidden bg-pink-50 dark:bg-pink-950/20 py-2" data-testid="donor-ticker-marquee">
      <div className="flex animate-marquee gap-8 whitespace-nowrap">
        {donations.map((donation, index) => (
          <div key={donation.id + '-' + index} className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500 flex-shrink-0" />
            <span className="text-sm">
              <span className="font-medium">{donation.donorName}</span>
              {' donated '}
              <span className="font-medium text-pink-600 dark:text-pink-400">
                {formatAmount(donation.amount)}
              </span>
              {donation.animalName && (
                <span> for {donation.animalName}</span>
              )}
            </span>
          </div>
        ))}
        {donations.map((donation, index) => (
          <div key={donation.id + '-repeat-' + index} className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500 flex-shrink-0" />
            <span className="text-sm">
              <span className="font-medium">{donation.donorName}</span>
              {' donated '}
              <span className="font-medium text-pink-600 dark:text-pink-400">
                {formatAmount(donation.amount)}
              </span>
              {donation.animalName && (
                <span> for {donation.animalName}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
