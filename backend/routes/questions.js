const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');

router.get('/', authenticate, async (req, res) => {
  try {
    const { subject, topic, type, difficulty, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM question WHERE status = $1';
    const params = ['active'];
    let paramCount = 2;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }

    if (topic) {
      query += ` AND topic = $${paramCount++}`;
      params.push(topic);
    }

    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    if (difficulty) {
      query += ` AND difficulty = $${paramCount++}`;
      params.push(difficulty);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)').split('ORDER BY')[0];
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(query, params);

    res.json({
      questions: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('SELECT * FROM question WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      stem,
      type,
      subject,
      topic,
      subtopic,
      difficulty = 'medium',
      importance = 'medium',
      cognitive_focus = 'factual',
      ideal_answer,
      key_points,
      previous_year_tags,
      image_path,
      status = 'active'
    } = req.body;

    if (!stem || !type || !subject || !topic) {
      return res.status(400).json({ error: 'Stem, type, subject, and topic required' });
    }

    const result = await db.query(
      `INSERT INTO question 
       (stem, type, subject, topic, subtopic, difficulty, importance, 
        cognitive_focus, ideal_answer, key_points, previous_year_tags, 
        image_path, status, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
       RETURNING *`,
      [stem, type, subject, topic, subtopic, difficulty, importance, 
       cognitive_focus, ideal_answer, JSON.stringify(key_points || []), 
       JSON.stringify(previous_year_tags || []), image_path, status, req.user.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = ['stem', 'type', 'subject', 'topic', 'subtopic', 
                           'difficulty', 'importance', 'cognitive_focus', 
                           'ideal_answer', 'key_points', 'previous_year_tags',
                           'image_path', 'status'];
    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setParts = [];
    const values = [id];
    let paramCount = 2;

    updateFields.forEach(field => {
      if (field === 'key_points' || field === 'previous_year_tags') {
        setParts.push(`${field} = $${paramCount++}`);
        values.push(JSON.stringify(updates[field]));
      } else {
        setParts.push(`${field} = $${paramCount++}`);
        values.push(updates[field]);
      }
    });

    const setClause = setParts.join(', ');

    const result = await db.query(
      `UPDATE question SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

