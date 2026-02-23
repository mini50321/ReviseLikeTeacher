const { db } = require('../db');

const ACTIVITY_TYPES = {
  REVISION: 'revision',
  LEARNING: 'learning',
  PRACTICE: 'practice',
  DIAGNOSTIC: 'diagnostic',
  BREAK: 'break'
};

async function generateDailyPlan(userId) {
  const profileResult = await db.query(
    'SELECT * FROM userprofile WHERE user_id = $1',
    [userId]
  );

  if (profileResult.rows.length === 0) return null;

  const profile = profileResult.rows[0];
  const dailyMinutes = profile.daily_study_minutes || 120;
  const goalTier = profile.goal_tier || 'good_rank';
  const selectedSubjects = profile.selected_subjects
    ? (typeof profile.selected_subjects === 'string' ? JSON.parse(profile.selected_subjects) : profile.selected_subjects)
    : [];
  const examDate = profile.exam_date ? new Date(profile.exam_date) : null;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const daysRemaining = examDate ? Math.max(1, Math.ceil((examDate - today) / (1000 * 60 * 60 * 24))) : 180;

  const overdueRevisions = await db.query(
    `SELECT tm.subject, tm.topic, tm.mastery_status, tm.competency_score,
            tm.next_revision_date, tm.mastery_level
     FROM topicmastery tm
     WHERE tm.user_id = $1 AND tm.next_revision_date <= $2
       AND tm.mastery_status != 'mastered'
     ORDER BY tm.competency_score ASC
     LIMIT 5`,
    [userId, todayStr]
  );

  const dueRevisions = await db.query(
    `SELECT tm.subject, tm.topic, tm.mastery_status, tm.competency_score,
            tm.next_revision_date, tm.mastery_level
     FROM topicmastery tm
     WHERE tm.user_id = $1 AND tm.next_revision_date = $2
       AND tm.mastery_status = 'mastered'
     ORDER BY tm.competency_score ASC
     LIMIT 3`,
    [userId, todayStr]
  );

  const weakTopics = await db.query(
    `SELECT tm.subject, tm.topic, tm.mastery_status, tm.competency_score,
            tm.mastery_level, tm.mcq_accuracy
     FROM topicmastery tm
     WHERE tm.user_id = $1 AND tm.mastery_status IN ('relearn_core', 'revision_required')
       AND (tm.next_revision_date IS NULL OR tm.next_revision_date > $2)
     ORDER BY tm.competency_score ASC
     LIMIT 3`,
    [userId, todayStr]
  );

  const allocations = await db.query(
    `SELECT subject, priority_score, allocated_hours, learning_percentage,
            practice_percentage, revision_percentage
     FROM subject_allocation
     WHERE user_id = $1
     ORDER BY priority_score DESC`,
    [userId]
  );

  const highYieldNotStarted = await db.query(
    `SELECT q.subject, q.topic,
            COUNT(*) as question_count,
            SUM(CASE WHEN q.yield_category = 'core' THEN 1 ELSE 0 END) as core_count
     FROM question q
     WHERE q.status = 'active' AND q.subject IN (${selectedSubjects.map((_, i) => `$${i + 1}`).join(',')})
       AND NOT EXISTS (
         SELECT 1 FROM topicmastery tm
         WHERE tm.user_id = $${selectedSubjects.length + 1} AND tm.subject = q.subject AND tm.topic = q.topic
       )
     GROUP BY q.subject, q.topic
     HAVING SUM(CASE WHEN q.yield_category = 'core' THEN 1 ELSE 0 END) > 0
     ORDER BY core_count DESC
     LIMIT 3`,
    [...selectedSubjects, userId]
  );

  const todayAttempts = await db.query(
    `SELECT COUNT(*) as count FROM attempt
     WHERE user_id = $1 AND date(submitted_at) = $2`,
    [userId, todayStr]
  );
  const alreadyDoneToday = parseInt(todayAttempts.rows[0]?.count || 0);

  const blocks = [];
  let minutesLeft = dailyMinutes;
  let startMinute = 0;

  const allOverdue = [...overdueRevisions.rows, ...dueRevisions.rows];
  if (allOverdue.length > 0 && minutesLeft > 0) {
    const revMinutes = Math.min(
      Math.ceil(dailyMinutes * 0.30),
      minutesLeft,
      allOverdue.length * 20
    );

    const perTopicMinutes = Math.max(10, Math.floor(revMinutes / allOverdue.length));

    for (const rev of allOverdue) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perTopicMinutes, minutesLeft);
      blocks.push({
        type: ACTIVITY_TYPES.REVISION,
        subject: rev.subject,
        topic: rev.topic,
        duration_minutes: mins,
        start_minute: startMinute,
        priority: rev.mastery_status === 'relearn_core' ? 'high' : 'medium',
        description: `Revise ${rev.topic} (${rev.mastery_status.replace(/_/g, ' ')})`,
        competency_score: rev.competency_score,
        action_url: `/diagnostic?subject=${encodeURIComponent(rev.subject)}&topic=${encodeURIComponent(rev.topic)}`
      });
      startMinute += mins;
      minutesLeft -= mins;
    }
  }

  if (weakTopics.rows.length > 0 && minutesLeft > 15) {
    const learnMinutes = Math.min(
      Math.ceil(dailyMinutes * 0.25),
      minutesLeft,
      weakTopics.rows.length * 25
    );
    const perTopicMinutes = Math.max(15, Math.floor(learnMinutes / weakTopics.rows.length));

    for (const wt of weakTopics.rows) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perTopicMinutes, minutesLeft);
      blocks.push({
        type: ACTIVITY_TYPES.LEARNING,
        subject: wt.subject,
        topic: wt.topic,
        duration_minutes: mins,
        start_minute: startMinute,
        priority: 'high',
        description: `Strengthen weak area: ${wt.topic}`,
        competency_score: wt.competency_score,
        action_url: `/teaching-units?subject=${encodeURIComponent(wt.subject)}&topic=${encodeURIComponent(wt.topic)}`
      });
      startMinute += mins;
      minutesLeft -= mins;
    }
  }

  if (minutesLeft > 10 && startMinute > 40) {
    const breakMins = Math.min(10, minutesLeft);
    blocks.push({
      type: ACTIVITY_TYPES.BREAK,
      subject: null,
      topic: null,
      duration_minutes: breakMins,
      start_minute: startMinute,
      priority: 'low',
      description: 'Short break — stretch, hydrate',
      action_url: null
    });
    startMinute += breakMins;
    minutesLeft -= breakMins;
  }

  if (minutesLeft > 15) {
    const pracMinutes = Math.min(Math.ceil(dailyMinutes * 0.30), minutesLeft);
    const practiceSubjects = allocations.rows.length > 0
      ? allocations.rows.slice(0, 3)
      : selectedSubjects.slice(0, 3).map(s => ({ subject: s }));

    const perSubjectMinutes = Math.max(10, Math.floor(pracMinutes / practiceSubjects.length));

    for (const alloc of practiceSubjects) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perSubjectMinutes, minutesLeft);
      const subj = alloc.subject;
      blocks.push({
        type: ACTIVITY_TYPES.PRACTICE,
        subject: subj,
        topic: null,
        duration_minutes: mins,
        start_minute: startMinute,
        priority: 'medium',
        description: `MCQ practice: ${subj}`,
        action_url: `/practice?subject=${encodeURIComponent(subj)}`
      });
      startMinute += mins;
      minutesLeft -= mins;
    }
  }

  if (highYieldNotStarted.rows.length > 0 && minutesLeft > 15) {
    const newTopic = highYieldNotStarted.rows[0];
    const mins = Math.min(20, minutesLeft);
    blocks.push({
      type: ACTIVITY_TYPES.DIAGNOSTIC,
      subject: newTopic.subject,
      topic: newTopic.topic,
      duration_minutes: mins,
      start_minute: startMinute,
      priority: 'medium',
      description: `Start new high-yield topic: ${newTopic.topic}`,
      core_questions: parseInt(newTopic.core_count),
      action_url: `/diagnostic?subject=${encodeURIComponent(newTopic.subject)}&topic=${encodeURIComponent(newTopic.topic)}`
    });
    startMinute += mins;
    minutesLeft -= mins;
  }

  const totalPlanned = blocks.reduce((sum, b) => sum + b.duration_minutes, 0);
  const revisionMinutes = blocks.filter(b => b.type === ACTIVITY_TYPES.REVISION).reduce((s, b) => s + b.duration_minutes, 0);
  const learningMinutes = blocks.filter(b => b.type === ACTIVITY_TYPES.LEARNING).reduce((s, b) => s + b.duration_minutes, 0);
  const practiceMinutes = blocks.filter(b => b.type === ACTIVITY_TYPES.PRACTICE).reduce((s, b) => s + b.duration_minutes, 0);

  let urgencyLevel = 'normal';
  if (daysRemaining <= 30) urgencyLevel = 'critical';
  else if (daysRemaining <= 90) urgencyLevel = 'high';
  else if (daysRemaining <= 180) urgencyLevel = 'moderate';

  return {
    date: todayStr,
    total_planned_minutes: totalPlanned,
    total_available_minutes: dailyMinutes,
    blocks,
    summary: {
      revision_minutes: revisionMinutes,
      learning_minutes: learningMinutes,
      practice_minutes: practiceMinutes,
      overdue_revisions: overdueRevisions.rows.length,
      due_revisions: dueRevisions.rows.length,
      weak_topics: weakTopics.rows.length,
      new_topics_available: highYieldNotStarted.rows.length,
      questions_done_today: alreadyDoneToday
    },
    context: {
      days_remaining: daysRemaining,
      exam_date: examDate ? examDate.toISOString().split('T')[0] : null,
      goal_tier: goalTier,
      urgency_level: urgencyLevel
    }
  };
}

module.exports = { generateDailyPlan };

