import { useQuery } from "@tanstack/react-query";
import PublicHeader from "@/components/PublicHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Shield, 
  Award,
  Calendar,
  Building,
} from "lucide-react";
import type { Tenant, ComplianceDocument } from "@shared/schema";

interface TransparencySettings {
  enabled: boolean;
  publicPageEnabled: boolean;
  ein: string;
  candidSealLevel: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
}

export default function PublicTransparencyPage() {
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const { data: transparencyData, isLoading } = useQuery<{ 
    settings: TransparencySettings;
    documents: ComplianceDocument[];
  }>({
    queryKey: ['/api/compliance/public/transparency'],
  });

  const tenant = tenantData?.tenant;
  const rescueName = tenant?.name || "Animal Rescue";
  const settings = transparencyData?.settings;
  const documents = transparencyData?.documents || [];

  useSEO({
    title: `Transparency | ${rescueName}`,
    description: `View ${rescueName}'s nonprofit documents, financial reports, and organizational transparency information. We believe in complete openness with our donors and supporters.`,
    siteName: rescueName,
  });

  const getCandidSealInfo = (level: string | null) => {
    switch (level) {
      case 'platinum':
        return { label: 'Platinum', color: 'bg-slate-700 text-white', description: 'Highest level of transparency' };
      case 'gold':
        return { label: 'Gold', color: 'bg-yellow-500 text-black', description: 'Excellent transparency' };
      case 'silver':
        return { label: 'Silver', color: 'bg-gray-400 text-black', description: 'Strong transparency' };
      case 'bronze':
        return { label: 'Bronze', color: 'bg-amber-700 text-white', description: 'Good transparency' };
      default:
        return null;
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case '990':
        return <FileText className="h-5 w-5" />;
      case 'annual_report':
        return <Calendar className="h-5 w-5" />;
      case 'financial_statement':
        return <Building className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case '990':
        return 'IRS Form 990';
      case 'annual_report':
        return 'Annual Report';
      case 'financial_statement':
        return 'Financial Statement';
      case 'audit_report':
        return 'Audit Report';
      case 'other':
        return 'Document';
      default:
        return type;
    }
  };

  const sealInfo = getCandidSealInfo(settings?.candidSealLevel || null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Skeleton className="h-10 w-10 mx-auto mb-4 rounded-full" />
              <Skeleton className="h-8 w-48 mx-auto mb-4" />
              <Skeleton className="h-6 w-96 mx-auto" />
            </div>
            <Skeleton className="h-32 w-full mb-8 rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!settings?.publicPageEnabled) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Transparency Page Not Available</h2>
              <p className="text-muted-foreground">
                This organization has not yet enabled their public transparency page.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader rescueName={rescueName} logoUrl={tenant?.logoUrl || undefined} />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Transparency</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              We believe in complete transparency with our donors and supporters. 
              Below you'll find our financial documents and organizational information.
            </p>
          </div>

          {settings?.ein && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Organization Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Organization Name</p>
                    <p className="font-medium">{rescueName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">EIN (Tax ID)</p>
                    <p className="font-medium font-mono">{settings.ein}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {sealInfo && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Candid Seal of Transparency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Badge className={sealInfo.color}>
                    {sealInfo.label} Seal
                  </Badge>
                  <p className="text-muted-foreground">{sealInfo.description}</p>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  The Candid Seal of Transparency indicates that this organization has shared 
                  important information with the public, allowing donors to make informed giving decisions.
                </p>
                <Button variant="outline" className="mt-4" asChild>
                  <a 
                    href={`https://www.guidestar.org/profile/${settings.ein?.replace(/-/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on GuideStar
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents
              </CardTitle>
              <CardDescription>
                Our publicly available nonprofit documents and reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No public documents available yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                          {getDocumentIcon(doc.documentType)}
                        </div>
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              {getDocumentTypeLabel(doc.documentType)}
                            </Badge>
                            {doc.fiscalYear && (
                              <span>FY {doc.fiscalYear}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {doc.fileUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a 
                            href={doc.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            data-testid={`download-document-${doc.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Have questions about our finances or operations? 
              <a href="/contact" className="text-primary hover:underline ml-1">
                Contact us
              </a>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t mt-12 py-8 text-center text-sm text-muted-foreground">
        <p>{tenant?.footerText || `${rescueName}. Supporting animals in need.`}</p>
      </footer>
    </div>
  );
}
