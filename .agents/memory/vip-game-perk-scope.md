---
name: VIP game perk scope
description: Rescue games are existing VIP perks, with a private pilot before public launch.
---
Rescue-themed games should be a bonus of the existing VIP club, not a separate paid game product. Start simple and private; do not roll out publicly without the owner's decision.

**Why:** The owner confirmed this approach while evaluating whether games could generate revenue for rescue tenants, rather than committing to a public gaming offering.

**How to apply:** The owner wants to test three games total in this private pilot, supplying the game ZIPs individually. Avoid new subscriptions, paid continues, public rollout, and a full arcade in this scope.

The animal-photo sliding puzzle should use random available animals belonging to the player's rescue, not generic sample pets or another rescue's animals.

**Why:** The owner specifically requested rotating rescue-animal photos to keep the puzzle fresh.

## Production sandbox verification
Validate embedded games under the parent page's production Content Security Policy, not only an isolated iframe or development page.

**Why:** A srcdoc iframe inherits the parent's policy; its own CSP can tighten but cannot relax that policy. Development disables the parent CSP, so an isolated game can pass while the published preview cannot load its engine.

**How to apply:** Keep engine allowances pinned to specific resources and retain the opaque sandbox and integrity checks. Include the production parent's script restrictions in game-loading regression tests.
