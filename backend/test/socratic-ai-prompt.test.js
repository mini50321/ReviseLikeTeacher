const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSocraticSystemPrompt,
  buildSocraticUserContent,
  buildSocraticChatMessages,
  resolvePayload,
  PROMPT_VERSION
} = require('../services/socratic-ai-prompt');
const { buildSocraticAiPayload } = require('../services/socratic-ai-payload');

test('buildSocraticChatMessages returns system and user', () => {
  const msgs = buildSocraticChatMessages({
    concept: { id: 1, name: 'C', must_know_points: [], leading_questions: [] },
    studentLevel: 'weak',
    scoreResult: { pointsMissed: [{ description: 'x' }] },
    socraticTurns: [],
    phase: 'socratic'
  });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[0].content.includes('Socratic'));
  assert.ok(msgs[0].content.includes('next_teacher_prompt'));
  assert.ok(msgs[1].content.includes('CONTEXT_JSON'));
});

test('resolvePayload accepts prebuilt payload', () => {
  const p = buildSocraticAiPayload({
    concept: null,
    studentLevel: 'average',
    scoreResult: {},
    socraticTurns: [],
    phase: 'socratic'
  });
  const r = resolvePayload(p);
  assert.equal(r.payload_version, p.payload_version);
});

test('PROMPT_VERSION is set', () => {
  assert.ok(typeof PROMPT_VERSION === 'string' && PROMPT_VERSION.length > 0);
});

test('user content embeds payload json', () => {
  const p = buildSocraticAiPayload({
    concept: { name: 'N' },
    studentLevel: 'average',
    scoreResult: {},
    socraticTurns: [],
    phase: 'socratic'
  });
  const u = buildSocraticUserContent(p);
  assert.ok(u.includes('"student_level":"average"'));
});
