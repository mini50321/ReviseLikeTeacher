# ReviseLikeTeacher

NEET PG (and similar exams) preparation platform that builds a personalized, data-driven revision plan. Combines question bank, AI-style feedback, memory-decay-based revision scheduler, and advanced analytics.

## Tech Stack

- **Frontend:** React (Next.js)
- **Backend:** Node.js (Express)
- **AI Services:** Python (FastAPI)
- **Database:** PostgreSQL
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
- PostgreSQL 14+
- Python 3.9+ (for AI service)
- npm or yarn

### 1. Database Setup

```bash
# Create database
createdb reviseliketeacher

# Run schema
psql -d reviseliketeacher -f backend/database/schema.sql

# Seed initial data (optional)
psql -d reviseliketeacher -f backend/database/seed_data.sql
```

### 2. Backend Setup

```bash
cd backend
npm install
# Create .env file (see below)
npm start
```

### 3. Environment Variables

Create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reviseliketeacher
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your_secret_key_here
AI_SERVICE_URL=http://localhost:8000
PORT=3000
```

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

### Database Commands

```bash
npm run db:migrate    # Run migrations
npm run db:seed       # Seed data
npm run db:reset      # Reset and reseed
```

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

