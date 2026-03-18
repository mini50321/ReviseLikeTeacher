const { db } = require('../db');
const {
  getNextBestConcept,
  getFullPathway,
  getFirstConceptForSubject,
  serializeConcept: serializeGraphConcept
} = require('./concept-graph-engine');

function generateId() {
  return db.generateUUID ? db.generateUUID() : require('crypto').randomUUID();
}

function parseJson(val, fallback = null) {
  if (val == null || val === '') return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

function serializeConcept(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id || null,
    name: row.name,
    display_order: row.display_order != null ? row.display_order : 0,
    concept_weight: row.concept_weight != null ? row.concept_weight : 1,
    prerequisite_concept_ids: parseJson(row.prerequisite_concept_ids, []),
    downstream_concept_ids: parseJson(row.downstream_concept_ids, []),
    section: row.section || null,
    chapter: row.chapter || null,
    main_topic: row.main_topic || null,
    subtopic: row.subtopic || null
  };
}

async function resolveConceptId(idOrMapId) {
  const byId = await db.query(
    'SELECT * FROM topic_concept WHERE id = $1',
    [idOrMapId]
  );
  if (byId.rows && byId.rows.length > 0) return byId.rows[0];
  const byMapId = await db.query(
    'SELECT * FROM topic_concept WHERE concept_map_id = $1',
    [idOrMapId]
  );
  return (byMapId.rows && byMapId.rows.length > 0) ? byMapId.rows[0] : null;
}

async function getNextInTopic(current) {
  const next = await db.query(
    `SELECT * FROM topic_concept
     WHERE subject = $1 AND topic = $2 AND display_order > $3
     ORDER BY display_order ASC, concept_key ASC LIMIT 1`,
    [current.subject, current.topic, current.display_order != null ? current.display_order : 0]
  );
  return (next.rows && next.rows.length > 0) ? next.rows[0] : null;
}

async function getNextTopic(subject, topic) {
  const currentOrder = await db.query(
    'SELECT display_order FROM topic_pathway_order WHERE subject = $1 AND topic = $2',
    [subject, topic]
  );
  const order = (currentOrder.rows && currentOrder.rows.length > 0)
    ? (currentOrder.rows[0].display_order ?? 999)
    : 999;
  const ordered = await db.query(
    `SELECT topic FROM topic_pathway_order
     WHERE subject = $1 AND display_order > $2
     ORDER BY display_order ASC LIMIT 1`,
    [subject, order]
  );
  if (ordered.rows && ordered.rows.length > 0) return ordered.rows[0].topic;
  const allTopics = await db.query(
    'SELECT DISTINCT topic FROM topic_gross_prompt WHERE subject = $1 ORDER BY topic ASC',
    [subject]
  );
  const topics = (allTopics.rows || []).map(r => r.topic);
  const idx = topics.indexOf(topic);
  if (idx >= 0 && idx < topics.length - 1) return topics[idx + 1];
  return null;
}

async function getFirstConceptInTopic(subject, topic) {
  const r = await db.query(
    `SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2
     ORDER BY display_order ASC, concept_key ASC LIMIT 1`,
    [subject, topic]
  );
  return (r.rows && r.rows.length > 0) ? r.rows[0] : null;
}

async function getNextConcept(currentConceptId) {
  const next = await getNextBestConcept({ currentConceptId });
  return next ? serializeConcept(next) : null;
}

async function getFirstConcept(subject, topic) {
  const first = await getFirstConceptForSubject(subject, topic || null);
  return first ? serializeGraphConcept(first) : null;
}

async function getPathway(subject) {
  const pathway = await getFullPathway({ subject });
  return pathway.concepts.map(serializeGraphConcept);
}

async function getConceptWeight(conceptId) {
  const c = await resolveConceptId(conceptId);
  if (!c) return 1;
  return c.concept_weight != null ? c.concept_weight : 1;
}

async function setTopicPathwayOrder(subject, topics) {
  for (let i = 0; i < topics.length; i++) {
    const existing = await db.query(
      'SELECT id FROM topic_pathway_order WHERE subject = $1 AND topic = $2',
      [subject, topics[i]]
    );
    if (existing.rows && existing.rows.length > 0) {
      await db.query(
        'UPDATE topic_pathway_order SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE subject = $2 AND topic = $3',
        [i, subject, topics[i]]
      );
    } else {
      await db.query(
        'INSERT INTO topic_pathway_order (id, subject, topic, display_order) VALUES ($1, $2, $3, $4)',
        [generateId(), subject, topics[i], i]
      );
    }
  }
}

module.exports = {
  getNextConcept,
  getFirstConcept,
  getPathway,
  getConceptWeight,
  setTopicPathwayOrder,
  resolveConceptId,
  serializeConcept
};
