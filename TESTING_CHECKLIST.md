# Testing Checklist - Milestone 3: Voice Answers

## Pre-Testing Setup

- [ ] Backend server running on port 3000
- [ ] Frontend server running on port 3001
- [ ] AI service running on port 8000
- [ ] OpenAI API key configured in AI service
- [ ] Database initialized with sample questions
- [ ] Test user accounts created (student and admin)

## Browser Compatibility Testing

### Chrome/Edge
- [ ] Voice recording starts successfully
- [ ] Audio visualization works
- [ ] Recording can be paused/resumed
- [ ] Audio playback works
- [ ] Transcription completes successfully
- [ ] All three languages work (English, Hindi, Hinglish)

### Firefox
- [ ] Voice recording starts successfully
- [ ] Audio visualization works
- [ ] Recording can be paused/resumed
- [ ] Audio playback works
- [ ] Transcription completes successfully
- [ ] All three languages work

### Safari
- [ ] Voice recording starts successfully
- [ ] Audio visualization works (if supported)
- [ ] Recording can be paused/resumed
- [ ] Audio playback works
- [ ] Transcription completes successfully
- [ ] Format conversion works if needed

### Mobile Browsers
- [ ] Chrome Mobile: All features work
- [ ] Safari Mobile: All features work
- [ ] Firefox Mobile: All features work

## Feature Testing

### Voice Recording
- [ ] Start recording button works
- [ ] Microphone permission request appears
- [ ] Recording indicator shows during recording
- [ ] Audio level visualization displays
- [ ] Pause button pauses recording
- [ ] Resume button resumes recording
- [ ] Stop button stops recording
- [ ] Recording time displays correctly
- [ ] Audio blob is created after stopping

### Audio Playback
- [ ] Play button appears after recording
- [ ] Play button starts playback
- [ ] Pause button pauses playback
- [ ] Audio plays correctly
- [ ] Playback doesn't interfere with new recording

### Language Selection
- [ ] Language dropdown appears in voice mode
- [ ] English option works
- [ ] Hindi option works
- [ ] Hinglish option works
- [ ] Selected language is highlighted
- [ ] Language persists during recording

### Transcription
- [ ] Transcribe button appears after recording
- [ ] Transcription progress message displays
- [ ] Transcription completes successfully
- [ ] Transcribed text appears in textarea
- [ ] Confidence indicator displays
- [ ] Low confidence warning appears when appropriate
- [ ] Transcription can be edited
- [ ] Edited transcription can be submitted

### Error Handling
- [ ] Microphone permission denied shows error
- [ ] No internet connection shows error
- [ ] Transcription timeout shows error
- [ ] Server error shows appropriate message
- [ ] Retry button appears on failure
- [ ] Retry works up to 3 times
- [ ] Network status banner appears when offline

### Answer Submission
- [ ] Text answers submit successfully
- [ ] Voice answers submit successfully
- [ ] Language parameter sent with voice answers
- [ ] Answer method parameter sent correctly
- [ ] Time spent is recorded correctly
- [ ] Feedback displays after submission
- [ ] Score is calculated correctly

## Language Testing

### English
- [ ] Clear English speech transcribes accurately
- [ ] Confidence score is high (>0.8)
- [ ] Medical terminology transcribed correctly
- [ ] Long answers transcribe completely

### Hindi
- [ ] Clear Hindi speech transcribes accurately
- [ ] Confidence score is acceptable (>0.6)
- [ ] Devanagari script handled correctly
- [ ] Medical terms in Hindi work

### Hinglish
- [ ] Code-switching between English and Hindi works
- [ ] Confidence score is acceptable (>0.5)
- [ ] Mixed language sentences transcribe correctly
- [ ] Common Hinglish phrases work

## Edge Cases

