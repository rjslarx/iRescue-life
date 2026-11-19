import { defaultHelpSettings, type HelpSettings } from "@shared/rescue-help";

// Explicitly requested tenant default, using verified existing record IDs.
// Saved settings override it, including null (no fallback texts). Never look up
// a similarly named person or grant inbox membership automatically.
const haseyasId = "3a4c2321-6a54-41a4-acf3-a7f2ffe0c051";
const haseyasGeneralRecipient = "f4436db3-eac8-457c-a674-69f4881717ee";

export function effectiveHelpSettings(tenantId: string, data?: Partial<HelpSettings> | null): HelpSettings {
  return {
    ...defaultHelpSettings,
    ...(tenantId === haseyasId ? { generalAssigneeId: haseyasGeneralRecipient } : {}),
    ...data,
  };
}
