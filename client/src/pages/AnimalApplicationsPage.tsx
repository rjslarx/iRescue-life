import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, ClipboardList, Mail, Phone, Calendar, Eye } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ApplicationWithAnimal } from "@shared/schema";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { ViewApplicationDialog } from "@/components/ViewApplicationDialog";
import { useState } from "react";

export default function AnimalApplicationsPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [applicationToView, setApplicationToView] = useState<ApplicationWithAnimal | null>(null);

  // Fetch animal details
  const { data: animalData, isLoading: animalLoading } = useQuery<any>({
    queryKey: [`/api/animals/${animalId}`],
    enabled: !!animalId,
  });

  // Fetch all applications for this animal
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery<{ applications: ApplicationWithAnimal[] }>({
    queryKey: ['/api/applications', animalId],
    queryFn: async () => {
      // The backend supports filtering by animalId via query parameter
      const response = await fetch(`/api/applications?animalId=${animalId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch applications');
      }
      return response.json();
    },
    enabled: !!animalId,
  });

  const animal = animalData?.animal;
  const applications = applicationsData?.applications || [];

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const response = await apiRequest('PATCH', `/api/applications/${id}/stage`, { stage });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications', animalId] });
      toast({
        title: "Application updated",
        description: "The application stage has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update application",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const getStatusDisplay = (stage: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      new: { label: "New", variant: "default" },
      screening: { label: "Screening", variant: "secondary" },
      vet_check: { label: "Vet Check", variant: "secondary" },
      home_visit: { label: "Home Visit", variant: "secondary" },
      approved: { label: "Approved", variant: "default" },
      denied: { label: "Denied", variant: "destructive" },
      adopted: { label: "Adopted", variant: "default" },
    };
    return statusMap[stage] || { label: stage, variant: "outline" as const };
  };

  const handleStageChange = (applicationId: string, newStage: string) => {
    updateStageMutation.mutate({ id: applicationId, stage: newStage });
  };

  if (animalLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!animal) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-muted-foreground">Animal not found</p>
          <Button onClick={() => navigate('/dashboard/animals')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Animals
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard/animals')}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold" data-testid="text-page-title">
                  Applications for {animal.name}
                </h1>
                {animal.animalId && (
                  <Badge variant="outline" className="text-base font-mono">
                    {animal.animalId}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                {animal.species} • {animal.breed} • {animal.age}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="badge-application-count">
              <ClipboardList className="w-3 h-3 mr-1" />
              {applications.length} {applications.length === 1 ? 'Application' : 'Applications'}
            </Badge>
          </div>
        </div>

        {/* Applications */}
        {applicationsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Applications Yet</h3>
              <p className="text-sm text-muted-foreground">
                No adoption applications have been received for {animal.name}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {applications.map((app) => {
              const statusDisplay = getStatusDisplay(app.stage);
              const submittedDate = new Date(app.createdAt).toLocaleDateString();

              return (
                <Card key={app.id} data-testid={`card-application-${app.id}`} className="hover-elevate">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base" data-testid={`text-applicant-${app.id}`}>
                        {app.applicantName}
                      </CardTitle>
                      <Badge variant={statusDisplay.variant} data-testid={`badge-status-${app.id}`}>
                        {statusDisplay.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{app.applicantEmail}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{app.applicantPhone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Submitted: {submittedDate}</span>
                      </div>
                    </div>

                    {app.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Notes:</p>
                        <p className="text-sm line-clamp-2">{app.notes}</p>
                      </div>
                    )}

                    <div className="pt-2 border-t">
                      <label className="text-xs font-medium text-muted-foreground">Update Stage:</label>
                      <select
                        value={app.stage}
                        onChange={(e) => handleStageChange(app.id, e.target.value)}
                        className="w-full mt-1 px-2 py-1 text-sm border rounded-md bg-background"
                        data-testid={`select-stage-${app.id}`}
                      >
                        <option value="new">New</option>
                        <option value="screening">Screening</option>
                        <option value="vet_check">Vet Check</option>
                        <option value="home_visit">Home Visit</option>
                        <option value="approved">Approved</option>
                        <option value="denied">Denied</option>
                        <option value="adopted">Adopted</option>
                      </select>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full" 
                      onClick={() => {
                        setApplicationToView(app);
                        setViewDialogOpen(true);
                      }}
                      data-testid={`button-view-application-${app.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Application
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>

      {/* View Application Dialog */}
      <ViewApplicationDialog
        application={applicationToView ? {
          id: applicationToView.id,
          applicantName: applicationToView.applicantName,
          applicantEmail: applicationToView.applicantEmail,
          applicantPhone: applicationToView.applicantPhone,
          stage: applicationToView.stage,
          createdAt: applicationToView.createdAt?.toString(),
          animalName: animal?.name,
        } : null}
        applicationType="adoption"
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) {
            setApplicationToView(null);
          }
        }}
      />
    </DashboardLayout>
  );
}
