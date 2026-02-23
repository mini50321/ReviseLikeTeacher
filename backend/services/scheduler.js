const { db } = require('../db');

const DECAY_CONSTANT = 0.05;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 60;

function calculateDecay(daysSinceReview, masteryLevel) {
  const retention = Math.exp(-DECAY_CONSTANT * daysSinceReview / Math.max(masteryLevel / 100, 0.1));
  return Math.max(0, Math.min(1, retention));
}

function calculateNextInterval(mastery, revisionCount, intelligenceFactor) {
  const base = MIN_INTERVAL_DAYS;
  const factor = Math.pow(2, revisionCount * 0.5);
  const masteryBonus = (mastery / 100) * 2;
  const interval = base * factor * (1 + masteryBonus) * intelligenceFactor;
  return Math.max(MIN_INTERVAL_DAYS, Math.min(MAX_INTERVAL_DAYS, Math.round(interval)));
}

function getMasteryBasedInterval(masteryStatus, completedRevisions) {
  const intervals = {
    mastered: [7, 21, 45],
    revision_required: [3, 10, 25],
    relearn_core: [1, 5, 15]
  };
  const statusIntervals = intervals[masteryStatus] || intervals.revision_required;
  const idx = Math.min(completedRevisions, statusIntervals.length - 1);
  return statusIntervals[idx];
}

