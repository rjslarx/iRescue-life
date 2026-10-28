import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMedicalDeadlines, validateMedicalDeadlines } from '../shared/adoption-medical-dates';
import { db } from '../server/db';
import * as schema from '../shared/schema';
import { createCheckoutSession, finalizeAdoption } from '../server/services/adoption-checkout';

test('medical evidence ignores placeholders, future doses and invalid intervals, retaining overdue records', () => {
  assert.deepEqual(resolveMedicalDeadlines([
    { name: 'Rabies', administeredAt: '2025-01-01', expiresAt: '2028-01-01' },
    { name: 'Rabies', administeredAt: '2026-01-01', expiresAt: '2027-01-01', administeredBy: 'Set at adoption' },
    { name: 'Rabies', administeredAt: '2029-01-01', expiresAt: '2030-01-01' },
    { name: 'Rabies', administeredAt: '2026-01-01', expiresAt: '2024-01-01' },
    { name: 'DA2PP', administeredAt: '2024-01-01', expiresAt: '2025-01-01' },
  ].map(record => ({ ...record, status: 'given', category: 'vaccine' })), new Date('2026-10-28')),
  { rabiesDueDate: '2028-01-01', dhppDueDate: '2025-01-01' });
  assert.throws(() => validateMedicalDeadlines({ rabiesDueDate: '2026-02-30' }, {}, '2026-10-28', true), /valid calendar/);
});

function chain(rows: unknown[] = []) {
  const query: any = Object.assign(Promise.resolve(rows), {
    from: () => query, where: () => query, limit: () => query,
    orderBy: () => query, returning: () => query, set: () => query, leftJoin: () => query,
  });
  return query;
}

test('create requires confirmation for conflicts and overdue dates, including waived checkouts', async t => {
  t.mock.method(db, 'select', () => {
    const query = chain();
    query.from = (table: unknown) => chain(
      table === schema.applications ? [{ id: 'application' }] :
      table === schema.animals ? [{ id: 'animal' }] :
      table === schema.tenants ? [{ timezone: 'America/Chicago', subscriptionTier: 'free' }] :
      table === schema.vaccineRecords ? [{ name: 'Rabies', administeredAt: '2020-01-01', expiresAt: '2090-01-01' }] : [],
    );
    return query;
  });
  const inserted: any[] = [];
  t.mock.method(db, 'insert', () => ({
    values: (value: any) => { inserted.push(value); return chain([{ id: 'session', ...value }]); },
  }) as any);
  for (const isFeeWaived of [false, true]) {
    for (const deadline of ['2001-01-01', '2089-01-01']) {
      const data = { applicationId: 'application', animalId: 'animal', baseFee: '200',
        staffInitiatedBy: 'staff', isFeeWaived, medicalDueDates: { rabiesDueDate: deadline } };
      const before = inserted.length;
      await assert.rejects(createCheckoutSession('tenant', data), /Confirm medical deadlines/);
      assert.equal(inserted.length, before);
      const { session } = await createCheckoutSession('tenant', { ...data, medicalDatesConfirmed: true });
      assert.equal(session.medicalDueDates?.rabiesDueDate, deadline);
      assert.equal((session.metadata as any).medicalDateReview.confirmed, true);
      assert.equal(session.baseFee, isFeeWaived ? '0' : '200');
    }
  }
});

test('only given vaccines and prevention products with matching coverage provide deadlines', () => {
  const records = [
    { name: 'Rabies', category: 'vaccine', status: 'pending', administeredAt: '2026-01-01', expiresAt: '2029-01-01' },
    { name: 'Rabies antibody test', category: 'test', status: 'given', administeredAt: '2026-01-01', expiresAt: '2027-01-01' },
    { name: 'Heartworm test', category: 'test', status: 'given', administeredAt: '2026-01-01', expiresAt: '2027-01-01', coversHeartworm: true },
    { name: 'Simparica Trio', category: 'parasite_prevention', status: 'given', administeredAt: '2026-01-01', expiresAt: '2026-02-01', coversHeartworm: true, coversFleaTick: true },
    { name: 'Bravecto', category: 'parasite_prevention', status: 'given', administeredAt: '2026-01-15', expiresAt: '2026-04-15', coversHeartworm: false, coversFleaTick: true },
    { name: 'Simparica Trio', category: 'parasite_prevention', status: 'pending', administeredAt: '2026-02-01', expiresAt: '2026-03-01', coversHeartworm: true, coversFleaTick: true },
  ];
  const evidence = resolveMedicalDeadlines(records, new Date('2026-10-28'));
  assert.deepEqual(evidence, { heartwormDueDate: '2026-02-01', fleaTickDueDate: '2026-04-15' });
  assert.throws(() => validateMedicalDeadlines({ heartwormDueDate: '2027-01-01' }, evidence, '2026-10-28'), /differs/);
  assert.doesNotThrow(() => validateMedicalDeadlines({ heartwormDueDate: '2026-02-01' }, evidence, '2026-10-28', true));
});

