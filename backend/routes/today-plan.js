const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getTodayPlan } = require('../services/today-plan');

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const plan = await getTodayPlan(userId);
    res.json(plan);
  } catch (error) {
    console.error('Today plan error:', error);
    res.status(500).json({ error: 'Failed to load today\'s plan' });
  }
});

module.exports = router;
