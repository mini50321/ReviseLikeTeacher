const { normalizeMcqsList } = require('./mcq-normalize');

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
    mcqs: normalizeMcqsList(safeParseJson(row.mcqs, [])),
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

function buildTutorPrompt(concept, level, scoreResult, answerText, opts = {}) {
  const socraticTurnCount = typeof opts.socraticTurnCount === 'number' ? opts.socraticTurnCount : 0;
  const leading = Array.isArray(concept.leading_questions) ? concept.leading_questions : [];
  const checkpoints = Array.isArray(concept.must_know_points) ? concept.must_know_points : [];
  const nextMissing = scoreResult?.pointsMissed?.[0]?.description || checkpoints[0]?.description || checkpoints[0]?.label || '';
  const currentMisstep = String(answerText || '').trim();
  const firstLeading = normalizePromptText(leading[0]);
  const firstStep = checkpoints[0]?.label || checkpoints[0]?.description || firstLeading || concept.name;

  const extractActionClause = (corePoint) => {
    const s = String(corePoint || '').trim().replace(/\s+/g, ' ');
    const m = s.match(/^(.*?)\s+(collects|converts|amplifies|transmits|vibrates|stimulates)\s+(.+?)(?:\s*\.\s*)?$/i);
    if (!m) return s;
    const verb = m[2].toLowerCase();
    const rest = (m[3] || '').trim().replace(/\s*\.\s*$/, '');
    return `${verb} ${rest}`.trim();
  };

  // SAQ → first Socratic prompt uses socraticTurns.length === 0; any later call has ≥1 turn.
  const continuing = socraticTurnCount > 0;

  if (level === 'excellent' || level === 'strong') {
    return firstLeading
      || `Good. What subtle detail in ${concept.name} still needs verification?`;
  }

  if (level === 'average') {
    if (nextMissing) {
      const actionClause = extractActionClause(nextMissing);
      if (continuing) {
        return `Next: Which structure ${actionClause}? (Answer with the structure name)`;
      }
      return `You're close. Which structure ${actionClause}? (Answer with the structure name)`;
    }
    return `What comes immediately after ${firstStep}?`;
  }

  if (level === 'weak') {
    if (nextMissing) {
      const actionClause = extractActionClause(nextMissing);
      if (continuing) {
        return `Next: Which structure ${actionClause}? (Answer with the structure name)`;
      }
      return `Let's go one step at a time. Which structure ${actionClause}? (Answer with the structure name)`;
    }
    return `What comes next after ${firstStep}?`;
  }

  if (level === 'very_weak') {
    if (nextMissing) {
      const actionClause = extractActionClause(nextMissing);
      if (continuing) {
        return `Next step: Which structure ${actionClause}? (Answer with the structure name)`;
      }
      return `Let's rebuild it step-by-step. Which structure ${actionClause}? (Answer with the structure name)`;
    }
    return `What comes next after ${firstStep}?`;
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
