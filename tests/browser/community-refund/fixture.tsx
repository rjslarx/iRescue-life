import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider } from "../../../client/src/contexts/TenantContext";
import { CommunityLedger } from "../../../client/src/pages/CommunityResaleAdminPage";

// Exercise the production ledger -> safeguards -> fetch stack, without mounting
// unrelated dashboard services. Permissions come from the mocked ledger response.
const scope = location.pathname.startsWith("/platform") ? "platform" : "tenant";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <TenantProvider>
      <main className="cr"><CommunityLedger scope={scope} /></main>
    </TenantProvider>
  </QueryClientProvider>,
);
