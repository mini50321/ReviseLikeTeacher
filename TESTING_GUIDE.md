# Testing Guide - ReviseLikeTeacher

This guide will help you test all the implemented features of the application.

## Prerequisites

1. **Start the Backend Server:**
   ```bash
   cd backend
   npm install  # If not already done
   npm start
   ```
   Backend should run on `http://localhost:3000`

2. **Start the Frontend Server:**
   ```bash
   cd frontend
   npm install  # If not already done
   npm run dev
   ```
   Frontend should run on `http://localhost:3001`

3. **Open the Application:**
   Navigate to `http://localhost:3001` in your browser

---

## Feature Testing Guide

### 1. User Authentication

#### 1.1 User Registration
1. Navigate to `http://localhost:3001/signup`
2. Fill in the registration form:
   - Email: `test@example.com`
   - Password: `password123` (minimum 8 characters)
   - Confirm Password: `password123`
3. Click "Sign Up"
4. **Expected:** You should be automatically logged in and redirected to `/dashboard`

#### 1.2 User Login
1. Navigate to `http://localhost:3001/login`
2. Enter credentials:
   - Email: `test@example.com`
   - Password: `password123`
3. Click "Log In"
4. **Expected:** Redirected to `/dashboard`

#### 1.3 Password Reset
1. Navigate to `http://localhost:3001/reset-pw`
2. Enter your email address
3. Click "Send Reset Link"
4. **Expected:** Success message (Note: Email functionality not implemented yet, but API endpoint works)

---

### 2. Student Onboarding Flow

#### 2.1 Complete Onboarding
1. After registration/login, if onboarding is incomplete, you'll see "Complete Onboarding" card
2. Click "Go to Onboarding" or navigate to `/onboarding`
3. Complete all 6 steps:

   **Step 1: Select Target Exam**
   - Choose: NEET PG, AIIMS, or Other
   - Click "Next"

   **Step 2: Select Exam Date**
   - Pick a future date using the date picker
   - Click "Next"

   **Step 3: Select Target Score Band**
   - Choose: 600-650, 650-700, 700-750, or 750+
   - Click "Next"

   **Step 4: Select Subjects**
   - Select one or more subjects (Anatomy, Physiology, etc.)
   - Click "Next"

   **Step 5: Daily Study Minutes**
   - Enter a number between 15-480 (e.g., 60)
   - Click "Next"

   **Step 6: Weekly Question Target**
   - Enter a number between 5-500 (e.g., 50)
   - Click "Complete Onboarding"

4. **Expected:** Redirected to `/dashboard` with your profile data displayed

---

### 3. Dashboard Features

#### 3.1 View Dashboard
1. Navigate to `/dashboard`
2. **Expected to see:**
   - **Target Exam Card:** Shows your exam details (exam type, date, target score, study capacity)
   - **Readiness Status Card:** Shows readiness percentage (initially 0%) and status (OFF TRACK)
   - **Quick Start Practice:** Three buttons for different practice modes
   - **Today's Revision Plan:** Shows today's schedule (if available)
   - **7-Day Schedule:** Shows upcoming week's schedule
   - **Topic Mastery:** Shows mastery levels for topics
   - **Recent Sessions:** Shows your practice session history

#### 3.2 Quick Start Practice
1. On the dashboard, click any of the Quick Start buttons:
   - "Balanced Mix"
   - "More Clinical"
   - "Rapid-Fire"
2. **Expected:** Opens practice session setup modal

---

### 4. Practice Sessions

#### 4.1 Start a Practice Session
1. Navigate to `/practice` or click a Quick Start button
2. **Practice Session Setup Modal appears:**
   - **Number of Questions:** Enter 5-50 (default: 10)
   - **Mode:** Select one:
     - Balanced Mix
     - More Clinical
     - Rapid-Fire
   - **Subjects (optional):** Select specific subjects or leave empty for all
   - Click "Start Session"

3. **Expected:** Practice session starts with first question

#### 4.2 Answer Questions
1. Read the question displayed
2. Enter your answer in the text area
3. Click "Submit Answer"
4. **Expected:** 
   - AI feedback is displayed (Note: AI service may return mock data if not running)
   - Mastery impact shown
   - Option to rate the feedback
   - "Next Question" or "End Session" button appears

#### 4.3 Complete Session
1. Answer all questions in the session
2. After the last question, click "End Session"
3. **Expected:** 
   - Session summary displayed
   - Redirected back to dashboard
   - Session appears in "Recent Sessions"

---

### 5. Schedule & Revision Plan

#### 5.1 View Schedule
1. Navigate to `/schedule`
2. **Expected to see:**
   - List of scheduled revision days
   - Each day shows:
     - Date
     - Number of questions
     - Subjects
     - Status (scheduled, complete, partial, skipped)
   - Today's schedule highlighted

#### 5.2 View Analytics
1. Navigate to `/metrics-lab` or click "Analytics" in header
2. **Expected to see:**
   - **Exam Readiness:** Current readiness percentage and status
   - **Topic Mastery:** List of topics with mastery levels
   - **Recent Sessions:** Summary of practice sessions
   - **Study Goals:** Your daily/weekly targets

---

### 6. Admin Features

