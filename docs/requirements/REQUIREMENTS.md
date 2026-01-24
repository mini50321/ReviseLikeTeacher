# ReviseLikeTeacher - Requirements Document

## 1. Project Overview

**Application Name:** ReviseLikeTeacher  
**Purpose:** NEET PG (and similar competitive exams) preparation platform with personalized, data-driven revision planning  
**Target Users:** Medical students preparing for NEET PG and similar competitive exams  
**Platform:** Web application (React/Next.js) and Android mobile app

---

## 2. Functional Requirements

### 2.1 Authentication & User Management

#### FR-1.1: User Registration
- **FR-1.1.1:** Users can sign up with email and password
- **FR-1.1.2:** System validates email format and password strength
- **FR-1.1.3:** System creates user profile upon successful registration
- **FR-1.1.4:** System sends verification email (optional)

#### FR-1.2: User Login
- **FR-1.2.1:** Users can log in with email and password
- **FR-1.2.2:** System maintains session after login
- **FR-1.2.3:** System supports "Remember Me" functionality
- **FR-1.2.4:** System handles failed login attempts

#### FR-1.3: Password Management
- **FR-1.3.1:** Users can reset password via email link
- **FR-1.3.2:** Password reset link expires after 24 hours
- **FR-1.3.3:** Users can change password when logged in

#### FR-1.4: User Roles
- **FR-1.4.1:** System supports two roles: Student and Admin/Faculty
- **FR-1.4.2:** Role-based access control for all features
- **FR-1.4.3:** Students cannot access admin features
- **FR-1.4.4:** Admins can access all features

---

### 2.2 Onboarding & Profile Setup

#### FR-2.1: Student Onboarding Flow
- **FR-2.1.1:** New students complete onboarding after registration
- **FR-2.1.2:** Onboarding collects: target exam, exam date, target score band
- **FR-2.1.3:** Onboarding collects: chosen subjects, daily study minutes, weekly question target
- **FR-2.1.4:** System creates userprofile record with onboarding data
- **FR-2.1.5:** Onboarding can be skipped and completed later

#### FR-2.2: Study Capacity Management
- **FR-2.2.1:** Students can edit study capacity (daily minutes, weekly questions)
- **FR-2.2.2:** Changes to capacity trigger revision schedule regeneration
- **FR-2.2.3:** System validates capacity inputs (minimum/maximum values)

---

### 2.3 Dashboard (Student)

#### FR-3.1: Dashboard Overview
- **FR-3.1.1:** Displays target exam, exam date, target score, study capacity
- **FR-3.1.2:** Shows readiness status with reasoning/summary messages
- **FR-3.1.3:** Displays recent updates and notifications
- **FR-3.1.4:** Shows quick-start practice mode buttons (balanced mix, more clinical, rapid-fire)

#### FR-3.2: Revision Plan Display
- **FR-3.2.1:** Shows today's revision plan with subject and topic breakdown
- **FR-3.2.2:** Displays 7-day schedule overview
- **FR-3.2.3:** Shows adherence/progress metrics
- **FR-3.2.4:** Displays topic mastery levels
- **FR-3.2.5:** Shows recall/memory-decay visualizations
- **FR-3.2.6:** Displays subject proficiency breakdown

---

### 2.4 Practice Module

#### FR-4.1: Session Setup
- **FR-4.1.1:** Students can configure practice sessions via popup
- **FR-4.1.2:** Configuration options: number of questions, mode, subjects/topics, difficulty mix, question-type distribution
- **FR-4.1.3:** System validates configuration and starts session

#### FR-4.2: Question Display
- **FR-4.2.1:** System displays questions one at a time
- **FR-4.2.2:** Questions show stem, type, optional image
- **FR-4.2.3:** System tracks time spent per question
- **FR-4.2.4:** Students can navigate between questions in session

