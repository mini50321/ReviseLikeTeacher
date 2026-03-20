const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatSocraticTeacherLine,
  isSocraticAiEnabled,
  isPromptUsable,
  normalizeTemplatePrompt,
  resolveSocraticTeacherPrompt
} = require('../services/diagnostic-socratic-ai');

test('formatSocraticTeacherLine joins acknowledgment and question', () => {
  assert.equal(
    formatSocraticTeacherLine({ next_teacher_prompt: ' Q? ', teacher_acknowledgment: ' Hi' }),
    'Hi Q?'
  );
  assert.equal(formatSocraticTeacherLine({ next_teacher_prompt: 'Q?' }), 'Q?');
  assert.equal(formatSocraticTeacherLine(null), null);
});

test('isSocraticAiEnabled is always true', () => {
  assert.equal(isSocraticAiEnabled(), true);
});

test('isPromptUsable and normalizeTemplatePrompt', () => {
  assert.equal(isPromptUsable('ab'), false);
  assert.equal(isPromptUsable('abc'), true);
  assert.equal(normalizeTemplatePrompt('  x  '), 'x');
  assert.equal(normalizeTemplatePrompt('   '), null);
});

test('resolve returns failed when no concept', async () => {
  const r = await resolveSocraticTeacherPrompt({
    templatePrompt: 'T',
    concept: null,
    studentLevel: 'weak',
    scoreResult: {},
    socraticTurns: [],
    phase: 'socratic'
  });
  assert.equal(r.source, 'failed');
  assert.equal(r.prompt, null);
  assert.equal(r.fallback_reason, 'no_concept');
});
