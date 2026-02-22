const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { transcribeVoice, textToSpeech } = require('../services/ai');

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

module.exports = router;

