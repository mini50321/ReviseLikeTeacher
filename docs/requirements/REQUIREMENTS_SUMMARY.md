# ReviseLikeTeacher - Requirements Summary

## Quick Reference

### Core Modules
1. **Authentication & Onboarding** - Sign up, login, password reset, profile setup
2. **Dashboard** - Student overview, readiness status, quick actions
3. **Practice** - Question sessions, voice/text answers, AI feedback
4. **Question Studio** - Admin question bank management, PDF upload, AI extraction review
5. **Revision Schedule** - Personalized memory-decay based scheduling
6. **Metrics Lab** - Advanced analytics for students and admins
7. **Admin Dashboard** - Cohort monitoring and management

### Key Features
- **Voice Answers:** English, Hindi, Hinglish with high accuracy
- **AI Feedback:** Human teacher-like tone, < 3 seconds response time
- **PDF Processing:** Automatic question extraction with admin review
- **Intelligence Analysis:** Student performance comparison and difficulty calculation
- **Memory Decay:** Personalized revision scheduling based on forgetting curves
- **Feedback Loop:** Students and admins can rate/improve AI responses

### Technical Stack
- **Frontend:** React (Next.js)
- **Backend:** Node.js
- **AI Services:** Python (FastAPI)
- **Database:** PostgreSQL
- **Platforms:** Web + Android

### Performance Targets
- AI feedback: < 3 seconds
- Page load: < 2 seconds
- Voice transcription: < 5 seconds for 30-second audio
- Support: 100 concurrent users (scalable to 1000+)

### Critical Requirements
1. Voice accuracy must be high (90%+) - students will leave if inaccurate
2. Low latency in feedback - time is critical for competitive exam prep
3. AI focuses on weak topics while maintaining balance
4. Human teacher-like conversation tone
5. Manual admin override and feedback for AI improvement
6. Analytics for question difficulty and student intelligence

### User Roles
- **Student:** Practice questions, follow revision schedule, view analytics
- **Admin/Faculty:** Manage question bank, review AI extractions, monitor cohort, tune parameters

### Data Model (Key Entities)
- userprofile
- question
- attempt
- topicmastery
- questionmastery
- revisionschedule
- examreadiness
- pdfupload
- extractedquestion
- system_tuning_parameters
- ai_feedback_ratings

### Out of Scope (v1.0)
- iOS app
- Offline mode
- Social features
- Video explanations
- Live tutoring
- Payment management
- Push notifications
- Multi-exam support
- OCR for scanned PDFs

---

**Full Requirements:** See REQUIREMENTS.md

