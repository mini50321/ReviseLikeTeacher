const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSocraticAiResponse,
  assertSocraticAiResponseShape,
  normalizeSocraticAiResponse,
  toClientPayload,
  RESPONSE_VERSION,
  stripJsonFences
} = require('../services/socratic-ai-response');

test('parses object input', () => {
  const r = parseSocraticAiResponse({
    next_teacher_prompt: ' Which structure vibrates first? ',
    teacher_acknowledgment: ' Good start. '
  });
  assert.equal(r.ok, true);
  assert.equal(r.response.next_teacher_prompt, 'Which structure vibrates first?');
  assert.equal(r.response.teacher_acknowledgment, 'Good start.');
  assert.equal(r.response.response_version, RESPONSE_VERSION);
});

test('parses JSON string and markdown fences', () => {
  const raw = '```json\n{"next_teacher_prompt":"Next?"}\n```';
  const r = parseSocraticAiResponse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.response.next_teacher_prompt, 'Next?');
});

test('rejects empty prompt', () => {
  const r = parseSocraticAiResponse({ next_teacher_prompt: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_or_empty_next_teacher_prompt');
});

test('rejects invalid json string', () => {
  const r = parseSocraticAiResponse('not json');
  assert.equal(r.ok, false);
});

test('assertSocraticAiResponseShape matches normalized object', () => {
  const r = parseSocraticAiResponse({ next_teacher_prompt: 'Q?' });
  assert.ok(assertSocraticAiResponseShape(r.response).ok);
});

test('toClientPayload strips version', () => {
  const r = parseSocraticAiResponse({ next_teacher_prompt: 'Hi', teacher_acknowledgment: null });
  const c = toClientPayload(r.response);
  assert.equal(c.next_teacher_prompt, 'Hi');
  assert.ok(!('response_version' in c));
});

test('stripJsonFences handles plain json', () => {
  assert.equal(stripJsonFences('{"a":1}'), '{"a":1}');
});

test('normalize returns null for bad input', () => {
  assert.equal(normalizeSocraticAiResponse(null), null);
  assert.equal(normalizeSocraticAiResponse([]), null);
});
