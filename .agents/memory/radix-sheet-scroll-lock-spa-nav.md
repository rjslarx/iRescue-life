---
name: Radix Sheet/Dialog scroll-lock leak on SPA nav
description: Modal Radix Sheet/Dialog can leave the destination page unscrollable when a nav link inside it navigates during close (mobile Safari).
---

# Radix modal scroll-lock leaks across SPA navigation

A modal Radix `Dialog`/`Sheet` locks the page by putting `overflow:hidden` +
`pointer-events:none` on `<body>` (via react-remove-scroll). That lock is only
released after the close animation completes and the content unmounts.

**Symptom:** tapping a wouter `<Link>` *inside* an open mobile nav Sheet
navigates (SPA) while the Sheet is still animating closed. On mobile browsers
(notably iOS Safari) the close cleanup is skipped, so `<body>` stays locked and
the destination page can't be scrolled. Loading the same URL directly is fine
(the Sheet never opened). Chromium/Playwright does NOT reproduce it — cleanup
runs there — so trust the user's device report over a green headless test.

**Fix used:** set `modal={false}` on the mobile nav Sheet (`PublicHeader`). A
nav menu doesn't need to lock background scroll, and non-modal means no body
lock is ever applied, so there's nothing to leak.

**Why:** eliminating the lock mechanism is more reliable than trying to
force-clear leaked body styles/`data-scroll-locked` after the fact.

**How to apply:** for any Sheet/Dialog whose items trigger client-side
navigation while open, prefer `modal={false}`. If modal behavior (focus trap /
background-scroll lock) is required, add a route-change guard that force-clears
the body lock instead.

## Related symptom: modal DonationForm not scrolling (different cause)
"Donate won't scroll" can also mean a tall form inside a modal, NOT a scroll-lock
leak. Several public buttons ("Donate Now" hero, animal "Sponsor" buttons) do NOT
navigate to /donate — they open a Radix Dialog rendering the tall `DonationForm`
(Home.tsx, PublicAnimalProfilePage.tsx, AvailableAnimalsPage.tsx). The full
/donate page scrolls fine, but the modal clipped its bottom on mobile.
**Fix:** DialogContent for tall forms needs `max-h-[90dvh] overflow-y-auto`
(prefer dvh over vh for mobile browser chrome). If a user says the donate page
won't scroll only from a button (not direct URL), check whether that button opens
a modal vs navigates.
