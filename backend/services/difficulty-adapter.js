const { db } = require('../db');

async function getStudentPerformanceProfile(userId, subject, topic) {
  const recentAttempts = await db.query(
    `SELECT a.ai_score, a.time_spent_seconds, a.misconception_type,
            q.difficulty, q.type, q.subtopic, q.yield_category
     FROM attempt a
     JOIN question q ON a.question_id = q.id
     WHERE a.user_id = $1 AND q.subject = $2 AND q.topic = $3
     ORDER BY a.submitted_at DESC
     LIMIT 30`,
    [userId, subject, topic]
  );

  const attempts = recentAttempts.rows;
  if (attempts.length === 0) {
    return {
      level: 'unknown',
      avgScore: 0,
      streak: 0,
      misconceptionRate: 0,
      speedFactor: 1,
      totalAttempts: 0,
      difficultyBreakdown: { easy: 0, medium: 0, hard: 0 },
      recommendation: 'medium'
    };
  }

  const avgScore = attempts.reduce((s, a) => s + (a.ai_score || 0), 0) / attempts.length;

  let streak = 0;
  for (const a of attempts) {
    if ((a.ai_score || 0) >= 70) streak++;
    else break;
  }

  const misconceptions = attempts.filter(a => a.misconception_type && a.misconception_type !== 'none').length;
  const misconceptionRate = misconceptions / attempts.length;

  const avgTime = attempts.reduce((s, a) => s + (a.time_spent_seconds || 0), 0) / attempts.length;
  let speedFactor = 1;
  if (avgTime < 30) speedFactor = 1.3;
  else if (avgTime < 60) speedFactor = 1.1;
  else if (avgTime > 180) speedFactor = 0.7;
  else if (avgTime > 120) speedFactor = 0.85;

  const difficultyBreakdown = { easy: 0, medium: 0, hard: 0 };
  const difficultyScores = { easy: [], medium: [], hard: [] };
  attempts.forEach(a => {
    const d = a.difficulty || 'medium';
    if (difficultyBreakdown[d] !== undefined) {
      difficultyBreakdown[d]++;
      difficultyScores[d].push(a.ai_score || 0);
    }
  });

  const avgByDifficulty = {};
  for (const [d, scores] of Object.entries(difficultyScores)) {
    avgByDifficulty[d] = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : null;
  }

  let level;
  if (avgScore >= 85 && streak >= 3 && speedFactor >= 1.0) {
    level = 'mastering_fast';
  } else if (avgScore >= 70 && misconceptionRate < 0.3) {
    level = 'progressing';
  } else if (avgScore >= 50) {
    level = 'struggling';
  } else {
    level = 'needs_foundation';
  }

  let recommendation;
  if (level === 'mastering_fast') {
    recommendation = 'hard';
  } else if (level === 'progressing') {
    if (avgByDifficulty.medium !== null && avgByDifficulty.medium >= 80) {
      recommendation = 'hard';
    } else {
      recommendation = 'medium';
    }
  } else if (level === 'struggling') {
    recommendation = 'easy';
  } else {
    recommendation = 'easy';
  }

  return {
    level,
    avgScore: Math.round(avgScore * 100) / 100,
    streak,
    misconceptionRate: Math.round(misconceptionRate * 100) / 100,
    speedFactor,
    totalAttempts: attempts.length,
    difficultyBreakdown,
    avgByDifficulty,
    recommendation
  };
}