#### FR-4.3: Answer Submission
- **FR-4.3.1:** Students can answer via voice recording
- **FR-4.3.2:** Students can answer via text input
- **FR-4.3.3:** Voice recording supports: record, stop, re-record functionality
- **FR-4.3.4:** Students can switch between voice and text during session
- **FR-4.3.5:** Students can change language (English/Hindi/Hinglish) during session
- **FR-4.3.6:** System saves answer attempt with timestamp

#### FR-4.4: AI Feedback
- **FR-4.4.1:** System provides feedback after answer submission
- **FR-4.4.2:** Feedback includes: "what you did well", "what was missing", model explanation
- **FR-4.4.3:** Feedback tone resembles human teacher (conversational, encouraging)
- **FR-4.4.4:** System updates topic mastery based on answer quality
- **FR-4.4.5:** Feedback is generated with minimal latency (< 3 seconds)

#### FR-4.5: Session Tracking
- **FR-4.5.1:** System tracks current session stats: questions answered, accuracy, time spent, mode
- **FR-4.5.2:** System maintains session history
- **FR-4.5.3:** Students can view past session details

#### FR-4.6: Feedback Rating
- **FR-4.6.1:** Students can rate AI feedback as good/bad/worse
- **FR-4.6.2:** Rating data is stored for AI improvement
- **FR-4.6.3:** Admins can view aggregated feedback ratings

---

### 2.5 Question Studio (Admin)

#### FR-5.1: Question Bank Management
- **FR-5.1.1:** Admins can view all questions in bank
- **FR-5.1.2:** Filtering by: subject, topic, type, difficulty, importance, cognitive focus, status
- **FR-5.1.3:** Admins can create new questions manually
- **FR-5.1.4:** Admins can edit existing questions
- **FR-5.1.5:** Question fields: stem, type, difficulty, importance, cognitive focus, ideal answer/key points, previous year tags, optional image

#### FR-5.2: PDF Upload
- **FR-5.2.1:** Admins can upload PDF files
- **FR-5.2.2:** System parses PDF and extracts questions
- **FR-5.2.3:** System detects: question type, subject, topic, importance, cognitive focus, key points
- **FR-5.2.4:** System handles images/diagrams in PDFs
- **FR-5.2.5:** Extracted questions are saved as draft for review

#### FR-5.3: AI Extraction Review
- **FR-5.3.1:** Admins can review AI-extracted questions
- **FR-5.3.2:** Admins can accept, reject, or save as draft
- **FR-5.3.3:** Admins can manually correct AI extractions
- **FR-5.3.4:** Accepted questions are added to question bank
- **FR-5.3.5:** Rejected questions are discarded or saved for later review

#### FR-5.4: Question Preview & Stats
- **FR-5.4.1:** Admins can preview questions before publishing
- **FR-5.4.2:** System shows usage stats: attempts, correct rate, average score
- **FR-5.4.3:** Stats update in real-time as students use questions

#### FR-5.5: Teacher Override & AI Improvement
- **FR-5.5.1:** Admins can manually assess AI feedback quality
- **FR-5.5.2:** Admins can provide feedback to improve AI
- **FR-5.5.3:** System uses admin feedback to improve future AI responses
- **FR-5.5.4:** Override data is stored for model training

---

### 2.6 Revision Schedule Module

#### FR-6.1: Schedule Generation
- **FR-6.1.1:** System generates personalized revision schedule based on: exam date, study capacity, current mastery
- **FR-6.1.2:** Schedule uses memory-decay algorithm to determine revision timing
- **FR-6.1.3:** System calculates required revisions per topic for each student
- **FR-6.1.4:** Schedule adapts based on student intelligence level and topic proficiency
- **FR-6.1.5:** System considers question difficulty data from cohort

#### FR-6.2: Schedule Configuration
- **FR-6.2.1:** Displays current configuration: exam, date, target score band, daily minutes, weekly questions
- **FR-6.2.2:** Students can regenerate schedule
- **FR-6.2.3:** Students can "tune balance": clinical vs factual, difficulty distribution, load distribution

