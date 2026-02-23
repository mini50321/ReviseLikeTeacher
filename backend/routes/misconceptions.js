const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { db } = require('../db');
const {
  getMisconceptionSummary,
  getRemediationPlan,
  getConfusionPairsTrigger
} = require('../services/misconception');

router.get('/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.query;

    const summary = await getMisconceptionSummary(userId, subject, topic);

    const typeCounts = {};
    let totalMisconceptions = 0;
    summary.forEach(row => {
      const type = row.misconception_type;
      const count = parseInt(row.count);
      typeCounts[type] = (typeCounts[type] || 0) + count;
      totalMisconceptions += count;
    });

    res.json({
      total_misconceptions: totalMisconceptions,
      by_type: typeCounts,
      details: summary
    });
  } catch (error) {
    console.error('Misconception summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/confusion-pairs', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic, resolved } = req.query;

    let query = 'SELECT * FROM confusion_pairs WHERE user_id = $1';
    const params = [userId];
    let paramCount = 2;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND topic = $${paramCount++}`;
      params.push(topic);
    }
    if (resolved !== undefined) {
      query += ` AND resolved = $${paramCount++}`;
      params.push(resolved === 'true' ? 1 : 0);
    }

    query += ' ORDER BY occurrence_count DESC, updated_at DESC';

    const result = await db.query(query, params);

    const triggeredPairs = result.rows.filter(r => r.occurrence_count >= 2 && !r.resolved);

    res.json({
      pairs: result.rows,
      triggered_count: triggeredPairs.length,
      triggered_pairs: triggeredPairs
    });
  } catch (error) {
    console.error('Confusion pairs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/remediation', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.query;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    const plan = await getRemediationPlan(userId, subject, topic);

    res.json({
      topic,
      subject,
      plan,
      total_actions: plan.length,
      high_priority_count: plan.filter(p => p.priority === 'high').length
    });
  } catch (error) {
    console.error('Remediation plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/confusion-pairs/:id/resolve', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { comparison_table } = req.body;

    const existing = await db.query(
      'SELECT * FROM confusion_pairs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Confusion pair not found' });
    }

    await db.query(
      `UPDATE confusion_pairs SET resolved = 1, comparison_table = $1 WHERE id = $2`,
      [comparison_table || null, id]
    );

    res.json({ message: 'Confusion pair marked as resolved' });
  } catch (error) {
    console.error('Resolve confusion pair error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic, type, limit = 50 } = req.query;

    let query = `
      SELECT a.id, a.question_id, a.ai_score, a.misconception_type,
             a.misconception_tags, a.concept_tested, a.distractor_chosen_meaning,
             a.submitted_at,
             q.stem, q.topic, q.subtopic, q.subject, q.type as question_type
      FROM attempt a
      JOIN question q ON a.question_id = q.id
      WHERE a.user_id = $1 AND a.misconception_type IS NOT NULL`;
    const params = [userId];
    let paramCount = 2;

    if (subject) {
      query += ` AND q.subject = $${paramCount++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND q.topic = $${paramCount++}`;
      params.push(topic);
    }
    if (type) {
      query += ` AND a.misconception_type = $${paramCount++}`;
      params.push(type);
    }

    query += ` ORDER BY a.submitted_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({ misconceptions: result.rows });
  } catch (error) {
    console.error('Misconception history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/analytics', authenticate, requireFeature('misconception_analytics'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const byType = await db.query(
      `SELECT misconception_type, COUNT(*) as count
       FROM attempt
       WHERE user_id = $1 AND misconception_type IS NOT NULL
       GROUP BY misconception_type
       ORDER BY count DESC`,
      [userId]
    );

    const bySubject = await db.query(
      `SELECT q.subject, a.misconception_type, COUNT(*) as count
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1 AND a.misconception_type IS NOT NULL
       GROUP BY q.subject, a.misconception_type
       ORDER BY count DESC`,
      [userId]
    );

    const trend = await db.query(
      `SELECT DATE(a.submitted_at) as date, COUNT(*) as count
       FROM attempt a
       WHERE a.user_id = $1 AND a.misconception_type IS NOT NULL
       GROUP BY DATE(a.submitted_at)
       ORDER BY date DESC
       LIMIT 30`,
      [userId]
    );

    const unresolvedPairs = await db.query(
      `SELECT COUNT(*) as count FROM confusion_pairs
       WHERE user_id = $1 AND resolved = 0`,
      [userId]
    );

    const triggeredPairs = await db.query(
      `SELECT COUNT(*) as count FROM confusion_pairs
       WHERE user_id = $1 AND resolved = 0 AND occurrence_count >= 2`,
      [userId]
    );

    const subjectMap = {};
    bySubject.rows.forEach(row => {
      if (!subjectMap[row.subject]) subjectMap[row.subject] = {};
      subjectMap[row.subject][row.misconception_type] = parseInt(row.count);
    });

    res.json({
      by_type: byType.rows.map(r => ({ type: r.misconception_type, count: parseInt(r.count) })),
      by_subject: subjectMap,
      daily_trend: trend.rows.map(r => ({ date: r.date, count: parseInt(r.count) })),
      confusion_pairs: {
        unresolved: parseInt(unresolvedPairs.rows[0]?.count || 0),
        triggered: parseInt(triggeredPairs.rows[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('Misconception analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

