import assert from 'node:assert/strict';
import test from 'node:test';

import { formatVolunteerShortageStatus } from '../server/services/volunteer-recruitment-sms';

test('shows both shift capacity and remaining volunteer shortage', () => {
  assert.equal(formatVolunteerShortageStatus(1, 2), '1/2 signed up; need 1 more');
  assert.equal(formatVolunteerShortageStatus(0, 2), '0/2 signed up; need 2 more');
});

test('never reports a negative shortage', () => {
  assert.equal(formatVolunteerShortageStatus(3, 2), '3/2 signed up; need 0 more');
});