### Audio Quality
- [ ] Very quiet audio handled gracefully
- [ ] Very loud audio doesn't cause errors
- [ ] Background noise handled
- [ ] Very short recordings (< 1 second)
- [ ] Very long recordings (> 5 minutes)
- [ ] Silent recordings detected

### Network Conditions
- [ ] Slow connection: Transcription completes
- [ ] Intermittent connection: Error handling works
- [ ] Offline mode: Appropriate error shown
- [ ] Connection restored: Retry works

### File Sizes
- [ ] Small files (< 100KB) work
- [ ] Large files (> 5MB) are compressed
- [ ] Very large files (> 10MB) show error
- [ ] Compression maintains quality

### Browser Limitations
- [ ] Old browser shows compatibility message
- [ ] Missing features degrade gracefully
- [ ] Text mode always available as fallback
- [ ] Error messages are user-friendly

## Performance Testing

### Response Times
- [ ] Transcription completes in < 30 seconds
- [ ] Answer evaluation completes in < 10 seconds
- [ ] Audio compression completes in < 5 seconds
- [ ] Page load time acceptable

### Resource Usage
- [ ] Memory usage reasonable during recording
- [ ] CPU usage acceptable during transcription
- [ ] Network bandwidth optimized
- [ ] No memory leaks after multiple recordings

## Integration Testing

### Full Workflow
- [ ] Login → Dashboard → Practice → Voice Answer → Submit
- [ ] Multiple questions in sequence
- [ ] Switching between text and voice modes
- [ ] Switching languages between questions
- [ ] Session completion with voice answers

### Data Persistence
- [ ] Voice answers saved to database
- [ ] Language parameter stored correctly
- [ ] Answer method stored correctly
- [ ] Attempts linked to sessions correctly
- [ ] Mastery updated based on voice answers

## Security Testing

### Input Validation
- [ ] Malformed audio files rejected
- [ ] Invalid language values rejected
- [ ] SQL injection attempts prevented
- [ ] XSS attempts in transcription prevented

### Authentication
- [ ] Unauthenticated users cannot transcribe
- [ ] Unauthenticated users cannot submit answers
- [ ] Token expiration handled correctly
- [ ] Session timeout works

## Accessibility Testing

### Keyboard Navigation
- [ ] All buttons accessible via keyboard
- [ ] Tab order is logical
- [ ] Enter/Space activate buttons
- [ ] Focus indicators visible

### Screen Readers
- [ ] Recording status announced
- [ ] Error messages announced
- [ ] Transcription status announced
- [ ] Language selection announced

### Visual Indicators
- [ ] Color not sole indicator
- [ ] Icons have text labels
- [ ] Status messages are clear
- [ ] Error messages are descriptive

## Regression Testing

### Existing Features
- [ ] Text answers still work
- [ ] Dashboard still loads
- [ ] Practice sessions still work
- [ ] Admin panel still works
- [ ] PDF upload still works

## Production Readiness

### Documentation
- [ ] README updated
- [ ] VOICE_FEATURES.md complete
- [ ] API documentation updated
- [ ] Setup instructions clear

### Error Messages
- [ ] All error messages user-friendly
- [ ] Technical details hidden in production
- [ ] Recovery suggestions provided
- [ ] Support contact information available

### Monitoring
- [ ] Error logging implemented
- [ ] Performance metrics tracked
- [ ] User analytics ready
- [ ] Health checks working

## Sign-off

- [ ] All critical tests passed
- [ ] No blocking bugs found
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Ready for production deployment

---

## Known Issues & Limitations

1. **Safari**: May require format conversion for some audio types
2. **Mobile**: Audio visualization may be limited on some devices
3. **Network**: Very slow connections may timeout
4. **Browser**: Older browsers (< 2 years) may have limited support

## Test Environment

- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:3001
- **AI Service**: http://localhost:8000
- **Database**: SQLite (backend/database.sqlite)

## Test Accounts

- **Student**: student@test.com / password123
- **Admin**: admin@test.com / admin123

