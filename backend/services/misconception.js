const { db } = require('../db');

const MISCONCEPTION_TYPES = [
  'concept_missing',
  'confusion_pair',
  'rule_exception_failure',
  'memory_slip',
  'application_failure',
  'overgeneralization',
  'trap_susceptibility'
];

async function detectMisconception(userId, question, answerText, isCorrect, score) {
  if (isCorrect || score >= 70) return null;

  const misconception = {
    type: null,
    details: null,
    severity: 1,
    concept_tested: null,
    distractor_meaning: null,
    remediation: null
  };

  misconception.concept_tested = question.concept_tags || question.subtopic || question.topic;

  let distractorData = null;
  if (question.distractor_analysis) {
    try {
      const analysis = typeof question.distractor_analysis === 'string'
        ? JSON.parse(question.distractor_analysis) : question.distractor_analysis;
      const chosen = answerText.trim().toUpperCase();
      if (analysis[chosen]) {
        distractorData = analysis[chosen];
        misconception.distractor_meaning = typeof distractorData === 'string'
          ? distractorData : distractorData.meaning || JSON.stringify(distractorData);
      }
    } catch (e) {}
  }

  if (distractorData) {
    const errorType = typeof distractorData === 'object' ? distractorData.error_type : null;
    if (errorType && MISCONCEPTION_TYPES.includes(errorType)) {
      misconception.type = errorType;
    }
  }

  if (!misconception.type) {
    misconception.type = classifyMisconceptionFromScore(score, question);
  }

  misconception.severity = calculateSeverity(score, misconception.type);
  misconception.details = buildDetails(misconception, question, answerText);
  misconception.remediation = getRemediation(misconception.type);

  const previousAttempts = await db.query(
    `SELECT COUNT(*) as cnt FROM attempt
     WHERE user_id = $1 AND question_id = $2 AND ai_score < 70`,
    [userId, question.id]
  );
  const repeatCount = parseInt(previousAttempts.rows[0]?.cnt || 0);
  if (repeatCount >= 1) {
    misconception.severity = Math.min(5, misconception.severity + 1);
  }

  if (misconception.type === 'confusion_pair' || detectConfusionPattern(question, answerText)) {
    await trackConfusionPair(userId, question, answerText);
  }

  return misconception;
}

function classifyMisconceptionFromScore(score, question) {
  if (score === 0) {
    if (question.trap_pattern) return 'trap_susceptibility';
    if (question.cognitive_focus === 'clinical') return 'application_failure';
    return 'concept_missing';
  }
  if (score <= 30) {
    if (question.cognitive_focus === 'clinical') return 'application_failure';
    return 'concept_missing';
  }
  if (score <= 50) {
    return 'memory_slip';
  }
  return 'overgeneralization';
}

function detectConfusionPattern(question, answerText) {
  if (!question.distractor_analysis) return false;
  try {
    const analysis = typeof question.distractor_analysis === 'string'
      ? JSON.parse(question.distractor_analysis) : question.distractor_analysis;
    const chosen = answerText.trim().toUpperCase();
    if (analysis[chosen]) {
      const meaning = typeof analysis[chosen] === 'object'
        ? analysis[chosen].error_type : null;
      return meaning === 'confusion_pair';
    }
  } catch (e) {}
  return false;
}

function calculateSeverity(score, type) {
  let base = 1;
  if (score === 0) base = 4;
  else if (score <= 20) base = 3;
  else if (score <= 40) base = 2;
  else base = 1;

  if (type === 'concept_missing') base = Math.min(5, base + 1);
  if (type === 'trap_susceptibility') base = Math.min(5, base + 1);

  return base;
}

function buildDetails(misconception, question, answerText) {
  const parts = [];
  parts.push(`Topic: ${question.topic}`);
  if (question.subtopic) parts.push(`Subtopic: ${question.subtopic}`);
  parts.push(`Type: ${misconception.type.replace(/_/g, ' ')}`);
  if (misconception.distractor_meaning) {
    parts.push(`Distractor chosen: ${misconception.distractor_meaning}`);
  }
  if (question.correct_answer) {
    parts.push(`Correct: ${question.correct_answer}`);
  }
  return parts.join('; ');
}

function getRemediation(type) {
  switch (type) {
    case 'concept_missing':
      return { action: 'concept_review', description: 'Review core concept with targeted SAQs' };
    case 'confusion_pair':
      return { action: 'comparison_table', description: 'Study comparison table + 2 extra SAQs on the confused concepts' };
    case 'rule_exception_failure':
      return { action: 'exception_drill', description: 'Focus on rule exceptions with targeted examples' };
    case 'memory_slip':
      return { action: 'mnemonic_drill', description: 'Use mnemonic + rapid recall drill' };
    case 'application_failure':
      return { action: 'laq_minicase', description: 'Practice with LAQ mini-case scenarios' };
    case 'overgeneralization':
      return { action: 'specificity_drill', description: 'Study specific conditions and exceptions' };
    case 'trap_susceptibility':
      return { action: 'trap_analysis', description: 'Analyze common trap patterns in this area' };
    default:
      return { action: 'general_review', description: 'Review the topic thoroughly' };
  }
}

