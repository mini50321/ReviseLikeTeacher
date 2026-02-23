const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.post('/generate', authenticate, requireFeature('exam_trigger_notes'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic, topic_learning_session_id } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    const existing = await db.query(
      'SELECT * FROM exam_trigger_notes WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, subject, topic]
    );

    if (existing.rows.length > 0) {
      return res.json({
        notes: formatNotes(existing.rows[0]),
        cached: true
      });
    }

    let weakSubtopics = [];
    let misconceptions = [];
    let masteryStatus = null;
    let mcqAccuracy = null;
    let coreCoverage = null;

    if (topic_learning_session_id) {
      const tlsResult = await db.query(
        'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
        [topic_learning_session_id, userId]
      );
      if (tlsResult.rows.length > 0) {
        const tls = tlsResult.rows[0];
        masteryStatus = tls.mastery_result;
        mcqAccuracy = tls.mcq_accuracy;
        coreCoverage = tls.core_coverage;

        if (tls.diagnostic_id) {
          const diagResult = await db.query(
            'SELECT misconception_tags FROM diagnostic_assessment WHERE id = $1',
            [tls.diagnostic_id]
          );
          if (diagResult.rows.length > 0 && diagResult.rows[0].misconception_tags) {
            try {
              const tags = JSON.parse(diagResult.rows[0].misconception_tags);
              weakSubtopics = tags.map(t => t.subtopic).filter(Boolean);
              misconceptions = tags.map(t => t.type || t.description).filter(Boolean);
            } catch (e) {}
          }
        }
      }
    }

    const miscResult = await db.query(
      `SELECT DISTINCT a.misconception_type, q.subtopic
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1 AND q.subject = $2 AND q.topic = $3
         AND a.misconception_type IS NOT NULL
       ORDER BY a.submitted_at DESC
       LIMIT 10`,
      [userId, subject, topic]
    );
    miscResult.rows.forEach(r => {
      if (r.subtopic && !weakSubtopics.includes(r.subtopic)) weakSubtopics.push(r.subtopic);
      if (r.misconception_type && !misconceptions.includes(r.misconception_type)) misconceptions.push(r.misconception_type);
    });

    let aiResult;
    try {
      const response = await axios.post(`${AI_SERVICE_URL}/generate-notes`, {
        subject,
        topic,
        weak_subtopics: weakSubtopics.length > 0 ? weakSubtopics : null,
        mastery_status: masteryStatus,
        mcq_accuracy: mcqAccuracy,
        core_coverage: coreCoverage,
        misconceptions: misconceptions.length > 0 ? misconceptions : null
      }, { timeout: 60000 });
      aiResult = response.data;
    } catch (aiError) {
      console.error('AI service error for notes:', aiError.message);
      aiResult = getFallbackNotes(subject, topic);
    }

    const noteId = db.generateUUID();
    await db.query(
      `INSERT INTO exam_trigger_notes (id, user_id, subject, topic, trigger_lines, differentiation_table, recall_bullets)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, subject, topic)
       DO UPDATE SET trigger_lines = $5, differentiation_table = $6, recall_bullets = $7, generated_at = CURRENT_TIMESTAMP`,
      [
        noteId, userId, subject, topic,
        JSON.stringify(aiResult.trigger_lines || []),
        JSON.stringify(aiResult.differentiation_table || []),
        JSON.stringify(aiResult.recall_bullets || [])
      ]
    );

    res.json({
      notes: {
        id: noteId,
        subject,
        topic,
        trigger_lines: aiResult.trigger_lines || [],
        differentiation_table: aiResult.differentiation_table || [],
        recall_bullets: aiResult.recall_bullets || [],
        generated_at: new Date().toISOString(),
        ai_generated: aiResult.generated !== false
      },
      cached: false
    });
  } catch (error) {
    console.error('Generate exam trigger notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject } = req.query;

    let query = 'SELECT * FROM exam_trigger_notes WHERE user_id = $1';
    const params = [userId];

    if (subject) {
      query += ' AND subject = $2';
      params.push(subject);
    }

    query += ' ORDER BY generated_at DESC';

    const result = await db.query(query, params);

    res.json({
      notes: result.rows.map(formatNotes)
    });
  } catch (error) {
    console.error('List exam trigger notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:subject/:topic', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.params;

    const result = await db.query(
      'SELECT * FROM exam_trigger_notes WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, subject, topic]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam trigger notes not found for this topic' });
    }

    res.json({ notes: formatNotes(result.rows[0]) });
  } catch (error) {
    console.error('Get exam trigger notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/regenerate', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    await db.query(
      'DELETE FROM exam_trigger_notes WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, subject, topic]
    );

    let aiResult;
    try {
      const response = await axios.post(`${AI_SERVICE_URL}/generate-notes`, {
        subject,
        topic
      }, { timeout: 60000 });
      aiResult = response.data;
    } catch (aiError) {
      console.error('AI service error for regeneration:', aiError.message);
      aiResult = getFallbackNotes(subject, topic);
    }

    const noteId = db.generateUUID();
    await db.query(
      `INSERT INTO exam_trigger_notes (id, user_id, subject, topic, trigger_lines, differentiation_table, recall_bullets)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        noteId, userId, subject, topic,
        JSON.stringify(aiResult.trigger_lines || []),
        JSON.stringify(aiResult.differentiation_table || []),
        JSON.stringify(aiResult.recall_bullets || [])
      ]
    );

    res.json({
      notes: {
        id: noteId,
        subject,
        topic,
        trigger_lines: aiResult.trigger_lines || [],
        differentiation_table: aiResult.differentiation_table || [],
        recall_bullets: aiResult.recall_bullets || [],
        generated_at: new Date().toISOString(),
        ai_generated: aiResult.generated !== false
      },
      cached: false
    });
  } catch (error) {
    console.error('Regenerate exam trigger notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM exam_trigger_notes WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notes not found' });
    }

    await db.query('DELETE FROM exam_trigger_notes WHERE id = $1', [id]);

    res.json({ message: 'Notes deleted' });
  } catch (error) {
    console.error('Delete exam trigger notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatNotes(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    trigger_lines: safeParse(row.trigger_lines, []),
    differentiation_table: safeParse(row.differentiation_table, []),
    recall_bullets: safeParse(row.recall_bullets, []),
    generated_at: row.generated_at
  };
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function getFallbackNotes(subject, topic) {
  return {
    trigger_lines: [
      `Review core concepts of ${topic} in ${subject}.`,
      `Focus on high-yield differentiations in ${topic}.`,
      `Remember classic clinical presentations for ${topic}.`,
      `Revise drug of choice and treatment protocols.`,
      `Study investigation of choice for related conditions.`,
      `Know the pathophysiology flowchart for ${topic}.`,
      `Review epidemiology and risk factors.`,
      `Memorize key lab values and normal ranges.`,
      `Understand the staging/grading systems.`,
      `Revise surgical approaches relevant to ${topic}.`,
      `Know the genetics and inheritance patterns.`,
      `Study radiological findings specific to ${topic}.`,
      `Review complications and prognosis.`,
      `Understand drug mechanisms of action.`,
      `Revise recent guidelines and updates.`
    ],
    differentiation_table: [
      { feature: 'Key characteristic', entity_a: `${topic} Type A`, entity_b: `${topic} Type B` },
      { feature: 'Etiology', entity_a: 'Primary', entity_b: 'Secondary' },
      { feature: 'Presentation', entity_a: 'Acute', entity_b: 'Chronic' },
      { feature: 'Investigation', entity_a: 'Gold standard', entity_b: 'Screening' },
      { feature: 'Treatment', entity_a: 'Medical', entity_b: 'Surgical' }
    ],
    recall_bullets: [
      `Most common cause of ${topic}: review high-yield association.`,
      `Drug of choice: confirm first-line treatment.`,
      `Investigation of choice: know the gold standard test.`,
      `Classic triad/tetrad associated with ${topic}.`,
      `Key differentiating feature from similar conditions.`
    ],
    generated: false
  };
}

module.exports = router;

