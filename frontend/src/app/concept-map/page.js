'use client';

import { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api, { voiceAPI } from '../../lib/api';
import VoiceRecorder from '../../components/VoiceRecorder';
import LanguageSelector from '../../components/LanguageSelector';
import TeacherVoicePlayer from '../../components/TeacherVoicePlayer';
import styles from './concept-map.module.css';

export default function ConceptMapPage() {
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
  const [topicsError, setTopicsError] = useState(null);
  const [probeLanguage, setProbeLanguage] = useState('english');
  const [probeAudioBlob, setProbeAudioBlob] = useState(null);
  const [probeTranscribing, setProbeTranscribing] = useState(false);
  const [probeTranscriptionError, setProbeTranscriptionError] = useState('');
  const [grossLanguage, setGrossLanguage] = useState('english');
  const [grossAudioBlob, setGrossAudioBlob] = useState(null);
  const [grossTranscribing, setGrossTranscribing] = useState(false);
  const [grossTranscriptionError, setGrossTranscriptionError] = useState('');

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

  const handleGrossTranscribe = useCallback(async () => {
    if (!grossAudioBlob) {
      setGrossTranscriptionError('No recording available');
      return null;
    }
    setGrossTranscribing(true);
    setGrossTranscriptionError('');
    try {
      const result = await voiceAPI.transcribe(grossAudioBlob, grossLanguage);
      const text = result.transcription || '';
      setGrossAnswer(text);
      return text;
    } catch (error) {
      setGrossTranscriptionError(error.message || 'Transcription failed. Please try again.');
      return null;
    } finally {
      setGrossTranscribing(false);
    }
  }, [grossAudioBlob, grossLanguage]);

  const handleProbeTranscribe = useCallback(async () => {
    if (!probeAudioBlob) {
      setProbeTranscriptionError('No recording available');
      return null;
    }
    setProbeTranscribing(true);
    setProbeTranscriptionError('');
    try {
      const result = await voiceAPI.transcribe(probeAudioBlob, probeLanguage);
      const text = result.transcription || '';
      setProbeAnswer(text);
      return text;
    } catch (error) {
      setProbeTranscriptionError(error.message || 'Transcription failed. Please try again.');
      return null;
    } finally {
      setProbeTranscribing(false);
    }
  }, [probeAudioBlob, probeLanguage]);

  const startSession = async () => {
    if (!selected || !grossAnswer.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/concept-map/session/start', {
        subject: selected.subject,
        topic: selected.topic,
        answer_text: grossAnswer.trim()
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

  const submitProbeAnswer = async () => {
    if (!sessionId || probeAnswer.trim() === '') return;
    setSubmitting(true);
    setError('');
    setPointFeedback(null);
    try {
      const res = await api.post(`/concept-map/session/${sessionId}/answer`, {
        answer_text: probeAnswer.trim()
      });
      const data = res.data;
      if (data.phase === 'completed') {
        setCompleted({
          summary_lines: data.summary_lines || (data.summary_text ? data.summary_text.split(/\.\s+/).filter(Boolean).slice(0, 3) : []),
          missed_points: data.missed_points || [],
          must_repeat_question: data.must_repeat_question
        });
        setNextStep(null);
        setStep('done');
      } else {
        setPointFeedback({
          point_just_covered: data.point_just_covered,
          revealed_after_three: data.revealed_after_three
        });
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
    setGrossAnswer('');
    setGrossAudioBlob(null);
    setGrossTranscriptionError('');
    setCompleted(null);
    setPointFeedback(null);
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
              <h2 className={styles.cardTitle}>{selected.subject} — {selected.topic}</h2>
              {profileHint && (
                <p className={styles.profileHint}>
                  Profile: {profileHint.suggested_profile || 'mid'}
                  {profileHint.rolling_accuracy != null && ` · Rolling accuracy: ${profileHint.rolling_accuracy}%`}
                </p>
              )}
              <p className={styles.promptLabel}>Answer this in your own words:</p>
              <p className={styles.promptText}>{grossPrompt}</p>
              <div className={styles.voiceRow}>
                <LanguageSelector value={grossLanguage} onChange={setGrossLanguage} />
                <VoiceRecorder
                  onRecordingComplete={(blob) => {
                    setGrossAudioBlob(blob);
                    setGrossTranscriptionError('');
                  }}
                  onError={(err) => setGrossTranscriptionError(err)}
                />
                {grossAudioBlob && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={handleGrossTranscribe}
                    disabled={grossTranscribing}
                  >
                    {grossTranscribing ? 'Transcribing…' : 'Transcribe audio to text'}
                  </button>
                )}
                {grossTranscriptionError && <p className={styles.error}>{grossTranscriptionError}</p>}
              </div>
              <textarea
                className={styles.textarea}
                value={grossAnswer}
                onChange={e => setGrossAnswer(e.target.value)}
                placeholder="Type your answer…"
                rows={6}
              />
              <div className={styles.actions}>
                <button type="button" className={styles.secondaryBtn} onClick={resetFlow}>Back</button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={startSession}
                  disabled={submitting || !grossAnswer.trim()}
                >
                  {submitting ? 'Starting…' : 'Start session'}
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}

          {step === 'probe' && nextStep && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Guided follow-up</h2>
              {learnerLevel && (
                <p className={styles.profileHint}>Level: {learnerLevel}</p>
              )}
              {pointFeedback && (
                <div className={styles.pointFeedback}>
                  {pointFeedback.point_just_covered && <span className={styles.feedbackOk}>Point covered.</span>}
                  {pointFeedback.revealed_after_three && <span className={styles.feedbackReveal}>Revealed after 3 attempts.</span>}
                </div>
              )}
              <p className={styles.promptLabel}>Concept: {nextStep.concept_name}</p>
              {nextStep.leading_prompt && (
                <TeacherVoicePlayer text={nextStep.leading_prompt} autoPlay={true} label="Listen to question" />
              )}
              <p className={styles.promptText}>{nextStep.leading_prompt}</p>
              <div className={styles.voiceRow}>
                <LanguageSelector value={probeLanguage} onChange={setProbeLanguage} />
                <VoiceRecorder
                  onRecordingComplete={(blob) => {
                    setProbeAudioBlob(blob);
                    setProbeTranscriptionError('');
                  }}
                  onError={(err) => setProbeTranscriptionError(err)}
                />
                {probeAudioBlob && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={handleProbeTranscribe}
                    disabled={probeTranscribing}
                  >
                    {probeTranscribing ? 'Transcribing…' : 'Transcribe audio to text'}
                  </button>
                )}
                {probeTranscriptionError && <p className={styles.error}>{probeTranscriptionError}</p>}
              </div>
              <textarea
                className={styles.textarea}
                value={probeAnswer}
                onChange={e => setProbeAnswer(e.target.value)}
                placeholder="Your answer…"
                rows={4}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={submitProbeAnswer}
                  disabled={submitting || !probeAnswer.trim()}
                >
                  {submitting ? 'Submitting…' : 'Submit'}
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
                <button type="button" className={styles.primaryBtn} onClick={resetFlow}>
                  Start another topic
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
