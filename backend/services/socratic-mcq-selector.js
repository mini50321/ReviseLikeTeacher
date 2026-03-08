const { getLeadingPromptForTier } = require('./concept-map-session');

const DEFAULT_CONFIG = {
  mcq_preference_excellent: 0.8,
  mcq_preference_strong: 0.7,
  mcq_preference_average: 0.4,
  mcq_preference_weak: 0.2,
  mcq_preference_very_weak: 0.1,
  mcq_preference_bored: 0.9,
  socratic_first_probes: 1,
  force_socratic_until_tier: 2
};

function getMcqPreference(studentLevel, config = {}) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const key = `mcq_preference_${(studentLevel || 'average').replace(/-/g, '_')}`;
  return c[key] ?? c.mcq_preference_average;
}

function pickMcqForPoint(concept, pointLabel, usedMcqIds = []) {
  const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
  if (mcqs.length === 0) return null;
  const pointNorm = (pointLabel || '').toLowerCase();
  const available = mcqs.filter((m, i) => {
    const id = m.id || `mcq_${i}`;
    if (usedMcqIds.includes(id)) return false;
    if (!pointNorm) return true;
    const q = (m.question || '').toLowerCase();
    const opt = Object.values(m.options || {}).join(' ').toLowerCase();
    const text = q + ' ' + opt;
    const pointWords = pointNorm.split(/\s+/).filter(w => w.length > 2);
    const matchCount = pointWords.filter(w => text.includes(w)).length;
    return matchCount >= Math.min(1, pointWords.length);
  });
  if (available.length === 0) {
    const unused = mcqs.filter((m, i) => !usedMcqIds.includes(m.id || `mcq_${i}`));
    return unused[0] || mcqs[0];
  }
  return available[0];
}

function formatMcqForClient(mcq, index = 0) {
  if (!mcq || !mcq.question) return null;
  const opts = mcq.options || {};
  const keys = ['A', 'B', 'C', 'D'].filter(k => opts[k] != null);
  const options = keys.map(k => `${k}. ${opts[k]}`).join('\n');
  return {
    type: 'mcq',
    question: mcq.question,
    options: opts,
    options_text: options,
    correct_answer: mcq.correct_answer,
    socratic_prompts: mcq.socratic_prompts,
    id: mcq.id || `mcq_${index}`
  };
}

function selectNextPrompt(options) {
  const {
    concept,
    currentPoint,
    studentLevel = 'average',
    probeCount = 0,
    leadingTier = 1,
    usedMcqIds = [],
    config = {}
  } = options;

  const mcqPreference = getMcqPreference(studentLevel, config);
  const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
  const leadingQuestions = currentPoint?.leading_questions || concept.leading_questions || [];
  const socraticFirst = (config.socratic_first_probes ?? DEFAULT_CONFIG.socratic_first_probes);
  const forceSocraticTier = (config.force_socratic_until_tier ?? DEFAULT_CONFIG.force_socratic_until_tier);

  const highLevel = ['excellent', 'strong', 'bored'].includes(studentLevel);
  const useSocraticFirst = !highLevel && (probeCount < socraticFirst || leadingTier <= forceSocraticTier);
  const hasSocratic = getLeadingPromptForTier(leadingQuestions, leadingTier);
  const hasMcq = mcqs.length > 0;
  const roll = Math.random();

  let preferMcq = !useSocraticFirst && hasMcq && roll < mcqPreference;
  if (!hasSocratic && hasMcq) preferMcq = true;
  if (!hasMcq) preferMcq = false;
  if (!hasSocratic && !hasMcq) return { type: 'socratic', content: null, mcq: null };

  if (preferMcq && hasMcq) {
    const pointLabel = currentPoint?.point_label || currentPoint?.point_description || '';
    const mcq = pickMcqForPoint(concept, pointLabel, usedMcqIds);
    if (mcq) {
      const idx = mcqs.indexOf(mcq);
      return {
        type: 'mcq',
        content: null,
        mcq: formatMcqForClient(mcq, idx)
      };
    }
  }

  const socraticText = getLeadingPromptForTier(leadingQuestions, leadingTier) ||
    getLeadingPromptForTier(leadingQuestions, 1);
  return {
    type: 'socratic',
    content: socraticText,
    mcq: null
  };
}

function getTunableConfig() {
  return { ...DEFAULT_CONFIG };
}

module.exports = {
  DEFAULT_CONFIG,
  getMcqPreference,
  pickMcqForPoint,
  formatMcqForClient,
  selectNextPrompt,
  getTunableConfig
};