#### 6.1 Access Admin Dashboard
1. **Note:** You need an admin account. To create one:
   - Register with email containing "admin" or manually update database
   - Or check if there's a default admin account
2. Navigate to `/admin/dashboard`
3. **Expected:** Admin dashboard with statistics

#### 6.2 Question Studio (Manage Questions)
1. Navigate to `/admin/question-studio`
2. **Expected to see:**
   - List of all questions
   - Filter options (subject, topic, type, difficulty, status)
   - "Create Question" button

#### 6.3 Create a Question
1. Click "Create Question" button
2. Fill in the form:
   - **Question Stem:** Enter the question text
   - **Subject:** Select from dropdown
   - **Topic:** Enter topic name
   - **Question Type:** Select (MCQ, Short Answer, Long Answer)
   - **Difficulty:** Select (Easy, Medium, Hard)
   - **Answer:** Enter the correct answer
   - **Key Points:** Enter key points (comma-separated)
   - **Tags:** Enter tags (optional)
3. Click "Create"
4. **Expected:** Question created and appears in the list

#### 6.4 Edit/Delete Question
1. In question list, find a question
2. Click "Edit" to modify
3. Click "Delete" to remove
4. **Expected:** Changes saved or question removed

#### 6.5 PDF Upload
1. Navigate to `/admin/pdf-upload`
2. **Expected to see:**
   - PDF list on the left
   - Extractions review on the right

#### 6.6 Upload a PDF
1. Click "Upload PDF" button
2. Select a PDF file
3. **Expected:** 
   - PDF uploaded and appears in the list
   - Status shows "uploaded" or "processing"
   - (Note: AI extraction requires AI service to be running)

#### 6.7 Review Extractions
1. After PDF is processed, extracted questions appear
2. Click "Review" on an extraction
3. **Expected:** 
   - Modal opens showing original extraction
   - You can edit/correct the extraction
   - Options to Accept or Reject

---

## Testing Checklist

### Authentication ✅
- [ ] User can register new account
- [ ] User is automatically logged in after registration
- [ ] User can log in with existing credentials
- [ ] User can log out
- [ ] Protected routes redirect to login if not authenticated

### Onboarding ✅
- [ ] All 6 onboarding steps work correctly
- [ ] Form validation works (required fields, number ranges)
- [ ] Progress bar updates correctly
- [ ] Data is saved after completion
- [ ] Dashboard shows profile data after onboarding

### Dashboard ✅
- [ ] Dashboard loads with user data
- [ ] All cards display correctly
- [ ] Quick Start buttons work
- [ ] Readiness status displays (0% initially)
- [ ] Navigation links work

### Practice Sessions ✅
- [ ] Session setup modal opens
- [ ] Can configure session parameters
- [ ] Session starts with questions
- [ ] Can submit answers
- [ ] Feedback is displayed (may be mock if AI service not running)
- [ ] Can navigate between questions
- [ ] Session completion works

### Schedule & Analytics ✅
- [ ] Schedule page loads
- [ ] Shows scheduled revisions
- [ ] Analytics page displays metrics
- [ ] Data updates after practice sessions

### Admin Features ✅
- [ ] Admin dashboard accessible
- [ ] Question Studio loads
- [ ] Can create questions
- [ ] Can edit questions
- [ ] Can delete questions
- [ ] Filters work
- [ ] PDF upload page accessible
- [ ] Can upload PDFs (file upload works)

---

## Known Limitations

1. **AI Service:** The AI service (Python FastAPI) is not yet implemented. Some features may return mock data or require the AI service to be running for full functionality.

2. **Email Service:** Password reset sends a request but doesn't actually send emails yet.

3. **Voice Answering:** Voice input functionality requires the AI service to be running.

4. **PDF Extraction:** PDF parsing and question extraction requires the AI service.

5. **Revision Schedule Generation:** Automatic schedule generation may require additional logic or AI service.

---

## Troubleshooting

### Backend won't start
- Check if port 3000 is already in use
- Ensure all dependencies are installed: `cd backend && npm install`
- Check for database errors in console

### Frontend won't start
- Check if port 3001 is already in use
- Ensure all dependencies are installed: `cd frontend && npm install`
- Check browser console for errors

### Database issues
- Delete `backend/database.sqlite` and restart backend (database will be recreated)
- Check backend console for SQL errors

### CORS errors
- Ensure backend CORS is configured to allow `http://localhost:3001`
- Check backend console for CORS-related errors

### Authentication issues
- Clear browser localStorage
- Try logging in again
- Check backend console for JWT errors

---

## Next Steps for Full Testing

To test AI-powered features, you'll need to:
1. Set up the Python AI service (FastAPI)
2. Configure AI service URL in backend `.env`
3. Start the AI service on port 8000
4. Test voice answering, answer evaluation, and PDF extraction

---

## Quick Test Scenarios

### Scenario 1: New User Journey
1. Register → Auto-login → Complete Onboarding → View Dashboard → Start Practice Session

### Scenario 2: Returning User
1. Login → View Dashboard → Check Schedule → View Analytics → Start Practice

### Scenario 3: Admin Workflow
1. Login as admin → View Dashboard → Create Questions → Upload PDF → Review Extractions

---

Happy Testing! 🚀

