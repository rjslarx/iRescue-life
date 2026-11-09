import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');

test('Rescue Pack branding retains established public and staff links', () => {
  const app = source('client/src/App.tsx');
  assert.match(app, /path="\/vip-club" component=\{VipClubPage\}/);
  assert.match(app, /path="\/dashboard\/vip-club-members"/);
  const page = source('client/src/pages/VipClubPage.tsx');
  assert.match(page, /RESCUE PACK/);
  assert.match(page, /Welcome to the Rescue Pack!/);
  assert.doesNotMatch(page, /VIP (?:Donor Club|Monthly Donor Club|Club)/);
  const sidebar = source('client/src/components/AppSidebar.tsx');
  assert.match(sidebar, /title: "Rescue Pack Members", url: "\/dashboard\/vip-club-members"/);
  const portal = source('server/routes/vipPortal.ts');
  assert.match(portal, /\/vip-club\?vipToken=/);
  assert.match(portal, /Your Rescue Pack Giving History/);
});

test('future member emails and private game invitations use Rescue Pack', () => {
  const emails = source('server/services/vip-emails.ts');
  assert.match(emails, /Welcome to the Rescue Pack,/);
  assert.match(emails, /your Rescue Pack page/);
  assert.match(emails, /\/vip-club/);
  assert.doesNotMatch(emails, /VIP (?:Monthly Donor Club|Donor Club|Club) page/);
  const games = source('server/routes/vipGamePilot.ts');
  assert.match(games, /subject: 'Your private Rescue Pack game invitation'/);
  assert.match(games, /active, current paid membership/);
  assert.match(games, /canPlayVipGame\(config\?\.enabled === true, invite\?\.invited === true, subs\)/);
});
