const test = require('node:test');
const assert = require('node:assert/strict');

const { parseMicroPdfConceptText } = require('../services/micropdf-text-parser');

test('parses a structured micro-pdf concept document', () => {
  const text = `
Physiology of Hearing Pathway
Subject: ENT
Section: Ear
Chapter: Physiology of Hearing & Audiometry
Main Topic: Hearing Physiology
Subtopic: Sound Conduction Pathway
Concept Name: Physiology of Hearing Pathway
Concept ID: ENT.Ear.HearingPathway
Concept Type: Core Physiological Concept
Concept Weight: 4
High-Yield Level: High Yield
Concept Dependencies
Prerequisite Concepts: External ear anatomy, middle ear ossicles, cochlear anatomy.
Parallel Concepts: Transformer action of middle ear; Organ of Corti function.
Downstream Concepts: Rinne test, Weber test, Pure tone audiometry, Tympanometry.
Why this dependency matters: Clinical hearing tests localize pathology by identifying which segment of the hearing pathway is impaired.
Concept Explanation
Hearing occurs when sound waves from the environment are converted into electrical impulses interpreted by the brain.
Core Points
• External ear collects sound waves.
• Tympanic membrane converts sound waves into mechanical vibration.
• Cochlea converts vibration into neural impulses.
Important Points
• Organ of Corti is the sensory organ of hearing.
• Primary auditory cortex lies in Heschl's gyrus (area 41).
Competencies Covered
• Define the hearing pathway
• Explain the sequence of sound transmission
Minimum Question Coverage
Concept Weight = 4
Minimum SAQ = 1
Minimum MCQ = 3
SAQs
SAQ 1 Question: Describe the physiology of the hearing pathway.
Core Points: Pinna → EAC → Tympanic membrane → Ossicles → Oval window → Cochlear fluid → Basilar membrane → Organ of Corti → Cochlear nerve → Auditory cortex
Misconceptions: Tympanic membrane detects sound.
Compact Answer: Sound waves collected by the pinna travel through the external auditory canal and vibrate the tympanic membrane.
MCQs (with Socratic Prompts)
Question: Which structure converts mechanical vibration into electrical impulses?
A. Tympanic membrane B. Ossicles C. Organ of Corti D. Oval window
Correct Answer: C
Socratic Prompts: Which structure contains sensory hair cells responsible for mechano-electrical transduction?
Common Reasoning Errors: Confusing tympanic membrane with sensory organ.
Concept Reinforcement: Hair cells of organ of Corti perform transduction.
`;

  const parsed = parseMicroPdfConceptText(text);
  assert.ok(parsed);
  assert.equal(parsed.draft.subject, 'ENT');
  assert.equal(parsed.draft.concepts.length, 1);

  const concept = parsed.draft.concepts[0];
  assert.equal(concept.name, 'Physiology of Hearing Pathway');
  assert.equal(concept.concept_key, 'ENT.Ear.HearingPathway');
  assert.equal(concept.must_know_points.length, 3);
  assert.equal(concept.saqs.length, 1);
  assert.equal(concept.mcqs.length, 1);
  assert.equal(concept.mcqs[0].correct_answer, 'C');
  assert.equal(concept.mcqs[0].options.C, 'Organ of Corti');
  assert.match(concept.traps.join(' '), /Tympanic membrane detects sound/i);
});
