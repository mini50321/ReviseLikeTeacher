const { db } = require('../db');
const axios = require('axios');
const crypto = require('crypto');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function generateLAQ(subject, topic, difficulty = 'medium') {
  const conceptsResult = await db.query(
    `SELECT DISTINCT subtopic FROM question
     WHERE subject = $1 AND topic = $2 AND status = 'active'
       AND yield_category IN ('core', 'frequent')
     ORDER BY RANDOM() LIMIT 5`,
    [subject, topic]
  );

  const highYieldConcepts = conceptsResult.rows
    .map(r => r.subtopic)
    .filter(Boolean);

  const trapsResult = await db.query(
    `SELECT trap_pattern, distractor_analysis FROM question
     WHERE subject = $1 AND topic = $2 AND status = 'active'
       AND (trap_pattern IS NOT NULL OR distractor_analysis IS NOT NULL)
     LIMIT 10`,
    [subject, topic]
  );

  const pyqTraps = trapsResult.rows.map(r => {
    const trap = safeJsonParse(r.trap_pattern, null);
    const distractor = safeJsonParse(r.distractor_analysis, null);
    return trap || distractor;
  }).filter(Boolean);

  const response = await axios.post(`${AI_SERVICE_URL}/generate-laq`, {
    subject,
    topic,
    high_yield_concepts: highYieldConcepts,
    pyq_traps: pyqTraps,
    difficulty
  });

  const data = response.data;
  const laqId = crypto.randomUUID();

  await db.query(
    `INSERT INTO laq_generation (id, subject, topic, vignette, questions, model_answers, key_concepts_tested, integrated_topics, clinical_pearls, common_mistakes, trap_elements, difficulty, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')`,
    [
      laqId,
      subject,
      topic,
      data.vignette,
      JSON.stringify(data.questions || []),
      JSON.stringify(data.model_answers || []),
      JSON.stringify(data.key_concepts_tested || []),
      JSON.stringify(data.integrated_topics || []),
      JSON.stringify(data.clinical_pearls || []),
      JSON.stringify(data.common_mistakes || []),
      JSON.stringify(data.trap_elements || []),
      data.difficulty || difficulty
    ]
  );

  return {
    id: laqId,
    subject,
    topic,
    vignette: data.vignette,
    questions: data.questions,
    model_answers: data.model_answers,
    key_concepts_tested: data.key_concepts_tested,
    integrated_topics: data.integrated_topics,
    clinical_pearls: data.clinical_pearls,
    common_mistakes: data.common_mistakes,
    trap_elements: data.trap_elements,
    difficulty: data.difficulty || difficulty
  };
}

async function getLAQs(filters = {}) {
  let whereClause = '1=1';
  const params = [];
  let idx = 1;

  if (filters.subject) {
    whereClause += ` AND subject = $${idx++}`;
    params.push(filters.subject);
  }
  if (filters.topic) {
    whereClause += ` AND topic = $${idx++}`;
    params.push(filters.topic);
  }
  if (filters.status) {
    whereClause += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters.difficulty) {
    whereClause += ` AND difficulty = $${idx++}`;
    params.push(filters.difficulty);
  }

  const result = await db.query(
    `SELECT * FROM laq_generation WHERE ${whereClause} ORDER BY created_at DESC LIMIT 100`,
    params
  );

  return result.rows.map(r => ({
    ...r,
    questions: safeJsonParse(r.questions, []),
    model_answers: safeJsonParse(r.model_answers, []),
    key_concepts_tested: safeJsonParse(r.key_concepts_tested, []),
    integrated_topics: safeJsonParse(r.integrated_topics, []),
    clinical_pearls: safeJsonParse(r.clinical_pearls, []),
    common_mistakes: safeJsonParse(r.common_mistakes, []),
    trap_elements: safeJsonParse(r.trap_elements, [])
  }));
}

async function getLAQById(laqId) {
  const result = await db.query(
    `SELECT * FROM laq_generation WHERE id = $1`,
    [laqId]
  );

  if (result.rows.length === 0) return null;

  const r = result.rows[0];
  return {
    ...r,
    questions: safeJsonParse(r.questions, []),
    model_answers: safeJsonParse(r.model_answers, []),
    key_concepts_tested: safeJsonParse(r.key_concepts_tested, []),
    integrated_topics: safeJsonParse(r.integrated_topics, []),
    clinical_pearls: safeJsonParse(r.clinical_pearls, []),
    common_mistakes: safeJsonParse(r.common_mistakes, []),
    trap_elements: safeJsonParse(r.trap_elements, [])
  };
}

