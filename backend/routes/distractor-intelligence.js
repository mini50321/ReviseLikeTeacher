const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.post('/enrich', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, limit = 10 } = req.body;

    let query = `SELECT id, stem, type, subject, topic, subtopic, options, correct_answer,
                        distractor_analysis, concept_tags, trap_pattern
                 FROM question WHERE status = 'active' AND type = 'mcq'
                 AND (distractor_analysis IS NULL OR distractor_analysis = '' OR distractor_analysis = '{}')`;
    const params = [];
    let paramCount = 1;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND topic = $${paramCount++}`;
      params.push(topic);
    }

    query += ` LIMIT $${paramCount}`;
    params.push(Math.min(parseInt(limit), 20));

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.json({ message: 'No questions need enrichment', enriched: 0 });
    }

    const questions = result.rows.map(r => ({
      id: r.id,
      stem: r.stem,
      type: r.type,
      subject: r.subject,
      topic: r.topic,
      subtopic: r.subtopic,
      options: safeParse(r.options, {}),
      correct_answer: r.correct_answer
    }));

    let enrichments;
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/enrich-distractors`, {
        questions
      }, { timeout: 90000 });
      enrichments = aiResponse.data.enrichments || [];
    } catch (aiErr) {
      console.error('AI enrichment error:', aiErr.message);
      enrichments = buildFallbackDistractorEnrichments(questions);
    }

    let enrichedCount = 0;
    for (const e of enrichments) {
      if (!e.question_id || e.question_id === 'unknown') continue;

      const updates = [];
      const updateParams = [];
      let pIdx = 1;

      if (e.distractor_analysis && Object.keys(e.distractor_analysis).length > 0) {
        updates.push(`distractor_analysis = $${pIdx++}`);
        updateParams.push(JSON.stringify(e.distractor_analysis));
      }

      if (e.concept_tags && e.concept_tags.length > 0) {
        updates.push(`concept_tags = $${pIdx++}`);
        updateParams.push(JSON.stringify(e.concept_tags));
      }

      if (e.trap_pattern) {
        updates.push(`trap_pattern = $${pIdx++}`);
        updateParams.push(e.trap_pattern);
      }

      if (updates.length > 0) {
        updateParams.push(e.question_id);
        await db.query(
          `UPDATE question SET ${updates.join(', ')} WHERE id = $${pIdx}`,
          updateParams
        );
        enrichedCount++;
      }
    }

    res.json({
      message: `Enriched ${enrichedCount} questions`,
      enriched: enrichedCount,
      total_processed: questions.length,
      enrichments: enrichments.map(e => ({
        question_id: e.question_id,
        enriched: e.enriched,
        has_distractor_analysis: !!(e.distractor_analysis && Object.keys(e.distractor_analysis).length > 0),
        concept_tags: e.concept_tags || [],
        trap_pattern: e.trap_pattern || null,
        error_archetype: e.error_archetype || null
      }))
    });
  } catch (error) {
    console.error('Enrich distractors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.query;

    let whereClause = `WHERE status = 'active' AND type = 'mcq'`;
    const params = [];
    let pIdx = 1;

    if (subject) {
      whereClause += ` AND subject = $${pIdx++}`;
      params.push(subject);
    }
    if (topic) {
      whereClause += ` AND topic = $${pIdx++}`;
      params.push(topic);
    }

    const totalResult = await db.query(
      `SELECT COUNT(*) as total FROM question ${whereClause}`,
      params
    );

    const enrichedResult = await db.query(
      `SELECT COUNT(*) as enriched FROM question ${whereClause}
       AND distractor_analysis IS NOT NULL AND distractor_analysis != '' AND distractor_analysis != '{}'`,
      params
    );

    const conceptTaggedResult = await db.query(
      `SELECT COUNT(*) as tagged FROM question ${whereClause}
       AND concept_tags IS NOT NULL AND concept_tags != '' AND concept_tags != '[]'`,
      params
    );

    const trapPatternResult = await db.query(
      `SELECT COUNT(*) as trapped FROM question ${whereClause}
       AND trap_pattern IS NOT NULL AND trap_pattern != ''`,
      params
    );

    const subjectBreakdown = await db.query(
      `SELECT subject,
              COUNT(*) as total,
              SUM(CASE WHEN distractor_analysis IS NOT NULL AND distractor_analysis != '' AND distractor_analysis != '{}' THEN 1 ELSE 0 END) as enriched,
              SUM(CASE WHEN concept_tags IS NOT NULL AND concept_tags != '' AND concept_tags != '[]' THEN 1 ELSE 0 END) as concept_tagged,
              SUM(CASE WHEN trap_pattern IS NOT NULL AND trap_pattern != '' THEN 1 ELSE 0 END) as trap_identified
       FROM question WHERE status = 'active' AND type = 'mcq'
       GROUP BY subject ORDER BY total DESC`
    );

    res.json({
      total_mcqs: parseInt(totalResult.rows[0]?.total || 0),
      enriched_count: parseInt(enrichedResult.rows[0]?.enriched || 0),
      concept_tagged_count: parseInt(conceptTaggedResult.rows[0]?.tagged || 0),
      trap_pattern_count: parseInt(trapPatternResult.rows[0]?.trapped || 0),
      coverage_percentage: totalResult.rows[0]?.total > 0
        ? Math.round((parseInt(enrichedResult.rows[0]?.enriched || 0) / parseInt(totalResult.rows[0]?.total)) * 100)
        : 0,
      subject_breakdown: subjectBreakdown.rows.map(r => ({
        subject: r.subject,
        total: parseInt(r.total),
        enriched: parseInt(r.enriched),
        concept_tagged: parseInt(r.concept_tagged),
        trap_identified: parseInt(r.trap_identified),
        coverage: parseInt(r.total) > 0 ? Math.round((parseInt(r.enriched) / parseInt(r.total)) * 100) : 0
      }))
    });
  } catch (error) {
    console.error('Distractor stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/question/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT id, stem, type, subject, topic, subtopic, options, correct_answer,
              distractor_analysis, concept_tags, trap_pattern, difficulty, yield_category
       FROM question WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const q = result.rows[0];
    res.json({
      id: q.id,
      stem: q.stem,
      type: q.type,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      yield_category: q.yield_category,
      options: safeParse(q.options, {}),
      correct_answer: q.correct_answer,
      distractor_analysis: safeParse(q.distractor_analysis, {}),
      concept_tags: safeParse(q.concept_tags, []),
      trap_pattern: q.trap_pattern
    });
  } catch (error) {
    console.error('Get question distractor data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/trap-patterns', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.query;

    let query = `SELECT id, stem, subject, topic, subtopic, trap_pattern, difficulty, yield_category
                 FROM question WHERE status = 'active' AND type = 'mcq'
                 AND trap_pattern IS NOT NULL AND trap_pattern != ''`;
    const params = [];
    let pIdx = 1;

    if (subject) {
      query += ` AND subject = $${pIdx++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND topic = $${pIdx++}`;
      params.push(topic);
    }

    query += ' ORDER BY subject, topic LIMIT 100';

    const result = await db.query(query, params);

    const grouped = {};
    result.rows.forEach(r => {
      const key = `${r.subject}|${r.topic}`;
      if (!grouped[key]) {
        grouped[key] = { subject: r.subject, topic: r.topic, patterns: [] };
      }
      grouped[key].patterns.push({
        question_id: r.id,
        stem_preview: r.stem?.substring(0, 100) || '',
        trap_pattern: r.trap_pattern,
        difficulty: r.difficulty,
        yield_category: r.yield_category
      });
    });

    res.json({ trap_groups: Object.values(grouped) });
  } catch (error) {
    console.error('Trap patterns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/student-vulnerability', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject } = req.query;

    let query = `SELECT a.misconception_type, a.distractor_chosen_meaning, a.concept_tested,
                        q.subject, q.topic, q.subtopic, q.trap_pattern,
                        COUNT(*) as occurrence_count
                 FROM attempt a
                 JOIN question q ON a.question_id = q.id
                 WHERE a.user_id = $1 AND a.ai_score < 70 AND a.misconception_type IS NOT NULL`;
    const params = [userId];
    let pIdx = 2;

    if (subject) {
      query += ` AND q.subject = $${pIdx++}`;
      params.push(subject);
    }

    query += ` GROUP BY a.misconception_type, q.subject, q.topic, q.subtopic, a.distractor_chosen_meaning, a.concept_tested, q.trap_pattern
               ORDER BY occurrence_count DESC LIMIT 50`;

    const result = await db.query(query, params);

    const typeSummary = {};
    result.rows.forEach(r => {
      const t = r.misconception_type || 'unknown';
      if (!typeSummary[t]) {
        typeSummary[t] = { type: t, total: 0, examples: [] };
      }
      typeSummary[t].total += parseInt(r.occurrence_count);
      if (typeSummary[t].examples.length < 5) {
        typeSummary[t].examples.push({
          subject: r.subject,
          topic: r.topic,
          subtopic: r.subtopic,
          distractor_meaning: r.distractor_chosen_meaning,
          concept_tested: r.concept_tested,
          trap_pattern: r.trap_pattern,
          count: parseInt(r.occurrence_count)
        });
      }
    });

    const trapVulnerability = await db.query(
      `SELECT q.trap_pattern, COUNT(*) as times_fallen
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1 AND a.ai_score < 70
         AND q.trap_pattern IS NOT NULL AND q.trap_pattern != ''
       GROUP BY q.trap_pattern
       ORDER BY times_fallen DESC LIMIT 10`,
      [userId]
    );

    res.json({
      error_type_summary: Object.values(typeSummary).sort((a, b) => b.total - a.total),
      top_trap_vulnerabilities: trapVulnerability.rows.map(r => ({
        trap_pattern: r.trap_pattern,
        times_fallen: parseInt(r.times_fallen)
      })),
      total_errors: result.rows.reduce((sum, r) => sum + parseInt(r.occurrence_count), 0)
    });
  } catch (error) {
    console.error('Student vulnerability error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function safeParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function buildFallbackDistractorEnrichments(questions) {
  return questions.map((q) => {
    const options = q.options && typeof q.options === 'object' ? q.options : {};
    const correct = (q.correct_answer || '').toString().trim().toUpperCase();
    const distractorAnalysis = {};

    Object.entries(options).forEach(([key, val]) => {
      const optionKey = key.toString().trim().toUpperCase();
      if (!optionKey || optionKey === correct) return;
      if (!val) return;

      distractorAnalysis[optionKey] = {
        meaning: 'Likely confusion with a related concept; review core concept boundaries.',
        error_type: 'memory_slip'
      };
    });

    const conceptTags = [q.topic, q.subtopic].filter(Boolean).slice(0, 3);
    return {
      question_id: q.id,
      enriched: true,
      error_archetype: 'memory_slip',
      concept_tags: conceptTags,
      trap_pattern: 'Look-alike distractor',
      distractor_analysis: distractorAnalysis
    };
  });
}

module.exports = router;

