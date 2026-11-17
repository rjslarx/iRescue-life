import { ExternalLink, PackageOpen } from "lucide-react";
import { RESALE_PUBLIC_ENABLED } from "@shared/resale-availability";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useResaleConfig } from "@/hooks/use-rescue-resale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ResaleToolkitCard() {
  const config = useResaleConfig();
  const { basePath } = useTenant();
  if (!RESALE_PUBLIC_ENABLED || !config.data?.enabled) return null;
  return <Card className="border-[#bacbb8] bg-[#eff3e9] text-[#253e36]">
    <CardHeader><CardTitle className="flex items-center gap-2"><PackageOpen className="h-5 w-5" />Rescue Resale</CardTitle></CardHeader>
    <CardContent><p className="mb-4 text-sm">Good belongings, another beginning. Review neighbor-donated listings, arrange pickup windows, and track resale proceeds. Donors keep items at home until pickup.</p>
      <div className="flex flex-wrap gap-2"><Button asChild><Link href="/dashboard/rescue-resale">Manage resale</Link></Button><Button variant="outline" asChild><a href={`${basePath}/rescue-resale`} target="_blank" rel="noopener noreferrer">Open storefront<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
    </CardContent>
  </Card>;
}
