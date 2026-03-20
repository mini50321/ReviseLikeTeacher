const RESPONSE_VERSION = '1.0';
const MAX_NEXT_PROMPT_CHARS = 8000;
const MAX_ACK_CHARS = 600;

const SOCRATIC_AI_RESPONSE_KEYS = ['next_teacher_prompt', 'teacher_acknowledgment'];

function stripJsonFences(text) {
  let s = String(text || '').trim();
  if (s.startsWith('```json')) s = s.slice(7);
  else if (s.startsWith('```')) s = s.slice(3);
  s = s.trim();
  if (s.endsWith('```')) s = s.slice(0, -3).trim();
  return s;
}

function parseJsonLoose(raw) {
  const s = stripJsonFences(raw);
  if (!s) return { ok: false, error: 'empty_content' };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

function clip(s, max) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return '';
  return t.length <= max ? t : t.slice(0, max);
}

function normalizeSocraticAiResponse(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }
  const next = clip(obj.next_teacher_prompt, MAX_NEXT_PROMPT_CHARS);
  const ack = clip(obj.teacher_acknowledgment, MAX_ACK_CHARS);
  if (!next) return null;
  const out = {
    response_version: RESPONSE_VERSION,
    next_teacher_prompt: next,
    teacher_acknowledgment: ack || null
  };
  return out;
}

function parseSocraticAiResponse(raw) {
  if (raw == null) {
    return { ok: false, error: 'null_input', response: null };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const n = normalizeSocraticAiResponse(raw);
    if (!n) return { ok: false, error: 'missing_or_empty_next_teacher_prompt', response: null };
    return { ok: true, error: null, response: n };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'invalid_input_type', response: null };
  }
  const parsed = parseJsonLoose(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, response: null };
  }
  const n = normalizeSocraticAiResponse(parsed.value);
  if (!n) {
    return { ok: false, error: 'missing_or_empty_next_teacher_prompt', response: null };
  }
  return { ok: true, error: null, response: n };
}

function assertSocraticAiResponseShape(response) {
  const errors = [];
  if (!response || typeof response !== 'object') {
    errors.push('not_object');
    return { ok: false, errors };
  }
  if (response.response_version !== RESPONSE_VERSION) errors.push('version');
  if (typeof response.next_teacher_prompt !== 'string' || !response.next_teacher_prompt.trim()) {
    errors.push('next_teacher_prompt');
  }
  if (response.teacher_acknowledgment != null && typeof response.teacher_acknowledgment !== 'string') {
    errors.push('teacher_acknowledgment');
  }
  return { ok: errors.length === 0, errors };
}

function toClientPayload(response) {
  if (!response || typeof response !== 'object') return null;
  return {
    next_teacher_prompt: response.next_teacher_prompt,
    teacher_acknowledgment: response.teacher_acknowledgment
  };
}

module.exports = {
  RESPONSE_VERSION,
  MAX_NEXT_PROMPT_CHARS,
  MAX_ACK_CHARS,
  SOCRATIC_AI_RESPONSE_KEYS,
  stripJsonFences,
  parseSocraticAiResponse,
  normalizeSocraticAiResponse,
  assertSocraticAiResponseShape,
  toClientPayload
};
