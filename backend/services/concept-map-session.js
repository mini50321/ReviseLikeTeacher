function buildMissedPointsQueue(conceptResults, concepts) {
  const queue = [];
  for (const cr of conceptResults) {
    const concept = concepts.find(c => c.id === cr.concept_id);
    if (!cr.pointsMissed || cr.pointsMissed.length === 0) continue;
    for (const point of cr.pointsMissed) {
      queue.push({
        concept_id: cr.concept_id,
        concept_key: cr.concept_key,
        concept_name: cr.concept_name,
        point_id: point.id,
        point_label: point.label,
        point_description: point.description,
        leading_questions: (concept && concept.leading_questions) || []
      });
    }
  }
  return queue;
}

function getLeadingPromptForTier(leadingQuestions, tier) {
  if (!Array.isArray(leadingQuestions)) return null;
  const t = tier != null ? tier : 1;
  const byTier = leadingQuestions.find(l => l && l.tier === t);
  if (byTier && byTier.prompt) return byTier.prompt;
  if (byTier && typeof byTier === 'string') return byTier;
  const fallback = leadingQuestions.find(l => l && (l.prompt || typeof l === 'string'));
  return fallback ? (fallback.prompt || fallback) : null;
}

function getRecognitionForPoint(leadingQuestions) {
  if (!Array.isArray(leadingQuestions)) return null;
  const withRecognition = leadingQuestions.find(l => l && l.recognition && l.recognition.question && Array.isArray(l.recognition.options) && l.recognition.correct);
  return withRecognition ? withRecognition.recognition : null;
}

function buildCompletionSummary(conceptResults, completedPointIds) {
  const lines = [];
  const strong = conceptResults.filter(cr => (cr.scorePercent || 0) >= 80);
  if (strong.length > 0) {
    lines.push('You covered ' + strong.map(c => c.concept_name).join(', ') + ' well.');
  }
  const improved = conceptResults.filter(cr => (cr.scorePercent || 0) >= 50 && (cr.scorePercent || 0) < 80);
  if (improved.length > 0) {
    lines.push('You improved on ' + improved.map(c => c.concept_name).join(', ') + ' during the probe.');
  }
  const weak = conceptResults.filter(cr => (cr.scorePercent || 0) < 50);
  if (weak.length > 0) {
    lines.push('Focus on revising ' + weak.map(c => c.concept_name).join(', ') + ' before the next session.');
  }
  if (lines.length === 0) {
    lines.push('You worked through the topic. Review any points that were revealed after three attempts.');
  }
  const threeLines = lines.slice(0, 3);
  return threeLines.join(' ');
}

function buildCompletionSummaryLines(conceptResults) {
  const lines = [];
  const strong = conceptResults.filter(cr => (cr.scorePercent || 0) >= 80);
  if (strong.length > 0) {
    lines.push('You covered ' + strong.map(c => c.concept_name).join(', ') + ' well.');
  }
  const improved = conceptResults.filter(cr => (cr.scorePercent || 0) >= 50 && (cr.scorePercent || 0) < 80);
  if (improved.length > 0) {
    lines.push('You improved on ' + improved.map(c => c.concept_name).join(', ') + ' during the probe.');
  }
  const weak = conceptResults.filter(cr => (cr.scorePercent || 0) < 50);
  if (weak.length > 0) {
    lines.push('Focus on revising ' + weak.map(c => c.concept_name).join(', ') + ' before the next session.');
  }
  if (lines.length === 0) {
    lines.push('You worked through the topic. Review any points that were revealed after three attempts.');
  }
  return lines.slice(0, 3);
}

function pickMustRepeatMicroQuestion(conceptResults, concepts) {
  const withMisses = conceptResults.filter(cr => cr.pointsMissed && cr.pointsMissed.length > 0);
  if (withMisses.length === 0) return null;
  const cr = withMisses[0];
  const concept = concepts.find(c => c.id === cr.concept_id);
  const micro = (concept && concept.micro_questions) || [];
  return Array.isArray(micro) && micro.length > 0 ? micro[0] : null;
}

module.exports = {
  buildMissedPointsQueue,
  getLeadingPromptForTier,
  getRecognitionForPoint,
  buildCompletionSummary,
  buildCompletionSummaryLines,
  pickMustRepeatMicroQuestion
};
