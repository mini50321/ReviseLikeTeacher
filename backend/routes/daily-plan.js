const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { generateDailyPlan } = require('../services/daily-plan');
const { db } = require('../db');

router.get('/today', authenticate, requireFeature('adaptive_daily_plan'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const plan = await generateDailyPlan(userId);

    if (!plan) {
      return res.status(404).json({ error: 'Complete onboarding first to get a daily plan' });
    }

    res.json(plan);
  } catch (error) {
    console.error('Daily plan error:', error);
    res.status(500).json({ error: 'Failed to generate daily plan' });
  }
});

router.post('/complete-block', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { block_index, date } = req.body;
    const todayStr = date || new Date().toISOString().split('T')[0];

    const existing = await db.query(
      `SELECT id, completed_blocks FROM daily_plan_progress WHERE user_id = $1 AND date = $2`,
      [userId, todayStr]
    );

    let completedBlocks = [];
    if (existing.rows.length > 0) {
      completedBlocks = JSON.parse(existing.rows[0].completed_blocks || '[]');
      if (!completedBlocks.includes(block_index)) {
        completedBlocks.push(block_index);
      }
      await db.query(
        `UPDATE daily_plan_progress SET completed_blocks = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(completedBlocks), existing.rows[0].id]
      );
    } else {
      completedBlocks = [block_index];
      await db.query(
        `INSERT INTO daily_plan_progress (id, user_id, date, completed_blocks) VALUES ($1, $2, $3, $4)`,
        [db.generateUUID(), userId, todayStr, JSON.stringify(completedBlocks)]
      );
    }

    res.json({ completed_blocks: completedBlocks });
  } catch (error) {
    console.error('Complete block error:', error);
    res.status(500).json({ error: 'Failed to mark block complete' });
  }
});

router.get('/progress', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const todayStr = new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT completed_blocks FROM daily_plan_progress WHERE user_id = $1 AND date = $2`,
      [userId, todayStr]
    );

    const completedBlocks = result.rows.length > 0
      ? JSON.parse(result.rows[0].completed_blocks || '[]')
      : [];

    res.json({ date: todayStr, completed_blocks: completedBlocks });
  } catch (error) {
    console.error('Progress error:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { days = 7 } = req.query;

    const result = await db.query(
      `SELECT date, completed_blocks FROM daily_plan_progress
       WHERE user_id = $1 AND date >= date('now', '-' || $2 || ' days')
       ORDER BY date DESC`,
      [userId, parseInt(days)]
    );

    const history = result.rows.map(r => ({
      date: r.date,
      completed_blocks: JSON.parse(r.completed_blocks || '[]')
    }));

    res.json({ history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

