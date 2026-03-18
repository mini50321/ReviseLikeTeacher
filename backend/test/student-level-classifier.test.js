const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyStudentLevel } = require('../services/student-level-classifier');

test('classifies a vague short answer as very weak', () => {
  const concept = {
    grading_rubric: [
      { id: 'eac', label: 'External auditory canal', description: 'Sound travels through EAC', example_phrases: ['external auditory canal'] },
      { id: 'tm', label: 'Tympanic membrane', description: 'First structure to vibrate', example_phrases: ['tympanic membrane'] },
      { id: 'cortex', label: 'Auditory cortex', description: 'Final perception', example_phrases: ['auditory cortex'] }
    ],
    traps: ['Tympanic membrane detects sound.'],
    saqs: [{ compact_answer: 'Sound travels through the ear to the brain' }]
  };

  const result = classifyStudentLevel(concept, 'sound goes to brain');
  assert.equal(result.level, 'very_weak');
  assert.equal(result.score_percent, 0);
});

test('classifies a near-complete compact answer as strong or excellent', () => {
  const concept = {
    grading_rubric: [
      { id: 'eac', label: 'External auditory canal', description: 'Sound travels through EAC', example_phrases: ['external auditory canal'] },
      { id: 'tm', label: 'Tympanic membrane', description: 'First structure to vibrate', example_phrases: ['tympanic membrane'] },
      { id: 'ossicles', label: 'Ossicles', description: 'Malleus incus stapes', example_phrases: ['malleus', 'incus', 'stapes'] },
      { id: 'oval', label: 'Oval window', description: 'Entry to cochlea', example_phrases: ['oval window'] },
      { id: 'cortex', label: 'Auditory cortex', description: 'Final perception', example_phrases: ['auditory cortex'] }
    ],
    traps: [],
    saqs: [{
      compact_answer: 'Sound waves collected by the pinna travel through the external auditory canal and vibrate the tympanic membrane before reaching the auditory cortex.'
    }]
  };

  const result = classifyStudentLevel(
    concept,
    'Sound waves collected by the pinna travel through the external auditory canal, vibrate the tympanic membrane, move the ossicles to the oval window, and ultimately reach the auditory cortex.'
  );
  assert.ok(['strong', 'excellent'].includes(result.level));
  assert.ok(result.score_percent >= 80);
});

