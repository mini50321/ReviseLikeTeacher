const { generateSocraticNextTurnPrompt } = require('./ai');

const MIN_USABLE_PROMPT_CHARS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSocraticAiEnabled() {
  const v = process.env.DIAGNOSTIC_SOCRATIC_AI;
  if (v === '0' || v === 'false') return false;
  return true;
}

function normalizeTemplatePrompt(t) {
  if (t == null) return null;
  const s = String(t).trim();
  return s.length ? s : null;
}

function isPromptUsable(line) {
  if (line == null) return false;
  const s = String(line).trim();
  return s.length >= MIN_USABLE_PROMPT_CHARS;
}

function formatSocraticTeacherLine(aiResponse) {
  if (!aiResponse || !aiResponse.next_teacher_prompt) return null;
  const q = String(aiResponse.next_teacher_prompt || '').trim();
  if (!q) return null;
  const ack = aiResponse.teacher_acknowledgment && String(aiResponse.teacher_acknowledgment).trim();
  return ack ? `${ack} ${q}`.trim() : q;
}

function getMaxAttempts() {
  const n = Number(process.env.DIAGNOSTIC_SOCRATIC_AI_MAX_ATTEMPTS);
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 5);
  return 2;
}

function getRetryDelayMs() {
  const n = Number(process.env.DIAGNOSTIC_SOCRATIC_AI_RETRY_DELAY_MS);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 10000);
  return 400;
}

async function resolveSocraticTeacherPrompt({
  templatePrompt,
  concept,
  studentLevel,
  scoreResult,
  socraticTurns,
  phase,
  diagnosticMeta,
  ...generationOptions
}) {
  const tpl = normalizeTemplatePrompt(templatePrompt);
  if (!isSocraticAiEnabled()) {
    return { prompt: tpl, source: 'template', fallback_reason: 'disabled' };
  }
  if (!concept) {
    return { prompt: tpl, source: 'template', fallback_reason: 'no_concept' };
  }

  const payload = {
    concept,
    studentLevel,
    scoreResult,
    socraticTurns: Array.isArray(socraticTurns) ? socraticTurns : [],
    phase: phase || 'socratic',
    diagnosticMeta: diagnosticMeta || null
  };

  const maxAttempts = getMaxAttempts();
  const delayMs = getRetryDelayMs();
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await generateSocraticNextTurnPrompt(payload, generationOptions);
      const line = formatSocraticTeacherLine(r);
      if (isPromptUsable(line)) {
        return { prompt: line, source: 'ai', attempt };
      }
      lastErr = new Error('empty_or_short_ai_prompt');
    } catch (e) {
      lastErr = e;
      console.error('Diagnostic Socratic AI:', e.message || e);
    }
    if (attempt < maxAttempts && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  if (tpl && lastErr) {
    console.warn('Socratic AI fallback to template:', lastErr.message || lastErr);
  }

  return {
    prompt: tpl,
    source: 'template',
    fallback_reason: lastErr ? (lastErr.message || String(lastErr)) : 'ai_failed'
  };
}

async function tryGenerateSocraticTeacherPrompt(opts) {
  const { templatePrompt, ...rest } = opts;
  const r = await resolveSocraticTeacherPrompt({ templatePrompt: null, ...rest });
  return r.source === 'ai' ? r.prompt : null;
}

module.exports = {
  MIN_USABLE_PROMPT_CHARS,
  isSocraticAiEnabled,
  isPromptUsable,
  normalizeTemplatePrompt,
  formatSocraticTeacherLine,
  resolveSocraticTeacherPrompt,
  tryGenerateSocraticTeacherPrompt
};
