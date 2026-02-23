'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './mock-tests.module.css';

function MockTestContent() {
  const router = useRouter();
  const [view, setView] = useState('list');
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState(200);
  const [durationMin, setDurationMin] = useState(210);

  const [examData, setExamData] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  const [resultData, setResultData] = useState(null);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      setError('');
      setNeedsUpgrade(false);
      const res = await api.get('/mock-tests');
      setTests(res.data.tests || []);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.upgrade_required) {
        setNeedsUpgrade(true);
      } else {
        setError(err.response?.data?.error || 'Failed to load mock tests');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError('');
      const res = await api.post('/mock-tests/generate', {
        total_questions: questionCount,
        duration_minutes: durationMin
      });
      await loadTests();
      handleStart(res.data.id);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.upgrade_required) {
        setNeedsUpgrade(true);
      } else {
        setError(err.response?.data?.error || 'Failed to generate mock test');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleStart = async (testId) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/mock-tests/${testId}/start`);
      if (res.data.error) {
        if (res.data.status === 'completed') {
          await viewResult(testId);
          return;
        }
        setError(res.data.error);
        setLoading(false);
        return;
      }
      setExamData(res.data);
      setCurrentQ(0);
      setAnswers({});
      setTimeLeft(res.data.duration_minutes * 60);
      setView('exam');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start test');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      setLoading(true);
      const res = await api.post(`/mock-tests/${examData.id}/submit`, { answers });
      setResultData(res.data);
      setView('result');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit test');
    } finally {
      setLoading(false);
    }
  }, [examData, answers]);

  useEffect(() => {
    if (view === 'exam' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [view, handleSubmit]);

  const viewResult = async (testId) => {
    try {
      setLoading(true);
      const res = await api.get(`/mock-tests/${testId}/result`);
      setResultData(res.data);
      setView('result');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const selectOption = (questionId, option) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading && view === 'list') {
    return <div className={styles.loading}>Loading mock tests...</div>;
  }

  if (needsUpgrade) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Full Mock Tests</h1>
          <div className={styles.upgradeCard}>
            <div className={styles.upgradeTitle}>Premium Feature</div>
            <p className={styles.upgradeText}>
              Full mock tests simulate the real NEET-PG exam with 200 MCQs across all subjects,
              timed sessions, and detailed remediation reports. Upgrade to Premium to unlock.
            </p>
            <button className={styles.upgradeBtn} onClick={() => router.push('/subscription')}>
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'exam' && examData) {
    const questions = examData.questions || [];
    const q = questions[currentQ];
    const answeredCount = Object.keys(answers).length;
    const isWarning = timeLeft < 300;

    return (
      <div className={styles.main}>
        <div className={styles.examContainer}>
          <div className={styles.examHeader}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{examData.title}</h2>
              <span className={styles.examProgress}>
                {answeredCount}/{questions.length} answered
              </span>
            </div>
            <div className={`${styles.examTimer} ${isWarning ? styles.timerWarning : ''}`}>
              {formatTime(timeLeft)}
            </div>
          </div>

          <div className={styles.navGrid}>
            {questions.map((_, idx) => {
              const isAnswered = !!answers[questions[idx]?.id];
              const isCurrent = idx === currentQ;
              const cls = [
                styles.navDot,
                isCurrent ? styles.navDotCurrent : '',
                isAnswered && !isCurrent ? styles.navDotAnswered : ''
              ].filter(Boolean).join(' ');
              return (
                <div key={idx} className={cls} onClick={() => setCurrentQ(idx)}>
                  {idx + 1}
                </div>
              );
            })}
          </div>

          {q && (
            <div className={styles.questionCard}>
              <div className={styles.questionNumber}>
                Question {currentQ + 1} of {questions.length}
              </div>
              <div className={styles.questionSubject}>
                {q.subject} — {q.topic}
              </div>
              <div className={styles.questionStem}>{q.stem}</div>

              <div className={styles.optionsList}>
                {q.options && (Array.isArray(q.options) ? q.options : Object.entries(q.options)).map((opt, oi) => {
                  const optKey = Array.isArray(q.options) ? opt : opt[0];
                  const optText = Array.isArray(q.options) ? opt : `${opt[0]}. ${opt[1]}`;
                  const isSelected = answers[q.id] === optKey;
                  return (
                    <div
                      key={oi}
                      className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ''}`}
                      onClick={() => selectOption(q.id, optKey)}
                    >
                      <span className={styles.optionLetter}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span>{typeof optText === 'string' ? optText : JSON.stringify(optText)}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.questionActions}>
                <button
                  className={styles.navBtn}
                  disabled={currentQ === 0}
                  onClick={() => setCurrentQ(prev => prev - 1)}
                >
                  ← Previous
                </button>
                {currentQ < questions.length - 1 ? (
                  <button
                    className={styles.navBtn}
                    onClick={() => setCurrentQ(prev => prev + 1)}
                  >
                    Next →
                  </button>
                ) : (
                  <button className={styles.submitBtn} onClick={handleSubmit}>
                    Submit Test
                  </button>
                )}
              </div>
            </div>
          )}

          {currentQ === questions.length - 1 && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button className={styles.submitBtn} onClick={handleSubmit}>
                Submit Test ({answeredCount}/{questions.length} answered)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'result' && resultData) {
    const r = resultData;
    const scoreColor = (r.score || 0) >= 80 ? '#81c784' : (r.score || 0) >= 50 ? '#ffb74d' : '#ef5350';
    const breakdown = r.subject_breakdown || [];
    const remediation = r.remediation_report || r.remediation || {};

    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <div className={styles.resultHeader}>
            <h1 className={styles.title}>{r.title || 'Mock Test Result'}</h1>
            <div className={styles.resultScore} style={{ color: scoreColor }}>
              {Math.round(r.score || 0)}%
            </div>
            <div className={styles.resultLabel}>Overall Score</div>
          </div>

          <div className={styles.resultStatsRow}>
            <div className={styles.resultStat}>
              <div className={styles.resultStatValue} style={{ color: '#81c784' }}>
                {r.correct_count || r.correct || 0}
              </div>
              <div className={styles.resultStatLabel}>Correct</div>
            </div>
            <div className={styles.resultStat}>
              <div className={styles.resultStatValue} style={{ color: '#ef5350' }}>
                {r.wrong_count || r.wrong || 0}
              </div>
              <div className={styles.resultStatLabel}>Wrong</div>
            </div>
            <div className={styles.resultStat}>
              <div className={styles.resultStatValue} style={{ color: '#9e9e9e' }}>
                {r.skipped_count || r.skipped || 0}
              </div>
              <div className={styles.resultStatLabel}>Skipped</div>
            </div>
            <div className={styles.resultStat}>
              <div className={styles.resultStatValue} style={{ color: '#42a5f5' }}>
                {r.total_questions || r.total || 0}
              </div>
              <div className={styles.resultStatLabel}>Total</div>
            </div>
          </div>

          {breakdown.length > 0 && (
            <div className={styles.subjectBreakdown}>
              <h3 className={styles.sectionTitle}>Subject Breakdown</h3>
              {breakdown.map((sb, idx) => {
                const accColor = sb.accuracy >= 80 ? '#81c784' : sb.accuracy >= 50 ? '#ffb74d' : '#ef5350';
                return (
                  <div key={idx} className={styles.subjectRow}>
                    <span className={styles.subjectName}>{sb.subject}</span>
                    <span className={styles.subjectDetail}>
                      {sb.correct}/{sb.total} correct
                    </span>
                    <div className={styles.subjectBar}>
                      <div
                        className={styles.subjectBarFill}
                        style={{ width: `${sb.accuracy}%`, background: accColor }}
                      />
                    </div>
                    <span className={styles.subjectAccuracy} style={{ color: accColor }}>
                      {Math.round(sb.accuracy)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {remediation && (remediation.priority_actions?.length > 0 || remediation.weak_topics?.length > 0) && (
            <div className={styles.remediationSection}>
              <div className={styles.remediationTitle}>Remediation Plan</div>

              {remediation.priority_actions?.length > 0 && (
                <div className={styles.actionList}>
                  {remediation.priority_actions.map((action, idx) => (
                    <div key={idx} className={styles.actionItem}>
                      <span className={styles.actionIcon}>⚠️</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              )}

              {remediation.weak_topics?.length > 0 && (
                <div className={styles.weakTopics} style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Weak Topics</h4>
                  {remediation.weak_topics.map((wt, idx) => (
                    <div key={idx} className={styles.weakTopicItem}>
                      <span className={styles.weakTopicName}>{wt.topic}</span>
                      <span className={styles.weakTopicSubject}>{wt.subject}</span>
                      <span className={styles.weakTopicAccuracy}>{wt.accuracy}%</span>
                    </div>
                  ))}
                </div>
              )}

              {remediation.strong_topics?.length > 0 && (
                <div className={styles.weakTopics} style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: '#81c784' }}>Strong Topics</h4>
                  {remediation.strong_topics.map((st, idx) => (
                    <div key={idx} className={styles.weakTopicItem}>
                      <span className={styles.weakTopicName}>{st.topic}</span>
                      <span className={styles.weakTopicSubject}>{st.subject}</span>
                      <span className={styles.weakTopicAccuracy} style={{ color: '#81c784' }}>{st.accuracy}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.resultActions}>
            <button
              className={`${styles.resultBtn} ${styles.resultBtnPrimary}`}
              onClick={() => { setView('list'); loadTests(); }}
            >
              Back to Mock Tests
            </button>
            <button
              className={`${styles.resultBtn} ${styles.resultBtnSecondary}`}
              onClick={() => router.push('/dashboard')}
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Full Mock Tests</h1>
        <p className={styles.subtitle}>Simulate the real NEET-PG exam with timed tests and remediation</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.generateSection}>
          <div className={styles.generateTitle}>Create New Mock Test</div>
          <p className={styles.generateDesc}>
            200 MCQs across all your subjects, weighted by NEET-PG distribution. ≥70% from Core + Frequent zones.
          </p>
          <div className={styles.generateOptions}>
            <div className={styles.optionGroup}>
              <label className={styles.optionLabel}>Questions</label>
              <input
                type="number"
                className={styles.optionInput}
                value={questionCount}
                onChange={e => setQuestionCount(Math.max(10, parseInt(e.target.value) || 200))}
                min={10}
                max={300}
              />
            </div>
            <div className={styles.optionGroup}>
              <label className={styles.optionLabel}>Duration (min)</label>
              <input
                type="number"
                className={styles.optionInput}
                value={durationMin}
                onChange={e => setDurationMin(Math.max(10, parseInt(e.target.value) || 210))}
                min={10}
                max={360}
              />
            </div>
          </div>
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate & Start'}
          </button>
        </div>

        {tests.length > 0 && (
          <div className={styles.historySection}>
            <h3 className={styles.sectionTitle}>Previous Tests</h3>
            <div className={styles.historyList}>
              {tests.map(t => {
                const statusCls = t.status === 'completed' ? styles.statusCompleted
                  : t.status === 'in_progress' ? styles.statusInProgress
                  : styles.statusCreated;

                return (
                  <div
                    key={t.id}
                    className={styles.historyCard}
                    onClick={() => t.status === 'completed' ? viewResult(t.id) : t.status === 'created' ? handleStart(t.id) : null}
                  >
                    <div className={styles.historyInfo}>
                      <div className={styles.historyTitle}>{t.title}</div>
                      <div className={styles.historyMeta}>
                        {t.total_questions} questions • {t.duration_minutes} min
                        {t.completed_at && ` • ${new Date(t.completed_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <span className={`${styles.historyStatus} ${statusCls}`}>{t.status.replace(/_/g, ' ')}</span>
                    {t.status === 'completed' && t.score != null && (
                      <span
                        className={styles.historyScore}
                        style={{ color: t.score >= 80 ? '#81c784' : t.score >= 50 ? '#ffb74d' : '#ef5350' }}
                      >
                        {Math.round(t.score)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tests.length === 0 && !loading && (
          <p className={styles.emptyText}>No mock tests yet. Generate one to get started!</p>
        )}
      </div>
    </div>
  );
}

export default function MockTestPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <MockTestContent />
      </div>
    </ProtectedRoute>
  );
}

