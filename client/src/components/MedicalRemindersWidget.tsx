import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Stethoscope, AlertCircle, Clock, ChevronRight, Settings, Syringe, Pill, Activity, Scissors, FileText, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MedicalItem {
  id: string;
  animalId: string;
  animalName: string;
  animalStatus: string;
  itemName: string;
  dueDate: string;
  sourceType: "vaccine" | "prescription" | "exam" | "procedure";
  assignedFosterId?: string | null;
  fosterName?: string | null;
}

interface MedicalDigest {
  enabled: boolean;
  overdue: MedicalItem[];
  dueSoon: MedicalItem[];
  upcoming: MedicalItem[];
  settings?: {
    vaccineLeadDays: number;
    prescriptionLeadDays: number;
  };
}

export default function MedicalRemindersWidget() {
  const { data, isLoading, error } = useQuery<MedicalDigest>({
    queryKey: ['/api/dashboard/medical-reminders'],
  });

  if (isLoading) {
    return (
      <Card data-testid="card-medical-reminders-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  // If reminders are disabled, show a message
  if (!data.enabled) {
    return (
      <Card data-testid="card-medical-reminders-disabled">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="h-5 w-5" />
            Medical Reminders
          </CardTitle>
          <CardDescription>
            Medical reminders are currently disabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings?tab=notifications">
            <Button variant="outline" size="sm" data-testid="button-enable-reminders">
              <Settings className="h-4 w-4 mr-2" />
              Enable Reminders
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const totalItems = data.overdue.length + data.dueSoon.length + data.upcoming.length;

  // If no items, show success state
  if (totalItems === 0) {
    return (
      <Card data-testid="card-medical-reminders-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="h-5 w-5" />
            Medical Reminders
          </CardTitle>
          <CardDescription>
            No medical items need attention right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6 text-center">
            <div>
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All caught up!</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDueDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isOverdue = date < now;
    
    return {
      text: formatDistanceToNow(date, { addSuffix: true }),
      isOverdue,
    };
  };

  const getSourceIcon = (sourceType: string) => {
    const iconClass = "h-4 w-4 text-muted-foreground";
    switch (sourceType) {
      case "vaccine":
        return <Syringe className={iconClass} />;
      case "prescription":
        return <Pill className={iconClass} />;
      case "exam":
        return <Activity className={iconClass} />;
      case "procedure":
        return <Scissors className={iconClass} />;
      default:
        return <FileText className={iconClass} />;
    }
  };

  return (
    <Card data-testid="card-medical-reminders">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="h-5 w-5" />
            Medical Reminders
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.overdue.length > 0 && (
              <Badge variant="destructive" data-testid="badge-overdue-count">
                {data.overdue.length} overdue
              </Badge>
            )}
            {data.dueSoon.length > 0 && (
              <Badge variant="secondary" data-testid="badge-duesoon-count">
                {data.dueSoon.length} due soon
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {data.overdue.length > 0 
            ? "Some medical items are overdue and need immediate attention."
            : "Upcoming vaccines, medications, and appointments."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overdue Section */}
        {data.overdue.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              Overdue
            </div>
            <div className="space-y-2">
              {data.overdue.slice(0, 3).map((item) => {
                const due = formatDueDate(item.dueDate);
                return (
                  <Link 
                    key={item.id} 
                    href={`/dashboard/animals/${item.animalId}/medical`}
                    data-testid={`link-medical-item-${item.id}`}
                  >
                    <div className="flex items-center justify-between p-2 rounded-md border border-destructive/20 bg-destructive/5 hover-elevate cursor-pointer">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="shrink-0">{getSourceIcon(item.sourceType)}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.animalName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.itemName}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-medium text-destructive">{due.text}</p>
                        {item.fosterName && (
                          <p className="text-xs text-muted-foreground">Foster: {item.fosterName}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {data.overdue.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{data.overdue.length - 3} more overdue items
                </p>
              )}
            </div>
          </div>
        )}

        {/* Due Soon Section */}
        {data.dueSoon.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500">
              <Clock className="h-4 w-4" />
              Due This Week
            </div>
            <div className="space-y-2">
              {data.dueSoon.slice(0, 3).map((item) => {
                const due = formatDueDate(item.dueDate);
                return (
                  <Link 
                    key={item.id} 
                    href={`/dashboard/animals/${item.animalId}/medical`}
                    data-testid={`link-medical-item-${item.id}`}
                  >
                    <div className="flex items-center justify-between p-2 rounded-md border hover-elevate cursor-pointer">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="shrink-0">{getSourceIcon(item.sourceType)}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.animalName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.itemName}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-500">{due.text}</p>
                        {item.fosterName && (
                          <p className="text-xs text-muted-foreground">Foster: {item.fosterName}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {data.dueSoon.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{data.dueSoon.length - 3} more items due this week
                </p>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Section - Only show if no overdue or due soon items dominating */}
        {data.upcoming.length > 0 && data.overdue.length === 0 && data.dueSoon.length < 3 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
              <Stethoscope className="h-4 w-4" />
              Upcoming
            </div>
            <div className="space-y-2">
              {data.upcoming.slice(0, 2).map((item) => {
                const due = formatDueDate(item.dueDate);
                return (
                  <Link 
                    key={item.id} 
                    href={`/dashboard/animals/${item.animalId}/medical`}
                    data-testid={`link-medical-item-${item.id}`}
                  >
                    <div className="flex items-center justify-between p-2 rounded-md border hover-elevate cursor-pointer">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="shrink-0">{getSourceIcon(item.sourceType)}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.animalName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.itemName}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-xs text-muted-foreground">{due.text}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-3 flex justify-between items-center border-t gap-2">
        <Link href="/dashboard/medical-pipeline">
          <Button variant="outline" size="sm" data-testid="button-view-all-reminders">
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
        <Link href="/dashboard/settings?tab=notifications">
          <Button variant="ghost" size="sm" data-testid="button-reminder-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
