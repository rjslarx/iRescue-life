import { useState } from "react";
import { ExternalLink, Copy, PackageOpen } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RescueVendShareCard() {
  const { basePath } = useTenant();
  const [message, setMessage] = useState("");
  const url = `${window.location.origin}${basePath}/rescue-vend`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage("Machine link copied."); }
    catch { setMessage(`Copy this link: ${url}`); }
  };
  return <Card className="border-teal-700/25 bg-teal-50/40">
    <CardHeader><CardTitle className="flex items-center gap-2"><PackageOpen className="h-5 w-5" /> Rescue Vend</CardTitle></CardHeader>
    <CardContent><p className="mb-4 text-sm text-muted-foreground">Turn symbolic shelter supplies into real donations. Share your rescue’s interactive vending machine—no extra setup.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" />Copy link</Button><Button asChild><a href={url} target="_blank" rel="noopener noreferrer">Open machine<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
      {message && <p role="status" className="mt-3 break-all text-xs">{message}</p>}
    </CardContent>
  </Card>;
}
