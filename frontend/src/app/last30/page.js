'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './last30.module.css';

function Last30Content() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [eligible, setEligible] = useState(null);
  const [selectedPhase, setSelectedPhase] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const subRes = await api.get('/subscription');
      const hasPremium = subRes.data.features.last_30_days_mode;
      setIsPremium(hasPremium);

      if (!hasPremium) {
        setLoading(false);
        return;
      }

      const statusRes = await api.get('/last30/status');
      setEligible(statusRes.data);

      if (statusRes.data.eligible) {
        const planRes = await api.get('/last30/plan');
        setPlan(planRes.data);
        if (planRes.data.current_phase) {
          setSelectedPhase(planRes.data.current_phase.phase);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load Last 30 Days plan');
    } finally {
      setLoading(false);
    }
  };

  const getPhaseClass = (phase) => {
    const map = {
      core_revision: styles.phaseCore,
      mcq_blitz: styles.phaseMcq,
      mock_tests: styles.phaseMock,
      rapid_recall: styles.phaseRecall
    };
    return map[phase] || '';
  };

  const getPriorityClass = (priority) => {
    const map = {
      critical: styles.priorityCritical,
      high: styles.priorityHigh,
      medium: styles.priorityMedium,
      low: styles.priorityLow
    };
    return map[priority] || styles.priorityMedium;
  };

  if (loading) {
    return <div className={styles.loading}>Loading Last 30 Days Mode...</div>;
  }

  if (!isPremium) {
    return (
      <div className={styles.premiumRequired}>
        <h2 className={styles.premiumTitle}>Premium Feature</h2>
        <p className={styles.premiumMessage}>Last 30 Days Revision Mode is available only to Premium subscribers.</p>
        <button className={styles.button} onClick={() => router.push('/subscription')}>Upgrade to Premium</button>
      </div>
    );
  }

  if (eligible && !eligible.eligible) {
    return (
      <div className={styles.notEligible}>
        <h2 className={styles.notEligibleTitle}>Not Yet Active</h2>
        <p className={styles.notEligibleMessage}>
          {eligible.reason || `Your exam is in ${eligible.days_remaining} days. This mode activates in the final 30 days.`}
        </p>
        {eligible.exam_date && (
          <p className={styles.notEligibleMessage}>Exam Date: {eligible.exam_date}</p>
        )}
        <p className={styles.notEligibleMessage}>
          {eligible.days_remaining > 30
            ? `This mode will activate in ${eligible.days_remaining - 30} days.`
            : 'Set your exam date in onboarding to use this feature.'}
        </p>
      </div>
    );
  }

  if (!plan) {
    return <div className={styles.loading}>No plan data available.</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Last 30 Days Mode</h1>
        <p className={styles.subtitle}>Intensive final sprint revision plan for exam success</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.countdownBanner}>
          <div className={styles.countdownLeft}>
            <h2>Exam Countdown</h2>
            <p>Exam Date: {plan.exam_date} &bull; {plan.daily_study_minutes} min/day</p>
          </div>
          <div className={styles.countdownRight}>
            <div className={styles.countdownNumber}>
              <div className={styles.countdownDigit}>{plan.days_remaining}</div>
              <div className={styles.countdownLabel}>Days Left</div>
            </div>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statGreen}`}>{plan.stats.mastered}</div>
            <div className={styles.statLabel}>Mastered</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statOrange}`}>{plan.stats.revision_required}</div>
            <div className={styles.statLabel}>Need Revision</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statRed}`}>{plan.stats.weak}</div>
            <div className={styles.statLabel}>Weak</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statBlue}`}>{plan.stats.notes_generated}</div>
            <div className={styles.statLabel}>Notes Ready</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue}`}>{plan.stats.mock_tests_done}</div>
            <div className={styles.statLabel}>Mocks Done</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue}`}>{plan.stats.avg_mock_score}%</div>
            <div className={styles.statLabel}>Avg Mock Score</div>
          </div>
        </div>

        <div className={styles.phaseNav}>
          {plan.phases.map((p) => (
            <button
              key={p.phase}
              className={`${styles.phaseTab} ${selectedPhase === p.phase ? styles.activePhase : ''} ${plan.current_phase.phase === p.phase ? styles.currentPhase : ''}`}
              onClick={() => setSelectedPhase(p.phase)}
            >
              {p.label}
              {plan.current_phase.phase === p.phase && ' ●'}
            </button>
          ))}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            Current Phase: {plan.current_phase.label}
          </h3>
          <div className={styles.phaseDetail}>
            <div className={styles.phaseInfo}>
              <p>{plan.current_phase.focus}</p>
              <p>Day {plan.current_phase.day_in_phase} of {plan.current_phase.day_end - plan.current_phase.day_start + 1}</p>
            </div>
          </div>
          <div className={styles.phaseProgress}>
            <div
              className={styles.phaseProgressFill}
              style={{ width: `${(plan.current_phase.day_in_phase / (plan.current_phase.day_end - plan.current_phase.day_start + 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Today&apos;s Tasks</h3>
          {plan.daily_plan.length === 0 ? (
            <p className={styles.emptyText}>No tasks generated for today.</p>
          ) : (
            <div className={styles.taskList}>
              {plan.daily_plan.map((task, idx) => (
                <div key={idx} className={styles.taskItem}>
                  <div className={`${styles.taskPriority} ${getPriorityClass(task.priority)}`} />
                  <div className={styles.taskDetails}>
                    <div className={styles.taskDescription}>{task.description}</div>
                    <div className={styles.taskMeta}>
                      {task.subject && `${task.subject}`}
                      {task.topic && ` › ${task.topic}`}
                      {!task.subject && task.type}
                    </div>
                  </div>
                  <div className={styles.taskDuration}>{task.duration} min</div>
                  <button
                    className={styles.taskAction}
                    onClick={() => router.push(task.action_url)}
                  >
                    Start
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {plan.stats.weak_subjects.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Weak Subjects (Priority Focus)</h3>
            <div className={styles.weakSubjects}>
              {plan.stats.weak_subjects.map((subj) => (
                <span key={subj} className={styles.weakBadge}>{subj}</span>
              ))}
            </div>
          </div>
        )}

        {plan.stats.subject_breakdown && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Subject Readiness</h3>
            <div className={styles.subjectGrid}>
              {Object.entries(plan.stats.subject_breakdown)
                .sort(([, a], [, b]) => a.avg_competency - b.avg_competency)
                .map(([subject, data]) => {
                  const pct = data.total > 0 ? (data.mastered / data.total) * 100 : 0;
                  const barColor = pct >= 70 ? '#4caf50' : pct >= 40 ? '#ff9800' : '#f44336';
                  return (
                    <div key={subject} className={styles.subjectRow}>
                      <span className={styles.subjectName}>{subject}</span>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                      <span className={styles.subjectStats}>{data.mastered}/{data.total} mastered</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {plan.countdown && plan.countdown.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>30-Day Countdown</h3>
            <div className={styles.countdownTimeline}>
              {plan.countdown.map((day) => (
                <div key={day.date} className={`${styles.countdownDay} ${getPhaseClass(day.phase)}`}>
                  <div className={styles.countdownDayNum}>{day.days_to_exam}d</div>
                  <div className={styles.countdownDayPhase}>{day.phase_label}</div>
                </div>
              ))}
            </div>
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: '#ff6b6b' }} />
                Core Revision
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: '#42a5f5' }} />
                MCQ Blitz
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: '#ff9800' }} />
                Mock Tests
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: '#4caf50' }} />
                Rapid Recall
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Last30Page() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <Last30Content />
      </div>
    </ProtectedRoute>
  );
}

