const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');

router.get('/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const attemptsResult = await db.query(
      `SELECT COUNT(*) as total_attempts, AVG(ai_score) as avg_score,
              SUM(time_spent_seconds) as total_time,
              MIN(submitted_at) as first_attempt, MAX(submitted_at) as last_attempt
       FROM attempt WHERE user_id = $1`,
      [userId]
    );

    const sessionsResult = await db.query(
      `SELECT COUNT(*) as total_sessions,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
              AVG(CASE WHEN status = 'completed' THEN average_score END) as avg_session_score
       FROM session WHERE user_id = $1`,
      [userId]
    );

    const masteryResult = await db.query(
      `SELECT AVG(mastery_level) as avg_mastery, COUNT(*) as topics_covered,
              SUM(CASE WHEN mastery_level >= 80 THEN 1 ELSE 0 END) as mastered_topics,
              SUM(CASE WHEN mastery_level < 40 THEN 1 ELSE 0 END) as weak_topics
       FROM topicmastery WHERE user_id = $1`,
      [userId]
    );

    const streakResult = await db.query(
      `SELECT DISTINCT date(submitted_at) as attempt_date
       FROM attempt WHERE user_id = $1
       ORDER BY attempt_date DESC`,
      [userId]
    );

    let currentStreak = 0;
    const today = new Date().toISOString().split('T')[0];
    const dates = streakResult.rows.map(r => r.attempt_date);

    if (dates.length > 0) {
      let checkDate = new Date(today);
      for (let i = 0; i < dates.length; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dates.includes(dateStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (i === 0 && dateStr !== dates[0]) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterday = checkDate.toISOString().split('T')[0];
          if (dates.includes(yesterday)) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    const accuracy = attemptsResult.rows[0]?.total_attempts > 0
      ? await db.query(
          `SELECT COUNT(*) as correct FROM attempt WHERE user_id = $1 AND ai_score >= 70`,
          [userId]
        )
      : { rows: [{ correct: 0 }] };

    const totalAttempts = parseInt(attemptsResult.rows[0]?.total_attempts || 0);
    const correctCount = parseInt(accuracy.rows[0]?.correct || 0);

    res.json({
      total_attempts: totalAttempts,
      avg_score: Math.round((attemptsResult.rows[0]?.avg_score || 0) * 100) / 100,
      total_time_minutes: Math.round((attemptsResult.rows[0]?.total_time || 0) / 60),
      total_sessions: parseInt(sessionsResult.rows[0]?.total_sessions || 0),
      completed_sessions: parseInt(sessionsResult.rows[0]?.completed_sessions || 0),
      avg_session_score: Math.round((sessionsResult.rows[0]?.avg_session_score || 0) * 100) / 100,
      avg_mastery: Math.round((masteryResult.rows[0]?.avg_mastery || 0) * 100) / 100,
      topics_covered: parseInt(masteryResult.rows[0]?.topics_covered || 0),
      mastered_topics: parseInt(masteryResult.rows[0]?.mastered_topics || 0),
      weak_topics: parseInt(masteryResult.rows[0]?.weak_topics || 0),
      accuracy_rate: totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 10000) / 100 : 0,
      current_streak: currentStreak
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/score-trend', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { days = 30 } = req.query;

    const result = await db.query(
      `SELECT date(submitted_at) as date,
              AVG(ai_score) as avg_score,
              COUNT(*) as attempts,
              MIN(ai_score) as min_score,
              MAX(ai_score) as max_score
       FROM attempt
       WHERE user_id = $1 AND submitted_at >= date('now', '-' || $2 || ' days')
       GROUP BY date(submitted_at)
       ORDER BY date ASC`,
      [userId, parseInt(days)]
    );

    res.json({ trend: result.rows });
  } catch (error) {
    console.error('Score trend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/subject-performance', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT q.subject,
              COUNT(a.id) as total_attempts,
              AVG(a.ai_score) as avg_score,
              SUM(CASE WHEN a.ai_score >= 70 THEN 1 ELSE 0 END) as correct,
              AVG(a.time_spent_seconds) as avg_time
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1
       GROUP BY q.subject
       ORDER BY avg_score DESC`,
      [userId]
    );

    const subjects = result.rows.map(row => ({
      subject: row.subject,
      total_attempts: parseInt(row.total_attempts || 0),
      avg_score: Math.round((row.avg_score || 0) * 100) / 100,
      accuracy: parseInt(row.total_attempts) > 0
        ? Math.round((parseInt(row.correct || 0) / parseInt(row.total_attempts)) * 10000) / 100
        : 0,
      avg_time_seconds: Math.round(row.avg_time || 0)
    }));

    res.json({ subjects });
  } catch (error) {
    console.error('Subject performance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/weak-strong-topics', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const weakResult = await db.query(
      `SELECT topic, subject, mastery_level, revision_count, last_revision_date
       FROM topicmastery
       WHERE user_id = $1 AND mastery_level < 50
       ORDER BY mastery_level ASC
       LIMIT 10`,
      [userId]
    );

    const strongResult = await db.query(
      `SELECT topic, subject, mastery_level, revision_count, last_revision_date
       FROM topicmastery
       WHERE user_id = $1 AND mastery_level >= 50
       ORDER BY mastery_level DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      weak_topics: weakResult.rows,
      strong_topics: strongResult.rows
    });
  } catch (error) {
    console.error('Weak/strong topics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/difficulty-analysis', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT q.difficulty,
              COUNT(a.id) as total_attempts,
              AVG(a.ai_score) as avg_score,
              SUM(CASE WHEN a.ai_score >= 70 THEN 1 ELSE 0 END) as correct,
              AVG(a.time_spent_seconds) as avg_time
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1
       GROUP BY q.difficulty`,
      [userId]
    );

    const difficulties = {};
    result.rows.forEach(row => {
      difficulties[row.difficulty] = {
        total_attempts: parseInt(row.total_attempts || 0),
        avg_score: Math.round((row.avg_score || 0) * 100) / 100,
        accuracy: parseInt(row.total_attempts) > 0
          ? Math.round((parseInt(row.correct || 0) / parseInt(row.total_attempts)) * 10000) / 100
          : 0,
        avg_time_seconds: Math.round(row.avg_time || 0)
      };
    });

    res.json({ difficulties });
  } catch (error) {
    console.error('Difficulty analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/activity-heatmap', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT date(submitted_at) as date, COUNT(*) as count
       FROM attempt
       WHERE user_id = $1 AND submitted_at >= date('now', '-90 days')
       GROUP BY date(submitted_at)
       ORDER BY date ASC`,
      [userId]
    );

    res.json({ activity: result.rows });
  } catch (error) {
    console.error('Activity heatmap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

