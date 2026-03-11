import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: async (email, password) => {
    const response = await api.post('/auth/register', { email, password });
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  resetPassword: async (email) => {
    const response = await api.post('/auth/reset-password', { email });
    return response.data;
  },
};

export const userAPI = {
  getCurrentUser: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await api.put('/users/profile', data);
    return response.data;
  },
};

export const voiceAPI = {
  transcribe: async (audioBlob, language, onUploadProgress) => {
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', language);

    const response = await api.post('/voice/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });

    if (!response.data || response.data.transcription === undefined) {
      throw new Error('Invalid transcription response from server');
    }

    return response.data;
  },

  speak: async (text, voice = 'nova', speed = 1.0) => {
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }

    if (!text || !text.trim()) {
      throw new Error('No text to speak');
    }

    const response = await api.post('/voice/tts', {
      text,
      voice,
      speed
    }, {
      responseType: 'blob',
      timeout: 30000
    });

    return response.data;
  },

  createRealtimeSession: async (sdp, context) => {
    const response = await api.post('/voice/realtime-session', {
      sdp,
      subject: context?.subject,
      topic: context?.topic,
      questionStem: context?.questionStem,
      studentAnswer: context?.studentAnswer,
      conversationHistory: context?.conversationHistory || []
    }, {
      responseType: 'text',
      timeout: 15000
    });
    return response.data;
  },

  coachTurn: async ({
    transcript,
    subject,
    topic,
    questionStem,
    studentAnswer,
    topK = 5,
    latencyMode = 'balanced',
    conversationHistory = []
  }) => {
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }

    if (!transcript || !transcript.trim()) {
      throw new Error('Transcript is required');
    }

    const response = await api.post('/voice/coach-turn', {
      transcript: transcript.trim(),
      subject,
      topic,
      question_stem: questionStem,
      student_answer: studentAnswer,
      top_k: topK,
      latency_mode: latencyMode === 'fast' ? 'fast' : 'balanced',
      conversation_history: Array.isArray(conversationHistory) ? conversationHistory : []
    }, {
      timeout: 30000
    });

    return response.data;
  }
};

export default api;
