const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.post('/generate', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    const existing = await db.query(
      'SELECT * FROM teaching_unit WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );

    if (existing.rows.length > 0) {
      const unit = existing.rows[0];
      return res.json({
        id: unit.id,
        subject: unit.subject,
        topic: unit.topic,
        concept_core_block: safeParse(unit.concept_core_block, []),
        comparison_tables: safeParse(unit.comparison_tables, []),
        clinical_scenarios: safeParse(unit.clinical_scenarios, []),
        numerical_recall_points: safeParse(unit.numerical_recall_points, []),
        trap_patterns: safeParse(unit.trap_patterns, []),
        generated_by: unit.generated_by,
        generated_at: unit.generated_at,
        already_existed: true
      });
    }

    const subtopicsResult = await db.query(
      `SELECT DISTINCT subtopic FROM question WHERE subject = $1 AND topic = $2 AND status = 'active' AND subtopic IS NOT NULL`,
      [subject, topic]
    );
    const subtopics = subtopicsResult.rows.map(r => r.subtopic).filter(Boolean);

    const pyqResult = await db.query(
      `SELECT stem, subtopic, yield_category FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END
       LIMIT 10`,
      [subject, topic]
    );

    let aiResult;
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/generate-teaching-unit`, {
        subject,
        topic,
        subtopics,
        pyq_data: pyqResult.rows
      }, { timeout: 60000 });
      aiResult = aiResponse.data;
    } catch (aiErr) {
      console.error('AI service error for teaching unit:', aiErr.message);
      aiResult = getFallbackUnit(subject, topic);
    }

    const id = db.generateUUID();
    await db.query(
      `INSERT INTO teaching_unit (id, subject, topic, concept_core_block, comparison_tables, clinical_scenarios, numerical_recall_points, trap_patterns, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, subject, topic,
        JSON.stringify(aiResult.concept_core_block || []),
        JSON.stringify(aiResult.comparison_tables || []),
        JSON.stringify(aiResult.clinical_scenarios || []),
        JSON.stringify(aiResult.numerical_recall_points || []),
        JSON.stringify(aiResult.trap_patterns || []),
        aiResult.model || 'unknown'
      ]
    );

    res.json({
      id,
      subject,
      topic,
      concept_core_block: aiResult.concept_core_block || [],
      comparison_tables: aiResult.comparison_tables || [],
      clinical_scenarios: aiResult.clinical_scenarios || [],
      numerical_recall_points: aiResult.numerical_recall_points || [],
      trap_patterns: aiResult.trap_patterns || [],
      generated_by: aiResult.model || 'unknown',
      generated_at: new Date().toISOString(),
      already_existed: false
    });
  } catch (error) {
    console.error('Generate teaching unit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/regenerate', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    await db.query(
      'DELETE FROM teaching_unit WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );

    const subtopicsResult = await db.query(
      `SELECT DISTINCT subtopic FROM question WHERE subject = $1 AND topic = $2 AND status = 'active' AND subtopic IS NOT NULL`,
      [subject, topic]
    );
    const subtopics = subtopicsResult.rows.map(r => r.subtopic).filter(Boolean);

    const pyqResult = await db.query(
      `SELECT stem, subtopic, yield_category FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END
       LIMIT 10`,
      [subject, topic]
    );

    let aiResult;
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/generate-teaching-unit`, {
        subject,
        topic,
        subtopics,
        pyq_data: pyqResult.rows
      }, { timeout: 60000 });
      aiResult = aiResponse.data;
    } catch (aiErr) {
      console.error('AI service error for teaching unit regeneration:', aiErr.message);
      aiResult = getFallbackUnit(subject, topic);
    }

    const id = db.generateUUID();
    await db.query(
      `INSERT INTO teaching_unit (id, subject, topic, concept_core_block, comparison_tables, clinical_scenarios, numerical_recall_points, trap_patterns, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, subject, topic,
        JSON.stringify(aiResult.concept_core_block || []),
        JSON.stringify(aiResult.comparison_tables || []),
        JSON.stringify(aiResult.clinical_scenarios || []),
        JSON.stringify(aiResult.numerical_recall_points || []),
        JSON.stringify(aiResult.trap_patterns || []),
        aiResult.model || 'unknown'
      ]
    );

    res.json({
      id,
      subject,
      topic,
      concept_core_block: aiResult.concept_core_block || [],
      comparison_tables: aiResult.comparison_tables || [],
      clinical_scenarios: aiResult.clinical_scenarios || [],
      numerical_recall_points: aiResult.numerical_recall_points || [],
      trap_patterns: aiResult.trap_patterns || [],
      generated_by: aiResult.model || 'unknown',
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Regenerate teaching unit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;

    let query = 'SELECT * FROM teaching_unit';
    const params = [];

    if (subject) {
      query += ' WHERE subject = $1';
      params.push(subject);
    }

    query += ' ORDER BY subject, topic';

    const result = await db.query(query, params);

    const units = result.rows.map(row => ({
      id: row.id,
      subject: row.subject,
      topic: row.topic,
      concept_count: safeParse(row.concept_core_block, []).length,
      comparison_count: safeParse(row.comparison_tables, []).length,
      scenario_count: safeParse(row.clinical_scenarios, []).length,
      numerical_count: safeParse(row.numerical_recall_points, []).length,
      trap_count: safeParse(row.trap_patterns, []).length,
      generated_by: row.generated_by,
      generated_at: row.generated_at
    }));

    res.json({ units });
  } catch (error) {
    console.error('List teaching units error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:subject/:topic', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.params;

    const result = await db.query(
      'SELECT * FROM teaching_unit WHERE subject = $1 AND topic = $2',
      [decodeURIComponent(subject), decodeURIComponent(topic)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teaching unit not found for this topic' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      subject: row.subject,
      topic: row.topic,
      concept_core_block: safeParse(row.concept_core_block, []),
      comparison_tables: safeParse(row.comparison_tables, []),
      clinical_scenarios: safeParse(row.clinical_scenarios, []),
      numerical_recall_points: safeParse(row.numerical_recall_points, []),
      trap_patterns: safeParse(row.trap_patterns, []),
      generated_by: row.generated_by,
      generated_at: row.generated_at
    });
  } catch (error) {
    console.error('Get teaching unit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM teaching_unit WHERE id = $1', [id]);
    res.json({ message: 'Teaching unit deleted' });
  } catch (error) {
    console.error('Delete teaching unit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics-available', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;

    let query = `
      SELECT q.subject, q.topic, COUNT(*) as question_count,
             SUM(CASE WHEN q.yield_category = 'core' THEN 1 ELSE 0 END) as core_count,
             tu.id as has_unit
      FROM question q
      LEFT JOIN teaching_unit tu ON q.subject = tu.subject AND q.topic = tu.topic
      WHERE q.status = 'active'`;
    const params = [];

    if (subject) {
      query += ' AND q.subject = $1';
      params.push(subject);
    }

    query += ' GROUP BY q.subject, q.topic ORDER BY q.subject, q.topic';

    const result = await db.query(query, params);

    res.json({
      topics: result.rows.map(r => ({
        subject: r.subject,
        topic: r.topic,
        question_count: parseInt(r.question_count),
        core_count: parseInt(r.core_count || 0),
        has_teaching_unit: !!r.has_unit
      }))
    });
  } catch (error) {
    console.error('Topics available error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function safeParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function getFallbackUnit(subject, topic) {
  return {
    concept_core_block: [
      { title: `Definition of ${topic}`, type: 'definition', content: `Review the fundamental definition and scope of ${topic} in ${subject}.`, high_yield: true },
      { title: `Pathophysiology`, type: 'mechanism', content: `Understand the underlying mechanism and pathological processes in ${topic}.`, high_yield: true },
      { title: `Classification`, type: 'classification', content: `Know the standard classification systems used for ${topic}.`, high_yield: true },
      { title: `Key Differentiations`, type: 'differentiation', content: `Be able to differentiate between the major subtypes or similar conditions.`, high_yield: true }
    ],
    comparison_tables: [
      {
        title: `${topic} — Key Comparison`,
        columns: ['Type A', 'Type B'],
        rows: [
          { feature: 'Etiology', values: ['Primary', 'Secondary'] },
          { feature: 'Presentation', values: ['Acute', 'Chronic'] },
          { feature: 'Diagnosis', values: ['Clinical', 'Lab-based'] },
          { feature: 'Treatment', values: ['Medical', 'Surgical'] }
        ]
      }
    ],
    clinical_scenarios: [
      {
        scenario: `A patient presents with classic features of ${topic}.`,
        key_concept: `Recognition of ${topic} presentation`,
        expected_answer: `Classic ${topic} diagnosis`,
        teaching_point: `Know the pathognomonic features of ${topic}.`
      }
    ],
    numerical_recall_points: [
      { fact: `Key lab value for ${topic}: review normal ranges`, context: 'Essential for diagnosis', mnemonic: null }
    ],
    trap_patterns: [
      {
        trap: `Confusing similar presentations in ${topic}`,
        why_tempting: 'Overlapping clinical features',
        correct_approach: 'Focus on pathognomonic differentiators',
        related_subtopic: topic
      }
    ],
    model: 'fallback'
  };
}

module.exports = router;

