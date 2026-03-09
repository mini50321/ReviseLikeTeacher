const { db } = require('../db');
const { scoreAnswerAgainstConcept } = require('../services/rubric-scorer');
const {
  buildMissedPointsQueue,
  getLeadingPromptForTier
} = require('../services/concept-map-session');
const { classifyStudentLevelFromAggregate } = require('../services/student-level-classifier');
const { getRollingAccuracy, getSuggestedProfile } = require('../services/learner-profile');

function parseJsonField(val, fallback = null) {
  if (val == null || val === '') return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

function serializeConcept(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id || null,
    name: row.name,
    display_order: row.display_order != null ? row.display_order : 0,
    must_know_points: parseJsonField(row.must_know_points, []),
    deep_points: parseJsonField(row.deep_points, []),
    traps: parseJsonField(row.traps, []),
    leading_questions: parseJsonField(row.leading_questions, []),
    grading_rubric: parseJsonField(row.grading_rubric, []),
    saqs: parseJsonField(row.saqs, []),
    mcqs: parseJsonField(row.mcqs, []),
    micro_questions: parseJsonField(row.micro_questions, [])
  };
}

function synthesizeAnswerFromDiagnostic(saqAnswers) {
  const answers = saqAnswers || {};
  const texts = Object.values(answers)
    .map(a => (typeof a === 'object' && a && a.text) ? a.text : (typeof a === 'string' ? a : ''))
    .filter(Boolean);
  return texts.join(' ') || '';
}

function map6LevelTo3Level(level) {
  if (!level) return 'mid';
  switch (level) {
    case 'excellent':
    case 'strong':
    case 'bored':
      return 'top';
    case 'weak':
    case 'very_weak':
      return 'struggling';
    default:
      return 'mid';
  }
}

async function startConceptMapSessionFromDiagnostic(userId, diagnosticId, options = {}) {
  const diagResult = await db.query(
    'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
    [diagnosticId, userId]
  );
  if (!diagResult.rows || diagResult.rows.length === 0) {
    return { error: 'Diagnostic not found', session_id: null };
  }
  const diagnostic = diagResult.rows[0];
  const subject = diagnostic.subject;
  const topic = diagnostic.topic;
  const saqAnswers = parseJsonField(diagnostic.saq_answers, {});
  const answerText = synthesizeAnswerFromDiagnostic(saqAnswers);
  const conceptsResult = await db.query(
    `SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 ORDER BY display_order ASC, concept_key ASC`,
    [subject, topic]
  );
  const concepts = (conceptsResult.rows || []).map(serializeConcept);
  if (concepts.length === 0) {
    return { error: 'No concepts found for this topic', session_id: null };
  }
  let learnerLevel = 'mid';
  const inferredStudentLevel = options.inferredStudentLevel; // 6-level: excellent/strong/average/weak/very_weak/bored
  if (inferredStudentLevel && ['excellent', 'strong', 'average', 'weak', 'very_weak', 'bored'].includes(inferredStudentLevel)) {
    learnerLevel = map6LevelTo3Level(inferredStudentLevel);
  } else {
    try {
      const profileResult = await db.query(
        'SELECT learner_profile FROM userprofile WHERE user_id = $1',
        [userId]
      );
      const savedProfile = (profileResult.rows && profileResult.rows[0]) ? profileResult.rows[0].learner_profile : null;
      if (savedProfile && ['top', 'mid', 'struggling'].includes(savedProfile)) {
        learnerLevel = savedProfile;
      } else {
        const { accuracy } = await getRollingAccuracy(userId, subject, topic);
        learnerLevel = getSuggestedProfile(accuracy);
      }
    } catch (e) {}
  }
  const level = ['top', 'mid', 'struggling'].includes(learnerLevel) ? learnerLevel : 'mid';
  const answer = answerText.trim() || 'No answer provided.';
  const conceptResults = [];
  let totalExpected = 0;
  let totalHit = 0;
  for (const concept of concepts) {
    const scoreResult = scoreAnswerAgainstConcept(concept, answer, level);
    totalExpected += scoreResult.pointsExpected;
    totalHit += scoreResult.numerator;
    conceptResults.push({
      concept_id: concept.id,
      concept_key: concept.concept_key,
      concept_name: concept.name,
      display_order: concept.display_order,
      score: scoreResult.score,
      scorePercent: scoreResult.scorePercent,
      pointsHit: scoreResult.pointsHit,
      pointsMissed: scoreResult.pointsMissed,
      pointsExpected: scoreResult.pointsExpected,
      pointsTotal: scoreResult.pointsTotal
    });
  }
  const levelClassification = inferredStudentLevel
    ? { level: inferredStudentLevel, score_percent: totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0 }
    : classifyStudentLevelFromAggregate(conceptResults, answer, concepts);
  const missedQueue = buildMissedPointsQueue(conceptResults, concepts);
  const promptResult = await db.query(
    'SELECT prompt_text FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
    [subject, topic]
  );
  const promptText = (promptResult.rows && promptResult.rows[0]) ? promptResult.rows[0].prompt_text : null;
  let currentConceptId = null;
  let currentPointId = null;
  let leadingTier = 1;
  let leadingPrompt = null;
  const firstMissed = missedQueue[0];
  if (firstMissed) {
    currentConceptId = firstMissed.concept_id;
    currentPointId = firstMissed.point_id;
    leadingPrompt = getLeadingPromptForTier(firstMissed.leading_questions, 1);
  }
  const snapshot = JSON.stringify({
    concept_results: conceptResults,
    missed_points_queue: missedQueue,
    concepts: concepts.map(c => ({
      id: c.id,
      concept_key: c.concept_key,
      name: c.name,
      leading_questions: c.leading_questions,
      micro_questions: c.micro_questions,
      mcqs: c.mcqs || []
    })),
    student_level: levelClassification.level,
    primary_concept_id: concepts[0]?.id || null
  });
  const sessionId = db.generateUUID();
  await db.query(
    `INSERT INTO concept_map_session
     (id, user_id, subject, topic, learner_level, snapshot, current_concept_id, current_point_id, probe_count, leading_tier, phase, completed_point_ids, time_limit_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'probing', $10, 15)`,
    [sessionId, userId, subject, topic, level, snapshot, currentConceptId, currentPointId, leadingTier, JSON.stringify([])]
  );
  return {
    session_id: sessionId,
    subject,
    topic,
    student_level: levelClassification.level,
    prompt_text: promptText,
    aggregated: {
      total_points_expected: totalExpected,
      total_points_hit: totalHit,
      overall_score_percent: totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0
    },
    next_step: firstMissed ? {
      concept_id: currentConceptId,
      concept_key: firstMissed.concept_key,
      concept_name: firstMissed.concept_name,
      point_id: currentPointId,
      point_label: firstMissed.point_label,
      point_description: firstMissed.point_description,
      leading_prompt: leadingPrompt,
      leading_tier: 1
    } : null,
    completed: missedQueue.length === 0
  };
}

module.exports = {
  startConceptMapSessionFromDiagnostic,
  synthesizeAnswerFromDiagnostic
};
