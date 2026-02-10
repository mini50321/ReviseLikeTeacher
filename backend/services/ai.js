const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function evaluateAnswer({ question, studentAnswer, currentMastery, userId }) {
  try {
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
      timeout: 10000
    });

    if (response.data && response.data.score !== undefined && response.data.feedback) {
      return response.data;
    }
    
    throw new Error('Invalid response from AI service');
  } catch (error) {
    console.error('AI evaluation error:', error.message || error);
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
  try {
    if (!AI_SERVICE_URL || AI_SERVICE_URL === 'http://localhost:8000') {
      throw new Error('AI service is not configured. Please set AI_SERVICE_URL environment variable.');
    }

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
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.transcription !== undefined) {
      return response.data;
    }
    
    throw new Error('Invalid response from AI service');
  } catch (error) {
    console.error('Voice transcription error:', error.message || error);
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data,
      url: `${AI_SERVICE_URL}/transcribe`
    });
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error(`Cannot connect to AI transcription service at ${AI_SERVICE_URL}. Please ensure the AI service is deployed and running.`);
    }
    if (error.response) {
      console.error('AI service response:', error.response.status, error.response.data);
      if (error.response.status === 500) {
        const aiError = error.response.data?.detail || error.response.data?.error || 'Unknown error';
        throw new Error(`AI transcription service error: ${aiError}. Please check the AI service logs on Render.`);
      }
      if (error.response.status === 404) {
        throw new Error(`AI transcription endpoint not found at ${AI_SERVICE_URL}/transcribe. Please check the AI service configuration.`);
      }
      if (error.response.status === 503) {
        throw new Error('AI transcription service is unavailable. The service may be starting up or overloaded.');
      }
    }
    if (error.message.includes('timeout')) {
      throw new Error('Transcription request timed out. The audio file may be too large or the AI service is overloaded.');
    }
    throw new Error(`Transcription failed: ${error.message || 'Unknown error'}`);
  }
}

async function extractQuestionsFromPDF(pdfPath) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/extract-pdf`, {
      pdf_path: pdfPath
    }, {
      timeout: 300000
    });

    return response.data;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('PDF extraction failed');
  }
}

module.exports = {
  evaluateAnswer,
  transcribeVoice,
  extractQuestionsFromPDF
};

