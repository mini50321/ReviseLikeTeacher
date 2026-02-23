const { db } = require('../db');
const axios = require('axios');
const crypto = require('crypto');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function convertMCQsToSAQs(questionIds) {
  const placeholders = questionIds.map(() => '?').join(',');
  const result = await db.query(
    `SELECT id, stem, options, correct_answer, subject, topic, subtopic, difficulty, yield_category
     FROM question WHERE id IN (${placeholders}) AND type = 'mcq'`,
    questionIds
  );

  if (result.rows.length === 0) {
    return { converted: 0, results: [] };
  }

  const alreadyConverted = await db.query(
    `SELECT source_mcq_id FROM saq_conversion WHERE source_mcq_id IN (${placeholders})`,
    questionIds
  );
  const convertedSet = new Set(alreadyConverted.rows.map(r => r.source_mcq_id));

  const toConvert = result.rows.filter(q => !convertedSet.has(q.id));

  if (toConvert.length === 0) {
    return { converted: 0, results: [], message: 'All selected MCQs already converted' };
  }

  const batches = [];
  for (let i = 0; i < toConvert.length; i += 10) {
    batches.push(toConvert.slice(i, i + 10));
  }

  const allResults = [];

  for (const batch of batches) {
    const payload = batch.map(q => ({
      id: q.id,
      stem: q.stem,
      options: safeJsonParse(q.options, []),
      correct_answer: q.correct_answer,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic
    }));

    try {
      const response = await axios.post(`${AI_SERVICE_URL}/convert-mcq-to-saq`, {
        questions: payload
      });

      const conversions = response.data.conversions || [];

      for (const conv of conversions) {
        if (!conv.success) {
          allResults.push({ source_id: conv.source_question_id, success: false, error: conv.error });
          continue;
        }

        const convId = crypto.randomUUID();
        const sourceQ = batch.find(q => q.id === conv.source_question_id);

        await db.query(
          `INSERT INTO saq_conversion (id, source_mcq_id, saq_stem, core_concept, ideal_answer, key_points, cognitive_level, conversion_type, difficulty, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
          [
            convId,
            conv.source_question_id,
            conv.saq_stem,
            conv.core_concept,
            conv.ideal_answer,
            JSON.stringify(conv.key_points || []),
            conv.cognitive_level || 'conceptual',
            conv.conversion_type || 'explain',
            conv.difficulty || sourceQ?.difficulty || 'medium'
          ]
        );

        allResults.push({
          source_id: conv.source_question_id,
          conversion_id: convId,
          success: true,
          saq_stem: conv.saq_stem,
          core_concept: conv.core_concept,
          cognitive_level: conv.cognitive_level,
          conversion_type: conv.conversion_type
        });
      }
    } catch (err) {
      for (const q of batch) {
        allResults.push({ source_id: q.id, success: false, error: err.message });
      }
    }
  }

  return {
    converted: allResults.filter(r => r.success).length,
    skipped: convertedSet.size,
    results: allResults
  };
}

async function getConversions(filters = {}) {
  let whereClause = '1=1';
  const params = [];
  let paramIdx = 1;

  if (filters.status) {
    whereClause += ` AND sc.status = $${paramIdx++}`;
    params.push(filters.status);
  }

  if (filters.subject) {
    whereClause += ` AND q.subject = $${paramIdx++}`;
    params.push(filters.subject);
  }

  if (filters.topic) {
    whereClause += ` AND q.topic = $${paramIdx++}`;
    params.push(filters.topic);
  }

  if (filters.cognitive_level) {
    whereClause += ` AND sc.cognitive_level = $${paramIdx++}`;
    params.push(filters.cognitive_level);
  }

  if (filters.conversion_type) {
    whereClause += ` AND sc.conversion_type = $${paramIdx++}`;
    params.push(filters.conversion_type);
  }

  const result = await db.query(
    `SELECT sc.*, q.stem as mcq_stem, q.options as mcq_options, q.correct_answer,
            q.subject, q.topic, q.subtopic, q.yield_category, q.difficulty as mcq_difficulty
     FROM saq_conversion sc
     JOIN question q ON q.id = sc.source_mcq_id
     WHERE ${whereClause}
     ORDER BY sc.created_at DESC
     LIMIT 100`,
    params
  );

  return result.rows.map(r => ({
    ...r,
    key_points: safeJsonParse(r.key_points, []),
    mcq_options: safeJsonParse(r.mcq_options, [])
  }));
}

async function getConversionStats() {
  const totalResult = await db.query(
    `SELECT COUNT(*) as total FROM saq_conversion`
  );
  const statusResult = await db.query(
    `SELECT status, COUNT(*) as count FROM saq_conversion GROUP BY status`
  );
  const cognitiveResult = await db.query(
    `SELECT cognitive_level, COUNT(*) as count FROM saq_conversion GROUP BY cognitive_level`
  );
  const typeResult = await db.query(
    `SELECT conversion_type, COUNT(*) as count FROM saq_conversion GROUP BY conversion_type`
  );
  const subjectResult = await db.query(
    `SELECT q.subject, COUNT(*) as count
     FROM saq_conversion sc JOIN question q ON q.id = sc.source_mcq_id
     GROUP BY q.subject ORDER BY count DESC`
  );
  const mcqTotal = await db.query(
    `SELECT COUNT(*) as total FROM question WHERE type = 'mcq'`
  );

  return {
    total_conversions: totalResult.rows[0]?.total || 0,
    total_mcqs: mcqTotal.rows[0]?.total || 0,
    by_status: statusResult.rows.reduce((acc, r) => { acc[r.status] = r.count; return acc; }, {}),
    by_cognitive_level: cognitiveResult.rows.reduce((acc, r) => { acc[r.cognitive_level] = r.count; return acc; }, {}),
    by_conversion_type: typeResult.rows.reduce((acc, r) => { acc[r.conversion_type] = r.count; return acc; }, {}),
    by_subject: subjectResult.rows
  };
}

async function reviewConversion(conversionId, action, adminId, editedData = null) {
  const conv = await db.query(
    `SELECT * FROM saq_conversion WHERE id = $1`,
    [conversionId]
  );

  if (conv.rows.length === 0) {
    throw new Error('Conversion not found');
  }

  if (action === 'approve') {
    const sourceQ = await db.query(
      `SELECT * FROM question WHERE id = $1`,
      [conv.rows[0].source_mcq_id]
    );

    if (sourceQ.rows.length === 0) {
      throw new Error('Source MCQ not found');
    }

    const saqId = crypto.randomUUID();
    const src = sourceQ.rows[0];
    const saqData = conv.rows[0];

    await db.query(
      `INSERT INTO question (id, stem, type, subject, topic, subtopic, difficulty, importance, yield_category, cognitive_focus, ideal_answer, key_points, status, created_by, source_pdf_id)
       VALUES ($1, $2, 'saq', $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $13)`,
      [
        saqId,
        saqData.saq_stem,
        src.subject,
        src.topic,
        src.subtopic,
        saqData.difficulty,
        src.importance,
        src.yield_category,
        saqData.cognitive_level || 'conceptual',
        saqData.ideal_answer,
        saqData.key_points,
        adminId,
        src.source_pdf_id
      ]
    );

    await db.query(
      `UPDATE saq_conversion SET status = 'approved', generated_saq_id = $1, reviewed_by = $2, reviewed_at = datetime('now') WHERE id = $3`,
      [saqId, adminId, conversionId]
    );

    return { status: 'approved', saq_id: saqId };

  } else if (action === 'reject') {
    await db.query(
      `UPDATE saq_conversion SET status = 'rejected', reviewed_by = $1, reviewed_at = datetime('now') WHERE id = $2`,
      [adminId, conversionId]
    );
    return { status: 'rejected' };

  } else if (action === 'edit') {
    if (!editedData) throw new Error('Edited data is required');

    const updates = [];
    const updateParams = [];
    let idx = 1;

    if (editedData.saq_stem) {
      updates.push(`saq_stem = $${idx++}`);
      updateParams.push(editedData.saq_stem);
    }
    if (editedData.core_concept) {
      updates.push(`core_concept = $${idx++}`);
      updateParams.push(editedData.core_concept);
    }
    if (editedData.ideal_answer) {
      updates.push(`ideal_answer = $${idx++}`);
      updateParams.push(editedData.ideal_answer);
    }
    if (editedData.key_points) {
      updates.push(`key_points = $${idx++}`);
      updateParams.push(JSON.stringify(editedData.key_points));
    }
    if (editedData.cognitive_level) {
      updates.push(`cognitive_level = $${idx++}`);
      updateParams.push(editedData.cognitive_level);
    }
    if (editedData.conversion_type) {
      updates.push(`conversion_type = $${idx++}`);
      updateParams.push(editedData.conversion_type);
    }
    if (editedData.difficulty) {
      updates.push(`difficulty = $${idx++}`);
      updateParams.push(editedData.difficulty);
    }

    updates.push(`status = 'edited'`);
    updates.push(`reviewed_by = $${idx++}`);
    updateParams.push(adminId);
    updates.push(`reviewed_at = datetime('now')`);

    updateParams.push(conversionId);

    await db.query(
      `UPDATE saq_conversion SET ${updates.join(', ')} WHERE id = $${idx}`,
      updateParams
    );

    return { status: 'edited' };
  }

  throw new Error('Invalid action');
}

async function getUnconvertedMCQs(filters = {}) {
  let whereClause = `q.type = 'mcq' AND q.status = 'active' AND sc.id IS NULL`;
  const params = [];
  let paramIdx = 1;

  if (filters.subject) {
    whereClause += ` AND q.subject = $${paramIdx++}`;
    params.push(filters.subject);
  }

  if (filters.topic) {
    whereClause += ` AND q.topic = $${paramIdx++}`;
    params.push(filters.topic);
  }

  if (filters.yield_category) {
    whereClause += ` AND q.yield_category = $${paramIdx++}`;
    params.push(filters.yield_category);
  }

  const result = await db.query(
    `SELECT q.id, q.stem, q.subject, q.topic, q.subtopic, q.difficulty, q.yield_category
     FROM question q
     LEFT JOIN saq_conversion sc ON sc.source_mcq_id = q.id
     WHERE ${whereClause}
     ORDER BY
       CASE q.yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 WHEN 'occasional' THEN 3 ELSE 4 END,
       q.subject, q.topic
     LIMIT 200`,
    params
  );

  return result.rows;
}

async function deleteConversion(conversionId) {
  const conv = await db.query(
    `SELECT generated_saq_id FROM saq_conversion WHERE id = $1`,
    [conversionId]
  );

  if (conv.rows.length === 0) {
    throw new Error('Conversion not found');
  }

  if (conv.rows[0].generated_saq_id) {
    await db.query(`DELETE FROM question WHERE id = $1`, [conv.rows[0].generated_saq_id]);
  }

  await db.query(`DELETE FROM saq_conversion WHERE id = $1`, [conversionId]);
  return { deleted: true };
}

function safeJsonParse(str, fallback) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || fallback);
  } catch {
    return fallback;
  }
}

module.exports = {
  convertMCQsToSAQs,
  getConversions,
  getConversionStats,
  reviewConversion,
  getUnconvertedMCQs,
  deleteConversion
};

