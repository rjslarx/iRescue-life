import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addMonths, subMonths } from "date-fns";
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
import { Loader2, ChevronLeft, ChevronRight, Plus, Edit2, Trash2, MapPin, Clock, Printer, Share2, Download, Copy, Mail, MessageSquare, Facebook, Video, UserCheck, MessageCircle, Stethoscope, Syringe, Search, Heart } from "lucide-react";
import { SiMessenger, SiWhatsapp } from "react-icons/si";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { EventFormSettings } from "@shared/schema";
import { DEFAULT_EVENT_FORM_SETTINGS } from "@shared/schema";

interface Calendar {
  id: string;
  name: string;
  type: string;
  color: string;
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
  canAssignOthers?: boolean;
  minVolunteersRequired?: number;
  themeSettings?: {
    headerColor?: string;
    headerTextColor?: string;
    accentColor?: string;
    headerBackgroundImageUrl?: string;
  };
  eventFormSettings?: EventFormSettings;
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
  manualVolunteerName?: string | null;
}

interface VolunteerTeamMember {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
}

interface MedicalEvent {
  id: string;
  type: 'vaccine' | 'procedure' | 'exam' | 'preventative_care';
  title: string;
  animalId: string;
  animalName: string;
  date: string;
  endDate: string;
  category: string;
  veterinarian: string | null;
  notes: string | null;
  color: string;
  sourceId: string;
}

interface AnimalOption {
  id: string;
  name: string;
  status: string;
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
  const [isGeneratingShareImage, setIsGeneratingShareImage] = useState(false);
  const [shareImageData, setShareImageData] = useState<{ imageUrl: string; objectPath: string; calendarPageUrl: string } | null>(null);
  const [isManualVolunteerMode, setIsManualVolunteerMode] = useState(false);
  const [showMedicalEvents, setShowMedicalEvents] = useState(true);
  const [medicalDialogOpen, setMedicalDialogOpen] = useState(false);
  const [selectedMedicalEvent, setSelectedMedicalEvent] = useState<MedicalEvent | null>(null);
  const [animalSearch, setAnimalSearch] = useState("");
  const [animalSearchFocused, setAnimalSearchFocused] = useState(false);
  const [newMedicalAppt, setNewMedicalAppt] = useState({
    type: "" as string,
    animalId: "",
    title: "",
    date: "",
    veterinarian: "",
    notes: "",
  });

