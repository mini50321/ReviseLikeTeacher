function normalizeText(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return normalizeText(s).split(/\s+/).filter(Boolean);
}

function answerMatchesPhrase(answerNorm, phrase) {
  if (!phrase || typeof phrase !== 'string') return false;
  const p = normalizeText(phrase);
  if (p.length < 2) return answerNorm.includes(p);
  return answerNorm.includes(p);
}

function answerMatchesRubricItem(answerNorm, item) {
  const phrases = item.example_phrases;
  if (Array.isArray(phrases) && phrases.length > 0) {
    const matched = phrases.filter(p => {
      const s = typeof p === 'string' ? p : (p && p.trim ? p.trim() : '');
      return s && s.length >= 2 && answerMatchesPhrase(answerNorm, s);
    });
    const minRequired = phrases.length >= 2 ? 2 : 1;
    if (matched.length >= minRequired) return true;
  }
  const desc = item.description && typeof item.description === 'string' ? item.description : '';
  const label = item.label && typeof item.label === 'string' ? item.label : '';
  const words = [...tokenize(desc), ...tokenize(label)].filter(w => w.length > 1);
  const uniqueWords = [...new Set(words)];
  let matchCount = 0;
  for (const w of uniqueWords) {
    if (answerNorm.includes(w)) matchCount++;
  }
  const threshold = Math.min(2, Math.ceil(uniqueWords.length / 2));
  return matchCount >= threshold;
}

function getExpectedCount(rubric, learnerLevel) {
  if (!Array.isArray(rubric) || rubric.length === 0) return 0;
  const withTier = rubric.filter(r => r.tier === 'must_know' || r.tier === 'deep');
  if (withTier.length === 0) return rubric.length;
  if (learnerLevel === 'top') return rubric.length;
  if (learnerLevel === 'mid' || learnerLevel === 'struggling') {
    const mustKnow = rubric.filter(r => r.tier === 'must_know');
    return mustKnow.length > 0 ? mustKnow.length : rubric.length;
  }
  return rubric.length;
}

function scoreAnswerAgainstConcept(concept, answerText, learnerLevel = 'mid') {
  const rubric = Array.isArray(concept.grading_rubric) ? concept.grading_rubric : [];
  if (rubric.length === 0) {
    return {
      score: 0,
      pointsHit: [],
      pointsMissed: [],
      pointsExpected: 0,
      pointsTotal: 0,
      message: 'No grading rubric defined for this concept.'
    };
  }

  const answerNorm = normalizeText(answerText);
  const pointsHit = [];
  const pointsMissed = [];

  for (const item of rubric) {
    const id = item.id || item.label;
    const label = item.label || item.id || '';
    if (answerMatchesRubricItem(answerNorm, item)) {
      pointsHit.push({ id, label, description: item.description });
    } else {
      pointsMissed.push({ id, label, description: item.description });
    }
  }

  const pointsExpected = getExpectedCount(rubric, learnerLevel);
  const pointsTotal = rubric.length;
  const numerator = pointsHit.length;
  const denominator = pointsExpected > 0 ? pointsExpected : pointsTotal;
  const score = denominator > 0 ? Math.round((numerator / denominator) * 100) / 100 : 0;
  const scorePercent = denominator > 0 ? Math.min(100, Math.round((numerator / denominator) * 100)) : 0;

  return {
    score: Math.min(1, score),
    scorePercent,
    pointsHit,
    pointsMissed,
    pointsExpected: denominator,
    pointsTotal,
    numerator,
    denominator
  };
}

module.exports = {
  scoreAnswerAgainstConcept,
  answerMatchesRubricItem,
  normalizeText
};
