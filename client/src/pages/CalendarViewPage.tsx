import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addMonths, subMonths, getDay } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ChevronLeft, ChevronRight, Plus, Edit2, Trash2, MapPin, Clock, Printer, Share2, Download, Copy, Mail, MessageSquare, Facebook, Video, UserCheck, MessageCircle, Check } from "lucide-react";
import { SiMessenger, SiWhatsapp } from "react-icons/si";
import { Checkbox } from "@/components/ui/checkbox";
import type { EventFormSettings } from "@shared/schema";
import { DEFAULT_EVENT_FORM_SETTINGS } from "@shared/schema";

interface VolunteerTeamMember {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
}

interface Calendar {
  id: string;
  name: string;
  type: string;
  color: string;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  canAssignOthers: boolean;
  themeSettings?: {
    headerColor?: string;
    headerTextColor?: string;
    accentColor?: string;
    headerBackgroundImageUrl?: string;
  };
  eventFormSettings?: EventFormSettings;
  minVolunteersRequired?: number;
}

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  customPageId: string | null;
  customPageSlug: string | null;
  calendarName: string;
  calendarColor: string;
  calendarType: string;
  virtualMeetingLink?: string | null;
  virtualMeetingProvider?: string | null;
  syncStatus?: string | null;
  syncError?: string | null;
  volunteerContactId?: string | null;
}