#### FR-6.3: Schedule Display
- **FR-6.3.1:** Shows weekly readiness forecast
- **FR-6.3.2:** Displays plan-vs-actual adherence metrics
- **FR-6.3.3:** Lists daily sessions with: subject, topic, planned vs completed questions, status (complete/partial/skipped)
- **FR-6.3.4:** Students can update session status manually

#### FR-6.4: Memory Decay Visualization
- **FR-6.4.1:** Memory decay inspector shows recall levels over time
- **FR-6.4.2:** Heatmaps for topics, recall levels, remaining revisions
- **FR-6.4.3:** Visual indicators for topics needing immediate revision

---

### 2.7 Metrics Lab (Analytics)

#### FR-7.1: Global Filters
- **FR-7.1.1:** Filters by: date range, exam, subject, topic, importance, difficulty
- **FR-7.1.2:** Filters apply across all analytics tabs

#### FR-7.2: Per Question Analytics
- **FR-7.2.1:** Shows attempts, correct rate, average score, difficulty, average revisions
- **FR-7.2.2:** Identifies problematic questions

#### FR-7.3: Per Topic Analytics
- **FR-7.3.1:** Shows success rate, time to strong mastery, typical revisions needed
- **FR-7.3.2:** Displays cognitive focus distribution

#### FR-7.4: Per Subject Analytics
- **FR-7.4.1:** Shows mastery distribution across subjects
- **FR-7.4.2:** Identifies high-importance weak areas

#### FR-7.5: Per Exam Analytics
- **FR-7.5.1:** Shows blueprint coverage
- **FR-7.5.2:** Categorizes students: on-track, borderline, off-track

#### FR-7.6: Per Question Type Analytics
- **FR-7.6.1:** Shows success rate by question format
- **FR-7.6.2:** Displays attempts distribution by type

#### FR-7.7: Advanced Analytics
- **FR-7.7.1:** Memory-decay trends visualization
- **FR-7.7.2:** Revisions distribution analysis
- **FR-7.7.3:** Cohort topic difficulty analysis
- **FR-7.7.4:** Missed key points analytics

#### FR-7.8: Tuning Parameters
- **FR-7.8.1:** Admins can adjust: mastery thresholds, recall thresholds, scheduler weights, forecast weights
- **FR-7.8.2:** Changes affect future schedule generation

---

### 2.8 Admin Dashboard

#### FR-8.1: Cohort Monitoring
- **FR-8.1.1:** Shows active students count
- **FR-8.1.2:** Displays on-track/borderline/off-track percentages
- **FR-8.1.3:** Shows average questions/week, rolling accuracy

#### FR-8.2: Global Analytics
- **FR-8.2.1:** Global mastery distribution across cohort
- **FR-8.2.2:** Top weak topics across cohort
- **FR-8.2.3:** Error rates by question type and cognitive focus

#### FR-8.3: Content Management
- **FR-8.3.1:** Summaries of content coverage and gaps
- **FR-8.3.2:** Recent PDF imports list
- **FR-8.3.3:** Question extraction summary

#### FR-8.4: Student Trajectories
- **FR-8.4.1:** Sample student trajectories: improving, plateau, declining
- **FR-8.4.2:** Identifies students needing intervention

---

### 2.9 AI & Intelligence System

#### FR-9.1: Voice Processing
- **FR-9.1.1:** Supports English, Hindi, and Hinglish transcription
- **FR-9.1.2:** High accuracy transcription (critical requirement)
- **FR-9.1.3:** Integration with Survam.ai or alternative voice API
- **FR-9.1.4:** Handles language switching during session

#### FR-9.2: Student Intelligence Analysis
- **FR-9.2.1:** Analyzes student performance to determine intelligence level
- **FR-9.2.2:** Compares student performance to cohort
- **FR-9.2.3:** Tracks topic-specific proficiency
- **FR-9.2.4:** Uses intelligence data to personalize revision schedule

#### FR-9.3: Question Difficulty Analysis
- **FR-9.3.1:** Calculates question difficulty from cohort performance
- **FR-9.3.2:** Tracks revisions needed by intelligent vs weaker students
- **FR-9.3.3:** Updates difficulty dynamically as more data is collected

