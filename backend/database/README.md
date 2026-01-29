# Database Schema

## Overview

This project uses **SQLite** as the database. The database is automatically created and initialized when you first start the backend server.

## Database File

- **Location**: `backend/database.sqlite` (created automatically)
- **Schema File**: `backend/database/schema.sqlite.sql`
- **No setup required** - Database initializes on first run

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

## Resetting the Database

To reset the database:
1. Delete `backend/database.sqlite`
2. Restart the backend server
3. The database will be recreated with a fresh schema
