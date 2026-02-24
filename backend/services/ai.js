const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

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
      const response = await axios.post(`${AI_SERVICE_URL}/evaluate`, {
        question: {
          id: question.id,
          stem: question.stem,
          type: question.type,
          ideal_answer: question.ideal_answer,
          key_points: question.key_points,
          topic: question.topic,
          subject: question.subject,
          difficulty: question.difficulty
        },
        student_answer: studentAnswer,
        current_mastery: currentMastery,
        user_id: userId
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
    console.error('TTS error after retries:', error.message || error);
    throw new Error(`Speech generation failed: ${error.message || 'Unknown error'}`);
  }
}

async function extractQuestionsFromPDF(pdfBuffer, filename = 'document.pdf') {
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

      const response = await axios.post(`${AI_SERVICE_URL}/extract-pdf`, formData, {
        headers: { ...formData.getHeaders() },
        timeout: 900000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return response.data;
    }, { maxRetries: 2, initialDelay: 5000, label: 'PDF extraction' });

    return result;
  } catch (error) {
    console.error('PDF extraction error:', error.message || error);
    throw new Error(`PDF extraction failed: ${error.message || 'Unknown error'}`);
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
  startKeepAlive
};