#### FR-9.4: Revision Calculation
- **FR-9.4.1:** Determines number of revisions needed per student per topic
- **FR-9.4.2:** Calculates optimal revision timing based on memory decay
- **FR-9.4.3:** Considers student intelligence, topic difficulty, exam date

---

### 2.10 Navigation & UI

#### FR-10.1: Common Header
- **FR-10.1.1:** Header present on all pages
- **FR-10.1.2:** Shows Log In / Sign Up / Log Out buttons
- **FR-10.1.3:** Menu navigation for all modules
- **FR-10.1.4:** User profile indicator

#### FR-10.2: Error Handling
- **FR-10.2.1:** 404 page for non-existent routes
- **FR-10.2.2:** Error messages for failed operations
- **FR-10.2.3:** Graceful handling of API failures

---

## 3. Non-Functional Requirements

### 3.1 Performance

#### NFR-1.1: Response Time
- **NFR-1.1.1:** AI feedback generation: < 3 seconds (minimum to no latency)
- **NFR-1.1.2:** Page load time: < 2 seconds
- **NFR-1.1.3:** Database queries: < 500ms for standard operations
- **NFR-1.1.4:** Voice transcription: < 5 seconds for 30-second audio

#### NFR-1.2: Scalability
- **NFR-1.2.1:** Support 100 concurrent users initially
- **NFR-1.2.2:** Architecture allows easy scaling to 1000+ users
- **NFR-1.2.3:** Database can handle 10,000+ questions
- **NFR-1.2.4:** System handles 1000+ practice sessions per day

### 3.2 Reliability

#### NFR-2.1: Availability
- **NFR-2.1.1:** System uptime: 99% during study hours (6 AM - 12 AM IST)
- **NFR-2.1.2:** Graceful degradation if AI services are unavailable
- **NFR-2.1.3:** Data backup daily

#### NFR-2.2: Error Recovery
- **NFR-2.2.1:** Session data saved incrementally (no data loss on crash)
- **NFR-2.2.2:** Retry mechanism for failed API calls
- **NFR-2.2.3:** User notified of errors with actionable messages

### 3.3 Security

#### NFR-3.1: Authentication
- **NFR-3.1.1:** Passwords stored using secure hashing (bcrypt)
- **NFR-3.1.2:** JWT tokens for session management
- **NFR-3.1.3:** Token expiration and refresh mechanism

#### NFR-3.2: Data Protection
- **NFR-3.2.1:** HTTPS for all communications
- **NFR-3.2.2:** Role-based access control enforced at API level
- **NFR-3.2.3:** Student data privacy: students cannot see other students' data
- **NFR-3.2.4:** Admin data access logged

#### NFR-3.3: Input Validation
- **NFR-3.3.1:** All user inputs validated and sanitized
- **NFR-3.3.2:** SQL injection prevention
- **NFR-3.3.3:** XSS protection

### 3.4 Usability

#### NFR-4.1: User Interface
- **NFR-4.1.1:** Responsive design for web (desktop and tablet)
- **NFR-4.1.2:** Mobile-optimized for Android app
- **NFR-4.1.3:** Intuitive navigation (max 3 clicks to any feature)
- **NFR-4.1.4:** Clear visual feedback for all actions

#### NFR-4.2: Accessibility
- **NFR-4.2.1:** Support for screen readers (basic)
- **NFR-4.2.2:** Keyboard navigation support
- **NFR-4.2.3:** Color contrast meets WCAG AA standards

### 3.5 Compatibility

#### NFR-5.1: Browsers
- **NFR-5.1.1:** Chrome (latest 2 versions)
- **NFR-5.1.2:** Firefox (latest 2 versions)
- **NFR-5.1.3:** Safari (latest 2 versions)
- **NFR-5.1.4:** Edge (latest 2 versions)

