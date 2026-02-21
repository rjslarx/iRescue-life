import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, MapPin, ArrowLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface Event {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  customPageSlug: string | null;
  calendarName: string;
  calendarColor: string;
  calendarType: "events" | "fundraising";
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id;

  const { data, isLoading, error } = useQuery<{ event: Event }>({
    queryKey: [`/api/events/${eventId}`],
    enabled: !!eventId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl px-6 py-12 space-y-8">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-48 w-full" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.event) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl px-6 py-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <Card>
            <CardContent className="p-12 text-center">
              <h2 className="text-2xl font-bold mb-2">Event Not Found</h2>
              <p className="text-muted-foreground mb-6">
                The event you're looking for doesn't exist or has been removed.
              </p>
              <Button asChild>
                <Link href="/">Return to Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const event = data.event;
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const eventTypeLabel = event.calendarType === "fundraising" ? "Fundraiser" : "Event";
  const eventTypeColor = event.calendarType === "fundraising" 
    ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" 
    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl px-6 py-12 space-y-8">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="font-display text-4xl md:text-5xl font-bold flex-1" data-testid="text-event-title">
                {event.title}
              </h1>
              <Badge variant="outline" className={eventTypeColor}>
                {eventTypeLabel}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: event.calendarColor }}
              />
              <span className="text-muted-foreground font-medium">
                {event.calendarName}
              </span>
            </div>
          </div>

          <Card>
            <div 
              className="h-2" 
              style={{ backgroundColor: event.calendarColor }}
            />
            <CardContent className="p-8 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Calendar className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-foreground" data-testid="text-event-date">
                        {format(start, "EEEE, MMMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Clock className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-foreground" data-testid="text-event-time">
                        {format(start, "h:mm a")} - {format(end, "h:mm a")}
                      </div>
                    </div>
                  </div>
                </div>

                {event.location && (
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <MapPin className="h-5 w-5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-foreground" data-testid="text-event-location">
                          {event.location}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {event.description && (
                <div className="pt-4 border-t">
                  <h2 className="text-xl font-semibold mb-3">About This Event</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-event-description">
                    {event.description}
                  </p>
                </div>
              )}

              {event.customPageSlug && (
                <div className="pt-4 border-t">
                  <Button asChild className="w-full sm:w-auto" data-testid="button-view-custom-page">
                    <Link href={`/page/${event.customPageSlug}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Event Page
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
