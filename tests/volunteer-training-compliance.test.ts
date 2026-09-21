import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  activationAllowed,
  acquireVolunteerTrainingActivationPolicyLock,
  applyLockedVolunteerAccessUpdate,
  applyLockedVolunteerRoleUpdate,
  applicationTrainingIdentity,
  assertActivationIdentityDisposition,
  assertResolvedContactUserPair,
  assertCompatibleTrainingIdentity,
  assertCurrentRequirementVersion,
  assertPreviousCompletionOwnership,
  authenticatedAttestationSchema,
  authenticatedApplicantTrainingOwnershipMatches,
  canonicalTrainingIdentity,
  completionMatchesOwner,
  planTutorialRequirementUpdate,
  projectPublicApplicationCompliance,
  requestedVolunteerApplicationActivation,
  finalizedVolunteerApplicationActivationTransition,
  resolveApplicationCompletionOwners,
  renewalPlan,
  stateFor,
  volunteerActivationPolicyDisposition,
  waiverActivationDisposition,
} from '../server/services/volunteer-training';
import { identityReviewCandidateMatches } from '../server/services/volunteer-identity-review';
import { hashTrainingAccessToken } from '../server/services/volunteer-training-invitations';
import { decideApplicantTrainingAccess } from '../server/services/volunteer-training-invitations';
import { publicVolunteerApplicationSchema } from '../shared/schema';
import { redactTrainingTokenFromUrl } from '../server/middleware/tenant';
import {
  assertContactCanLink,
  assertProfileContactEmailAvailable,
  decideFreshVolunteerContactInsertOutcome,
  decidePublicVolunteerContactAssociation,
  decideVolunteerIdentityResolution,
  applyLockedFosterUserActivation,
  isHighConfidenceVolunteerApplicationContact,
  staffContactCreateSchema,
  staffContactUpdateSchema,
} from '../server/services/contacts';
import { buildContactCreatePayload } from '../client/src/lib/contactPayload';
import { canAttestOpenedRequirement } from '../shared/volunteer-training';
import { isSensitiveVolunteerTrainingUrl, tokenFreeCanonical } from '../shared/sensitive-routes';
import { injectOGTags, isSensitiveTrainingTokenPath } from '../server/middleware/og-tags';
import {
  BOUND_VOLUNTEER_USER_CREATION_OPTIONS,
  decideBoundVolunteerInvitationAcceptance,
  decideInvitationContactWrite,
  decideUnboundVolunteerInvitationAcceptance,
} from '../server/services/invitations';

test('verified existing-account applicants train only through exact durable ownership', () => {
  const base = {
    tenantMatches: true,
    pipelineStatus: 'waiver_needed',
    requestedUserId: 'foster-user',
    applicationUserId: null,
    applicationContactId: 'verified-contact',
    userContactIds: ['verified-contact'],
  };
  assert.equal(authenticatedApplicantTrainingOwnershipMatches(base), true);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({ ...base, tenantMatches: false }), false);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({ ...base, userContactIds: [] }), false);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({
    ...base, applicationUserId: 'other-user',
  }), false);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({
    ...base, applicationUserId: 'foster-user', userContactIds: ['other-contact'],
  }), false);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({
    ...base, applicationUserId: 'foster-user', userContactIds: [],
  }), false);
  assert.equal(authenticatedApplicantTrainingOwnershipMatches({
    ...base, pipelineStatus: 'rejected',
  }), false);
});

test('locked foster activation never gates collateral reactivation on training', async () => {
  let written: string[] | null = null;
  let gates = 0;
  const roles = await applyLockedFosterUserActivation({
    lockedRoles: ['staff'],
    lockedIsActive: true,
    complianceGate: async () => { gates++; },
    write: async next => { written = next; },
  });
  assert.deepEqual(roles, ['staff', 'foster']);
  assert.deepEqual(written, ['staff', 'foster']);
  assert.equal(gates, 0);

  const restored = await applyLockedFosterUserActivation({
    lockedRoles: ['volunteer'],
    lockedIsActive: false,
    complianceGate: async () => {
      gates++;
      throw Object.assign(new Error('training required'), { code: 'VOLUNTEER_TRAINING_REQUIRED' });
    },
    write: async () => {},
  });
  assert.deepEqual(restored, ['volunteer', 'foster']);
  assert.equal(gates, 0);
});

test('manual activation routing depends on requested active values, not a stale active snapshot', () => {
  const staleRead = { pipelineStatus: 'active_pool', status: 'approved' };
  const concurrentCurrent = { pipelineStatus: 'waiver_needed', status: 'pending' };
  assert.equal(requestedVolunteerApplicationActivation({ pipelineStatus: 'active_pool' }), true);
  assert.equal(requestedVolunteerApplicationActivation({ status: 'approved' }), true);
  assert.equal(requestedVolunteerApplicationActivation({ notes: 'edit' } as any), false);
  assert.equal(staleRead.pipelineStatus, 'active_pool');
  assert.equal(concurrentCurrent.pipelineStatus, 'waiver_needed');
});

test('training renewal state distinguishes current, due soon, overdue, and incomplete', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  assert.equal(stateFor(null, false, now), 'incomplete');
  assert.equal(stateFor('2025-12-31T12:00:00.000Z', true, now), 'overdue');
  assert.equal(stateFor('2026-01-15T12:00:00.000Z', true, now), 'due_soon');
  assert.equal(stateFor('2026-03-01T12:00:00.000Z', true, now), 'current');
});

test('existing-user volunteer activation policy is informational and never fabricates overrides', () => {
  assert.deepEqual(volunteerActivationPolicyDisposition('current', 2), { action: 'allow' });
  assert.deepEqual(volunteerActivationPolicyDisposition('due_soon', 2), { action: 'allow' });
  assert.deepEqual(volunteerActivationPolicyDisposition('incomplete', 0), { action: 'allow' });
  assert.deepEqual(volunteerActivationPolicyDisposition('incomplete', 2), { action: 'allow' });
  assert.deepEqual(volunteerActivationPolicyDisposition('overdue', 1, ' too short '), { action: 'allow' });
  assert.deepEqual(
    volunteerActivationPolicyDisposition('incomplete', 2, 'Verified emergency staffing need'),
    { action: 'allow' },
  );
});

test('staff identity review candidate requires normalized email preselection plus matching name or phone', () => {
  const application = { applicantName: ' Jane  Donor ', applicantPhone: '(512) 555-1212' };
  assert.equal(identityReviewCandidateMatches(application, { name: 'jane donor', phone: null }), true);
  assert.equal(identityReviewCandidateMatches(application, { name: 'Someone Else', phone: '512.555.1212' }), true);
  assert.equal(identityReviewCandidateMatches(application, { name: 'Someone Else', phone: '999-555-1212' }), false);
});

test('activation policy advisory lock serializes publication while training remains informational', async () => {
  let tail = Promise.resolve();
  const transaction = async <T>(work: (tx: { execute: () => Promise<void> }) => Promise<T>) => {
    let release!: () => void;
    const predecessor = tail;
    tail = new Promise<void>(resolve => { release = resolve; });
    let acquired = false;
    const tx = { execute: async () => { await predecessor; acquired = true; } };
    try {
      return await work(tx);
    } finally {
      if (acquired) release();
    }
  };
  let requirementLive = false;
  const user = { isActive: false };
  let allowFinalize!: () => void;
  const finalizeBarrier = new Promise<void>(resolve => { allowFinalize = resolve; });
  const finalize = transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, 'tenant-one');
    assert.equal(requirementLive, false);
    await finalizeBarrier;
    user.isActive = true;
  });
  const publish = transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, 'tenant-one');
    requirementLive = true;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requirementLive, false);
  assert.equal(user.isActive, false);
  allowFinalize();
  await Promise.all([finalize, publish]);
  assert.equal(user.isActive, true); // activation serialized strictly before publication

  requirementLive = false;
  user.isActive = false;
  await transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, 'tenant-one');
    requirementLive = true;
  });
  await transaction(async tx => {
    await acquireVolunteerTrainingActivationPolicyLock(tx, 'tenant-one');
    user.isActive = true;
  });
  assert.equal(user.isActive, true);
});

