const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getMaxSocraticTurns,
  getInitialPhase,
  getNextPhase,
  getInitialPhaseAfterSaq,
  getSocraticExitReason,
  getSocraticLifecycleSnapshot,
  exportPolicyDefinition
} = require('../services/socratic-session-policy');

test('max Socratic turns match level table', () => {
  assert.equal(getMaxSocraticTurns('excellent'), 1);
  assert.equal(getMaxSocraticTurns('strong'), 2);
  assert.equal(getMaxSocraticTurns('bored'), 1);
  assert.equal(getMaxSocraticTurns('average'), 3);
  assert.equal(getMaxSocraticTurns('weak'), 4);
  assert.equal(getMaxSocraticTurns('very_weak'), 5);
});

test('after SAQ, high levels skip Socratic', () => {
  const missed = [{ description: 'gap' }];
  assert.equal(getInitialPhase('excellent', { pointsMissed: missed }), 'mcq');
  assert.equal(getInitialPhase('strong', { pointsMissed: missed }), 'mcq');
  assert.equal(getInitialPhase('bored', { pointsMissed: missed }), 'mcq');
});

test('after SAQ, non-high levels enter Socratic when gaps exist', () => {
  assert.equal(
    getInitialPhase('weak', { pointsMissed: [{ description: 'x' }] }),
    'socratic'
  );
});

test('Socratic ends when no missed points or turn cap', () => {
  assert.equal(
    getNextPhase({
      phase: 'socratic',
      level: 'average',
      scoreResult: { pointsMissed: [] },
      socraticTurns: []
    }),
    'final_recall'
  );
  const max = getMaxSocraticTurns('average');
  const turns = Array.from({ length: max }, () => ({}));
  assert.equal(
    getNextPhase({
      phase: 'socratic',
      level: 'average',
      scoreResult: { pointsMissed: [{ description: 'still' }] },
      socraticTurns: turns
    }),
    'final_recall'
  );
});

test('lifecycle snapshot exposes policy version', () => {
  const snap = getSocraticLifecycleSnapshot({
    phase: 'saq',
    level: 'weak',
    scoreResult: { pointsMissed: [{ description: 'a' }] },
    socraticTurns: [],
    hasConcept: true
  });
  assert.equal(snap.policy_version, '1.0');
  assert.equal(snap.starts_socratic_after_saq, true);
  const def = exportPolicyDefinition();
  assert.equal(def.version, '1.0');
  assert.ok(Array.isArray(def.end_socratic_when));
});
