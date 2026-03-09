'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api, { voiceAPI } from '../../lib/api';
import VoiceChatInput from '../../components/VoiceChatInput';
import ChatConversation from '../../components/ChatConversation';
import TeacherVoicePlayer from '../../components/TeacherVoicePlayer';
import styles from './concept-map.module.css';

export default function ConceptMapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeSessionId = searchParams?.get('session_id');
  const [topics, setTopics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [grossPrompt, setGrossPrompt] = useState(null);
  const [profileHint, setProfileHint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState('select');
  const [grossAnswer, setGrossAnswer] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [learnerLevel, setLearnerLevel] = useState(null);
  const [nextStep, setNextStep] = useState(null);
  const [probeAnswer, setProbeAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(null);
  const [pointFeedback, setPointFeedback] = useState(null);
  const [summaryRequest, setSummaryRequest] = useState(null);
  const [topicsError, setTopicsError] = useState(null);
  const [probeLanguage, setProbeLanguage] = useState('english');
  const [probeAudioBlob, setProbeAudioBlob] = useState(null);
  const [probeTranscribing, setProbeTranscribing] = useState(false);
  const [probeTranscriptionError, setProbeTranscriptionError] = useState('');
  const [grossLanguage, setGrossLanguage] = useState('english');
  const [grossAudioBlob, setGrossAudioBlob] = useState(null);
  const [grossTranscribing, setGrossTranscribing] = useState(false);
  const [grossTranscriptionError, setGrossTranscriptionError] = useState('');
  const [probeChatMessages, setProbeChatMessages] = useState([]);

  useEffect(() => {
    setTopicsError(null);
    api.get('/concept-map/topics')
      .then(res => {
        setTopics(res.data.topics || []);
      })
      .catch(err => {
        setTopics([]);
        const status = err.response?.status;
        if (status === 404) {
          setTopicsError('Concept-map API not found. Restart the backend server and try again.');
        } else {
          setTopicsError(err.response?.data?.error || 'Could not load topics. Check that the backend is running.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!resumeSessionId) return;
    setLoading(true);
    api.get(`/concept-map/session/${resumeSessionId}`)
      .then(res => {
        const data = res.data;
        setSessionId(data.session_id);
        setLearnerLevel(data.learner_level);
        setSelected({ subject: data.subject, topic: data.topic });
        if (data.phase === 'summary_request') {
          setSummaryRequest({
            summary_prompt: data.summary_prompt || `Summarize the full ${data.topic} in 4-5 exam sentences.`,
            point_just_covered: false,
            revealed_after_three: false,
            revealed_text: null,
            message: 'All core points covered. Please provide your summary.'
          });
          setStep('summary');
        } else if (data.phase === 'probing' && data.next_step) {
          setNextStep(data.next_step);
          setProbeChatMessages([{ id: 'q0', role: 'assistant', content: data.next_step.leading_prompt }]);
          setStep('probe');
        } else if (data.phase === 'completed') {
          setCompleted({
            summary_lines: data.summary_text ? data.summary_text.split(/\.\s+/).filter(Boolean).slice(0, 3) : [],
            missed_points: data.missed_points_text || [],
            must_repeat_question: data.must_repeat_question
          });
          setStep('done');
        } else {
          setNextStep(data.next_step || null);
          setStep(data.next_step ? 'probe' : 'select');
        }
      })
      .catch(() => setError('Session not found or already completed'))
      .finally(() => setLoading(false));
  }, [resumeSessionId]);

  const onSelectTopic = (subject, topic) => {
    setSelected({ subject, topic });
    setError('');
    setGrossPrompt(null);
    setProfileHint(null);
    api.get('/concept-map/gross-prompt', { params: { subject, topic } })
      .then(res => {
        setGrossPrompt(res.data.prompt_text);
        setStep('gross');
        setGrossAnswer('');
        setGrossAudioBlob(null);
        setGrossTranscriptionError('');
      })
      .catch(() => setError('No concept map for this topic'));
    api.get('/concept-mastery/suggested-profile', { params: { subject, topic } })
      .then(res => setProfileHint(res.data))
      .catch(() => {});
  };

  const startSession = async (answerText) => {
    const text = ((answerText ?? grossAnswer) || '').trim();
    if (!selected || !text) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/concept-map/session/start', {
        subject: selected.subject,
        topic: selected.topic,
        answer_text: text
      });
      const data = res.data;
      setSessionId(data.session_id);
      setLearnerLevel(data.learner_level);
      if (data.completed) {
        setCompleted({
          summary_lines: [],
          missed_points: [],
          must_repeat_question: null,
          aggregated: data.aggregated,
          message: 'No gaps to probe — your answer covered the key points.'
        });
        setStep('done');
      } else if (data.next_step) {
        setNextStep(data.next_step);
        setProbeAnswer('');
        setPointFeedback(null);
        setProbeAudioBlob(null);
        setProbeTranscriptionError('');
        setProbeChatMessages([{ id: 'q0', role: 'assistant', content: data.next_step.leading_prompt }]);
        setStep('probe');
      } else {
        setCompleted({
          summary_lines: [],
          missed_points: [],
          must_repeat_question: null,
          aggregated: data.aggregated
        });
        setStep('done');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start session');
    } finally {
      setSubmitting(false);
    }
  };

  const submitProbeAnswer = async (answerText) => {
    const text = ((answerText ?? probeAnswer) || '').trim();
    if (!sessionId || !text) return;
    setSubmitting(true);
    setError('');
    setPointFeedback(null);
    setProbeChatMessages(prev => [...prev, { id: `u${Date.now()}`, role: 'user', content: text }]);
    try {
      const res = await api.post(`/concept-map/session/${sessionId}/answer`, {
        answer_text: text
      });
      const data = res.data;
      if (data.phase === 'completed') {
        setCompleted({
          summary_lines: data.summary_lines || (data.summary_text ? data.summary_text.split(/\.\s+/).filter(Boolean).slice(0, 3) : []),
          missed_points: data.missed_points || [],
          must_repeat_question: data.must_repeat_question,
          revealed_text: data.revealed_text,
          next_concept: data.next_concept || null
        });
        setNextStep(null);
        setSummaryRequest(null);
        setStep('done');
      } else if (data.phase === 'summary_request') {
        setSummaryRequest({
          summary_prompt: data.summary_prompt,
          point_just_covered: data.point_just_covered,
          revealed_after_three: data.revealed_after_three,
          revealed_text: data.revealed_text,
          message: data.message
        });
        setPointFeedback({
          point_just_covered: data.point_just_covered,
          revealed_after_three: data.revealed_after_three,
          revealed_text: data.revealed_text
        });
        setNextStep(null);
        setProbeAnswer('');
        setProbeAudioBlob(null);
        setProbeTranscriptionError('');
        setStep('summary');
      } else {
        setPointFeedback({
          point_just_covered: data.point_just_covered,
          revealed_after_three: data.revealed_after_three,
          revealed_text: data.revealed_text
        });
        const assistantParts = [];
        if (data.point_just_covered) assistantParts.push('Point covered.');
        if (data.revealed_after_three && data.revealed_text) assistantParts.push(data.revealed_text);
        if (data.next_step?.leading_prompt) assistantParts.push(data.next_step.leading_prompt);
        setProbeChatMessages(prev => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: assistantParts.join('\n\n') }]);
        setNextStep(data.next_step || null);
        setProbeAnswer('');
        setProbeAudioBlob(null);
        setProbeTranscriptionError('');
        if (!data.next_step) {
          setCompleted({
            summary_lines: [],
            missed_points: [],
            must_repeat_question: null
          });
          setStep('done');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit answer');
      setProbeChatMessages(prev => prev.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  };

  const submitSummaryAnswer = async () => {
    if (!sessionId || !probeAnswer.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/concept-map/session/${sessionId}/answer`, {
        answer_text: probeAnswer.trim()
      });
      const data = res.data;
      if (data.phase === 'completed') {
        setCompleted({
          summary_lines: data.summary_lines || (data.summary_text ? data.summary_text.split(/\.\s+/).filter(Boolean).slice(0, 3) : []),
          missed_points: data.missed_points || [],
          must_repeat_question: data.must_repeat_question,
          next_concept: data.next_concept || null
        });
        setSummaryRequest(null);
        setStep('done');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit summary');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep('select');
    setSelected(null);
    setGrossPrompt(null);
    setGrossAnswer('');
    setSessionId(null);
    setNextStep(null);
    setProbeAnswer('');
    setProbeAudioBlob(null);
    setProbeTranscriptionError('');
    setProbeChatMessages([]);
    setGrossAnswer('');
    setGrossAudioBlob(null);
    setGrossTranscriptionError('');
    setCompleted(null);
    setPointFeedback(null);
    setSummaryRequest(null);
    setError('');
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <p className={styles.muted}>Loading topics…</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Concept Map</h1>
          <p className={styles.subtitle}>Deep-dive one topic: answer the big question, then fill gaps with guided prompts.</p>

          {step === 'select' && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Choose a topic</h2>
              {topicsError ? (
                <p className={styles.error}>{topicsError}</p>
              ) : topics.length === 0 ? (
                <p className={styles.muted}>No concept-map topics yet. Run: npm run seed:tuning-fork</p>
              ) : (
                <ul className={styles.topicList}>
                  {topics.map((t, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={styles.topicBtn}
                        onClick={() => onSelectTopic(t.subject, t.topic)}
                      >
                        <span className={styles.topicSubject}>{t.subject}</span>
                        <span className={styles.topicName}>{t.topic}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {step === 'gross' && selected && (
            <div className={styles.card}>
              <div className={styles.grossHeader}>
                <h2 className={styles.cardTitle}>{selected.subject} — {selected.topic}</h2>
                <button type="button" className={styles.secondaryBtn} onClick={resetFlow}>Back</button>
              </div>
              {profileHint && (
                <p className={styles.profileHint}>
                  Profile: {profileHint.suggested_profile || 'mid'}
                  {profileHint.rolling_accuracy != null && ` · Rolling accuracy: ${profileHint.rolling_accuracy}%`}
                </p>
              )}
              <p className={styles.promptLabel}>Answer this in your own words:</p>
              <p className={styles.promptText}>{grossPrompt}</p>
              <div className={styles.grossInputRow}>
                <VoiceChatInput
                  language={grossLanguage}
                  onLanguageChange={setGrossLanguage}
                  placeholder="Type or speak your answer…"
                  onTranscript={(t) => startSession(t)}
                  onError={(e) => setGrossTranscriptionError(e)}
                  disabled={submitting}
                  submitLabel="Start session"
                />
              </div>
              {grossTranscriptionError && <p className={styles.error}>{grossTranscriptionError}</p>}
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {step === 'probe' && nextStep && (
            <div className={styles.chatCard}>
              <div className={styles.chatHeader}>
                <h2 className={styles.cardTitle}>Voice Practice</h2>
                {learnerLevel && <span className={styles.profileHint}>Level: {learnerLevel}</span>}
              </div>
              <div className={styles.chatArea}>
                <ChatConversation
                  messages={probeChatMessages}
                  className={styles.chatMessages}
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
              <div className={styles.chatInputRow}>
                <VoiceChatInput
                  language={probeLanguage}
                  onLanguageChange={setProbeLanguage}
                  placeholder="Type or speak your answer…"
                  onTranscript={(t) => submitProbeAnswer(t)}
                  onError={(e) => setProbeTranscriptionError(e)}
                  disabled={submitting}
                  submitLabel="Submit"
                />
              </div>
              {probeTranscriptionError && <p className={styles.error}>{probeTranscriptionError}</p>}
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {step === 'summary' && summaryRequest && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Summary</h2>
              {summaryRequest.message && <p className={styles.completeMessage}>{summaryRequest.message}</p>}
              {summaryRequest.revealed_after_three && summaryRequest.revealed_text && (
                <div className={styles.revealedBlock}>
                  <span className={styles.feedbackReveal}>Revealed after 3 attempts:</span>
                  <p className={styles.revealedText}>{summaryRequest.revealed_text}</p>
                </div>
              )}
              <p className={styles.promptLabel}>{summaryRequest.summary_prompt}</p>
              <textarea
                className={styles.textarea}
                value={probeAnswer}
                onChange={e => setProbeAnswer(e.target.value)}
                placeholder="Type your summary in 4–5 exam sentences…"
                rows={6}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={submitSummaryAnswer}
                  disabled={submitting || !probeAnswer.trim()}
                >
                  {submitting ? 'Submitting…' : 'Submit summary'}
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {step === 'done' && completed && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Session complete</h2>
              {(() => {
                const parts = [];
                if (completed.message) parts.push(completed.message);
                if (completed.summary_lines?.length) parts.push('Summary. ' + completed.summary_lines.join('. '));
                if (completed.missed_points?.length) parts.push('Points to review: ' + completed.missed_points.map(p => typeof p === 'string' ? p : p.label || p).join(', '));
                if (completed.must_repeat_question) parts.push('Practice question: ' + completed.must_repeat_question);
                const spoken = parts.join(' ');
                return spoken ? <TeacherVoicePlayer text={spoken} autoPlay={true} label="Listen to summary" /> : null;
              })()}
              {completed.message && <p className={styles.completeMessage}>{completed.message}</p>}
              {completed.revealed_text && (
                <div className={styles.revealedBlock}>
                  <span className={styles.feedbackReveal}>Last point revealed:</span>
                  <p className={styles.revealedText}>{completed.revealed_text}</p>
                </div>
              )}
              {completed.aggregated && (
                <p className={styles.aggregated}>
                  Score: {completed.aggregated.overall_score_percent}% ({completed.aggregated.total_points_hit} / {completed.aggregated.total_points_expected} points)
                </p>
              )}
              {completed.summary_lines && completed.summary_lines.length > 0 && (
                <div className={styles.summary}>
                  <p className={styles.promptLabel}>Summary</p>
                  <ul>
                    {completed.summary_lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {completed.missed_points && completed.missed_points.length > 0 && (
                <div className={styles.missed}>
                  <p className={styles.promptLabel}>Points to review</p>
                  <ul>
                    {completed.missed_points.map((pt, i) => (
                      <li key={i}>{typeof pt === 'string' ? pt : pt.label || pt}</li>
                    ))}
                  </ul>
                </div>
              )}
              {completed.must_repeat_question && (
                <div className={styles.mustRepeat}>
                  <p className={styles.promptLabel}>Practice question</p>
                  <p className={styles.mustRepeatQ}>{completed.must_repeat_question}</p>
                </div>
              )}
              <div className={styles.actions}>
                {completed.next_concept?.id && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => router.push(`/diagnostic?for_concept_id=${completed.next_concept.id}`)}
                  >
                    Continue to Next Concept →
                  </button>
                )}
                <button type="button" className={styles.secondaryBtn} onClick={resetFlow}>
                  {completed.next_concept?.id ? 'Choose a different topic' : 'Start another topic'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && !completed && (
            <div className={styles.card}>
              <p className={styles.muted}>Session ended.</p>
              <button type="button" className={styles.primaryBtn} onClick={resetFlow}>Start another</button>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