async function getLAQStats() {
  const total = await db.query(`SELECT COUNT(*) as count FROM laq_generation`);
  const byStatus = await db.query(`SELECT status, COUNT(*) as count FROM laq_generation GROUP BY status`);
  const byDifficulty = await db.query(`SELECT difficulty, COUNT(*) as count FROM laq_generation GROUP BY difficulty`);
  const bySubject = await db.query(
    `SELECT subject, COUNT(*) as count FROM laq_generation GROUP BY subject ORDER BY count DESC`
  );
  const topTopics = await db.query(
    `SELECT subject, topic, COUNT(*) as count FROM laq_generation GROUP BY subject, topic ORDER BY count DESC LIMIT 15`
  );

  return {
    total: total.rows[0]?.count || 0,
    by_status: byStatus.rows.reduce((acc, r) => { acc[r.status] = r.count; return acc; }, {}),
    by_difficulty: byDifficulty.rows.reduce((acc, r) => { acc[r.difficulty] = r.count; return acc; }, {}),
    by_subject: bySubject.rows,
    top_topics: topTopics.rows
  };
}

async function reviewLAQ(laqId, action, adminId, editedData = null) {
  const laq = await db.query(`SELECT * FROM laq_generation WHERE id = $1`, [laqId]);
  if (laq.rows.length === 0) throw new Error('LAQ not found');

  if (action === 'approve') {
    const r = laq.rows[0];
    const qId = crypto.randomUUID();

    const vignette = r.vignette;
    const questions = safeJsonParse(r.questions, []);
    const fullStem = `${vignette}\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    await db.query(
      `INSERT INTO question (id, stem, type, subject, topic, difficulty, importance, cognitive_focus, ideal_answer, key_points, status, created_by)
       VALUES ($1, $2, 'laq', $3, $4, $5, 'high', 'clinical', $6, $7, 'active', $8)`,
      [
        qId,
        fullStem,
        r.subject,
        r.topic,
        r.difficulty,
        JSON.stringify(safeJsonParse(r.model_answers, [])),
        JSON.stringify(safeJsonParse(r.key_concepts_tested, [])),
        adminId
      ]
    );

    await db.query(
      `UPDATE laq_generation SET status = 'approved', generated_question_id = $1, reviewed_by = $2, reviewed_at = datetime('now') WHERE id = $3`,
      [qId, adminId, laqId]
    );

    return { status: 'approved', question_id: qId };

  } else if (action === 'reject') {
    await db.query(
      `UPDATE laq_generation SET status = 'rejected', reviewed_by = $1, reviewed_at = datetime('now') WHERE id = $2`,
      [adminId, laqId]
    );
    return { status: 'rejected' };

  } else if (action === 'edit') {
    if (!editedData) throw new Error('Edited data required');

    const updates = [];
    const updateParams = [];
    let pIdx = 1;

    if (editedData.vignette) { updates.push(`vignette = $${pIdx++}`); updateParams.push(editedData.vignette); }
    if (editedData.questions) { updates.push(`questions = $${pIdx++}`); updateParams.push(JSON.stringify(editedData.questions)); }
    if (editedData.model_answers) { updates.push(`model_answers = $${pIdx++}`); updateParams.push(JSON.stringify(editedData.model_answers)); }
    if (editedData.clinical_pearls) { updates.push(`clinical_pearls = $${pIdx++}`); updateParams.push(JSON.stringify(editedData.clinical_pearls)); }
    if (editedData.difficulty) { updates.push(`difficulty = $${pIdx++}`); updateParams.push(editedData.difficulty); }

    updates.push(`status = 'edited'`);
    updates.push(`reviewed_by = $${pIdx++}`);
    updateParams.push(adminId);
    updates.push(`reviewed_at = datetime('now')`);
    updateParams.push(laqId);

    await db.query(
      `UPDATE laq_generation SET ${updates.join(', ')} WHERE id = $${pIdx}`,
      updateParams
    );

    return { status: 'edited' };
  }

  throw new Error('Invalid action');
}

async function deleteLAQ(laqId) {
  const laq = await db.query(`SELECT generated_question_id FROM laq_generation WHERE id = $1`, [laqId]);
  if (laq.rows.length === 0) throw new Error('LAQ not found');

  if (laq.rows[0].generated_question_id) {
    await db.query(`DELETE FROM question WHERE id = $1`, [laq.rows[0].generated_question_id]);
  }

  await db.query(`DELETE FROM laq_generation WHERE id = $1`, [laqId]);
  return { deleted: true };
}

async function getAvailableTopics() {
  const result = await db.query(
    `SELECT DISTINCT subject, topic, COUNT(*) as question_count
     FROM question WHERE type = 'mcq' AND status = 'active'
     GROUP BY subject, topic
     HAVING question_count >= 3
     ORDER BY subject, topic`
  );
  return result.rows;
}

function safeJsonParse(str, fallback) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || fallback);
  } catch {
    return fallback;
  }
}

module.exports = {
  generateLAQ,
  getLAQs,
  getLAQById,
  getLAQStats,
  reviewLAQ,
  deleteLAQ,
  getAvailableTopics
};

