const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function runClusterDetection(subject, topic) {
  let query = `SELECT id, stem, subject, topic, subtopic, options, correct_answer, previous_year_tags
               FROM question WHERE status = 'active'`;
  const params = [];
  let paramIndex = 1;

  if (subject) {
    query += ` AND subject = $${paramIndex}`;
    params.push(subject);
    paramIndex++;
  }
  if (topic) {
    query += ` AND topic = $${paramIndex}`;
    params.push(topic);
    paramIndex++;
  }

  query += ` ORDER BY subject, topic LIMIT 50`;

  const result = await db.query(query, params);
  if (result.rows.length < 2) return { clusters_found: 0, message: 'Need at least 2 questions to detect clusters' };

  const questions = result.rows.map(q => ({
    id: q.id,
    stem: q.stem,
    subject: q.subject,
    topic: q.topic,
    subtopic: q.subtopic,
    options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : [],
    correct_answer: q.correct_answer,
    previous_year_tags: q.previous_year_tags || ''
  }));

  let clusters = [];
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/detect-clusters`, { questions });
    clusters = response.data.clusters || [];
  } catch (error) {
    clusters = buildFallbackConceptClusters(questions);
  }

  let saved = 0;
  for (const cluster of clusters) {
    if (!cluster.question_ids || cluster.question_ids.length < 2) continue;

    const qIds = cluster.question_ids;
    const yearsResult = await db.query(
      `SELECT previous_year_tags FROM question WHERE id IN (${qIds.map(() => '?').join(',')})`,
      qIds
    );

    const allYears = [];
    for (const r of yearsResult.rows) {
      if (r.previous_year_tags) {
        const tags = typeof r.previous_year_tags === 'string' ? r.previous_year_tags : '';
        const yearMatches = tags.match(/\d{4}/g);
        if (yearMatches) allYears.push(...yearMatches.map(Number));
      }
    }

    const uniqueYears = [...new Set(allYears)].sort();
    const yearSpan = uniqueYears.length > 1 ? uniqueYears[uniqueYears.length - 1] - uniqueYears[0] : 0;
    const repetitionScore = Math.min(100, (qIds.length * 15) + (uniqueYears.length * 10) + (yearSpan * 2));

    try {
      await db.query(
        `INSERT INTO concept_cluster (id, cluster_name, subject, topic, subtopic, core_concept, question_ids, question_count, years_appeared, year_span, repetition_score, framing_variants, concept_summary, auto_detected)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1)`,
        [
          db.generateUUID(),
          cluster.cluster_name || 'Unnamed Cluster',
          cluster.subject || subject || '',
          cluster.topic || topic || '',
          cluster.subtopic || '',
          cluster.core_concept || '',
          JSON.stringify(qIds),
          qIds.length,
          JSON.stringify(uniqueYears),
          yearSpan,
          repetitionScore,
          JSON.stringify(cluster.framing_variants || []),
          cluster.concept_summary || ''
        ]
      );
      saved++;
    } catch (err) {
      console.log('Cluster save error:', err.message);
    }
  }

  return { clusters_found: clusters.length, clusters_saved: saved };
}

function buildFallbackConceptClusters(questions) {
  const grouped = new Map();
  for (const q of questions) {
    const key = `${q.subject || ''}||${q.topic || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(q);
  }

  const clusters = [];
  for (const [key, items] of grouped.entries()) {
    if (items.length < 2) continue;
    const [subject, topic] = key.split('||');
    const subtopicCounts = {};
    for (const item of items) {
      const sub = item.subtopic || '';
      subtopicCounts[sub] = (subtopicCounts[sub] || 0) + 1;
    }
    const topSubtopic = Object.entries(subtopicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const uniqueSubtopics = Object.keys(subtopicCounts).filter(Boolean);
    const clusterName = topic ? `${topic} Concept Cluster` : `${subject} Concept Cluster`;
    const coreConcept = topic || subject || 'Related Concept';
    const framingVariants = [];
    if (uniqueSubtopics.length > 0) framingVariants.push(...uniqueSubtopics.slice(0, 5).map(s => `Subtopic focus: ${s}`));
    if (framingVariants.length === 0) framingVariants.push('Similar subject-topic framing');
    clusters.push({
      cluster_name: clusterName,
      core_concept: coreConcept,
      question_ids: items.map(i => i.id),
      framing_variants: framingVariants,
      concept_summary: `${items.length} questions grouped by shared subject-topic pattern.`,
      subject: subject || '',
      topic: topic || '',
      subtopic: topSubtopic || ''
    });
  }

  return clusters;
}