test('late publication remains informational for bound, unbound, manual, and waiver finalization', async () => {
  let requiredPublished = false;
  let invitationAccepted = false;
  let boundActive = false;
  let unboundActive = false;
  let manualActive = false;
  const waiverSigned = true;
  let releasePublication!: () => void;
  const publicationHeld = new Promise<void>(resolve => { releasePublication = resolve; });
  let policyBusy = false;
  const waiters: Array<() => void> = [];
  const executor = {
    execute: async () => {
      while (policyBusy) await new Promise<void>(resolve => waiters.push(resolve));
      policyBusy = true;
    },
  };
  const unlock = () => {
    policyBusy = false;
    waiters.splice(0).forEach(resolve => resolve());
  };
  await acquireVolunteerTrainingActivationPolicyLock(executor as any, 'tenant-late');
  const publication = (async () => {
    await publicationHeld;
    requiredPublished = true;
    unlock();
  })();
  const finalize = (async () => {
    await acquireVolunteerTrainingActivationPolicyLock(executor as any, 'tenant-late');
    const bound = decideBoundVolunteerInvitationAcceptance({
      pipelineStatus: 'active_pool',
      recipientMatches: true,
      hasEstablishedContact: true,
      trainingAllowed: !requiredPublished,
    });
    const unbound = decideUnboundVolunteerInvitationAcceptance(true, requiredPublished);
    boundActive = bound.allowed;
    unboundActive = unbound.allowed;
    invitationAccepted = bound.allowed;
    manualActive = activationAllowed(requiredPublished ? 'incomplete' : 'current');
    unlock();
  })();
  releasePublication();
  await Promise.all([publication, finalize]);
  assert.equal(boundActive, true);
  assert.equal(unboundActive, true);
  assert.equal(invitationAccepted, true);
  assert.equal(manualActive, true);
  assert.deepEqual(waiverActivationDisposition('incomplete'), {
    activate: true,
    preserveSignedWaiver: true,
    keepPipelineStatus: null,
    runActivationSideEffects: true,
  });
  assert.equal(waiverSigned, true);
});

test('locked role and access helpers ignore stale state and never gate writes on training', async () => {
  const events: string[] = [];
  const staleRoles = ['volunteer'];
  assert.equal(staleRoles.includes('volunteer'), true);
  await applyLockedVolunteerRoleUpdate({
    lockedCurrentRoles: [],
    desiredRoles: ['staff', 'volunteer'],
    complianceGate: async () => { events.push('role-gate'); },
    write: async () => { events.push('role-write'); },
  });
  await applyLockedVolunteerAccessUpdate({
    lockedCurrentRoles: ['volunteer'],
    restoring: true,
    complianceGate: async () => { events.push('access-gate'); },
    write: async () => { events.push('access-write'); },
  });
  await applyLockedVolunteerAccessUpdate({
    lockedCurrentRoles: ['staff'],
    restoring: true,
    complianceGate: async () => { events.push('unexpected'); },
    write: async () => { events.push('non-volunteer-write'); },
  });
  await applyLockedVolunteerAccessUpdate({
    lockedCurrentRoles: ['volunteer'],
    restoring: false,
    complianceGate: async () => { events.push('unexpected'); },
    write: async () => { events.push('suspension-write'); },
  });
  assert.deepEqual(events, [
    'role-write',
    'access-write',
    'non-volunteer-write', 'suspension-write',
  ]);
});

test('NO KEY UPDATE user lock preserves atomic writers without coupling restore to completion locks', async () => {
  const postgresRowLocksCompatible = (held: 'no_key_update' | 'key_share', requested: 'no_key_update' | 'key_share') =>
    held === 'key_share' && requested === 'key_share' ||
    held === 'no_key_update' && requested === 'key_share' ||
    held === 'key_share' && requested === 'no_key_update';
  assert.equal(postgresRowLocksCompatible('no_key_update', 'key_share'), true);
  assert.equal(postgresRowLocksCompatible('key_share', 'no_key_update'), true);
  assert.equal(postgresRowLocksCompatible('no_key_update', 'no_key_update'), false);

  let rowWriter: string | null = null;
  const rowWaiters: Array<() => void> = [];
  const acquireNoKeyUpdate = async (owner: string) => {
    while (rowWriter) await new Promise<void>(resolve => rowWaiters.push(resolve));
    rowWriter = owner;
  };
  const releaseNoKeyUpdate = (owner: string) => {
    assert.equal(rowWriter, owner);
    rowWriter = null;
    rowWaiters.splice(0).forEach(resolve => resolve());
  };
  // KEY SHARE is explicitly compatible with the held NO KEY UPDATE lock.
  const acquireFkKeyShare = async () => {
    assert.equal(postgresRowLocksCompatible('no_key_update', 'key_share'), true);
  };

  let identityHeld = false;
  const identityWaiters: Array<() => void> = [];
  const acquireIdentity = async () => {
    while (identityHeld) await new Promise<void>(resolve => identityWaiters.push(resolve));
    identityHeld = true;
  };
  const releaseIdentity = () => {
    identityHeld = false;
    identityWaiters.splice(0).forEach(resolve => resolve());
  };

  // Ordinary staff completion owns the per-identity lock first.
  await acquireIdentity();
  const events: string[] = ['completion-identity-lock'];
  const restore = (async () => {
    await acquireNoKeyUpdate('restore');
    events.push('restore-no-key-update');
    await applyLockedVolunteerAccessUpdate({
      lockedCurrentRoles: ['volunteer'],
      restoring: true,
      complianceGate: async () => {
        events.push('restore-waits-identity');
        await acquireIdentity();
        events.push('restore-identity-lock');
        releaseIdentity();
      },
      write: async () => { events.push('restore-write'); },
    });
    releaseNoKeyUpdate('restore');
  })();
  await new Promise(resolve => setImmediate(resolve));

  let secondWriterEntered = false;
  const secondWriter = (async () => {
    await acquireNoKeyUpdate('second-writer');
    secondWriterEntered = true;
    events.push('second-writer');
    releaseNoKeyUpdate('second-writer');
  })();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondWriterEntered, true);

  // Completion history remains independently writable and retains its own
  // identity lock; access restoration does not wait for or alter it.
  await acquireFkKeyShare();
  events.push('completion-fk-key-share', 'completion-insert');
  releaseIdentity();
  await Promise.all([restore, secondWriter]);
  assert.deepEqual(events, [
    'completion-identity-lock',
    'restore-no-key-update',
    'restore-write',
    'second-writer',
    'completion-fk-key-share',
    'completion-insert',
  ]);
});

test('early renewal starts at 30 days and preserves the existing term', () => {
  const attested = new Date('2025-01-31T12:00:00.000Z');
  const due = new Date('2026-01-31T12:00:00.000Z');
  assert.equal(renewalPlan(due, attested, new Date('2025-12-31T11:59:59.000Z')).renewable, false);
  const early = renewalPlan(due, attested, new Date('2026-01-15T12:00:00.000Z'));
  assert.equal(early.renewable, true);
  assert.equal(early.baseDate.toISOString(), due.toISOString());
  const overdue = renewalPlan(due, attested, new Date('2026-02-05T12:00:00.000Z'));
  assert.equal(overdue.renewable, true);
  assert.equal(overdue.baseDate.toISOString(), '2026-02-05T12:00:00.000Z');
});

test('one-month completions and renewed cycles reject immediate duplicate renewal', () => {
  const firstAttested = new Date('2026-01-01T12:00:00.000Z');
  const firstDue = new Date('2026-02-01T12:00:00.000Z');
  assert.equal(renewalPlan(firstDue, firstAttested, new Date('2026-01-01T12:00:01.000Z')).renewable, false);
  assert.equal(stateFor(firstDue, true, new Date('2026-01-01T12:00:01.000Z'), firstAttested), 'current');
  assert.equal(renewalPlan(firstDue, firstAttested, new Date('2026-01-25T12:00:00.000Z')).renewable, true);
  assert.equal(stateFor(firstDue, true, new Date('2026-01-25T12:00:00.000Z'), firstAttested), 'due_soon');

  const renewedAttested = new Date('2026-01-25T12:00:00.000Z');
  const renewedDue = new Date('2026-03-01T12:00:00.000Z');
  assert.equal(renewalPlan(renewedDue, renewedAttested, new Date('2026-01-25T12:00:01.000Z')).renewable, false);
});

test('locked tutorial update plans advance only required content versions', () => {
  const optional = {
    title: 'Orientation',
    description: 'Current description',
    youtubeUrl: 'https://example.org/video',
    visibleToRoles: ['staff'],
    requiredForVolunteers: false,
    renewalMonths: 12,
    requirementVersion: 3,
  };
  const enabled = planTutorialRequirementUpdate(optional, { requiredForVolunteers: true });
  assert.equal(enabled.requirementVersion, 4);
  assert.equal(enabled.advancesRequirementVersion, true);
  assert.deepEqual(enabled.visibleToRoles, ['staff', 'admin', 'volunteer']);

  const requiredV4 = { ...optional, requiredForVolunteers: true, requirementVersion: enabled.requirementVersion };
  const concurrentNext = planTutorialRequirementUpdate(requiredV4, { title: 'Updated orientation' });
  assert.equal(concurrentNext.requirementVersion, 5);
  assert.equal(concurrentNext.advancesRequirementVersion, true);

  const categoryOnly = planTutorialRequirementUpdate(requiredV4, { category: 'Policies', sortOrder: 2 });
  assert.equal(categoryOnly.requirementVersion, 4);
  assert.equal(categoryOnly.advancesRequirementVersion, false);

  const disabledWithEdit = planTutorialRequirementUpdate(requiredV4, {
    requiredForVolunteers: false,
    description: 'Content prepared while optional',
  });
  assert.equal(disabledWithEdit.requirementVersion, 4);
  assert.equal(disabledWithEdit.advancesRequirementVersion, false);
  const reenabled = planTutorialRequirementUpdate({
    ...requiredV4,
    requiredForVolunteers: false,
    description: 'Content prepared while optional',
  }, { requiredForVolunteers: true });
  assert.equal(reenabled.requirementVersion, 5);
  assert.equal(reenabled.advancesRequirementVersion, true);
});

