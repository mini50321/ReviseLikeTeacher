'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './schedule.module.css';

export default function SchedulePage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard');
      if (response.data.sevenDaySchedule) {
        setSchedule(response.data.sevenDaySchedule);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Please complete onboarding to view your schedule');
      } else {
        setError(err.response?.data?.error || 'Failed to load schedule');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const isToday = (dateString) => {
    if (!dateString) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateString === today;
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.container}>
              <div className={styles.loading}>Loading schedule...</div>
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
            <h1 className={styles.title}>Revision Schedule</h1>
            <p className={styles.subtitle}>Your upcoming revision plan</p>

            {schedule.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No schedule available yet.</p>
                <p>Complete onboarding to generate your personalized revision schedule.</p>
                <a href="/onboarding" className={styles.button}>
                  Complete Onboarding
                </a>
              </div>
            ) : (
              <div className={styles.scheduleList}>
                {schedule.filter(item => item && item.date).map((item) => (
                  <div 
                    key={item.date || `schedule-${item.date}`} 
                    className={`${styles.scheduleItem} ${isToday(item.date) ? styles.today : ''}`}
                  >
                    <div className={styles.dateSection}>
                      <div className={styles.date}>{formatDate(item.date)}</div>
                      {isToday(item.date) && (
                        <span className={styles.todayBadge}>Today</span>
                      )}
                    </div>
                    <div className={styles.details}>
                      <div className={styles.detailItem}>
                        <span className={styles.label}>Questions:</span>
                        <span className={styles.value}>{item.planned_questions || 0}</span>
                      </div>
                      {item.subjects && (
                        <div className={styles.detailItem}>
                          <span className={styles.label}>Subjects:</span>
                          <span className={styles.value}>
                            {typeof item.subjects === 'string' 
                              ? item.subjects 
                              : Array.isArray(item.subjects) 
                                ? item.subjects.join(', ')
                                : 'N/A'}
                          </span>
                        </div>
                      )}
                      <div className={styles.status}>
                        <span className={`${styles.statusBadge} ${styles[item.status]}`}>
                          {item.status || 'scheduled'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

