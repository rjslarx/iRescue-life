---
name: Wouter query parameters
description: Prevent query-driven staff pages from ignoring deep-linked tabs and filters.
---

Wouter's `useLocation` value does not include the URL query string. Components that choose a tab, filter, or section from a query parameter must read it with `useSearch`.

**Why:** A notification correctly navigated to a URL containing a tab query, but the destination parsed the value from `useLocation`. The page silently fell back to its default tab, so the linked action queue never mounted or fetched its data even though the browser URL looked correct.

**How to apply:** Use `useLocation` for path navigation and `useSearch` with `URLSearchParams` for query state. Test query-driven routes by opening or reloading the exact deep-link URL without manually selecting the destination tab.