test('public compliance projection allowlists only display-safe fields', () => {
  const projected = projectPublicApplicationCompliance({
    overallStatus: 'due_soon',
    application: { id: 'application-secret', notes: 'staff-only notes' },
    identity: { userId: 'user-secret', contactId: 'contact-secret' },
    requirements: [{
      tutorialId: 'tutorial-public',
      status: 'due_soon',
      completion: {
        attestedAt: '2025-01-01T00:00:00.000Z',
        renewalDueAt: '2026-01-01T00:00:00.000Z',
        identityKey: 'application:secret',
        recordedBy: 'staff-secret',
        overrideReason: 'internal audit reason',
        volunteerApplicationId: 'application-secret',
      },
    }],
  } as any);
  assert.deepEqual(Object.keys(projected).sort(), ['overallStatus', 'requirements']);
  assert.deepEqual(Object.keys(projected.requirements[0]).sort(), [
    'attestedAt', 'renewalDueAt', 'status', 'tutorialId',
  ]);
  const serialized = JSON.stringify(projected);
  for (const secret of ['staff-only notes', 'application-secret', 'user-secret', 'contact-secret',
    'application:secret', 'staff-secret', 'internal audit reason', 'identityKey', 'recordedBy', 'overrideReason']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('OG middleware bypasses sensitive training token pages before any inspection', async () => {
  const secret = 'SUPER-SECRET-BEARER';
  assert.equal(isSensitiveTrainingTokenPath(`/volunteer-training/${secret}?preview=1`), true);
  assert.equal(isSensitiveTrainingTokenPath(`/tenant-one/volunteer-training/${secret}`), true);
  assert.equal(isSensitiveTrainingTokenPath('/volunteer-training'), false);
  assert.equal(isSensitiveTrainingTokenPath('/tenant-one/volunteer-training'), false);

  const captured: unknown[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args: unknown[]) => { captured.push(args); };
  console.warn = (...args: unknown[]) => { captured.push(args); };
  console.error = (...args: unknown[]) => { captured.push(args); };
  try {
    for (const userAgent of ['Mozilla/5.0', 'Twitterbot/1.0']) {
      let nextCalls = 0;
      let responseTouched = false;
      let requestInspected = false;
      const response = new Proxy({}, {
        get() { responseTouched = true; return undefined; },
        set() { responseTouched = true; return true; },
      });
      await injectOGTags({
        url: `/tenant-one/volunteer-training/${secret}?source=social`,
        originalUrl: `/tenant-one/volunteer-training/${secret}?source=social`,
        get() { requestInspected = true; return userAgent; },
      } as any, response as any, () => { nextCalls += 1; });
      assert.equal(nextCalls, 1);
      assert.equal(responseTouched, false);
      assert.equal(requestInspected, false);
    }
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.equal(JSON.stringify(captured).includes(secret), false);
  const source = await readFile(new URL('../server/middleware/og-tags.ts', import.meta.url), 'utf8');
  assert.match(source, /export async function injectOGTags[^{}]*\{\s*if \(isSensitiveTrainingTokenPath\(req\.url\) \|\| isSensitiveTrainingTokenPath\(req\.originalUrl\)\) return next\(\);\s*const userAgent/);
});

test('activation decisions are informational for incomplete and overdue training', () => {
  assert.equal(activationAllowed('current'), true);
  assert.equal(activationAllowed('due_soon'), true);
  assert.equal(activationAllowed('incomplete'), true);
  assert.equal(activationAllowed('overdue'), true);
  assert.equal(activationAllowed(null), true);
  assert.deepEqual(waiverActivationDisposition('incomplete'), {
    activate: true,
    preserveSignedWaiver: true,
    keepPipelineStatus: null,
    runActivationSideEffects: true,
  });
});

test('opening v1 cannot authorize v2 after a refetch', async () => {
  let openedVersion: number | undefined = 1;
  assert.equal(canAttestOpenedRequirement(openedVersion, 1), true);
  const refetchedVersion = 2;
  assert.equal(canAttestOpenedRequirement(openedVersion, refetchedVersion), false);
  assert.equal(openedVersion, 1, 'submission must retain the version actually opened');
  openedVersion = refetchedVersion;
  assert.equal(canAttestOpenedRequirement(openedVersion, refetchedVersion), true);
  const [publicPage, authenticatedPage] = await Promise.all([
    readFile(new URL('../client/src/pages/PublicVolunteerTrainingPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/pages/TutorialsPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(publicPage, /requirementVersion:\s*opened\.get\(tutorial\.id\)!/);
  assert.match(authenticatedPage, /requirementVersion:\s*openedRequiredVideos\.get\(tutorial\.id\)!/);
});

test('stale displayed requirement versions cannot be attested', () => {
  assert.doesNotThrow(() => assertCurrentRequirementVersion(3, 3));
  assert.throws(
    () => assertCurrentRequirementVersion(2, 3),
    (error: any) => error.status === 409 && error.code === 'VOLUNTEER_TRAINING_VERSION_STALE',
  );
});

test('application and authenticated attestations lock the same reconciled person identity', () => {
  const publicIdentity = canonicalTrainingIdentity({
    identityKey: 'application:app-1',
    applicationId: 'app-1',
    contactId: 'contact-1',
  });
  const authenticatedIdentity = canonicalTrainingIdentity({
    identityKey: 'user:user-1',
    userId: 'user-1',
    contactId: 'contact-1',
  });
  assert.equal(publicIdentity, 'contact-1');
  assert.equal(authenticatedIdentity, publicIdentity);
});

test('identity ownership conflicts prevent old-email compliance transfer', () => {
  const volunteerA = {
    applicationId: 'application-a',
    contactId: 'contact-a',
    userId: 'user-a',
  };
  assert.doesNotThrow(() => assertCompatibleTrainingIdentity(volunteerA, volunteerA));
  assert.throws(
    () => assertCompatibleTrainingIdentity(volunteerA, {
      applicationId: 'application-a',
      contactId: 'contact-b',
      userId: 'user-b',
    }),
    /conflicts with existing ownership/,
  );
});

test('authenticated attestation strictly rejects application association fields', () => {
  assert.equal(authenticatedAttestationSchema.safeParse({
    attested: true,
    requirementVersion: 1,
  }).success, true);
  assert.equal(authenticatedAttestationSchema.safeParse({
    attested: true,
    requirementVersion: 1,
    applicationId: '00000000-0000-4000-8000-000000000001',
  }).success, false);
});

test('recording against one matching FK rejects conflicts on another FK', () => {
  assert.throws(() => assertPreviousCompletionOwnership([{
    userId: 'user-a',
    contactId: 'contact-shared',
    volunteerApplicationId: 'application-a',
  }], {
    userId: 'user-b',
    contactId: 'contact-shared',
  }), /conflicts with existing ownership/);
});

test('contact ownership helpers allow unowned/same-user links and reject reassignment', () => {
  assert.doesNotThrow(() => assertContactCanLink(null, 'user-a'));
  assert.doesNotThrow(() => assertContactCanLink('user-a', 'user-a'));
  assert.throws(() => assertContactCanLink('user-a', 'user-b'), (error: any) =>
    error.status === 409 && error.code === 'CONTACT_OWNERSHIP_CONFLICT');
  assert.doesNotThrow(() => assertProfileContactEmailAvailable(
    { id: 'contact-a', userId: 'user-a' },
    ['contact-a'],
    'user-a',
  ));
  assert.throws(() => assertProfileContactEmailAvailable(
    { id: 'contact-b', userId: 'user-b' },
    ['contact-a'],
    'user-a',
  ), /belongs to another contact/);
});

test('final compliance and history ownership filter excludes stale contact relinks', async () => {
  // Contact C is now linked to volunteer B, but this legacy completion remains
  // durably owned by volunteer A. Neither B compliance nor B history may use it.
  const staleCompletion = {
    identityKey: 'contact:C',
    contactId: 'C',
    userId: 'A',
    volunteerApplicationId: null,
  };
  assert.equal(completionMatchesOwner(staleCompletion, { userId: 'B' }), false);
  assert.equal(completionMatchesOwner(staleCompletion, { userId: 'A' }), true);
  assert.equal(completionMatchesOwner({ ...staleCompletion, userId: null }, { userId: 'B' }), true);
  const service = await readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8');
  assert.match(service, /complianceForKeys\(tenantId,\s*identity\.keys,\s*\{[\s\S]*applicationId,[\s\S]*contactId:\s*identity\.contactId[\s\S]*userId:\s*identity\.userId/);
  assert.match(service, /complianceForKeys\(tenantId,\s*await identityKeysForUser\(tenantId,\s*userId,\s*executor\),\s*\{\s*userId\s*\},\s*executor\)/);
  assert.match(service, /getTrainingHistory\([\s\S]*\.\.\.ownerConditions\(owner\)/);
});

test('staff contact schemas reject all ownership fields', () => {
  assert.equal(staffContactCreateSchema.safeParse({
    name: 'Volunteer',
    email: 'volunteer@example.org',
    userId: '00000000-0000-4000-8000-000000000001',
  }).success, false);
  assert.equal(staffContactCreateSchema.safeParse({
    name: 'Volunteer',
    email: 'volunteer@example.org',
    tenantId: '00000000-0000-4000-8000-000000000001',
  }).success, false);
  assert.equal(staffContactUpdateSchema.safeParse({
    userId: '00000000-0000-4000-8000-000000000001',
  }).success, false);
  assert.equal(staffContactUpdateSchema.safeParse({
    id: '00000000-0000-4000-8000-000000000001',
  }).success, false);
});

test('contact form payload removes UI-only roles and passes the real staff schema', () => {
  const payload = buildContactCreatePayload({
    name: 'Volunteer Person',
    email: 'volunteer@example.org',
    phone: '555-0100',
    address: '1 Rescue Way',
    tags: 'Orientation, Dog Team, ',
    notes: 'Available weekends',
    roles: ['volunteer', 'staff'],
  });
  assert.equal('roles' in payload, false);
  assert.deepEqual(payload.role, ['volunteer', 'staff']);
  assert.deepEqual(payload.tags, ['Orientation', 'Dog Team']);
  assert.equal(staffContactCreateSchema.safeParse(payload).success, true);
});

test('public volunteer intake rejects workflow-controlled activation fields', () => {
  const valid = {
    applicantName: 'New Applicant',
    applicantEmail: 'new@example.org',
    applicantPhone: '555-0100',
    experience: 'Volunteer experience',
    availability: 'Weekends',
  };
  assert.equal(publicVolunteerApplicationSchema.safeParse(valid).success, true);
  assert.equal(publicVolunteerApplicationSchema.safeParse({
    ...valid,
    status: 'approved',
    pipelineStatus: 'active_pool',
  }).success, false);
});

test('bearer training access is pre-account and recipient-bound', () => {
  const application = {
    tenantId: 'tenant-A',
    contactId: 'contact-A',
    userId: null,
    applicantEmail: 'historical@example.org',
    pipelineStatus: 'orientation_scheduled',
  };
  const contact = {
    id: 'contact-A',
    tenantId: 'tenant-A',
    userId: null,
    email: 'authoritative@example.org',
  };
  const session = {
    tenantId: 'tenant-A',
    recipientEmail: 'authoritative@example.org',
    expiresAt: new Date('2030-01-01'),
    revokedAt: null,
  };
  assert.deepEqual(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application, contact, session, now: new Date('2029-01-01'),
  }), { allowed: true, recipientEmail: 'authoritative@example.org' });
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A',
    application: { ...application, pipelineStatus: 'waiver_needed' },
    contact,
  }).allowed, true);
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application: { ...application, userId: 'user-A' }, contact,
  }).reason, 'authenticated_training_required');
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application, contact: { ...contact, userId: 'user-A' },
  }).reason, 'authenticated_training_required');
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application, contact,
    session: { ...session, recipientEmail: 'changed@example.org' }, now: new Date('2029-01-01'),
  }).allowed, false);
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application, contact: { ...contact, tenantId: 'tenant-B' },
  }).allowed, false);
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application, contact: null,
  }).allowed, false);
  for (const invalidLinkedEmail of ['', '   ', 'not-an-email']) {
    assert.equal(decideApplicantTrainingAccess({
      tenantId: 'tenant-A',
      application,
      contact: { ...contact, email: invalidLinkedEmail },
    }).allowed, false, `linked contact email ${JSON.stringify(invalidLinkedEmail)} must fail closed`);
  }
  assert.deepEqual(decideApplicantTrainingAccess({
    tenantId: 'tenant-A',
    application: {
      ...application,
      contactId: null,
      applicantEmail: '  APPLICANT@Example.org ',
    },
    contact: null,
  }), { allowed: true, recipientEmail: 'applicant@example.org' });
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-A', application: { ...application, pipelineStatus: 'active_pool' }, contact,
  }).allowed, false);
  for (const pipelineStatus of ['new_applicant', 'rejected']) {
    assert.equal(decideApplicantTrainingAccess({
      tenantId: 'tenant-A', application: { ...application, pipelineStatus }, contact,
    }).allowed, false);
  }
});

