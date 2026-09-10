export interface ContactFormPayloadInput {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  tags?: string;
  notes?: string;
  roles?: string[];
}

export function buildContactCreatePayload(data: ContactFormPayloadInput) {
  const { roles, tags: tagText, ...fields } = data;
  const tags = tagText
    ? tagText.split(',').map(tag => tag.trim()).filter(Boolean)
    : [];
  return {
    ...fields,
    tags,
    role: roles && roles.length > 0 ? roles : undefined,
  };
}