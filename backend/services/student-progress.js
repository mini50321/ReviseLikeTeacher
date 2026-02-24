const { db } = require('../db');

async function getStudentList(filters = {}) {
  let whereClause = `u.role = 'student'`;
  const params = [];
  let idx = 1;

  if (filters.search) {
    whereClause += ` AND u.email LIKE $${idx}`;
    params.push(`%${filters.search}%`);
    idx++;
  }

  const result = await db.query(
    `SELECT u.id, u.email, u.created_at as joined_at,
      NULL as full_name, up.goal_tier, up.student_category, up.subscription_tier,
      up.exam_date, ROUND(COALESCE(up.daily_study_minutes, 0) / 60.0, 1) as daily_study_hours,
       (SELECT COUNT(*) FROM attempt a WHERE a.user_id = u.id) as total_attempts,
      (SELECT COUNT(*) FROM attempt a WHERE a.user_id = u.id AND a.ai_score >= 70) as correct_attempts,
       (SELECT COUNT(DISTINCT subject || '|' || topic) FROM topicmastery tm WHERE tm.user_id = u.id AND tm.mastery_status = 'mastered') as mastered_topics,
       (SELECT COUNT(DISTINCT subject || '|' || topic) FROM topicmastery tm WHERE tm.user_id = u.id) as total_topics_touched,
       (SELECT COUNT(*) FROM diagnostic_assessment da WHERE da.user_id = u.id) as diagnostics_done,
       (SELECT COUNT(*) FROM topic_learning_session tls WHERE tls.user_id = u.id AND tls.current_phase = 'completed') as sessions_completed,
      (SELECT MAX(a.submitted_at) FROM attempt a WHERE a.user_id = u.id) as last_activity
     FROM users u
     LEFT JOIN userprofile up ON up.user_id = u.id
     WHERE ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );

  return result.rows.map(r => {
    const accuracy = r.total_attempts > 0
      ? ((r.correct_attempts / r.total_attempts) * 100).toFixed(1)
      : 0;

    const daysSinceActivity = r.last_activity
      ? Math.floor((Date.now() - new Date(r.last_activity).getTime()) / 86400000)
      : null;

    let status = 'active';
    if (daysSinceActivity === null) status = 'never_started';
    else if (daysSinceActivity > 14) status = 'inactive';
    else if (daysSinceActivity > 7) status = 'at_risk';

    return {
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      joined_at: r.joined_at,
      goal_tier: r.goal_tier,
      student_category: r.student_category,
      subscription_tier: r.subscription_tier || 'free',
      exam_date: r.exam_date,
      daily_study_hours: r.daily_study_hours,
      total_attempts: r.total_attempts || 0,
      accuracy: parseFloat(accuracy),
      mastered_topics: r.mastered_topics || 0,
      total_topics_touched: r.total_topics_touched || 0,
      diagnostics_done: r.diagnostics_done || 0,
      sessions_completed: r.sessions_completed || 0,
      last_activity: r.last_activity,
      days_since_activity: daysSinceActivity,
      status
    };
  });
}

async function getStudentDetail(userId) {
  const user = await db.query(
    `SELECT u.id, u.email, u.created_at as joined_at,
      NULL as full_name, up.goal_tier, up.student_category, up.subscription_tier,
      up.exam_date, ROUND(COALESCE(up.daily_study_minutes, 0) / 60.0, 1) as daily_study_hours, up.selected_subjects as target_subjects
     FROM users u
     LEFT JOIN userprofile up ON up.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (user.rows.length === 0) return null;

  const profile = user.rows[0];

  const masteryResult = await db.query(
    `SELECT subject, topic, mastery_level, mastery_status, competency_score, diagnostic_level, mcq_accuracy, core_coverage
     FROM topicmastery WHERE user_id = $1 ORDER BY subject, topic`,
    [userId]
  );

  const sessionsResult = await db.query(
    `SELECT subject, topic, current_phase, mastery_result, competency_score, mcq_accuracy, core_coverage, adaptive_level, started_at, completed_at
     FROM topic_learning_session WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50`,
    [userId]
  );

  const attemptStats = await db.query(
    `SELECT
       COUNT(*) as total,
      SUM(CASE WHEN ai_score >= 70 THEN 1 ELSE 0 END) as correct,
       COUNT(DISTINCT q.subject) as subjects_practiced,
      MIN(submitted_at) as first_attempt,
      MAX(submitted_at) as last_attempt
     FROM attempt a
     LEFT JOIN question q ON q.id = a.question_id
     WHERE a.user_id = $1`,
    [userId]
  );

  const subjectBreakdown = await db.query(
    `SELECT q.subject as subject,
       COUNT(*) as attempts,
      SUM(CASE WHEN a.ai_score >= 70 THEN 1 ELSE 0 END) as correct
     FROM attempt a
     JOIN question q ON q.id = a.question_id
     WHERE a.user_id = $1
     GROUP BY q.subject ORDER BY attempts DESC`,
    [userId]
  );

  const misconceptionResult = await db.query(
    `SELECT misconception_type, COUNT(*) as count
     FROM attempt WHERE user_id = $1 AND misconception_type IS NOT NULL
     GROUP BY misconception_type ORDER BY count DESC`,
    [userId]
  );

  const revisionResult = await db.query(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'scheduled' AND date < date('now') THEN 1 ELSE 0 END) as overdue
     FROM revisionschedule WHERE user_id = $1`,
    [userId]
  );

  const competencyTrend = await db.query(
    `SELECT subject, topic, score, calculated_at
     FROM competency_score_log WHERE user_id = $1
     ORDER BY calculated_at DESC LIMIT 30`,
    [userId]
  );

  const mockTests = await db.query(
    `SELECT id, title, status, score, correct_count, wrong_count, total_questions, created_at
     FROM mock_test WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  const diagnostics = await db.query(
    `SELECT subject, topic, diagnostic_level, raw_score, created_at
     FROM diagnostic_assessment WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );

  const stats = attemptStats.rows[0] || {};
  const accuracy = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : 0;

  const masteryByStatus = {};
  for (const m of masteryResult.rows) {
    const status = m.mastery_status || 'not_started';
    masteryByStatus[status] = (masteryByStatus[status] || 0) + 1;
  }

  const revision = revisionResult.rows[0] || {};

  return {
    profile: {
      ...profile,
      target_subjects: safeJsonParse(profile.target_subjects, [])
    },
    stats: {
      total_attempts: stats.total || 0,
      correct_attempts: stats.correct || 0,
      accuracy: parseFloat(accuracy),
      subjects_practiced: stats.subjects_practiced || 0,
      first_attempt: stats.first_attempt,
      last_attempt: stats.last_attempt
    },
    mastery: {
      by_status: masteryByStatus,
      topics: masteryResult.rows
    },
    sessions: sessionsResult.rows,
    subject_breakdown: subjectBreakdown.rows.map(s => ({
      ...s,
      accuracy: s.attempts > 0 ? parseFloat(((s.correct / s.attempts) * 100).toFixed(1)) : 0
    })),
    misconceptions: misconceptionResult.rows,
    revision: {
      total: revision.total || 0,
      completed: revision.completed || 0,
      overdue: revision.overdue || 0,
      adherence: revision.total > 0 ? parseFloat(((revision.completed / revision.total) * 100).toFixed(1)) : 0
    },
    competency_trend: competencyTrend.rows,
    mock_tests: mockTests.rows,
    diagnostics: diagnostics.rows
  };
}

async function getPlatformOverview() {
  const totalStudents = await db.query(
    `SELECT COUNT(*) as count FROM users WHERE role = 'student'`
  );

  const activeStudents = await db.query(
    `SELECT COUNT(DISTINCT user_id) as count FROM attempt
     WHERE submitted_at > datetime('now', '-7 days')`
  );

  const totalAttempts = await db.query(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN ai_score >= 70 THEN 1 ELSE 0 END) as correct
     FROM attempt`
  );

  const topicsMastered = await db.query(
    `SELECT COUNT(*) as count FROM topicmastery WHERE mastery_status = 'mastered'`
  );

  const tierDistribution = await db.query(
    `SELECT COALESCE(up.subscription_tier, 'free') as tier, COUNT(*) as count
     FROM users u
     LEFT JOIN userprofile up ON up.user_id = u.id
     WHERE u.role = 'student'
     GROUP BY tier`
  );

  const goalDistribution = await db.query(
    `SELECT COALESCE(up.goal_tier, 'unknown') as goal, COUNT(*) as count
     FROM users u
     LEFT JOIN userprofile up ON up.user_id = u.id
     WHERE u.role = 'student'
     GROUP BY goal`
  );

  const weeklyActivity = await db.query(
    `SELECT date(submitted_at) as day, COUNT(*) as attempts, COUNT(DISTINCT user_id) as users
     FROM attempt
     WHERE submitted_at > datetime('now', '-14 days')
     GROUP BY day ORDER BY day`
  );

  const commonWeakTopics = await db.query(
    `SELECT subject, topic, COUNT(*) as student_count
     FROM topicmastery
     WHERE mastery_status IN ('revision_required', 'relearn_core', 'weak')
     GROUP BY subject, topic
     ORDER BY student_count DESC
     LIMIT 10`
  );

  const avgAccuracyBySubject = await db.query(
    `SELECT q.subject as subject,
       COUNT(*) as attempts,
      ROUND(AVG(a.ai_score), 1) as avg_accuracy
     FROM attempt a
     JOIN question q ON q.id = a.question_id
     GROUP BY q.subject
     ORDER BY avg_accuracy ASC
     LIMIT 15`
  );

  const recentSignups = await db.query(
    `SELECT COUNT(*) as count FROM users
     WHERE role = 'student' AND created_at > datetime('now', '-7 days')`
  );

  const stats = totalAttempts.rows[0] || {};
  const platformAccuracy = stats.total > 0
    ? ((stats.correct / stats.total) * 100).toFixed(1)
    : 0;

  return {
    total_students: totalStudents.rows[0]?.count || 0,
    active_students_7d: activeStudents.rows[0]?.count || 0,
    new_signups_7d: recentSignups.rows[0]?.count || 0,
    total_attempts: stats.total || 0,
    platform_accuracy: parseFloat(platformAccuracy),
    topics_mastered: topicsMastered.rows[0]?.count || 0,
    tier_distribution: tierDistribution.rows.reduce((acc, r) => { acc[r.tier] = r.count; return acc; }, {}),
    goal_distribution: goalDistribution.rows.reduce((acc, r) => { acc[r.goal] = r.count; return acc; }, {}),
    weekly_activity: weeklyActivity.rows,
    common_weak_topics: commonWeakTopics.rows,
    accuracy_by_subject: avgAccuracyBySubject.rows
  };
}

async function getAlerts() {
  const inactive = await db.query(
    `SELECT u.id, u.email, NULL as full_name,
      MAX(a.submitted_at) as last_activity
     FROM users u
     LEFT JOIN attempt a ON a.user_id = u.id
     WHERE u.role = 'student'
     GROUP BY u.id
     HAVING last_activity IS NOT NULL AND last_activity < datetime('now', '-7 days')
     ORDER BY last_activity ASC
     LIMIT 20`
  );

  const struggling = await db.query(
    `SELECT u.id, u.email, NULL as full_name,
       COUNT(a.id) as total_attempts,
      ROUND(AVG(a.ai_score), 1) as accuracy
     FROM users u
     JOIN attempt a ON a.user_id = u.id
     WHERE u.role = 'student'
     GROUP BY u.id
     HAVING total_attempts >= 10 AND accuracy < 40
     ORDER BY accuracy ASC
     LIMIT 20`
  );

  const overdueRevisions = await db.query(
    `SELECT u.id, u.email, NULL as full_name, COUNT(rs.id) as overdue_count
     FROM users u
     JOIN revisionschedule rs ON rs.user_id = u.id
     WHERE u.role = 'student' AND rs.status = 'scheduled' AND rs.date < date('now')
     GROUP BY u.id
     HAVING overdue_count >= 3
     ORDER BY overdue_count DESC
     LIMIT 20`
  );

  const neverStarted = await db.query(
    `SELECT u.id, u.email, NULL as full_name, u.created_at as joined_at
     FROM users u
     LEFT JOIN attempt a ON a.user_id = u.id
     WHERE u.role = 'student' AND a.id IS NULL
       AND u.created_at < datetime('now', '-2 days')
     ORDER BY u.created_at ASC
     LIMIT 20`
  );

  return {
    inactive: inactive.rows,
    struggling: struggling.rows,
    overdue_revisions: overdueRevisions.rows,
    never_started: neverStarted.rows,
    total_alerts: inactive.rows.length + struggling.rows.length + overdueRevisions.rows.length + neverStarted.rows.length
  };
}

function safeJsonParse(str, fallback) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || fallback);
  } catch {
    return fallback;
  }
}

module.exports = {
  getStudentList,
  getStudentDetail,
  getPlatformOverview,
  getAlerts
};