#### NFR-5.2: Mobile
- **NFR-5.2.1:** Android 8.0+ (Oreo and above)
- **NFR-5.2.2:** Responsive web design for mobile browsers

### 3.6 Maintainability

#### NFR-6.1: Code Quality
- **NFR-6.1.1:** Code follows consistent style guide
- **NFR-6.1.2:** No comments in code (client requirement)
- **NFR-6.1.3:** Modular architecture for easy updates

#### NFR-6.2: Documentation
- **NFR-6.2.1:** API documentation (OpenAPI/Swagger)
- **NFR-6.2.2:** Database schema documentation
- **NFR-6.2.3:** Deployment guide

---

## 4. Assumptions & Clarifications

### 4.1 Voice Processing
- **AS-1.1:** Survam.ai API will be used for Hindi/Hinglish transcription (to be verified)
- **AS-1.2:** English transcription can use Google Speech-to-Text or similar
- **AS-1.3:** Voice accuracy target: 90%+ for clear audio
- **AS-1.4:** Students will have access to microphone on their devices

### 4.2 AI Services
- **AS-2.1:** AI services (PDF parsing, answer evaluation) will be hosted separately (Python/FastAPI)
- **AS-2.2:** AI models can be fine-tuned based on admin feedback
- **AS-2.3:** Initial AI accuracy may be lower, improves with feedback loop
- **AS-2.4:** AI feedback tone will be trained on teacher-like responses

### 4.3 Data & Analytics
- **AS-3.1:** Question difficulty calculated from minimum 10 attempts
- **AS-3.2:** Student intelligence comparison uses percentile ranking
- **AS-3.3:** Memory decay algorithm based on spaced repetition research
- **AS-3.4:** Analytics data updates in near real-time (within 5 minutes)

### 4.4 PDF Processing
- **AS-4.1:** PDFs will be in standard format (text-based, not scanned images)
- **AS-4.2:** Scanned PDFs may require OCR (out of scope for initial version)
- **AS-4.3:** Images in PDFs will be extracted and stored separately
- **AS-4.4:** PDF parsing accuracy: 80%+ (admin review required)

### 4.5 User Behavior
- **AS-5.1:** Students will complete onboarding before first practice session
- **AS-5.2:** Students may skip scheduled revision sessions
- **AS-5.3:** Students can practice outside of scheduled sessions
- **AS-5.4:** Admins will review all AI extractions before publishing

### 4.6 Infrastructure
- **AS-6.1:** Cloud hosting (AWS/Azure/GCP) for production
- **AS-6.2:** Database will be managed service (RDS/Cloud SQL)
- **AS-6.3:** File storage for PDFs and images (S3/Cloud Storage)
- **AS-6.4:** CDN for static assets

---

## 5. User Stories

### 5.1 Student User Stories

#### US-1: As a student, I want to sign up and set my exam goals
**Acceptance Criteria:**
- Student can register with email and password
- Student completes onboarding with exam details
- System creates personalized profile
- Student sees dashboard with their goals

#### US-2: As a student, I want to practice questions with voice answers
**Acceptance Criteria:**
- Student can start practice session
- Student can record voice answer in English/Hindi/Hinglish
- Student can switch language during session
- System transcribes voice accurately
- Student receives feedback quickly

#### US-3: As a student, I want to see my revision schedule
**Acceptance Criteria:**
- Student sees today's revision plan
- Student sees 7-day schedule
- Schedule shows subjects and topics
- Student can mark sessions as complete

#### US-4: As a student, I want to see my progress and analytics
**Acceptance Criteria:**
- Student sees topic mastery levels
- Student sees subject proficiency
- Student sees readiness status
- Analytics update in real-time

#### US-5: As a student, I want to rate AI feedback quality
**Acceptance Criteria:**
- Student can rate feedback as good/bad/worse
- Rating is saved for AI improvement
- Student can continue practice after rating

### 5.2 Admin User Stories

