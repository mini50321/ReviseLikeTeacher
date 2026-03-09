'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api, { voiceAPI } from '../../lib/api';
import VoiceChatInput from '../../components/VoiceChatInput';
import TeacherVoicePlayer from '../../components/TeacherVoicePlayer';
import styles from './diagnostic.module.css';

function DiagnosticContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoConceptId = searchParams?.get('for_concept_id');
  const [phase, setPhase] = useState('select');
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [diagnosticId, setDiagnosticId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [tlsId, setTlsId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState('');
  const [answerMethod, setAnswerMethod] = useState('text');
  const [language, setLanguage] = useState('english');
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [answers, setAnswers] = useState([]);

  const [results, setResults] = useState(null);
  const startTimeRef = useRef(Date.now());
  const [attemptCount, setAttemptCount] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [lastWasCorrect, setLastWasCorrect] = useState(false);

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    if (!autoConceptId) return;
    const startFromConcept = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post('/diagnostic/start', { for_concept_id: autoConceptId });
        const data = response.data;
        setDiagnosticId(data.diagnostic_id);
        setSessionId(data.session_id);
        setTlsId(data.topic_learning_session_id);
        setQuestions(data.questions);
        setCurrentIndex(0);
        setAnswers([]);
        setFeedback(null);
        setAnswerText('');
        setAnswerMethod('text');
        setLanguage('english');
        setAudioBlob(null);
        setTranscription('');
        setTranscriptionError('');
        setAttemptCount(0);
        setShowSolution(false);
        setLastWasCorrect(false);
        setPhase('answering');
        startTimeRef.current = Date.now();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to start next concept');
      } finally {
        setLoading(false);
      }
    };
    startFromConcept();
  }, [autoConceptId]);

  const fetchTopics = async () => {
    try {
      const response = await api.get('/diagnostic/topics');
      setSubjects(response.data.subjects || []);
      setTopics(response.data.topics || []);
    } catch (err) {
      setError('Failed to load topics');
    } finally {
      setLoading(false);
    }
  };

  const filteredTopics = selectedSubject
    ? topics.filter(t => t.subject === selectedSubject)
    : topics;

  const startDiagnostic = async (subject, topic) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/diagnostic/start', { subject, topic });
      const data = response.data;
      setDiagnosticId(data.diagnostic_id);
      setSessionId(data.session_id);
      setTlsId(data.topic_learning_session_id);
      setQuestions(data.questions);
      setCurrentIndex(0);
      setAnswers([]);
      setFeedback(null);
      setAnswerText('');
      setAnswerMethod('text');
      setLanguage('english');
      setAudioBlob(null);
      setTranscription('');
      setTranscriptionError('');
      setAttemptCount(0);
      setShowSolution(false);
      setLastWasCorrect(false);
      setPhase('answering');
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start diagnostic');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (textAnswer) => {
    const question = questions[currentIndex];
    if (!question) return;

    let parsedOptions = null;
    if (question.options) {
      try {
        parsedOptions = typeof question.options === 'string'
          ? JSON.parse(question.options)
          : question.options;
        if (parsedOptions && !Object.values(parsedOptions).some(v => v)) {
          parsedOptions = null;
        }
      } catch (e) {
        parsedOptions = null;
      }
    }

    const isMCQ = ['mcq', 'true_false', 'assertion_reason'].includes(question.type) && parsedOptions;

    let answer = '';
    let answerMethodToSend = 'text';
    let languageToSend = null;

    if (isMCQ) {
      answer = selectedOption;
    } else {
      answer = ((textAnswer ?? answerText) || '').trim();
      if (answer) languageToSend = language;
    }

    if (!answer || !answer.trim()) {
      setError('Please provide an answer');
      return;
    }

    setSubmitting(true);
    setError('');

    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);

    try {
      const response = await api.post(`/diagnostic/${diagnosticId}/answer`, {
        question_id: question.id,
        answer_text: answer.trim(),
        answer_method: answerMethodToSend,
        language: languageToSend,
        time_spent_seconds: timeSpent
      });

      const fb = response.data;

      const score = fb?.score || 0;
      const fbData = fb?.feedback || {};
      const isMCQCorrect = fbData.is_mcq === true ? !!fbData.is_correct : false;
      const isCorrect = isMCQ ? isMCQCorrect : score >= 90;

      const nextAttempts = attemptCount + 1;
      setAttemptCount(nextAttempts);
      setLastWasCorrect(isCorrect);
      if (isCorrect || nextAttempts >= 3) {
        setShowSolution(true);
      }

      setFeedback(fb);
      setAnswers(prev => [...prev, {
        question_id: question.id,
        answer: answer.trim(),
        score: fb.score,
        feedback: fb.feedback
      }]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setAnswerText('');
      setAnswerMethod('text');
      setLanguage('english');
      setAudioBlob(null);
      setTranscription('');
      setTranscriptionError('');
      setSelectedOption('');
      setFeedback(null);
       setAttemptCount(0);
       setShowSolution(false);
       setLastWasCorrect(false);
      startTimeRef.current = Date.now();
    } else {
      completeDiagnostic();
    }
  };

  const completeDiagnostic = async () => {
    setLoading(true);
    try {
      const response = await api.post(`/diagnostic/${diagnosticId}/complete`);
      setResults(response.data);
      setPhase('results');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete diagnostic');
    } finally {
      setLoading(false);
    }
  };

  const getScoreClass = (score) => {
    if (score >= 70) return styles.feedbackScoreGood;
    if (score >= 40) return styles.feedbackScoreMedium;
    return styles.feedbackScoreBad;
  };

  const getLevelClass = (level) => {
    switch (level) {
      case 'very_weak':
      case 'weak': return styles.resultLevelWeak;
      case 'average': return styles.resultLevelAverage;
      case 'good': return styles.resultLevelGood;
      case 'excellent':
      case 'strong':
      case 'bored': return styles.resultLevelStrong;
      default: return '';
    }
  };

  if (loading && phase === 'select') {
    return (
      <div className={styles.loading}>
        {autoConceptId ? 'Starting next concept...' : 'Loading topics...'}
      </div>
    );
  }

  if (phase === 'select') {
    return (
      <div>
        <h1 className={styles.title}>Diagnostic Assessment</h1>
        <p className={styles.subtitle}>Select a topic — 1 SAQ to infer your level, then Socratic teaching</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Filter by Subject</h2>
          <div className={styles.filterRow}>
            <button
              className={`${styles.filterButton} ${!selectedSubject ? styles.filterActive : ''}`}
              onClick={() => setSelectedSubject('')}
            >
              All
            </button>
            {subjects.map(s => (
              <button
                key={s}
                className={`${styles.filterButton} ${selectedSubject === s ? styles.filterActive : ''}`}
                onClick={() => setSelectedSubject(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Available Topics ({filteredTopics.length})</h2>
          {filteredTopics.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No topics found</h3>
              <p>Ask an admin to add questions first.</p>
            </div>
          ) : (
            <div className={styles.topicGrid}>
              {filteredTopics.map(t => (
                <div
                  key={`${t.subject}|${t.topic}`}
                  className={styles.topicCard}
                  onClick={() => startDiagnostic(t.subject, t.topic)}
                >
                  <div className={styles.topicName}>{t.topic}</div>
                  <div className={styles.topicSubject}>{t.subject}</div>
                  <div className={styles.topicMeta}>
                    {t.core_count > 0 && (
                      <span className={`${styles.badge} ${styles.badgeCore}`}>{t.core_count} Core</span>
                    )}
                    {t.frequent_count > 0 && (
                      <span className={`${styles.badge} ${styles.badgeFrequent}`}>{t.frequent_count} Frequent</span>
                    )}
                    {t.mastery_status !== 'not_started' && (
                      <span className={`${styles.badge} ${t.mastery_status === 'mastered' ? styles.badgeMastered : styles.badgeStatus}`}>
                        {t.mastery_status.replace(/_/g, ' ')}
                      </span>
                    )}
                    {t.diagnostic_level && (
                      <span className={`${styles.badge} ${styles.badgeStatus}`}>
                        {t.diagnostic_level}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'answering') {
    const question = questions[currentIndex];
    if (!question) return null;

    let parsedOptions = null;
    if (question.options) {
      try {
        parsedOptions = typeof question.options === 'string'
          ? JSON.parse(question.options)
          : question.options;
        if (parsedOptions && !Object.values(parsedOptions).some(v => v)) {
          parsedOptions = null;
        }
      } catch (e) {
        parsedOptions = null;
      }
    }

    const isMCQ = ['mcq', 'true_false', 'assertion_reason'].includes(question.type) && parsedOptions;
    const progress = ((currentIndex + 1) / questions.length) * 100;
    const isLocked = showSolution;

    return (
      <div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.card}>
          <div className={styles.phaseIndicator}>
            <span className={styles.phaseTag}>Diagnostic</span>
            <span className={styles.phaseStep}>Question {currentIndex + 1} of {questions.length}</span>
            {autoConceptId && (
              <button
                type="button"
                className={styles.chooseTopicLink}
                onClick={() => router.push('/diagnostic')}
              >
                Choose a different topic
              </button>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.questionCard}>
            {!showSolution && (
              <>
                <div className={styles.questionStem}>{question.stem}</div>

                {isMCQ && parsedOptions ? (
                  <div className={styles.mcqOptions}>
                    {Object.entries(parsedOptions).map(([label, text]) => {
                      if (!text) return null;
                      return (
                        <div
                          key={label}
                          className={`${styles.mcqOption} ${selectedOption === label ? styles.mcqOptionSelected : ''}`}
                          onClick={() => { if (!isLocked) { setSelectedOption(label); } }}
                        >
                          <span className={`${styles.mcqLabel} ${selectedOption === label ? styles.mcqLabelSelected : ''}`}>
                            {label}
                          </span>
                          <span className={styles.mcqText}>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.answerArea}>
                    <VoiceChatInput
                      language={language}
                      onLanguageChange={setLanguage}
                      placeholder="Type or speak your answer…"
                      onTranscript={(t) => submitAnswer(t)}
                      onError={(e) => setTranscriptionError(e)}
                      disabled={isLocked || submitting}
                      submitLabel="Submit Answer"
                    />
                    {transcriptionError && <div className={styles.error}>{transcriptionError}</div>}
                  </div>
                )}
              </>
            )}

            {feedback && (
              <div className={styles.feedbackCard}>
                <div className={`${styles.feedbackScore} ${getScoreClass(feedback.score)}`}>
                  {feedback.score}/100
                </div>
                {feedback.feedback?.strengths && (
                  <div className={styles.feedbackText}>{feedback.feedback.strengths}</div>
                )}
                {feedback.feedback?.improvements && (
                  <div className={styles.feedbackText}>{feedback.feedback.improvements}</div>
                )}
                {!showSolution && feedback.teacher_response && (
                  <>
                    <TeacherVoicePlayer text={feedback.teacher_response} autoPlay={true} label="Listen to hint" />
                    <div className={styles.feedbackTeacher}>{feedback.teacher_response}</div>
                  </>
                )}
                {showSolution && (feedback.feedback?.model_explanation || question.ideal_answer) && (
                  <>
                    <TeacherVoicePlayer
                      text={`Explanation: ${feedback.feedback?.model_explanation || question.ideal_answer}`}
                      autoPlay={true}
                      label="Listen to explanation"
                    />
                    <div className={styles.feedbackText}>
                      Explanation: {feedback.feedback?.model_explanation || question.ideal_answer}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className={styles.actions}>
              {!showSolution ? (
                isMCQ ? (
                  <button
                    className={styles.submitButton}
                    onClick={() => submitAnswer()}
                    disabled={submitting || !selectedOption}
                  >
                    {submitting ? 'Evaluating...' : 'Submit Answer'}
                  </button>
                ) : null
              ) : (
                <button
                  className={styles.submitButton}
                  onClick={nextQuestion}
                >
                  {currentIndex < questions.length - 1 ? 'Next Question' : 'See Results'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'results' && results) {
    return (
      <div>
        <div className={styles.card}>
          <div className={styles.resultsCard}>
            <div className={styles.phaseIndicator} style={{ justifyContent: 'center' }}>
              <span className={styles.phaseTag}>Diagnostic Complete</span>
            </div>

            <div className={`${styles.resultLevel} ${getLevelClass(results.student_level || results.diagnostic_level)}`}>
              {results.student_level || results.diagnostic_level}
            </div>
            <div className={styles.resultScore}>
              {results.correct_count} / {results.total_questions} correct (Raw: {(results.raw_score * 100).toFixed(0)}%)
            </div>

            <div className={styles.resultBuckets}>
              {(results.focus_buckets || []).map(b => (
                <span key={b} className={styles.bucketTag}>{b}</span>
              ))}
            </div>

            <div className={styles.resultRecommendation}>
              {results.recommendation}
            </div>

            {results.misconception_tags && results.misconception_tags.length > 0 && (
              <div className={styles.misconceptionList}>
                <div className={styles.misconceptionTitle}>Areas Needing Attention</div>
                {results.misconception_tags.map((m, i) => (
                  <div key={i} className={styles.misconceptionItem}>
                    <span className={styles.misconceptionDot} />
                    <span>{m.subtopic} — {m.type.replace(/_/g, ' ')} (Score: {m.score})</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.resultActions}>
              {results.concept_map_session?.session_id && results.concept_map_session?.next_step ? (
                <button
                  className={styles.primaryButton}
                  onClick={() => router.push(`/concept-map?session_id=${results.concept_map_session.session_id}`)}
                >
                  Continue to Teaching
                </button>
              ) : results.concept_map_session?.session_id && results.concept_map_session?.completed ? (
                <button
                  className={styles.primaryButton}
                  onClick={() => router.push(`/topic-mastery?id=${tlsId}`)}
                >
                  Continue to Mastery Flow
                </button>
              ) : (
                <button
                  className={styles.primaryButton}
                  onClick={() => router.push(`/topic-mastery?id=${tlsId}`)}
                >
                  Continue to Mastery Flow
                </button>
              )}
              <button
                className={styles.secondaryButton}
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setPhase('select');
                  setResults(null);
                  setDiagnosticId(null);
                  setQuestions([]);
                  setAnswers([]);
                  setFeedback(null);
                  setCurrentIndex(0);
                  setError('');
                }}
              >
                Diagnose Another Topic
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function DiagnosticPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <DiagnosticContent />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

