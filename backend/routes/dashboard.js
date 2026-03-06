const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { calculateReadiness } = require('../services/readiness');
const { getTodayPlan } = require('../services/today-plan');

router.get('/', authenticate, async (req, res) => {
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

    const readinessResult = await db.query(
      'SELECT * FROM examreadiness WHERE user_id = $1',
      [userId]
    );

    const readiness = readinessResult.rows[0] || {
      readiness_percentage: 0,
      status: 'off_track',
      forecast_data: {}
    };

    const today = new Date().toISOString().split('T')[0];
    const todayScheduleResult = await db.query(
      'SELECT * FROM revisionschedule WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const todaySchedule = todayScheduleResult.rows[0] || null;

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDayScheduleResult = await db.query(
      'SELECT * FROM revisionschedule WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC',
      [userId, today, sevenDaysFromNow.toISOString().split('T')[0]]
    );

    const topicMasteryResult = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 ORDER BY mastery_level DESC LIMIT 10',
      [userId]
    );

    const recentSessionsResult = await db.query(
      'SELECT * FROM session WHERE user_id = $1 ORDER BY started_at DESC LIMIT 5',
      [userId]
    );

    let todayPlanSummary = null;
    try {
      const plan = await getTodayPlan(userId);
      todayPlanSummary = {
        due_count: (plan.due_revisions || []).length,
        weak_count: (plan.weak_topics || []).length,
        questions_done_today: plan.questions_done_today || 0,
        exam_days_remaining: plan.exam_days_remaining
      };
    } catch (e) {
      todayPlanSummary = { due_count: 0, weak_count: 0, questions_done_today: 0, exam_days_remaining: null };
    }

    res.json({
      profile: {
        target_exam: profile.target_exam,
        exam_date: profile.exam_date,
        target_score_band: profile.target_score_band,
        daily_study_minutes: profile.daily_study_minutes,
        weekly_question_target: profile.weekly_question_target,
        selected_subjects: profile.selected_subjects,
        intelligence_level: profile.intelligence_level,
        goal_tier: profile.goal_tier || 'good_rank',
        student_category: profile.student_category || 'average',
        subscription_tier: profile.subscription_tier || 'free'
      },
      readiness: {
        percentage: readiness.readiness_percentage,
        status: readiness.status,
        forecast: readiness.forecast_data
      },
      todaySchedule: todaySchedule ? {
        date: todaySchedule.date,
        planned_questions: todaySchedule.planned_questions,
        planned_minutes: todaySchedule.planned_minutes,
        subjects: todaySchedule.subjects ? (typeof todaySchedule.subjects === 'string' ? JSON.parse(todaySchedule.subjects) : todaySchedule.subjects) : [],
        topics: todaySchedule.topics ? (typeof todaySchedule.topics === 'string' ? JSON.parse(todaySchedule.topics) : todaySchedule.topics) : [],
        status: todaySchedule.status
      } : null,
      sevenDaySchedule: sevenDayScheduleResult.rows.map(s => ({
        date: s.date,
        planned_questions: s.planned_questions,
        subjects: s.subjects ? (typeof s.subjects === 'string' ? JSON.parse(s.subjects) : s.subjects) : [],
        status: s.status
      })),
      topicMastery: topicMasteryResult.rows.map(t => ({
        topic: t.topic,
        subject: t.subject,
        mastery_level: t.mastery_level,
        next_revision_date: t.next_revision_date
      })),
      recentSessions: recentSessionsResult.rows.map(s => ({
        id: s.id,
        session_type: s.session_type,
        total_questions: s.total_questions,
        average_score: s.average_score,
        started_at: s.started_at,
        status: s.status
      })),
      todayPlanSummary
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/recalculate-readiness', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const readiness = await calculateReadiness(userId);
    
    if (!readiness) {
      return res.status(404).json({ error: 'Profile not found. Please complete onboarding.' });
    }

    res.json({
      message: 'Readiness recalculated',
      readiness: {
        percentage: readiness.readiness_percentage,
        status: readiness.status,
        forecast: readiness.forecast_data
      }
    });
  } catch (error) {
    console.error('Recalculate readiness error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

