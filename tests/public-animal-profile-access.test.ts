/**
 * Public animal profile authorization and data-minimization regression tests.
 *
 * Run via: scripts/run-tests.sh tests/public-animal-profile-access.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';

import { db } from '../server/db';
import { animals, tenants } from '../shared/schema';
import {
  canAccessInternalAnimalProfile,
  getAnimalForProfileRequest,
} from '../server/services/animals';

const runId = `public-animal-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
let tenantId: string;
let publicAnimalId: string;
let privateAnimalId: string;

before(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Public Animal ${runId}`, subdomain: runId.slice(0, 40) })
    .returning({ id: tenants.id });
  tenantId = tenant.id;

  const inserted = await db
    .insert(animals)
    .values([
      {
        tenantId,
        animalId: `PUB-${runId}`,
        name: 'Public Pet',
        species: 'Dog',
        breed: 'Mixed Breed',
        age: '2',
        status: 'available',
        medicalHold: false,
        microchipNumber: 'must-never-be-public',
        medicalAlertMemo: 'must-never-be-public',
        kennelLocation: 'must-never-be-public',
      },
      {
        tenantId,
        animalId: `PRV-${runId}`,
        name: 'Private Pet',
        species: 'Cat',
        breed: 'Domestic Shorthair',
        age: '4',
        status: 'adopted',
        medicalHold: false,
        microchipNumber: 'staff-only-chip',
      },
    ] as any)
    .returning({ id: animals.id, status: animals.status });

  publicAnimalId = inserted.find((animal) => animal.status === 'available')!.id;
  privateAnimalId = inserted.find((animal) => animal.status === 'adopted')!.id;
});

after(async () => {
  if (tenantId) {
    await db.delete(animals).where(inArray(animals.id, [publicAnimalId, privateAnimalId]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantId]));
  }
});

test('anonymous and non-staff roles cannot retrieve private animals', async () => {
  const viewers = [
    null,
    { roles: ['adopter'] },
    { roles: ['foster'] },
    { roles: ['volunteer'] },
    { roles: ['board_member'] },
  ];

  for (const viewer of viewers) {
    assert.equal(canAccessInternalAnimalProfile(viewer), false);
    assert.equal(await getAnimalForProfileRequest(tenantId, privateAnimalId, viewer), null);
  }
});

test('public profiles remain whitelist-only for logged-in non-staff users', async () => {
  for (const role of ['adopter', 'foster', 'volunteer']) {
    const animal = await getAnimalForProfileRequest(tenantId, publicAnimalId, { roles: [role] });
    assert.ok(animal);
    assert.equal('microchipNumber' in animal, false);
    assert.equal('medicalAlertMemo' in animal, false);
    assert.equal('kennelLocation' in animal, false);
    assert.deepEqual(Object.keys(animal).sort(), [
      'activityLevel', 'age', 'bio', 'breed', 'catFriendly', 'childFriendly',
      'colors', 'dogFriendly', 'houseTrained', 'id', 'name', 'needsFence',
      'personalityTags', 'photoAltTexts', 'photoUrls', 'profileVideos', 'revealCards', 'sex', 'shotsCurrent',
      'specialNeeds', 'species', 'status', 'superpowerBadges', 'weight',
    ]);
  }
});

test('only explicit staff roles can retrieve full internal animal records', async () => {
  for (const role of ['owner', 'admin', 'staff']) {
    assert.equal(canAccessInternalAnimalProfile({ roles: [role] }), true);
    const animal = await getAnimalForProfileRequest(tenantId, privateAnimalId, { roles: [role] });
    assert.ok(animal);
    assert.equal(animal.microchipNumber, 'staff-only-chip');
  }
});