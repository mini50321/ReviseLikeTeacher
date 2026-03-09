# ReviseLikeTeacher AI Service

Python FastAPI service for AI-powered features including voice transcription and answer evaluation.

## Features

- Voice transcription in English, Hindi, and Hinglish
- AI-powered answer evaluation
- Fast response times (< 2 seconds for evaluation)

## Setup

### Prerequisites

- Python 3.9+
- pip

### Installation

1. Create a virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:

**Windows:**
```bash
venv\Scripts\activate
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key (required for TTS, transcription, evaluation):
```
OPENAI_API_KEY=sk-your-actual-key-here
PORT=8000
```

If `OPENAI_API_KEY` is missing or invalid, Listen (TTS) will show "Listen unavailable" — you can still use the app by reading the text.

## Running the Service

```bash
python main.py
```

Or with uvicorn directly:
```bash
uvicorn main:app --reload --port 8000
```

The service will be available at `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /health
```

### Transcribe Audio
```
POST /transcribe
Content-Type: multipart/form-data

Parameters:
- audio: Audio file (WebM, WAV, MP3)
- language: "english", "hindi", or "hinglish"
```

Response:
```json
{
  "transcription": "transcribed text",
  "confidence": 0.95,
  "language": "english",
  "segments": 5
}
```

### Evaluate Answer
```
POST /evaluate
Content-Type: application/json

Body:
{
  "question": {
    "id": "question-id",
    "stem": "question text",
    "ideal_answer": "ideal answer",
    "key_points": ["point1", "point2"],
    "topic": "topic",
    "subject": "subject",
    "difficulty": "medium"
  },
  "student_answer": "student's answer text",
  "current_mastery": 50.0,
  "user_id": "user-id"
}
```

Response:
```json
{
  "score": 85,
  "feedback": {
    "strengths": "Good understanding of concepts",
    "improvements": "Could add more detail",
    "model_explanation": "Complete explanation"
  },
  "mastery_impact": {
    "delta": 0.12
  }
}
```

## Technology

- **FastAPI**: Web framework
- **OpenAI Whisper**: Speech-to-text transcription
- **OpenAI GPT-3.5**: Answer evaluation
- **Uvicorn**: ASGI server

## Notes

- Whisper models are downloaded automatically on first use
- The `base` model is used for English and Hindi
- The `medium` model is used for Hinglish (better code-switching support)
- Models are cached in memory for faster subsequent requests
- OpenAI API key is required for answer evaluation

