const { generateSocraticNextTurnPrompt, socraticNextTurn } = require('./ai');
const { parseSocraticAiResponse } = require('./socratic-ai-response');

const MIN_USABLE_PROMPT_CHARS = 3;
const EMERGENCY_ATTEMPTS = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSocraticAiEnabled() {
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
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 8);
  return 5;
}

function getRetryDelayMs() {
  const n = Number(process.env.DIAGNOSTIC_SOCRATIC_AI_RETRY_DELAY_MS);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 10000);
  return 400;
}

async function tryEmergencySocraticAi({
  concept,
  scoreResult,
  studentLevel,
  diagnosticMeta
}) {
  const missed = Array.isArray(scoreResult?.pointsMissed) ? scoreResult.pointsMissed[0] : null;
  const focus = String(
    missed?.description || missed?.label || concept?.name || ''
  )
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 2000);
  const subj = (diagnosticMeta && diagnosticMeta.subject) || concept?.subject || '';
  const topic = (diagnosticMeta && diagnosticMeta.topic) || concept?.topic || '';
  const messages = [
    {
      role: 'system',
      content:
        'You are a Socratic NEET PG tutor. Reply with JSON only: {"next_teacher_prompt":"...","teacher_acknowledgment":null}. One question only. No markdown.'
    },
    {
      role: 'user',
      content: `Subject: ${subj}. Topic: ${topic}. Teaching focus: ${focus || concept?.name || 'the concept'}. Student level: ${studentLevel || 'average'}. Ask one short Socratic question.`
    }
  ];
  const raw = await socraticNextTurn({ messages, temperature: 0.35, maxTokens: 500 });
  const parsed = parseSocraticAiResponse(raw);
  if (!parsed.ok) return null;
  return formatSocraticTeacherLine(parsed.response);
}

async function resolveSocraticTeacherPrompt({
  templatePrompt: _templateIgnored,
  concept,
  studentLevel,
  scoreResult,
  socraticTurns,
  phase,
  diagnosticMeta,
  ...generationOptions
}) {
  if (!concept) {
    return { prompt: null, source: 'failed', fallback_reason: 'no_concept' };
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

  for (let e = 1; e <= EMERGENCY_ATTEMPTS; e++) {
    try {
      const line = await tryEmergencySocraticAi({
        concept,
        scoreResult,
        studentLevel,
        diagnosticMeta
      });
      if (isPromptUsable(line)) {
        return { prompt: line, source: 'ai', attempt: 'emergency' };
      }
      lastErr = new Error('emergency_empty');
    } catch (err) {
      lastErr = err;
      console.error('Diagnostic Socratic AI emergency:', err.message || err);
    }
    if (e < EMERGENCY_ATTEMPTS && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    prompt: null,
    source: 'failed',
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
