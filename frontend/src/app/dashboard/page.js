'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './dashboard.module.css';
import {
  Stethoscope, Brain, FileText, Shuffle, Activity, Zap, Search,
  CalendarDays, GraduationCap, Package, Target, LinkIcon, Puzzle,
  Clock, TrendingUp, BookOpen, CheckCircle, AlertTriangle, BarChart3,
  ArrowRight, RefreshCw
} from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (user?.role === 'admin') {
      window.location.href = '/admin/dashboard';
      return;
    }
    fetchDashboardData();
  }, [user, authLoading]);

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getDaysUntilExam = (examDate) => {
    if (!examDate) return null;
    const diff = new Date(examDate) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'on_track': return '#34d399';
      case 'borderline': return '#fbbf24';
      case 'off_track': return '#f87171';
      default: return 'rgba(255,255,255,0.5)';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'on_track': return 'On Track';
      case 'borderline': return 'Needs Attention';
      case 'off_track': return 'Off Track';
      default: return 'Unknown';
    }
  };

  const getMasteryColor = (level) => {
    if (level >= 85) return '#34d399';
    if (level >= 60) return '#fbbf24';
    return '#f87171';
  };

  if (authLoading || (user?.role === 'admin')) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.loadingScreen}>
              <div className={styles.loadingSpinner} />
              <p>Redirecting...</p>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.loadingScreen}>
              <div className={styles.loadingSpinner} />
              <p>Loading dashboard...</p>
            </div>
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
                <div className={styles.onboardingCard}>
                  <div className={styles.onboardingIcon}><BookOpen size={32} /></div>
                  <h2 className={styles.onboardingTitle}>Complete Your Profile</h2>
                  <p className={styles.onboardingDesc}>Set up your learning preferences to unlock the full adaptive mastery experience.</p>
                  <button className={styles.onboardingBtn} onClick={() => router.push('/onboarding')}>
                    Get Started <ArrowRight size={16} />
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
            <div className={styles.errorBanner}><AlertTriangle size={16} /> {error}</div>
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
            <div className={styles.errorBanner}>No data available</div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  const { profile, readiness, todaySchedule, sevenDaySchedule, topicMastery, recentSessions, todayPlanSummary } = data;
  const daysLeft = getDaysUntilExam(profile?.exam_date);
  const dueCount = todayPlanSummary?.due_count ?? 0;
  const weakCount = todayPlanSummary?.weak_count ?? 0;
  const doneToday = todayPlanSummary?.questions_done_today ?? 0;

  const quickLinks = [
    { href: '/today-plan', icon: Target, label: "Today's Plan", color: '#10b981' },
    { href: '/diagnostic', icon: Stethoscope, label: 'Diagnostic', color: '#4361ee' },
    { href: '/practice?mode=balanced', icon: Shuffle, label: 'Practice', color: '#7c3aed' },
    { href: '/misconceptions', icon: Brain, label: 'Misconceptions', color: '#ec4899' },
    { href: '/exam-notes', icon: FileText, label: 'Exam Notes', color: '#f59e0b' },
    { href: '/daily-plan', icon: CalendarDays, label: 'Daily Plan', color: '#06b6d4' },
    { href: '/mock-tests', icon: GraduationCap, label: 'Mock Tests', color: '#8b5cf6' },
  ];

  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>

            <div className={styles.headerRow}>
              <div className={styles.greeting}>
                <h1 className={styles.greetingText}>{getGreeting()}, {user?.email?.split('@')[0] || 'Student'}</h1>
                <p className={styles.greetingSub}>
                  {profile?.target_exam || 'NEET PG'} Preparation
                  {daysLeft !== null && <span className={styles.examCountdown}> · {daysLeft} days remaining</span>}
                </p>
              </div>
              <button className={styles.refreshBtn} onClick={fetchDashboardData} title="Refresh">
                <RefreshCw size={18} />
              </button>
            </div>

            <div className={styles.topRow}>
              <div className={styles.readinessCard}>
                <div className={styles.readinessHeader}>
                  <span className={styles.readinessLabel}>Readiness Score</span>
                  <span
                    className={styles.readinessBadge}
                    style={{ background: `${getStatusColor(readiness?.status)}20`, color: getStatusColor(readiness?.status) }}
                  >
                    {getStatusLabel(readiness?.status)}
                  </span>
                </div>
                <div className={styles.readinessBody}>
                  <div className={styles.readinessScore}>
                    <span className={styles.readinessValue} style={{ color: getStatusColor(readiness?.status) }}>
                      {(readiness?.percentage || 0).toFixed(0)}
                    </span>
                    <span className={styles.readinessPercent}>%</span>
                  </div>
                  <div className={styles.readinessRing}>
                    <svg viewBox="0 0 100 100" className={styles.ringSvg}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={getStatusColor(readiness?.status)}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(readiness?.percentage || 0) * 2.64} 264`}
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dasharray 1s ease' }}
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className={styles.infoCards}>
                <div className={styles.infoCard}>
                  <div className={styles.infoIconWrap} style={{ background: 'rgba(67,97,238,0.12)' }}>
                    <Target size={18} style={{ color: '#93a8f8' }} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoValue}>{profile?.target_score_band || '—'}</span>
                    <span className={styles.infoLabel}>Target Score</span>
                  </div>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIconWrap} style={{ background: 'rgba(52,211,153,0.12)' }}>
                    <Clock size={18} style={{ color: '#34d399' }} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoValue}>{profile?.daily_study_minutes || 0}<small>min</small></span>
                    <span className={styles.infoLabel}>Daily Study</span>
                  </div>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIconWrap} style={{ background: 'rgba(251,191,36,0.12)' }}>
                    <BarChart3 size={18} style={{ color: '#fbbf24' }} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoValue}>{profile?.weekly_question_target || 0}</span>
                    <span className={styles.infoLabel}>Weekly Goal</span>
                  </div>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIconWrap} style={{ background: 'rgba(139,92,246,0.12)' }}>
                    <TrendingUp size={18} style={{ color: '#a78bfa' }} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoValue}>{topicMastery?.length || 0}</span>
                    <span className={styles.infoLabel}>Topics Tracked</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.quickLinksSection}>
              <h2 className={styles.sectionTitle}>Quick Access</h2>
              <div className={styles.quickLinksGrid}>
                {quickLinks.map((ql, i) => (
                  <Link key={i} href={ql.href} className={styles.quickLinkCard}>
                    <div className={styles.qlIcon} style={{ background: `${ql.color}18` }}>
                      <ql.icon size={20} style={{ color: ql.color }} />
                    </div>
                    <span className={styles.qlLabel}>{ql.label}</span>
                    <ArrowRight size={14} className={styles.qlArrow} />
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.contentGrid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><Target size={16} /> Today&apos;s revision</h2>
                  <Link href="/today-plan" className={styles.panelLink}>View full plan</Link>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.todayGrid}>
                    <div className={styles.todayItem}>
                      <span className={styles.todayValue}>{dueCount}</span>
                      <span className={styles.todayLabel}>Due for revision</span>
                    </div>
                    <div className={styles.todayItem}>
                      <span className={styles.todayValue}>{weakCount}</span>
                      <span className={styles.todayLabel}>Weak areas</span>
                    </div>
                    <div className={styles.todayItem}>
                      <span className={styles.todayValue}>{doneToday}</span>
                      <span className={styles.todayLabel}>Done today</span>
                    </div>
                  </div>
                  {todaySchedule && (
                    <p className={styles.todayScheduleHint}>
                      Schedule: {todaySchedule.planned_questions} questions, {todaySchedule.planned_minutes} min
                    </p>
                  )}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><Clock size={16} /> 7-Day Schedule</h2>
                </div>
                <div className={styles.panelBody}>
                  {sevenDaySchedule && sevenDaySchedule.length > 0 ? (
                    <div className={styles.weekList}>
                      {sevenDaySchedule.filter(d => d?.date).map((day) => (
                        <div key={day.date} className={styles.weekRow}>
                          <span className={styles.weekDay}>
                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                          </span>
                          <div className={styles.weekBarWrap}>
                            <div
                              className={styles.weekBarFill}
                              style={{
                                width: `${Math.min(100, (day.planned_questions / Math.max(...sevenDaySchedule.map(d => d.planned_questions || 1))) * 100)}%`,
                                background: getStatusColor(day.status)
                              }}
                            />
                          </div>
                          <span className={styles.weekCount}>{day.planned_questions}q</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>No schedule available</div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.contentGrid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><TrendingUp size={16} /> Topic Mastery</h2>
                  <span className={styles.panelBadge}>{topicMastery?.length || 0} topics</span>
                </div>
                <div className={styles.panelBody}>
                  {topicMastery && topicMastery.length > 0 ? (
                    <div className={styles.masteryList}>
                      {topicMastery.filter(t => t?.topic).map((topic) => (
                        <div key={`${topic.topic}-${topic.subject}`} className={styles.masteryRow}>
                          <div className={styles.masteryInfo}>
                            <span className={styles.masteryTopic}>{topic.topic}</span>
                            <span className={styles.masterySubject}>{topic.subject}</span>
                          </div>
                          <div className={styles.masteryProgress}>
                            <div className={styles.masteryBarWrap}>
                              <div
                                className={styles.masteryBarFill}
                                style={{ width: `${topic.mastery_level}%`, background: getMasteryColor(topic.mastery_level) }}
                              />
                            </div>
                            <span className={styles.masteryPercent} style={{ color: getMasteryColor(topic.mastery_level) }}>
                              {topic.mastery_level.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>Start practicing to track mastery</div>
                  )}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><Activity size={16} /> Recent Sessions</h2>
                </div>
                <div className={styles.panelBody}>
                  {recentSessions && recentSessions.length > 0 ? (
                    <div className={styles.sessionsList}>
                      {recentSessions.filter(s => s?.id).map((session) => (
                        <div key={session.id} className={styles.sessionRow}>
                          <div className={styles.sessionLeft}>
                            <span className={styles.sessionType}>{session.session_type}</span>
                            <span className={styles.sessionDate}>
                              {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <div className={styles.sessionRight}>
                            <span className={styles.sessionQCount}>{session.total_questions}q</span>
                            {session.average_score != null && (
                              <span className={styles.sessionScore} style={{ color: getMasteryColor(session.average_score) }}>
                                {session.average_score.toFixed(0)}%
                              </span>
                            )}
                            <span className={`${styles.sessionStatusBadge} ${session.status === 'completed' ? styles.statusDone : styles.statusActive}`}>
                              {session.status === 'completed' ? <CheckCircle size={10} /> : <Activity size={10} />}
                              {session.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>No sessions yet</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
