export const SEND_HOLD_HARMLESS_PERMISSION = {
  pageId: "send-hold-harmless",
  displayName: "Send Hold Harmless",
  description: "Email or text a Hold Harmless agreement to a recipient. Does not grant volunteer management or pipeline access.",
};

// Mirror requireRoleOrPageAccess(['send-hold-harmless', 'volunteers',
// 'volunteer-pipeline'], 'admin', 'staff'), including its role hierarchy.
// Role-based page visibility alone is not permission to send.
export function canSendHoldHarmless(
  activeRole: string | undefined,
  grants: readonly { pageId: string }[],
): boolean {
  if (!activeRole) return false;
  if (["platform_admin", "owner", "admin", "board_member", "staff"].includes(activeRole)) {
    return true;
  }
  return grants.some(({ pageId }) =>
    ["send-hold-harmless", "volunteers", "volunteer-pipeline"].includes(pageId),
  );
}

export function holdHarmlessActionIds(
  configuredIds: readonly string[],
  activeRole: string | undefined,
  grants: readonly { pageId: string }[],
): string[] {
  const ids = configuredIds.filter(id => id !== "send-hold-harmless");
  if (!canSendHoldHarmless(activeRole, grants)) return ids;
  const hasDedicatedGrant = grants.some(p => p.pageId === SEND_HOLD_HARMLESS_PERMISSION.pageId);
  if (hasDedicatedGrant || configuredIds.includes("send-hold-harmless")) {
    // An individual capability must remain reachable even when tenant favorites
    // omit it. This exception must never append any other action.
    return [...ids, "send-hold-harmless"];
  }
  return ids;
}
