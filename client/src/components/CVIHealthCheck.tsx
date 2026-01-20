import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Loader2,
  RefreshCw,
  Shield,
  Syringe,
  XCircle,
} from "lucide-react";
import { useState } from "react";

interface CviComplianceData {
  isCompliant: boolean;
  canDepart: boolean;
  transport: {
    id: string;
    departureDate: string | null;
    cviInspectionDate: string | null;
    accreditedVetName: string | null;
    accreditedVetLicenseNumber: string | null;
    importPermitNumber: string | null;
    importPermitState: string | null;
    originPhysicalAddress: string | null;
    destinationPhysicalAddress: string | null;
  };
  summary: {
    total: number;
    compliant: number;
    nonCompliant: number;
    criticalIssues: number;
    warnings: number;
  };
  animals: Array<{
    animalId: string;
    animalName: string;
    species: string;
    breed: string;
    microchipNumber: string | null;
    colorMarkings: string | null;
    dateOfBirth: string | null;
    rabiesVaccine: {
      found: boolean;
      productName: string | null;
      dateGiven: string | null;
      expirationDate: string | null;
      rabiesTagNumber: string | null;
      isExpired: boolean;
      daysUntilExpiry: number | null;
      administeredBy: string | null;
    } | null;
    issues: Array<{
      field: string;
      severity: 'critical' | 'warning';
      message: string;
    }>;
    isCompliant: boolean;
  }>;
}

interface CVIHealthCheckProps {
  transportId: string;
  enabled?: boolean;
}

export function CVIHealthCheck({ transportId, enabled = true }: CVIHealthCheckProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<CviComplianceData>({
    queryKey: [`/api/transport/events/${transportId}/cvi-compliance`],
    enabled: enabled && !!transportId,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Checking CVI compliance...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const compliancePercent = data.summary.total > 0 
    ? Math.round((data.summary.compliant / data.summary.total) * 100) 
    : 0;

  const getStatusColor = () => {
    if (data.isCompliant) return "bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700";
    if (data.canDepart) return "bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700";
    return "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700";
  };

  const getStatusIcon = () => {
    if (data.isCompliant) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (data.canDepart) return <AlertTriangle className="h-5 w-5 text-amber-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  return (
    <Card className={`${getStatusColor()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            <CardTitle className="text-base">CVI Compliance Check</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-cvi"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {getStatusIcon()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-2xl font-bold">{data.summary.compliant}</span>
              <span className="text-muted-foreground">/{data.summary.total}</span>
              <span className="text-sm text-muted-foreground ml-1">ready</span>
            </div>
            {data.summary.criticalIssues > 0 && (
              <Badge variant="destructive" data-testid="badge-critical-issues">
                <AlertCircle className="h-3 w-3 mr-1" />
                {data.summary.criticalIssues} critical
              </Badge>
            )}
            {data.summary.warnings > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {data.summary.warnings} warnings
              </Badge>
            )}
          </div>
          <div className="text-sm font-medium">{compliancePercent}%</div>
        </div>

        <Progress value={compliancePercent} className="h-2" />

        {!data.canDepart && (
          <div className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Cannot depart: {data.summary.nonCompliant} animal(s) have critical compliance issues that must be resolved.</span>
          </div>
        )}

        <Separator />

        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
              data-testid="button-expand-cvi-details"
            >
              <span className="text-sm font-medium">Animal Details</span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {data.animals.map((animal) => (
              <CVIAnimalRow key={animal.animalId} animal={animal} />
            ))}
          </CollapsibleContent>
        </Collapsible>

        {data.transport.cviInspectionDate && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <span className="font-medium">CVI Inspection:</span>{' '}
            {new Date(data.transport.cviInspectionDate).toLocaleDateString()} by{' '}
            {data.transport.accreditedVetName || 'Unknown Vet'}
            {data.transport.accreditedVetLicenseNumber && ` (Lic: ${data.transport.accreditedVetLicenseNumber})`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CVIAnimalRowProps {
  animal: CviComplianceData['animals'][0];
}

function CVIAnimalRow({ animal }: CVIAnimalRowProps) {
  const criticalIssues = animal.issues.filter(i => i.severity === 'critical');
  const warnings = animal.issues.filter(i => i.severity === 'warning');

  return (
    <div 
      className={`p-2 rounded-md border ${
        animal.isCompliant 
          ? 'bg-background border-border' 
          : criticalIssues.length > 0 
            ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
      }`}
      data-testid={`cvi-animal-row-${animal.animalId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{animal.animalName}</span>
            <span className="text-xs text-muted-foreground">
              {animal.species} - {animal.breed}
            </span>
            {animal.isCompliant ? (
              <Badge variant="outline" className="text-green-600 border-green-500 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Ready
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                {criticalIssues.length} issue(s)
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {animal.microchipNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {animal.microchipNumber.slice(-6)}...
                  </span>
                </TooltipTrigger>
                <TooltipContent>Microchip: {animal.microchipNumber}</TooltipContent>
              </Tooltip>
            )}
            {animal.colorMarkings && (
              <span className="truncate max-w-[150px]">{animal.colorMarkings}</span>
            )}
          </div>

          {animal.rabiesVaccine?.found && (
            <div className="flex items-center gap-2 mt-1 text-xs">
              <Syringe className={`h-3 w-3 ${animal.rabiesVaccine.isExpired ? 'text-red-500' : 'text-green-500'}`} />
              <span className={animal.rabiesVaccine.isExpired ? 'text-red-600' : ''}>
                Rabies: {animal.rabiesVaccine.productName || 'Unknown'} 
                {animal.rabiesVaccine.expirationDate && (
                  <span className="ml-1">
                    (exp: {new Date(animal.rabiesVaccine.expirationDate).toLocaleDateString()})
                  </span>
                )}
              </span>
              {animal.rabiesVaccine.rabiesTagNumber && (
                <Badge variant="secondary" className="text-xs h-4 px-1">
                  Tag #{animal.rabiesVaccine.rabiesTagNumber}
                </Badge>
              )}
            </div>
          )}

          {animal.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {animal.issues.map((issue, idx) => (
                <div 
                  key={idx} 
                  className={`text-xs flex items-start gap-1 ${
                    issue.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {issue.severity === 'critical' 
                    ? <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    : <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  }
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CVIStatusBadge({ 
  isCompliant, 
  criticalCount, 
  warningCount 
}: { 
  isCompliant: boolean; 
  criticalCount: number; 
  warningCount: number;
}) {
  if (isCompliant) {
    return (
      <Badge variant="outline" className="text-green-600 border-green-500">
        <CheckCircle className="h-3 w-3 mr-1" />
        CVI Ready
      </Badge>
    );
  }

  if (criticalCount > 0) {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        {criticalCount} CVI issue(s)
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-amber-600 border-amber-500">
      <AlertTriangle className="h-3 w-3 mr-1" />
      {warningCount} warning(s)
    </Badge>
  );
}
