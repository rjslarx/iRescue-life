import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ticket,
  DollarSign,
  Users,
  RefreshCw,
  Filter,
  Clock,
  Mail,
  TrendingUp,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";

interface TicketSale {
  id: string;
  eventName: string;
  eventTicketId: string | null;
  customerName: string;
  customerEmail: string;
  quantity: number;
  amount: number;
  baseAmount: number | null;
  donorCoveredFees: boolean;
  currency: string;
  created: string;
}

interface EventBreakdown {
  eventName: string;
  totalRevenue: number;
  totalTickets: number;
  purchaseCount: number;
}

interface EventInfo {
  id: string;
  eventName: string;
  isActive: boolean;
}

interface TicketSalesData {
  configured: boolean;
  sales: TicketSale[];
  summary: {
    totalRevenue: number;
    totalTickets: number;
    eventBreakdown: EventBreakdown[];
  };
  events: EventInfo[];
  error?: string;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateString: string): string {
  return `${formatDate(dateString)} at ${formatTime(dateString)}`;
}

export default function EventTicketSalesPage() {
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedBreakdown, setExpandedBreakdown] = useState(true);

  const queryParams = new URLSearchParams();
  if (eventFilter && eventFilter !== "all") queryParams.set("eventName", eventFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  const queryString = queryParams.toString();

  const apiUrl = queryString ? `/api/event-ticket-sales?${queryString}` : '/api/event-ticket-sales';

  const { data, isLoading, isRefetching } = useQuery<TicketSalesData>({
    queryKey: [apiUrl],
    refetchInterval: 15000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('/api/event-ticket-sales') });
  };

  const handleClearFilters = () => {
    setEventFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = eventFilter !== "all" || dateFrom || dateTo;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full p-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading ticket sales...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data?.configured) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full p-8">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <h3 className="font-semibold text-lg">Stripe Not Configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Event ticket sales require Stripe to be configured. Please set up Stripe in your Settings to view ticket purchase data.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const { sales, summary, events } = data;

  return (
    <DashboardLayout>
    <div className="flex flex-col h-full overflow-auto" data-testid="event-ticket-sales-page">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold" data-testid="text-page-title">Event Ticket Sales</h1>
          </div>
          <div className="flex items-center gap-2">
            {isRefetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "toggle-elevate toggle-elevated" : ""}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRefresh}
              data-testid="button-refresh-sales"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-col gap-2" data-testid="filter-panel">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-event-filter">
                  <SelectValue placeholder="All Events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {(events || []).map(event => (
                    <SelectItem key={event.id} value={event.eventName}>
                      {event.eventName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full sm:w-[160px]"
                placeholder="From date"
                data-testid="input-date-from"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full sm:w-[160px]"
                placeholder="To date"
                data-testid="input-date-to"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="button-clear-filters">
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3" data-testid="summary-cards">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs text-muted-foreground">Revenue</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-total-revenue">
                {formatCurrency(summary.totalRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Ticket className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Tickets Sold</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-total-tickets">
                {summary.totalTickets}
              </p>
            </CardContent>
          </Card>
        </div>

        {summary.eventBreakdown.length > 1 && (
          <Card data-testid="event-breakdown">
            <CardHeader className="p-4 pb-2">
              <button
                className="flex items-center justify-between gap-2 w-full text-left"
                onClick={() => setExpandedBreakdown(!expandedBreakdown)}
                data-testid="button-toggle-breakdown"
              >
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  By Event
                </CardTitle>
                {expandedBreakdown ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {expandedBreakdown && (
              <CardContent className="p-4 pt-0">
                <div className="space-y-2">
                  {summary.eventBreakdown.map(event => (
                    <div
                      key={event.eventName}
                      className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
                      data-testid={`breakdown-event-${event.eventName}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{event.eventName}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.totalTickets} tickets / {event.purchaseCount} purchases
                        </p>
                      </div>
                      <p className="text-sm font-semibold whitespace-nowrap">
                        {formatCurrency(event.totalRevenue)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        <div data-testid="sales-list">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Recent Purchases ({sales.length})
            </h2>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              <span>Auto-refreshes</span>
            </div>
          </div>

          {sales.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8">
                <Ticket className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">No ticket purchases yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hasActiveFilters
                      ? "No purchases match the current filters. Try adjusting your filters."
                      : "Ticket purchases will appear here in real time as they come in."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sales.map(sale => (
                <Card key={sale.id} data-testid={`sale-card-${sale.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" data-testid={`text-customer-name-${sale.id}`}>
                            {sale.customerName}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {sale.quantity} {sale.quantity === 1 ? 'ticket' : 'tickets'}
                          </Badge>
                        </div>
                        {sale.customerEmail && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground truncate" data-testid={`text-customer-email-${sale.id}`}>
                              {sale.customerEmail}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {sale.eventName}
                          </Badge>
                          {sale.donorCoveredFees && (
                            <Badge variant="secondary" className="text-xs">
                              Fees covered
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground" data-testid={`text-sale-time-${sale.id}`}>
                            {formatDateTime(sale.created)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" data-testid={`text-sale-amount-${sale.id}`}>
                          {formatCurrency(sale.amount)}
                        </p>
                        {sale.baseAmount && sale.baseAmount !== sale.amount && (
                          <p className="text-xs text-muted-foreground">
                            Base: {formatCurrency(sale.baseAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
