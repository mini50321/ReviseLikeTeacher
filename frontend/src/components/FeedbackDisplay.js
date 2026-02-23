'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './FeedbackDisplay.module.css';

export default function FeedbackDisplay({ attempt, onNext, onEnd, isLastQuestion }) {
  const [audioState, setAudioState] = useState('idle');
  const [audioUrl, setAudioUrl] = useState(null);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
  const audioRef = useRef(null);
  const fetchedTextRef = useRef(null);
  const countdownRef = useRef(null);

  const score = attempt?.score || 0;
  const feedbackData = attempt?.feedback || {};
  const teacherResponse = attempt?.teacher_response || null;
  const isPassing = score >= 70;
  const isMCQ = feedbackData.is_mcq === true;

  const fetchAudio = useCallback(async (text) => {
    if (!text) return;
    setAudioState('loading');
    try {
      const audioBlob = await voiceAPI.speak(text);
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setAudioState('ready');
    } catch (error) {
      console.error('TTS fetch error:', error);
      setAudioState('error');
      setAutoAdvanceCountdown(5);
    }
  }, []);

  useEffect(() => {
    if (teacherResponse && fetchedTextRef.current !== teacherResponse) {
      fetchedTextRef.current = teacherResponse;
      fetchAudio(teacherResponse);
    } else if (!teacherResponse && attempt) {
      setAutoAdvanceCountdown(5);
    }
  }, [teacherResponse, fetchAudio, attempt]);

  useEffect(() => {
    if (!audioUrl || audioState !== 'ready') return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setAudioState('playing');
    audio.onended = () => {
      setAudioState('finished');
      setAutoAdvanceCountdown(5);
    };
    audio.onerror = () => setAudioState('error');

    audio.play().catch(() => {
      setAudioState('finished');
      setAutoAdvanceCountdown(5);
    });

    return () => {
      audio.pause();
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (autoAdvanceCountdown === null) return;

    if (autoAdvanceCountdown <= 0) {
      if (isLastQuestion) {
        onEnd();
      } else {
        onNext();
      }
      return;
    }

    countdownRef.current = setTimeout(() => {
      setAutoAdvanceCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(countdownRef.current);
  }, [autoAdvanceCountdown, isLastQuestion, onNext, onEnd]);

  const cancelAutoAdvance = () => {
    setAutoAdvanceCountdown(null);
    if (countdownRef.current) clearTimeout(countdownRef.current);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (audioState === 'playing') {
      audioRef.current.pause();
      setAudioState('finished');
    } else if (audioState === 'finished' || audioState === 'ready') {
      cancelAutoAdvance();
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const retryAudio = () => {
    fetchedTextRef.current = null;
    if (teacherResponse) {
      fetchedTextRef.current = teacherResponse;
      fetchAudio(teacherResponse);
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
                {(audioState === 'ready' || audioState === 'idle' || audioState === 'finished') && (
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
                {audioState === 'loading' && 'Teacher is preparing...'}
                {audioState === 'playing' && 'Teacher is speaking...'}
                {audioState === 'ready' && 'Click play to listen'}
                {audioState === 'finished' && 'Teacher finished speaking'}
                {audioState === 'idle' && 'Loading voice...'}
                {audioState === 'error' && 'Voice unavailable'}
              </div>
              <div className={styles.voiceControls}>
                {(audioState === 'finished' || audioState === 'playing') && (
                  <button onClick={togglePlayback} className={styles.playButton}>
                    {audioState === 'playing' ? '⏸ Pause' : '▶ Replay'}
                  </button>
                )}
                {audioState === 'ready' && (
                  <button onClick={togglePlayback} className={styles.playButton}>
                    ▶ Play
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

        {autoAdvanceCountdown !== null && autoAdvanceCountdown > 0 && (
          <div className={styles.autoAdvance}>
            <span className={styles.autoAdvanceText}>
              {isLastQuestion ? 'Ending session' : 'Next question'} in {autoAdvanceCountdown}s...
            </span>
            <button onClick={cancelAutoAdvance} className={styles.autoAdvanceCancel}>
              Cancel
            </button>
          </div>
        )}

        <div className={styles.actions}>
          {isLastQuestion ? (
            <button onClick={() => { cancelAutoAdvance(); onEnd(); }} className={styles.endButton}>
              End Session
            </button>
          ) : (
            <button onClick={() => { cancelAutoAdvance(); onNext(); }} className={styles.nextButton}>
              Next Question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
