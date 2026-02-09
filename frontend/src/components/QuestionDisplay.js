'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceRecorder from './VoiceRecorder';
import LanguageSelector from './LanguageSelector';
import { voiceAPI } from '../lib/api';
import styles from './QuestionDisplay.module.css';

export default function QuestionDisplay({ question, questionNumber, totalQuestions, onSubmit, loading }) {
  const [answerText, setAnswerText] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const [answerMethod, setAnswerMethod] = useState('text');
  const [language, setLanguage] = useState('english');
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const startTimeRef = useRef(Date.now());
  const voiceRecorderRef = useRef(null);
  const startRecordingButtonRef = useRef(null);
  const stopRecordingButtonRef = useRef(null);
  const transcribeButtonRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleRecordingComplete = (blob) => {
    setAudioBlob(blob);
    setTranscription('');
    setTranscriptionError('');
  };

  const handleTranscribe = useCallback(async () => {
    if (!audioBlob) {
      setTranscriptionError('No recording available');
      return;
    }

    setTranscribing(true);
    setTranscriptionError('');

    try {
      const result = await voiceAPI.transcribe(audioBlob, language);
      setTranscription(result.transcription || '');
      setAnswerText(result.transcription || '');
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscriptionError(error.message || 'Transcription failed. Please try again.');
    } finally {
      setTranscribing(false);
    }
  }, [audioBlob, language]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (answerMethod === 'voice') {
      if (!audioBlob) {
        alert('Please record an answer first');
        return;
      }
      
      if (!transcription.trim()) {
        await handleTranscribe();
        if (!transcription.trim()) {
          alert('Please wait for transcription to complete');
          return;
        }
      }
    } else {
      if (!answerText.trim()) {
        alert('Please enter an answer');
        return;
      }
    }

    const finalAnswer = answerMethod === 'voice' ? transcription : answerText;
    onSubmit(finalAnswer.trim(), timeSpent, answerMethod, answerMethod === 'voice' ? language : null);
  }, [answerMethod, audioBlob, transcription, answerText, timeSpent, language, onSubmit, handleTranscribe]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading) return;
      if (e.target.matches('textarea, input') && e.key !== 'Enter') return;

      if (answerMethod === 'voice') {
        if (e.key === ' ' && !e.target.matches('textarea, input')) {
          e.preventDefault();
          if (voiceRecorderRef.current) {
            if (voiceRecorderRef.current.isRecording) {
              voiceRecorderRef.current.stopRecording();
            } else if (!voiceRecorderRef.current.hasRecording) {
              voiceRecorderRef.current.startRecording();
            } else if (audioBlob && !transcription && !transcribing) {
              if (transcribeButtonRef.current) {
                transcribeButtonRef.current.click();
              }
            }
          }
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 't' && audioBlob && !transcribing) {
          e.preventDefault();
          if (transcribeButtonRef.current) {
            transcribeButtonRef.current.click();
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && answerText.trim()) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [answerMethod, audioBlob, transcription, transcribing, answerText, loading, handleSubmit]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.questionNumber}>
          Question {questionNumber} of {totalQuestions}
        </span>
      </div>

      <div className={styles.questionCard}>
        <h2 className={styles.questionText}>{question.question_text}</h2>
        
        {question.subject && (
          <div className={styles.meta}>
            <span className={styles.subject}>{question.subject}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className={styles.answerForm}>
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeButton} ${answerMethod === 'text' ? styles.active : ''}`}
            onClick={() => setAnswerMethod('text')}
          >
            Text Answer
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${answerMethod === 'voice' ? styles.active : ''}`}
            onClick={() => setAnswerMethod('voice')}
          >
            Voice Answer
          </button>
        </div>

        {answerMethod === 'text' ? (
          <div className={styles.textAnswer}>
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer here..."
              className={styles.textarea}
              rows={6}
              disabled={loading}
            />
          </div>
        ) : (
          <div className={styles.voiceAnswer}>
            <LanguageSelector value={language} onChange={setLanguage} />
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
              Keyboard shortcuts: <strong>Space</strong> to start/stop recording, <strong>Ctrl+T</strong> to transcribe
            </div>
            <VoiceRecorder
              ref={voiceRecorderRef}
              onRecordingComplete={handleRecordingComplete}
              onError={(error) => setTranscriptionError(error)}
            />
            
            {audioBlob && (
              <div className={styles.transcriptionSection}>
                <button
                  ref={transcribeButtonRef}
                  type="button"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  className={styles.transcribeButton}
                  title="Press Ctrl+T (or Cmd+T on Mac) to transcribe"
                >
                  {transcribing ? 'Transcribing...' : 'Transcribe Audio'}
                </button>
                
                {transcriptionError && (
                  <div className={styles.error}>{transcriptionError}</div>
                )}
                
                {transcription && (
                  <div className={styles.transcriptionPreview}>
                    <label>Transcription Preview:</label>
                    <textarea
                      value={transcription}
                      onChange={(e) => {
                        setTranscription(e.target.value);
                        setAnswerText(e.target.value);
                      }}
                      className={styles.transcriptionText}
                      rows={4}
                      placeholder="Transcription will appear here..."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading || !answerText.trim()}
          >
            {loading ? 'Submitting...' : 'Submit Answer'}
          </button>
        </div>
      </form>
    </div>
  );
}

