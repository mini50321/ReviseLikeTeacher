const { db, initDatabase } = require('../db');
const concept = require('../data/hearing-pathway-concept.js');

async function seed() {
  await initDatabase();
  const existing = await db.query(
    'SELECT id FROM topic_concept WHERE subject = $1 AND topic = $2 AND concept_key = $3',
    [concept.subject, concept.topic, concept.concept_key]
  );
  const id = (existing.rows && existing.rows.length > 0)
    ? existing.rows[0].id
    : db.generateUUID();

  const fields = [
    'subject', 'topic', 'concept_key', 'concept_map_id', 'name', 'display_order', 'concept_weight',
    'section', 'chapter', 'main_topic', 'subtopic',
    'prerequisite_concept_ids', 'downstream_concept_ids',
    'must_know_points', 'deep_points', 'traps',
    'saqs', 'mcqs', 'leading_questions', 'grading_rubric', 'example_phrases', 'micro_questions'
  ];
  const values = [
    concept.subject,
    concept.topic,
    concept.concept_key,
    concept.concept_map_id || null,
    concept.name,
    concept.display_order != null ? concept.display_order : 1,
    concept.concept_weight != null ? concept.concept_weight : 1,
    concept.section || null,
    concept.chapter || null,
    concept.main_topic || null,
    concept.subtopic || null,
    JSON.stringify(Array.isArray(concept.prerequisite_concept_ids) ? concept.prerequisite_concept_ids : []),
    JSON.stringify(Array.isArray(concept.downstream_concept_ids) ? concept.downstream_concept_ids : []),
    JSON.stringify(Array.isArray(concept.must_know_points) ? concept.must_know_points : []),
    JSON.stringify(Array.isArray(concept.deep_points) ? concept.deep_points : []),
    JSON.stringify(Array.isArray(concept.traps) ? concept.traps : []),
    JSON.stringify(Array.isArray(concept.saqs) ? concept.saqs : []),
    JSON.stringify(Array.isArray(concept.mcqs) ? concept.mcqs : []),
    JSON.stringify(Array.isArray(concept.leading_questions) ? concept.leading_questions : []),
    JSON.stringify(Array.isArray(concept.grading_rubric) ? concept.grading_rubric : []),
    JSON.stringify(Array.isArray(concept.example_phrases) ? concept.example_phrases : []),
    JSON.stringify(Array.isArray(concept.micro_questions) ? concept.micro_questions : [])
  ];

  if (existing.rows && existing.rows.length > 0) {
    await db.query(
      `UPDATE topic_concept SET
        concept_map_id = $1, concept_weight = $2, section = $3, chapter = $4, main_topic = $5, subtopic = $6,
        prerequisite_concept_ids = $7, downstream_concept_ids = $8,
        must_know_points = $9, deep_points = $10, traps = $11, saqs = $12, mcqs = $13,
        leading_questions = $14, grading_rubric = $15, example_phrases = $16, micro_questions = $17,
        updated_at = CURRENT_TIMESTAMP WHERE id = $18`,
      [
        values[3], values[6], values[7], values[8], values[9], values[10],
        values[11], values[12], values[13], values[14], values[15], values[16], values[17],
        values[18], values[19], values[20], values[21], id
      ]
    );
    console.log('Updated: ' + concept.concept_key + ' (' + concept.name + ')');
  } else {
    await db.query(
      `INSERT INTO topic_concept
       (id, subject, topic, concept_key, concept_map_id, name, display_order, concept_weight,
        section, chapter, main_topic, subtopic,
        prerequisite_concept_ids, downstream_concept_ids,
        must_know_points, deep_points, traps, saqs, mcqs,
        leading_questions, grading_rubric, example_phrases, micro_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [id, ...values]
    );
    console.log('Inserted: ' + concept.concept_key + ' (' + concept.name + ')');
  }

  const grossPrompt = 'Describe the physiology of the hearing pathway.';
  const existingPrompt = await db.query(
    'SELECT id FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
    [concept.subject, concept.topic]
  );
  if (!existingPrompt.rows || existingPrompt.rows.length === 0) {
    const promptId = db.generateUUID();
    await db.query(
      'INSERT INTO topic_gross_prompt (id, subject, topic, prompt_text) VALUES ($1, $2, $3, $4)',
      [promptId, concept.subject, concept.topic, grossPrompt]
    );
    console.log('Inserted gross prompt for ' + concept.subject + ' / ' + concept.topic);
  }

  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