test('public attestation revalidates identity, revocation, recipient, stage, and version after routing hint', async () => {
  const application = {
    tenantId: 'tenant-a', contactId: 'contact-a', userId: null as string | null,
    applicantEmail: 'person@example.org', pipelineStatus: 'orientation_scheduled',
  };
  const contact = {
    id: 'contact-a', tenantId: 'tenant-a', userId: null as string | null,
    email: 'person@example.org',
  };
  const session = {
    tenantId: 'tenant-a', recipientEmail: 'person@example.org',
    expiresAt: new Date('2030-01-01'), revokedAt: null as Date | null,
  };
  const routingHint = { tenantId: 'tenant-a', applicationId: 'application-a' };
  assert.equal(routingHint.applicationId, 'application-a');
  let inserts = 0;

  // Identity approval wins the application-person/application locks.
  application.userId = 'user-a';
  contact.userId = 'user-a';
  session.revokedAt = new Date();
  const afterApproval = decideApplicantTrainingAccess({
    tenantId: routingHint.tenantId, application, contact, session, now: new Date('2027-01-01'),
  });
  if (afterApproval.allowed) inserts++;
  assert.equal(afterApproval.allowed, false);
  assert.equal(inserts, 0);

  // Public wins first: valid application-only completion commits; subsequent
  // approval can reconcile that committed row to the verified user.
  application.userId = null;
  contact.userId = null;
  session.revokedAt = null;
  const publicFirst = decideApplicantTrainingAccess({
    tenantId: routingHint.tenantId, application, contact, session, now: new Date('2027-01-01'),
  });
  assert.equal(publicFirst.allowed, true);
  assertCurrentRequirementVersion(3, 3);
  if (publicFirst.allowed) inserts++;
  application.userId = 'user-a';
  contact.userId = 'user-a';
  assert.equal(inserts, 1);

  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-a', application: { ...application, userId: null, pipelineStatus: 'rejected' },
    contact: { ...contact, userId: null }, session: { ...session, revokedAt: null },
  }).allowed, false);
  assert.equal(decideApplicantTrainingAccess({
    tenantId: 'tenant-a', application: { ...application, userId: null },
    contact: { ...contact, userId: null }, session: { ...session, revokedAt: null, recipientEmail: 'stale@example.org' },
  }).allowed, false);
  assert.throws(() => assertCurrentRequirementVersion(2, 3), /changed/);
});

test('public intake never adopts or mutates an existing contact identity', () => {
  assert.deepEqual(decidePublicVolunteerContactAssociation(true), {
    createAndLink: false,
    requiresStaffVerification: true,
    complianceIdentity: 'application_only',
  });
  assert.deepEqual(decidePublicVolunteerContactAssociation(false), {
    createAndLink: true,
    requiresStaffVerification: false,
    complianceIdentity: 'fresh_contact',
  });
});

test('waiver automation cannot begin email identity resolution without an established identity', () => {
  assert.deepEqual(decideVolunteerIdentityResolution({}, false), {
    action: 'identity_review',
    mayLookupEmail: false,
    mayLink: false,
  });
  assert.deepEqual(decideVolunteerIdentityResolution({ contactId: 'established-contact' }, false), {
    action: 'use_established',
    mayLookupEmail: false,
    mayLink: true,
  });
  assert.deepEqual(decideFreshVolunteerContactInsertOutcome(false), {
    link: false,
    requiresStaffVerification: true,
  });
});

