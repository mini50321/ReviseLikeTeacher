export const Validation = {
  validateLanguage: (language) => {
    const validLanguages = ['english', 'hindi', 'hinglish'];
    return validLanguages.includes(language?.toLowerCase());
  },

  validateAnswerMethod: (method) => {
    return method === 'voice' || method === 'text';
  },

  validateAudioBlob: (blob) => {
    if (!blob || !(blob instanceof Blob)) {
      return { valid: false, error: 'Invalid audio blob' };
    }

    if (blob.size === 0) {
      return { valid: false, error: 'Audio file is empty' };
    }

    const maxSize = 10 * 1024 * 1024;
    if (blob.size > maxSize) {
      return { valid: false, error: `Audio file too large (max ${maxSize / 1024 / 1024}MB)` };
    }

    const validTypes = [
      'audio/webm',
      'audio/wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/x-m4a'
    ];

    if (!validTypes.some(type => blob.type.includes(type.split('/')[1]))) {
      return { valid: false, error: 'Invalid audio file type' };
    }

    return { valid: true };
  },

  validateTranscriptionResult: (result) => {
    if (!result || typeof result !== 'object') {
      return { valid: false, error: 'Invalid transcription response' };
    }

    if (typeof result.transcription !== 'string') {
      return { valid: false, error: 'Transcription text is missing or invalid' };
    }

    if (result.transcription.trim().length === 0) {
      return { valid: false, error: 'Transcription is empty' };
    }

    if (result.confidence !== undefined && (result.confidence < 0 || result.confidence > 1)) {
      return { valid: false, error: 'Invalid confidence score' };
    }

    return { valid: true };
  },

  validateAnswerSubmission: (data) => {
    const errors = [];

    if (!data.answer_text || typeof data.answer_text !== 'string' || data.answer_text.trim().length === 0) {
      errors.push('Answer text is required');
    }

    if (!data.answer_method || !Validation.validateAnswerMethod(data.answer_method)) {
      errors.push('Valid answer method (voice or text) is required');
    }

    if (data.answer_method === 'voice') {
      if (!data.language || !Validation.validateLanguage(data.language)) {
        errors.push('Language is required for voice answers');
      }
    }

    if (data.time_spent_seconds !== undefined && (typeof data.time_spent_seconds !== 'number' || data.time_spent_seconds < 0)) {
      errors.push('Invalid time spent value');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  sanitizeAnswerText: (text) => {
    if (typeof text !== 'string') return '';
    
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 10000);
  }
};

