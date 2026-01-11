import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Inbox, CheckCircle2, Archive, Paperclip, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";

type EmailStatus = "unprocessed" | "processed" | "archived";

export default function EmailInboxPage() {
  // Read initial status from URL query parameter
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialStatus = urlParams.get('status') as EmailStatus | null;
  
  const [selectedStatus, setSelectedStatus] = useState<EmailStatus | "all">(
    initialStatus && ['unprocessed', 'processed', 'archived'].includes(initialStatus) 
      ? initialStatus 
      : "all"
  );
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkedAnimalId, setLinkedAnimalId] = useState<string | null>(null);

  // Fetch emails
  const { data: emailsData, isLoading } = useQuery({
    queryKey: ['/api/inbound-emails', selectedStatus !== "all" ? selectedStatus : undefined],
    queryFn: selectedStatus === "all" 
      ? undefined 
      : () => fetch(`/api/inbound-emails?status=${selectedStatus}`).then(r => r.json()),
  });

  // Fetch all animals for linking
  const { data: animalsData } = useQuery<{ animals: any[] }>({
    queryKey: ['/api/animals'],
  });

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('PATCH', `/api/inbound-emails/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbound-emails'] });
      setViewDialogOpen(false);
    },
  });

  const emails = emailsData?.emails || [];
  const animals = animalsData?.animals || [];

  const handleViewEmail = async (email: any) => {
    // Fetch full email details
    const response = await fetch(`/api/inbound-emails/${email.id}`);
    const data = await response.json();
    setSelectedEmail(data.email);
    setNotes(data.email.notes || "");
    setLinkedAnimalId(data.email.linkedAnimalId);
    setViewDialogOpen(true);
  };

  const handleMarkProcessed = () => {
    if (selectedEmail) {
      updateEmailMutation.mutate({
        id: selectedEmail.id,
        data: {
          status: 'processed',
          notes: notes || undefined,
          linkedAnimalId: linkedAnimalId || null,
        },
      });
    }
  };

  const handleArchive = () => {
    if (selectedEmail) {
      updateEmailMutation.mutate({
        id: selectedEmail.id,
        data: { status: 'archived' },
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unprocessed':
        return <Inbox className="w-4 h-4" />;
      case 'processed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'archived':
        return <Archive className="w-4 h-4" />;
      default:
        return <Mail className="w-4 h-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'unprocessed':
        return 'default';
      case 'processed':
        return 'secondary';
      case 'archived':
        return 'outline';
      default:
        return 'default';
    }
  };

  return (
    <DashboardLayout
      title="Email Inbox"
      description="Emails sent to your rescue at [subdomain]@mail.irescue.life"
    >
      <div className="overflow-auto h-full p-6 space-y-6">
        <Tabs value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          <TabsTrigger value="unprocessed" data-testid="tab-unprocessed">Unprocessed</TabsTrigger>
          <TabsTrigger value="processed" data-testid="tab-processed">Processed</TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedStatus} className="space-y-4 mt-4">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No emails found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {emails.map((email: any) => (
                <Card 
                  key={email.id} 
                  className="hover-elevate cursor-pointer" 
                  onClick={() => handleViewEmail(email)}
                  data-testid={`email-${email.id}`}
                >
                  <CardHeader className="space-y-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(email.status)}
                          <CardTitle className="text-lg truncate">
                            {email.subject}
                          </CardTitle>
                        </div>
                        <CardDescription className="mt-1">
                          <span className="font-medium">{email.fromName || email.from}</span>
                          {email.fromName && (
                            <span className="text-xs ml-2 text-muted-foreground">{email.from}</span>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <Badge variant={getStatusBadgeVariant(email.status)} data-testid={`status-${email.id}`}>
                          {email.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    {(email.linkedAnimal || email.attachments) && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground pt-2">
                        {email.linkedAnimal && (
                          <span className="flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            Linked to {email.linkedAnimal.name}
                          </span>
                        )}
                        {email.attachments && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {email.attachments.length} attachment(s)
                          </span>
                        )}
                      </div>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Email Detail Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmail?.subject}</DialogTitle>
          </DialogHeader>

          {selectedEmail && (
            <div className="space-y-6">
              {/* Email metadata */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">From:</span>{" "}
                  {selectedEmail.fromName ? (
                    <>
                      {selectedEmail.fromName} <span className="text-muted-foreground">&lt;{selectedEmail.from}&gt;</span>
                    </>
                  ) : (
                    selectedEmail.from
                  )}
                </div>
                <div>
                  <span className="font-medium">To:</span> {selectedEmail.to}
                </div>
                <div>
                  <span className="font-medium">Received:</span>{" "}
                  {new Date(selectedEmail.receivedAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={getStatusBadgeVariant(selectedEmail.status)}>
                    {selectedEmail.status}
                  </Badge>
                </div>
              </div>

              {/* Attachments */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div>
                  <Label className="font-medium mb-2 block">Attachments</Label>
                  <div className="space-y-2">
                    {selectedEmail.attachments.map((att: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                        <Paperclip className="w-4 h-4" />
                        <span>{att.filename}</span>
                        <span className="text-muted-foreground">({att.contentType})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email body */}
              <div>
                <Label className="font-medium mb-2 block">Message</Label>
                {selectedEmail.htmlBody ? (
                  <div 
                    className="prose prose-sm max-w-none p-4 bg-muted rounded"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap p-4 bg-muted rounded font-mono text-sm">
                    {selectedEmail.textBody || "(No content)"}
                  </div>
                )}
              </div>

              {/* Processing section */}
              {selectedEmail.status === 'unprocessed' && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="animal-select">Link to Animal (Optional)</Label>
                    <Select
                      value={linkedAnimalId || "none"}
                      onValueChange={(v) => setLinkedAnimalId(v === "none" ? null : v)}
                    >
                      <SelectTrigger id="animal-select" data-testid="select-animal">
                        <SelectValue placeholder="Select an animal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {animals.map((animal: any) => (
                          <SelectItem key={animal.id} value={animal.id}>
                            {animal.name} ({animal.species})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      data-testid="input-notes"
                      placeholder="Add any notes about this email..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleMarkProcessed}
                      disabled={updateEmailMutation.isPending}
                      data-testid="button-mark-processed"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Mark as Processed
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleArchive}
                      disabled={updateEmailMutation.isPending}
                      data-testid="button-archive"
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      Archive
                    </Button>
                  </div>
                </div>
              )}

              {/* Show processor info if processed */}
              {selectedEmail.status === 'processed' && selectedEmail.processor && (
                <div className="pt-4 border-t text-sm">
                  <p className="text-muted-foreground">
                    Processed by {selectedEmail.processor.fullName} on{" "}
                    {new Date(selectedEmail.processedAt).toLocaleString()}
                  </p>
                  {selectedEmail.notes && (
                    <div className="mt-2">
                      <Label className="font-medium">Notes:</Label>
                      <p className="mt-1 text-muted-foreground">{selectedEmail.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
