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
└── ai-service/         # Python FastAPI AI service (to be created)
```

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- Python 3.9+ (for AI service, optional)
- npm or yarn

**Note:** This project uses SQLite, so no separate database server installation is required!

### 1. Backend Setup

```bash
cd backend
npm install
# Database will be created automatically on first run
npm start
```

### 2. Environment Variables

Create `backend/.env` (optional - defaults work for development):

```env
DB_PATH=./database.sqlite
JWT_SECRET=your_secret_key_here
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
```

The database file (`database.sqlite`) will be created automatically in the `backend/` directory when you first run the server.

### 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Update NEXT_PUBLIC_API_URL in .env.local
npm run dev
```

Frontend will be available at `http://localhost:3001`

### 5. AI Service Setup (Next Steps)

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload
```

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

- ✅ User authentication (register, login, password reset) - Frontend implemented
- ✅ Student onboarding
- ✅ Question bank management
- ✅ Practice sessions with voice/text answers
- ✅ AI-powered answer evaluation
- ✅ Revision schedule generation
- ✅ Mastery tracking
- ✅ Analytics and metrics
- ✅ Admin dashboard
- ✅ PDF upload and question extraction

## Milestones

- [x] Milestone 1: Requirements & Architecture (Stage 1-3)
- [x] Milestone 1: Database Schema (Stage 4)
- [x] Milestone 1: API Specification (Stage 5)
- [x] Milestone 1: Project Setup (Stage 6)
- [ ] Milestone 2: Basic app setup (5 days)
- [ ] Milestone 3: Voice answers & AI evaluation (5 days)
- [ ] Milestone 4: Revision planning & analytics (5 days)
- [ ] Milestone 5: Testing & deployment (3 days)

## License

ISC

