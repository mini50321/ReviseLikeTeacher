const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { generateSmartSchedule, getTopicPriorities } = require('../services/scheduler');

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { start_date, end_date } = req.query;

    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || today;
    const endDate = end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await db.query(
      'SELECT * FROM revisionschedule WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC',
      [userId, startDate, endDate]
    );

    const schedule = result.rows.map(s => ({
      ...s,
      subjects: s.subjects ? (typeof s.subjects === 'string' ? JSON.parse(s.subjects) : s.subjects) : [],
      topics: s.topics ? (typeof s.topics === 'string' ? JSON.parse(s.topics) : s.topics) : [],
      difficulty_mix: s.difficulty_mix ? (typeof s.difficulty_mix === 'string' ? JSON.parse(s.difficulty_mix) : s.difficulty_mix) : null
    }));

    res.json({ schedule });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await generateSmartSchedule(userId);

    if (!result) {
      return res.status(404).json({ error: 'Profile not found. Please complete onboarding.' });
    }

    res.json({
      message: 'Smart schedule generated successfully',
      schedules_created: result.schedules.length,
      schedules: result.schedules,
      prioritized_topics: result.prioritized_topics
    });
  } catch (error) {
    console.error('Generate schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/priorities', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const priorities = await getTopicPriorities(userId);

    res.json({ priorities });
  } catch (error) {
    console.error('Get priorities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:date', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;
    const { status, completed_questions, actual_minutes } = req.body;

    if (!status || !['complete', 'partial', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required' });
    }

    const existing = await db.query(
      'SELECT * FROM revisionschedule WHERE user_id = $1 AND date = $2',
      [userId, date]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await db.query(
      `UPDATE revisionschedule
       SET status = $1, completed_questions = $2, actual_minutes = $3,
           completed_at = CASE WHEN $1 = 'complete' THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE user_id = $4 AND date = $5`,
      [status, completed_questions || 0, actual_minutes || 0, userId, date]
    );

    res.json({ message: 'Schedule status updated' });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
