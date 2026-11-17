---
name: VIP game perk scope
description: Rescue games are existing VIP perks, with a private pilot before public launch.
---
Rescue-themed games should be a bonus of the existing VIP club, not a separate paid game product. Start simple and private; do not roll out publicly without the owner's decision.

The membership's public name is **Rescue Pack** for all tenants. Treat this as branding only; retain `/vip-club` and existing technical identifiers, membership, billing, and invitation rules.

**Why:** The owner chose Rescue Pack and explicitly requested a wording-only change rather than complicating the existing setup.

**How to apply:** Use Rescue Pack in new UI and communication copy. Do not migrate memberships, change access, or rename routes just to match the branding.

**Why:** The owner confirmed this approach while evaluating whether games could generate revenue for rescue tenants, rather than committing to a public gaming offering.

**How to apply:** The owner expanded the private pilot to four games total, supplying the game ZIPs individually. Avoid new subscriptions, paid continues, public rollout, and a full arcade in this scope.

The animal-photo sliding puzzle should use random available animals belonging to the player's rescue, not generic sample pets or another rescue's animals.

**Why:** The owner specifically requested rotating rescue-animal photos to keep the puzzle fresh.

Rescue Merge should reshuffle animal identities on each restarted round, not only when opening the game.

**Why:** The owner explicitly requested fresh animal selections when replaying.

**How to apply:** Keep selection rescue-specific and preserve the zoomed bubble crop; random selections may repeat animals.

Staff and volunteers at game-enabled rescues also receive dashboard game access without VIP membership or a donor invitation. This does not expand public donor access.

Haseya’s may offer the 15-puzzle free to the public, with an optional donate action after completion and a saved solved-puzzle image for manual Facebook comments. Haseya’s selects winners from replies outside the app.

**Why:** The owner explicitly requested this narrow public exception; it does not authorize public access to other games or tenants.

**How to apply:** Donation must not be required for participation or affect chances. Keep winner selection and Facebook comment submission manual, and preserve the existing member/team gates elsewhere.

**Why:** The owner explicitly expanded the private pilot to rescue teams as a perk, while keeping rescue-level enablement.

**How to apply:** Keep team play separate from donor participation metrics and preserve existing invited-VIP eligibility.

## Production sandbox verification
Validate embedded games under the parent page's production Content Security Policy, not only an isolated iframe or development page.

**Why:** A srcdoc iframe inherits the parent's policy; its own CSP can tighten but cannot relax that policy. Development disables the parent CSP, so an isolated game can pass while the published preview cannot load its engine.

**How to apply:** Keep engine allowances pinned to specific resources and retain the opaque sandbox and integrity checks. Include the production parent's script restrictions in game-loading regression tests.

For photo-based Phaser games in the opaque sandbox, use Canvas rendering and image textures without pixel readback, not WebGL or CanvasTexture pixel caches.

**Why:** Public rescue images can display cross-origin without CORS but taint canvases; WebGL uploads and pixel readback fail even though the same photos work in a plain canvas.

**How to apply:** Load public photos with plain Image and no-referrer, retain the sandbox, and test image loading without an Access-Control-Allow-Origin response header.
