# Voice Answer Features

This document describes the voice answer functionality implemented in Milestone 3.

## Overview

The application supports voice-based answers in addition to text input. Students can record their answers in English, Hindi, or Hinglish, which are then transcribed and evaluated by the AI system.

## Features

### 1. Voice Recording
- **Browser-based recording**: Uses MediaRecorder API
- **Real-time visualization**: Audio level visualization during recording
- **Playback**: Review recorded audio before transcription
- **Pause/Resume**: Control recording flow
- **Audio compression**: Automatic compression to optimize file size

### 2. Language Support
- **English**: Full support with high accuracy
- **Hindi**: Native Hindi transcription
- **Hinglish**: Code-switching between English and Hindi

### 3. Transcription
- **Automatic transcription**: Converts audio to text
- **Confidence indicators**: Visual feedback on transcription quality
- **Editable results**: Users can edit transcribed text before submission
- **Retry mechanism**: Up to 3 retry attempts for failed transcriptions

### 4. Error Handling
- **Network detection**: Automatic offline detection
- **Specific error messages**: Clear feedback for different error types
- **Retry capabilities**: Easy retry for failed operations
- **Graceful degradation**: Falls back to text mode if voice fails

## Technical Implementation

### Frontend Components

#### VoiceRecorder Component
- Handles audio recording using MediaRecorder API
- Provides start/stop/pause/resume controls
- Shows real-time audio level visualization
- Manages audio playback

#### LanguageSelector Component
- Dropdown for language selection
- Visual indicators (flags) for each language
- Required for voice answers

#### QuestionDisplay Component
- Integrates voice and text modes
- Handles transcription workflow
- Shows confidence indicators
- Manages answer submission

### Backend Services

#### Voice Transcription Route (`/api/voice/transcribe`)
- Accepts audio file uploads (WebM, WAV, MP3, OGG, M4A)
- Validates language parameter
- Forwards to AI service for transcription
- Returns transcription with confidence score

#### AI Service Integration
- Python FastAPI service using OpenAI Whisper
- Model selection based on language (base for English/Hindi, medium for Hinglish)
- Cached models for performance
- Returns transcription with confidence metrics

### Audio Processing

#### Compression
- Automatic compression before upload
- Reduces file size while maintaining quality
- Target: < 5MB per recording
- Format: WAV (mono, 16kHz) for optimal size/quality balance

#### Format Support
- Primary: WebM (Opus codec) - browser native
- Fallback: WAV, MP3, OGG, M4A
- Automatic format conversion if needed

## Usage Flow

1. **Select Voice Mode**: User clicks "Voice" button in answer interface
2. **Choose Language**: User selects English, Hindi, or Hinglish
3. **Start Recording**: User clicks "Start Recording" button
4. **Grant Permission**: Browser requests microphone access (first time)
5. **Record Answer**: User speaks their answer
6. **Stop Recording**: User clicks "Stop" when finished
7. **Review Audio**: User can play back the recording
8. **Transcribe**: User clicks "Transcribe" to convert audio to text
9. **Review Transcription**: Transcribed text appears with confidence indicator
10. **Edit if Needed**: User can edit the transcription
11. **Submit**: User submits the answer (sent with `answer_method: "voice"` and `language`)

## API Endpoints

### POST `/api/voice/transcribe`
Transcribes audio to text.

**Request:**
- Content-Type: `multipart/form-data`
- `audio`: Audio file (required)
- `language`: "english", "hindi", or "hinglish" (required)

**Response:**
```json
{
  "transcription": "transcribed text",
  "confidence": 0.95,
  "language": "english",
  "segments": 5
}
```

### POST `/api/attempts`
Submits an answer attempt.

**Request:**
```json
{
  "question_id": "uuid",
  "session_id": "uuid",
  "answer_text": "answer text",
  "answer_method": "voice",
  "language": "english",
  "time_spent_seconds": 120
}
```

## Performance Optimizations

1. **Audio Compression**: Reduces upload time and server load
2. **Model Caching**: Whisper models cached in memory
3. **Request Queuing**: Prevents server overload
4. **Timeout Management**: 60-second timeout for transcription
5. **Error Retry**: Automatic retry with exponential backoff

## Browser Compatibility

- **Chrome/Edge**: Full support (WebM, MediaRecorder)
- **Firefox**: Full support
- **Safari**: Supported (may require format conversion)
- **Mobile**: Supported on modern mobile browsers

## Troubleshooting

### Microphone Not Working
- Check browser permissions
- Ensure microphone is not used by another application
- Try refreshing the page

### Transcription Fails
- Check internet connection
- Verify audio file is not corrupted
- Try recording again with clearer audio
- Check if AI service is running

### Low Confidence Scores
- Speak clearly and at moderate pace
- Reduce background noise
- Ensure good microphone quality
- Try re-recording

## Future Enhancements

- Real-time transcription (streaming)
- Multiple language detection
- Voice commands for navigation
- Offline transcription support
- Advanced audio processing (noise reduction)

