function safeParseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function normalizePromptText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.prompt || value.text || value.label || value.description || '';
  }
  return String(value);
}

function serializeTopicConcept(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    name: row.name,
    display_order: row.display_order || 0,
    mcqs: safeParseJson(row.mcqs, []),
    must_know_points: safeParseJson(row.must_know_points, []),
    deep_points: safeParseJson(row.deep_points, []),
    traps: safeParseJson(row.traps, []),
    leading_questions: safeParseJson(row.leading_questions, []),
    concept_explanation: row.concept_explanation || null,
    example_phrases: safeParseJson(row.example_phrases, []),
    grading_rubric: safeParseJson(row.grading_rubric, []),
    micro_questions: safeParseJson(row.micro_questions, []),
    prerequisite_concept_ids: safeParseJson(row.prerequisite_concept_ids, []),
    downstream_concept_ids: safeParseJson(row.downstream_concept_ids, [])
  };
}

function mapStudentLevelToDiagnosticLevel(level) {
  if (level === 'excellent' || level === 'strong' || level === 'bored') return 'strong';
  if (level === 'average') return 'average';
  return 'weak';
}

function levelToMasteryStatus(level) {
  if (level === 'excellent' || level === 'strong') return 'mastered';
  if (level === 'average') return 'in_progress';
  return 'needs_reinforcement';
}

function buildTutorPrompt(concept, level, scoreResult, answerText) {
  const leading = Array.isArray(concept.leading_questions) ? concept.leading_questions : [];
  const checkpoints = Array.isArray(concept.must_know_points) ? concept.must_know_points : [];
  const nextMissing = scoreResult?.pointsMissed?.[0]?.description || checkpoints[0]?.description || checkpoints[0]?.label || '';
  const currentMisstep = String(answerText || '').trim();
  const firstLeading = normalizePromptText(leading[0]);
  const firstStep = checkpoints[0]?.label || checkpoints[0]?.description || firstLeading || concept.name;

  if (level === 'excellent' || level === 'strong') {
    return firstLeading
      || `Good. What subtle detail in ${concept.name} still needs verification?`;
  }

  if (level === 'average') {
    return nextMissing
      ? `You have the main idea. Now add this missing step: ${nextMissing}. Say it in one short sentence.`
      : `What comes immediately after ${firstStep}?`;
  }

  if (level === 'weak') {
    return nextMissing
      ? `Let’s go one step at a time. Which structure or event matches: ${nextMissing}?`
      : `What comes next after ${firstStep}?`;
  }

  if (level === 'very_weak') {
    return currentMisstep
      ? `You’re close to the pathway idea. Starting from ${currentMisstep}, what structure comes next in the pathway?`
      : `Start with the first obvious step: what structure comes next in ${concept.name}?`;
  }

  return firstLeading || `What comes immediately after ${firstStep}?`;
}

function buildTutorPlan(concept) {
  const checkpoints = Array.isArray(concept.must_know_points) ? concept.must_know_points : [];
  const deepPoints = Array.isArray(concept.deep_points) ? concept.deep_points : [];
  return {
    concept_id: concept.id,
    concept_key: concept.concept_key,
    concept_name: concept.name,
    display_order: concept.display_order || 0,
    prerequisites: concept.prerequisite_concept_ids || [],
    downstream_concepts: concept.downstream_concept_ids || [],
    checkpoints: checkpoints.map((item, index) => ({
      id: item.id || `${concept.id}:checkpoint:${index}`,
      label: item.label || item.description || `Checkpoint ${index + 1}`,
      description: item.description || item.label || ''
    })),
    deep_points: deepPoints.map((item, index) => ({
      id: item.id || `${concept.id}:deep:${index}`,
      label: item.label || item.description || `Deep point ${index + 1}`,
      description: item.description || item.label || ''
    })),
    saq_count: Array.isArray(concept.micro_questions) ? concept.micro_questions.length : 0,
    mcq_count: Array.isArray(concept.traps) ? Math.max(3, concept.traps.length) : 3
  };
}

module.exports = {
  safeParseJson,
  serializeTopicConcept,
  mapStudentLevelToDiagnosticLevel,
  levelToMasteryStatus,
  buildTutorPrompt,
  buildTutorPlan
};
