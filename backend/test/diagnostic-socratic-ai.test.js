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

test('isSocraticAiEnabled respects DIAGNOSTIC_SOCRATIC_AI', () => {
  const prev = process.env.DIAGNOSTIC_SOCRATIC_AI;
  process.env.DIAGNOSTIC_SOCRATIC_AI = '0';
  assert.equal(isSocraticAiEnabled(), false);
  process.env.DIAGNOSTIC_SOCRATIC_AI = '1';
  assert.equal(isSocraticAiEnabled(), true);
  delete process.env.DIAGNOSTIC_SOCRATIC_AI;
  assert.equal(isSocraticAiEnabled(), true);
  if (prev !== undefined) process.env.DIAGNOSTIC_SOCRATIC_AI = prev;
  else delete process.env.DIAGNOSTIC_SOCRATIC_AI;
});

test('isPromptUsable and normalizeTemplatePrompt', () => {
  assert.equal(isPromptUsable('ab'), false);
  assert.equal(isPromptUsable('abc'), true);
  assert.equal(normalizeTemplatePrompt('  x  '), 'x');
  assert.equal(normalizeTemplatePrompt('   '), null);
});

test('resolve returns template when AI disabled', async () => {
  const prev = process.env.DIAGNOSTIC_SOCRATIC_AI;
  process.env.DIAGNOSTIC_SOCRATIC_AI = '0';
  const r = await resolveSocraticTeacherPrompt({
    templatePrompt: 'Keep this',
    concept: { id: 1, name: 'C' },
    studentLevel: 'weak',
    scoreResult: { pointsMissed: [{ description: 'a' }] },
    socraticTurns: [],
    phase: 'socratic'
  });
  assert.equal(r.source, 'template');
  assert.equal(r.prompt, 'Keep this');
  assert.equal(r.fallback_reason, 'disabled');
  if (prev !== undefined) process.env.DIAGNOSTIC_SOCRATIC_AI = prev;
  else delete process.env.DIAGNOSTIC_SOCRATIC_AI;
});

test('resolve returns template when no concept', async () => {
  const r = await resolveSocraticTeacherPrompt({
    templatePrompt: 'T',
    concept: null,
    studentLevel: 'weak',
    scoreResult: {},
    socraticTurns: [],
    phase: 'socratic'
  });
  assert.equal(r.source, 'template');
  assert.equal(r.prompt, 'T');
  assert.equal(r.fallback_reason, 'no_concept');
});
