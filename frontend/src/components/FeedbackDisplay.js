'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api, { voiceAPI } from '../lib/api';
import VoiceChatInput from './VoiceChatInput';
import ChatConversation from './ChatConversation';
import SequentialTextReveal from './SequentialTextReveal';
import styles from './FeedbackDisplay.module.css';

export default function FeedbackDisplay({ attempt, question, onNext, onEnd, isLastQuestion }) {
  const showVoiceTelemetry = process.env.NEXT_PUBLIC_SHOW_VOICE_TELEMETRY === 'true';
  const [audioState, setAudioState] = useState('idle');
  const [audioUrl, setAudioUrl] = useState(null);
  const [quickCheckAnswer, setQuickCheckAnswer] = useState('');
  const [quickCheckSubmitting, setQuickCheckSubmitting] = useState(false);
  const [quickCheckResult, setQuickCheckResult] = useState(null);
  const [quickCheckError, setQuickCheckError] = useState('');
  const [quickCheckLanguage, setQuickCheckLanguage] = useState('english');
  const [quickCheckVoiceError, setQuickCheckVoiceError] = useState('');
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResult, setCoachResult] = useState(null);
  const [coachError, setCoachError] = useState('');
  const [coachHistory, setCoachHistory] = useState([]);
  const [coachLanguage, setCoachLanguage] = useState('english');
  const [coachAudioBlob, setCoachAudioBlob] = useState(null);
  const [coachTranscribing, setCoachTranscribing] = useState(false);
  const [coachVoiceError, setCoachVoiceError] = useState('');
  const [coachTranscriptReady, setCoachTranscriptReady] = useState(false);
  const [coachReplyAudioState, setCoachReplyAudioState] = useState('idle');
  const [coachReplyAudioUrl, setCoachReplyAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const fetchedTextRef = useRef(null);
  const coachReplyAudioRef = useRef(null);
  const coachReplyFetchedTextRef = useRef(null);

  const score = attempt?.score || 0;
  const feedbackData = attempt?.feedback || {};
  const teacherResponse = attempt?.teacher_response || null;
  const isPassing = score >= 70;
  const isMCQ = feedbackData.is_mcq === true;

  const [quickCheckAttempts, setQuickCheckAttempts] = useState(0);
  const [showFullExplanation, setShowFullExplanation] = useState(false);

  let questionKeyPoints = [];
  if (question?.key_points) {
    try {
      const raw = Array.isArray(question.key_points)
        ? question.key_points
        : JSON.parse(question.key_points);
      if (Array.isArray(raw)) {
        questionKeyPoints = raw
          .map((p) => (typeof p === 'string' ? p : String(p)))
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }
    } catch (e) {
      questionKeyPoints = [];
    }
  }

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
    }
  }, []);

  useEffect(() => {
    if (teacherResponse && fetchedTextRef.current !== teacherResponse) {
      fetchedTextRef.current = teacherResponse;
      fetchAudio(teacherResponse);
    }
  }, [teacherResponse, fetchAudio, attempt]);

  useEffect(() => {
    setQuickCheckAnswer('');
    setQuickCheckResult(null);
    setQuickCheckError('');
    setQuickCheckSubmitting(false);
    setQuickCheckLanguage('english');
    setQuickCheckVoiceError('');
    setCoachInput('');
    setCoachResult(null);
    setCoachError('');
    setCoachLoading(false);
    setCoachHistory([]);
    setCoachAudioBlob(null);
    setCoachLanguage('english');
    setCoachTranscribing(false);
    setCoachVoiceError('');
    setCoachTranscriptReady(false);
    setCoachReplyAudioState('idle');
    setCoachReplyAudioUrl(null);
    coachReplyFetchedTextRef.current = null;
    setQuickCheckAttempts(0);
    setShowFullExplanation(score >= 90);
  }, [attempt?.id]);

  useEffect(() => {
    if (!audioUrl || audioState !== 'ready') return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onplay = () => setAudioState('playing');
    audio.onended = () => {
      setAudioState('finished');
    };
    audio.onerror = () => setAudioState('error');

    audio.play().catch(() => {
      setAudioState('finished');
    });

    return () => {
      audio.pause();
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (audioState === 'playing') {
      audioRef.current.pause();
      setAudioState('finished');
    } else if (audioState === 'finished' || audioState === 'ready') {
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

  const coachChatMessages = [
    ...(teacherResponse ? [{ id: 't0', role: 'assistant', content: teacherResponse }] : []),
    ...coachHistory.flatMap((h, i) => [
      { id: `cu${i}`, role: 'user', content: h.student },
      { id: `ca${i}`, role: 'assistant', content: h.teacher }
    ])
  ];

  const handleCoachTranscript = async (transcript) => {
    if (!transcript?.trim()) return;
    setCoachLoading(true);
    setCoachError('');
    try {
      const contextSubject = question?.subject || attempt?.question_context?.subject || null;
      const contextTopic = question?.topic || attempt?.question_context?.topic || attempt?.mastery_impact?.topic || null;
      const contextStem = question?.stem || question?.question_text || attempt?.question_context?.stem || null;

      const response = await voiceAPI.coachTurn({
        transcript: transcript.trim(),
        subject: contextSubject,
        topic: contextTopic,
        questionStem: contextStem,
        studentAnswer: attempt?.answer_text || null,
        topK: 3,
        latencyMode: 'fast',
        conversationHistory: coachHistory
      });
      setCoachResult(response);
      setCoachHistory((prev) => [
        ...prev.slice(-7),
        { student: transcript.trim(), teacher: response?.teacher_response || '' }
      ]);
    } catch (error) {
      setCoachError(error.response?.data?.error || error.message || 'Failed to get coaching response.');
    } finally {
      setCoachLoading(false);
    }
  };

  const submitQuickCheck = async (textAnswer) => {
    const text = ((textAnswer ?? quickCheckAnswer) || '').trim();
    if (!attempt?.id || !text) return;
    setQuickCheckSubmitting(true);
    setQuickCheckError('');
    try {
      const response = await api.post(`/attempts/${attempt.id}/quick-check`, {
        quick_check_answer: text,
        teacher_response: teacherResponse || ''
      });
      const data = response.data;
      setQuickCheckResult(data);

      const level = (data?.understanding_level || '').toLowerCase();
      if (level === 'strong') {
        setShowFullExplanation(true);
      } else if (level === 'partial' || level === 'weak') {
        setQuickCheckAttempts(prev => {
          const next = prev + 1;
          if (next >= 3) {
            setShowFullExplanation(true);
          }
          return next;
        });
      }
    } catch (error) {
      setQuickCheckError(error.response?.data?.error || 'Failed to submit quick check response.');
    } finally {
      setQuickCheckSubmitting(false);
    }
  };

  const submitCoachTurn = async () => {
    if (!coachInput.trim()) return;
    setCoachLoading(true);
    setCoachError('');
    try {
      const contextSubject = question?.subject || attempt?.question_context?.subject || null;
      const contextTopic = question?.topic || attempt?.question_context?.topic || attempt?.mastery_impact?.topic || null;
      const contextStem = question?.stem || question?.question_text || attempt?.question_context?.stem || null;

      const response = await voiceAPI.coachTurn({
        transcript: coachInput.trim(),
        subject: contextSubject,
        topic: contextTopic,
        questionStem: contextStem,
        studentAnswer: attempt?.answer_text || null,
        topK: coachTranscriptReady ? 3 : 4,
        latencyMode: coachTranscriptReady ? 'fast' : 'balanced',
        conversationHistory: coachHistory
      });
      setCoachResult(response);
      setCoachHistory((prev) => [
        ...prev.slice(-7),
        { student: coachInput.trim(), teacher: response?.teacher_response || '' }
      ]);
    } catch (error) {
      setCoachError(error.response?.data?.error || error.message || 'Failed to get coaching response.');
    } finally {
      setCoachLoading(false);
    }
  };

  const submitCoachVoiceTurn = async () => {
    if (!coachAudioBlob) {
      setCoachVoiceError('Please record a voice follow-up first.');
      return;
    }

    setCoachTranscribing(true);
    setCoachVoiceError('');

    try {
      const transcriptResult = await voiceAPI.transcribe(coachAudioBlob, coachLanguage);
      const transcript = (transcriptResult?.transcription || '').trim();
      if (!transcript) {
        throw new Error('No speech detected. Please try recording again.');
      }
      setCoachInput(transcript);
      setCoachTranscriptReady(true);
    } catch (error) {
      setCoachVoiceError(error.response?.data?.error || error.message || 'Voice follow-up failed.');
    } finally {
      setCoachTranscribing(false);
    }
  };

  const fetchCoachReplyAudio = useCallback(async (text) => {
    if (!text) return;
    setCoachReplyAudioState('loading');
    try {
      const audioBlob = await voiceAPI.speak(text);
      const url = URL.createObjectURL(audioBlob);
      setCoachReplyAudioUrl(url);
      setCoachReplyAudioState('ready');
    } catch (error) {
      setCoachReplyAudioState('error');
    }
  }, []);

  useEffect(() => {
    const coachText = coachResult?.teacher_response || '';
    if (coachText && coachReplyFetchedTextRef.current !== coachText) {
      coachReplyFetchedTextRef.current = coachText;
      fetchCoachReplyAudio(coachText);
    }
  }, [coachResult?.teacher_response, fetchCoachReplyAudio]);

  useEffect(() => {
    if (!coachReplyAudioUrl || coachReplyAudioState !== 'ready') return;

    const audio = new Audio(coachReplyAudioUrl);
    coachReplyAudioRef.current = audio;

    audio.onplay = () => setCoachReplyAudioState('playing');
    audio.onended = () => setCoachReplyAudioState('finished');
    audio.onerror = () => setCoachReplyAudioState('error');

    audio.play().catch(() => setCoachReplyAudioState('finished'));

    return () => {
      audio.pause();
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    };
  }, [coachReplyAudioUrl, coachReplyAudioState]);

  const toggleCoachReplyPlayback = () => {
    if (!coachReplyAudioRef.current) return;
    if (coachReplyAudioState === 'playing') {
      coachReplyAudioRef.current.pause();
      setCoachReplyAudioState('finished');
    } else if (coachReplyAudioState === 'finished' || coachReplyAudioState === 'ready') {
      coachReplyAudioRef.current.currentTime = 0;
      coachReplyAudioRef.current.play().catch(() => {});
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

  const formatFeedback = (feedback, includeExplanation = true) => {
    if (typeof feedback === 'string') return feedback;

    if (typeof feedback === 'object' && feedback !== null) {
      const parts = [];
      if (feedback.strengths) parts.push(`Strengths: ${feedback.strengths}`);
      if (feedback.improvements) parts.push(`Areas for Improvement: ${feedback.improvements}`);
      if (includeExplanation && feedback.model_explanation) {
        parts.push(`Explanation: ${feedback.model_explanation}`);
      }
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
            <SequentialTextReveal
              text={teacherResponse}
              audioRef={audioRef}
              audioState={audioState}
              className={styles.teacherText}
            />
            <div className={styles.quickCheckBox}>
              <div className={styles.quickCheckTitle}>Reply to quick check</div>
              <div className={styles.quickCheckVoiceRow}>
                <VoiceChatInput
                  language={quickCheckLanguage}
                  onLanguageChange={setQuickCheckLanguage}
                  placeholder="Type or speak your reply…"
                  onTranscript={(t) => submitQuickCheck(t)}
                  onError={(e) => setQuickCheckVoiceError(e)}
                  disabled={quickCheckSubmitting}
                  submitLabel="Submit Reply"
                />
              </div>
              {quickCheckVoiceError && (
                <div className={styles.quickCheckError}>{quickCheckVoiceError}</div>
              )}
              {quickCheckError && (
                <div className={styles.quickCheckError}>{quickCheckError}</div>
              )}
              {quickCheckResult?.follow_up && (
                <div className={styles.quickCheckFeedback}>{quickCheckResult.follow_up}</div>
              )}
            </div>
            <div className={styles.voiceCoachBox}>
              <div className={styles.voiceCoachTitle}>Ask teacher follow-up</div>
              <div className={styles.coachChatArea}>
                <ChatConversation
                  messages={coachChatMessages}
                  className={styles.coachChatMessages}
                  onPlayAudio={async (text) => {
                    if (!text?.trim()) return;
                    try {
                      const blob = await voiceAPI.speak(text);
                      const url = URL.createObjectURL(blob);
                      const audio = new Audio(url);
                      audio.onended = () => URL.revokeObjectURL(url);
                      await audio.play();
                    } catch (e) {}
                  }}
                />
              </div>
              <div className={styles.coachInputRow}>
                <VoiceChatInput
                  language={coachLanguage}
                  onLanguageChange={setCoachLanguage}
                  placeholder="Type or speak your follow-up…"
                  onTranscript={handleCoachTranscript}
                  onError={(e) => setCoachVoiceError(e)}
                  disabled={coachLoading}
                  submitLabel="Ask Teacher"
                />
              </div>
              {coachVoiceError && <div className={styles.quickCheckError}>{coachVoiceError}</div>}
              {coachError && <div className={styles.quickCheckError}>{coachError}</div>}
              {coachResult?.teacher_response && (
                <div className={styles.voiceCoachResponse}>
                  <div className={styles.voiceCoachReplyHeader}>
                    <span>Listen to reply</span>
                    {(coachReplyAudioState === 'finished' || coachReplyAudioState === 'ready' || coachReplyAudioState === 'playing') && (
                      <button onClick={toggleCoachReplyPlayback} className={styles.playButton}>
                        {coachReplyAudioState === 'playing' ? '⏸ Pause' : '▶ Play'}
                      </button>
                    )}
                  </div>
                  {showVoiceTelemetry && (
                    <div className={styles.voiceCoachMeta}>
                      Focus: {coachResult.teaching_focus || 'concept_clarity'} | Mode: {coachResult.latency_mode || 'balanced'} | Context: {coachResult.context_confidence || '-'} ({coachResult.context_top_score ?? '-'}) | Latency: {coachResult.latency_ms ?? '-'}ms | Cache: {(coachResult.cache_hit || coachResult.backend_cache_hit) ? 'hit' : 'miss'} | Fallback: {coachResult.fallback_used ? 'yes' : 'no'}
                    </div>
                  )}
                  {showVoiceTelemetry && coachResult.quality_checks && (
                    <div className={styles.voiceCoachMeta}>
                      Quality: {coachResult.quality_checks.style_passed ? 'pass' : 'review'} | Words: {coachResult.quality_checks.word_count} | Check question: {coachResult.quality_checks.has_check_question ? 'yes' : 'no'}
                    </div>
                  )}
                  {showVoiceTelemetry && Array.isArray(coachResult.query_expansions) && coachResult.query_expansions.length > 0 && (
                    <div className={styles.voiceCoachGrounding}>
                      Domain expansions used: {coachResult.query_expansions.join(', ')}
                    </div>
                  )}
                  {coachResult.needs_clarification && (
                    <div className={styles.voiceCoachClarify}>
                      Clarification needed: add one precise anchor (drug name, mechanism keyword, or quoted PYQ/textbook line), then ask again.
                    </div>
                  )}
                  {coachResult.grounding_note && (
                    <div className={styles.voiceCoachGrounding}>{coachResult.grounding_note}</div>
                  )}
                  {showVoiceTelemetry && Array.isArray(coachResult.used_source_ids) && coachResult.used_source_ids.length > 0 && (
                    <div className={styles.voiceCoachSourceIds}>
                      Sources used: {coachResult.used_source_ids.join(', ')}
                    </div>
                  )}
                  {showVoiceTelemetry && Array.isArray(coachResult.references) && coachResult.references.length > 0 && (
                    <div className={styles.voiceCoachRefs}>
                      {coachResult.references.slice(0, 3).map((ref, idx) => (
                        <div key={`${ref.source_id || 'ref'}-${idx}`} className={styles.voiceCoachRefItem}>
                          {ref.subject || 'General'} / {ref.topic || 'General'} - {ref.preview || 'Reference'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
                  {questionKeyPoints.length > 0 && (
                    <ul className={styles.keyPointsList}>
                      {questionKeyPoints.map((kp, idx) => (
                        <li key={idx} className={styles.keyPointItem}>
                          {kp}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.feedbackSection}>
            <h3 className={styles.feedbackTitle}>Feedback</h3>
            <div className={styles.feedbackText}>
              {formatFeedback(feedbackData, showFullExplanation)}
            </div>
            {!showFullExplanation && score < 90 && (
              <div className={styles.feedbackHint}>
                The full answer will be revealed after you work through a few quick-check replies
                with the teacher above.
              </div>
            )}
            {showFullExplanation && questionKeyPoints.length > 0 && (
              <div className={styles.keyPointsSection}>
                <h3 className={styles.feedbackTitle}>Key points to remember</h3>
                <ul className={styles.keyPointsList}>
                  {questionKeyPoints.map((kp, idx) => (
                    <li key={idx} className={styles.keyPointItem}>
                      {kp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
