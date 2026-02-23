'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './topic-mastery.module.css';

const PHASES = ['diagnostic', 'concept_fixing', 'laq', 'mcq_consolidation', 'mastery_check'];
const PHASE_LABELS = {
  diagnostic: 'Diagnostic',
  concept_fixing: 'Concept Fix',
  laq: 'LAQ',
  mcq_consolidation: 'MCQ',
  mastery_check: 'Mastery'
};

function TopicMasteryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tlsId = searchParams?.get('id');

  const [phase, setPhase] = useState('loading');
  const [sessionData, setSessionData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [masteryResults, setMasteryResults] = useState(null);
  const [mcqProgress, setMcqProgress] = useState({ completed: 0, total: 0, correct: 0 });
  const [adaptiveInfo, setAdaptiveInfo] = useState(null);
  const [rapidFire, setRapidFire] = useState(null);
  const [rfIndex, setRfIndex] = useState(0);
  const [rfAnswer, setRfAnswer] = useState('');
  const [rfResult, setRfResult] = useState(null);
  const [rfScore, setRfScore] = useState({ correct: 0, total: 0 });
  const [rfShowHint, setRfShowHint] = useState(false);
  const [rfLoading, setRfLoading] = useState(false);
  const [nextRec, setNextRec] = useState(null);
  const [addingRevision, setAddingRevision] = useState(false);
  const [revisionAdded, setRevisionAdded] = useState(false);
  const [completionSummary, setCompletionSummary] = useState(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (tlsId) {
      loadSession();
    } else {
      setPhase('no_session');
    }
  }, [tlsId]);

  const loadSession = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/topic-mastery/${tlsId}`);
      const data = response.data;
      setSessionData(data.session);

      const currentPhase = data.session.current_phase;
      if (currentPhase === 'diagnostic') {
        startConceptFixing();
      } else if (currentPhase === 'concept_fixing') {
        startConceptFixing();
      } else if (currentPhase === 'laq') {
        startLAQ();
      } else if (currentPhase === 'mcq_consolidation') {
        startMCQ();
      } else if (currentPhase === 'mastery_check' || currentPhase === 'completed') {
        if (data.session.mastery_result) {
          setMasteryResults({
            mastery_result: data.session.mastery_result,
            mcq_accuracy: data.session.mcq_accuracy,
            core_coverage: data.session.core_coverage,
            competency_score: data.session.competency_score
          });
          setPhase('results');
        } else {
          runMasteryCheck();
        }
      }
    } catch (err) {
      setError('Failed to load session');
      setPhase('error');
    } finally {
      setLoading(false);
    }
  };

  const startConceptFixing = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/topic-mastery/${tlsId}/concept-fixing/start`);
      const data = response.data;
      if (data.adaptive) setAdaptiveInfo(data.adaptive);
      if (data.questions.length === 0) {
        startLAQ();
        return;
      }
      setQuestions(data.questions);
      setCurrentIndex(0);
      setFeedback(null);
      setAnswerText('');
      setSelectedOption('');
      setPhase('concept_fixing');
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start concept fixing');
    } finally {
      setLoading(false);
    }
  };

  const startLAQ = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/topic-mastery/${tlsId}/laq/start`);
      const data = response.data;
      if (data.questions.length === 0) {
        startMCQ();
        return;
      }
      setQuestions(data.questions);
      setCurrentIndex(0);
      setFeedback(null);
      setAnswerText('');
      setSelectedOption('');
      setPhase('laq');
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start LAQ');
    } finally {
      setLoading(false);
    }
  };

  const startMCQ = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/topic-mastery/${tlsId}/mcq/start`);
      const data = response.data;
      if (data.adaptive) setAdaptiveInfo(data.adaptive);
      if (data.questions.length === 0) {
        runMasteryCheck();
        return;
      }
      setQuestions(data.questions);
      setCurrentIndex(0);
      setFeedback(null);
      setAnswerText('');
      setSelectedOption('');
      setMcqProgress({ completed: 0, total: data.questions.length, correct: 0 });
      setPhase('mcq_consolidation');
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start MCQ');
    } finally {
      setLoading(false);
    }
  };

  const runMasteryCheck = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/topic-mastery/${tlsId}/mastery-check`);
      setMasteryResults(response.data);
      setPhase('results');
      setTimeout(() => loadPostCompletionData(), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run mastery check');
    } finally {
      setLoading(false);
    }
  };

  const submitConceptFixingAnswer = async () => {
    const question = questions[currentIndex];
    const isMCQ = ['mcq', 'true_false', 'assertion_reason'].includes(question.type) && question.options;
    const answer = isMCQ ? selectedOption : answerText;
    if (!answer || !answer.trim()) { setError('Please provide an answer'); return; }

    setSubmitting(true);
    setError('');
    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);

    try {
      const response = await api.post(`/topic-mastery/${tlsId}/concept-fixing/answer`, {
        question_id: question.id,
        answer_text: answer.trim(),
        answer_method: 'text',
        time_spent_seconds: timeSpent
      });
      setFeedback(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLAQAnswer = async () => {
    const question = questions[currentIndex];
    if (!answerText.trim()) { setError('Please provide an answer'); return; }

    setSubmitting(true);
    setError('');
    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);

    try {
      const response = await api.post(`/topic-mastery/${tlsId}/laq/answer`, {
        question_id: question.id,
        answer_text: answerText.trim(),
        answer_method: 'text',
        time_spent_seconds: timeSpent
      });
      setFeedback(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMCQAnswer = async () => {
    const question = questions[currentIndex];
    if (!selectedOption) { setError('Please select an option'); return; }

    setSubmitting(true);
    setError('');
    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);

    try {
      const response = await api.post(`/topic-mastery/${tlsId}/mcq/answer`, {
        question_id: question.id,
        answer_text: selectedOption,
        time_spent_seconds: timeSpent
      });
      setFeedback(response.data);
      if (response.data.progress) {
        setMcqProgress(response.data.progress);
      }
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
      setSelectedOption('');
      setFeedback(null);
      setError('');
      startTimeRef.current = Date.now();
    } else {
      if (phase === 'concept_fixing') {
        startLAQ();
      } else if (phase === 'laq') {
        startMCQ();
      } else if (phase === 'mcq_consolidation') {
        runMasteryCheck();
      }
    }
  };

  const completeSession = async () => {
    try {
      const res = await api.post(`/topic-mastery/${tlsId}/complete`);
      const subject = sessionData?.subject || res.data?.subject;
      const topic = sessionData?.topic || res.data?.topic;
      if (subject && topic) {
        router.push(`/exam-notes?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&generate=true&session_id=${tlsId}`);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      router.push('/dashboard');
    }
  };

  const loadPostCompletionData = async () => {
    try {
      const subject = sessionData?.subject;
      const topic = sessionData?.topic;
      if (!subject || !topic) return;

      const [summaryRes, recRes] = await Promise.all([
        api.get(`/post-completion/completion-summary/${tlsId}`).catch(() => null),
        api.get(`/post-completion/next-topic?current_subject=${encodeURIComponent(subject)}&current_topic=${encodeURIComponent(topic)}`).catch(() => null)
      ]);

      if (summaryRes?.data) setCompletionSummary(summaryRes.data);
      if (recRes?.data) setNextRec(recRes.data);
    } catch (e) {}
  };

  const startRapidFire = async () => {
    try {
      setRfLoading(true);
      setError('');
      const res = await api.post('/post-completion/rapid-fire', {
        subject: sessionData?.subject,
        topic: sessionData?.topic,
        tls_id: tlsId
      });
      setRapidFire(res.data);
      setRfIndex(0);
      setRfAnswer('');
      setRfResult(null);
      setRfScore({ correct: 0, total: 0 });
      setRfShowHint(false);
      setPhase('rapid_fire');
    } catch (err) {
      setError('Failed to generate rapid-fire questions');
    } finally {
      setRfLoading(false);
    }
  };

  const checkRfAnswer = () => {
    if (!rapidFire?.questions?.[rfIndex]) return;
    const correct = rapidFire.questions[rfIndex].answer;
    const userNorm = rfAnswer.trim().toLowerCase();
    const correctNorm = correct.trim().toLowerCase();
    const isCorrect = userNorm === correctNorm
      || correctNorm.includes(userNorm)
      || userNorm.includes(correctNorm);
    setRfResult({ is_correct: isCorrect, correct_answer: correct });
    setRfScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    }));
  };

  const nextRfQuestion = () => {
    if (rfIndex < (rapidFire?.questions?.length || 0) - 1) {
      setRfIndex(prev => prev + 1);
      setRfAnswer('');
      setRfResult(null);
      setRfShowHint(false);
    } else {
      setPhase('results');
    }
  };

  const addToRevision = async () => {
    try {
      setAddingRevision(true);
      await api.post('/post-completion/add-to-revision', {
        subject: sessionData?.subject,
        topic: sessionData?.topic
      });
      setRevisionAdded(true);
    } catch (err) {
      setError('Failed to add to revision schedule');
    } finally {
      setAddingRevision(false);
    }
  };

  const getScoreClass = (score) => {
    if (score >= 70) return styles.scoreGood;
    if (score >= 40) return styles.scoreMedium;
    return styles.scoreBad;
  };

  const getPhaseClass = (p) => {
    const currentIdx = PHASES.indexOf(phase === 'results' ? 'mastery_check' : phase);
    const pIdx = PHASES.indexOf(p);
    if (pIdx < currentIdx) return styles.phaseDone;
    if (pIdx === currentIdx) return styles.phaseActive;
    return '';
  };

  const renderPhaseTracker = () => (
    <div className={styles.phaseTracker}>
      {PHASES.map((p, i) => (
        <span key={p}>
          {i > 0 && <span className={styles.phaseArrow}> → </span>}
          <span className={`${styles.phaseStep} ${getPhaseClass(p)}`}>
            {PHASE_LABELS[p]}
          </span>
        </span>
      ))}
    </div>
  );

  const renderQuestion = (question, submitFn, phaseLabel) => {
    let parsedOptions = null;
    if (question.options) {
      try {
        parsedOptions = typeof question.options === 'string'
          ? JSON.parse(question.options) : question.options;
        if (parsedOptions && !Object.values(parsedOptions).some(v => v)) parsedOptions = null;
      } catch (e) { parsedOptions = null; }
    }
    const isMCQ = ['mcq', 'true_false', 'assertion_reason'].includes(question.type) && parsedOptions;

    return (
      <div>
        <div className={styles.metaBadges}>
          <span className={`${styles.badge} ${styles.badgePurple}`}>{phaseLabel}</span>
          {question.subtopic && <span className={`${styles.badge} ${styles.badgeBlue}`}>{question.subtopic}</span>}
          {question.difficulty && <span className={styles.badge}>{question.difficulty}</span>}
        </div>

        <div className={styles.questionStem}>{question.stem}</div>

        {isMCQ && parsedOptions ? (
          <div className={styles.mcqOptions}>
            {Object.entries(parsedOptions).map(([label, text]) => {
              if (!text) return null;
              let optionClass = styles.mcqOption;
              if (feedback) {
                if (label === feedback.feedback?.correct_option) optionClass += ' ' + styles.mcqOptionCorrect;
                else if (label === selectedOption && !feedback.is_correct) optionClass += ' ' + styles.mcqOptionWrong;
              } else if (selectedOption === label) {
                optionClass += ' ' + styles.mcqOptionSelected;
              }
              return (
                <div
                  key={label}
                  className={optionClass}
                  onClick={() => { if (!feedback) setSelectedOption(label); }}
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
          !feedback && (
            <textarea
              className={styles.textarea}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer here..."
              disabled={submitting}
              rows={5}
            />
          )
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
            {feedback.teacher_response && (
              <div className={styles.feedbackTeacher}>{feedback.teacher_response}</div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {!feedback ? (
            <button
              className={styles.primaryButton}
              onClick={submitFn}
              disabled={submitting || (isMCQ ? !selectedOption : !answerText.trim())}
            >
              {submitting ? 'Evaluating...' : 'Submit Answer'}
            </button>
          ) : (
            <button className={styles.primaryButton} onClick={nextQuestion}>
              {currentIndex < questions.length - 1
                ? 'Next Question'
                : phase === 'concept_fixing' ? 'Continue to LAQ'
                : phase === 'laq' ? 'Continue to MCQ'
                : 'Check Mastery'}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (phase === 'loading' || loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (phase === 'no_session') {
    return (
      <div className={styles.card}>
        <div className={styles.emptyPhase}>
          <p>No topic learning session specified. Start a diagnostic first.</p>
          <button className={styles.primaryButton} onClick={() => router.push('/diagnostic')}>
            Go to Diagnostic
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={styles.card}>
        <div className={styles.error}>{error}</div>
        <button className={styles.secondaryButton} onClick={() => router.push('/diagnostic')}>
          Back to Diagnostic
        </button>
      </div>
    );
  }

  if (phase === 'concept_fixing') {
    const question = questions[currentIndex];
    if (!question) return null;
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
      <div>
        {renderPhaseTracker()}
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${styles.progressConceptFix}`} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Concept Fixing — Question {currentIndex + 1} of {questions.length}</div>
          {error && <div className={styles.error}>{error}</div>}
          {renderQuestion(question, submitConceptFixingAnswer, 'Concept Fix')}
        </div>
        <div className={styles.actions}>
          <button className={styles.skipButton} onClick={startLAQ}>Skip to LAQ →</button>
        </div>
      </div>
    );
  }

  if (phase === 'laq') {
    const question = questions[currentIndex];
    if (!question) return null;

    return (
      <div>
        {renderPhaseTracker()}
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${styles.progressLAQ}`} style={{ width: '100%' }} />
        </div>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Clinical Integration (LAQ)</div>
          {error && <div className={styles.error}>{error}</div>}
          {renderQuestion(question, submitLAQAnswer, 'LAQ')}
        </div>
        <div className={styles.actions}>
          <button className={styles.skipButton} onClick={startMCQ}>Skip to MCQ →</button>
        </div>
      </div>
    );
  }

  if (phase === 'mcq_consolidation') {
    const question = questions[currentIndex];
    if (!question) return null;
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
      <div>
        {renderPhaseTracker()}
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${styles.progressMCQ}`} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.card}>
          <div className={styles.mcqCounter}>
            <div className={styles.sectionTitle}>MCQ Consolidation — {currentIndex + 1} of {questions.length}</div>
            <div className={styles.mcqCounterText}>
              <span className={`${styles.mcqCounterScore} ${getScoreClass(mcqProgress.total > 0 ? (mcqProgress.correct / mcqProgress.total) * 100 : 0)}`}>
                {mcqProgress.correct}/{mcqProgress.completed}
              </span>
              {' '}correct
            </div>
          </div>
          {adaptiveInfo && (
            <div className={styles.adaptiveBadge}>
              <span className={styles.adaptiveLabel}>{adaptiveInfo.difficulty_label || 'Standard'}</span>
              {question?.difficulty && (
                <span className={`${styles.difficultyTag} ${styles[`diff_${question.difficulty}`]}`}>
                  {question.difficulty}
                </span>
              )}
            </div>
          )}
          {error && <div className={styles.error}>{error}</div>}
          {renderQuestion(question, submitMCQAnswer, 'MCQ')}
        </div>
      </div>
    );
  }

  if (phase === 'rapid_fire' && rapidFire?.questions?.length > 0) {
    const rfQ = rapidFire.questions[rfIndex];
    const rfProgress = ((rfIndex + 1) / rapidFire.questions.length) * 100;
    const isLastQ = rfIndex >= rapidFire.questions.length - 1;

    return (
      <div>
        {renderPhaseTracker()}
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${styles.progressRapidFire}`} style={{ width: `${rfProgress}%` }} />
        </div>
        <div className={styles.card}>
          <div className={styles.rfHeader}>
            <div className={styles.sectionTitle}>Rapid-Fire Recall — {rfIndex + 1} of {rapidFire.questions.length}</div>
            <div className={styles.rfScoreDisplay}>
              <span className={getScoreClass(rfScore.total > 0 ? (rfScore.correct / rfScore.total) * 100 : 100)}>
                {rfScore.correct}/{rfScore.total}
              </span>
            </div>
          </div>

          <div className={styles.rfDifficulty}>
            <span className={`${styles.badge} ${styles[`diff_${rfQ.difficulty}`]}`}>{rfQ.difficulty}</span>
            {rfQ.subtopic && <span className={`${styles.badge} ${styles.badgeBlue}`}>{rfQ.subtopic}</span>}
          </div>

          <div className={styles.rfQuestion}>{rfQ.question}</div>

          {!rfResult ? (
            <>
              <input
                type="text"
                className={styles.rfInput}
                value={rfAnswer}
                onChange={e => setRfAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && rfAnswer.trim()) checkRfAnswer(); }}
                placeholder="Type your answer..."
                autoFocus
              />
              {rfShowHint && rfQ.hint && (
                <div className={styles.rfHint}>{rfQ.hint}</div>
              )}
              <div className={styles.actions}>
                {!rfShowHint && rfQ.hint && (
                  <button className={styles.skipButton} onClick={() => setRfShowHint(true)}>
                    Show Hint
                  </button>
                )}
                <button
                  className={styles.primaryButton}
                  onClick={checkRfAnswer}
                  disabled={!rfAnswer.trim()}
                >
                  Check
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`${styles.rfResultBanner} ${rfResult.is_correct ? styles.rfCorrect : styles.rfWrong}`}>
                {rfResult.is_correct ? '✓ Correct!' : `✗ Answer: ${rfResult.correct_answer}`}
              </div>
              <div className={styles.actions}>
                <button className={styles.primaryButton} onClick={nextRfQuestion}>
                  {isLastQ ? 'See Results' : 'Next'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'results' && masteryResults) {
    const r = masteryResults;
    const isCompetencyAchieved = r.mastery_result === 'mastered'
      && (r.competency_score || 0) >= 80
      && (r.core_coverage || 0) >= 90;

    const topicStatus = isCompetencyAchieved ? 'green'
      : r.mastery_result === 'revision_required' ? 'yellow' : 'red';

    const statusLabels = { green: 'Competency Achieved', yellow: 'Revision Required', red: 'Relearn Core' };
    const statusEmoji = { green: '🟢', yellow: '🟡', red: '🔴' };

    const resultClass = r.mastery_result === 'mastered' ? styles.resultMastered
      : r.mastery_result === 'revision_required' ? styles.resultRevision
      : styles.resultRelearn;

    const compColor = r.competency_score >= 80 ? styles.scoreGood
      : r.competency_score >= 50 ? styles.scoreMedium
      : styles.scoreBad;

    return (
      <div>
        {renderPhaseTracker()}

        <div className={styles.statusBanner} data-status={topicStatus}>
          <span className={styles.statusEmoji}>{statusEmoji[topicStatus]}</span>
          <span className={styles.statusText}>{statusLabels[topicStatus]}</span>
        </div>

        <div className={styles.card}>
          <div className={styles.resultsSection}>
            <div className={`${styles.resultLevel} ${resultClass}`}>
              {r.mastery_result.replace(/_/g, ' ')}
            </div>

            <div className={`${styles.competencyScore} ${compColor}`}>
              {Math.round(r.competency_score)}
            </div>
            <div className={styles.competencyLabel}>Competency Score (0-100)</div>

            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{Math.round(r.mcq_accuracy || 0)}%</div>
                <div className={styles.statLabel}>MCQ Accuracy</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{Math.round(r.core_coverage || 0)}%</div>
                <div className={styles.statLabel}>Core Coverage</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{Math.round((r.saq_raw_score || 0) * 100)}%</div>
                <div className={styles.statLabel}>SAQ Score</div>
              </div>
            </div>

            {r.mcq_stats && (
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{r.mcq_stats.correct}</div>
                  <div className={styles.statLabel}>MCQ Correct</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{r.mcq_stats.total}</div>
                  <div className={styles.statLabel}>MCQ Total</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{r.mcq_stats.completed}</div>
                  <div className={styles.statLabel}>MCQ Attempted</div>
                </div>
              </div>
            )}

            {rfScore.total > 0 && (
              <div className={styles.rfSummaryBanner}>
                <span className={styles.rfSummaryLabel}>Rapid-Fire Recall:</span>
                <span className={getScoreClass(rfScore.total > 0 ? (rfScore.correct / rfScore.total) * 100 : 0)}>
                  {rfScore.correct}/{rfScore.total}
                </span>
              </div>
            )}

            {r.revision_schedule && (
              <div className={styles.revisionSchedule}>
                <div className={styles.revisionTitle}>Revision Schedule</div>
                <div className={styles.revisionDates}>
                  {r.revision_schedule.intervals_days.map((d, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() + d);
                    return (
                      <div key={i} className={styles.revisionDate}>
                        Day {d} — {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.postCompletionOptions}>
          <h3 className={styles.optionsTitle}>What's Next?</h3>

          <div className={styles.optionsGrid}>
            <div className={styles.optionCard} onClick={completeSession}>
              <div className={styles.optionIcon}>📝</div>
              <div className={styles.optionLabel}>Generate Exam Notes</div>
              <div className={styles.optionDesc}>15 trigger lines + diff table + recall bullets</div>
            </div>

            <div className={`${styles.optionCard} ${rfLoading ? styles.optionDisabled : ''}`} onClick={!rfLoading ? startRapidFire : undefined}>
              <div className={styles.optionIcon}>{rfLoading ? '⏳' : '⚡'}</div>
              <div className={styles.optionLabel}>{rfLoading ? 'Generating...' : 'Rapid-Fire Recall'}</div>
              <div className={styles.optionDesc}>10 quick recall questions to test retention</div>
            </div>

            <div
              className={`${styles.optionCard} ${revisionAdded ? styles.optionDone : ''}`}
              onClick={!revisionAdded && !addingRevision ? addToRevision : undefined}
            >
              <div className={styles.optionIcon}>{revisionAdded ? '✅' : addingRevision ? '⏳' : '📅'}</div>
              <div className={styles.optionLabel}>
                {revisionAdded ? 'Added to Schedule' : addingRevision ? 'Adding...' : 'Add to Revision Queue'}
              </div>
              <div className={styles.optionDesc}>
                {revisionAdded ? 'Revision reminders are set' : 'One-click spaced repetition scheduling'}
              </div>
            </div>

            <div className={styles.optionCard} onClick={() => router.push('/diagnostic')}>
              <div className={styles.optionIcon}>🔬</div>
              <div className={styles.optionLabel}>Diagnose Another Topic</div>
              <div className={styles.optionDesc}>Start a new diagnostic assessment</div>
            </div>
          </div>
        </div>

        {nextRec && (nextRec.primary_recommendation || (nextRec.alternatives && nextRec.alternatives.length > 0)) && (
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Recommended Next Topic</h3>
            <div className={styles.recSummary}>
              <span>{nextRec.total_mastered} topics mastered</span>
              {nextRec.total_weak > 0 && <span className={styles.recWeak}>{nextRec.total_weak} need attention</span>}
            </div>

            {nextRec.primary_recommendation && (
              <div
                className={styles.recPrimary}
                onClick={() => router.push(`/diagnostic?subject=${encodeURIComponent(nextRec.primary_recommendation.subject)}&topic=${encodeURIComponent(nextRec.primary_recommendation.topic)}`)}
              >
                <div className={styles.recPrimaryInfo}>
                  <div className={styles.recPrimaryTopic}>{nextRec.primary_recommendation.topic}</div>
                  <div className={styles.recPrimarySubject}>{nextRec.primary_recommendation.subject}</div>
                </div>
                <div className={styles.recPrimaryReason}>
                  <span className={`${styles.recReasonBadge} ${styles[`recReason_${nextRec.primary_recommendation.reason}`]}`}>
                    {nextRec.primary_recommendation.reason_label}
                  </span>
                </div>
                <div className={styles.recArrow}>→</div>
              </div>
            )}

            {nextRec.alternatives && nextRec.alternatives.length > 0 && (
              <div className={styles.recAlternatives}>
                {nextRec.alternatives.map((alt, idx) => (
                  <div
                    key={idx}
                    className={styles.recAltItem}
                    onClick={() => router.push(`/diagnostic?subject=${encodeURIComponent(alt.subject)}&topic=${encodeURIComponent(alt.topic)}`)}
                  >
                    <span className={styles.recAltTopic}>{alt.topic}</span>
                    <span className={styles.recAltSubject}>{alt.subject}</span>
                    <span className={`${styles.recReasonBadge} ${styles[`recReason_${alt.reason}`]}`}>
                      {alt.reason_label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.resultActions}>
          <button className={styles.secondaryButton} onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <div className={styles.loading}>Loading...</div>;
}

export default function TopicMasteryPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <h1 className={styles.title}>Topic Mastery</h1>
            <p className={styles.subtitle}>Structured learning: SAQ → LAQ → MCQ → Mastery Check</p>
            <TopicMasteryContent />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