async function trackConfusionPair(userId, question, answerText) {
  const conceptA = question.subtopic || question.topic;
  let conceptB = null;

  if (question.distractor_analysis) {
    try {
      const analysis = typeof question.distractor_analysis === 'string'
        ? JSON.parse(question.distractor_analysis) : question.distractor_analysis;
      const chosen = answerText.trim().toUpperCase();
      if (analysis[chosen]) {
        conceptB = typeof analysis[chosen] === 'object'
          ? (analysis[chosen].confused_with || analysis[chosen].meaning || chosen)
          : analysis[chosen];
      }
    } catch (e) {}
  }

  if (!conceptB) {
    conceptB = `Option ${answerText.trim().toUpperCase()}`;
  }

  const existing = await db.query(
    `SELECT * FROM confusion_pairs
     WHERE user_id = $1 AND subject = $2 AND topic = $3
       AND ((concept_a = $4 AND concept_b = $5) OR (concept_a = $5 AND concept_b = $4))`,
    [userId, question.subject, question.topic, conceptA, conceptB]
  );

  if (existing.rows.length > 0) {
    const newCount = (existing.rows[0].occurrence_count || 1) + 1;
    await db.query(
      `UPDATE confusion_pairs SET occurrence_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newCount, existing.rows[0].id]
    );
    return { id: existing.rows[0].id, count: newCount, is_new: false };
  } else {
    const pairId = db.generateUUID();
    await db.query(
      `INSERT INTO confusion_pairs (id, user_id, concept_a, concept_b, subject, topic)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pairId, userId, conceptA, conceptB, question.subject, question.topic]
    );
    return { id: pairId, count: 1, is_new: true };
  }
}

async function getConfusionPairsTrigger(userId, subject, topic) {
  const result = await db.query(
    `SELECT * FROM confusion_pairs
     WHERE user_id = $1 AND subject = $2 AND topic = $3
       AND resolved = 0 AND occurrence_count >= 2
     ORDER BY occurrence_count DESC`,
    [userId, subject, topic]
  );
  return result.rows;
}

async function getMisconceptionSummary(userId, subject, topic) {
  let query = `
    SELECT a.misconception_type, COUNT(*) as count,
           q.topic, q.subtopic
    FROM attempt a
    JOIN question q ON a.question_id = q.id
    WHERE a.user_id = $1 AND a.misconception_type IS NOT NULL`;
  const params = [userId];
  let paramCount = 2;

  if (subject) {
    query += ` AND q.subject = $${paramCount++}`;
    params.push(subject);
  }
  if (topic) {
    query += ` AND q.topic = $${paramCount++}`;
    params.push(topic);
  }

  query += ' GROUP BY a.misconception_type, q.topic, q.subtopic ORDER BY count DESC';

  const result = await db.query(query, params);
  return result.rows;
}

async function getRemediationPlan(userId, subject, topic) {
  const misconceptions = await getMisconceptionSummary(userId, subject, topic);
  const confusionPairs = await getConfusionPairsTrigger(userId, subject, topic);

  const plan = [];

  for (const cp of confusionPairs) {
    plan.push({
      type: 'confusion_pair_drill',
      priority: 'high',
      concepts: [cp.concept_a, cp.concept_b],
      occurrence_count: cp.occurrence_count,
      action: 'Force comparison table + 2 extra SAQs',
      topic: cp.topic
    });
  }

  const appFailures = misconceptions.filter(m => m.misconception_type === 'application_failure');
  for (const af of appFailures) {
    plan.push({
      type: 'application_failure_drill',
      priority: af.count >= 3 ? 'high' : 'medium',
      topic: af.topic,
      subtopic: af.subtopic,
      count: parseInt(af.count),
      action: 'Add LAQ mini-case'
    });
  }

  const memorySlips = misconceptions.filter(m => m.misconception_type === 'memory_slip');
  for (const ms of memorySlips) {
    plan.push({
      type: 'memory_drill',
      priority: ms.count >= 3 ? 'high' : 'medium',
      topic: ms.topic,
      subtopic: ms.subtopic,
      count: parseInt(ms.count),
      action: 'Mnemonic + rapid recall drill'
    });
  }

  const conceptMissing = misconceptions.filter(m => m.misconception_type === 'concept_missing');
  for (const cm of conceptMissing) {
    plan.push({
      type: 'concept_review',
      priority: cm.count >= 3 ? 'high' : 'medium',
      topic: cm.topic,
      subtopic: cm.subtopic,
      count: parseInt(cm.count),
      action: 'Targeted SAQ concept review'
    });
  }

  plan.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });

  return plan;
}

module.exports = {
  detectMisconception,
  trackConfusionPair,
  getConfusionPairsTrigger,
  getMisconceptionSummary,
  getRemediationPlan,
  MISCONCEPTION_TYPES
};

