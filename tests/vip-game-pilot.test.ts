import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasGameMembership, canPlayVipGame } from '../server/lib/vip-game-policy';
import { pastureGameDocument } from '../server/lib/pasture-game-document';

const now = Date.parse('2026-11-09T12:00:00Z');
const currentPeriodEnd = new Date(now + 86400000);
const active = [{ status: 'active', currentPeriodEnd }];

test('pilot requires enabled rescue AND invitation AND eligible subscription', () => {
  assert.equal(canPlayVipGame(true, true, active, now), true);
  assert.equal(canPlayVipGame(false, true, active, now), false);
  assert.equal(canPlayVipGame(true, false, active, now), false);
  assert.equal(canPlayVipGame(true, true, [], now), false);
});
for (const status of ['canceled', 'past_due', 'incomplete', 'trialing', 'unpaid', 'paused', 'incomplete_expired']) {
  test(`${status} cannot grant gameplay even with a future period date`, () => {
    assert.equal(hasGameMembership([{ status, currentPeriodEnd }], now), false);
  });
}
for (const end of [null, 'invalid', new Date(now), new Date(now - 1)]) {
  test(`missing, invalid or ended subscription period fails closed: ${end}`, () => {
    assert.equal(hasGameMembership([{ status: 'active', currentPeriodEnd: end }], now), false);
  });
}
test('scheduled cancellation keeps access only until active paid period ends', () => {
  assert.equal(hasGameMembership(active, now), true);
  assert.equal(hasGameMembership(active, currentPeriodEnd.getTime()), false);
});
test('an older canceled subscription does not block another active subscription', () => {
  assert.equal(hasGameMembership([{ status: 'canceled', currentPeriodEnd }, ...active], now), true);
});
test('isolated game document is complete and has no payment hooks or parent storage', async () => {
  const html = await pastureGameDocument();
  assert.match(html, /VIP MEMBER PERK/);
  assert.match(html, /pasture-ready/);
  assert.match(html, /pasture-start/);
  assert.match(html, /PLAY AGAIN/);
  assert.match(html, /integrity="sha384-/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /PAYMENT_SUCCESS|OPEN_RESCUE_CHECKOUT|amountCents|localStorage|INSERT COIN|FREE PLAY/);
  assert.doesNotMatch(html, /src="js\/|href="css\//);
  assert.equal((html.match(/<script src=/g) || []).length, 1);
});
test('game route boundaries remain private and authorized, never public static assets', async () => {
  const source = await readFile('server/routes/vipGamePilot.ts', 'utf8');
  assert.match(source, /adminGameRouter.use\(requireAuth, requirePlatformAdmin\)/);
  assert.equal((source.match(/await authVipDonor\(req, res\)/g) || []).length, 3);
  assert.equal((source.match(/await eligible\(auth.tenantId, auth.donorId\)/g) || []).length, 3);
  assert.match(source, /isPublic: false/);
  assert.match(source, /Cache-Control', 'no-store'/);
  const player = await readFile('client/src/components/vip/PrivateGamePlayer.tsx', 'utf8');
  assert.match(player, /sandbox="allow-scripts"/);
  assert.doesNotMatch(player, /sandbox="[^"]*allow-same-origin/);
  assert.match(player, /event.source !== iframe.current.contentWindow/);
  assert.match(player, /60000/);
});