  const [newEvent, setNewEvent] = useState({
    calendarId: "",
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    customPageId: null as string | null,
    includeMeetLink: false,
    volunteerContactId: null as string | null,
    manualVolunteerName: "",
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

  // Fetch volunteer team members for assignment
  const { data: volunteerTeamMembersData } = useQuery<{ volunteers: VolunteerTeamMember[] }>({
    queryKey: ['/api/users/volunteers'],
  });

  const { data: medicalEventsData } = useQuery<{ medicalEvents: MedicalEvent[] }>({
    queryKey: ['/api/calendar-events/medical'],
    enabled: showMedicalEvents,
  });

  const { data: animalsData } = useQuery<{ animals: AnimalOption[] }>({
    queryKey: ['/api/animals'],
  });

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
        manualVolunteerName: eventData.manualVolunteerName || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setCreateDialogOpen(false);
      setIsManualVolunteerMode(false);
      setNewEvent({
        calendarId: "",
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        location: "",
        customPageId: null,
        includeMeetLink: false,
        volunteerContactId: null,
        manualVolunteerName: "",
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

  const createMedicalApptMutation = useMutation({
    mutationFn: async (data: typeof newMedicalAppt) => {
      return await apiRequest("POST", "/api/calendar-events/medical", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events/medical'] });
      setMedicalDialogOpen(false);
      setNewMedicalAppt({ type: "", animalId: "", title: "", date: "", veterinarian: "", notes: "" });
      setAnimalSearch("");
      toast({
        title: "Medical Appointment Scheduled",
        description: "The appointment has been added to the calendar and the animal's medical records.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Schedule Appointment",
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

  const getMedicalEventsForDate = (date: Date) => {
    if (!showMedicalEvents || !medicalEventsData?.medicalEvents || onlyVolunteerCalendarsSelected) return [];
    return medicalEventsData.medicalEvents.filter(event => {
      const eventDate = parseISO(event.date);
      return isSameDay(eventDate, date);
    });
  };

  const openMedicalDialog = (date?: Date) => {
    const baseDate = date || new Date();
    const apptDate = new Date(baseDate);
    apptDate.setHours(9, 0, 0, 0);
    setNewMedicalAppt({
      type: "",
      animalId: "",
      title: "",
      date: format(apptDate, "yyyy-MM-dd'T'HH:mm"),
      veterinarian: "",
      notes: "",
    });
    setAnimalSearch("");
    setMedicalDialogOpen(true);
  };

  const handleCreateMedicalAppt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMedicalAppt.type || !newMedicalAppt.animalId || !newMedicalAppt.title || !newMedicalAppt.date) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createMedicalApptMutation.mutate({
      ...newMedicalAppt,
      date: new Date(newMedicalAppt.date).toISOString(),
    });
  };

  const filteredAnimals = (animalsData?.animals || []).filter((a: any) =>
    a.name.toLowerCase().includes(animalSearch.toLowerCase()) &&
    a.status !== 'merged' &&
    a.status !== 'deceased'
  ).slice(0, 50);

  const medicalTypeLabels: Record<string, string> = {
    procedure: 'Procedure (Surgery, Dental, etc.)',
    vaccine: 'Vaccine / Immunization',
    exam: 'Medical Exam / Checkup',
    preventative_care: 'Preventative Care',
  };

  const medicalTypeIcons: Record<string, typeof Stethoscope> = {
    procedure: Heart,
    vaccine: Syringe,
    exam: Stethoscope,
    preventative_care: Search,
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const selectCalendar = (calendarId: string | null) => {
    if (calendarId === null) {
      setSelectedCalendars(new Set());
    } else {
      setSelectedCalendars(new Set([calendarId]));
    }
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
          manualVolunteerName: editingEvent.manualVolunteerName || undefined,
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
    
    // Reset manual volunteer mode and clear stale data when opening new event dialog
    setIsManualVolunteerMode(false);
    setNewEvent({
      calendarId: "",
      title: "",
      description: "",
      startTime: format(startTime, "yyyy-MM-dd'T'HH:mm"),
      endTime: format(endTime, "yyyy-MM-dd'T'HH:mm"),
      location: "",
      customPageId: null,
      includeMeetLink: false,
      volunteerContactId: null,
      manualVolunteerName: "",
    });
    setCreateDialogOpen(true);
  };

  const editableCalendars = calendarsData?.calendars.filter(cal => cal.canEdit) || [];
  const calendarsWithAddPermission = calendarsData?.calendars.filter(cal => cal.canAdd) || [];

  const onlyVolunteerCalendarsSelected = (() => {
    if (selectedCalendars.size === 0) return false;
    return Array.from(selectedCalendars).every(calId => {
      const cal = calendarsData?.calendars.find(c => c.id === calId);
      return cal?.type === 'volunteer';
    });
  })();

  const nonVolunteerCalendarsWithAdd = calendarsWithAddPermission.filter(cal => cal.type !== 'volunteer');

  const canAddToEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canAdd ?? false;
  };

  const canEditEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canEdit ?? false;
  };

  const canDeleteEvent = (calendarId: string) => {
    return calendarsData?.calendars.find(cal => cal.id === calendarId)?.canDelete ?? false;
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

  useEffect(() => {
    setShareImageData(null);
  }, [currentMonth, selectedCalendars]);

  const generateShareImage = async (): Promise<{ imageUrl: string; objectPath: string; calendarPageUrl: string } | null> => {
    if (shareImageData) return shareImageData;

    setIsGeneratingShareImage(true);
    try {
      const monthParam = currentMonth.toISOString();
      const selectedIds = Array.from(selectedCalendars);
      const calendarIdParam = selectedIds.length === 1 ? `&calendarId=${encodeURIComponent(selectedIds[0])}` : '';
      const response = await apiRequest('GET', `${basePath}/api/calendars/share-image?month=${encodeURIComponent(monthParam)}${calendarIdParam}`);
      const data = await response.json();
      setShareImageData(data);
      return data;
    } catch (error) {
      console.error('Failed to generate share image:', error);
      toast({
        title: "Error",
        description: "Failed to generate calendar image. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGeneratingShareImage(false);
    }
  };

  const handleDownloadShareImage = async () => {
    const data = await generateShareImage();
    if (!data) return;

    try {
      const response = await fetch(`${basePath}${data.objectPath}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calendar-${format(currentMonth, 'yyyy-MM')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Downloaded",
        description: "Calendar image saved to your device.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download image.",
        variant: "destructive",
      });
    }
  };

  const getCalendarPageUrl = () => {
    return `${window.location.origin}${basePath}/dashboard/calendar`;
  };

  const getImageUrl = (imageUrl?: string) => {
    if (imageUrl) return imageUrl;
    return getCalendarPageUrl();
  };

  const handleSocialShare = async (platform: string) => {
    const data = await generateShareImage();
    const imageUrl = data?.imageUrl || '';
    const calendarPageUrl = getCalendarPageUrl();
    const selectedIds = Array.from(selectedCalendars);
    const selectedCal = selectedIds.length === 1
      ? calendarsData?.calendars.find(c => c.id === selectedIds[0])
      : null;
    const calendarName = selectedCal?.name || calendarsData?.calendars[0]?.name || 'our';
    const text = `Check out ${calendarName} calendar!`;
    const messageBody = `${text}\n\nView full calendar: ${calendarPageUrl}`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    switch (platform) {
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(imageUrl)}&quote=${encodeURIComponent(`${text}\n\nView full calendar: ${calendarPageUrl}`)}`, '_blank');
        break;
      case 'messenger':
        if (isMobile) {
          window.location.href = `fb-messenger://share/?link=${encodeURIComponent(imageUrl)}`;
        } else {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(imageUrl)}&quote=${encodeURIComponent(`${text}\n\nView full calendar: ${calendarPageUrl}`)}`, '_blank', 'width=600,height=500');
        }
        toast({
          title: "Sharing via Messenger",
          description: isMobile ? "Opening Messenger app..." : "Share the link from Facebook...",
        });
        break;
      case 'whatsapp':
        if (isMobile) {
          window.location.href = `whatsapp://send?text=${encodeURIComponent(messageBody)}`;
        } else {
          window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(messageBody)}`, '_blank');
        }
        toast({
          title: "Sharing via WhatsApp",
          description: "Opening WhatsApp...",
        });
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent(`${calendarName} Calendar`)}&body=${encodeURIComponent(`${text}\n\nView the calendar image: ${imageUrl}\n\nView full calendar & sign up: ${calendarPageUrl}`)}`;
        break;
    }
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
                    <div className="space-y-1">
                      <button
                        onClick={() => selectCalendar(null)}
                        className={`w-full flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2 text-left ${selectedCalendars.size === 0 ? 'bg-accent' : ''}`}
                        data-testid="button-select-all-calendars"
                      >
                        <div className="w-4 h-4 rounded border-2 border-muted-foreground flex items-center justify-center">
                          {selectedCalendars.size === 0 && (
                            <div className="w-2 h-2 rounded-sm bg-foreground" />
                          )}
                        </div>
                        <span className="text-sm flex-1 font-medium">All Calendars</span>
                      </button>
                      {calendarsData?.calendars.map((calendar) => (
                        <button
                          key={calendar.id}
                          onClick={() => selectCalendar(calendar.id)}
                          className={`w-full flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2 text-left ${selectedCalendars.has(calendar.id) ? 'bg-accent' : ''}`}
                          data-testid={`button-select-calendar-${calendar.id}`}
                        >
                          <div
                            className="w-4 h-4 rounded"
                            style={{
                              backgroundColor: calendar.color,
                              opacity: selectedCalendars.size === 0 || selectedCalendars.has(calendar.id) ? 1 : 0.3,
                            }}
                          />
                          <span className="text-sm flex-1">{calendar.name}</span>
                          {(calendar.canAdd || calendar.canEdit || calendar.canDelete) && (
                            <div className="flex gap-0.5">
                              {calendar.canAdd && <Badge variant="secondary" className="text-xs px-1" title="Can add events">A</Badge>}
                              {calendar.canEdit && <Badge variant="secondary" className="text-xs px-1" title="Can edit events">E</Badge>}
                              {calendar.canDelete && <Badge variant="secondary" className="text-xs px-1" title="Can delete events">D</Badge>}
                            </div>
                          )}
                        </button>
                      ))}
                      {calendarsData?.calendars.length === 0 && (
                        <p className="text-sm text-muted-foreground">No calendars available</p>
                      )}
                    </div>
                  {!onlyVolunteerCalendarsSelected && (
                  <div className="pt-3 border-t">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Medical
                    </h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">Show Medical Events</span>
                      <Switch
                        checked={showMedicalEvents}
                        onCheckedChange={setShowMedicalEvents}
                        data-testid="switch-medical-events"
                      />
                    </div>
                    {showMedicalEvents && (
                      <div className="mt-3 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#8b5cf6' }} />
                          <span className="text-muted-foreground">Vaccines</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }} />
                          <span className="text-muted-foreground">Procedures</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f59e0b' }} />
                          <span className="text-muted-foreground">Exams</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10b981' }} />
                          <span className="text-muted-foreground">Preventative Care</span>
                        </div>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => openMedicalDialog()}
                      data-testid="button-schedule-medical"
                    >
                      <Stethoscope className="h-3.5 w-3.5 mr-1.5" />
                      Schedule Appointment
                    </Button>
                  </div>
                  )}
                    {calendarsData?.calendars.some(c => c.canAdd || c.canEdit || c.canDelete) && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">A</span>=Add, <span className="font-medium">E</span>=Edit, <span className="font-medium">D</span>=Delete
                        </p>
                      </div>
                    )}
                    {/* Volunteer staffing legend - shown when single volunteer calendar is selected */}
                    {selectedCalendars.size === 1 && (() => {
                      const selectedCalId = Array.from(selectedCalendars)[0];
                      const selectedCal = calendarsData?.calendars.find(c => c.id === selectedCalId);
                      if (selectedCal?.type === 'volunteer') {
                        const minRequired = selectedCal.minVolunteersRequired ?? 2;
                        return (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium mb-2">Staffing Levels</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.4)' }} />
                                <span className="text-muted-foreground">No volunteers</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(234, 179, 8, 0.4)' }} />
                                <span className="text-muted-foreground">Below minimum ({minRequired})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.4)' }} />
                                <span className="text-muted-foreground">Fully staffed ({minRequired}+)</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </Card>
              </div>

              {/* Main calendar view */}
              <div className="lg:col-span-3 print:col-span-full">
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
                        {/* Calendar Title - visible in normal view and print */}
                        <h1 
                          className="relative text-center text-lg font-semibold mb-2 truncate max-w-full px-4"
                          style={{ color: headerTextColor }}
                          data-testid="calendar-title"
                        >
                          {(() => {
                            if (selectedCalendars.size === 0) {
                              return calendarsData?.calendars.length === 1 
                                ? calendarsData.calendars[0].name 
                                : "All Calendars";
                            }
                            const selectedCal = calendarsData?.calendars.find(c => selectedCalendars.has(c.id));
                            return selectedCal?.name || "All Calendars";
                          })()}
                        </h1>
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

                      {/* Empty padding cells for days before the 1st of the month */}
                      {Array.from({ length: monthStart.getDay() }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="min-h-24 p-2" />
                      ))}

                      {/* Calendar days */}
                      {calendarDays.map((day, idx) => {
                        const dayEvents = getEventsForDate(day);
                        const dayMedicalEvents = getMedicalEventsForDate(day);
                        const allDayItems = [
                          ...dayEvents.map(e => ({ kind: 'event' as const, event: e })),
                          ...dayMedicalEvents.map(m => ({ kind: 'medical' as const, medical: m })),
                        ];
                        const isToday = isSameDay(day, new Date());
                        
                        // Volunteer staffing color-coding: Only apply when viewing a single volunteer calendar
                        let volunteerBgColor: string | undefined;
                        if (selectedCalendars.size === 1) {
                          const selectedCalId = Array.from(selectedCalendars)[0];
                          const selectedCal = calendarsData?.calendars.find(c => c.id === selectedCalId);
                          if (selectedCal?.type === 'volunteer') {
                            // Count events (volunteer sign-ups) for this day on this calendar
                            const volunteerEventsOnDay = dayEvents.filter(e => e.calendarId === selectedCalId).length;
                            const minRequired = selectedCal.minVolunteersRequired ?? 2;
                            
                            if (volunteerEventsOnDay === 0) {
                              volunteerBgColor = 'rgba(239, 68, 68, 0.15)'; // Red - no volunteers
                            } else if (volunteerEventsOnDay < minRequired) {
                              volunteerBgColor = 'rgba(234, 179, 8, 0.2)'; // Yellow - below minimum
                            } else {
                              volunteerBgColor = 'rgba(34, 197, 94, 0.15)'; // Green - at or above minimum
                            }
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
                              {allDayItems.slice(0, 3).map((item) => {
                                if (item.kind === 'event') {
                                  const event = item.event;
                                  return (
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
                                    </div>
                                  );
                                } else {
                                  const med = item.medical;
                                  return (
                                    <div
                                      key={med.id}
                                      className="text-xs p-1.5 rounded flex items-center gap-1"
                                      style={{
                                        backgroundColor: med.color + '20',
                                        borderLeft: `3px solid ${med.color}`,
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMedicalEvent(med);
                                      }}
                                      data-testid={`medical-preview-${med.id}`}
                                    >
                                      <Stethoscope className="h-3 w-3 flex-shrink-0" style={{ color: med.color }} />
                                      <div className="font-medium truncate">{med.title}</div>
                                    </div>
                                  );
                                }
                              })}
                              {allDayItems.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{allDayItems.length - 3} more
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
            {(() => {
              const dayRegularEvents = selectedDate ? getEventsForDate(selectedDate) : [];
              const dayMedEvents = selectedDate ? getMedicalEventsForDate(selectedDate) : [];
              const hasAnyEvents = dayRegularEvents.length > 0 || dayMedEvents.length > 0;
              
              return hasAnyEvents ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {dayRegularEvents.map((event) => (
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
                  {dayMedEvents.map((med) => (
                    <Card
                      key={med.id}
                      className="p-4 hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedMedicalEvent(med);
                        setDayViewOpen(false);
                      }}
                      data-testid={`day-medical-${med.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-1 h-full rounded"
                          style={{ backgroundColor: med.color }}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold flex items-center gap-1.5">
                              <Stethoscope className="h-4 w-4" style={{ color: med.color }} />
                              {med.title}
                            </h4>
                            <Badge variant="secondary" className="text-xs">{med.category}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {format(parseISO(med.date), "h:mm a")}
                            </div>
                            {med.veterinarian && (
                              <span>Vet: {med.veterinarian}</span>
                            )}
                          </div>
                          {med.notes && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{med.notes}</p>
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
              );
            })()}
            
            <div className="flex gap-2 pt-4 border-t">
              {calendarsWithAddPermission.length > 0 && (
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
              )}
              {!onlyVolunteerCalendarsSelected && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDayViewOpen(false);
                    if (selectedDate) {
                      openMedicalDialog(selectedDate);
                    }
                  }}
                  className="flex-1"
                  data-testid="button-add-medical-from-day-view"
                >
                  <Stethoscope className="mr-2 h-4 w-4" />
                  Medical Appt
                </Button>
              )}
            </div>
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
                
                const volunteers = volunteerTeamMembersData?.volunteers || [];
                const canAssign = selectedCalendarForForm?.canAssignOthers === true;
                const selectedVolunteer = newEvent.volunteerContactId 
                  ? volunteers.find(v => v.id === newEvent.volunteerContactId)
                  : null;
                
                return (
              <>
                {/* Volunteer Signup - with dropdown if canAssignOthers */}
                {canAssign ? (
                  <div className="space-y-3">
                    <Label htmlFor="volunteer-select">Select Volunteer</Label>
                    <Select
                      value={isManualVolunteerMode ? "manual" : (newEvent.volunteerContactId || "self")}
                      onValueChange={(value) => {
                        if (value === "manual") {
                          setIsManualVolunteerMode(true);
                          setNewEvent({ 
                            ...newEvent, 
                            volunteerContactId: null,
                            manualVolunteerName: "",
                            title: "Manual Entry - Signup"
                          });
                        } else {
                          setIsManualVolunteerMode(false);
                          const volunteerContactId = value === "self" ? null : value;
                          const volunteer = volunteers.find(v => v.id === value);
                          const title = value === "self" 
                            ? `${currentUser?.fullName || currentUser?.email || 'Volunteer'} - Signup`
                            : `${volunteer?.fullName || volunteer?.email || 'Volunteer'} - Signup`;
                          setNewEvent({ 
                            ...newEvent, 
                            volunteerContactId,
                            manualVolunteerName: "",
                            title 
                          });
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-volunteer">
                        <SelectValue placeholder="Select a volunteer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">
                          Myself ({currentUser?.fullName || currentUser?.email})
                        </SelectItem>
                        {volunteers.map((volunteer) => (
                          <SelectItem key={volunteer.id} value={volunteer.id}>
                            {volunteer.fullName || volunteer.email}
                          </SelectItem>
                        ))}
                        <SelectItem value="manual">
                          Type name manually...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Manual volunteer name input */}
                    {isManualVolunteerMode && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Enter volunteer name"
                          value={newEvent.manualVolunteerName}
                          onChange={(e) => {
                            const name = e.target.value;
                            setNewEvent({
                              ...newEvent,
                              manualVolunteerName: name,
                              title: name ? `${name} - Signup` : "Manual Entry - Signup"
                            });
                          }}
                          data-testid="input-manual-volunteer-name"
                        />
                        <p className="text-xs text-muted-foreground">
                          For volunteers who haven't signed up on the website yet
                        </p>
                      </div>
                    )}
                    
                    <p className="text-sm text-muted-foreground">
                      Signing up: {isManualVolunteerMode && newEvent.manualVolunteerName ? newEvent.manualVolunteerName : (selectedVolunteer ? (selectedVolunteer.fullName || selectedVolunteer.email) : (currentUser?.fullName || currentUser?.email))}
                    </p>
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
      <Dialog open={shareDialogOpen} onOpenChange={(open) => {
        setShareDialogOpen(open);
        if (!open) {
          setShareImageData(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Calendar</DialogTitle>
            <DialogDescription>
              Generate a calendar image and share it via social media, or export in other formats
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            {shareImageData && (
              <div className="rounded-md overflow-hidden border">
                <img
                  src={`${basePath}${shareImageData.objectPath}`}
                  alt="Calendar preview"
                  className="w-full"
                  data-testid="img-calendar-share-preview"
                />
              </div>
            )}

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleDownloadShareImage}
              disabled={isGeneratingShareImage}
              data-testid="button-share-download-image"
            >
              {isGeneratingShareImage ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isGeneratingShareImage ? 'Generating Calendar Image...' : 'Download Calendar Image'}
            </Button>

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
              onClick={async () => {
                const data = await generateShareImage();
                const url = getShareUrl(data?.objectPath);
                navigator.clipboard.writeText(url);
                toast({
                  title: "Link Copied",
                  description: "Calendar link with preview image copied to clipboard!",
                });
              }}
              disabled={isGeneratingShareImage}
              data-testid="button-share-copy-link"
            >
              {isGeneratingShareImage ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copy Shareable Link
            </Button>

            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">Share via:</p>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSocialShare('facebook')}
                  disabled={isGeneratingShareImage}
                  data-testid="button-share-facebook"
                  title="Share on Facebook"
                >
                  {isGeneratingShareImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSocialShare('messenger')}
                  disabled={isGeneratingShareImage}
                  data-testid="button-share-messenger"
                  title="Share on Messenger"
                >
                  {isGeneratingShareImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <SiMessenger className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSocialShare('whatsapp')}
                  disabled={isGeneratingShareImage}
                  data-testid="button-share-whatsapp"
                  title="Share on WhatsApp"
                >
                  {isGeneratingShareImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <SiWhatsapp className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSocialShare('email')}
                  disabled={isGeneratingShareImage}
                  data-testid="button-share-email"
                  title="Share via Email"
                >
                  {isGeneratingShareImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                A calendar image will be generated when sharing so recipients see your actual calendar.
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
      {/* Medical Event Detail Dialog */}
      <Dialog open={!!selectedMedicalEvent} onOpenChange={() => setSelectedMedicalEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" style={{ color: selectedMedicalEvent?.color }} />
              Medical Appointment
            </DialogTitle>
            <DialogDescription>
              View medical event details
            </DialogDescription>
          </DialogHeader>
          {selectedMedicalEvent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedMedicalEvent.color }} />
                <Badge variant="secondary">{selectedMedicalEvent.category}</Badge>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Title</Label>
                  <p className="font-semibold">{selectedMedicalEvent.title}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Animal</Label>
                  <p>{selectedMedicalEvent.animalName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Date</Label>
                  <p>{format(parseISO(selectedMedicalEvent.date), "EEEE, MMMM d, yyyy 'at' h:mm a")}</p>
                </div>
                {selectedMedicalEvent.veterinarian && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Veterinarian</Label>
                    <p>{selectedMedicalEvent.veterinarian}</p>
                  </div>
                )}
                {selectedMedicalEvent.notes && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Notes</Label>
                    <p className="text-sm">{selectedMedicalEvent.notes}</p>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedMedicalEvent(null)}
                data-testid="button-close-medical-detail"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Medical Appointment Dialog */}
      <Dialog open={medicalDialogOpen} onOpenChange={setMedicalDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Schedule Medical Appointment
            </DialogTitle>
            <DialogDescription>
              Create a medical appointment that will appear on the calendar and in the animal's medical records.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateMedicalAppt} className="space-y-4 overflow-y-auto flex-1">
            <div>
              <Label>Appointment Type *</Label>
              <Select
                value={newMedicalAppt.type}
                onValueChange={(value) => setNewMedicalAppt({ ...newMedicalAppt, type: value })}
              >
                <SelectTrigger data-testid="select-medical-type">
                  <SelectValue placeholder="Select appointment type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(medicalTypeLabels).map(([key, label]) => {
                    const Icon = medicalTypeIcons[key];
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Animal *</Label>
              <div className="space-y-2 relative">
                <Input
                  placeholder="Search animals by name..."
                  value={animalSearch}
                  onChange={(e) => setAnimalSearch(e.target.value)}
                  onFocus={() => setAnimalSearchFocused(true)}
                  onBlur={() => setTimeout(() => setAnimalSearchFocused(false), 200)}
                  data-testid="input-animal-search"
                />
                {newMedicalAppt.animalId && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <span className="text-sm font-medium">
                      Selected: {animalsData?.animals?.find(a => a.id === newMedicalAppt.animalId)?.name || 'Unknown'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-auto"
                      onClick={() => setNewMedicalAppt({ ...newMedicalAppt, animalId: "" })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {(animalSearchFocused || animalSearch) && !newMedicalAppt.animalId && (
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {filteredAnimals.length > 0 ? filteredAnimals.map((animal) => (
                      <button
                        key={animal.id}
                        type="button"
                        className="w-full text-left p-2 text-sm hover-elevate"
                        onClick={() => {
                          setNewMedicalAppt({ ...newMedicalAppt, animalId: animal.id });
                          setAnimalSearch("");
                          setAnimalSearchFocused(false);
                        }}
                        data-testid={`button-select-animal-${animal.id}`}
                      >
                        {animal.name}
                      </button>
                    )) : (
                      <p className="p-2 text-sm text-muted-foreground">No animals found</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="medical-title">
                {newMedicalAppt.type === 'vaccine' ? 'Vaccine Name' :
                 newMedicalAppt.type === 'procedure' ? 'Procedure Name' :
                 newMedicalAppt.type === 'exam' ? 'Exam Type' :
                 newMedicalAppt.type === 'preventative_care' ? 'Care Name' : 'Title'} *
              </Label>
              <Input
                id="medical-title"
                value={newMedicalAppt.title}
                onChange={(e) => setNewMedicalAppt({ ...newMedicalAppt, title: e.target.value })}
                placeholder={
                  newMedicalAppt.type === 'vaccine' ? 'e.g., Rabies, DHPP, Bordetella' :
                  newMedicalAppt.type === 'procedure' ? 'e.g., Spay/Neuter, Dental Cleaning' :
                  newMedicalAppt.type === 'exam' ? 'e.g., Annual Checkup, Pre-Surgery' :
                  newMedicalAppt.type === 'preventative_care' ? 'e.g., Heartworm Test, Flea Prevention' :
                  'Enter title...'
                }
                required
                data-testid="input-medical-title"
              />
            </div>

            <div>
              <Label htmlFor="medical-date">Date & Time *</Label>
              <Input
                id="medical-date"
                type="datetime-local"
                value={newMedicalAppt.date}
                onChange={(e) => setNewMedicalAppt({ ...newMedicalAppt, date: e.target.value })}
                required
                data-testid="input-medical-date"
              />
            </div>

            <div>
              <Label htmlFor="medical-vet">Veterinarian</Label>
              <Input
                id="medical-vet"
                value={newMedicalAppt.veterinarian}
                onChange={(e) => setNewMedicalAppt({ ...newMedicalAppt, veterinarian: e.target.value })}
                placeholder="e.g., Dr. Smith"
                data-testid="input-medical-vet"
              />
            </div>

            <div>
              <Label htmlFor="medical-notes">Notes</Label>
              <Textarea
                id="medical-notes"
                value={newMedicalAppt.notes}
                onChange={(e) => setNewMedicalAppt({ ...newMedicalAppt, notes: e.target.value })}
                placeholder="Any additional details..."
                data-testid="input-medical-notes"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMedicalDialogOpen(false)}
                className="flex-1"
                data-testid="button-cancel-medical"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMedicalApptMutation.isPending || !newMedicalAppt.type || !newMedicalAppt.animalId}
                className="flex-1"
                data-testid="button-submit-medical"
              >
                {createMedicalApptMutation.isPending ? "Scheduling..." : "Schedule Appointment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
   </>
  );
}
