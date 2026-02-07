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
    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('audio', audioBuffer, {
      filename: filename,
      contentType: 'audio/webm'
    });
    formData.append('language', language);

    const response = await axios.post(`${AI_SERVICE_URL}/transcribe`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.transcription !== undefined) {
      return response.data;
    }
    
    throw new Error('Invalid response from AI service');
  } catch (error) {
    console.error('Voice transcription error:', error.message || error);
    if (error.response) {
      console.error('AI service response:', error.response.status, error.response.data);
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

