const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');

router.get('/questions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM question';
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` WHERE status = $${paramCount++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);

    res.json({
      questions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get admin questions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

