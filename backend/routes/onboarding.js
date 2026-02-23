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
      goal_tier = 'good_rank',
      student_category = 'average',
      selected_subjects,
      daily_study_minutes,
      weekly_question_target
    } = req.body;

    if (!target_exam || !exam_date || !target_score_band || !selected_subjects || 
        !daily_study_minutes || !weekly_question_target) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const validGoalTiers = ['top_rank', 'good_rank', 'seat_only'];
    const validCategories = ['bright', 'average', 'weak'];
    const finalGoalTier = validGoalTiers.includes(goal_tier) ? goal_tier : 'good_rank';
    const finalCategory = validCategories.includes(student_category) ? student_category : 'average';

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

    let profile;
    if (existingProfile.rows.length > 0) {
      const result = await db.query(
        `UPDATE userprofile SET 
         target_exam = $1, exam_date = $2, target_score_band = $3, 
         selected_subjects = $4, daily_study_minutes = $5, 
         weekly_question_target = $6, goal_tier = $7, student_category = $8,
         onboarding_completed = TRUE, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $9 RETURNING *`,
        [target_exam, exam_date, target_score_band, selected_subjects, 
         daily_study_minutes, weekly_question_target, finalGoalTier, finalCategory, userId]
      );
      profile = result.rows[0];
    } else {
      const result = await db.query(
        `INSERT INTO userprofile 
         (user_id, target_exam, exam_date, target_score_band, selected_subjects, 
          daily_study_minutes, weekly_question_target, goal_tier, student_category, 
          onboarding_completed) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING *`,
        [userId, target_exam, exam_date, target_score_band, selected_subjects, 
         daily_study_minutes, weekly_question_target, finalGoalTier, finalCategory]
      );
      profile = result.rows[0];
    }

    const questionsPerDay = Math.ceil(weekly_question_target / 7);
    const selectedSubjectsArray = Array.isArray(selected_subjects) 
      ? selected_subjects 
      : (typeof selected_subjects === 'string' ? JSON.parse(selected_subjects) : []);

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const scheduleDate = new Date(today);
      scheduleDate.setDate(today.getDate() + i);
      const dateString = scheduleDate.toISOString().split('T')[0];

      const existingSchedule = await db.query(
        'SELECT id FROM revisionschedule WHERE user_id = $1 AND date = $2',
        [userId, dateString]
      );

      if (existingSchedule.rows.length === 0) {
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
            daily_study_minutes,
            JSON.stringify(selectedSubjectsArray)
          ]
        );
      }
    }

    if (existingProfile.rows.length > 0) {
      return res.json(profile);
    } else {
      return res.status(201).json(profile);
    }
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

