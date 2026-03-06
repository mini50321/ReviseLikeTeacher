'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './today-plan.module.css';

export default function TodayPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/today-plan')
      .then((res) => setPlan(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load plan'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ProtectedRoute>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <p className={styles.muted}>Loading...</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <p className={styles.error}>{error}</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  const due = plan?.due_revisions || [];
  const weak = plan?.weak_topics || [];
  const hasConceptMap = (plan?.suggested_actions || []).some((a) => a.type === 'concept_map');

  return (
    <ProtectedRoute>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Today&apos;s Plan</h1>
          <p className={styles.subtitle}>
            Focus on what matters today. Revise due topics and strengthen weak areas.
          </p>

          {plan?.exam_days_remaining != null && (
            <div className={styles.countdown}>
              <span className={styles.countdownLabel}>Days until exam</span>
              <span className={styles.countdownValue}>{plan.exam_days_remaining}</span>
            </div>
          )}

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{plan?.questions_done_today ?? 0}</span>
              <span className={styles.statLabel}>Done today</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{plan?.daily_study_minutes ?? 0}</span>
              <span className={styles.statLabel}>Min goal</span>
            </div>
          </div>

          {plan?.today_schedule && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Today&apos;s schedule</h2>
              <p className={styles.scheduleText}>
                {plan.today_schedule.planned_questions} questions, {plan.today_schedule.planned_minutes} min
              </p>
            </div>
          )}

          {due.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Due for revision</h2>
              <ul className={styles.actionList}>
                {due.map((d) => (
                  <li key={d.id || d.topic} className={styles.actionItem}>
                    <span className={styles.actionLabel}>{d.label}</span>
                    <div className={styles.actionButtons}>
                      <button type="button" className={styles.primaryBtn} onClick={() => router.push(d.route)}>
                        Practice
                      </button>
                      <button type="button" className={styles.secondaryBtn} onClick={() => router.push(d.diagnostic_route)}>
                        Diagnostic
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {weak.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Weak areas</h2>
              <ul className={styles.actionList}>
                {weak.map((w) => (
                  <li key={w.id || w.topic} className={styles.actionItem}>
                    <span className={styles.actionLabel}>{w.label}</span>
                    <button type="button" className={styles.primaryBtn} onClick={() => router.push(w.route)}>
                      Start diagnostic
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasConceptMap && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Concept map</h2>
              <button type="button" className={styles.primaryBtn} onClick={() => router.push('/concept-map')}>
                Open Concept Map
              </button>
            </div>
          )}

          {due.length === 0 && weak.length === 0 && !hasConceptMap && (
            <div className={styles.card}>
              <p className={styles.muted}>No revisions due today. Start a diagnostic or practice from the menu.</p>
              <div className={styles.emptyActions}>
                <button type="button" className={styles.primaryBtn} onClick={() => router.push('/diagnostic')}>
                  Diagnostic
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/practice')}>
                  Practice
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
