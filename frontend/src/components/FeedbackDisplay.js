'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './FeedbackDisplay.module.css';

export default function FeedbackDisplay({ attempt, onNext, onEnd, isLastQuestion }) {
  const [audioState, setAudioState] = useState('idle');
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const hasFetchedRef = useRef(false);

  const score = attempt?.score || 0;
  const feedbackData = attempt?.feedback || {};
  const teacherResponse = attempt?.teacher_response || null;
  const isPassing = score >= 70;
  const isMCQ = feedbackData.is_mcq === true;

  const fetchAndPlayAudio = useCallback(async (text) => {
    if (!text || audioState === 'loading') return;

    setAudioState('loading');
    try {
      const audioBlob = await voiceAPI.speak(text);
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setAudioState('ready');

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => setAudioState('playing');
      audio.onended = () => setAudioState('ready');
      audio.onerror = () => setAudioState('error');

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setAudioState('error');
    }
  }, []);

  useEffect(() => {
    if (teacherResponse && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchAndPlayAudio(teacherResponse);
    }
  }, [teacherResponse, fetchAndPlayAudio]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      hasFetchedRef.current = false;
    };
  }, []);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (audioState === 'playing') {
      audioRef.current.pause();
      setAudioState('ready');
    } else if (audioState === 'ready') {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const retryAudio = () => {
    hasFetchedRef.current = false;
    if (teacherResponse) {
      fetchAndPlayAudio(teacherResponse);
    }
  };

  if (!attempt) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Loading feedback...</p>
        </div>
      </div>
    );
  }

  const formatFeedback = (feedback) => {
    if (typeof feedback === 'string') return feedback;

    if (typeof feedback === 'object' && feedback !== null) {
      const parts = [];
      if (feedback.strengths) parts.push(`Strengths: ${feedback.strengths}`);
      if (feedback.improvements) parts.push(`Areas for Improvement: ${feedback.improvements}`);
      if (feedback.model_explanation) parts.push(`Explanation: ${feedback.model_explanation}`);
      if (parts.length === 0) return 'No feedback available.';
      return parts.join('\n\n');
    }

    return 'No feedback available.';
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isMCQ ? (feedbackData.is_correct ? 'Correct!' : 'Incorrect') : 'Your Answer Feedback'}
          </h2>
          <div className={`${styles.scoreBadge} ${isPassing ? styles.passing : styles.failing}`}>
            {isMCQ ? (feedbackData.is_correct ? '✓ Correct' : '✗ Wrong') : `Score: ${score}%`}
          </div>
        </div>

        {teacherResponse && (
          <div className={styles.voiceFeedback}>
            <div className={styles.voiceHeader}>
              <div className={styles.voiceIcon}>
                {audioState === 'loading' && (
                  <div className={styles.loadingDots}>
                    <span></span><span></span><span></span>
                  </div>
                )}
                {audioState === 'playing' && (
                  <div className={styles.soundWave}>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                )}
                {(audioState === 'ready' || audioState === 'idle') && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
                {audioState === 'error' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                )}
              </div>
              <div className={styles.voiceLabel}>
                {audioState === 'loading' && 'Teacher is speaking...'}
                {audioState === 'playing' && 'Listening to teacher...'}
                {audioState === 'ready' && 'Teacher feedback ready'}
                {audioState === 'idle' && 'Loading voice...'}
                {audioState === 'error' && 'Voice unavailable'}
              </div>
              <div className={styles.voiceControls}>
                {(audioState === 'ready' || audioState === 'playing') && (
                  <button onClick={togglePlayback} className={styles.playButton}>
                    {audioState === 'playing' ? '⏸ Pause' : '▶ Replay'}
                  </button>
                )}
                {audioState === 'error' && (
                  <button onClick={retryAudio} className={styles.retryButton}>
                    ↻ Retry
                  </button>
                )}
              </div>
            </div>
            <div className={styles.teacherText}>{teacherResponse}</div>
          </div>
        )}

        {isMCQ ? (
          <div className={styles.feedbackSection}>
            <div className={styles.mcqResult}>
              <div className={`${styles.mcqOptionResult} ${feedbackData.is_correct ? styles.mcqCorrectOption : styles.mcqWrongOption}`}>
                <span className={styles.mcqOptionLabel}>Your Answer</span>
                <span className={styles.mcqOptionValue}>
                  {feedbackData.selected_option}) {feedbackData.selected_text}
                </span>
              </div>

              {!feedbackData.is_correct && (
                <div className={`${styles.mcqOptionResult} ${styles.mcqCorrectOption}`}>
                  <span className={styles.mcqOptionLabel}>Correct Answer</span>
                  <span className={styles.mcqOptionValue}>
                    {feedbackData.correct_option}) {feedbackData.correct_text}
                  </span>
                </div>
              )}

              {feedbackData.model_explanation && feedbackData.model_explanation !== 'Well done!' && (
                <div className={styles.mcqExplanation}>
                  <h3 className={styles.feedbackTitle}>Explanation</h3>
                  <div className={styles.feedbackText}>{feedbackData.model_explanation}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.feedbackSection}>
            <h3 className={styles.feedbackTitle}>Feedback</h3>
            <div className={styles.feedbackText}>{formatFeedback(feedbackData)}</div>
          </div>
        )}

        <div className={styles.actions}>
          {isLastQuestion ? (
            <button onClick={onEnd} className={styles.endButton}>
              End Session
            </button>
          ) : (
            <button onClick={onNext} className={styles.nextButton}>
              Next Question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