function buildAdaptiveMCQQuery(subject, topic, focusBuckets, mcqLimit, profile) {
  const recommendation = profile.recommendation || 'medium';
  const level = profile.level || 'unknown';

  let difficultyDistribution;
  if (level === 'mastering_fast') {
    difficultyDistribution = { hard: 0.6, medium: 0.3, easy: 0.1 };
  } else if (level === 'progressing') {
    difficultyDistribution = { hard: 0.2, medium: 0.6, easy: 0.2 };
  } else if (level === 'struggling') {
    difficultyDistribution = { hard: 0.05, medium: 0.35, easy: 0.6 };
  } else {
    difficultyDistribution = { hard: 0.1, medium: 0.6, easy: 0.3 };
  }

  const hardCount = Math.max(1, Math.round(mcqLimit * difficultyDistribution.hard));
  const easyCount = Math.max(1, Math.round(mcqLimit * difficultyDistribution.easy));
  const mediumCount = Math.max(1, mcqLimit - hardCount - easyCount);

  let cognitivePreference;
  if (level === 'mastering_fast') {
    cognitivePreference = "'clinical', 'conceptual', 'factual'";
  } else if (level === 'struggling' || level === 'needs_foundation') {
    cognitivePreference = "'factual', 'conceptual', 'clinical'";
  } else {
    cognitivePreference = "'conceptual', 'clinical', 'factual'";
  }

  let trapInclusion;
  if (level === 'mastering_fast') {
    trapInclusion = true;
  } else if (level === 'struggling' || level === 'needs_foundation') {
    trapInclusion = false;
  } else {
    trapInclusion = true;
  }

  return {
    difficultyDistribution,
    counts: { hard: hardCount, medium: mediumCount, easy: easyCount },
    cognitivePreference,
    trapInclusion,
    recommendation,
    level
  };
}

async function fetchAdaptiveMCQs(subject, topic, focusBuckets, mcqLimit, adaptiveConfig) {
  const { counts, trapInclusion } = adaptiveConfig;

  const bucketPlaceholders = focusBuckets.map((_, i) => `$${i + 4}`).join(', ');
  const baseParams = [subject, topic, null, ...focusBuckets];

  const results = [];

  for (const [difficulty, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const params = [...baseParams];
    params[2] = count;

    let trapFilter = '';
    if (!trapInclusion && difficulty === 'easy') {
      trapFilter = "AND (trap_pattern IS NULL OR trap_pattern = '')";
    }

    const query = `SELECT * FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
         AND type IN ('mcq', 'true_false', 'assertion_reason')
         AND difficulty = '${difficulty}'
         AND yield_category IN (${bucketPlaceholders})
         ${trapFilter}
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END,
                RANDOM()
       LIMIT $3`;

    const res = await db.query(query, params);
    results.push(...res.rows);
  }

  if (results.length < Math.min(5, mcqLimit)) {
    const existingIds = results.map(r => r.id);
    const remaining = mcqLimit - results.length;
    const excludePlaceholders = existingIds.length > 0
      ? existingIds.map((_, i) => `$${i + 4 + focusBuckets.length}`).join(', ')
      : "'__none__'";

    let query;
    let params;
    if (existingIds.length > 0) {
      query = `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('mcq', 'true_false', 'assertion_reason')
           AND id NOT IN (${excludePlaceholders})
         ORDER BY RANDOM()
         LIMIT $3`;
      params = [subject, topic, remaining, ...existingIds];
    } else {
      query = `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('mcq', 'true_false', 'assertion_reason')
         ORDER BY RANDOM()
         LIMIT $3`;
      params = [subject, topic, remaining];
    }

    const fallback = await db.query(query, params);
    results.push(...fallback.rows);
  }

  return results.slice(0, mcqLimit);
}

function getAdaptiveSAQCount(profile) {
  const level = profile.level || 'unknown';
  if (level === 'struggling' || level === 'needs_foundation') {
    return 8;
  } else if (level === 'progressing') {
    return 6;
  } else if (level === 'mastering_fast') {
    return 4;
  }
  return 6;
}

function getAdaptiveMCQLimit(diagnosticLevel, profile) {
  const level = profile.level || 'unknown';

  if (level === 'mastering_fast') {
    return 15;
  } else if (level === 'needs_foundation') {
    return 8;
  }

  if (diagnosticLevel === 'strong') return 15;
  if (diagnosticLevel === 'good') return 12;
  return 8;
}

function getDifficultyLabel(profile) {
  const level = profile.level || 'unknown';
  if (level === 'mastering_fast') return 'Advanced Clinical';
  if (level === 'progressing') return 'Standard';
  if (level === 'struggling') return 'Foundation Building';
  if (level === 'needs_foundation') return 'Core Basics';
  return 'Standard';
}

module.exports = {
  getStudentPerformanceProfile,
  buildAdaptiveMCQQuery,
  fetchAdaptiveMCQs,
  getAdaptiveSAQCount,
  getAdaptiveMCQLimit,
  getDifficultyLabel
};

