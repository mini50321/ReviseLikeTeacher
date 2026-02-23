const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { generateLast30Plan } = require('../services/last30');
const router = express.Router();

router.get('/plan', authenticate, requireFeature('last_30_days_mode'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const plan = await generateLast30Plan(userId);
    if (!plan) {
      return res.status(404).json({ error: 'User profile not found. Complete onboarding first.' });
    }
    if (plan.error) {
      return res.status(400).json({ error: plan.error });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error generating last 30 days plan:', error);
    res.status(500).json({ error: error.message || 'Failed to generate plan' });
  }
});

router.get('/status', authenticate, async (req, res) => {
  try {
    const { db } = require('../db');
    const userId = req.user.userId;

    const profileResult = await db.query(
      'SELECT exam_date FROM userprofile WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].exam_date) {
      return res.json({ eligible: false, reason: 'No exam date set' });
    }

    const examDate = new Date(profileResult.rows[0].exam_date);
    const today = new Date();
    const daysRemaining = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

    res.json({
      eligible: daysRemaining <= 30 && daysRemaining > 0,
      days_remaining: daysRemaining,
      exam_date: examDate.toISOString().split('T')[0],
      reason: daysRemaining > 30 ? 'More than 30 days until exam' : daysRemaining <= 0 ? 'Exam date has passed' : null
    });
  } catch (error) {
    console.error('Error checking last 30 status:', error);
    res.status(500).json({ error: error.message || 'Failed to check status' });
  }
});

module.exports = router;