#### US-6: As an admin, I want to upload PDFs and extract questions
**Acceptance Criteria:**
- Admin can upload PDF file
- System extracts questions automatically
- System categorizes questions (subject, topic, difficulty)
- Admin can review extractions before publishing

#### US-7: As an admin, I want to manage the question bank
**Acceptance Criteria:**
- Admin can filter questions by multiple criteria
- Admin can create/edit questions manually
- Admin can see question usage statistics
- Admin can enable/disable questions

#### US-8: As an admin, I want to monitor cohort performance
**Acceptance Criteria:**
- Admin sees active students count
- Admin sees on-track/borderline/off-track percentages
- Admin sees global mastery distribution
- Admin identifies weak topics across cohort

#### US-9: As an admin, I want to improve AI feedback quality
**Acceptance Criteria:**
- Admin can review student feedback ratings
- Admin can manually assess AI responses
- Admin can provide correction feedback
- System uses feedback to improve future responses

#### US-10: As an admin, I want to tune system parameters
**Acceptance Criteria:**
- Admin can adjust mastery thresholds
- Admin can adjust scheduler weights
- Admin can adjust forecast parameters
- Changes affect future schedule generation

---

## 6. Edge Cases & Constraints

### 6.1 Edge Cases

#### EC-1: Voice Transcription Failures
- **Scenario:** Voice audio is unclear or too noisy
- **Handling:** System prompts user to re-record, fallback to text input
- **User Message:** "Audio unclear. Please re-record or type your answer."

#### EC-2: AI Service Unavailable
- **Scenario:** AI service is down or slow
- **Handling:** Queue request, show "Processing..." message, retry with exponential backoff
- **Fallback:** Store answer for later processing, notify user

#### EC-3: PDF Parsing Errors
- **Scenario:** PDF format is unsupported or corrupted
- **Handling:** Reject upload with error message, suggest alternative format
- **User Message:** "PDF format not supported. Please upload a text-based PDF."

#### EC-4: Schedule Regeneration During Active Session
- **Scenario:** Student changes capacity while practice session is active
- **Handling:** Schedule regeneration queued, applied after session completion
- **Notification:** "Schedule will update after current session"

#### EC-5: Language Switch Mid-Answer
- **Scenario:** Student switches language while recording
- **Handling:** Current recording saved, new recording starts in new language
- **User Message:** "Recording saved. Starting new recording in [language]"

#### EC-6: Concurrent Question Attempts
- **Scenario:** Multiple students attempt same question simultaneously
- **Handling:** Each attempt tracked separately, difficulty calculation uses all attempts
- **No Conflict:** System designed for concurrent access

#### EC-7: Student Skips All Revisions
- **Scenario:** Student doesn't complete any scheduled revisions
- **Handling:** System marks as skipped, adjusts future schedule, shows warning
- **Analytics:** Tracks adherence rate, identifies off-track students

#### EC-8: Exam Date in Past
- **Scenario:** Student sets exam date that has already passed
- **Handling:** Validation error, prompt to set future date
- **User Message:** "Exam date must be in the future"

#### EC-9: Zero Study Capacity
- **Scenario:** Student sets daily minutes or weekly questions to zero
- **Handling:** Validation error, enforce minimum values (e.g., 15 minutes, 5 questions)
- **User Message:** "Minimum study capacity required: 15 minutes/day, 5 questions/week"

#### EC-10: Question Bank Empty
- **Scenario:** No questions available for selected subject/topic
- **Handling:** Show message, suggest alternative subjects, notify admin
- **User Message:** "No questions available. Please select different subjects or contact admin."

### 6.2 Constraints

#### C-1: Technology Stack
- **Constraint:** Must use React (Next.js) for frontend, Node.js for backend, Python/FastAPI for AI
- **Rationale:** Client requirement, ensures maintainability

#### C-2: Database
- **Constraint:** Must use PostgreSQL
- **Rationale:** Client requirement, reliable for reporting and analytics

#### C-3: No Code Comments
- **Constraint:** Code must not include comments
- **Rationale:** Client requirement