test('volunteer invitation acceptance preserves identity checks but ignores training state', () => {
  assert.deepEqual(BOUND_VOLUNTEER_USER_CREATION_OPTIONS, {
    initiallyInactive: true,
    skipContactSync: true,
  });
  const eligible = {
    pipelineStatus: 'active_pool',
    recipientMatches: true,
    hasEstablishedContact: true,
    trainingAllowed: true,
  };
  assert.deepEqual(decideBoundVolunteerInvitationAcceptance(eligible), { allowed: true });
  assert.deepEqual(decideBoundVolunteerInvitationAcceptance({
    ...eligible,
    trainingAllowed: false,
  }), { allowed: true });
  assert.deepEqual(decideBoundVolunteerInvitationAcceptance({
    ...eligible,
    pipelineStatus: 'waiver_needed',
  }), { allowed: false, code: 'VOLUNTEER_INVITATION_STAGE_INVALID' });
  assert.deepEqual(decideBoundVolunteerInvitationAcceptance({
    ...eligible,
    hasEstablishedContact: false,
  }), { allowed: false, code: 'VOLUNTEER_INVITATION_IDENTITY_REVIEW_REQUIRED' });
  assert.deepEqual(decideUnboundVolunteerInvitationAcceptance(true, true), { allowed: true });
  assert.deepEqual(decideUnboundVolunteerInvitationAcceptance(true, false), { allowed: true });
  assert.deepEqual(decideUnboundVolunteerInvitationAcceptance(false, true), { allowed: true });
});

test('deleted bound contact fails closed after inactive user creation', () => {
  const inactiveUser = { id: 'inactive-user', isActive: false };
  const effects = { contactInserts: 0, reconciliations: 0, finalizations: 0, sessions: 0 };
  const decision = decideInvitationContactWrite(true, false);
  if (decision.action === 'insert_new') effects.contactInserts += 1;
  if (decision.action === 'update_exact') {
    effects.reconciliations += 1;
    effects.finalizations += 1;
    effects.sessions += 1;
  }
  assert.deepEqual(decision, { action: 'identity_conflict' });
  assert.deepEqual(effects, {
    contactInserts: 0,
    reconciliations: 0,
    finalizations: 0,
    sessions: 0,
  });
  assert.equal(inactiveUser.isActive, false);
});

test('explicit application person links include authenticated completion identities', () => {
  const identity = applicationTrainingIdentity({
    id: 'application-A',
    contactId: 'contact-C',
    userId: 'user-B',
  }, [{
    identityKey: 'user:user-B',
    contactId: 'contact-C',
    userId: 'user-B',
  }]);
  assert.equal(identity.contactId, 'contact-C');
  assert.equal(identity.userId, 'user-B');
  assert.deepEqual(identity.keys, [
    'contact:contact-C',
    'user:user-B',
    'application:application-A',
  ]);
});

test('completion ownership rejects an email-selected different contact before activation', () => {
  const established = resolveApplicationCompletionOwners({
    id: 'application-1',
    contactId: null,
    userId: null,
  }, [{
    volunteerApplicationId: 'application-1',
    contactId: 'contact-A',
    userId: 'user-A',
  }]);
  assert.deepEqual(established, { contactId: 'contact-A', userId: 'user-A' });
  assert.throws(() => assertActivationIdentityDisposition(established, {
    contactId: 'email-contact-B',
    userId: 'user-B',
  }), /conflicts with training ownership/);
});

test('normal intake contact is a safe legacy activation candidate', () => {
  assert.equal(isHighConfidenceVolunteerApplicationContact({
    applicantName: '  Jane   Volunteer ',
    applicantPhone: '(555) 010-2000',
  }, {
    name: 'Jane Volunteer',
    phone: '5550102000',
    role: null,
    source: ['volunteer_application'],
  }), true);
  assert.equal(isHighConfidenceVolunteerApplicationContact({
    applicantName: 'Jane Volunteer',
  }, {
    name: 'Different Person',
    role: null,
    source: ['volunteer_application'],
  }), false);
});

test('split completion owners cannot form an incompatible contact/user pair', () => {
  const established = resolveApplicationCompletionOwners({ id: 'application-1' }, [
    { volunteerApplicationId: 'application-1', contactId: 'contact-C', userId: null },
    { volunteerApplicationId: 'application-1', contactId: null, userId: 'user-A' },
  ]);
  assert.deepEqual(established, { contactId: 'contact-C', userId: 'user-A' });
  assert.throws(() => assertResolvedContactUserPair(
    { id: 'contact-C', userId: 'user-B' },
    established.contactId,
    established.userId,
  ), /incompatible/);
});

test('conflicting application-bound completion owners are rejected', () => {
  assert.throws(() => resolveApplicationCompletionOwners({
    id: 'application-1',
  }, [
    { volunteerApplicationId: 'application-1', contactId: 'contact-A', userId: 'user-A' },
    { volunteerApplicationId: 'application-1', contactId: 'contact-B', userId: 'user-A' },
  ]), /conflicting person ownership/);
});

