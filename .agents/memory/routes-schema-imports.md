---
name: routes.ts schema import gotcha
description: Why "X is not defined" ReferenceErrors happen in server/routes.ts handlers, and how to fix them.
---

server/routes.ts pulls Drizzle tables from `@shared/schema` two different ways, and they don't cover each other:
- A single giant top-level `import { ... } from "@shared/schema"` line near the top.
- Per-handler dynamic imports like `const { subscriptions } = await import('@shared/schema')` (sometimes aliased, e.g. `subscriptions: subs`).

**The trap:** a handler that references a table at module scope (e.g. `.from(subscriptions)`) ONLY works if that table is in the top-level import. If it isn't, the code still compiles/boots fine (tsx is lenient, the symbol just resolves to nothing) and only blows up at request time with `ReferenceError: <table> is not defined`. Other handlers can use the same table happily because they pulled it in via a local dynamic import.

**How to apply:** When you see a runtime `<table> is not defined` from a routes.ts endpoint, check whether that table name is in the top-level `@shared/schema` import. The fix is usually to add it there. Adding a table to the top-level import is safe even when other handlers locally `const { table } = await import(...)` — those are block-scoped and simply shadow the module binding (no TDZ/redeclaration error).

**Why:** This bit the VIP cancel + refund handlers — `subscriptions` was referenced at module scope but missing from the top-level import, so canceling a VIP subscription threw "subscriptions is not defined" in production while booting cleanly.
