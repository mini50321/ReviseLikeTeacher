const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSocraticAiPayload,
  assertSocraticAiPayloadShape,
  pickTeachingConcept,
  normalizeConversation,
  PAYLOAD_VERSION,
  SOCRATIC_AI_PAYLOAD_ROOT_KEYS
} = require('../services/socratic-ai-payload');

test('buildSocraticAiPayload includes concept, level, rubric, conversation, policy', () => {
  const concept = {
    id: 9,
    subject: 'Anatomy',
    topic: 'Ear',
    concept_key: 'pathway',
    name: 'Sound conduction',
    concept_explanation: 'Explain pathway.',
    must_know_points: [{ id: 'a', label: 'TM', description: 'Vibrates' }],
    leading_questions: [{ prompt: 'What is first?' }],
    mcqs: [{ id: 1 }],
    micro_questions: [{}]
  };
  const payload = buildSocraticAiPayload({
    concept,
    studentLevel: 'weak',
    scoreResult: {
      scorePercent: 40,
      pointsMissed: [{ description: 'miss' }],
      pointsHit: []
    },
    socraticTurns: [
      { teacher_prompt: 'Q1?', student_answer: 'A1' }
    ],
    phase: 'socratic',
    diagnosticMeta: { diagnostic_id: 'x', subject: 'Anatomy', topic: 'Ear' }
  });
  assert.equal(payload.payload_version, PAYLOAD_VERSION);
  assert.equal(payload.student_level, 'weak');
  assert.equal(payload.teaching_focus.name, 'Sound conduction');
  assert.equal(payload.teaching_focus.mcq_count, 1);
  assert.equal(payload.rubric_state.points_missed.length, 1);
  assert.equal(payload.conversation.length, 1);
  assert.equal(payload.conversation[0].student_answer, 'A1');
  assert.equal(payload.session_policy.max_socratic_turns, 4);
  assert.equal(payload.diagnostic_meta.diagnostic_id, 'x');
  for (const k of SOCRATIC_AI_PAYLOAD_ROOT_KEYS) {
    assert.ok(k in payload);
  }
  assert.ok(assertSocraticAiPayloadShape(payload).ok);
});

test('empty concept still yields valid payload shape', () => {
  const payload = buildSocraticAiPayload({
    concept: null,
    studentLevel: 'average',
    scoreResult: {},
    socraticTurns: [],
    phase: 'socratic'
  });
  assert.ok(assertSocraticAiPayloadShape(payload).ok);
  assert.equal(payload.teaching_focus.name, null);
});

test('pickTeachingConcept strips mcq bodies', () => {
  const t = pickTeachingConcept({ mcqs: [{ q: 1 }, { q: 2 }], name: 'N' });
  assert.equal(t.mcq_count, 2);
  assert.ok(!('mcqs' in t));
});

test('normalizeConversation caps length', () => {
  const long = 'x'.repeat(20000);
  const c = normalizeConversation([{ teacher_prompt: long, student_answer: 'ok' }]);
  assert.ok(c[0].teacher_prompt.length < 20000);
});
