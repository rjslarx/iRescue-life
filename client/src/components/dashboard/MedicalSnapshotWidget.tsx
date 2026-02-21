import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Stethoscope, ChevronRight, Syringe, ClipboardCheck, Pill, FileSearch, Building2, Home } from "lucide-react";

interface LocationCount {
  shelter: number;
  foster: number;
  total: number;
}

interface MedicalSnapshot {
  medsDueToday: LocationCount;
  needsVetting: LocationCount;
  surgeryPending: LocationCount;
  vetVisitsToReview: LocationCount;
}

function smartLocationParam(counts: LocationCount): string {
  if (counts.foster > 0 && counts.shelter === 0) return "foster";
  if (counts.shelter > 0 && counts.foster === 0) return "shelter";
  if (counts.foster >= counts.shelter) return "foster";
  return "shelter";
}

interface KpiTileProps {
  icon: React.ElementType;
  label: string;
  counts: LocationCount;
  href: string;
  activeColor: string;
  activeTextColor: string;
  testId: string;
}

function KpiTile({ icon: Icon, label, counts, href, activeColor, activeTextColor, testId }: KpiTileProps) {
  const active = counts.total > 0;
  return (
    <Link href={href}>
      <div
        className={`flex flex-col items-center justify-center p-3 rounded-md cursor-pointer hover-elevate min-h-[7.5rem] ${
          active ? activeColor : "bg-muted/50"
        }`}
        data-testid={testId}
      >
        <Icon className={`h-5 w-5 mb-1 ${active ? activeTextColor : "text-muted-foreground"}`} />
        <div className={`text-xl font-bold ${active ? activeTextColor : "text-foreground"}`} data-testid={`text-${testId}-count`}>
          {counts.total}
        </div>
        <p className="text-xs text-muted-foreground text-center">{label}</p>
        {counts.total > 0 && (counts.shelter > 0 || counts.foster > 0) && (
          <div className="flex items-center gap-2 mt-1.5" data-testid={`text-${testId}-breakdown`}>
            {counts.shelter > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Building2 className="h-2.5 w-2.5" />
                {counts.shelter}
              </span>
            )}
            {counts.foster > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Home className="h-2.5 w-2.5" />
                {counts.foster}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function MedicalSnapshotWidget() {
  const { data, isLoading } = useQuery<MedicalSnapshot>({
    queryKey: ["/api/dashboard/medical-snapshot"],
  });

  if (isLoading) {
    return (
      <Card data-testid="card-medical-snapshot-widget">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Medical Pipeline</CardTitle>
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const meds = data?.medsDueToday || { shelter: 0, foster: 0, total: 0 };
  const vetting = data?.needsVetting || { shelter: 0, foster: 0, total: 0 };
  const surgery = data?.surgeryPending || { shelter: 0, foster: 0, total: 0 };
  const vetVisits = data?.vetVisitsToReview || { shelter: 0, foster: 0, total: 0 };

  const medsLoc = smartLocationParam(meds);
  const vettingLoc = smartLocationParam(vetting);
  const surgeryLoc = smartLocationParam(surgery);
  const vetLoc = smartLocationParam(vetVisits);

  return (
    <Card data-testid="card-medical-snapshot-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">Medical Pipeline</CardTitle>
        <Stethoscope className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiTile
            icon={Pill}
            label="Meds Due Today"
            counts={meds}
            href={`/dashboard/medical-pipeline?location=${medsLoc}&tab=treatments`}
            activeColor="bg-primary/10 border border-primary/20"
            activeTextColor="text-primary"
            testId="tile-meds-due-today"
          />
          <KpiTile
            icon={ClipboardCheck}
            label="Needs Vetting"
            counts={vetting}
            href={`/dashboard/medical-pipeline?location=${vettingLoc}&tab=intake`}
            activeColor="bg-primary/10 border border-primary/20"
            activeTextColor="text-primary"
            testId="tile-needs-vetting"
          />
          <KpiTile
            icon={Syringe}
            label="Surgery Pending"
            counts={surgery}
            href={`/dashboard/medical-pipeline?location=${surgeryLoc}&tab=surgery&section=scheduled-surgeries`}
            activeColor="bg-primary/10 border border-primary/20"
            activeTextColor="text-primary"
            testId="tile-surgery-pending"
          />
          <KpiTile
            icon={FileSearch}
            label="Visits to Review"
            counts={vetVisits}
            href={`/dashboard/medical-pipeline?location=${vetLoc}&tab=triage`}
            activeColor="bg-amber-500/10 border border-amber-500/20"
            activeTextColor="text-amber-600 dark:text-amber-400"
            testId="tile-vet-visits-review"
          />
        </div>

        <Link href="/dashboard/medical-pipeline">
          <Button variant="ghost" size="sm" className="w-full" data-testid="link-view-medical">
            View Medical Pipeline
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
