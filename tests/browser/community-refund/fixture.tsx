import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider, useTenant } from "../../../client/src/contexts/TenantContext";
import { CommunityLedger } from "../../../client/src/pages/CommunityResaleAdminPage";
import { Link, useLocation } from "wouter";

// Exercise the production ledger -> safeguards -> fetch stack, without mounting
// unrelated dashboard services. Permissions come from the mocked ledger response.
function Fixture() {
  const [path] = useLocation();
  const { setTenantId } = useTenant();
  const scope = path.startsWith("/platform") ? "platform" : "tenant";
  return <main className="cr">
    <nav aria-label="Fixture admin workspace">
      {/* The real dashboard route gate is not mounted here. Establish tenant
          context before its query mounts, retaining the ledger and query cache. */}
      <Link href="/demo/dashboard/community-resale" onClick={() => setTenantId("demo")}>Tenant workspace</Link>{" "}
      <Link href="/platform/community-resale">Platform workspace</Link>
    </nav>
    <div data-fixture-scope={scope}><CommunityLedger scope={scope} /></div>
  </main>;
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <TenantProvider>
      <Fixture />
    </TenantProvider>
  </QueryClientProvider>,
);
