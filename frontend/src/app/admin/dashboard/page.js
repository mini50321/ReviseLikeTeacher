'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import styles from './dashboard.module.css';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [questionsRes, sessionsRes] = await Promise.all([
        api.get('/admin/questions'),
        api.get('/admin/sessions')
      ]);

      const questions = questionsRes.data.questions || [];
      const sessions = sessionsRes.data.sessions || [];

      const totalQuestions = questions.length;
      const activeQuestions = questions.filter(q => q.status === 'active').length;
      const totalSessions = sessions.length;
      const completedSessions = sessions.filter(s => s.status === 'completed').length;

      setStats({
        totalQuestions,
        activeQuestions,
        totalSessions,
        completedSessions
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <div className={styles.loading}>Loading dashboard...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Admin Dashboard</h1>
              <div className={styles.actions}>
                <a href="/admin/question-studio" className={styles.actionButton}>
                  Manage Questions
                </a>
                <a href="/admin/question-studio?action=create" className={styles.actionButton}>
                  Create Question
                </a>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <h3 className={styles.statTitle}>Total Questions</h3>
                <p className={styles.statValue}>{stats?.totalQuestions || 0}</p>
              </div>
              <div className={styles.statCard}>
                <h3 className={styles.statTitle}>Active Questions</h3>
                <p className={styles.statValue}>{stats?.activeQuestions || 0}</p>
              </div>
              <div className={styles.statCard}>
                <h3 className={styles.statTitle}>Total Sessions</h3>
                <p className={styles.statValue}>{stats?.totalSessions || 0}</p>
              </div>
              <div className={styles.statCard}>
                <h3 className={styles.statTitle}>Completed Sessions</h3>
                <p className={styles.statValue}>{stats?.completedSessions || 0}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