#### C-4: Initial User Load
- **Constraint:** System designed for 100 concurrent users initially
- **Rationale:** Scalability requirement, can expand later

#### C-5: Platform Support
- **Constraint:** Web application + Android app (iOS not in initial scope)
- **Rationale:** Client requirement, focus on primary platforms

#### C-6: Language Support
- **Constraint:** Voice support for English, Hindi, Hinglish only
- **Rationale:** Target audience requirement, can expand later

#### C-7: Response Time
- **Constraint:** AI feedback must be < 3 seconds
- **Rationale:** Critical for user experience, competitive exam prep time-sensitive

#### C-8: Voice Accuracy
- **Constraint:** High accuracy required (90%+)
- **Rationale:** Client emphasized importance, students will leave if inaccurate

---

## 7. Out of Scope (Initial Version)

### 7.1 Features Not Included
- iOS mobile app
- Offline mode for practice sessions
- Social features (forums, peer comparison)
- Video explanations for questions
- Live tutoring or chat support
- Payment/subscription management
- Email notifications (beyond password reset)
- Push notifications
- Multi-exam support (focus on NEET PG initially)
- Question discussion threads
- Export reports to PDF/Excel

### 7.2 Technical Limitations
- OCR for scanned PDFs (text-based PDFs only)
- Real-time collaboration features
- WebSocket-based live updates (polling acceptable)
- Advanced ML model training UI (basic tuning only)

---

## 8. Success Criteria

### 8.1 Functional Success
- All core modules (Dashboard, Practice, Question Studio, Schedule, Metrics Lab, Admin Dashboard) functional
- Voice transcription accuracy: 90%+ for clear audio
- AI feedback generated in < 3 seconds
- PDF extraction accuracy: 80%+ (with admin review)
- Revision schedule generated successfully for all student profiles

### 8.2 Performance Success
- System handles 100 concurrent users without degradation
- Page load times < 2 seconds
- Database queries < 500ms
- Zero data loss during normal operations

### 8.3 User Experience Success
- Students can complete onboarding in < 5 minutes
- Practice session setup in < 1 minute
- Admin can review and approve PDF extractions efficiently
- Analytics load and display within 3 seconds

---

## 9. Dependencies

### 9.1 External Services
- **Voice API:** Survam.ai (or alternative) for Hindi/Hinglish, Google Speech-to-Text for English
- **AI Services:** Custom Python/FastAPI service for answer evaluation and PDF parsing
- **Cloud Hosting:** AWS/Azure/GCP for production deployment
- **Email Service:** For password reset (SendGrid/AWS SES)

### 9.2 Third-Party Libraries
- React/Next.js framework
- Node.js runtime and Express/Fastify
- PostgreSQL database driver
- JWT for authentication
- PDF parsing library (pdf-parse or similar)
- Voice recording library (Web Audio API for web, MediaRecorder API)

---

## 10. Risk Assessment

### 10.1 High Risk
- **Voice transcription accuracy:** May not meet 90% target initially
  - **Mitigation:** Test multiple APIs, implement fallback to text, allow re-recording
- **AI feedback latency:** May exceed 3-second target
  - **Mitigation:** Optimize AI service, use caching, implement async processing
- **PDF extraction accuracy:** May be lower than 80%
  - **Mitigation:** Admin review required, manual correction workflow

### 10.2 Medium Risk
- **Scalability:** System may struggle with 100+ concurrent users
  - **Mitigation:** Load testing, database optimization, caching strategy
- **Memory decay algorithm:** May not be accurate initially
  - **Mitigation:** Start with research-based defaults, allow tuning, collect data for improvement

### 10.3 Low Risk
- **Browser compatibility:** Minor UI issues
  - **Mitigation:** Test on major browsers, use polyfills
- **Mobile responsiveness:** Layout issues on small screens
  - **Mitigation:** Mobile-first design, responsive testing

---

## Document Version
**Version:** 1.0  
**Date:** 2024-01-24  
**Author:** Development Team  
**Status:** Draft - Pending Client Review

