# ReviseLikeTeacher

NEET PG (and similar exams) preparation platform that builds a personalized, data-driven revision plan. Combines question bank, AI-style feedback, memory-decay-based revision scheduler, and advanced analytics.

## Tech Stack

- **Frontend:** React (Next.js)
- **Backend:** Node.js (Express)
- **AI Services:** Python (FastAPI)
- **Database:** SQLite
- **Platforms:** Web + Android

## Project Structure

```
.
├── backend/             # Node.js backend API
│   ├── database/       # Database schema and migrations
│   ├── routes/         # API routes
│   ├── middleware/     # Express middleware
│   ├── services/       # Business logic services
│   └── uploads/        # File uploads storage
├── frontend/           # React/Next.js frontend
│   └── src/            # Source code
├── docs/               # Documentation (if exists)
└── ai-service/         # Python FastAPI AI service
    ├── services/       # AI service modules
    │   ├── transcription.py  # Voice transcription service
    │   └── evaluation.py     # Answer evaluation service
    └── main.py         # FastAPI application
```

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- Python 3.9+ (for AI service, optional)
- npm or yarn

**Note:** This project uses SQLite, so no separate database server installation is required!

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Start Backend Server

Open **Terminal 1**:
```bash
cd backend
npm start
```

You should see:
```
✅ Database loaded
✅ Server running on port 3000
```

**Keep this terminal open!**

### 3. Start Frontend Server

Open **Terminal 2** (new terminal):
```bash
cd frontend
npm run dev
```

You should see:
```
▲ Next.js 14.0.4
- Local:        http://localhost:3001
```

**Keep this terminal open too!**

### 4. Open the Application

Open your browser and navigate to:
```
http://localhost:3001
```

### 5. Add Sample Questions (First Time Only)

In the backend terminal (Terminal 1), stop the server (`Ctrl+C`) and run:
```bash
npm run seed-questions
```

Then start the server again:
```bash
npm start
```

### Environment Variables (Optional)

Create `backend/.env` if you need custom settings (defaults work for development):

```env
DB_PATH=./database.sqlite
JWT_SECRET=your_secret_key_here
AI_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
NODE_ENV=development
```

**Note:** `OPENAI_API_KEY` is required for the **Realtime voice** feature (Ask teacher follow-up with sub-second latency). Use the same key as your ai-service.

The database file (`database.sqlite`) will be created automatically in the `backend/` directory when you first run the server.

### 5. AI Service Setup

**Prerequisites:**
- Python 3.9+
- OpenAI API key (for answer evaluation)

**Setup:**

1. Create virtual environment:
```bash
cd ai-service
python -m venv venv
```

2. Activate virtual environment:

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

4. Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=8000
```

5. Run the service:
```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --reload --port 8000
```

The AI service will be available at `http://localhost:8000`

**Note:** Whisper models will be downloaded automatically on first use. The first transcription may take longer.

## Development

### Running Backend

```bash
npm run start:backend
# or
cd backend && npm start
```

API will be available at `http://localhost:3000`

### Running Frontend

```bash
npm run start:frontend
# or
cd frontend && npm run dev
```

Frontend will be available at `http://localhost:3001`

### Database

The database is SQLite and is stored in `backend/database.sqlite`. It's created automatically on first run.

To reset the database:
1. Delete `backend/database.sqlite`
2. Restart the server (it will recreate the database)

## API Documentation

OpenAPI specification: `backend/openapi.yaml`

View interactive docs by importing into Swagger UI or Postman.

## Features

- ✅ User authentication (register, login, password reset)
- ✅ Student onboarding
- ✅ Question bank management
- ✅ Practice sessions with voice/text answers
  - Voice recording in English, Hindi, and Hinglish
  - Real-time audio visualization
  - Audio playback before submission
  - Transcription with confidence indicators
- ✅ AI-powered answer evaluation
- ✅ Revision schedule generation
- ✅ Mastery tracking
- ✅ Analytics and metrics
- ✅ Admin dashboard
- ✅ PDF upload and question extraction

## Milestones

- [x] Milestone 1: Requirements & Architecture
- [x] Milestone 2: Basic app setup (login, dashboard, practice, admin panel, PDF upload)
- [x] Milestone 3: Voice answers & AI evaluation
  - [x] Voice transcription (English, Hindi, Hinglish)
  - [x] AI answer evaluation
  - [x] Language switching
  - [x] Fast response times
  - [x] Audio playback and visualization
  - [x] Transcription confidence indicators
  - [x] Comprehensive error handling
  - [x] Browser compatibility checks
- [ ] Milestone 4: Revision planning & analytics
- [ ] Milestone 5: Testing & deployment

## Voice Features Documentation

See [VOICE_FEATURES.md](./VOICE_FEATURES.md) for detailed documentation on voice answer functionality.

## Testing

See [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) for comprehensive testing procedures.

## License

ISC

