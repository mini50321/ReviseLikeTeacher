const SAQ_SCHEMA = {
  question: 'string',
  core_points: 'array of strings',
  misconceptions: 'array of strings',
  compact_answer: 'string'
};

const MCQ_SCHEMA = {
  question: 'string',
  options: 'object with keys A, B, C, D',
  correct_answer: 'string (A|B|C|D)',
  socratic_prompts: 'string',
  common_reasoning_errors: 'string',
  concept_reinforcement: 'string'
};

function validateSaq(saq) {
  if (!saq || typeof saq !== 'object') return false;
  if (!saq.question || typeof saq.question !== 'string') return false;
  return true;
}

function validateMcq(mcq) {
  if (!mcq || typeof mcq !== 'object') return false;
  if (!mcq.question || typeof mcq.question !== 'string') return false;
  if (!mcq.options || typeof mcq.options !== 'object') return false;
  if (!mcq.correct_answer || !['A', 'B', 'C', 'D'].includes(String(mcq.correct_answer).toUpperCase())) return false;
  return true;
}

function formatMcqOptions(mcq) {
  if (!mcq || !mcq.options) return null;
  const opts = mcq.options;
  const keys = Object.keys(opts).filter(k => ['A', 'B', 'C', 'D'].includes(k));
  if (keys.length === 0) return null;
  return keys.map(k => `${k}. ${opts[k]}`).join('\n');
}

module.exports = {
  SAQ_SCHEMA,
  MCQ_SCHEMA,
  validateSaq,
  validateMcq,
  formatMcqOptions
};
