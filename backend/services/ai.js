const axios = require('axios');
const { getExamplesForSubjectTopic } = require('./tutoring-training-examples');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const voiceCoachCache = new Map();
const VOICE_COACH_CACHE_TTL_MS = Number(process.env.VOICE_COACH_CACHE_TTL_MS || 120000);
const VOICE_COACH_CACHE_MAX_ITEMS = Number(process.env.VOICE_COACH_CACHE_MAX_ITEMS || 300);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryRequest(fn, { maxRetries = 3, initialDelay = 2000, label = 'request' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'EACCES' ||
        error.message?.includes('timeout') ||
        error.response?.status === 502 ||
        error.response?.status === 503 ||
        error.response?.status === 504;

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = initialDelay * attempt;
      console.log(`${label} attempt ${attempt} failed (${error.message}). Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function wakeUpAIService() {
  try {
    await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureAIServiceReady() {
  const isAwake = await wakeUpAIService();
  if (!isAwake) {
    console.log('AI service appears to be sleeping. Sending wake-up ping...');
    await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
  }
}

async function evaluateAnswer({ question, studentAnswer, currentMastery, userId }) {
  try {
    const result = await retryRequest(async () => {
      const keyPoints = question.key_points != null
        ? (Array.isArray(question.key_points) ? question.key_points : (typeof question.key_points === 'string' ? (() => { try { const p = JSON.parse(question.key_points); return Array.isArray(p) ? p : []; } catch (e) { return []; } })() : []))
        : [];
      const conceptTags = question.concept_tags != null
        ? (Array.isArray(question.concept_tags) ? question.concept_tags : (typeof question.concept_tags === 'string' ? (() => { try { const p = JSON.parse(question.concept_tags); return Array.isArray(p) ? p : []; } catch (e) { return []; } })() : []))
        : [];

      let trainingExamples = [];
      try {
        const subject = question.subject || '';
        const topic = question.topic || '';
        if (subject && topic) {
          trainingExamples = await getExamplesForSubjectTopic(subject, topic, null, 3);
        }
      } catch (e) {
        console.warn('Training examples fetch failed:', e.message);
      }

      const response = await axios.post(`${AI_SERVICE_URL}/evaluate`, {
        question: {
          id: question.id,
          stem: question.stem,
          type: question.type,
          ideal_answer: question.ideal_answer,
          key_points: keyPoints,
          topic: question.topic || '',
          subject: question.subject || '',
          subtopic: question.subtopic || null,
          difficulty: question.difficulty || 'medium',
          importance: question.importance || null,
          yield_category: question.yield_category || null,
          concept_tags: conceptTags,
          trap_pattern: question.trap_pattern || null
        },
        student_answer: studentAnswer,
        current_mastery: currentMastery,
        user_id: userId,
        training_examples: trainingExamples
      }, {
        timeout: 30000
      });

      if (response.data && response.data.score !== undefined && response.data.feedback) {
        return response.data;
      }

      throw new Error('Invalid response from AI service');
    }, { maxRetries: 3, initialDelay: 3000, label: 'AI evaluation' });

    return result;
  } catch (error) {
    console.error('AI evaluation error after retries:', error.message || error);
    console.log('Using fallback evaluation (AI service unavailable)');

    const fallbackScore = calculateFallbackScore(studentAnswer, question);

    return {
      score: fallbackScore,
      feedback: {
        strengths: "Thank you for your answer.",
        improvements: "Keep practicing to improve.",
        model_explanation: question.ideal_answer || "Review the topic for a complete answer."
      },
      teacher_response: "You made a sincere attempt. Your main gap is concept precision. Rebuild the core idea first, then link it to the stem. What is the one clue that should guide your answer next time?",
      mastery_impact: {
        delta: (fallbackScore / 100) * 0.1
      }
    };
  }
}

function calculateFallbackScore(answer, question) {
  const answerLength = answer.length;
  const idealLength = question.ideal_answer?.length || 100;

  if (answerLength < 10) return 20;
  if (answerLength < idealLength * 0.3) return 40;
  if (answerLength < idealLength * 0.6) return 60;
  return 70;
}

async function transcribeVoice(audioBuffer, language, filename = 'audio.webm') {
  if (!AI_SERVICE_URL) {
    throw new Error('AI service is not configured. Please set AI_SERVICE_URL environment variable.');
  }

  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('audio', audioBuffer, {
        filename: filename,
        contentType: 'audio/webm'
      });
      formData.append('language', language);

      console.log(`Attempting to transcribe audio via AI service at: ${AI_SERVICE_URL}/transcribe`);

      const response = await axios.post(`${AI_SERVICE_URL}/transcribe`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log('AI service response:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.transcription !== undefined) {
        return response.data;
      }

      console.error('Invalid response structure:', response.data);
      throw new Error(`Invalid response from AI service. Expected 'transcription' field, got: ${JSON.stringify(response.data)}`);
    }, { maxRetries: 3, initialDelay: 3000, label: 'Voice transcription' });

    return result;
  } catch (error) {
    console.error('Voice transcription error after retries:', error.message || error);
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data,
      url: `${AI_SERVICE_URL}/transcribe`
    });

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error(`Cannot connect to AI service at ${AI_SERVICE_URL}. The service may still be starting up. Please try again in a moment.`);
    }
    if (error.response) {
      if (error.response.status === 500) {
        const aiError = error.response.data?.detail || error.response.data?.error || 'Unknown error';
        throw new Error(`AI transcription service error: ${aiError}`);
      }
      if (error.response.status === 503) {
        throw new Error('AI service is starting up. Please try again in 30 seconds.');
      }
    }
    if (error.message.includes('timeout')) {
      throw new Error('Transcription timed out. Please try again — the AI service may be warming up.');
    }
    throw new Error(`Transcription failed: ${error.message || 'Unknown error'}`);
  }
}

async function textToSpeech(text, voice = 'nova', speed = 1.0) {
  if (!text || !text.trim()) {
    throw new Error('Text is required for speech generation');
  }

  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/tts`, {
        text: text.substring(0, 4096),
        voice,
        speed
      }, {
        timeout: 30000,
        responseType: 'arraybuffer'
      });

      if (!response.data || response.data.byteLength === 0) {
        throw new Error('Empty audio response from TTS service');
      }

      return response.data;
    }, { maxRetries: 2, initialDelay: 2000, label: 'TTS generation' });

    return result;
  } catch (error) {
    let detail = error.message;
    if (error.response?.status === 500 && error.response?.data) {
      try {
        const raw = error.response.data;
        const text = typeof raw === 'string' ? raw : (raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : JSON.stringify(raw));
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.error || detail;
      } catch (_) {}
    }
    console.error('TTS error after retries:', detail);
    throw new Error(`Speech generation failed: ${detail}`);
  }
}

