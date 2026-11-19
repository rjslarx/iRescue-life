import { fosterPhone } from "@shared/foster-welcome";

export function helpRecipientPhone(accountPhone?: string | null, contactPhones: string[] = []) {
  // An explicitly supplied account number remains authoritative, even if invalid.
  if (accountPhone?.trim()) return fosterPhone(accountPhone);
  const phones = [...new Set(contactPhones.map(fosterPhone).filter(Boolean))];
  // Do not guess between conflicting contact records.
  return phones.length === 1 ? phones[0] : null;
}
