const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { transcribeVoice, textToSpeech, coachVoiceTurn } = require('../services/ai');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/webm',
      'audio/wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/x-m4a'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type. Allowed: WebM, WAV, MP3, OGG, M4A'));
    }
  }
});

router.post('/transcribe', authenticate, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const language = req.body.language || 'english';
    
    if (!['english', 'hindi', 'hinglish'].includes(language)) {
      return res.status(400).json({ 
        error: 'Invalid language. Must be: english, hindi, or hinglish' 
      });
    }

    if (req.file.size === 0) {
      return res.status(400).json({ error: 'Audio file is empty' });
    }

    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio file too large (max 10MB)' });
    }

    console.log('Transcribing audio:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
      language: language,
      filename: req.file.originalname
    });

    const result = await transcribeVoice(
      req.file.buffer,
      language,
      req.file.originalname || 'audio.webm'
    );

    res.json({
      transcription: result.transcription,
      confidence: result.confidence || 0.0,
      language: result.language || language,
      segments: result.segments || 0
    });
  } catch (error) {
    console.error('Transcription route error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      error: error.message || 'Transcription failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      serviceUrl: process.env.AI_SERVICE_URL || 'Not configured'
    });
  }
});

router.post('/tts', authenticate, async (req, res) => {
  try {
    const { text, voice, speed } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const audioBuffer = await textToSpeech(
      text,
      voice || 'nova',
      speed || 1.0
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength,
      'Content-Disposition': 'inline; filename=teacher_response.mp3'
    });

    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('TTS route error:', error);
    res.status(500).json({
      error: error.message || 'Speech generation failed'
    });
  }
});

router.post('/realtime-session', authenticate, async (req, res) => {
  try {
    const { sdp, subject, topic, questionStem, studentAnswer, conversationHistory = [] } = req.body;

    if (!sdp || typeof sdp !== 'string') {
      return res.status(400).json({ error: 'SDP offer is required' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({
        error: 'Realtime API not configured. Set OPENAI_API_KEY on the backend.'
      });
    }

    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [];
    const historyText = history.length
      ? history.map((h) => `Student: ${(h.student || '').slice(0, 200)}\nTeacher: ${(h.teacher || '').slice(0, 300)}`).join('\n\n')
      : '(none yet)';

    const instructions = `You are a concise, supportive teacher helping a student with a practice question.

## Context
- Subject: ${subject || 'general'}
- Topic: ${topic || 'general'}
- Question: ${(questionStem || '').slice(0, 400)}
- Student's original answer: ${(studentAnswer || '').slice(0, 300)}

## Conversation so far
${historyText}

## Rules
- Keep responses to 1-2 sentences. Be brief.
- Speak clearly. Respond quickly.
- Help clarify concepts, do not lecture.
- Match the student's language (English, Hindi, or Hinglish) if they use it.`;

    const sessionConfig = {
      model: 'gpt-realtime',
      instructions
    };

    const fd = new FormData();
    fd.set('sdp', sdp);
    fd.set('session', JSON.stringify(sessionConfig));

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
      body: fd
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI Realtime error:', response.status, errText);
      return res.status(response.status).json({
        error: 'Failed to create Realtime session',
        details: process.env.NODE_ENV === 'development' ? errText : undefined
      });
    }

    const answerSdp = await response.text();
    res.set('Content-Type', 'application/sdp');
    res.send(answerSdp);
  } catch (error) {
    console.error('Realtime session error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create Realtime session'
    });
  }
});

router.post('/coach-turn', authenticate, async (req, res) => {
  try {
    const {
      transcript,
      subject,
      topic,
      question_stem,
      student_answer,
      top_k = 5,
      latency_mode = 'balanced',
      conversation_history = []
    } = req.body;

    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ error: 'transcript is required' });
    }
    if (String(transcript).trim().length > 1500) {
      return res.status(400).json({ error: 'transcript is too long (max 1500 characters)' });
    }

    const normalizedLatencyMode = String(latency_mode || 'balanced').toLowerCase() === 'fast' ? 'fast' : 'balanced';

    const result = await coachVoiceTurn({
      transcript: String(transcript).trim(),
      subject,
      topic,
      questionStem: question_stem,
      studentAnswer: student_answer,
      topK: Math.max(1, Math.min(Number(top_k) || 5, 8)),
      latencyMode: normalizedLatencyMode,
      conversationHistory: Array.isArray(conversation_history) ? conversation_history : []
    });

    res.json(result);
  } catch (error) {
    console.error('Voice coach route error:', error);
    res.status(500).json({ error: error.message || 'Voice coach turn failed' });
  }
});

module.exports = router;

