const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function autoDetectIntegrations(questionIds) {
  const placeholders = questionIds.map(() => '?').join(',');
  const questionsResult = await db.query(
    `SELECT id, stem, subject, topic, subtopic, options, correct_answer
     FROM question WHERE id IN (${placeholders})`,
    questionIds
  );

  if (questionsResult.rows.length === 0) return { tagged: 0, errors: [] };

  const questions = questionsResult.rows.map(q => ({
    id: q.id,
    stem: q.stem,
    subject: q.subject,
    topic: q.topic,
    subtopic: q.subtopic,
    options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : [],
    correct_answer: q.correct_answer
  }));

  let results = [];
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/detect-integration`, { questions });
    results = response.data.results || [];
  } catch (error) {
    return { tagged: 0, errors: [{ error: 'Integration AI service unavailable' }] };
  }

  let tagged = 0;
  const errors = [];

  for (const result of results) {
    if (result.error) {
      errors.push({ question_id: result.question_id, error: result.error });
      continue;
    }

    const question = questions.find(q => q.id === result.question_id);
    if (!question) continue;

    for (const tag of (result.tags || [])) {
      try {
        await db.query(
          `INSERT INTO integration_tag (id, question_id, primary_subject, primary_topic, linked_subjects, linked_topics, integration_type, integration_label, explanation, difficulty_boost, auto_detected)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)`,
          [
            db.generateUUID(),
            result.question_id,
            question.subject,
            question.topic,
            JSON.stringify(tag.linked_subjects || []),
            JSON.stringify(tag.linked_topics || []),
            tag.integration_type || 'cross_subject',
            tag.integration_label || '',
            tag.explanation || '',
            tag.difficulty_boost || 'none'
          ]
        );
        tagged++;
      } catch (err) {
        errors.push({ question_id: result.question_id, error: err.message });
      }
    }
  }

  return { tagged, errors };
}

async function getIntegrationStats() {
  const totalResult = await db.query('SELECT COUNT(*) as cnt FROM integration_tag');
  const byTypeResult = await db.query(
    `SELECT integration_type, COUNT(*) as cnt FROM integration_tag GROUP BY integration_type ORDER BY cnt DESC`
  );
  const bySubjectResult = await db.query(
    `SELECT primary_subject, COUNT(*) as cnt FROM integration_tag GROUP BY primary_subject ORDER BY cnt DESC`
  );
  const topLabelsResult = await db.query(
    `SELECT integration_label, integration_type, COUNT(*) as cnt FROM integration_tag GROUP BY integration_label ORDER BY cnt DESC LIMIT 20`
  );
  const untaggedResult = await db.query(
    `SELECT COUNT(*) as cnt FROM question WHERE id NOT IN (SELECT DISTINCT question_id FROM integration_tag) AND status = 'active'`
  );

  return {
    total_tags: totalResult.rows[0]?.cnt || 0,
    untagged_questions: untaggedResult.rows[0]?.cnt || 0,
    by_type: byTypeResult.rows,
    by_subject: bySubjectResult.rows,
    top_labels: topLabelsResult.rows
  };
}

async function getIntegrationMap(subject = null) {
  let query = `
    SELECT it.integration_type, it.integration_label, it.primary_subject, it.primary_topic,
           it.linked_subjects, it.linked_topics, it.explanation, it.difficulty_boost,
           q.stem, q.id as question_id, q.type as question_type
    FROM integration_tag it
    JOIN question q ON q.id = it.question_id
  `;
  const params = [];

  if (subject) {
    query += ` WHERE it.primary_subject = $1 OR it.linked_subjects LIKE $2`;
    params.push(subject, `%${subject}%`);
  }

  query += ` ORDER BY it.integration_type, it.primary_subject`;

  const result = await db.query(query, params);

  const map = {};
  for (const row of result.rows) {
    const key = row.integration_label;
    if (!map[key]) {
      map[key] = {
        label: row.integration_label,
        type: row.integration_type,
        primary_subject: row.primary_subject,
        primary_topic: row.primary_topic,
        linked_subjects: typeof row.linked_subjects === 'string' ? JSON.parse(row.linked_subjects) : row.linked_subjects,
        linked_topics: typeof row.linked_topics === 'string' ? JSON.parse(row.linked_topics) : row.linked_topics,
        explanation: row.explanation,
        difficulty_boost: row.difficulty_boost,
        questions: []
      };
    }
    map[key].questions.push({
      id: row.question_id,
      stem: row.stem,
      type: row.question_type
    });
  }

  return Object.values(map);
}

async function getIntegrationPractice(userId, subject = null, integrationType = null, limit = 15) {
  let query = `
    SELECT DISTINCT q.id, q.stem, q.type, q.subject, q.topic, q.subtopic,
           q.options, q.correct_answer, q.difficulty,
           it.integration_type, it.integration_label, it.linked_subjects, it.linked_topics, it.explanation
    FROM integration_tag it
    JOIN question q ON q.id = it.question_id
    WHERE q.status = 'active'
  `;
  const params = [];
  let paramIndex = 1;

  if (subject) {
    query += ` AND (it.primary_subject = $${paramIndex} OR it.linked_subjects LIKE $${paramIndex + 1})`;
    params.push(subject, `%${subject}%`);
    paramIndex += 2;
  }

  if (integrationType) {
    query += ` AND it.integration_type = $${paramIndex}`;
    params.push(integrationType);
    paramIndex += 1;
  }

  const attemptedResult = await db.query(
    `SELECT DISTINCT question_id FROM attempt WHERE user_id = $1`,
    [userId]
  );
  const attemptedIds = new Set(attemptedResult.rows.map(r => r.question_id));

  query += ` ORDER BY RANDOM() LIMIT $${paramIndex}`;
  params.push(limit * 2);

  const result = await db.query(query, params);

  const unattempted = result.rows.filter(q => !attemptedIds.has(q.id));
  const attempted = result.rows.filter(q => attemptedIds.has(q.id));
  const combined = [...unattempted, ...attempted].slice(0, limit);

  return combined.map(q => ({
    ...q,
    options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : [],
    linked_subjects: q.linked_subjects ? (typeof q.linked_subjects === 'string' ? JSON.parse(q.linked_subjects) : q.linked_subjects) : [],
    linked_topics: q.linked_topics ? (typeof q.linked_topics === 'string' ? JSON.parse(q.linked_topics) : q.linked_topics) : []
  }));
}

async function getSubjectConnections() {
  const result = await db.query(`
    SELECT primary_subject, linked_subjects, COUNT(*) as cnt
    FROM integration_tag
    GROUP BY primary_subject, linked_subjects
    ORDER BY cnt DESC
  `);

  const edges = [];
  for (const row of result.rows) {
    const linked = typeof row.linked_subjects === 'string' ? JSON.parse(row.linked_subjects) : (row.linked_subjects || []);
    for (const ls of linked) {
      const existing = edges.find(e =>
        (e.source === row.primary_subject && e.target === ls) ||
        (e.source === ls && e.target === row.primary_subject)
      );
      if (existing) {
        existing.weight += (row.cnt || 1);
      } else {
        edges.push({
          source: row.primary_subject,
          target: ls,
          weight: row.cnt || 1
        });
      }
    }
  }

  edges.sort((a, b) => b.weight - a.weight);

  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.source); nodes.add(e.target); });

  return {
    nodes: Array.from(nodes),
    edges: edges.slice(0, 50)
  };
}

async function addManualTag(questionId, tagData) {
  const qResult = await db.query('SELECT subject, topic FROM question WHERE id = $1', [questionId]);
  if (qResult.rows.length === 0) throw new Error('Question not found');

  const q = qResult.rows[0];
  const id = db.generateUUID();

  await db.query(
    `INSERT INTO integration_tag (id, question_id, primary_subject, primary_topic, linked_subjects, linked_topics, integration_type, integration_label, explanation, difficulty_boost, auto_detected)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)`,
    [
      id,
      questionId,
      q.subject,
      q.topic,
      JSON.stringify(tagData.linked_subjects || []),
      JSON.stringify(tagData.linked_topics || []),
      tagData.integration_type || 'cross_subject',
      tagData.integration_label || '',
      tagData.explanation || '',
      tagData.difficulty_boost || 'none'
    ]
  );

  return { id, question_id: questionId };
}

async function deleteTag(tagId) {
  await db.query('DELETE FROM integration_tag WHERE id = $1', [tagId]);
  return { deleted: true };
}

module.exports = {
  autoDetectIntegrations,
  getIntegrationStats,
  getIntegrationMap,
  getIntegrationPractice,
  getSubjectConnections,
  addManualTag,
  deleteTag
};

