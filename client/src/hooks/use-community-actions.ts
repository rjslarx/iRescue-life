import { useState } from "react";
import { communityRequest, useRefreshCommunity } from "@/hooks/use-community-resale";

export function useCommunityAction(scope: "public" | "tenant" | "platform" = "public") {
  const refresh = useRefreshCommunity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  async function run<T = any>(path: string, method = "POST", body: any = {}, success = "Saved.") {
    setBusy(true); setError(null); setMessage("");
    try {
      const result = await communityRequest<T>(path, method, body, scope);
      await refresh(); setMessage(success);
      return result;
    } catch (e) { setError(e); return undefined; }
    finally { setBusy(false); }
  }
  return { run, busy, error, message, setError, setMessage };
}
