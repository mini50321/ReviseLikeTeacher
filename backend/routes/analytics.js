const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { requireFeature } = require('../middleware/subscription');

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

router.get('/competency-trend', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic, days = 90 } = req.query;

    let query = `SELECT subject, topic, score, calculated_at
                 FROM competency_score_log
                 WHERE user_id = $1 AND calculated_at >= date('now', '-' || $2 || ' days')`;
    const params = [userId, parseInt(days)];
    let pIdx = 3;

    if (subject) {
      query += ` AND subject = $${pIdx++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND topic = $${pIdx++}`;
      params.push(topic);
    }

    query += ' ORDER BY calculated_at ASC';

    const result = await db.query(query, params);

    const byTopic = {};
    result.rows.forEach(r => {
      const key = `${r.subject}|${r.topic}`;
      if (!byTopic[key]) {
        byTopic[key] = { subject: r.subject, topic: r.topic, scores: [] };
      }
      byTopic[key].scores.push({
        score: r.score,
        date: r.calculated_at
      });
    });

    const overallTrend = {};
    result.rows.forEach(r => {
      const dateKey = r.calculated_at ? r.calculated_at.split('T')[0] : 'unknown';
      if (!overallTrend[dateKey]) {
        overallTrend[dateKey] = { total: 0, count: 0 };
      }
      overallTrend[dateKey].total += r.score;
      overallTrend[dateKey].count += 1;
    });

    const overall = Object.entries(overallTrend)
      .map(([date, data]) => ({
        date,
        avg_score: Math.round((data.total / data.count) * 100) / 100,
        entries: data.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      by_topic: Object.values(byTopic),
      overall_trend: overall,
      total_entries: result.rows.length
    });
  } catch (error) {
    console.error('Competency trend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mastery-heatmap', authenticate, requireFeature('heatmap_analytics'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const mastery = await db.query(
      `SELECT subject, topic, mastery_level, mastery_status, competency_score,
              mcq_accuracy, core_coverage, next_revision_date, updated_at
       FROM topicmastery
       WHERE user_id = $1
       ORDER BY subject, topic`,
      [userId]
    );

    const subjectMap = {};
    mastery.rows.forEach(r => {
      if (!subjectMap[r.subject]) {
        subjectMap[r.subject] = {
          subject: r.subject,
          topics: [],
          avg_mastery: 0,
          mastered_count: 0,
          total_count: 0
        };
      }
      const status = r.mastery_status === 'mastered' ? 'green'
        : r.mastery_status === 'revision_required' ? 'yellow' : 'red';

      subjectMap[r.subject].topics.push({
        topic: r.topic,
        mastery_level: r.mastery_level,
        mastery_status: r.mastery_status,
        competency_score: r.competency_score,
        mcq_accuracy: r.mcq_accuracy,
        core_coverage: r.core_coverage,
        color: status,
        next_revision: r.next_revision_date,
        updated_at: r.updated_at
      });

      subjectMap[r.subject].total_count++;
      if (r.mastery_status === 'mastered') subjectMap[r.subject].mastered_count++;
    });

    Object.values(subjectMap).forEach(s => {
      const totalMastery = s.topics.reduce((sum, t) => sum + (t.mastery_level || 0), 0);
      s.avg_mastery = s.topics.length > 0 ? Math.round((totalMastery / s.topics.length) * 100) / 100 : 0;
      s.completion_rate = s.total_count > 0 ? Math.round((s.mastered_count / s.total_count) * 100) : 0;
    });

    const subjects = Object.values(subjectMap).sort((a, b) => b.avg_mastery - a.avg_mastery);

    const totalTopics = mastery.rows.length;
    const masteredTopics = mastery.rows.filter(r => r.mastery_status === 'mastered').length;
    const revisionTopics = mastery.rows.filter(r => r.mastery_status === 'revision_required').length;
    const relearnTopics = mastery.rows.filter(r => r.mastery_status === 'relearn_core').length;

    res.json({
      subjects,
      summary: {
        total_topics: totalTopics,
        mastered: masteredTopics,
        revision_required: revisionTopics,
        relearn_core: relearnTopics,
        overall_mastery: totalTopics > 0
          ? Math.round((mastery.rows.reduce((s, r) => s + (r.mastery_level || 0), 0) / totalTopics) * 100) / 100
          : 0
      }
    });
  } catch (error) {
    console.error('Mastery heatmap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rank-prediction', authenticate, requireFeature('rank_prediction'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const mastery = await db.query(
      `SELECT AVG(competency_score) as avg_competency,
              COUNT(*) as topics_covered,
              SUM(CASE WHEN mastery_status = 'mastered' THEN 1 ELSE 0 END) as mastered,
              AVG(mcq_accuracy) as avg_mcq_accuracy,
              AVG(core_coverage) as avg_core_coverage
       FROM topicmastery WHERE user_id = $1`,
      [userId]
    );

    const recentPerformance = await db.query(
      `SELECT AVG(ai_score) as recent_avg
       FROM attempt
       WHERE user_id = $1 AND submitted_at >= date('now', '-30 days')`,
      [userId]
    );

    const totalQuestions = await db.query(
      `SELECT COUNT(DISTINCT q.id) as total FROM question q WHERE q.status = 'active'`
    );

    const attemptedQuestions = await db.query(
      `SELECT COUNT(DISTINCT question_id) as attempted FROM attempt WHERE user_id = $1`,
      [userId]
    );

    const profile = await db.query(
      'SELECT goal_tier FROM userprofile WHERE user_id = $1',
      [userId]
    );

    const m = mastery.rows[0] || {};
    const avgCompetency = parseFloat(m.avg_competency || 0);
    const topicsCovered = parseInt(m.topics_covered || 0);
    const masteredCount = parseInt(m.mastered || 0);
    const avgMcqAcc = parseFloat(m.avg_mcq_accuracy || 0);
    const avgCoreCov = parseFloat(m.avg_core_coverage || 0);
    const recentAvg = parseFloat(recentPerformance.rows[0]?.recent_avg || 0);
    const totalQ = parseInt(totalQuestions.rows[0]?.total || 1);
    const attemptedQ = parseInt(attemptedQuestions.rows[0]?.attempted || 0);
    const goalTier = profile.rows[0]?.goal_tier || 'good_rank';

    const syllabusCoverage = Math.min((attemptedQ / totalQ) * 100, 100);

    const rankScore = (
      avgCompetency * 0.30 +
      avgMcqAcc * 0.25 +
      recentAvg * 0.20 +
      syllabusCoverage * 0.15 +
      avgCoreCov * 0.10
    );

    let predictedRankRange;
    let rankTier;
    if (rankScore >= 85) {
      predictedRankRange = { min: 1, max: 100 };
      rankTier = 'elite';
    } else if (rankScore >= 75) {
      predictedRankRange = { min: 100, max: 500 };
      rankTier = 'excellent';
    } else if (rankScore >= 65) {
      predictedRankRange = { min: 500, max: 2000 };
      rankTier = 'good';
    } else if (rankScore >= 50) {
      predictedRankRange = { min: 2000, max: 10000 };
      rankTier = 'average';
    } else if (rankScore >= 35) {
      predictedRankRange = { min: 10000, max: 30000 };
      rankTier = 'below_average';
    } else {
      predictedRankRange = { min: 30000, max: 50000 };
      rankTier = 'needs_improvement';
    }

    const goalMapping = {
      top_rank: { target_min: 1, target_max: 100, label: 'Top 100' },
      good_rank: { target_min: 100, target_max: 1000, label: 'Top 1000' },
      just_pass: { target_min: 1000, target_max: 50000, label: 'Secure Seat' }
    };
    const goalTarget = goalMapping[goalTier] || goalMapping.good_rank;

    const onTrack = predictedRankRange.min <= goalTarget.target_max;

    const factors = [
      { factor: 'Avg Competency Score', value: Math.round(avgCompetency), weight: 30, max: 100 },
      { factor: 'MCQ Accuracy', value: Math.round(avgMcqAcc), weight: 25, max: 100 },
      { factor: 'Recent Performance (30d)', value: Math.round(recentAvg), weight: 20, max: 100 },
      { factor: 'Syllabus Coverage', value: Math.round(syllabusCoverage), weight: 15, max: 100 },
      { factor: 'Core Coverage', value: Math.round(avgCoreCov), weight: 10, max: 100 }
    ];

    res.json({
      rank_score: Math.round(rankScore * 100) / 100,
      predicted_rank: predictedRankRange,
      rank_tier: rankTier,
      goal: { tier: goalTier, ...goalTarget },
      on_track: onTrack,
      factors,
      stats: {
        topics_covered: topicsCovered,
        topics_mastered: masteredCount,
        questions_attempted: attemptedQ,
        total_questions: totalQ
      }
    });
  } catch (error) {
    console.error('Rank prediction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