test('activation and invitation persist explicit application links before reconciliation', async () => {
  const [contactsService, invitations, schema, postMerge] = await Promise.all([
    readFile(new URL('../server/services/contacts.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/invitations.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/schema.ts', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/post-merge.sh', import.meta.url), 'utf8'),
  ]);
  assert.match(contactsService, /getApplicationEstablishedIdentity[\s\S]*linkAndReconcileApplicationIdentity/);
  assert.match(contactsService, /decideVolunteerIdentityResolution\(established,\s*params\.allowExistingEmailContactMatch\)[\s\S]*resolution\.action === 'identity_review'[\s\S]*let contact/);
  const identityEstablishment = contactsService.slice(
    contactsService.indexOf('export async function establishVolunteerApplicationIdentity'),
    contactsService.indexOf('export async function markVolunteerContactActive'),
  );
  assert.doesNotMatch(identityEstablishment, /upsertContact\(/);
  assert.match(identityEstablishment, /db\.insert\(contacts\)[\s\S]*23505[\s\S]*volunteerIdentityReviewRequiredError/);
  assert.match(contactsService, /createContactFromVolunteerApplication[\s\S]*decidePublicVolunteerContactAssociation[\s\S]*matching\.length !== 1/);
  assert.doesNotMatch(contactsService.match(/createContactFromVolunteerApplication[\s\S]*?export function decidePublicVolunteerContactAssociation/)?.[0] || '', /upsertContact|linkAndReconcileApplicationIdentity/);
  assert.match(invitations, /acquireVolunteerTrainingActivationPolicyLock[\s\S]*getApplicationEstablishedIdentity[\s\S]*reconcileTrainingIdentityWithExecutor/);
  assert.doesNotMatch(invitations, /VOLUNTEER_INVITATION_TRAINING_REQUIRED|VOLUNTEER_INVITATION_APPLICATION_REQUIRED/);
  const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  const manualRoute = routes.slice(routes.indexOf("app.patch('/api/volunteer-applications/:id'"), routes.indexOf("app.delete('/api/volunteer-applications/:id'"));
  const waiverAutomation = routes.slice(routes.indexOf('// AUTOMATION: Auto-advance volunteer pipeline when Hold Harmless waiver is signed'), routes.indexOf('// Auto-advance to active_pool') + 200);
  assert.match(manualRoute, /allowExistingEmailContactMatch:\s*true/);
  assert.match(waiverAutomation, /allowExistingEmailContactMatch:\s*false/);
  assert.ok(
    manualRoute.indexOf('await establishVolunteerApplicationIdentity') < manualRoute.indexOf('finalizeVolunteerApplicationActivation'),
    'manual activation must establish identity before atomic finalization',
  );
  assert.match(schema, /volunteerApplications[\s\S]*contactId:\s*uuid\(\"contact_id\"\)[\s\S]*userId:\s*uuid\(\"user_id\"\)/);
  assert.match(schema, /userInvitations[\s\S]*volunteerApplicationId:\s*uuid\(\"volunteer_application_id\"\)/);
  assert.match(postMerge, /user_invitations_volunteer_application_fk[\s\S]*user_invitations_volunteer_application_idx/);
  assert.match(postMerge, /pipeline_status IN \('active_pool', 'orientation_scheduled', 'waiver_needed'\)[\s\S]*contacts_for_application = 1[\s\S]*applications_for_contact = 1/);
  assert.ok(
    postMerge.indexOf('CREATE TABLE IF NOT EXISTS volunteer_training_completions') <
      postMerge.indexOf('WITH aggregated_owners AS'),
    'training completion DDL must precede every completion backfill reference',
  );
  assert.match(postMerge, /resolved_contact\.user_id IS NULL OR resolved\.user_id IS NULL[\s\S]*resolved_contact\.user_id = resolved\.user_id/);
});

test('invitation preflight and atomic profile contact synchronization are wired', async () => {
  const [invitations, routes, auth] = await Promise.all([
    readFile(new URL('../server/services/invitations.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/auth.ts', import.meta.url), 'utf8'),
  ]);
  const preflightIndex = invitations.indexOf('preflightContact');
  const createUserIndex = invitations.indexOf("const { createUser }");
  assert.ok(preflightIndex >= 0 && createUserIndex > preflightIndex, 'contact ownership preflight must precede user creation');
  assert.match(invitations, /preflightContact\?\.userId[\s\S]*CONTACT_OWNERSHIP_CONFLICT/);
  const acceptance = invitations.slice(invitations.indexOf('export async function acceptInvitation'));
  assert.ok(
    acceptance.indexOf('boundVolunteer = await validateBoundVolunteerInvitation') < acceptance.indexOf("const { createUser }"),
    'live bound application validation must precede user creation',
  );
  assert.doesNotMatch(invitations, /getActivationTrainingGuard\(tenantId,\s*applicationId\)/);
  assert.match(invitations, /boundVolunteer \? boundVolunteer\.contact : emailPreflight\[0\]/);
  assert.match(invitations, /FOR NO KEY UPDATE[\s\S]*getApplicationEstablishedIdentity[\s\S]*reconcileTrainingIdentityWithExecutor/);
  const boundAcceptance = invitations.slice(invitations.indexOf('export async function acceptInvitation'), invitations.indexOf('export async function updateInvitationEmail'));
  assert.match(boundAcceptance, /normalizedContacts\.length !== 1 \|\| normalizedContacts\[0\]\.id !== boundVolunteer\.contact\.id[\s\S]*createUser/);
  assert.match(boundAcceptance, /decideInvitationContactWrite\(!!boundVolunteer,\s*!!postCreateContact\)[\s\S]*action === 'identity_conflict'[\s\S]*else if \(!boundVolunteer\)[\s\S]*db\.insert\(contacts\)/);
  assert.match(invitations, /acceptVolunteerInvitationAtomic[\s\S]*db\.transaction\(async tx[\s\S]*insertUserWithHashedPassword\(tx[\s\S]*initiallyInactive:\s*true[\s\S]*isNull\(userInvitations\.acceptedAt\)[\s\S]*eq\(users\.isActive,\s*false\)/);
  assert.doesNotMatch(boundAcceptance, /syncContactFromUser|upsertContact/);
  assert.match(auth, /initiallyInactive\?: boolean[\s\S]*skipContactSync\?: boolean[\s\S]*isActive:\s*!options\.initiallyInactive[\s\S]*if \(!options\.skipContactSync\)/);
  assert.match(invitations, /or\(isNull\(contacts\.userId\),\s*eq\(contacts\.userId,\s*user\.id\)\)/);
  assert.match(routes, /PATCH \/api\/me\/profile[\s\S]*db\.transaction\(async tx[\s\S]*assertProfileContactEmailAvailable[\s\S]*eq\(contacts\.userId,\s*userId\)/);
  const acceptRouteStart = routes.indexOf("app.post('/api/invitations/accept'");
  const acceptRoute = routes.slice(acceptRouteStart, routes.indexOf('  // Animals Routes', acceptRouteStart));
  assert.ok(
    acceptRoute.indexOf('await acceptInvitation(') < acceptRoute.indexOf('req.session.userId'),
    'public acceptance must not create a session until invitation acceptance succeeds',
  );
  const resend = routes.slice(
    routes.indexOf("app.post('/api/volunteer-applications/:id/resend-invite'"),
    routes.indexOf("app.get('/api/volunteer-applications/:id'"),
  );
  assert.match(resend, /pipelineStatus !== 'active_pool'[\s\S]*validateBoundVolunteerInvitation[\s\S]*volunteerApplicationId:\s*application\.id/);
  assert.doesNotMatch(resend, /getActivationTrainingGuard|VOLUNTEER_INVITATION_TRAINING_REQUIRED/);
  const sharedResend = invitations.slice(invitations.indexOf('export async function resendInvitation'));
  assert.match(sharedResend, /roles\.includes\('volunteer'\)[\s\S]*validateBoundVolunteerInvitation[\s\S]*update\(userInvitations\)/);
  assert.doesNotMatch(sharedResend, /requiredVolunteerTrainingExists|VOLUNTEER_INVITATION_APPLICATION_REQUIRED/);
  const patch = routes.slice(
    routes.indexOf("app.patch('/api/volunteer-applications/:id'"),
    routes.indexOf("app.delete('/api/volunteer-applications/:id'"),
  );
  assert.match(patch, /requestsPendingIdentity[\s\S]*establishVolunteerApplicationIdentity[\s\S]*\.update\(volunteerApplications\)/);
  assert.match(patch, /requestsActivation[\s\S]*finalizeVolunteerApplicationActivation/);
});

test('training bearer tokens are redacted without changing routable request URLs', () => {
  const publicPath = '/demo/api/public/volunteer-training/super-secret-token/attest?x=1';
  assert.equal(
    redactTrainingTokenFromUrl(publicPath),
    '/demo/api/public/volunteer-training/[REDACTED]/attest?x=1',
  );
  assert.equal(
    redactTrainingTokenFromUrl('/volunteer-training/browser-secret'),
    '/volunteer-training/[REDACTED]',
  );
  assert.equal(redactTrainingTokenFromUrl('/demo/api/tutorials'), '/demo/api/tutorials');
  assert.equal(publicPath.includes('super-secret-token'), true, 'helper must not mutate tenant routing input');
});

test('sensitive training routes never expose bearer tokens to browser URL sinks', async () => {
  const token = 'TOP-SECRET-training-token';
  for (const value of [
    `/volunteer-training/${token}`,
    `/demo/volunteer-training/${token}?source=email#video`,
    `https://tenant.example.org/acme/volunteer-training/${token}/`,
  ]) {
    assert.equal(isSensitiveVolunteerTrainingUrl(value), true);
    assert.doesNotMatch(tokenFreeCanonical(value, 'https://tenant.example.org'), new RegExp(token));
  }
  assert.equal(isSensitiveVolunteerTrainingUrl('/volunteer'), false);
  const [pageHook, visitHook, app, seo, html, server] = await Promise.all([
    readFile(new URL('../client/src/hooks/usePageTracking.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/hooks/useVisitTracking.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/hooks/useSEO.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(pageHook, /isSensitiveVolunteerTrainingUrl\(location\)\) return/);
  assert.equal((visitHook.match(/isSensitiveVolunteerTrainingUrl\(/g) || []).length, 2);
  assert.match(app, /tokenFreeCanonical\(window\.location\.href/);
  assert.match(seo, /tokenFreeCanonical\(url \|\| window\.location\.href/);
  assert.match(html, /meta\.content = 'no-referrer'[\s\S]*__irescueSensitiveRoute[\s\S]*if \(!window\.__irescueSensitiveRoute\)[\s\S]*googletagmanager/);
  assert.doesNotMatch(html, /page_path:\s*window\.location|page_location:\s*window\.location/);
  assert.match(server, /isSensitiveVolunteerTrainingUrl[\s\S]*Referrer-Policy', 'no-referrer'/);
});

test('pre-analytics history guard prevents sensitive SPA arguments reaching later wrappers', async () => {
  const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
  const bootstrap = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap);
  const nativeCalls: string[] = [];
  const analyticsCalls: string[] = [];
  const navigations: string[] = [];
  const listeners: Record<string, Function[]> = {};
  let referrerMeta: any = null;
  const location = {
    href: 'https://irescue.life/demo/home',
    pathname: '/demo/home',
    assign: (url: string) => { navigations.push(url); },
    replace: (url: string) => { navigations.push(url); },
  };
  const history = {
    pushState: (_state: unknown, _title: string, url: string) => {
      nativeCalls.push(url);
      location.href = new URL(url, location.href).href;
      location.pathname = new URL(location.href).pathname;
    },
    replaceState: (_state: unknown, _title: string, url: string) => {
      nativeCalls.push(url);
      location.href = new URL(url, location.href).href;
      location.pathname = new URL(location.href).pathname;
    },
  };
  const document = {
    head: { appendChild: (element: any) => { if (element.name === 'referrer') referrerMeta = element; } },
    querySelector: () => referrerMeta,
    createElement: () => ({}),
  };
  const windowObject: any = {
    location,
    addEventListener: (name: string, listener: Function) => {
      (listeners[name] ||= []).push(listener);
    },
  };
  const context = vm.createContext({
    window: windowObject,
    location,
    history,
    document,
    URL,
  });
  vm.runInContext(bootstrap!, context);
  // Model enhanced measurement attempting to install after bootstrap.
  vm.runInContext(`
    var analyticsOriginalPush = history.pushState;
    history.pushState = function(state, title, url) {
      analyticsCalls.push(String(url));
      return analyticsOriginalPush(state, title, url);
    };
    var analyticsOriginalReplace = history.replaceState;
    history.replaceState = function(state, title, url) {
      analyticsCalls.push(String(url));
      return analyticsOriginalReplace(state, title, url);
    };
  `, vm.createContext({ history, analyticsCalls }));
  const originalUrl = location.href;
  history.pushState({}, '', '/demo/volunteer-training/PUSH-SECRET?x=1#v');
  history.replaceState({}, '', '/volunteer-training/REPLACE-SECRET');
  assert.deepEqual(analyticsCalls, []);
  assert.deepEqual(nativeCalls, []);
  assert.equal(location.href, originalUrl);
  assert.equal(navigations.length, 2);
  assert.equal(referrerMeta?.content, 'no-referrer');

  history.pushState({}, '', '/demo/animals');
  assert.deepEqual(nativeCalls, ['/demo/animals']);
  assert.deepEqual(analyticsCalls, ['/demo/animals']);

  // A sensitive back/forward entry is synchronously stopped before listeners
  // installed later and converted into a full-document replacement.
  let laterPopstateObserved = false;
  windowObject.addEventListener('popstate', () => { laterPopstateObserved = true; });
  location.href = 'https://irescue.life/acme/volunteer-training/POP-SECRET';
  location.pathname = '/acme/volunteer-training/POP-SECRET';
  let stopped = false;
  const event = { stopImmediatePropagation: () => { stopped = true; } };
  for (const listener of listeners.popstate || []) {
    listener(event);
    if (stopped) break;
  }
  assert.equal(laterPopstateObserved, false);
  assert.equal(stopped, true);
  assert.match(navigations.at(-1)!, /POP-SECRET/);
});

test('history guard accepts strict Wouter and analytics ESM wrappers without recursion', async () => {
  const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
  const bootstrap = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap);
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><head></head><body></body>', {
    url: 'https://irescue.life/demo/home',
    runScripts: 'outside-only',
    virtualConsole,
  });
  dom.window.eval(bootstrap!);
  const previous = {
    window: (globalThis as any).window,
    history: (globalThis as any).history,
    Event: (globalThis as any).Event,
    dispatchEvent: (globalThis as any).dispatchEvent,
  };
  Object.assign(globalThis as any, {
    window: dom.window,
    history: dom.window.history,
    Event: dom.window.Event,
    dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
  });
  try {
    let wouterEvents = 0;
    dom.window.addEventListener('pushState', () => { wouterEvents++; });
    dom.window.addEventListener('replaceState', () => { wouterEvents++; });
    const wouterModule = new URL('../node_modules/wouter/esm/use-browser-location.js', import.meta.url);
    wouterModule.search = `guard=${process.pid}`;
    await import(wouterModule.href);

    const analyticsArguments: string[] = [];
    const strictInstall = Function('history', 'seen', `
      "use strict";
      const oldPush = history.pushState;
      history.pushState = function(state, title, url) {
        seen.push(String(url));
        return oldPush.call(this, state, title, url);
      };
      const oldReplace = history.replaceState;
      history.replaceState = function(state, title, url) {
        seen.push(String(url));
        return oldReplace.call(this, state, title, url);
      };
    `);
    assert.doesNotThrow(() => strictInstall(dom.window.history, analyticsArguments));
    dom.window.history.pushState({}, '', '/demo/animals');
    dom.window.history.replaceState({}, '', '/demo/contact');
    assert.equal(dom.window.location.pathname, '/demo/contact');
    assert.deepEqual(analyticsArguments, ['/demo/animals', '/demo/contact']);
    assert.equal(wouterEvents, 2);

    const beforeSensitive = dom.window.location.href;
    assert.doesNotThrow(() => {
      dom.window.history.pushState({}, '', '/demo/volunteer-training/WOUTER-SECRET?x=1#v');
      dom.window.history.replaceState({}, '', '/volunteer-training/REPLACE-WOUTER-SECRET');
    });
    assert.equal(dom.window.location.href, beforeSensitive);
    assert.deepEqual(analyticsArguments, ['/demo/animals', '/demo/contact']);
    assert.equal(wouterEvents, 2);
    assert.equal(dom.window.document.querySelector('meta[name="referrer"]')?.getAttribute('content'), 'no-referrer');
  } finally {
    Object.assign(globalThis as any, previous);
    dom.window.close();
  }
});

test('application-bound invitation email edits reject before mutation or delivery', async () => {
  const [invitations, routes, teamManagement] = await Promise.all([
    readFile(new URL('../server/services/invitations.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/pages/TeamManagementPage.tsx', import.meta.url), 'utf8'),
  ]);
  const updateService = invitations.slice(
    invitations.indexOf('export async function updateInvitationEmail'),
    invitations.indexOf('export async function cancelInvitation'),
  );
  assert.match(updateService, /\.for\('no key update'\)/);
  assert.match(updateService, /if \(invitation\.volunteerApplicationId\)[\s\S]*APPLICATION_BOUND_INVITATION_EMAIL_IMMUTABLE/);
  assert.ok(updateService.indexOf('APPLICATION_BOUND_INVITATION_EMAIL_IMMUTABLE') <
    updateService.indexOf('generateInvitationToken()'));
  assert.match(updateService, /isNull\(userInvitations\.volunteerApplicationId\)[\s\S]*returning\(\)/);
  const updateRoute = routes.slice(
    routes.indexOf("app.patch('/api/invitations/:id'"),
    routes.indexOf("app.post('/api/invitations/:id/resend'"),
  );
  assert.ok(updateRoute.indexOf('await updateInvitationEmail') < updateRoute.indexOf('await sendInvitationEmail'));
  assert.match(routes, /invitations\.map[\s\S]*isApplicationBound:\s*!!invitation\.volunteerApplicationId/);
  assert.match(teamManagement, /isApplicationBound:\s*boolean/);
  assert.match(teamManagement, /disabled=\{invitation\.isApplicationBound\}/);
  assert.match(teamManagement, /Recipient belongs to a verified volunteer application and cannot be edited/);
});

test('manual approval automation follows the locked finalized active-pool transition', async () => {
  assert.equal(requestedVolunteerApplicationActivation({ status: 'approved' }), true);
  assert.equal(requestedVolunteerApplicationActivation({ pipelineStatus: 'active_pool' }), true);
  assert.equal(finalizedVolunteerApplicationActivationTransition('waiver_needed', true), true);
  assert.equal(finalizedVolunteerApplicationActivationTransition('active_pool', true), false);
  assert.equal(finalizedVolunteerApplicationActivationTransition('waiver_needed', false), false);
  const [routes, training] = await Promise.all([
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8'),
  ]);
  const handler = routes.slice(
    routes.indexOf("app.patch('/api/volunteer-applications/:id'"),
    routes.indexOf("app.post('/api/volunteer-applications/:id/send-waiver'"),
  );
  assert.match(training, /requestedVolunteerApplicationActivation[\s\S]*input\.pipelineStatus === "active_pool" \|\| input\.status === "approved"/);
  assert.match(training, /previousApplication:\s*application[\s\S]*transitionedToActivePool:\s*finalizedVolunteerApplicationActivationTransition/);
  assert.match(handler, /let transitionedToActivePool = false[\s\S]*transitionedToActivePool = finalized\.transitionedToActivePool/);
  assert.match(handler, /const statusChangedToActivePool = transitionedToActivePool/);
  assert.doesNotMatch(handler, /const statusChangedToActivePool = data\.pipelineStatus/);
  assert.match(handler, /if \(statusChangedToActivePool && !updatedApplication\.driveFolderId\)/);
  assert.match(handler, /if \(statusChangedToActivePool\)[\s\S]*createAndSendVolunteerWelcome[\s\S]*dispatchEventNotification/);
});

test('tenant and API request logging use the token redactor', async () => {
  const [tenantMiddleware, index] = await Promise.all([
    readFile(new URL('../server/middleware/tenant.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(tenantMiddleware, /TENANT DEBUG[\s\S]*redactTrainingTokenFromUrl\(req\.path\)/);
  assert.match(index, /const path = redactTrainingTokenFromUrl\(req\.path\)/);
});

test('completion storage has tenant-scoped duplicate-submit protection', async () => {
  const schema = await readFile(new URL('../shared/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /identityVersionCycleUnique:\s*unique\(\)\.on\(table\.tenantId,\s*table\.trainingVersionId,\s*table\.identityKey,\s*table\.renewalCycle\)/);
  const service = await readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8');
  assert.match(service, /\.onConflictDoNothing\(\)/);
  assert.match(service, /eq\(volunteerTrainingCompletions\.tenantId,\s*args\.tenantId\)/);
  assert.match(service, /renewalCycle\s*=\s*\(previous\?\.renewalCycle\s*\|\|\s*0\)\s*\+\s*1/);
});

test('activation routes treat training as informational while historical override remains authorized', async () => {
  const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /finalizeVolunteerApplicationActivation\(\{[\s\S]*applicationId:\s*req\.params\.id/);
  assert.match(routes, /finalizeVolunteerApplicationActivation\(\{[\s\S]*applicationId:\s*volunteerApp\.id/);
  assert.doesNotMatch(routes, /Signed waiver preserved; activation blocked by required training|volunteer_activation_blocked_training/);
  assert.match(routes, /training-override',\s*requireTenant,\s*requireAuth,\s*requireRole\('admin',\s*'staff'\)/);
  assert.match(routes, /reason:\s*z\.string\(\)\.trim\(\)\.min\(10\)\.max\(1000\)/);
  assert.match(routes, /action:\s*'volunteer_training\.override'/);
});

test('authenticated attestation requires durable volunteer or applicant ownership and explicit confirmation', async () => {
  const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /attested:\s*z\.literal\(true\)/);
  assert.match(routes, /req\.user!\.roles\.includes\('volunteer'\)/);
  assert.match(routes, /getAuthenticatedTrainingOwner/);
  assert.match(routes, /requirementVersion:\s*z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.doesNotMatch(routes, /playback.*complete|watch(?:ed)?Seconds/i);
});

test('onboarding training uses hashed expiring application tokens without creating an account', async () => {
  assert.equal(hashTrainingAccessToken('same-token'), hashTrainingAccessToken('same-token'));
  assert.notEqual(hashTrainingAccessToken('same-token'), 'same-token');
  const schema = await readFile(new URL('../shared/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /volunteerTrainingAccessSessions[\s\S]*volunteerApplicationId:[\s\S]*secureTokenHash:[\s\S]*expiresAt:/);
  const invitations = await readFile(new URL('../server/services/volunteer-training-invitations.ts', import.meta.url), 'utf8');
  assert.match(invitations, /crypto\.randomBytes\(32\)/);
  assert.match(invitations, /buildTenantPublicUrl\(tenant,\s*`\/volunteer-training\//);
  assert.doesNotMatch(invitations, /createInvitation|createAndSendVolunteerWelcome/);
});

test('public onboarding APIs remain tenant-bound and require explicit attestation', async () => {
  const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /api\/public\/volunteer-training\/:token',\s*requireTenant/);
  assert.equal((routes.match(/validatePublicTrainingAccess\(req\.tenant!\.id,\s*req\.params\.token\)/g) || []).length, 1);
  assert.match(routes, /tutorialId:\s*z\.string\(\)\.uuid\(\),[\s\S]*requirementVersion:[\s\S]*attested:\s*z\.literal\(true\)/);
  const invitations = await readFile(new URL('../server/services/volunteer-training-invitations.ts', import.meta.url), 'utf8');
  assert.match(invitations, /\["orientation_scheduled", "waiver_needed"\]\.includes\(application\.pipelineStatus\)/);
  const publicAttest = routes.slice(
    routes.indexOf("app.post('/api/public/volunteer-training/:token/attest'"),
    routes.indexOf("app.post('/api/volunteer-applications/:id/send-training'"),
  );
  assert.match(publicAttest, /recordPublicTrainingCompletion/);
  assert.doesNotMatch(publicAttest, /validatePublicTrainingAccess|recordCompletion\(/);
  assert.doesNotMatch(publicAttest, /establishVolunteerApplicationIdentity|linkAndReconcileApplicationIdentity/);
  const publicGet = routes.slice(
    routes.indexOf("app.get('/api/public/volunteer-training/:token'"),
    routes.indexOf("app.post('/api/public/volunteer-training/:token/attest'"),
  );
  assert.match(publicGet, /projectPublicApplicationCompliance/);
  assert.doesNotMatch(publicGet, /\.\.\.completion/);
});

test('identity reconciliation persists application completion links onto contact and user FKs', async () => {
  const service = await readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8');
  assert.match(service, /export async function reconcileTrainingIdentity/);
  assert.match(service, /volunteerApplicationId[\s\S]*contactId[\s\S]*userId/);
  assert.match(service, /inArray\(volunteerTrainingCompletions\.contactId[\s\S]*isNull\(volunteerTrainingCompletions\.userId\)[\s\S]*eq\(volunteerTrainingCompletions\.userId,\s*userId\)/);
  assert.doesNotMatch(service, /lower\([^)]*email|applicantEmail/);
  const invitations = await readFile(new URL('../server/services/invitations.ts', import.meta.url), 'utf8');
  assert.match(invitations, /reconcileTrainingIdentity/);
});

test('required tutorial creation is version one, validated, and manager-visible', async () => {
  const [routes, service] = await Promise.all([
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(routes, /requirementVersion:\s*1/);
  assert.match(routes, /renewalMonths:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(120\)/);
  assert.match(routes, /\.\.\.\(requestedVisibility \|\| \[\]\),\s*'admin',\s*'staff',\s*'volunteer'/);
  const updateService = service.slice(
    service.indexOf('export async function updateTutorialWithRequirementVersion'),
    service.indexOf('export async function snapshotRequiredTutorial'),
  );
  assert.match(updateService, /db\.transaction[\s\S]*FOR UPDATE[\s\S]*tx\.select\(\)\.from\(tutorials\)[\s\S]*tx\.update\(tutorials\)[\s\S]*ensureVersion\(tx/);
  const patchRoute = routes.slice(
    routes.indexOf("app.patch('/api/tutorials/:id'"),
    routes.indexOf("app.delete('/api/tutorials/:id'"),
  );
  assert.match(patchRoute, /updateSchema\.parse\(req\.body\)[\s\S]*updateTutorialWithRequirementVersion/);
  assert.doesNotMatch(patchRoute, /db\.select|db\.update|snapshotRequiredTutorial|ensureVersion/);
});

test('training resend is rate limited and failed email delivery revokes its session', async () => {
  const [routes, invitations] = await Promise.all([
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/volunteer-training-invitations.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(routes, /send-training',\s*emailLimiter,\s*requireTenant/);
  assert.match(invitations, /catch \(error\)[\s\S]*revokedAt:\s*new Date\(\)[\s\S]*throw error/);
});

test('volunteer-training is reserved consistently and has a public app route', async () => {
  const [context, tenantApi, app] = await Promise.all([
    readFile(new URL('../client/src/contexts/TenantContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/lib/tenantApi.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/App.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(context, /'volunteer-training'/);
  assert.match(tenantApi, /'volunteer-training'/);
  assert.match(app, /path="\/volunteer-training\/:token"/);
});

test('team activation is training-informational while explicit identity review stays enforced', async () => {
  const [routes, training, review, pipeline, waiver, api] = await Promise.all([
    readFile(new URL('../server/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/volunteer-training.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/volunteer-identity-review.ts', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/pages/VolunteerApplicationsPipelinePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/components/MoveAndSendVolunteerWaiverDialog.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/lib/queryClient.ts', import.meta.url), 'utf8'),
  ]);
  const createUsers = routes.slice(routes.indexOf("app.post('/api/users'"), routes.indexOf("app.patch('/api/users/:id'"));
  assert.match(createUsers, /\.strict\(\)/);
  assert.doesNotMatch(createUsers, /volunteerApplicationId/);
  assert.match(createUsers, /createUser\(req\.tenant!\.id,\s*createData\)/);
  assert.doesNotMatch(createUsers, /hasRequiredTraining|volunteerTrainingRequiredError|initiallyInactive|ensureUserVolunteerActivationCompliance/);
  const informationalCompliance = training.slice(
    training.indexOf('export async function ensureUserVolunteerActivationCompliance'),
    training.indexOf('export async function finalizeVolunteerApplicationActivation'),
  );
  assert.match(informationalCompliance, /getUserCompliance/);
  assert.doesNotMatch(informationalCompliance, /recordCompletionWithExecutor|throw volunteerTrainingRequiredError/);
  const lockedTeamMutations = routes.slice(
    routes.indexOf("app.patch('/api/users/:id'"),
    routes.indexOf("app.patch('/api/users/:id/sms-prefs'"),
  );
  assert.equal((lockedTeamMutations.match(/\.for\('no key update'\)/g) || []).length, 2);
  assert.doesNotMatch(lockedTeamMutations, /\.for\('update'\)/);
  assert.doesNotMatch(lockedTeamMutations, /ensureUserVolunteerActivationCompliance|recordCompletionWithExecutor|VOLUNTEER_TRAINING_REQUIRED/);
  assert.match(review, /candidates\.length !== 1[\s\S]*identityReviewCandidateMatches[\s\S]*pg_advisory_xact_lock[\s\S]*FOR UPDATE[\s\S]*volunteerTrainingCompletions[\s\S]*volunteer_application[\s\S]*volunteer\.identity_verified/);
  assert.doesNotMatch(review, /Active Volunteer|role:\s*\[/);
  assert.match(api, /error\.status = res\.status[\s\S]*error\.code = details\?\.code[\s\S]*error\.details = details/);
  assert.match(pipeline, /VOLUNTEER_IDENTITY_REVIEW_REQUIRED[\s\S]*VolunteerIdentityVerificationDialog[\s\S]*updatePipelineStatusMutation\.mutate\(retry\)/);
  assert.match(waiver, /VOLUNTEER_IDENTITY_REVIEW_REQUIRED[\s\S]*VolunteerIdentityVerificationDialog[\s\S]*onVerified=\{handleSubmit\}/);
});