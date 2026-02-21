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
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [showPriorities, setShowPriorities] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      setError('');
      const [scheduleRes, priorityRes] = await Promise.all([
        api.get('/schedule'),
        api.get('/schedule/priorities').catch(() => ({ data: { priorities: [] } }))
      ]);
      if (scheduleRes.data.schedule) {
        setSchedule(scheduleRes.data.schedule);
      }
      setPriorities(priorityRes.data.priorities || []);
      setHasProfile(true);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Please complete onboarding to view your schedule');
        setHasProfile(false);
      } else {
        setError(err.response?.data?.error || 'Failed to load schedule');
        setHasProfile(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateSchedule = async () => {
    try {
      setGenerating(true);
      setError('');
      await api.post('/schedule');
      await fetchSchedule();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (date, status) => {
    try {
      await api.put(`/schedule/${date}`, { status });
      await fetchSchedule();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
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

  const getRetentionColor = (retention) => {
    if (retention >= 80) return '#4ade80';
    if (retention >= 60) return '#fbbf24';
    if (retention >= 40) return '#fb923c';
    return '#f87171';
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
              <a href="/onboarding" className={styles.button}>Complete Onboarding</a>
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
            <div className={styles.titleRow}>
              <div>
                <h1 className={styles.title}>Revision Schedule</h1>
                <p className={styles.subtitle}>Smart revision plan based on your performance</p>
              </div>
              <div className={styles.actions}>
                <button
                  onClick={generateSchedule}
                  disabled={generating}
                  className={styles.button}
                >
                  {generating ? 'Generating...' : 'Regenerate Schedule'}
                </button>
                {priorities.length > 0 && (
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setShowPriorities(!showPriorities)}
                  >
                    {showPriorities ? 'Hide Priorities' : 'Topic Priorities'}
                  </button>
                )}
              </div>
            </div>

            {showPriorities && priorities.length > 0 && (
              <div className={styles.prioritiesCard}>
                <h3 className={styles.prioritiesTitle}>Topic Priority Rankings</h3>
                <div className={styles.priorityList}>
                  {priorities.slice(0, 10).map((topic, idx) => (
                    <div key={`${topic.topic}-${topic.subject}`} className={styles.priorityItem}>
                      <div className={styles.priorityRank}>{idx + 1}</div>
                      <div className={styles.priorityInfo}>
                        <span className={styles.priorityTopic}>{topic.topic}</span>
                        <span className={styles.prioritySubject}>{topic.subject}</span>
                      </div>
                      <div className={styles.priorityMeta}>
                        <span className={styles.priorityTag} style={{ color: getRetentionColor(topic.retention) }}>
                          {topic.retention}% retention
                        </span>
                        <span className={styles.priorityTag}>
                          {Math.round(topic.mastery_level || 0)}% mastery
                        </span>
                        <span className={styles.urgencyTag}>
                          Priority: {topic.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {schedule.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No schedule available yet.</p>
                {hasProfile ? (
                  <>
                    <p>Click the button above to generate your personalized revision schedule.</p>
                  </>
                ) : (
                  <>
                    <p>Complete onboarding to generate your personalized revision schedule.</p>
                    <a href="/onboarding" className={styles.button}>Complete Onboarding</a>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.scheduleList}>
                {schedule.filter(item => item && item.date).map((item) => (
                  <div
                    key={item.date}
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
                      <div className={styles.detailItem}>
                        <span className={styles.label}>Minutes:</span>
                        <span className={styles.value}>{item.planned_minutes || 0}</span>
                      </div>
                      {item.subjects && (
                        <div className={styles.detailItem}>
                          <span className={styles.label}>Subjects:</span>
                          <span className={styles.value}>
                            {Array.isArray(item.subjects)
                              ? item.subjects.join(', ')
                              : typeof item.subjects === 'string' ? item.subjects : 'N/A'}
                          </span>
                        </div>
                      )}
                      {item.topics && Array.isArray(item.topics) && item.topics.length > 0 && (
                        <div className={styles.detailItem}>
                          <span className={styles.label}>Focus:</span>
                          <span className={styles.value}>
                            {item.topics.slice(0, 3).join(', ')}
                            {item.topics.length > 3 ? ` +${item.topics.length - 3} more` : ''}
                          </span>
                        </div>
                      )}
                      {item.difficulty_mix && (
                        <div className={styles.difficultyMix}>
                          {Object.entries(item.difficulty_mix).map(([level, pct]) => (
                            <span key={level} className={styles.diffTag}>
                              {level}: {Math.round(pct * 100)}%
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.statusRow}>
                        <span className={`${styles.statusBadge} ${styles[item.status]}`}>
                          {item.status || 'scheduled'}
                        </span>
                        {item.status === 'scheduled' && (
                          <div className={styles.statusActions}>
                            <button
                              className={styles.completeBtn}
                              onClick={() => updateStatus(item.date, 'complete')}
                            >
                              Complete
                            </button>
                            <button
                              className={styles.skipBtn}
                              onClick={() => updateStatus(item.date, 'skipped')}
                            >
                              Skip
                            </button>
                          </div>
                        )}
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
