import assert from 'node:assert/strict';
import test from 'node:test';

import { catSafetyAddendumAnswersSchema } from '../shared/schema';
import {
  DEFAULT_CAT_SAFETY_ADDENDUM_HTML,
  catSafetyEvidenceHtml,
  renderCatSafetyAddendum,
  sanitizeCatSafetyAddendumHtml,
} from '../server/services/cat-safety-addendum';
import { buildDirectAgreementAcl } from '../server/services/adoption-direct-agreement';

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

const completeAnswers = {
  residentCatDescription: 'Whiskers, orange tabby',
  residentCatHousing: 'Upstairs bedroom with a latched solid door',
  primaryBarrier: 'Latched solid-core door',
  secondaryBarrier: 'Secured hallway gate',
  transitionsPlan: 'Dog is leashed and crated before any exterior door opens',
  responsiblePerson: 'Primary adopter',
  emergencyPlan: 'Secure the dog, check the cat, and call the rescue immediately',
  adopter1Initials: 'JS',
};

test('cat safety answers require all six separation-plan items', () => {
  assert.equal(catSafetyAddendumAnswersSchema.safeParse(completeAnswers).success, true);
  assert.equal(catSafetyAddendumAnswersSchema.safeParse({
    ...completeAnswers,
    residentCatHousing: '',
  }).success, false);
});

test('optional co-adopter evidence must be complete and use a safe raster data URI', () => {
  assert.equal(catSafetyAddendumAnswersSchema.safeParse({
    ...completeAnswers,
    coAdopter: {
      name: 'Jordan Smith',
      phone: '555-0100',
      initials: 'JS',
      signatureImageData: SIGNATURE,
    },
  }).success, true);

  assert.equal(catSafetyAddendumAnswersSchema.safeParse({
    ...completeAnswers,
    coAdopter: {
      name: 'Jordan Smith',
      phone: '',
      initials: 'JS',
      signatureImageData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    },
  }).success, false);
});

test('the editable default is rescue-neutral and renders the animal and final answers', () => {
  const rendered = renderCatSafetyAddendum(DEFAULT_CAT_SAFETY_ADDENDUM_HTML, {
    animal_name: 'Buddy',
    organization_name: 'Safe Paws Rescue',
    adopter_name: 'Jamie Smith',
    adopter_email: 'jamie@example.com',
    adopter_phone: '555-0199',
    adopter_address: '123 Main Street',
    contract_date: 'September 7, 2026',
  }, completeAnswers);

  assert.match(rendered, /Buddy/);
  assert.match(rendered, /Safe Paws Rescue/);
  assert.match(rendered, /Whiskers, orange tabby/);
  assert.match(rendered, /permanently and completely separated/);
  assert.doesNotMatch(rendered, /Johnny Cash|Haseya|Louisiana/);
  assert.doesNotMatch(rendered, /\{\{[^}]+\}\}/);
});

test('template and signer-controlled values are sanitized before review or evidence output', () => {
  const sanitized = sanitizeCatSafetyAddendumHtml(
    '<p onclick="alert(1)">Safe wording</p><script>alert(2)</script>',
  );
  assert.match(sanitized, /Safe wording/);
  assert.doesNotMatch(sanitized, /onclick|script|alert\(2\)/);

  const evidence = catSafetyEvidenceHtml({
    ...completeAnswers,
    emergencyPlan: '<img src=x onerror=alert(1)>',
  }, new Date('2026-09-07T12:00:00Z'), SIGNATURE);
  assert.match(evidence, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(evidence, /<img src=x/);
  assert.match(evidence, /Primary adopter signature/);
});

test('direct signed agreement PDFs receive a tenant-private object policy', () => {
  assert.deepEqual(buildDirectAgreementAcl('tenant-123'), {
    owner: 'tenant-123',
    tenantId: 'tenant-123',
    visibility: 'private',
  });
});