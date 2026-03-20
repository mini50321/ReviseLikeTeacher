const { getSocraticLifecycleSnapshot } = require('./socratic-session-policy');

const PAYLOAD_VERSION = '1.0';
const MAX_STRING = 12000;
const MAX_TURNS = 40;

const SOCRATIC_AI_PAYLOAD_ROOT_KEYS = [
  'payload_version',
  'phase',
  'student_level',
  'teaching_focus',
  'rubric_state',
  'conversation',
  'session_policy',
  'diagnostic_meta'
];

function clip(s, max) {
  if (s == null) return '';
  const t = String(s);
  return t.length <= max ? t : t.slice(0, max);
}

function normalizePoint(p) {
  if (p == null) return null;
  if (typeof p === 'string') {
    return { id: null, label: '', description: clip(p, MAX_STRING) };
  }
  return {
    id: p.id != null ? p.id : null,
    label: clip(p.label || p.id || '', 2000),
    description: clip(p.description || p.label || '', MAX_STRING)
  };
}

function normalizePoints(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizePoint).filter(Boolean);
}

function normalizeLeadingQuestions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (typeof item === 'string') return clip(item, MAX_STRING);
    if (item && typeof item === 'object') {
      const t = item.prompt || item.text || item.label || item.description;
      return clip(t != null ? String(t) : JSON.stringify(item), MAX_STRING);
    }
    return clip(String(item), MAX_STRING);
  }).filter(Boolean);
}

function pickTeachingConcept(concept) {
  if (!concept || typeof concept !== 'object') {
    return {
      id: null,
      subject: null,
      topic: null,
      concept_key: null,
      name: null,
      concept_explanation: null,
      must_know_points: [],
      deep_points: [],
      leading_questions: [],
      traps: [],
      example_phrases: [],
      mcq_count: 0,
      micro_question_count: 0
    };
  }
  const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
  const micro = Array.isArray(concept.micro_questions) ? concept.micro_questions : [];
  return {
    id: concept.id != null ? concept.id : null,
    subject: concept.subject != null ? String(concept.subject) : null,
    topic: concept.topic != null ? String(concept.topic) : null,
    concept_key: concept.concept_key != null ? String(concept.concept_key) : null,
    name: concept.name != null ? clip(concept.name, 2000) : null,
    concept_explanation: concept.concept_explanation != null
      ? clip(concept.concept_explanation, MAX_STRING)
      : null,
    must_know_points: normalizePoints(concept.must_know_points),
    deep_points: normalizePoints(concept.deep_points),
    leading_questions: normalizeLeadingQuestions(concept.leading_questions),
    traps: normalizePoints(concept.traps),
    example_phrases: Array.isArray(concept.example_phrases)
      ? concept.example_phrases.map((x) => clip(typeof x === 'string' ? x : String(x), 2000)).slice(0, 24)
      : [],
    mcq_count: mcqs.length,
    micro_question_count: micro.length
  };
}

function pickRubricState(scoreResult) {
  if (!scoreResult || typeof scoreResult !== 'object') {
    return {
      score_percent: null,
      score: null,
      points_hit: [],
      points_missed: [],
      points_expected: null,
      points_total: null
    };
  }
  return {
    score_percent: typeof scoreResult.scorePercent === 'number' ? scoreResult.scorePercent : null,
    score: typeof scoreResult.score === 'number' ? scoreResult.score : null,
    points_hit: normalizePoints(scoreResult.pointsHit),
    points_missed: normalizePoints(scoreResult.pointsMissed),
    points_expected: typeof scoreResult.pointsExpected === 'number' ? scoreResult.pointsExpected : null,
    points_total: typeof scoreResult.pointsTotal === 'number' ? scoreResult.pointsTotal : null
  };
}

function normalizeConversation(socraticTurns) {
  if (!Array.isArray(socraticTurns)) return [];
  const out = [];
  for (let i = 0; i < socraticTurns.length && i < MAX_TURNS; i++) {
    const t = socraticTurns[i];
    if (!t || typeof t !== 'object') continue;
    out.push({
      index: out.length,
      teacher_prompt: clip(t.teacher_prompt != null ? String(t.teacher_prompt) : '', MAX_STRING),
      student_answer: clip(t.student_answer != null ? String(t.student_answer) : '', MAX_STRING)
    });
  }
  return out;
}

function buildSocraticAiPayload(options = {}) {
  const {
    concept = null,
    studentLevel = 'average',
    scoreResult = {},
    socraticTurns = [],
    phase = 'socratic',
    diagnosticMeta = null
  } = options;

  const level = String(studentLevel || 'average').toLowerCase();
  const hasConcept = Boolean(concept && (concept.id != null || concept.name));

  const sessionPolicy = getSocraticLifecycleSnapshot({
    phase,
    level,
    scoreResult,
    socraticTurns,
    hasConcept
  });

  const meta = diagnosticMeta && typeof diagnosticMeta === 'object'
    ? {
      diagnostic_id: diagnosticMeta.diagnostic_id != null ? diagnosticMeta.diagnostic_id : null,
      subject: diagnosticMeta.subject != null ? String(diagnosticMeta.subject) : null,
      topic: diagnosticMeta.topic != null ? String(diagnosticMeta.topic) : null
    }
    : null;

  return {
    payload_version: PAYLOAD_VERSION,
    phase: String(phase || 'socratic'),
    student_level: level,
    teaching_focus: pickTeachingConcept(concept),
    rubric_state: pickRubricState(scoreResult),
    conversation: normalizeConversation(socraticTurns),
    session_policy: sessionPolicy,
    diagnostic_meta: meta
  };
}

function assertSocraticAiPayloadShape(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('payload is not an object');
    return { ok: false, errors };
  }
  for (const k of SOCRATIC_AI_PAYLOAD_ROOT_KEYS) {
    if (!(k in payload)) errors.push(`missing ${k}`);
  }
  if (payload.teaching_focus == null || typeof payload.teaching_focus !== 'object') {
    errors.push('teaching_focus invalid');
  }
  if (!Array.isArray(payload.conversation)) errors.push('conversation not array');
  if (!Array.isArray(payload.rubric_state?.points_missed)) errors.push('rubric_state.points_missed not array');
  return { ok: errors.length === 0, errors };
}

module.exports = {
  PAYLOAD_VERSION,
  SOCRATIC_AI_PAYLOAD_ROOT_KEYS,
  buildSocraticAiPayload,
  assertSocraticAiPayloadShape,
  pickTeachingConcept,
  pickRubricState,
  normalizeConversation
};
