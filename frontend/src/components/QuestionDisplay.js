'use client';

import { useState, useRef, useEffect } from 'react';
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

  const handleTranscribe = async () => {
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
  };

  const handleSubmit = async (e) => {
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
  };

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
            <VoiceRecorder
              onRecordingComplete={handleRecordingComplete}
              onError={(error) => setTranscriptionError(error)}
            />
            
            {audioBlob && (
              <div className={styles.transcriptionSection}>
                <button
                  type="button"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  className={styles.transcribeButton}
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

