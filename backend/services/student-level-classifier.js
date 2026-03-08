const { scoreAnswerAgainstConcept, normalizeText } = require('./rubric-scorer');

const LEVELS = ['excellent', 'strong', 'average', 'weak', 'very_weak', 'bored'];

function detectMisconceptions(answerNorm, traps) {
  if (!Array.isArray(traps) || traps.length === 0) return [];
  const found = [];
  for (const trap of traps) {
    const text = typeof trap === 'string' ? trap : (trap.text || trap.description || trap);
    if (!text || typeof text !== 'string') continue;
    const words = text.toLowerCase().replace(/\s+/g, ' ').split(' ').filter(w => w.length > 2);
    const matchCount = words.filter(w => answerNorm.includes(w)).length;
    if (matchCount >= Math.min(2, Math.ceil(words.length / 2))) found.push(text);
  }
  return found;
}

function detectSaqMisconceptions(answerNorm, saqs) {
  if (!Array.isArray(saqs) || saqs.length === 0) return [];
  const found = [];
  for (const saq of saqs) {
    const misc = saq.misconceptions;
    if (!Array.isArray(misc)) continue;
    for (const m of misc) {
      const text = typeof m === 'string' ? m : (m.text || m);
      if (!text || typeof text !== 'string') continue;
      const words = text.toLowerCase().replace(/\s+/g, ' ').split(' ').filter(w => w.length > 2);
      const matchCount = words.filter(w => answerNorm.includes(w)).length;
      if (matchCount >= Math.min(2, Math.ceil(words.length / 2))) found.push(text);
    }
  }
  return found;
}

function wordCount(text) {
  if (text == null || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function similarityToCompactAnswer(answerNorm, compactAnswer) {
  if (!compactAnswer || typeof compactAnswer !== 'string') return 0;
  const compactNorm = normalizeText(compactAnswer);
  const aWords = compactNorm.split(/\s+/).filter(w => w.length > 2);
  if (aWords.length === 0) return 0;
  const matched = aWords.filter(w => answerNorm.includes(w)).length;
  return matched / aWords.length;
}

function classifyStudentLevel(concept, answerText, learnerLevel = 'mid') {
  const scoreResult = scoreAnswerAgainstConcept(concept, answerText, learnerLevel);
  const answerNorm = normalizeText(answerText);
  const traps = concept.traps || [];
  const saqs = concept.saqs || [];
  const misconceptionFromTraps = detectMisconceptions(answerNorm, traps);
  const misconceptionFromSaqs = detectSaqMisconceptions(answerNorm, saqs);
  const allMisconceptions = [...new Set([...misconceptionFromTraps, ...misconceptionFromSaqs])];
  const misconceptionCount = allMisconceptions.length;
  const scorePercent = scoreResult.scorePercent;
  const words = wordCount(answerText);
  const compactAnswer = saqs[0]?.compact_answer || null;
  const compactSimilarity = compactAnswer ? similarityToCompactAnswer(answerNorm, compactAnswer) : 0;

  let level = 'average';
  if (misconceptionCount >= 2 && scorePercent < 50) level = 'very_weak';
  else if (scorePercent >= 90 && misconceptionCount === 0) {
    if (words < 15 || (compactSimilarity > 0.85 && words < 30)) level = 'bored';
    else level = 'excellent';
  } else if (scorePercent >= 75 && misconceptionCount <= 1) level = 'strong';
  else if (scorePercent >= 50 && misconceptionCount <= 2) level = 'average';
  else if (scorePercent >= 30) level = 'weak';
  else level = 'very_weak';

  return {
    level,
    score_percent: scorePercent,
    misconception_count: misconceptionCount,
    misconceptions: allMisconceptions,
    points_hit: scoreResult.pointsHit?.length ?? 0,
    points_missed: scoreResult.pointsMissed?.length ?? 0,
    points_total: scoreResult.pointsTotal ?? 0,
    word_count: words
  };
}

function classifyStudentLevelFromAggregate(conceptResults, answerText, concepts) {
  const totalExpected = conceptResults.reduce((s, cr) => s + (cr.pointsExpected || 0), 0);
  const totalHit = conceptResults.reduce((s, cr) => s + (cr.pointsHit?.length || 0), 0);
  const scorePercent = totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0;
  const answerNorm = normalizeText(answerText);
  let misconceptionCount = 0;
  const allMisconceptions = [];
  for (const concept of concepts || []) {
    const traps = concept.traps || [];
    const saqs = concept.saqs || [];
    const fromTraps = detectMisconceptions(answerNorm, traps);
    const fromSaqs = detectSaqMisconceptions(answerNorm, saqs);
    for (const m of [...fromTraps, ...fromSaqs]) {
      if (!allMisconceptions.includes(m)) allMisconceptions.push(m);
    }
  }
  misconceptionCount = allMisconceptions.length;
  const words = wordCount(answerText);

  let level = 'average';
  if (misconceptionCount >= 2 && scorePercent < 50) level = 'very_weak';
  else if (scorePercent >= 90 && misconceptionCount === 0) {
    const compactAnswer = concepts?.[0]?.saqs?.[0]?.compact_answer;
    const compactSimilarity = compactAnswer ? similarityToCompactAnswer(answerNorm, compactAnswer) : 0;
    if (words < 15 || (compactSimilarity > 0.85 && words < 30)) level = 'bored';
    else level = 'excellent';
  } else if (scorePercent >= 75 && misconceptionCount <= 1) level = 'strong';
  else if (scorePercent >= 50 && misconceptionCount <= 2) level = 'average';
  else if (scorePercent >= 30) level = 'weak';
  else level = 'very_weak';

  return {
    level,
    score_percent: scorePercent,
    misconception_count: misconceptionCount,
    misconceptions: allMisconceptions,
    points_hit: totalHit,
    points_missed: conceptResults.reduce((s, cr) => s + (cr.pointsMissed?.length || 0), 0),
    points_total: totalExpected,
    word_count: words
  };
}

module.exports = {
  LEVELS,
  classifyStudentLevel,
  classifyStudentLevelFromAggregate,
  detectMisconceptions,
  detectSaqMisconceptions
};
