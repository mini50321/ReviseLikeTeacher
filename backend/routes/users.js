const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');

router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const profileResult = await db.query(
      'SELECT * FROM userprofile WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profileResult.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { daily_study_minutes, weekly_question_target } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (daily_study_minutes !== undefined) {
      if (daily_study_minutes < 15 || daily_study_minutes > 480) {
        return res.status(400).json({ error: 'Daily study minutes must be between 15 and 480' });
      }
      updates.push(`daily_study_minutes = $${paramCount++}`);
      values.push(daily_study_minutes);
    }

    if (weekly_question_target !== undefined) {
      if (weekly_question_target < 5 || weekly_question_target > 500) {
        return res.status(400).json({ error: 'Weekly question target must be between 5 and 500' });
      }
      updates.push(`weekly_question_target = $${paramCount++}`);
      values.push(weekly_question_target);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);

    const result = await db.query(
      `UPDATE userprofile SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $${paramCount} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

