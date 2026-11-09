import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rescuePackInvitation } from '../server/lib/rescue-pack-invitation';

test('invitation identifies rescue, membership, four games and secure access', () => {
  const link = 'https://example.org/vip-club?vipToken=test-only';
  const mail = rescuePackInvitation('Test Rescue', link);
  assert.equal(mail.subject, 'Test Rescue — your Rescue Pack games are ready');
  for (const body of [mail.html, mail.text]) {
    assert.match(body, /because you’re a Rescue Pack member supporting Test Rescue/);
    assert.match(body, /Pasture Run, Rescue Shuffle 15, Rescue Triple Match, and Rescue Merge/);
    assert.match(body, /expires in 24 hours/);
    assert.match(body, /Please do not forward/);
    assert.ok(body.includes(link));
  }
});

test('untrusted rescue names and links are escaped without corrupting plain text', () => {
  const mail = rescuePackInvitation('Pets <img src=x> & Friends\r\nInjected', 'https://example.org/?a=1&b="test"');
  assert.doesNotMatch(mail.subject, /[\r\n]/);
  assert.doesNotMatch(mail.html, /<img/);
  assert.match(mail.html, /&lt;img src=x&gt; &amp; Friends/);
  assert.match(mail.html, /a=1&amp;b=&quot;test&quot;/);
  assert.ok(mail.text.includes('https://example.org/?a=1&b="test"'));
});
