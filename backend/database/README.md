# Database Schema

## Setup

1. Create PostgreSQL database:
```bash
createdb reviseliketeacher
```

2. Run initial schema:
```bash
psql -d reviseliketeacher -f schema.sql
```

3. Run migrations (if using migration system):
```bash
psql -d reviseliketeacher -f migrations/001_initial_schema.sql
```

4. Seed initial data (optional):
```bash
psql -d reviseliketeacher -f seed_data.sql
```

## Tables

- `users` - User accounts (students and admins)
- `userprofile` - Student profile and preferences
- `question` - Question bank
- `session` - Practice/revision sessions
- `attempt` - Individual question attempts
- `topicmastery` - Topic-level mastery tracking
- `questionmastery` - Question-level mastery tracking
- `revisionschedule` - Daily revision schedules
- `examreadiness` - Exam readiness calculations
- `pdfupload` - PDF upload records
- `extractedquestion` - AI-extracted questions (pending review)
- `system_tuning_parameters` - System configuration parameters
- `feedback_ratings` - Student feedback on AI responses
- `extraction_corrections` - Admin corrections for PDF extractions
- `evaluation_corrections` - Admin corrections for answer evaluations

## Indexes

All tables have appropriate indexes for common query patterns:
- Foreign key indexes
- Filter indexes (status, type, difficulty, etc.)
- Composite indexes for common joins
- Date indexes for time-based queries

## Constraints

- Check constraints for enum values
- Range constraints for numeric fields
- Unique constraints where needed
- Foreign key constraints with appropriate CASCADE/SET NULL behavior

## Triggers

Automatic `updated_at` timestamp triggers on:
- users
- userprofile
- question
- topicmastery
- questionmastery

