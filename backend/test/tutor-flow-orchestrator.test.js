const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMaxSocraticTurns,
  getInitialPhase,
  getNextPhase,
  buildTutorFlowPlan
} = require('../services/tutor-flow-orchestrator');

test('getMaxSocraticTurns returns level-based limits', () => {
  assert.equal(getMaxSocraticTurns('excellent'), 1);
  assert.equal(getMaxSocraticTurns('strong'), 2);
  assert.equal(getMaxSocraticTurns('average'), 3);
  assert.equal(getMaxSocraticTurns('weak'), 4);
  assert.equal(getMaxSocraticTurns('very_weak'), 5);
});

test('getInitialPhase starts high performers at mcq', () => {
  assert.equal(getInitialPhase('excellent', { pointsMissed: [] }), 'mcq');
  assert.equal(getInitialPhase('average', { pointsMissed: [{}] }), 'socratic');
});

test('getNextPhase advances through tutoring stages', () => {
  assert.equal(getNextPhase({ phase: 'saq', level: 'strong', scoreResult: { pointsMissed: [] } }), 'mcq');
  assert.equal(getNextPhase({ phase: 'socratic', level: 'weak', scoreResult: { pointsMissed: [{}] }, socraticTurns: [] }), 'socratic');
  assert.equal(getNextPhase({ phase: 'socratic', level: 'weak', scoreResult: { pointsMissed: [{}] }, socraticTurns: [{}, {}, {}, {}] }), 'socratic');
  assert.equal(getNextPhase({ phase: 'final_recall', level: 'average', scoreResult: { pointsMissed: [{}] } }), 'mcq');
});

test('buildTutorFlowPlan returns orchestrated plan data', () => {
  const concept = {
    id: 'concept-1',
    concept_key: 'hearing_pathway',
    name: 'Physiology of Hearing Pathway',
    leading_questions: [{ tier: 1, prompt: 'What happens first?' }],
    must_know_points: [
      { label: 'Tympanic membrane', description: 'Membrane vibrates first' }
    ],
    downstream_concept_ids: ['next-1'],
    mcqs: [
      { id: 'm1', question: 'Q1', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct_answer: 'A' },
      { id: 'm2', question: 'Q2', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct_answer: 'B' },
      { id: 'm3', question: 'Q3', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correct_answer: 'C' }
    ]
  };

  const plan = buildTutorFlowPlan({
    concept,
    studentLevelResult: { level: 'weak' },
    scoreResult: { pointsHit: [], pointsMissed: [{ label: 'Tympanic membrane' }] },
    answerText: 'sound goes to brain',
    phase: 'saq',
    socraticTurns: [],
    usedMcqIds: []
  });

  assert.equal(plan.phase, 'socratic');
  assert.ok(plan.next_teacher_prompt);
  assert.ok(plan.tutor_step);
});