async function extractQuestionsFromPDF(pdfBuffer, filename = 'document.pdf', startPage = 0, endPage = null) {
  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('file', pdfBuffer, {
        filename: filename,
        contentType: 'application/pdf'
      });
      formData.append('filename', filename);
      formData.append('start_page', String(startPage));
      if (endPage != null) {
        formData.append('end_page', String(endPage));
      }

      const response = await axios.post(`${AI_SERVICE_URL}/extract-pdf`, formData, {
        headers: { ...formData.getHeaders() },
        timeout: 900000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return response.data;
    }, { maxRetries: 4, initialDelay: 10000, label: 'PDF extraction' });

    return result;
  } catch (error) {
    console.error('PDF extraction error:', error.message || error);
    if (error.response?.status === 503) {
      throw new Error('AI service is waking up on Render. Please retry in 30-90 seconds.');
    }
    throw new Error(`PDF extraction failed: ${error.message || 'Unknown error'}`);
  }
}

async function generateSaqAnchors({ subject, topic, count = 4, corePoints = [], pyqExamples = [] }) {
  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/generate-saq-anchors`, {
        subject,
        topic,
        count,
        core_points: corePoints,
        pyq_examples: pyqExamples
      }, {
        timeout: 60000
      });

      if (!response.data || !Array.isArray(response.data.questions)) {
        throw new Error('Invalid SAQ anchor generation response');
      }

      return response.data;
    }, { maxRetries: 2, initialDelay: 3000, label: 'SAQ anchor generation' });

    return result;
  } catch (error) {
    console.error('SAQ anchor generation error:', error.message || error);
    return { generated: false, questions: [] };
  }
}

async function generateMcqItems({ subject, topic, count = 4, corePoints = [], pyqExamples = [] }) {
  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/generate-mcq-items`, {
        subject,
        topic,
        count,
        core_points: corePoints,
        pyq_examples: pyqExamples
      }, {
        timeout: 60000
      });

      if (!response.data || !Array.isArray(response.data.questions)) {
        throw new Error('Invalid MCQ generation response');
      }

      return response.data;
    }, { maxRetries: 2, initialDelay: 3000, label: 'MCQ generation' });

    return result;
  } catch (error) {
    console.error('MCQ generation error:', error.message || error);
    return { generated: false, questions: [] };
  }
}

