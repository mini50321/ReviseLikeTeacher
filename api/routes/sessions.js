const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      session_type = 'practice',
      configuration
    } = req.body;

    const result = await db.query(
      `INSERT INTO session (user_id, session_type, configuration, status) 
       VALUES ($1, $2, $3, 'in_progress') 
       RETURNING *`,
      [userId, session_type, JSON.stringify(configuration || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      'SELECT * FROM session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];

    const attemptsResult = await db.query(
      'SELECT * FROM attempt WHERE session_id = $1 ORDER BY submitted_at ASC',
      [id]
    );

    res.json({
      ...session,
      attempts: attemptsResult.rows
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const sessionResult = await db.query(
      'SELECT * FROM session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const attemptsResult = await db.query(
      'SELECT * FROM attempt WHERE session_id = $1',
      [id]
    );

    const attempts = attemptsResult.rows;
    const totalQuestions = attempts.length;
    const averageScore = attempts.length > 0
      ? attempts.reduce((sum, a) => sum + (a.ai_score || 0), 0) / attempts.length
      : 0;
    const accuracy = attempts.length > 0
      ? (attempts.filter(a => (a.ai_score || 0) >= 70).length / attempts.length) * 100
      : 0;

    const totalTime = attempts.reduce((sum, a) => sum + (a.time_spent_seconds || 0), 0);

    const result = await db.query(
      `UPDATE session 
       SET status = 'completed', 
           completed_at = CURRENT_TIMESTAMP,
           total_questions = $1,
           average_score = $2,
           accuracy = $3,
           total_time_seconds = $4
       WHERE id = $5 
       RETURNING *`,
      [totalQuestions, averageScore, accuracy, totalTime, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT * FROM session 
       WHERE user_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM session WHERE user_id = $1',
      [userId]
    );

    res.json({
      sessions: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
