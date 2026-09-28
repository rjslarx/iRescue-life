export function votingBackgroundApplies(target: string | null | undefined, surface: "page" | "frames") {
  return (target || "both") === "both" || target === surface;
}

export function votingBackgroundPath(path: string | null | undefined, tenantId: string): string | null {
  return path && /^\/objects\/[0-9a-f-]{36}\/voting-backgrounds\/[0-9a-f-]{36}$/i.test(path) &&
    path.startsWith(`/objects/${tenantId}/voting-backgrounds/`) ? path : null;
}