test('checkout creation uses given product coverage rather than pending protocols or tests', async t => {
  t.mock.method(db, 'select', () => {
    const query = chain();
    query.from = (table: unknown) => chain(
      table === schema.applications ? [{ id: 'application' }] :
      table === schema.animals ? [{ id: 'animal' }] :
      table === schema.tenants ? [{ timezone: 'America/Chicago' }] :
      table === schema.preventativeCareRecords ? [
        { name: 'Rabies', category: 'vaccine', status: 'pending', administeredAt: '2020-01-01', expiresAt: '2090-01-01' },
        { name: 'Heartworm test', category: 'test', status: 'given', administeredAt: '2020-01-01', expiresAt: '2090-01-01' },
        { name: 'Simparica Trio', category: 'parasite_prevention', status: 'given', administeredAt: '2020-01-01', expiresAt: '2089-01-01', coversHeartworm: true, coversFleaTick: true },
      ] : [],
    );
    return query;
  });
  t.mock.method(db, 'insert', () => ({
    values: (value: any) => chain([{ id: 'session', ...value }]),
  }) as any);
  const data = { applicationId: 'application', animalId: 'animal', staffInitiatedBy: 'staff', baseFee: '0',
    isFeeWaived: true, medicalDueDates: { rabiesDueDate: '2090-01-01', heartwormDueDate: '2090-01-01' } };
  await assert.rejects(createCheckoutSession('tenant', data), /Heartworm prevention.*differs/);
  const { session } = await createCheckoutSession('tenant', { ...data, medicalDatesConfirmed: true });
  assert.deepEqual((session.metadata as any).medicalDateReview.evidence,
    { heartwormDueDate: '2089-01-01', fleaTickDueDate: '2089-01-01' });
  assert.equal((session.metadata as any).medicalDateReview.warnings.length, 1);
});

test('fee-waived completion preserves deliberate overdue and conflicting signed deadlines without changing doses', async t => {
  for (const deadline of ['2001-01-01', '2089-01-01']) {
    const session = { id: 'session', tenantId: 'tenant', animalId: 'animal', applicationId: 'application',
      status: 'completed', isFeeWaived: true, medicalDueDates: { rabiesDueDate: deadline, dhppDueDate: deadline } };
    const original = structuredClone(session);
    const selects = t.mock.method(db, 'select', () => {
      const query = chain();
      query.from = (table: unknown) => chain(
        table === schema.adoptionCheckoutSessions ? [session] :
        table === schema.adoptionContracts ? [{ signerName: 'Adopter' }] :
        table === schema.animals ? [{ id: 'animal', name: 'Dog', neuterStatus: 'neutered' }] : [],
      );
      return query;
    });
    const writes: Array<{ table: unknown; values: any }> = [];
    const inserts = t.mock.method(db, 'insert', (table: unknown) => ({
      values: (values: any) => { writes.push({ table, values }); return chain(); },
    }) as any);
    const updates = t.mock.method(db, 'update', (table: unknown) => ({
      set: (values: any) => { writes.push({ table, values }); return chain(); },
    }) as any);
    try {
      await finalizeAdoption('session');
      const obligations = writes.find(write => write.table === schema.complianceObligations)?.values;
      assert.equal(obligations.length, 2);
      assert.ok(obligations.every((item: any) => item.contractualDueDate === deadline));
      assert.ok(!writes.some(write => [schema.preventativeCareRecords, schema.vaccineRecords,
        schema.adoptionContracts, schema.adoptionCheckoutSessions].includes(write.table as any)));
      assert.deepEqual(session, original);
      assert.ok(writes.some(write => write.table === schema.animals && write.values.status === 'adopted'));
    } finally { selects.mock.restore(); inserts.mock.restore(); updates.mock.restore(); }
  }
});