async function getClusterStats() {
  const totalResult = await db.query('SELECT COUNT(*) as cnt FROM concept_cluster');
  const bySubjectResult = await db.query(
    `SELECT subject, COUNT(*) as cnt, AVG(repetition_score) as avg_rep, SUM(question_count) as total_qs
     FROM concept_cluster GROUP BY subject ORDER BY cnt DESC`
  );
  const topRepResult = await db.query(
    `SELECT cluster_name, subject, topic, core_concept, question_count, repetition_score, years_appeared, year_span
     FROM concept_cluster ORDER BY repetition_score DESC LIMIT 15`
  );
  const totalQsClustered = await db.query(
    `SELECT COUNT(DISTINCT value) as cnt FROM concept_cluster, json_each(concept_cluster.question_ids)`
  );

  return {
    total_clusters: totalResult.rows[0]?.cnt || 0,
    total_questions_clustered: totalQsClustered.rows[0]?.cnt || 0,
    by_subject: bySubjectResult.rows.map(r => ({
      subject: r.subject,
      cluster_count: r.cnt,
      avg_repetition_score: Math.round((r.avg_rep || 0) * 100) / 100,
      total_questions: r.total_qs || 0
    })),
    top_repetitions: topRepResult.rows.map(r => ({
      ...r,
      years_appeared: typeof r.years_appeared === 'string' ? JSON.parse(r.years_appeared) : r.years_appeared,
      repetition_score: Math.round((r.repetition_score || 0) * 100) / 100
    }))
  };
}

async function listClusters(subject = null, topic = null, sortBy = 'repetition_score') {
  let query = 'SELECT * FROM concept_cluster WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (subject) {
    query += ` AND subject = $${paramIndex}`;
    params.push(subject);
    paramIndex++;
  }
  if (topic) {
    query += ` AND topic = $${paramIndex}`;
    params.push(topic);
    paramIndex++;
  }

  const sortCol = ['repetition_score', 'question_count', 'year_span', 'created_at'].includes(sortBy) ? sortBy : 'repetition_score';
  query += ` ORDER BY ${sortCol} DESC LIMIT 100`;

  const result = await db.query(query, params);

  return result.rows.map(r => ({
    ...r,
    question_ids: typeof r.question_ids === 'string' ? JSON.parse(r.question_ids) : r.question_ids,
    years_appeared: typeof r.years_appeared === 'string' ? JSON.parse(r.years_appeared) : r.years_appeared,
    framing_variants: typeof r.framing_variants === 'string' ? JSON.parse(r.framing_variants) : r.framing_variants,
    repetition_score: Math.round((r.repetition_score || 0) * 100) / 100
  }));
}

async function getClusterDetail(clusterId) {
  const clusterResult = await db.query('SELECT * FROM concept_cluster WHERE id = $1', [clusterId]);
  if (clusterResult.rows.length === 0) return null;

  const cluster = clusterResult.rows[0];
  const qIds = typeof cluster.question_ids === 'string' ? JSON.parse(cluster.question_ids) : cluster.question_ids;

  const placeholders = qIds.map(() => '?').join(',');
  const questionsResult = await db.query(
    `SELECT id, stem, type, subject, topic, subtopic, options, correct_answer, difficulty, previous_year_tags, yield_category
     FROM question WHERE id IN (${placeholders})`,
    qIds
  );

  return {
    ...cluster,
    question_ids: qIds,
    years_appeared: typeof cluster.years_appeared === 'string' ? JSON.parse(cluster.years_appeared) : cluster.years_appeared,
    framing_variants: typeof cluster.framing_variants === 'string' ? JSON.parse(cluster.framing_variants) : cluster.framing_variants,
    repetition_score: Math.round((cluster.repetition_score || 0) * 100) / 100,
    questions: questionsResult.rows.map(q => ({
      ...q,
      options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : []
    }))
  };
}

async function getRepetitionPatterns(subject = null) {
  let query = `
    SELECT subject, topic, core_concept, question_count, repetition_score, years_appeared, year_span, framing_variants
    FROM concept_cluster
  `;
  const params = [];

  if (subject) {
    query += ' WHERE subject = $1';
    params.push(subject);
  }

  query += ' ORDER BY repetition_score DESC LIMIT 30';

  const result = await db.query(query, params);

  return result.rows.map(r => ({
    subject: r.subject,
    topic: r.topic,
    core_concept: r.core_concept,
    question_count: r.question_count,
    repetition_score: Math.round((r.repetition_score || 0) * 100) / 100,
    years_appeared: typeof r.years_appeared === 'string' ? JSON.parse(r.years_appeared) : r.years_appeared,
    year_span: r.year_span,
    framing_variants: typeof r.framing_variants === 'string' ? JSON.parse(r.framing_variants) : r.framing_variants,
    frequency_label: r.question_count >= 10 ? 'Core' : r.question_count >= 5 ? 'Frequent' : r.question_count >= 2 ? 'Occasional' : 'Rare'
  }));
}

async function deleteCluster(clusterId) {
  await db.query('DELETE FROM concept_cluster WHERE id = $1', [clusterId]);
  return { deleted: true };
}

module.exports = {
  runClusterDetection,
  getClusterStats,
  listClusters,
  getClusterDetail,
  getRepetitionPatterns,
  deleteCluster
};

