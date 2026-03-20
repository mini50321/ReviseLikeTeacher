const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mapStudentLevelToDiagnosticLevel,
  levelToMasteryStatus,
  buildTutorPrompt,
  buildTutorPlan,
  serializeTopicConcept
} = require('../services/diagnostic-tutor-rules');

test('maps student levels to diagnostic levels', () => {
  assert.equal(mapStudentLevelToDiagnosticLevel('excellent'), 'strong');
  assert.equal(mapStudentLevelToDiagnosticLevel('average'), 'average');
  assert.equal(mapStudentLevelToDiagnosticLevel('very_weak'), 'weak');
});

test('maps student levels to mastery states', () => {
  assert.equal(levelToMasteryStatus('strong'), 'mastered');
  assert.equal(levelToMasteryStatus('average'), 'in_progress');
  assert.equal(levelToMasteryStatus('weak'), 'needs_reinforcement');
});

test('builds a focused tutor prompt from concept gaps', () => {
  const concept = {
    name: 'Physiology of Hearing Pathway',
    leading_questions: ['What happens after the tympanic membrane vibrates?'],
    must_know_points: [{ label: 'Oval window', description: 'Stapes transmits vibration to the oval window.' }]
  };
  const prompt = buildTutorPrompt(concept, 'average', { pointsMissed: [{ description: 'Stapes transmits vibration to the oval window.' }] }, 'stapes');
  assert.match(prompt, /you're close|which structure/i);
  assert.match(prompt, /oval window/i);
});

test('builds simpler prompts for weaker students', () => {
  const concept = {
    name: 'Physiology of Hearing Pathway',
    leading_questions: ['What happens after the tympanic membrane vibrates?'],
    must_know_points: [{ label: 'Tympanic membrane', description: 'The membrane vibrates first.' }]
  };
  const weakPrompt = buildTutorPrompt(concept, 'weak', { pointsMissed: [] }, '');
  const veryWeakPrompt = buildTutorPrompt(concept, 'very_weak', { pointsMissed: [] }, 'sound goes to brain');
  assert.match(weakPrompt, /one step at a time/i);
  assert.match(veryWeakPrompt, /rebuild it step-by-step|which structure/i);
});

test('continuing Socratic uses transition wording instead of repeating rebuild intro', () => {
  const concept = {
    name: 'Physiology of Hearing Pathway',
    leading_questions: ['What happens after the tympanic membrane vibrates?'],
    must_know_points: [{ label: 'Tympanic membrane', description: 'Tympanic membrane converts sound waves into mechanical vibration.' }]
  };
  const sr = { pointsMissed: [{ description: 'Tympanic membrane converts sound waves into mechanical vibration.' }] };
  const first = buildTutorPrompt(concept, 'very_weak', sr, '', { socraticTurnCount: 0 });
  const next = buildTutorPrompt(concept, 'very_weak', sr, '', { socraticTurnCount: 1 });
  assert.match(first, /rebuild it step-by-step/i);
  assert.match(next, /next step:/i);
  assert.ok(!/rebuild it step-by-step/i.test(next));
});

test('builds a concept plan from micro-pdf metadata', () => {
  const concept = serializeTopicConcept({
    id: 'c1',
    subject: 'ENT',
    topic: 'Ear',
    concept_key: 'ENT.Ear.HearingPathway',
    name: 'Physiology of Hearing Pathway',
    display_order: 2,
    must_know_points: '[{"label":"Outer ear","description":"Collects sound"}]',
    deep_points: '[]',
    traps: '[]',
    leading_questions: '["What happens first?"]',
    example_phrases: '[]',
    grading_rubric: '[]',
    micro_questions: '[{"question":"Describe the pathway"}]',
    prerequisite_concept_ids: '["c0"]',
    downstream_concept_ids: '["c2"]'
  });

  const plan = buildTutorPlan(concept);
  assert.equal(plan.concept_id, 'c1');
  assert.equal(plan.checkpoints.length, 1);
  assert.equal(plan.saq_count, 1);
  assert.deepEqual(plan.downstream_concepts, ['c2']);
});
