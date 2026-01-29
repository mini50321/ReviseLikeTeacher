'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './metrics-lab.module.css';

export default function MetricsLabPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard');
      setAnalytics(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Please complete onboarding to view analytics');
      } else {
        setError(err.response?.data?.error || 'Failed to load analytics');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.container}>
              <div className={styles.loading}>Loading analytics...</div>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.container}>
              <div className={styles.error}>{error}</div>
              <a href="/onboarding" className={styles.button}>
                Complete Onboarding
              </a>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <h1 className={styles.title}>Analytics & Metrics</h1>
            <p className={styles.subtitle}>Track your progress and performance</p>

            {analytics && (
              <div className={styles.analyticsGrid}>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Exam Readiness</h3>
                  <div className={styles.readinessScore}>
                    <span className={styles.score}>{analytics.readiness?.percentage || 0}%</span>
                    <span className={styles.status}>{analytics.readiness?.status || 'off_track'}</span>
                  </div>
                  <p className={styles.cardDescription}>
                    Your current readiness level for the exam
                  </p>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Topic Mastery</h3>
                  <div className={styles.masteryList}>
                    {analytics.topicMastery && analytics.topicMastery.length > 0 ? (
                      analytics.topicMastery.slice(0, 5).filter(topic => topic && topic.topic).map((topic) => (
                        <div key={`${topic.topic}-${topic.subject}` || `topic-${topic.topic}`} className={styles.masteryItem}>
                          <div className={styles.masteryInfo}>
                            <span className={styles.topicName}>{topic.topic}</span>
                            <span className={styles.subjectName}>{topic.subject}</span>
                          </div>
                          <div className={styles.masteryBar}>
                            <div 
                              className={styles.masteryFill}
                              style={{ width: `${topic.mastery_level || 0}%` }}
                            />
                          </div>
                          <span className={styles.masteryPercent}>
                            {Math.round(topic.mastery_level || 0)}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className={styles.emptyText}>No mastery data yet</p>
                    )}
                  </div>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Recent Sessions</h3>
                  <div className={styles.sessionsList}>
                    {analytics.recentSessions && analytics.recentSessions.length > 0 ? (
                      analytics.recentSessions.filter(session => session && session.id).map((session) => (
                        <div key={session.id || `session-${session.started_at}`} className={styles.sessionItem}>
                          <div className={styles.sessionType}>{session.session_type}</div>
                          <div className={styles.sessionStats}>
                            <span>Questions: {session.total_questions || 0}</span>
                            {session.average_score && (
                              <span>Score: {Math.round(session.average_score)}%</span>
                            )}
                          </div>
                          <div className={styles.sessionStatus}>{session.status}</div>
                        </div>
                      ))
                    ) : (
                      <p className={styles.emptyText}>No sessions yet</p>
                    )}
                  </div>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Study Goals</h3>
                  <div className={styles.goalsList}>
                    <div className={styles.goalItem}>
                      <span className={styles.goalLabel}>Daily Study Time:</span>
                      <span className={styles.goalValue}>
                        {analytics.profile?.daily_study_minutes || 0} minutes
                      </span>
                    </div>
                    <div className={styles.goalItem}>
                      <span className={styles.goalLabel}>Weekly Questions:</span>
                      <span className={styles.goalValue}>
                        {analytics.profile?.weekly_question_target || 0} questions
                      </span>
                    </div>
                    <div className={styles.goalItem}>
                      <span className={styles.goalLabel}>Target Exam:</span>
                      <span className={styles.goalValue}>
                        {analytics.profile?.target_exam || 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

