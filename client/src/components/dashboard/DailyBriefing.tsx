import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  Pill, 
  Calendar, 
  Truck, 
  Scissors, 
  Clock,
  ChevronRight,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";

interface Surgery {
  id: string;
  name: string;
  species: string;
  scheduledSurgeryDate: string;
  neuterStatus: string;
}

interface Transport {
  id: string;
  name: string;
  transportType: string;
  departureDate: string;
  originLocation: string;
  destinationLocation: string;
  animalCount: number;
}

interface MedicalTask {
  id: string;
  animalId: string;
  careName: string;
  careCategory: string;
  nextDueDate: string;
  animalName: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  location: string;
}

interface DailyBriefingData {
  today: {
    surgeries: Surgery[];
    transports: Transport[];
    medical: MedicalTask[];
    calendar: CalendarEvent[];
    overdue: MedicalTask[];
  };
  tomorrow: {
    surgeries: Surgery[];
    transports: Transport[];
    medical: MedicalTask[];
    calendar: CalendarEvent[];
  };
  summary: {
    urgentCount: number;
    medicalTodayCount: number;
    medicalTomorrowCount: number;
    calendarTodayCount: number;
    calendarTomorrowCount: number;
  };
}

export function DailyBriefing() {
  const { basePath } = useTenant();
  
  const { data, isLoading } = useQuery<DailyBriefingData>({
    queryKey: ['/api/dashboard/daily-briefing'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="h-full" data-testid="card-daily-briefing">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Daily Briefing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasUrgent = data && (
    data.today.surgeries.length > 0 || 
    data.today.transports.length > 0 || 
    data.today.overdue.length > 0
  );

  const hasMedicalToday = data && data.today.medical.length > 0;
  const hasTomorrowItems = data && (
    data.tomorrow.surgeries.length > 0 ||
    data.tomorrow.transports.length > 0 ||
    data.tomorrow.medical.length > 0 ||
    data.tomorrow.calendar.length > 0
  );

  const isEmpty = !hasUrgent && !hasMedicalToday && !hasTomorrowItems && 
    (!data?.today.calendar || data.today.calendar.length === 0);

  return (
    <Card className="h-full flex flex-col" data-testid="card-daily-briefing">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Daily Briefing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          {isEmpty ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">All clear for today!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {hasUrgent && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-semibold text-destructive">Urgent</span>
                  </div>
                  <div className="space-y-2">
                    {data?.today.overdue.map((item) => (
                      <Link 
                        key={item.id} 
                        href={`/dashboard/animals/${item.animalId}/medical`}
                        className="block"
                        data-testid={`link-overdue-${item.id}`}
                      >
                        <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 hover-elevate cursor-pointer">
                          <Clock className="h-3 w-3 text-destructive flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.careName}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.animalName} - Overdue</p>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                    {data?.today.surgeries.map((surgery) => (
                      <Link 
                        key={surgery.id} 
                        href={`/dashboard/animals/${surgery.id}/medical`}
                        className="block"
                        data-testid={`link-surgery-${surgery.id}`}
                      >
                        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 hover-elevate cursor-pointer">
                          <Scissors className="h-3 w-3 text-amber-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {surgery.neuterStatus === 'intact' ? 'Spay/Neuter' : 'Surgery'} - {surgery.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {format(new Date(surgery.scheduledSurgeryDate), 'h:mm a')}
                            </p>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                    {data?.today.transports.map((transport) => (
                      <Link 
                        key={transport.id} 
                        href={`/dashboard/transports/${transport.id}`}
                        className="block"
                        data-testid={`link-transport-${transport.id}`}
                      >
                        <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/10 hover-elevate cursor-pointer">
                          <Truck className="h-3 w-3 text-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{transport.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {transport.animalCount} animals • {format(new Date(transport.departureDate), 'h:mm a')}
                            </p>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {hasMedicalToday && (
                <>
                  {hasUrgent && <Separator />}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Pill className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold">Medical Tasks</span>
                      <Badge variant="secondary" className="text-xs">
                        {data?.today.medical.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {data?.today.medical.slice(0, 5).map((task) => (
                        <Link 
                          key={task.id} 
                          href={`/dashboard/animals/${task.animalId}/medical`}
                          className="block"
                          data-testid={`link-medical-${task.id}`}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{task.careName}</p>
                              <p className="text-xs text-muted-foreground truncate">{task.animalName}</p>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                      {data && data.today.medical.length > 5 && (
                        <Link href="/dashboard/medical-pipeline?tab=preventative" data-testid="link-more-medical-tasks">
                          <p className="text-xs text-primary hover:underline pl-2 cursor-pointer">
                            +{data.today.medical.length - 5} more tasks
                          </p>
                        </Link>
                      )}
                    </div>
                  </div>
                </>
              )}

              {data?.today.calendar && data.today.calendar.length > 0 && (
                <>
                  {(hasUrgent || hasMedicalToday) && <Separator />}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-semibold">Today's Events</span>
                    </div>
                    <div className="space-y-1">
                      {data.today.calendar.slice(0, 3).map((event) => (
                        <div key={event.id} className="flex items-center gap-2 p-2 rounded-md">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {format(new Date(event.startTime), 'h:mm a')}
                              {event.location && ` • ${event.location}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {hasTomorrowItems && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Tomorrow</span>
                    </div>
                    <div className="space-y-2">
                      {data?.tomorrow.surgeries.map((surgery) => (
                        <Link 
                          key={surgery.id} 
                          href={`/dashboard/animals/${surgery.id}/medical`}
                          className="block"
                          data-testid={`link-tomorrow-surgery-${surgery.id}`}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 hover-elevate cursor-pointer">
                            <Scissors className="h-3 w-3 text-amber-600/70 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground truncate">
                                {surgery.neuterStatus === 'intact' ? 'Spay/Neuter' : 'Surgery'} - {surgery.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70 truncate">
                                {format(new Date(surgery.scheduledSurgeryDate), 'h:mm a')}
                              </p>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                      {data?.tomorrow.transports.map((transport) => (
                        <Link 
                          key={transport.id} 
                          href={`/dashboard/transports/${transport.id}`}
                          className="block"
                          data-testid={`link-tomorrow-transport-${transport.id}`}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 hover-elevate cursor-pointer">
                            <Truck className="h-3 w-3 text-blue-600/70 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground truncate">{transport.name}</p>
                              <p className="text-xs text-muted-foreground/70 truncate">
                                {transport.animalCount} animals • {format(new Date(transport.departureDate), 'h:mm a')}
                              </p>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                      {data?.tomorrow.medical.slice(0, 5).map((task) => (
                        <Link 
                          key={task.id} 
                          href={`/dashboard/animals/${task.animalId}/medical`}
                          className="block"
                          data-testid={`link-tomorrow-medical-${task.id}`}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer">
                            <Pill className="h-3 w-3 text-green-600/70 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-muted-foreground truncate">{task.careName}</p>
                              <p className="text-xs text-muted-foreground/70 truncate">{task.animalName}</p>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                      {data && data.tomorrow.medical.length > 5 && (
                        <Link href="/dashboard/medical-pipeline?tab=preventative" data-testid="link-more-tomorrow-medical">
                          <p className="text-xs text-primary hover:underline pl-2 cursor-pointer">
                            +{data.tomorrow.medical.length - 5} more medical tasks
                          </p>
                        </Link>
                      )}
                      {data?.tomorrow.calendar.map((event) => (
                        <div key={event.id} className="flex items-center gap-2 p-2 rounded-md bg-purple-500/5">
                          <Calendar className="h-3 w-3 text-purple-600/70 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-muted-foreground truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground/70 truncate">
                              {format(new Date(event.startTime), 'h:mm a')}
                              {event.location && ` • ${event.location}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
