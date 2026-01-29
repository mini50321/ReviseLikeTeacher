const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      target_exam,
      exam_date,
      target_score_band,
      selected_subjects,
      daily_study_minutes,
      weekly_question_target
    } = req.body;

    if (!target_exam || !exam_date || !target_score_band || !selected_subjects || 
        !daily_study_minutes || !weekly_question_target) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (daily_study_minutes < 15 || daily_study_minutes > 480) {
      return res.status(400).json({ error: 'Daily study minutes must be between 15 and 480' });
    }

    if (weekly_question_target < 5 || weekly_question_target > 500) {
      return res.status(400).json({ error: 'Weekly question target must be between 5 and 500' });
    }

    const examDate = new Date(exam_date);
    if (examDate <= new Date()) {
      return res.status(400).json({ error: 'Exam date must be in the future' });
    }

    const existingProfile = await db.query(
      'SELECT id FROM userprofile WHERE user_id = $1',
      [userId]
    );

    if (existingProfile.rows.length > 0) {
      const result = await db.query(
        `UPDATE userprofile SET 
         target_exam = $1, exam_date = $2, target_score_band = $3, 
         selected_subjects = $4, daily_study_minutes = $5, 
         weekly_question_target = $6, onboarding_completed = TRUE, 
         updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $7 RETURNING *`,
        [target_exam, exam_date, target_score_band, selected_subjects, 
         daily_study_minutes, weekly_question_target, userId]
      );
      return res.json(result.rows[0]);
    } else {
      const result = await db.query(
        `INSERT INTO userprofile 
         (user_id, target_exam, exam_date, target_score_band, selected_subjects, 
          daily_study_minutes, weekly_question_target, onboarding_completed) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
        [userId, target_exam, exam_date, target_score_band, selected_subjects, 
         daily_study_minutes, weekly_question_target]
      );
      return res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