export default function CalendarViewPage() {
  const { user: currentUser } = useAuth();
  const { basePath } = useTenant();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayViewOpen, setDayViewOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set());
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const [newEvent, setNewEvent] = useState({
    calendarId: "",
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    customPageId: null as string | null,
    includeMeetLink: false,
    volunteerContactId: "" as string,
  });

  const { data: calendarsData } = useQuery<{ calendars: Calendar[] }>({
    queryKey: ['/api/calendars'],
  });

  const { data: customPagesData } = useQuery<{ pages: { id: string; title: string; slug: string; isPublished: boolean }[] }>({
    queryKey: ['/api/custom-pages'],
  });

  const { data: eventsData, isLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ['/api/events'],
  });

  // Fetch team members with 'volunteer' role for dropdown selection
  const { data: volunteerTeamMembersData } = useQuery<{ volunteers: VolunteerTeamMember[] }>({
    queryKey: ['/api/users/volunteers'],
  });
  const volunteerTeamMembers = volunteerTeamMembersData?.volunteers || [];

  const createEventMutation = useMutation({
    mutationFn: async (eventData: typeof newEvent) => {
      return await apiRequest("POST", "/api/events", {
        calendarId: eventData.calendarId,
        title: eventData.title,
        description: eventData.description || undefined,
        startTime: new Date(eventData.startTime).toISOString(),
        endTime: new Date(eventData.endTime).toISOString(),
        location: eventData.location || undefined,
        customPageId: eventData.customPageId || "",
        includeMeetLink: eventData.includeMeetLink,
        volunteerContactId: eventData.volunteerContactId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setCreateDialogOpen(false);
      setNewEvent({
        calendarId: "",
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        location: "",
        customPageId: null,
        includeMeetLink: false,
        volunteerContactId: "",
      });
      toast({
        title: "Event Created",
        description: "The event has been added to the calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Event",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof newEvent> }) => {
      const updateData: any = { ...data };
      if (data.startTime) {
        updateData.startTime = new Date(data.startTime).toISOString();
      }
      if (data.endTime) {
        updateData.endTime = new Date(data.endTime).toISOString();
      }
      return await apiRequest("PATCH", `/api/events/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setEditingEvent(null);
      toast({
        title: "Event Updated",
        description: "The event has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setEventToDelete(null);
      toast({
        title: "Event Deleted",
        description: "The event has been removed from the calendar.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter events by selected calendars
  const filteredEvents = eventsData?.events.filter(event => {
    if (selectedCalendars.size === 0) return true;
    return selectedCalendars.has(event.calendarId);
  }) || [];

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter(event => {
      const eventDate = parseISO(event.startTime);
      return isSameDay(eventDate, date);
    });
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Calculate empty cells needed before the first day of the month
  // getDay returns 0 for Sunday, 1 for Monday, etc.
  const firstDayOffset = getDay(monthStart);

  const toggleCalendarFilter = (calendarId: string) => {
    const newSelected = new Set(selectedCalendars);
    if (newSelected.has(calendarId)) {
      newSelected.delete(calendarId);
    } else {
      newSelected.add(calendarId);
    }
    setSelectedCalendars(newSelected);
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate times are set
    if (!newEvent.startTime || !newEvent.endTime) {
      toast({
        title: "Missing Times",
        description: "Please select start and end times for the event.",
        variant: "destructive",
      });
      return;
    }
    
    createEventMutation.mutate(newEvent);
  };

  const handleUpdateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEvent) {
      updateEventMutation.mutate({
        id: editingEvent.id,
        data: {
          title: editingEvent.title,
          description: editingEvent.description || undefined,
          startTime: editingEvent.startTime,
          endTime: editingEvent.endTime,
          location: editingEvent.location || undefined,
          customPageId: editingEvent.customPageId || "",
          volunteerContactId: editingEvent.volunteerContactId || undefined,
        },
      });
    }
  };

  const openCreateDialog = (date?: Date) => {
    const baseDate = date || new Date();
    const startTime = new Date(baseDate);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(baseDate);
    endTime.setHours(10, 0, 0, 0);
    
    setNewEvent({
      ...newEvent,
      startTime: format(startTime, "yyyy-MM-dd'T'HH:mm"),
      endTime: format(endTime, "yyyy-MM-dd'T'HH:mm"),
    });
    setCreateDialogOpen(true);
  };

  const editableCalendars = calendarsData?.calendars.filter(cal => cal.canEdit) || [];
  const calendarsWithAddPermission = calendarsData?.calendars.filter(cal => cal.canAdd) || [];

  const canAddToEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canAdd ?? false;
  };

  const canEditEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canEdit ?? false;
  };

  const canDeleteEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canDelete ?? false;
  };

  const canAssignOthersToEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canAssignOthers ?? false;
  };

  const getFormSettingsForCalendar = (calendarId: string): EventFormSettings | null => {
    const calendar = calendarsData?.calendars.find(cal => cal.id === calendarId);
    if (!calendar) return null;
    return calendar.eventFormSettings || DEFAULT_EVENT_FORM_SETTINGS[calendar.type] || DEFAULT_EVENT_FORM_SETTINGS.custom;
  };

  const selectedCalendarFormSettings = newEvent.calendarId ? getFormSettingsForCalendar(newEvent.calendarId) : null;
  const selectedCalendarForForm = calendarsData?.calendars.find(cal => cal.id === newEvent.calendarId);

  // Apply fixed day times when in simplified volunteer mode
  useEffect(() => {
    if (!selectedCalendarFormSettings?.simplifiedVolunteerMode) return;
    if (!newEvent.startTime) return;
    
    const selectedDateObj = new Date(newEvent.startTime);
    const dayOfWeek = selectedDateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const fixedConfig = selectedCalendarFormSettings.fixedDayTimes?.[dayOfWeek];
    
    if (fixedConfig?.enabled && fixedConfig.startTime && fixedConfig.endTime) {
      const [startHour, startMin] = fixedConfig.startTime.split(':').map(Number);
      const [endHour, endMin] = fixedConfig.endTime.split(':').map(Number);
      const startDate = new Date(selectedDateObj);
      startDate.setHours(startHour, startMin, 0, 0);
      const endDate = new Date(selectedDateObj);
      endDate.setHours(endHour, endMin, 0, 0);
      const newStartTime = format(startDate, "yyyy-MM-dd'T'HH:mm");
      const newEndTime = format(endDate, "yyyy-MM-dd'T'HH:mm");
      
      if (newEvent.startTime !== newStartTime || newEvent.endTime !== newEndTime) {
        setNewEvent(prev => ({ ...prev, startTime: newStartTime, endTime: newEndTime }));
      }
    }
  }, [selectedCalendarFormSettings, newEvent.startTime]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.5cm;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .calendar-grid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    
    <DashboardLayout
      title="Calendar"
      description="View and manage events across all calendars"
      actions={
        <>
          <Button variant="outline" onClick={handlePrint} data-testid="button-print-calendar">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={() => setShareDialogOpen(true)} data-testid="button-share-calendar">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          {calendarsWithAddPermission.length > 0 && (
            <Button onClick={() => openCreateDialog()} data-testid="button-create-event">
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          )}
        </>
      }
    >
      <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Sidebar with calendar filters */}
              <div className="lg:col-span-1 print:hidden">
                <Card className="p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3">Calendars</h3>
                    <div className="space-y-2">
                      {calendarsData?.calendars.map((calendar) => {
                        const isSelected = selectedCalendars.size === 0 || selectedCalendars.has(calendar.id);
                        return (
                          <button
                            key={calendar.id}
                            onClick={() => toggleCalendarFilter(calendar.id)}
                            className={`w-full flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2 text-left transition-all ${
                              isSelected 
                                ? 'bg-primary/10 ring-2 ring-primary/50 ring-inset' 
                                : 'opacity-60'
                            }`}
                            data-testid={`button-toggle-calendar-${calendar.id}`}
                          >
                            <div
                              className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: isSelected ? calendar.color : 'transparent',
                                border: isSelected ? 'none' : `2px solid ${calendar.color}`,
                              }}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 text-white" strokeWidth={3} />
                              )}
                            </div>
                            <span className={`text-sm flex-1 ${isSelected ? 'font-medium' : ''}`}>{calendar.name}</span>
                            {(calendar.canAdd || calendar.canEdit || calendar.canDelete) && (
                              <div className="flex gap-0.5">
                                {calendar.canAdd && <Badge variant="secondary" className="text-xs px-1" title="Can add events">A</Badge>}
                                {calendar.canEdit && <Badge variant="secondary" className="text-xs px-1" title="Can edit events">E</Badge>}
                                {calendar.canDelete && <Badge variant="secondary" className="text-xs px-1" title="Can delete events">D</Badge>}
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {calendarsData?.calendars.length === 0 && (
                        <p className="text-sm text-muted-foreground">No calendars available</p>
                      )}
                    </div>
                    {calendarsData?.calendars.some(c => c.canAdd || c.canEdit || c.canDelete) && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">A</span>=Add, <span className="font-medium">E</span>=Edit, <span className="font-medium">D</span>=Delete
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Main calendar view */}
              <div className="lg:col-span-3 print:col-span-full">
                {/* Print-only calendar header with name(s) */}
                <div className="hidden print:block mb-4 text-center">
                  <h1 className="text-2xl font-bold">
                    {(() => {
                      const selected = selectedCalendars.size > 0
                        ? calendarsData?.calendars.filter(c => selectedCalendars.has(c.id))
                        : calendarsData?.calendars;
                      if (!selected || selected.length === 0) return 'Calendar';
                      if (selected.length === 1) return selected[0].name;
                      return selected.map(c => c.name).join(' & ');
                    })()}
                  </h1>
                  <p className="text-muted-foreground">{format(currentMonth, "MMMM yyyy")}</p>
                </div>
                <Card className="overflow-hidden print:shadow-none print:border-0">
                  {/* Themed Month Header */}
                  {(() => {
                    const activeCalendar = calendarsData?.calendars.find(c => 
                      selectedCalendars.size === 0 || selectedCalendars.has(c.id)
                    );
                    const theme = activeCalendar?.themeSettings;
                    const headerColor = theme?.headerColor || '#3b82f6';
                    const headerTextColor = theme?.headerTextColor || '#ffffff';
                    const headerBgImage = theme?.headerBackgroundImageUrl;
                    
                    return (
                      <div 
                        className="relative p-6 mb-0"
                        style={{
                          backgroundColor: headerColor,
                          backgroundImage: headerBgImage ? `url(${headerBgImage})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                        data-testid="calendar-themed-header"
                      >
                        {headerBgImage && (
                          <div className="absolute inset-0 bg-black/40" />
                        )}
                        <div className="relative flex items-center justify-between">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            style={{ color: headerTextColor }}
                            className="hover:bg-white/20"
                            data-testid="button-prev-month"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </Button>
                          <h2 
                            className="text-2xl font-bold"
                            style={{ color: headerTextColor }}
                          >
                            {format(currentMonth, "MMMM yyyy")}
                          </h2>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            style={{ color: headerTextColor }}
                            className="hover:bg-white/20"
                            data-testid="button-next-month"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                  
                  <div className="p-6 pt-4">

                  {isLoading ? (
                    <div className="flex items-center justify-center h-96">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    (() => {
                      const activeCalendar = calendarsData?.calendars.find(c => 
                        selectedCalendars.size === 0 || selectedCalendars.has(c.id)
                      );
                      const accentColor = activeCalendar?.themeSettings?.accentColor || '#3b82f6';
                      
                      return (
                    <div className="grid grid-cols-7 gap-2 calendar-grid">
                      {/* Day headers */}
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-sm font-semibold p-2">
                          {day}
                        </div>
                      ))}

                      {/* Empty cells before first day of month */}
                      {Array.from({ length: firstDayOffset }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="min-h-24 p-2" />
                      ))}

                      {/* Calendar days */}
                      {calendarDays.map((day, idx) => {
                        const dayEvents = getEventsForDate(day);
                        const isToday = isSameDay(day, new Date());
                        
                        // Check if we're viewing volunteer calendars for color coding
                        // Color coding applies when a single volunteer calendar is selected
                        const selectedCalendarIds = Array.from(selectedCalendars);
                        const viewedCalendars = selectedCalendarIds.length > 0
                          ? calendarsData?.calendars.filter(c => selectedCalendars.has(c.id)) || []
                          : [];
                        // Only apply color coding when exactly one volunteer calendar is selected
                        const singleVolunteerCalendar = viewedCalendars.length === 1 && viewedCalendars[0]?.type === 'volunteer' 
                          ? viewedCalendars[0] 
                          : null;
                        
                        // Calculate volunteer-based background color for volunteer calendars
                        let volunteerBgColor: string | undefined;
                        if (singleVolunteerCalendar && isSameMonth(day, currentMonth)) {
                          // Count events from this volunteer calendar only for this day
                          const volunteerEventsOnDay = dayEvents.filter(e => e.calendarId === singleVolunteerCalendar.id).length;
                          const minRequired = singleVolunteerCalendar.minVolunteersRequired ?? 2;
                          
                          if (volunteerEventsOnDay === 0) {
                            volunteerBgColor = 'rgba(239, 68, 68, 0.15)'; // Red - no volunteers
                          } else if (volunteerEventsOnDay < minRequired) {
                            volunteerBgColor = 'rgba(234, 179, 8, 0.2)'; // Yellow - below minimum
                          } else {
                            volunteerBgColor = 'rgba(34, 197, 94, 0.15)'; // Green - at or above minimum
                          }
                        }
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedDate(day);
                              setDayViewOpen(true);
                            }}
                            className={`
                              calendar-day min-h-24 p-2 border rounded-md text-left hover-elevate active-elevate-2
                              ${!isSameMonth(day, currentMonth) ? 'opacity-40' : ''}
                            `}
                            style={{
                              ...(isToday ? { borderColor: accentColor, borderWidth: '2px' } : {}),
                              ...(volunteerBgColor ? { backgroundColor: volunteerBgColor } : {}),
                            }}
                            data-testid={`button-day-${format(day, 'yyyy-MM-dd')}`}
                          >
                            <div 
                              className="text-sm font-medium mb-1"
                              style={isToday ? { color: accentColor } : undefined}
                            >
                              {format(day, 'd')}
                            </div>
                            <div className="space-y-1">
                              {dayEvents.slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className="text-xs p-1.5 rounded"
                                  style={{
                                    backgroundColor: event.calendarColor + '20',
                                    borderLeft: `3px solid ${event.calendarColor}`,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingEvent(event);
                                  }}
                                  data-testid={`event-preview-${event.id}`}
                                >
                                  <div className="font-medium truncate">{event.title}</div>
                                  {event.description && (
                                    <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                                      {event.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{dayEvents.length - 3} more
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                      );
                    })()
                  )}
                  </div>
                </Card>
              </div>
            </div>
      </div>

      {/* Day View Dialog */}
      <Dialog open={dayViewOpen} onOpenChange={setDayViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
            </DialogTitle>
            <DialogDescription>
              View all events scheduled for this day
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedDate && getEventsForDate(selectedDate).length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {getEventsForDate(selectedDate).map((event) => (
                  <Card
                    key={event.id}
                    className="p-4 hover-elevate cursor-pointer"
                    onClick={() => {
                      setEditingEvent(event);
                      setDayViewOpen(false);
                    }}
                    data-testid={`day-event-${event.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-1 h-full rounded"
                        style={{ backgroundColor: event.calendarColor }}
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold">{event.title}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {event.calendarName}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {format(parseISO(event.startTime), "h:mm a")} - {format(parseISO(event.endTime), "h:mm a")}
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {event.location}
                            </div>
                          )}
                        </div>
                        
                        {event.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No events scheduled for this day</p>
              </div>
            )}
            
            {calendarsWithAddPermission.length > 0 && (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => {
                    setDayViewOpen(false);
                    if (selectedDate) {
                      openCreateDialog(selectedDate);
                    }
                  }}
                  className="flex-1"
                  data-testid="button-add-event-from-day-view"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Event
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCalendarFormSettings?.simplifiedVolunteerMode ? "Sign Up to Volunteer" : "Create Event"}
            </DialogTitle>
            <DialogDescription>
              {selectedCalendarFormSettings?.simplifiedVolunteerMode 
                ? `Sign up for ${selectedCalendarForForm?.name || 'this volunteer opportunity'}`
                : "Add a new event to your calendar."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateEvent} className="space-y-4">
            {/* Calendar Selection - Always shown */}
            <div>
              <Label htmlFor="event-calendar">Calendar</Label>
              <Select
                value={newEvent.calendarId}
                onValueChange={(value) => {
                  const calendar = calendarsData?.calendars.find(cal => cal.id === value);
                  const formSettings = calendar?.eventFormSettings || 
                    DEFAULT_EVENT_FORM_SETTINGS[calendar?.type || 'custom'] || 
                    DEFAULT_EVENT_FORM_SETTINGS.custom;
                  
                  const previousSettings = selectedCalendarFormSettings;
                  const wasSimplifiedMode = previousSettings?.simplifiedVolunteerMode;
                  const isSimplifiedMode = formSettings.simplifiedVolunteerMode;
                  
                  let newTitle = newEvent.title;
                  if (isSimplifiedMode) {
                    newTitle = `${currentUser?.fullName || currentUser?.email || 'Volunteer'} - Signup`;
                  } else if (wasSimplifiedMode) {
                    newTitle = "";
                  }
                  
                  setNewEvent({ 
                    ...newEvent, 
                    calendarId: value,
                    title: newTitle,
                  });
                }}
                required
              >
                <SelectTrigger data-testid="select-event-calendar">
                  <SelectValue placeholder="Select a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendarsWithAddPermission.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: calendar.color }}
                        />
                        {calendar.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Simplified Volunteer Mode */}
            {selectedCalendarFormSettings?.simplifiedVolunteerMode ? (
              (() => {
                // Check if fixed day times are configured for the selected date
                const selectedDateObj = newEvent.startTime ? new Date(newEvent.startTime) : (selectedDate || new Date());
                const dayOfWeek = selectedDateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
                const fixedDayConfig = selectedCalendarFormSettings.fixedDayTimes?.[dayOfWeek];
                const hasFixedTimes = fixedDayConfig?.enabled && fixedDayConfig.startTime && fixedDayConfig.endTime;
                
                return (
              <>
                {/* Volunteer Signup - Check if user can assign others */}
                {canAssignOthersToEvent(newEvent.calendarId) ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
                      <UserCheck className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium">Schedule a Volunteer</p>
                        <p className="text-sm text-muted-foreground">
                          You can sign up yourself or another volunteer
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="volunteer-name">Volunteer Name *</Label>
                      <Select
                        value={newEvent.volunteerContactId || "self"}
                        onValueChange={(value) => {
                          if (value === "self") {
                            setNewEvent({ 
                              ...newEvent, 
                              volunteerContactId: "",
                              title: `${currentUser?.fullName || currentUser?.email || 'Volunteer'} - Signup`
                            });
                          } else {
                            const selectedVolunteer = volunteerTeamMembers.find(v => v.id === value);
                            if (selectedVolunteer) {
                              setNewEvent({ 
                                ...newEvent, 
                                volunteerContactId: value,
                                title: `${selectedVolunteer.fullName || selectedVolunteer.email} - Signup`
                              });
                            }
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-volunteer-name">
                          <SelectValue placeholder="Select a volunteer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-primary" />
                              Myself ({currentUser?.fullName || currentUser?.email})
                            </div>
                          </SelectItem>
                          {volunteerTeamMembers.map((volunteer) => (
                            <SelectItem key={volunteer.id} value={volunteer.id}>
                              <div className="flex flex-col">
                                <span>{volunteer.fullName || volunteer.email}</span>
                                {volunteer.email && volunteer.fullName && (
                                  <span className="text-xs text-muted-foreground">{volunteer.email}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Select yourself or choose a volunteer from your team
                      </p>
                      {volunteerTeamMembers.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          No team members with the volunteer role found. Add team members with the "volunteer" role to see them here.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <UserCheck className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">I want to volunteer!</p>
                      <p className="text-sm text-muted-foreground">
                        You'll be signed up as: {currentUser?.fullName || currentUser?.email}
                      </p>
                    </div>
                  </div>
                )}

                {/* Date/Time Selection - show fixed times or time pickers */}
                {hasFixedTimes ? (
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Scheduled Time</Label>
                    </div>
                    <p className="text-lg">
                      {format(selectedDateObj, 'EEEE, MMMM d, yyyy')}
                    </p>
                    <p className="text-muted-foreground">
                      {fixedDayConfig.startTime} - {fixedDayConfig.endTime}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="event-start">Start Time</Label>
                      <Input
                        id="event-start"
                        type="datetime-local"
                        value={newEvent.startTime}
                        onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                        required
                        data-testid="input-event-start"
                      />
                    </div>
                    <div>
                      <Label htmlFor="event-end">End Time</Label>
                      <Input
                        id="event-end"
                        type="datetime-local"
                        value={newEvent.endTime}
                        onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                        required
                        data-testid="input-event-end"
                      />
                    </div>
                  </div>
                )}

                {/* Optional Comment */}
                {selectedCalendarFormSettings.description?.visible && (
                  <div>
                    <Label htmlFor="event-description">
                      {selectedCalendarFormSettings.description.label || "Comment (optional)"}
                    </Label>
                    <Textarea
                      id="event-description"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                      placeholder="Any notes or comments..."
                      data-testid="input-event-description"
                    />
                  </div>
                )}
              </>
                );
              })()
            ) : (
              <>
                {/* Standard Event Form - Show fields based on settings */}
                
                {/* Title Field */}
                {(!selectedCalendarFormSettings || selectedCalendarFormSettings.title?.visible) && (
                  <div>
                    <Label htmlFor="event-title">
                      Event Title{selectedCalendarFormSettings?.title?.required !== false && " *"}
                    </Label>
                    <Input
                      id="event-title"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      placeholder="e.g., Volunteer Orientation"
                      required={selectedCalendarFormSettings?.title?.required !== false}
                      data-testid="input-event-title"
                    />
                  </div>
                )}

                {/* Description Field */}
                {(!selectedCalendarFormSettings || selectedCalendarFormSettings.description?.visible) && (
                  <div>
                    <Label htmlFor="event-description">
                      {selectedCalendarFormSettings?.description?.label || "Description"}
                      {selectedCalendarFormSettings?.description?.required && " *"}
                    </Label>
                    <Textarea
                      id="event-description"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                      placeholder="Event details"
                      required={selectedCalendarFormSettings?.description?.required}
                      data-testid="input-event-description"
                    />
                  </div>
                )}

                {/* Start/End Time - Always shown */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event-start">Start Time *</Label>
                    <Input
                      id="event-start"
                      type="datetime-local"
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      required
                      data-testid="input-event-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="event-end">End Time *</Label>
                    <Input
                      id="event-end"
                      type="datetime-local"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      required
                      data-testid="input-event-end"
                    />
                  </div>
                </div>

                {/* Location Field */}
                {(!selectedCalendarFormSettings || selectedCalendarFormSettings.location?.visible) && (
                  <div>
                    <Label htmlFor="event-location">
                      {selectedCalendarFormSettings?.location?.label || "Location"}
                      {selectedCalendarFormSettings?.location?.required && " *"}
                    </Label>
                    <Input
                      id="event-location"
                      value={newEvent.location}
                      onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                      placeholder="e.g., Main Shelter"
                      required={selectedCalendarFormSettings?.location?.required}
                      data-testid="input-event-location"
                    />
                  </div>
                )}

                {/* Custom Page Link Field */}
                {(!selectedCalendarFormSettings || selectedCalendarFormSettings.customPage?.visible) && (
                  <div>
                    <Label htmlFor="event-page">
                      Link to Content Page
                      {selectedCalendarFormSettings?.customPage?.required && " *"}
                    </Label>
                    <Select
                      value={newEvent.customPageId || "none"}
                      onValueChange={(value) => setNewEvent({ ...newEvent, customPageId: value === "none" ? null : value })}
                    >
                      <SelectTrigger data-testid="select-event-page">
                        <SelectValue placeholder="Select a page (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {customPagesData?.pages.filter(p => p.isPublished).map((page) => (
                          <SelectItem key={page.id} value={page.id}>
                            {page.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Meet Link Field */}
                {(!selectedCalendarFormSettings || selectedCalendarFormSettings.meetLink?.visible) && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="include-meet-link"
                      checked={newEvent.includeMeetLink}
                      onCheckedChange={(checked) => setNewEvent({ ...newEvent, includeMeetLink: checked === true })}
                      data-testid="checkbox-include-meet-link"
                    />
                    <Label htmlFor="include-meet-link" className="cursor-pointer text-sm">
                      Add Google Meet video link (requires Google Workspace)
                    </Label>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="flex-1"
                data-testid="button-cancel-create-event"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createEventMutation.isPending || !newEvent.calendarId}
                className="flex-1"
                data-testid="button-submit-create-event"
              >
                {createEventMutation.isPending 
                  ? (selectedCalendarFormSettings?.simplifiedVolunteerMode ? "Signing up..." : "Creating...")
                  : (selectedCalendarFormSettings?.simplifiedVolunteerMode ? "Sign Up" : "Create Event")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={() => setEditingEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              {canEditEvent(editingEvent?.calendarId || '') 
                ? 'View and edit event information.'
                : 'View event information (read-only).'}
            </DialogDescription>
          </DialogHeader>
          {editingEvent && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: editingEvent.calendarColor }}
                  />
                  <span className="text-sm text-muted-foreground">{editingEvent.calendarName}</span>
                  {!canEditEvent(editingEvent.calendarId) && (
                    <Badge variant="secondary" className="text-xs">View Only</Badge>
                  )}
                </div>
              </div>
              <form onSubmit={handleUpdateEvent} className="space-y-4">
                <div>
                  <Label htmlFor="edit-event-title">Event Title</Label>
                  <Input
                    id="edit-event-title"
                    value={editingEvent.title}
                    onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                    required
                    disabled={!canEditEvent(editingEvent.calendarId)}
                    data-testid="input-edit-event-title"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-event-description">Description</Label>
                  <Textarea
                    id="edit-event-description"
                    value={editingEvent.description || ""}
                    onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                    disabled={!canEditEvent(editingEvent.calendarId)}
                    data-testid="input-edit-event-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-event-start">Start Time</Label>
                    <Input
                      id="edit-event-start"
                      type="datetime-local"
                      value={format(parseISO(editingEvent.startTime), "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => setEditingEvent({ ...editingEvent, startTime: new Date(e.target.value).toISOString() })}
                      required
                      disabled={!canEditEvent(editingEvent.calendarId)}
                      data-testid="input-edit-event-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-event-end">End Time</Label>
                    <Input
                      id="edit-event-end"
                      type="datetime-local"
                      value={format(parseISO(editingEvent.endTime), "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => setEditingEvent({ ...editingEvent, endTime: new Date(e.target.value).toISOString() })}
                      required
                      disabled={!canEditEvent(editingEvent.calendarId)}
                      data-testid="input-edit-event-end"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-event-location">Location</Label>
                  <Input
                    id="edit-event-location"
                    value={editingEvent.location || ""}
                    onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                    disabled={!canEditEvent(editingEvent.calendarId)}
                    data-testid="input-edit-event-location"
                  />
                </div>
                {editingEvent.virtualMeetingLink && (
                  <div className="rounded-md bg-muted p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Video Conference</span>
                    </div>
                    <a
                      href={editingEvent.virtualMeetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                      data-testid="link-meet"
                    >
                      {editingEvent.virtualMeetingLink}
                    </a>
                    {editingEvent.syncStatus === 'synced' && (
                      <Badge variant="secondary" className="mt-2">Google Meet</Badge>
                    )}
                  </div>
                )}
                {editingEvent.syncStatus === 'error' && editingEvent.syncError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    Sync Error: {editingEvent.syncError}
                  </div>
                )}
                <div>
                  <Label htmlFor="edit-event-page">Link to Content Page</Label>
                  <Select
                    value={editingEvent.customPageId || "none"}
                    onValueChange={(value) => setEditingEvent({ ...editingEvent, customPageId: value === "none" ? null : value })}
                    disabled={!canEditEvent(editingEvent.calendarId)}
                  >
                    <SelectTrigger data-testid="select-edit-event-page">
                      <SelectValue placeholder="Select a page (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customPagesData?.pages.filter(p => p.isPublished).map((page) => (
                        <SelectItem key={page.id} value={page.id}>
                          {page.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {canDeleteEvent(editingEvent.calendarId) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEventToDelete(editingEvent)}
                      className="flex-1"
                      data-testid="button-delete-event"
                    >
                      <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                      Delete
                    </Button>
                  )}
                  {canEditEvent(editingEvent.calendarId) ? (
                    <Button
                      type="submit"
                      disabled={updateEventMutation.isPending}
                      className="flex-1"
                      data-testid="button-update-event"
                    >
                      {updateEventMutation.isPending ? "Updating..." : "Update Event"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingEvent(null)}
                      className="flex-1"
                      data-testid="button-close-event"
                    >
                      Close
                    </Button>
                  )}
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Share: {(() => {
                const selected = selectedCalendars.size > 0
                  ? calendarsData?.calendars.filter(c => selectedCalendars.has(c.id))
                  : calendarsData?.calendars;
                if (!selected || selected.length === 0) return 'Calendar';
                if (selected.length === 1) return selected[0].name;
                return `${selected.length} Calendars`;
              })()}
            </DialogTitle>
            <DialogDescription>
              Share or export your calendar in multiple formats
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handlePrint}
              data-testid="button-share-print"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Calendar
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                window.location.href = `${basePath}/api/calendars/export/ical`;
                toast({
                  title: "Downloading Calendar",
                  description: "Your calendar is being downloaded as an iCal file.",
                });
              }}
              data-testid="button-share-ical"
            >
              <Download className="mr-2 h-4 w-4" />
              Download iCal (.ics)
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                const calendarParam = selectedCalendars.size > 0 ? `?calendars=${Array.from(selectedCalendars).join(',')}` : '';
                const url = `${window.location.origin}${basePath}/dashboard/calendar${calendarParam}`;
                navigator.clipboard.writeText(url);
                toast({
                  title: "Link Copied",
                  description: "Calendar link copied to clipboard!",
                });
              }}
              data-testid="button-share-copy-link"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Calendar Link
            </Button>

            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">Share via:</p>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const calendarParam = selectedCalendars.size > 0 ? `?calendars=${Array.from(selectedCalendars).join(',')}` : '';
                    const url = `${window.location.origin}${basePath}/dashboard/calendar${calendarParam}`;
                    const selectedNames = calendarsData?.calendars.filter(c => selectedCalendars.has(c.id)).map(c => c.name).join(', ') || 'our';
                    const text = `Check out ${selectedNames} calendar!`;
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
                  }}
                  data-testid="button-share-facebook"
                  title="Share on Facebook"
                >
                  <Facebook className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const calendarParam = selectedCalendars.size > 0 ? `?calendars=${Array.from(selectedCalendars).join(',')}` : '';
                    const url = `${window.location.origin}${basePath}/dashboard/calendar${calendarParam}`;
                    const selectedNames = calendarsData?.calendars.filter(c => selectedCalendars.has(c.id)).map(c => c.name).join(', ') || 'our';
                    const text = `Check out ${selectedNames} calendar!`;
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile) {
                      // On mobile, open Messenger app directly
                      window.location.href = `fb-messenger://share/?link=${encodeURIComponent(url)}`;
                    } else {
                      // Desktop: Use Facebook's send dialog which opens Messenger
                      window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(window.location.href)}`, '_blank', 'width=600,height=500');
                    }
                    toast({
                      title: "Sharing via Messenger",
                      description: isMobile ? "Opening Messenger app..." : "Opening Messenger in browser...",
                    });
                  }}
                  data-testid="button-share-messenger"
                  title="Share on Messenger"
                >
                  <SiMessenger className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const calendarParam = selectedCalendars.size > 0 ? `?calendars=${Array.from(selectedCalendars).join(',')}` : '';
                    const url = `${window.location.origin}${basePath}/dashboard/calendar${calendarParam}`;
                    const selectedNames = calendarsData?.calendars.filter(c => selectedCalendars.has(c.id)).map(c => c.name).join(', ') || 'our';
                    const text = `Check out ${selectedNames} calendar!`;
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile) {
                      // On mobile, use whatsapp:// protocol
                      window.location.href = `whatsapp://send?text=${encodeURIComponent(text + ' ' + url)}`;
                    } else {
                      // Desktop: Use WhatsApp Web
                      window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
                    }
                    toast({
                      title: "Sharing via WhatsApp",
                      description: "Opening WhatsApp...",
                    });
                  }}
                  data-testid="button-share-whatsapp"
                  title="Share on WhatsApp"
                >
                  <SiWhatsapp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const calendarParam = selectedCalendars.size > 0 ? `?calendars=${Array.from(selectedCalendars).join(',')}` : '';
                    const url = `${window.location.origin}${basePath}/dashboard/calendar${calendarParam}`;
                    const selectedNames = calendarsData?.calendars.filter(c => selectedCalendars.has(c.id)).map(c => c.name).join(', ') || 'our';
                    const subject = `${selectedNames} Calendar`;
                    const body = `Check out ${selectedNames} calendar: ${url}`;
                    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  }}
                  data-testid="button-share-email"
                  title="Share via Email"
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Messenger sharing works best on mobile devices with the app installed.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Event Confirmation */}
      <AlertDialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{eventToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-event">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (eventToDelete) {
                  deleteEventMutation.mutate(eventToDelete.id);
                  setEditingEvent(null);
                }
              }}
              disabled={deleteEventMutation.isPending}
              data-testid="button-confirm-delete-event"
            >
              {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
   </>
  );
}