async function evaluateQuickCheck({ question, originalAnswer, teacherResponse, quickCheckAnswer }) {
  await ensureAIServiceReady();

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/quick-check`, {
        question,
        original_answer: originalAnswer,
        teacher_response: teacherResponse || '',
        quick_check_answer: quickCheckAnswer
      }, {
        timeout: 30000
      });

      if (!response.data || !response.data.follow_up) {
        throw new Error('Invalid quick-check response');
      }

      return response.data;
    }, { maxRetries: 2, initialDelay: 1500, label: 'Quick-check evaluation' });

    return result;
  } catch (error) {
    console.error('Quick-check evaluation error:', error.message || error);
    return {
      understanding_level: 'partial',
      follow_up: 'Good effort. Refine the key discriminator and state the concept in one precise line.',
      can_proceed: true
    };
  }
}

async function coachVoiceTurn({ transcript, subject, topic, questionStem, studentAnswer, topK = 5, latencyMode = 'balanced', conversationHistory = [] }) {
  await ensureAIServiceReady();
  const cleanTranscript = String(transcript || '').trim().slice(0, 1500);
  const boundedTopK = Math.max(1, Math.min(Number(topK) || 5, 8));
  const normalizedLatencyMode = String(latencyMode || 'balanced').toLowerCase() === 'fast' ? 'fast' : 'balanced';
  const normalizedConversationHistory = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-8).map((turn) => ({
        student: String(turn?.student || '').slice(0, 600),
        teacher: String(turn?.teacher || '').slice(0, 900)
      }))
    : [];
  const cacheKey = JSON.stringify({
    transcript: cleanTranscript,
    subject: subject || null,
    topic: topic || null,
    questionStem: questionStem || null,
    studentAnswer: studentAnswer || null,
    topK: boundedTopK,
    latencyMode: normalizedLatencyMode,
    conversationHistory: normalizedConversationHistory
  });

  const now = Date.now();
  const cached = voiceCoachCache.get(cacheKey);
  if (cached && now - cached.ts <= VOICE_COACH_CACHE_TTL_MS) {
    return { ...cached.value, backend_cache_hit: true };
  }

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/voice-coach-turn`, {
        transcript: cleanTranscript,
        subject,
        topic,
        question_stem: questionStem,
        student_answer: studentAnswer,
        top_k: boundedTopK,
        latency_mode: normalizedLatencyMode,
        conversation_history: normalizedConversationHistory
      }, {
        timeout: 30000
      });

      if (!response.data || !response.data.teacher_response) {
        throw new Error('Invalid voice coach response');
      }

      return response.data;
    }, { maxRetries: 2, initialDelay: 1500, label: 'Voice coach turn' });

    if (voiceCoachCache.size >= VOICE_COACH_CACHE_MAX_ITEMS) {
      const oldestKey = voiceCoachCache.keys().next().value;
      if (oldestKey) {
        voiceCoachCache.delete(oldestKey);
      }
    }
    voiceCoachCache.set(cacheKey, { ts: now, value: result });
    return result;
  } catch (error) {
    console.error('Voice coach turn error:', error.message || error);
    return {
      teacher_response: 'Good attempt. Refine the key concept and state one discriminator clue.',
      teaching_focus: 'concept_clarity',
      references: [],
      used_context_count: 0,
      used_embeddings: false
    };
  }
}

async function buildConceptDraftFromText({ subject, topic, text, maxConcepts = 6 }) {
  if (!subject || !topic || !text || !text.trim()) {
    throw new Error('subject, topic, and text are required for concept draft');
  }

  await ensureAIServiceReady();

  const maxChars = Number(process.env.CONCEPT_BUILDER_MAX_TEXT || 12000);
  const snippet = text.slice(0, maxChars);

  try {
    const result = await retryRequest(async () => {
      const response = await axios.post(`${AI_SERVICE_URL}/concept-map/build-draft`, {
        subject,
        topic,
        text: snippet,
        max_concepts: maxConcepts
      }, {
        timeout: 600000
      });

      return response.data;
    }, { maxRetries: 2, initialDelay: 5000, label: 'Concept draft build' });

    return result;
  } catch (error) {
    console.error('Concept draft build error:', error.message || error);
    const detail = error.response?.data?.detail || error.response?.data?.error;
    throw new Error(detail || error.message || 'Concept draft build failed');
  }
}

function startKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return;

  const PING_INTERVAL = 10 * 60 * 1000;

  setInterval(async () => {
    try {
      await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 10000 });
      console.log('Keep-alive ping to AI service: OK');
    } catch (error) {
      console.log('Keep-alive ping to AI service: Failed (service may be restarting)');
    }
  }, PING_INTERVAL);

  console.log(`Keep-alive ping to AI service started (every ${PING_INTERVAL / 60000} minutes)`);
}

module.exports = {
  evaluateAnswer,
  transcribeVoice,
  textToSpeech,
  extractQuestionsFromPDF,
  generateSaqAnchors,
  generateMcqItems,
  evaluateQuickCheck,
  coachVoiceTurn,
   buildConceptDraftFromText,
  startKeepAlive
};
