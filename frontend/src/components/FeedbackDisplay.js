'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api, { voiceAPI } from '../lib/api';
import VoiceChatInput from './VoiceChatInput';
import RealtimeVoiceCoach from './RealtimeVoiceCoach';
import ChatConversation from './ChatConversation';
import QuickCheckChat from './QuickCheckChat';
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
  const audioUrlRef = useRef(null);
  const fetchedTextRef = useRef(null);
  const coachReplyAudioRef = useRef(null);
  const coachReplyFetchedTextRef = useRef(null);
  const [coachPlayingMessageId, setCoachPlayingMessageId] = useState(null);

  const score = attempt?.score || 0;
  const feedbackData = attempt?.feedback || {};
  const teacherResponse = attempt?.teacher_response || null;
  const isPassing = score >= 70;
  const isMCQ = feedbackData.is_mcq === true;

  const [quickCheckAttempts, setQuickCheckAttempts] = useState(0);
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [quickCheckHistory, setQuickCheckHistory] = useState([]);
  const [playingMessageId, setPlayingMessageId] = useState(null);

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
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      const audioBlob = await voiceAPI.speak(text);
      const url = URL.createObjectURL(audioBlob);
      audioUrlRef.current = url;
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
      setPlayingMessageId('t0');
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
    setQuickCheckHistory([]);
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

  const quickCheckMessages = [
    ...(teacherResponse ? [{ id: 't0', role: 'assistant', content: teacherResponse }] : []),
    ...quickCheckHistory.flatMap((h, i) => [
      { id: `u${i}`, role: 'user', content: h.user },
      { id: `a${i}`, role: 'assistant', content: h.assistant }
    ])
  ];

  const coachChatMessages = coachHistory.flatMap((h, i) => [
    { id: `cu${i}`, role: 'user', content: h.student },
    { id: `ca${i}`, role: 'assistant', content: h.teacher }
  ]);

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
      const followUp = data?.follow_up || '';
      setQuickCheckResult(data);

      const newEntry = { user: text, assistant: followUp };
      const nextHistory = [...quickCheckHistory, newEntry];
      setQuickCheckHistory(nextHistory);
      const newAssistantId = `a${nextHistory.length - 1}`;
      setPlayingMessageId(newAssistantId);
      if (followUp) {
        fetchAudio(followUp);
      }

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

  useEffect(() => {
    const coachText = coachResult?.teacher_response || '';
    if (!coachText || coachReplyFetchedTextRef.current === coachText) return;

    coachReplyFetchedTextRef.current = coachText;
    if (coachHistory.length > 0) {
      const lastIndex = coachHistory.length - 1;
      setCoachPlayingMessageId(`ca${lastIndex}`);
    }

    let cancelled = false;

    (async () => {
      try {
        setCoachReplyAudioState('loading');
        const audioBlob = await voiceAPI.speak(coachText);
        if (cancelled) return;
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        coachReplyAudioRef.current = audio;

        audio.onplay = () => {
          if (!cancelled) setCoachReplyAudioState('playing');
        };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (!cancelled) setCoachReplyAudioState('finished');
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (!cancelled) setCoachReplyAudioState('error');
        };

        await audio.play().catch(() => {
          if (!cancelled) setCoachReplyAudioState('finished');
        });
      } catch (e) {
        if (!cancelled) setCoachReplyAudioState('error');
      }
    })();

    return () => {
      cancelled = true;
      if (coachReplyAudioRef.current) {
        coachReplyAudioRef.current.pause();
        coachReplyAudioRef.current = null;
      }
    };
  }, [coachResult?.teacher_response, coachHistory.length]);

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
            <div className={styles.quickCheckTitleRow}>
              <div className={styles.quickCheckTitle}>Reply to quick check</div>
              <div>
                <button
                  type="button"
                  className={styles.langPill}
                  onClick={() => setQuickCheckLanguage(prev => prev === 'english' ? 'hindi' : prev === 'hindi' ? 'hinglish' : 'english')}
                >
                  {quickCheckLanguage === 'english' ? 'English' : quickCheckLanguage === 'hindi' ? 'Hindi' : 'Hinglish'}
                </button>
              </div>
            </div>
            <div className={styles.quickCheckBox}>
              <QuickCheckChat
                messages={quickCheckMessages}
                playingMessageId={playingMessageId}
                audioRef={audioRef}
                audioState={audioState}
                className={styles.quickCheckChat}
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
              <div className={styles.quickCheckVoiceRow}>
                <VoiceChatInput
                  language={quickCheckLanguage}
                  onLanguageChange={null}
                  placeholder="Type or speak your reply…"
                  onTranscript={(t) => submitQuickCheck(t)}
                  onError={(e) => setQuickCheckVoiceError(e)}
                  disabled={quickCheckSubmitting}
                  submitLabel="Submit Reply"
                />
                  <RealtimeVoiceCoach
                    context={{
                      subject: question?.subject || attempt?.question_context?.subject || null,
                      topic: question?.topic || attempt?.question_context?.topic || attempt?.mastery_impact?.topic || null,
                      questionStem: question?.stem || question?.question_text || attempt?.question_context?.stem || null,
                      studentAnswer: attempt?.answer_text || null,
                      conversationHistory: quickCheckHistory.map((h) => ({
                        student: h.user,
                        teacher: h.assistant
                      }))
                    }}
                    onTurnComplete={({ student, teacher }) => {
                      const newEntry = { user: student, assistant: teacher };
                      setQuickCheckHistory((prev) => [...prev, newEntry]);
                    }}
                    onError={(e) => setQuickCheckVoiceError(e)}
                    disabled={quickCheckSubmitting}
                    placeholder="Use mic for live quick-check help…"
                    submitLabel="Ask live"
                  />
              </div>
              {quickCheckVoiceError && (
                <div className={styles.quickCheckError}>{quickCheckVoiceError}</div>
              )}
              {quickCheckError && (
                <div className={styles.quickCheckError}>{quickCheckError}</div>
              )}
            </div>
            <div className={styles.voiceCoachTitle}>Ask teacher follow-up</div>
            <div className={styles.voiceCoachBox}>
              <div className={styles.coachChatArea}>
                <ChatConversation
                  messages={coachChatMessages}
                  className={styles.coachChatMessages}
                  revealingMessageId={coachPlayingMessageId}
                  audioRef={coachReplyAudioRef}
                  audioState={coachReplyAudioState === 'done' ? 'finished' : coachReplyAudioState}
                  revealIntervalMs={250}
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
                <RealtimeVoiceCoach
                  context={{
                    subject: question?.subject || attempt?.question_context?.subject || null,
                    topic: question?.topic || attempt?.question_context?.topic || attempt?.mastery_impact?.topic || null,
                    questionStem: question?.stem || question?.question_text || attempt?.question_context?.stem || null,
                    studentAnswer: attempt?.answer_text || null,
                    conversationHistory: coachHistory
                  }}
                  onTurnComplete={({ student, teacher, fromRealtime }) => {
                    const nextHistory = [...coachHistory.slice(-7), { student, teacher }];
                    setCoachHistory(nextHistory);
                    const lastIdx = nextHistory.length - 1;
                    setCoachPlayingMessageId(`ca${lastIdx}`);
                    if (!fromRealtime) {
                      setCoachResult({ teacher_response: teacher });
                    }
                  }}
                  onError={(e) => setCoachVoiceError(e)}
                  disabled={coachLoading}
                  placeholder="Type or use mic for live voice…"
                  submitLabel="Ask Teacher"
                />
              </div>
              {coachVoiceError && <div className={styles.quickCheckError}>{coachVoiceError}</div>}
              {coachError && <div className={styles.quickCheckError}>{coachError}</div>}
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
