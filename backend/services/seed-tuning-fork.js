const { db } = require('../db');
const concepts = require('../data/tuning-fork-concepts.js');

async function seedTuningFork() {
  let inserted = 0;
  let skipped = 0;

  for (const c of concepts) {
    const existing = await db.query(
      'SELECT id FROM topic_concept WHERE subject = $1 AND topic = $2 AND concept_key = $3',
      [c.subject, c.topic, c.concept_key]
    );
    if (existing.rows && existing.rows.length > 0) {
      const conceptId = existing.rows[0].id;
      await db.query(
        'UPDATE topic_concept SET grading_rubric = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(c.grading_rubric || []), conceptId]
      );
      skipped++;
      continue;
    }
    const id = db.generateUUID();
    await db.query(
      `INSERT INTO topic_concept
       (id, subject, topic, concept_key, name, display_order, must_know_points, deep_points, traps, leading_questions, example_phrases, grading_rubric, micro_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        c.subject,
        c.topic,
        c.concept_key,
        c.name,
        c.display_order,
        JSON.stringify(c.must_know_points || []),
        JSON.stringify(c.deep_points || []),
        JSON.stringify(c.traps || []),
        JSON.stringify(c.leading_questions || []),
        JSON.stringify(c.example_phrases || []),
        JSON.stringify(c.grading_rubric || []),
        JSON.stringify(c.micro_questions || [])
      ]
    );
    inserted++;
  }

  const subject = concepts[0]?.subject || 'ENT';
  const topic = concepts[0]?.topic || 'Tuning Fork Tests';
  const grossPrompt = 'Explain tuning fork tests (Rinne/Weber) and how you interpret CHL vs SNHL.';

  const existingPrompt = await db.query(
    'SELECT id FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
    [subject, topic]
  );
  if (!existingPrompt.rows || existingPrompt.rows.length === 0) {
    const promptId = db.generateUUID();
    await db.query(
      'INSERT INTO topic_gross_prompt (id, subject, topic, prompt_text) VALUES ($1, $2, $3, $4)',
      [promptId, subject, topic, grossPrompt]
    );
  }

  return { inserted, skipped, subject, topic };
}

module.exports = { seedTuningFork };
