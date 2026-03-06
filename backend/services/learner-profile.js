const { db } = require('../db');

const ROLLING_LIMIT = 20;
const THRESHOLD_TOP = 85;
const THRESHOLD_MID = 60;

async function getRollingAccuracy(userId, subject, topic, limit = ROLLING_LIMIT) {
  const result = await db.query(
    `SELECT a.ai_score, a.id
     FROM attempt a
     JOIN question q ON a.question_id = q.id
     WHERE a.user_id = $1 AND q.subject = $2 AND q.topic = $3 AND q.status = 'active'
     ORDER BY a.submitted_at DESC
     LIMIT $4`,
    [userId, subject, topic, limit]
  );
  const rows = result.rows || [];
  if (rows.length === 0) return { accuracy: null, count: 0 };
  const passing = rows.filter(r => (r.ai_score != null) && Number(r.ai_score) >= 70).length;
  const accuracy = Math.round((passing / rows.length) * 100);
  return { accuracy, count: rows.length };
}

function getSuggestedProfile(accuracy) {
  if (accuracy == null) return 'mid';
  if (accuracy >= THRESHOLD_TOP) return 'top';
  if (accuracy >= THRESHOLD_MID) return 'mid';
  return 'struggling';
}

function getProfileTargets(profile) {
  const targets = {
    top: {
      description: '80–100% of deep + must-know points',
      focus: 'More "why" questions, edge cases, traps, viva-style. Fewer repeats, more variations.',
      expected_tier: 'all'
    },
    mid: {
      description: '80–100% of must-know points',
      focus: 'Interpretation, common exam patterns, PYQ traps. Repeat high-yield until consistent.',
      expected_tier: 'must_know'
    },
    struggling: {
      description: 'Small increments (e.g. +10% per session)',
      focus: 'One concept at a time, heavy repetition. Recognition → recall progression.',
      expected_tier: 'must_know'
    }
  };
  return targets[profile] || targets.mid;
}

module.exports = {
  getRollingAccuracy,
  getSuggestedProfile,
  getProfileTargets,
  ROLLING_LIMIT,
  THRESHOLD_TOP,
  THRESHOLD_MID
};
