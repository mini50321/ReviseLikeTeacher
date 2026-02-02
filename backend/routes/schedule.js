const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');

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

    res.json({ schedule: result.rows });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const profileResult = await db.query(
      'SELECT * FROM userprofile WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found. Please complete onboarding.' });
    }

    const profile = profileResult.rows[0];
    const dailyMinutes = profile.daily_study_minutes || 60;
    const weeklyQuestions = profile.weekly_question_target || 50;
    const questionsPerDay = Math.ceil(weeklyQuestions / 7);
    const selectedSubjects = profile.selected_subjects ? JSON.parse(profile.selected_subjects) : [];

    const today = new Date();
    const schedules = [];

    for (let i = 0; i < 7; i++) {
      const scheduleDate = new Date(today);
      scheduleDate.setDate(today.getDate() + i);
      const dateString = scheduleDate.toISOString().split('T')[0];

      const existingSchedule = await db.query(
        'SELECT id FROM revisionschedule WHERE user_id = $1 AND date = $2',
        [userId, dateString]
      );

      if (existingSchedule.rows.length > 0) {
        continue;
      }

      const scheduleId = db.generateUUID();
      await db.query(
        `INSERT INTO revisionschedule 
         (id, user_id, date, planned_questions, planned_minutes, subjects, status) 
         VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')`,
        [
          scheduleId,
          userId,
          dateString,
          questionsPerDay,
          dailyMinutes,
          JSON.stringify(selectedSubjects)
        ]
      );

      schedules.push({
        id: scheduleId,
        date: dateString,
        planned_questions: questionsPerDay,
        planned_minutes: dailyMinutes,
        subjects: selectedSubjects
      });
    }

    res.json({
      message: 'Schedule generated successfully',
      schedules_created: schedules.length,
      schedules
    });
  } catch (error) {
    console.error('Generate schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:date', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;
    const { status } = req.body;

    if (!status || !['complete', 'partial', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required' });
    }

    const result = await db.query(
      'UPDATE revisionschedule SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND date = $3',
      [status, userId, date]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ message: 'Schedule status updated' });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

