const { db } = require('../db');

async function getTodayPlan(userId) {
  const today = new Date().toISOString().split('T')[0];
  const profileResult = await db.query(
    'SELECT exam_date, selected_subjects, daily_study_minutes FROM userprofile WHERE user_id = $1',
    [userId]
  );
  const profile = profileResult.rows[0] || {};
  const examDate = profile.exam_date ? new Date(profile.exam_date) : null;
  const now = new Date();
  const daysRemaining = examDate && examDate >= now
    ? Math.max(0, Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)))
    : null;

  const overdueResult = await db.query(
    `SELECT id, subject, topic, mastery_status, competency_score, next_revision_date, mastery_level
     FROM topicmastery
     WHERE user_id = $1 AND next_revision_date IS NOT NULL AND next_revision_date <= $2
       AND mastery_status != 'not_started'
     ORDER BY next_revision_date ASC
     LIMIT 10`,
    [userId, today]
  );

  const weakResult = await db.query(
    `SELECT id, subject, topic, mastery_status, competency_score, mastery_level
     FROM topicmastery
     WHERE user_id = $1 AND mastery_status IN ('relearn_core', 'revision_required', 'in_progress')
       AND (next_revision_date IS NULL OR next_revision_date > $2)
     ORDER BY competency_score ASC
     LIMIT 5`,
    [userId, today]
  );

  const scheduleResult = await db.query(
    'SELECT planned_questions, planned_minutes, subjects, topics, status FROM revisionschedule WHERE user_id = $1 AND date = $2',
    [userId, today]
  );
  const todaySchedule = scheduleResult.rows[0] || null;
  const scheduleSubjects = todaySchedule?.subjects
    ? (typeof todaySchedule.subjects === 'string' ? JSON.parse(todaySchedule.subjects) : todaySchedule.subjects)
    : [];
  const scheduleTopics = todaySchedule?.topics
    ? (typeof todaySchedule.topics === 'string' ? JSON.parse(todaySchedule.topics) : todaySchedule.topics)
    : [];

  const conceptMapTopicsResult = await db.query(
    'SELECT DISTINCT subject, topic FROM topic_gross_prompt ORDER BY subject, topic LIMIT 5'
  );
  const conceptMapTopics = conceptMapTopicsResult.rows || [];

  const dueRevisions = overdueResult.rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    mastery_status: r.mastery_status,
    priority: 'high',
    action: 'practice',
    label: `Revise: ${r.topic}`,
    route: `/practice?subject=${encodeURIComponent(r.subject)}&topic=${encodeURIComponent(r.topic)}`,
    diagnostic_route: `/diagnostic?subject=${encodeURIComponent(r.subject)}&topic=${encodeURIComponent(r.topic)}`
  }));

  const weakTopics = weakResult.rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    mastery_status: r.mastery_status,
    priority: 'high',
    action: 'topic_mastery',
    label: `Strengthen: ${r.topic}`,
    route: `/diagnostic?subject=${encodeURIComponent(r.subject)}&topic=${encodeURIComponent(r.topic)}`
  }));

  const suggestedActions = [];
  dueRevisions.forEach((r) => {
    suggestedActions.push({
      type: 'revision_due',
      subject: r.subject,
      topic: r.topic,
      priority: 'high',
      label: r.label,
      route: r.route,
      secondary_route: r.diagnostic_route
    });
  });
  weakTopics.forEach((w) => {
    if (!suggestedActions.some((a) => a.subject === w.subject && a.topic === w.topic)) {
      suggestedActions.push({
        type: 'weak_topic',
        subject: w.subject,
        topic: w.topic,
        priority: 'high',
        label: w.label,
        route: w.route
      });
    }
  });
  conceptMapTopics.forEach((c) => {
    suggestedActions.push({
      type: 'concept_map',
      subject: c.subject,
      topic: c.topic,
      priority: 'medium',
      label: `Concept map: ${c.topic}`,
      route: '/concept-map'
    });
  });

  const todayAttemptsResult = await db.query(
    'SELECT COUNT(*) as count FROM attempt WHERE user_id = $1 AND date(submitted_at) = $2',
    [userId, today]
  );
  const questionsDoneToday = parseInt(todayAttemptsResult.rows[0]?.count || 0, 10);

  return {
    date: today,
    exam_days_remaining: daysRemaining,
    exam_date: profile.exam_date || null,
    due_revisions: dueRevisions,
    weak_topics: weakTopics,
    suggested_actions: suggestedActions,
    today_schedule: todaySchedule ? {
      planned_questions: todaySchedule.planned_questions,
      planned_minutes: todaySchedule.planned_minutes,
      subjects: scheduleSubjects,
      topics: scheduleTopics,
      status: todaySchedule.status
    } : null,
    questions_done_today: questionsDoneToday,
    daily_study_minutes: profile.daily_study_minutes || 60
  };
}

module.exports = { getTodayPlan };
