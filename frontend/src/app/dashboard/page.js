'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
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
            <div className={styles.loading}>Loading dashboard...</div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    if (error.includes('onboarding')) {
      return (
        <ProtectedRoute>
          <div>
            <Header />
            <main className={styles.main}>
              <div className={styles.container}>
                <div className={styles.card}>
                  <h2>Complete Onboarding</h2>
                  <p>Please complete your profile setup to access the dashboard.</p>
                  <button 
                    className={styles.button}
                    onClick={() => router.push('/onboarding')}
                  >
                    Go to Onboarding
                  </button>
                </div>
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
            <div className={styles.error}>{error}</div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  if (!data) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.error}>No data available</div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  const { profile, readiness, todaySchedule, sevenDaySchedule, topicMastery, recentSessions } = data;

  const getStatusColor = (status) => {
    switch (status) {
      case 'on_track': return '#4caf50';
      case 'borderline': return '#ff9800';
      case 'off_track': return '#f44336';
      default: return '#999';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'on_track': return 'On Track';
      case 'borderline': return 'Borderline';
      case 'off_track': return 'Off Track';
      default: return 'Unknown';
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <h1 className={styles.title}>Dashboard</h1>

            <div className={styles.profileSection}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Target Exam</h2>
                <div className={styles.profileGrid}>
                  <div className={styles.profileItem}>
                    <span className={styles.label}>Exam:</span>
                    <span className={styles.value}>{profile.target_exam || 'Not set'}</span>
                  </div>
                  <div className={styles.profileItem}>
                    <span className={styles.label}>Exam Date:</span>
                    <span className={styles.value}>
                      {profile.exam_date ? new Date(profile.exam_date).toLocaleDateString() : 'Not set'}
                    </span>
                  </div>
                  <div className={styles.profileItem}>
                    <span className={styles.label}>Target Score:</span>
                    <span className={styles.value}>{profile.target_score_band || 'Not set'}</span>
                  </div>
                  <div className={styles.profileItem}>
                    <span className={styles.label}>Study Capacity:</span>
                    <span className={styles.value}>
                      {profile.daily_study_minutes} min/day, {profile.weekly_question_target} questions/week
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Readiness Status</h2>
                <div className={styles.readinessContent}>
                  <div className={styles.readinessCircle}>
                    <div 
                      className={styles.readinessPercentage}
                      style={{ color: getStatusColor(readiness.status) }}
                    >
                      {readiness.percentage.toFixed(0)}%
                    </div>
                    <div 
                      className={styles.readinessStatus}
                      style={{ color: getStatusColor(readiness.status) }}
                    >
                      {getStatusText(readiness.status)}
                    </div>
                  </div>
                  <p className={styles.readinessMessage}>
                    {readiness.status === 'on_track' && 'You are on track to achieve your target score. Keep up the good work!'}
                    {readiness.status === 'borderline' && 'You are making progress but need to increase your study pace to meet your target.'}
                    {readiness.status === 'off_track' && 'You need to significantly increase your study time and focus to meet your target.'}
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.quickStartSection}>
              <h2 className={styles.sectionTitle}>Quick Start Practice</h2>
              <div className={styles.quickStartButtons}>
                <button 
                  className={styles.quickStartButton}
                  onClick={() => router.push('/practice?mode=balanced')}
                >
                  Balanced Mix
                </button>
                <button 
                  className={styles.quickStartButton}
                  onClick={() => router.push('/practice?mode=clinical')}
                >
                  More Clinical
                </button>
                <button 
                  className={styles.quickStartButton}
                  onClick={() => router.push('/practice?mode=rapid')}
                >
                  Rapid-Fire
                </button>
              </div>
            </div>

            <div className={styles.scheduleSection}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Today's Revision Plan</h2>
                {todaySchedule ? (
                  <div className={styles.todaySchedule}>
                    <div className={styles.scheduleItem}>
                      <span className={styles.scheduleLabel}>Questions:</span>
                      <span className={styles.scheduleValue}>{todaySchedule.planned_questions}</span>
                    </div>
                    <div className={styles.scheduleItem}>
                      <span className={styles.scheduleLabel}>Time:</span>
                      <span className={styles.scheduleValue}>{todaySchedule.planned_minutes} minutes</span>
                    </div>
                    <div className={styles.scheduleItem}>
                      <span className={styles.scheduleLabel}>Subjects:</span>
                      <span className={styles.scheduleValue}>
                        {todaySchedule.subjects?.join(', ') || 'None'}
                      </span>
                    </div>
                    <div className={styles.scheduleItem}>
                      <span className={styles.scheduleLabel}>Status:</span>
                      <span 
                        className={styles.scheduleValue}
                        style={{ color: getStatusColor(todaySchedule.status) }}
                      >
                        {todaySchedule.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.noSchedule}>No schedule for today. Complete onboarding to generate your revision plan.</p>
                )}
              </div>

              <div className={styles.card}>
                <h2 className={styles.cardTitle}>7-Day Schedule</h2>
                {sevenDaySchedule && sevenDaySchedule.length > 0 ? (
                  <div className={styles.sevenDaySchedule}>
                    {sevenDaySchedule.filter(day => day && day.date).map((day) => (
                      <div key={day.date || `day-${day.date}`} className={styles.scheduleDay}>
                        <div className={styles.dayDate}>
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className={styles.dayDetails}>
                          <span>{day.planned_questions} questions</span>
                          <span 
                            className={styles.dayStatus}
                            style={{ color: getStatusColor(day.status) }}
                          >
                            {day.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noSchedule}>No schedule available. Complete onboarding to generate your revision plan.</p>
                )}
              </div>
            </div>

            <div className={styles.statsSection}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Topic Mastery</h2>
                {topicMastery && topicMastery.length > 0 ? (
                  <div className={styles.topicMasteryList}>
                    {topicMastery.filter(topic => topic && topic.topic).map((topic) => (
                      <div key={`${topic.topic}-${topic.subject}` || `topic-${topic.topic}`} className={styles.topicItem}>
                        <div className={styles.topicInfo}>
                          <span className={styles.topicName}>{topic.topic}</span>
                          <span className={styles.topicSubject}>{topic.subject}</span>
                        </div>
                        <div className={styles.topicProgress}>
                          <div className={styles.progressBar}>
                            <div 
                              className={styles.progressFill}
                              style={{ width: `${topic.mastery_level}%` }}
                            />
                          </div>
                          <span className={styles.masteryLevel}>{topic.mastery_level.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noData}>Start practicing to see your topic mastery levels.</p>
                )}
              </div>

              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Recent Sessions</h2>
                {recentSessions && recentSessions.length > 0 ? (
                  <div className={styles.sessionsList}>
                    {recentSessions.filter(session => session && session.id).map((session) => (
                      <div key={session.id || `session-${session.started_at}`} className={styles.sessionItem}>
                        <div className={styles.sessionInfo}>
                          <span className={styles.sessionType}>{session.session_type}</span>
                          <span className={styles.sessionDate}>
                            {new Date(session.started_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className={styles.sessionStats}>
                          <span>{session.total_questions} questions</span>
                          {session.average_score && (
                            <span>Score: {session.average_score.toFixed(0)}%</span>
                          )}
                          <span className={styles.sessionStatus}>{session.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noData}>No practice sessions yet. Start practicing to see your history.</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