async function loadTuningIntervals() {
  try {
    const result = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name LIKE 'revision_interval_%'`
    );
    const tuning = {};
    result.rows.forEach(r => { tuning[r.parameter_name] = parseFloat(r.parameter_value); });
    return {
      mastered: [
        tuning.revision_interval_mastered_1 || 7,
        tuning.revision_interval_mastered_2 || 21,
        tuning.revision_interval_mastered_3 || 45
      ],
      revision_required: [
        tuning.revision_interval_revision_1 || 3,
        tuning.revision_interval_revision_2 || 10,
        tuning.revision_interval_revision_3 || 25
      ],
      relearn_core: [
        tuning.revision_interval_relearn_1 || 1,
        tuning.revision_interval_relearn_2 || 5,
        tuning.revision_interval_relearn_3 || 15
      ]
    };
  } catch (e) {
    return {
      mastered: [7, 21, 45],
      revision_required: [3, 10, 25],
      relearn_core: [1, 5, 15]
    };
  }
}

function prioritizeTopics(topics) {
  return topics.map(topic => {
    const daysSinceReview = topic.last_revision_date
      ? Math.max(0, (Date.now() - new Date(topic.last_revision_date).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const retention = calculateDecay(daysSinceReview, topic.mastery_level || 0);
    const urgency = (1 - retention) * 100;
    const masteryPenalty = 100 - (topic.mastery_level || 0);
    const revisionDebt = Math.max(0, (topic.required_revisions || 3) - (topic.completed_revisions || 0));

    const priority = (urgency * 0.4) + (masteryPenalty * 0.35) + (revisionDebt * 10 * 0.25);

    return {
      ...topic,
      retention: Math.round(retention * 100),
      urgency: Math.round(urgency),
      priority: Math.round(priority),
      days_since_review: Math.round(daysSinceReview)
    };
  }).sort((a, b) => b.priority - a.priority);
}

async function generateSmartSchedule(userId) {
  const profileResult = await db.query(
    'SELECT * FROM userprofile WHERE user_id = $1',
    [userId]
  );

  if (profileResult.rows.length === 0) {
    return null;
  }

  const profile = profileResult.rows[0];
  const dailyMinutes = profile.daily_study_minutes || 60;
  const weeklyQuestions = profile.weekly_question_target || 50;
  const questionsPerDay = Math.ceil(weeklyQuestions / 7);
  const selectedSubjects = profile.selected_subjects
    ? (typeof profile.selected_subjects === 'string' ? JSON.parse(profile.selected_subjects) : profile.selected_subjects)
    : [];
  const intelligenceScore = profile.intelligence_score || 50;
  const intelligenceFactor = 0.5 + (intelligenceScore / 100);

  const topicsResult = await db.query(
    'SELECT * FROM topicmastery WHERE user_id = $1',
    [userId]
  );

  const topics = topicsResult.rows;
  const prioritized = prioritizeTopics(topics);

  const attemptsResult = await db.query(
    `SELECT question.subject, question.topic, AVG(attempt.ai_score) as avg_score,
            COUNT(*) as attempt_count
     FROM attempt
     JOIN question ON attempt.question_id = question.id
     WHERE attempt.user_id = $1
     GROUP BY question.subject, question.topic`,
    [userId]
  );

  const performanceMap = {};
  attemptsResult.rows.forEach(row => {
    const key = `${row.subject}:${row.topic}`;
    performanceMap[key] = {
      avg_score: row.avg_score || 0,
      attempt_count: row.attempt_count || 0
    };
  });

  const today = new Date();
  const schedules = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const scheduleDate = new Date(today);
    scheduleDate.setDate(today.getDate() + dayOffset);
    const dateString = scheduleDate.toISOString().split('T')[0];

    const existingSchedule = await db.query(
      'SELECT id FROM revisionschedule WHERE user_id = $1 AND date = $2',
      [userId, dateString]
    );

    if (existingSchedule.rows.length > 0) {
      await db.query(
        'DELETE FROM revisionschedule WHERE user_id = $1 AND date = $2',
        [userId, dateString]
      );
    }

    const dayTopics = [];
    const daySubjects = new Set();
    let allocatedQuestions = 0;

    for (const topic of prioritized) {
      if (allocatedQuestions >= questionsPerDay) break;

      const interval = calculateNextInterval(
        topic.mastery_level || 0,
        topic.revision_count || 0,
        intelligenceFactor
      );

      const daysSinceReview = topic.days_since_review || 999;
      const isDue = daysSinceReview >= interval - dayOffset;

      if (isDue || dayOffset === 0) {
        const perfKey = `${topic.subject}:${topic.topic}`;
        const perf = performanceMap[perfKey];
        let topicQuestions = Math.ceil(questionsPerDay / Math.max(prioritized.length, 1) * 2);

        if (perf && perf.avg_score < 50) {
          topicQuestions = Math.ceil(topicQuestions * 1.5);
        }

        topicQuestions = Math.min(topicQuestions, questionsPerDay - allocatedQuestions);

        if (topicQuestions > 0) {
          dayTopics.push(topic.topic);
          daySubjects.add(topic.subject);
          allocatedQuestions += topicQuestions;
        }
      }
    }

    if (allocatedQuestions === 0) {
      allocatedQuestions = questionsPerDay;
      selectedSubjects.forEach(s => daySubjects.add(s));
    }

    const adjustedMinutes = Math.round(dailyMinutes * (allocatedQuestions / questionsPerDay));

    const difficultyMix = {
      easy: 0.2,
      medium: 0.5,
      hard: 0.3
    };

    const weakTopics = prioritized.filter(t => (t.mastery_level || 0) < 40);
    if (weakTopics.length > 0) {
      difficultyMix.easy = 0.3;
      difficultyMix.medium = 0.5;
      difficultyMix.hard = 0.2;
    }

    const scheduleId = db.generateUUID();
    await db.query(
      `INSERT INTO revisionschedule
       (id, user_id, date, planned_questions, planned_minutes, subjects, topics, difficulty_mix, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')`,
      [
        scheduleId,
        userId,
        dateString,
        allocatedQuestions,
        adjustedMinutes,
        JSON.stringify([...daySubjects]),
        JSON.stringify(dayTopics),
        JSON.stringify(difficultyMix)
      ]
    );

    schedules.push({
      id: scheduleId,
      date: dateString,
      planned_questions: allocatedQuestions,
      planned_minutes: adjustedMinutes,
      subjects: [...daySubjects],
      topics: dayTopics,
      difficulty_mix: difficultyMix,
      status: 'scheduled'
    });
  }

  const tuningIntervals = await loadTuningIntervals();

  for (const topic of prioritized) {
    if (!topic.next_revision_date && topic.mastery_status && topic.mastery_status !== 'not_started') {
      const statusIntervals = tuningIntervals[topic.mastery_status] || tuningIntervals.revision_required;
      const roundIdx = Math.min(topic.completed_revisions || 0, statusIntervals.length - 1);
      const intervalDays = statusIntervals[roundIdx];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + intervalDays);
      const nextDateString = nextDate.toISOString().split('T')[0];

      await db.query(
        'UPDATE topicmastery SET next_revision_date = $1 WHERE id = $2',
        [nextDateString, topic.id]
      );
    }
  }

  return {
    schedules,
    prioritized_topics: prioritized.slice(0, 10),
    performance_summary: performanceMap
  };
}

async function getTopicPriorities(userId) {
  const topicsResult = await db.query(
    'SELECT * FROM topicmastery WHERE user_id = $1',
    [userId]
  );

  return prioritizeTopics(topicsResult.rows);
}

module.exports = {
  generateSmartSchedule,
  getTopicPriorities,
  calculateDecay,
  calculateNextInterval,
  getMasteryBasedInterval,
  loadTuningIntervals,
  prioritizeTopics
};

