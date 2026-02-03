const { db } = require('../db');

async function calculateReadiness(userId) {
  try {
    const profileResult = await db.query(
      'SELECT * FROM userprofile WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return null;
    }

    const profile = profileResult.rows[0];

    const sessionsResult = await db.query(
      `SELECT * FROM session WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    const attemptsResult = await db.query(
      `SELECT AVG(ai_score) as avg_score, COUNT(*) as total_attempts 
       FROM attempt WHERE user_id = $1`,
      [userId]
    );

    const topicMasteryResult = await db.query(
      `SELECT AVG(mastery_level) as avg_mastery, COUNT(*) as topics_count
       FROM topicmastery WHERE user_id = $1`,
      [userId]
    );

    const scheduleResult = await db.query(
      `SELECT COUNT(*) as completed_days
       FROM revisionschedule 
       WHERE user_id = $1 AND status = 'complete' AND date <= date('now')`,
      [userId]
    );

    const sessions = sessionsResult.rows;
    const avgScore = attemptsResult.rows[0]?.avg_score || 0;
    const totalAttempts = attemptsResult.rows[0]?.total_attempts || 0;
    const avgMastery = topicMasteryResult.rows[0]?.avg_mastery || 0;
    const topicsCount = topicMasteryResult.rows[0]?.topics_count || 0;
    const completedDays = scheduleResult.rows[0]?.completed_days || 0;

    let readinessPercentage = 0;

    if (totalAttempts > 0) {
      const scoreWeight = 0.4;
      const masteryWeight = 0.3;
      const consistencyWeight = 0.2;
      const volumeWeight = 0.1;

      const scoreComponent = (avgScore / 100) * 100 * scoreWeight;
      const masteryComponent = (avgMastery / 100) * 100 * masteryWeight;
      const consistencyComponent = Math.min((completedDays / 7) * 100, 100) * consistencyWeight;
      const volumeComponent = Math.min((totalAttempts / 50) * 100, 100) * volumeWeight;

      readinessPercentage = scoreComponent + masteryComponent + consistencyComponent + volumeComponent;
      readinessPercentage = Math.min(Math.max(readinessPercentage, 0), 100);
    }

    let status = 'off_track';
    if (readinessPercentage >= 70) {
      status = 'on_track';
    } else if (readinessPercentage >= 40) {
      status = 'borderline';
    }

    const existingReadiness = await db.query(
      'SELECT id FROM examreadiness WHERE user_id = $1',
      [userId]
    );

    const forecastData = {
      current_percentage: readinessPercentage,
      average_score: avgScore,
      average_mastery: avgMastery,
      total_sessions: sessions.length,
      total_attempts: totalAttempts,
      topics_covered: topicsCount,
      completed_schedule_days: completedDays,
      calculated_at: new Date().toISOString()
    };

    if (existingReadiness.rows.length > 0) {
      await db.query(
        `UPDATE examreadiness 
         SET readiness_percentage = $1, status = $2, forecast_data = $3, last_calculated = CURRENT_TIMESTAMP
         WHERE user_id = $4`,
        [readinessPercentage, status, JSON.stringify(forecastData), userId]
      );
    } else {
      const readinessId = db.generateUUID();
      await db.query(
        `INSERT INTO examreadiness (id, user_id, readiness_percentage, status, forecast_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [readinessId, userId, readinessPercentage, status, JSON.stringify(forecastData)]
      );
    }

    return {
      readiness_percentage: readinessPercentage,
      status: status,
      forecast_data: forecastData
    };
  } catch (error) {
    console.error('Calculate readiness error:', error);
    throw error;
  }
}

module.exports = { calculateReadiness };

