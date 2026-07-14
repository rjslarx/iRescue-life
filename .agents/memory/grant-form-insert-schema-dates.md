---
name: Insert-schema forms with tenantId & timestamp columns
description: Why forms validated with raw createInsertSchema silently never submit, and why timestamp columns reject ISO strings server-side.
---

Two related traps found in the Grants create/edit flow (likely lurking in other modules):

1. **Client forms must omit tenantId.** `createInsertSchema(table)` keeps `tenantId` required. If a form uses the raw insert schema in `zodResolver`, validation fails silently — the submit handler never runs, no toast, no network request, dialog just stays open. Fix: `insertSchema.omit({ tenantId: true })` for the form/resolver (server injects tenantId from `req.tenant`).

2. **Server must coerce date strings for timestamp columns.** drizzle-zod maps `timestamp()` to `z.date()`, but JSON bodies carry ISO strings, so `insertSchema.parse(req.body)` 400s on any date field. Fix pattern: `z.preprocess(v => typeof v === 'string' && v ? new Date(v) : v, z.date()).nullable().optional()` in `.extend()`, or manual `new Date()` conversion before drizzle `.set()`.

**How to apply:** Any time a create dialog "does nothing" on submit, suspect a silently-required field (tenantId) in the resolver schema. Any time a create/update with dates 400s, suspect z.date() vs ISO string.
