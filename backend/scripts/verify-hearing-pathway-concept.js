const { db, initDatabase } = require('../db');
const concept = require('../data/hearing-pathway-concept.js');

async function verify() {
  await initDatabase();

  const result = await db.query(
    'SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 AND concept_key = $3',
    [concept.subject, concept.topic, concept.concept_key]
  );

  if (!result.rows || result.rows.length === 0) {
    console.log('No topic_concept row found for', concept.subject, '/', concept.topic, '/', concept.concept_key);
    process.exit(1);
  }

  const row = result.rows[0];

  const fieldsToShow = {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id,
    name: row.name,
    display_order: row.display_order,
    concept_weight: row.concept_weight,
    section: row.section,
    chapter: row.chapter,
    main_topic: row.main_topic,
    subtopic: row.subtopic,
    prerequisite_concept_ids: row.prerequisite_concept_ids,
    downstream_concept_ids: row.downstream_concept_ids
  };

  console.log('Core concept fields:', fieldsToShow);

  const jsonFields = ['must_know_points', 'deep_points', 'traps', 'saqs', 'mcqs', 'leading_questions', 'grading_rubric', 'micro_questions'];
  for (const field of jsonFields) {
    try {
      const parsed = row[field] ? JSON.parse(row[field]) : null;
      console.log(field + ':', Array.isArray(parsed) ? parsed.length + ' items' : parsed);
    } catch (e) {
      console.log(field + ' failed to parse as JSON', e.message);
    }
  }

  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});

