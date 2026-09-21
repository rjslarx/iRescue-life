import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tenantFetch } from "@/lib/tenantApi";
import { canAttestOpenedRequirement } from "@shared/volunteer-training";

interface PublicTraining {
  applicantName: string;
  expiresAt: string;
  overallStatus: string;
  tutorials: Array<{
    id: string;
    title: string;
    description: string | null;
    youtubeUrl: string;
    requirementVersion: number;
    renewalMonths: number;
    status: string;
    completion: { attestedAt: string; renewalDueAt: string } | null;
  }>;
}

export default function PublicVolunteerTrainingPage() {
  const { token } = useParams<{ token: string }>();
  const [opened, setOpened] = useState<Map<string, number>>(new Map());
  const { data, isLoading, error, refetch } = useQuery<PublicTraining>({
    queryKey: ["/api/public/volunteer-training", token],
    queryFn: async () => {
      const response = await tenantFetch(`/api/public/volunteer-training/${encodeURIComponent(token)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load volunteer training");
      return body;
    },
    retry: false,
  });
  const attestation = useMutation({
    mutationFn: async ({ tutorialId, requirementVersion }: { tutorialId: string; requirementVersion: number }) => {
      const response = await tenantFetch(`/api/public/volunteer-training/${encodeURIComponent(token)}/attest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorialId, requirementVersion, attested: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to record attestation");
      return body;
    },
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full"><CardContent className="py-10 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-semibold">Training link unavailable</h1>
          <p className="text-muted-foreground mt-2">{(error as Error)?.message || "Ask staff to resend your training link."}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Volunteer training</h1>
          <p className="text-muted-foreground mt-2">
            Hello {data.applicantName}. Open each assigned video, then explicitly attest that you watched it.
            Opening a video alone does not record completion, and the system does not verify playback.
            Your training status does not block an invitation, account activation, or access.
          </p>
        </div>
        {data.tutorials.length === 0 && <Card><CardContent className="py-8">No training is currently assigned for tracking.</CardContent></Card>}
        {data.tutorials.map(tutorial => {
          const complete = tutorial.status === "current";
          return (
            <Card key={tutorial.id} data-testid={`public-training-${tutorial.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{tutorial.title}</CardTitle>
                    <CardDescription>Version {tutorial.requirementVersion} · {tutorial.renewalMonths}-month renewal interval</CardDescription>
                  </div>
                  <Badge variant={complete ? "default" : "secondary"}>
                    {complete ? "Completed" : tutorial.status === "due_soon" ? "Renewal available" : "Not yet attested"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tutorial.description && <p className="text-sm">{tutorial.description}</p>}
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(tutorial.youtubeUrl, "_blank", "noopener,noreferrer");
                    setOpened(previous => new Map(previous).set(tutorial.id, tutorial.requirementVersion));
                  }}
                  data-testid={`button-open-public-training-${tutorial.id}`}
                >
                  <ExternalLink className="h-4 w-4 mr-2" /> Open training video
                </Button>
                {complete && tutorial.completion ? (
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Attested {new Date(tutorial.completion.attestedAt).toLocaleDateString()} · renewal due {new Date(tutorial.completion.renewalDueAt).toLocaleDateString()}
                  </p>
                ) : (
                  <Button
                    disabled={!canAttestOpenedRequirement(opened.get(tutorial.id), tutorial.requirementVersion) || attestation.isPending}
                    onClick={() => attestation.mutate({
                      tutorialId: tutorial.id,
                      requirementVersion: opened.get(tutorial.id)!,
                    })}
                    data-testid={`button-attest-public-training-${tutorial.id}`}
                  >
                    {attestation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {tutorial.status === "due_soon"
                      ? "I attest that I watched this and renew"
                      : "I attest that I watched this training"}
                  </Button>
                )}
                {attestation.isError && <p className="text-sm text-destructive">{(attestation.error as Error).message}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}