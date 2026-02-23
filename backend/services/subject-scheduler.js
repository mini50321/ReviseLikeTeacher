const { db } = require('../db');

const DEFAULT_SUBJECT_WEIGHTS = {
  'General Medicine': 1.5,
  'General Surgery': 1.3,
  'Obstetrics & Gynaecology': 1.3,
  'Paediatrics': 1.2,
  'Pathology': 1.4,
  'Pharmacology': 1.4,
  'Anatomy': 1.2,
  'Physiology': 1.2,
  'Biochemistry': 1.1,
  'Microbiology': 1.2,
  'Community Medicine': 1.1,
  'Forensic Medicine': 1.0,
  'Ophthalmology': 1.0,
  'ENT': 1.0,
  'Orthopaedics': 1.0,
  'Dermatology': 1.0,
  'Psychiatry': 0.9,
  'Anaesthesia': 0.9,
  'Radiology': 0.9
};

const GOAL_TIER_BUFFERS = {
  top_rank: 0.05,
  good_rank: 0.10,
  seat_only: 0.15
};

const CATEGORY_MULTIPLIERS = {
  bright: 1.2,
  average: 1.0,
  weak: 0.8
};

async function generateSubjectPlan(userId) {
  const profileResult = await db.query(
    'SELECT * FROM userprofile WHERE user_id = $1',
    [userId]
  );

  if (profileResult.rows.length === 0) return null;

  const profile = profileResult.rows[0];
  const selectedSubjects = profile.selected_subjects
    ? (typeof profile.selected_subjects === 'string' ? JSON.parse(profile.selected_subjects) : profile.selected_subjects)
    : [];

  if (selectedSubjects.length === 0) return null;

  const examDate = profile.exam_date ? new Date(profile.exam_date) : null;
  const today = new Date();
  const daysRemaining = examDate ? Math.max(1, Math.ceil((examDate - today) / (1000 * 60 * 60 * 24))) : 180;
  const dailyHours = (profile.daily_study_minutes || 60) / 60;
  const goalTier = profile.goal_tier || 'good_rank';
  const studentCategory = profile.student_category || 'average';
  const buffer = GOAL_TIER_BUFFERS[goalTier] || 0.10;

  const totalHours = daysRemaining * dailyHours * (1 - buffer);

  const masteryResult = await db.query(
    `SELECT subject, topic, mastery_level, mastery_status, competency_score, mcq_accuracy
     FROM topicmastery WHERE user_id = $1`,
    [userId]
  );

  const subjectMastery = {};
  masteryResult.rows.forEach(row => {
    if (!subjectMastery[row.subject]) {
      subjectMastery[row.subject] = { topics: [], avgMastery: 0, topicCount: 0 };
    }
    subjectMastery[row.subject].topics.push(row);
    subjectMastery[row.subject].topicCount++;
  });

  for (const [subj, data] of Object.entries(subjectMastery)) {
    const sum = data.topics.reduce((s, t) => s + (t.mastery_level || 0), 0);
    data.avgMastery = data.topicCount > 0 ? sum / data.topicCount : 0;
  }

  const allocations = [];
  let totalPriority = 0;

  for (const subject of selectedSubjects) {
    const weight = DEFAULT_SUBJECT_WEIGHTS[subject] || 1.0;
    const mastery = subjectMastery[subject];
    const selfRating = await getSubjectSelfRating(userId, subject);

    const effectiveRating = mastery
      ? Math.min(5, Math.max(1, Math.round(mastery.avgMastery / 20)))
      : selfRating;

    const priority = weight * (6 - effectiveRating);
    totalPriority += priority;

    allocations.push({
      subject,
      weight,
      self_rating: selfRating,
      effective_rating: effectiveRating,
      priority,
      avg_mastery: mastery ? Math.round(mastery.avgMastery * 100) / 100 : 0,
      topics_mastered: mastery ? mastery.topics.filter(t => t.mastery_status === 'mastered').length : 0,
      total_topics_attempted: mastery ? mastery.topicCount : 0
    });
  }

  const categoryMultiplier = CATEGORY_MULTIPLIERS[studentCategory] || 1.0;

  for (const alloc of allocations) {
    alloc.allocated_hours = totalPriority > 0
      ? Math.round((totalHours * (alloc.priority / totalPriority)) * 100) / 100
      : Math.round((totalHours / selectedSubjects.length) * 100) / 100;

    const { learningPct, practicePct, revisionPct } = getTimeDistribution(alloc, goalTier);
    alloc.learning_hours = Math.round(alloc.allocated_hours * learningPct * 100) / 100;
    alloc.practice_hours = Math.round(alloc.allocated_hours * practicePct * 100) / 100;
    alloc.revision_hours = Math.round(alloc.allocated_hours * revisionPct * 100) / 100;
    alloc.learning_percentage = Math.round(learningPct * 100);
    alloc.practice_percentage = Math.round(practicePct * 100);
    alloc.revision_percentage = Math.round(revisionPct * 100);

    alloc.daily_hours = Math.round((alloc.allocated_hours / daysRemaining) * 100) / 100;
    alloc.priority_rank = 0;
  }

  allocations.sort((a, b) => b.priority - a.priority);
  allocations.forEach((a, i) => { a.priority_rank = i + 1; });

  for (const alloc of allocations) {
    const existingAlloc = await db.query(
      'SELECT id FROM subject_allocation WHERE user_id = $1 AND subject = $2',
      [userId, alloc.subject]
    );

    if (existingAlloc.rows.length > 0) {
      await db.query(
        `UPDATE subject_allocation SET
         priority_score = $1, weight = $2, self_rating = $3,
         allocated_hours = $4, learning_percentage = $5,
         practice_percentage = $6, revision_percentage = $7
         WHERE user_id = $8 AND subject = $9`,
        [alloc.priority, alloc.weight, alloc.self_rating,
         alloc.allocated_hours, alloc.learning_percentage,
         alloc.practice_percentage, alloc.revision_percentage,
         userId, alloc.subject]
      );
    } else {
      await db.query(
        `INSERT INTO subject_allocation
         (id, user_id, subject, priority_score, weight, self_rating,
          allocated_hours, learning_percentage, practice_percentage, revision_percentage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [db.generateUUID(), userId, alloc.subject,
         alloc.priority, alloc.weight, alloc.self_rating,
         alloc.allocated_hours, alloc.learning_percentage,
         alloc.practice_percentage, alloc.revision_percentage]
      );
    }
  }

  const topicSequence = await buildTopicSequence(userId, allocations, goalTier);

  return {
    summary: {
      total_hours: Math.round(totalHours * 100) / 100,
      days_remaining: daysRemaining,
      daily_hours: dailyHours,
      buffer_percentage: Math.round(buffer * 100),
      goal_tier: goalTier,
      student_category: studentCategory,
      subjects_count: selectedSubjects.length,
      exam_date: examDate ? examDate.toISOString().split('T')[0] : null
    },
    allocations,
    topic_sequence: topicSequence
  };
}

function getTimeDistribution(alloc, goalTier) {
  const masteryLevel = alloc.avg_mastery || 0;

  if (masteryLevel < 30) {
    return { learningPct: 0.65, practicePct: 0.25, revisionPct: 0.10 };
  } else if (masteryLevel < 60) {
    return { learningPct: 0.55, practicePct: 0.35, revisionPct: 0.10 };
  } else {
    return { learningPct: 0.40, practicePct: 0.35, revisionPct: 0.25 };
  }
}

async function getSubjectSelfRating(userId, subject) {
  const result = await db.query(
    'SELECT self_rating FROM subject_allocation WHERE user_id = $1 AND subject = $2',
    [userId, subject]
  );
  return result.rows.length > 0 ? (result.rows[0].self_rating || 3) : 3;
}

async function buildTopicSequence(userId, allocations, goalTier) {
  const sequence = [];

  for (const alloc of allocations) {
    const questionsResult = await db.query(
      `SELECT DISTINCT topic, subtopic, yield_category
       FROM question
       WHERE subject = $1 AND status = 'active'
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 WHEN 'occasional' THEN 3 ELSE 4 END`,
      [alloc.subject]
    );

    const topicMap = {};
    questionsResult.rows.forEach(row => {
      if (!topicMap[row.topic]) {
        topicMap[row.topic] = { topic: row.topic, subject: alloc.subject, subtopics: [], has_core: false, yield_score: 0 };
      }
      if (row.subtopic && !topicMap[row.topic].subtopics.includes(row.subtopic)) {
        topicMap[row.topic].subtopics.push(row.subtopic);
      }
      if (row.yield_category === 'core') {
        topicMap[row.topic].has_core = true;
        topicMap[row.topic].yield_score += 4;
      } else if (row.yield_category === 'frequent') {
        topicMap[row.topic].yield_score += 3;
      } else if (row.yield_category === 'occasional') {
        topicMap[row.topic].yield_score += 2;
      } else {
        topicMap[row.topic].yield_score += 1;
      }
    });

    const masteryResult = await db.query(
      `SELECT topic, mastery_level, mastery_status FROM topicmastery
       WHERE user_id = $1 AND subject = $2`,
      [userId, alloc.subject]
    );

    const masteryMap = {};
    masteryResult.rows.forEach(row => {
      masteryMap[row.topic] = row;
    });

    const topics = Object.values(topicMap).map(t => {
      const mastery = masteryMap[t.topic];
      return {
        ...t,
        mastery_level: mastery ? mastery.mastery_level : 0,
        mastery_status: mastery ? mastery.mastery_status : 'not_started',
        priority_rank: alloc.priority_rank
      };
    });

    topics.sort((a, b) => {
      if (a.has_core && !b.has_core) return -1;
      if (!a.has_core && b.has_core) return 1;

      if (a.mastery_status === 'not_started' && b.mastery_status !== 'not_started') return -1;
      if (a.mastery_status !== 'not_started' && b.mastery_status === 'not_started') return 1;

      if (a.mastery_status === 'relearn_core' && b.mastery_status !== 'relearn_core') return -1;
      if (a.mastery_status !== 'relearn_core' && b.mastery_status === 'relearn_core') return 1;

      return b.yield_score - a.yield_score;
    });

    let limit;
    if (goalTier === 'top_rank') {
      limit = topics.length;
    } else if (goalTier === 'good_rank') {
      limit = Math.ceil(topics.length * 0.8);
    } else {
      limit = Math.ceil(topics.length * 0.5);
    }

    sequence.push(...topics.slice(0, limit).map((t, idx) => ({
      ...t,
      sequence_order: idx + 1,
      subject_priority: alloc.priority_rank,
      allocated_hours: alloc.allocated_hours
    })));
  }

  sequence.sort((a, b) => {
    if (a.subject_priority !== b.subject_priority) return a.subject_priority - b.subject_priority;
    return a.sequence_order - b.sequence_order;
  });

  return sequence.slice(0, 50);
}

async function updateSubjectRating(userId, subject, selfRating) {
  const existing = await db.query(
    'SELECT id FROM subject_allocation WHERE user_id = $1 AND subject = $2',
    [userId, subject]
  );

  if (existing.rows.length > 0) {
    await db.query(
      'UPDATE subject_allocation SET self_rating = $1 WHERE user_id = $2 AND subject = $3',
      [selfRating, userId, subject]
    );
  } else {
    await db.query(
      `INSERT INTO subject_allocation (id, user_id, subject, self_rating, weight)
       VALUES ($1, $2, $3, $4, $5)`,
      [db.generateUUID(), userId, subject, selfRating, DEFAULT_SUBJECT_WEIGHTS[subject] || 1.0]
    );
  }
}

async function getSubjectAllocations(userId) {
  const result = await db.query(
    'SELECT * FROM subject_allocation WHERE user_id = $1 ORDER BY priority_score DESC',
    [userId]
  );
  return result.rows;
}

module.exports = {
  generateSubjectPlan,
  updateSubjectRating,
  getSubjectAllocations,
  DEFAULT_SUBJECT_WEIGHTS
};

