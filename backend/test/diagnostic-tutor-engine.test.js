const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMcqLoadForLevel,
  decideTutorMode,
  buildMcqPlan,
  buildTutorStep
} = require('../services/diagnostic-tutor-engine');

test('getMcqLoadForLevel returns expected ranges', () => {
  assert.deepEqual(getMcqLoadForLevel('excellent'), { min: 3, max: 3, branch: 'excellent' });
  assert.deepEqual(getMcqLoadForLevel('strong'), { min: 2, max: 3, branch: 'strong' });
  assert.deepEqual(getMcqLoadForLevel('average'), { min: 3, max: 4, branch: 'average' });
  assert.deepEqual(getMcqLoadForLevel('weak'), { min: 4, max: 4, branch: 'weak' });
  assert.deepEqual(getMcqLoadForLevel('very_weak'), { min: 4, max: 5, branch: 'very_weak' });
});

test('decideTutorMode chooses modes by level and gaps', () => {
  assert.equal(decideTutorMode('excellent', [], []).mode, 'mcq_only');
  assert.equal(decideTutorMode('average', [], []).mode, 'mcq_focus');
  assert.equal(decideTutorMode('weak', [], [{}]).mode, 'socratic_then_mcq');
  assert.equal(decideTutorMode('average', [], [{}]).mode, 'mixed');
});

test('buildMcqPlan returns at least required mcqs when available', () => {
  const concept = {
    mcqs: [
      { id: 'm1', question: 'Q1', options: { A: 'a', B: 'b' }, correct_answer: 'A' },
      { id: 'm2', question: 'Q2', options: { A: 'a', B: 'b' }, correct_answer: 'B' },
      { id: 'm3', question: 'Q3', options: { A: 'a', B: 'b' }, correct_answer: 'A' },
      { id: 'm4', question: 'Q4', options: { A: 'a', B: 'b' }, correct_answer: 'B' },
      { id: 'm5', question: 'Q5', options: { A: 'a', B: 'b' }, correct_answer: 'A' }
    ]
  };
  const planWeak = buildMcqPlan(concept, 'weak', []);
  assert.ok(planWeak.mcqs.length >= planWeak.required_mcqs);
  const planExcellent = buildMcqPlan(concept, 'excellent', []);
  assert.ok(planExcellent.mcqs.length >= planExcellent.required_mcqs);
});

test('buildTutorStep combines mode and mcq plan', () => {
  const concept = {
    name: 'Test Concept',
    mcqs: [
      { id: 'm1', question: 'Q1', options: { A: 'a', B: 'b' }, correct_answer: 'A' },
      { id: 'm2', question: 'Q2', options: { A: 'a', B: 'b' }, correct_answer: 'B' },
      { id: 'm3', question: 'Q3', options: { A: 'a', B: 'b' }, correct_answer: 'A' }
    ]
  };
  const tutorStep = buildTutorStep({
    concept,
    studentLevelResult: { level: 'average' },
    scoreResult: { pointsHit: [], pointsMissed: [{}] },
    answerText: 'some answer',
    usedMcqIds: []
  });
  assert.equal(tutorStep.student_level, 'average');
  assert.ok(['mixed', 'socratic_then_mcq', 'mcq_focus', 'mcq_only'].includes(tutorStep.tutor_mode));
  assert.ok(tutorStep.required_mcqs >= 1);
});

