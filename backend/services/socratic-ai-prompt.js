const { buildSocraticAiPayload } = require('./socratic-ai-payload');
const { RESPONSE_VERSION, SOCRATIC_AI_RESPONSE_KEYS, MAX_NEXT_PROMPT_CHARS, MAX_ACK_CHARS } = require('./socratic-ai-response');

const PROMPT_VERSION = '1.0';

function buildSocraticSystemPrompt() {
  return [
    'You are a Socratic tutor for NEET PG level medical preparation.',
    'You receive one JSON object (CONTEXT_JSON) with teaching_focus, rubric_state, conversation, session_policy, and student_level.',
    'Stay strictly within the concept, must_know_points, and rubric_state.points_missed. Do not invent facts outside that context.',
    'Lead with questions, not lectures. Do not state the full model answer or list every correct structure in one turn.',
    'Ask exactly one clear question in next_teacher_prompt that moves the learner toward the next missed rubric point.',
    'If teacher_acknowledgment is used, keep it to one short sentence; it may briefly affirm effort or orient attention. Never replace the question.',
    'Match depth to student_level: weaker levels use smaller steps; stronger levels may ask for discrimination or edge cases still tied to missed points.',
    'Use the conversation array as prior turns; never contradict established corrections.',
    'If rubric_state.points_missed is empty, next_teacher_prompt should be one short reflective or summary-check question only.',
    `Output ONLY valid JSON, no markdown fences, no text before or after. The server adds response_version; you must output exactly these keys: ${JSON.stringify(SOCRATIC_AI_RESPONSE_KEYS)}.`,
    `next_teacher_prompt max ${MAX_NEXT_PROMPT_CHARS} characters; teacher_acknowledgment max ${MAX_ACK_CHARS} characters or null.`
  ].join(' ');
}

function buildSocraticUserContent(payloadObject) {
  const json = JSON.stringify(payloadObject);
  return ['CONTEXT_JSON (read and follow exactly):', json, '', 'Reply with JSON only matching the required keys.'].join('\n');
}

function resolvePayload(payloadLike) {
  if (payloadLike && typeof payloadLike === 'object' && !Array.isArray(payloadLike) && payloadLike.payload_version && payloadLike.teaching_focus) {
    return payloadLike;
  }
  return buildSocraticAiPayload(payloadLike || {});
}

function buildSocraticChatMessages(payloadLike) {
  const payload = resolvePayload(payloadLike);
  return [
    { role: 'system', content: buildSocraticSystemPrompt() },
    { role: 'user', content: buildSocraticUserContent(payload) }
  ];
}

module.exports = {
  PROMPT_VERSION,
  buildSocraticSystemPrompt,
  buildSocraticUserContent,
  buildSocraticChatMessages,
  resolvePayload
};
