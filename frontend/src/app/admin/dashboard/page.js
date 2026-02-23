'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';
import styles from './dashboard.module.css';
import {
  LayoutDashboard, BookOpen, Users, Activity, TrendingUp, Clock,
  FileText, CheckCircle, AlertTriangle, BarChart3, Zap, Target,
  ArrowUpRight, ArrowDownRight, Minus, PlusCircle, Search, RefreshCw
} from 'lucide-react';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [platformStats, setPlatformStats] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [statsRes, questionsRes, sessionsRes] = await Promise.all([
        api.get('/admin/platform-stats'),
        api.get('/admin/questions'),
        api.get('/admin/sessions')
      ]);

      setPlatformStats(statsRes.data);
      setQuestions(questionsRes.data.questions || []);
      setSessions(sessionsRes.data.sessions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard data');
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

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const getSubjectBreakdown = () => {
    const subjects = {};
    questions.forEach(q => {
      if (q.subject) {
        subjects[q.subject] = (subjects[q.subject] || 0) + 1;
      }
    });
    return Object.entries(subjects)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  const getQuestionTypeBreakdown = () => {
    const types = { mcq: 0, saq: 0, laq: 0 };
    questions.forEach(q => {
      const t = (q.type || 'mcq').toLowerCase();
      if (types[t] !== undefined) types[t]++;
    });
    return types;
  };

  const getRecentSessions = () => {
    return sessions.slice(0, 8);
  };

  const getSessionCompletionRate = () => {
    if (!platformStats) return 0;
    const { total, completed } = platformStats.sessions;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getWeeklyActivity = () => {
    if (!platformStats?.recent_activity) return [];
    return platformStats.recent_activity.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
      count: d.attempts
    }));
  };

  if (loading) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <div className={styles.loadingScreen}>
            <div className={styles.loadingSpinner} />
            <p>Loading dashboard...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const subjectBreakdown = getSubjectBreakdown();
  const questionTypes = getQuestionTypeBreakdown();
  const recentSessions = getRecentSessions();
  const completionRate = getSessionCompletionRate();
  const weeklyActivity = getWeeklyActivity();
  const maxActivity = Math.max(...weeklyActivity.map(d => d.count), 1);

  const quickActions = [
    { href: '/admin/question-studio', icon: BookOpen, label: 'Question Studio', desc: 'Manage & create questions' },
    { href: '/admin/pdf-upload', icon: FileText, label: 'PDF Upload', desc: 'Extract PYQs from PDFs' },
    { href: '/admin/analytics', icon: BarChart3, label: 'Analytics', desc: 'Scores & difficulty analysis' },
    { href: '/student-progress', icon: Users, label: 'Student Progress', desc: 'Monitor student performance' },
    { href: '/distractor-lab', icon: Search, label: 'Distractor Lab', desc: 'Enrich MCQ distractors' },
    { href: '/question-quality', icon: CheckCircle, label: 'Quality Assurance', desc: 'Review question quality' },
  ];

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>

            <div className={styles.headerSection}>
              <div className={styles.greeting}>
                <h1 className={styles.greetingText}>{getGreeting()}, {user?.email?.split('@')[0] || 'Admin'}</h1>
                <p className={styles.dateText}>{formatDate()}</p>
              </div>
              <button className={styles.refreshBtn} onClick={fetchAllData} title="Refresh">
                <RefreshCw size={18} />
              </button>
            </div>

            {error && <div className={styles.error}><AlertTriangle size={16} /> {error}</div>}

            <div className={styles.metricsGrid}>
              <div className={`${styles.metricCard} ${styles.metricPrimary}`}>
                <div className={styles.metricIcon}><Users size={22} /></div>
                <div className={styles.metricBody}>
                  <span className={styles.metricValue}>{platformStats?.users?.students || 0}</span>
                  <span className={styles.metricLabel}>Active Students</span>
                </div>
                <div className={styles.metricTrend}>
                  <span className={styles.trendUp}><ArrowUpRight size={14} /> Live</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricIcon}><BookOpen size={22} /></div>
                <div className={styles.metricBody}>
                  <span className={styles.metricValue}>{platformStats?.questions?.total || 0}</span>
                  <span className={styles.metricLabel}>Total Questions</span>
                </div>
                <div className={styles.metricSub}>
                  {platformStats?.questions?.active || 0} active
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricIcon}><Activity size={22} /></div>
                <div className={styles.metricBody}>
                  <span className={styles.metricValue}>{platformStats?.attempts?.total || 0}</span>
                  <span className={styles.metricLabel}>Total Attempts</span>
                </div>
                <div className={styles.metricSub}>
                  Avg: {platformStats?.attempts?.avg_score || 0}%
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricIcon}><Target size={22} /></div>
                <div className={styles.metricBody}>
                  <span className={styles.metricValue}>{completionRate}%</span>
                  <span className={styles.metricLabel}>Completion Rate</span>
                </div>
                <div className={styles.metricSub}>
                  {platformStats?.sessions?.completed || 0}/{platformStats?.sessions?.total || 0}
                </div>
              </div>
            </div>

            <div className={styles.contentGrid}>
              <div className={styles.panelLarge}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><BarChart3 size={18} /> Weekly Activity</h2>
                </div>
                <div className={styles.panelBody}>
                  {weeklyActivity.length > 0 ? (
                    <div className={styles.activityChart}>
                      {weeklyActivity.map((d, i) => (
                        <div key={i} className={styles.activityColumn}>
                          <div className={styles.activityBarWrap}>
                            <div
                              className={styles.activityBarFill}
                              style={{ height: `${(d.count / maxActivity) * 100}%` }}
                            />
                          </div>
                          <span className={styles.activityLabel}>{d.date}</span>
                          <span className={styles.activityCount}>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyChart}>No activity data yet</div>
                  )}
                </div>
              </div>

              <div className={styles.panelSmall}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><Zap size={18} /> Question Types</h2>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.donutCenter}>
                    <span className={styles.donutTotal}>{questions.length}</span>
                    <span className={styles.donutLabel}>Total</span>
                  </div>
                  <div className={styles.typeBreakdown}>
                    <div className={styles.typeItem}>
                      <span className={`${styles.typeDot} ${styles.dotMcq}`} />
                      <span className={styles.typeName}>MCQ</span>
                      <span className={styles.typeCount}>{questionTypes.mcq}</span>
                    </div>
                    <div className={styles.typeItem}>
                      <span className={`${styles.typeDot} ${styles.dotSaq}`} />
                      <span className={styles.typeName}>SAQ</span>
                      <span className={styles.typeCount}>{questionTypes.saq}</span>
                    </div>
                    <div className={styles.typeItem}>
                      <span className={`${styles.typeDot} ${styles.dotLaq}`} />
                      <span className={styles.typeName}>LAQ</span>
                      <span className={styles.typeCount}>{questionTypes.laq}</span>
                    </div>
                  </div>
                  <div className={styles.typeBarComposite}>
                    {questionTypes.mcq > 0 && (
                      <div className={`${styles.typeBarSeg} ${styles.segMcq}`} style={{ flex: questionTypes.mcq }} />
                    )}
                    {questionTypes.saq > 0 && (
                      <div className={`${styles.typeBarSeg} ${styles.segSaq}`} style={{ flex: questionTypes.saq }} />
                    )}
                    {questionTypes.laq > 0 && (
                      <div className={`${styles.typeBarSeg} ${styles.segLaq}`} style={{ flex: questionTypes.laq }} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.contentGrid}>
              <div className={styles.panelLarge}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><TrendingUp size={18} /> Subject Distribution</h2>
                  <span className={styles.panelBadge}>{subjectBreakdown.length} subjects</span>
                </div>
                <div className={styles.panelBody}>
                  {subjectBreakdown.length > 0 ? (
                    <div className={styles.subjectList}>
                      {subjectBreakdown.map((s, i) => (
                        <div key={i} className={styles.subjectRow}>
                          <span className={styles.subjectRank}>#{i + 1}</span>
                          <span className={styles.subjectName}>{s.name}</span>
                          <div className={styles.subjectBarWrap}>
                            <div
                              className={styles.subjectBarFill}
                              style={{ width: `${(s.count / subjectBreakdown[0].count) * 100}%` }}
                            />
                          </div>
                          <span className={styles.subjectCount}>{s.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyChart}>No subjects yet</div>
                  )}
                </div>
              </div>

              <div className={styles.panelSmall}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}><Clock size={18} /> Recent Sessions</h2>
                </div>
                <div className={styles.panelBody}>
                  {recentSessions.length > 0 ? (
                    <div className={styles.sessionList}>
                      {recentSessions.map((s, i) => (
                        <div key={i} className={styles.sessionItem}>
                          <div className={styles.sessionInfo}>
                            <span className={styles.sessionSubject}>{s.subject || 'Unknown'}</span>
                            <span className={styles.sessionTopic}>{s.topic || '—'}</span>
                          </div>
                          <span className={`${styles.sessionStatus} ${s.status === 'completed' ? styles.statusDone : styles.statusActive}`}>
                            {s.status === 'completed' ? <CheckCircle size={12} /> : <Activity size={12} />}
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyChart}>No sessions yet</div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.quickActionsSection}>
              <h2 className={styles.sectionTitle}>Quick Actions</h2>
              <div className={styles.quickActionsGrid}>
                {quickActions.map((action, i) => (
                  <Link key={i} href={action.href} className={styles.quickActionCard}>
                    <div className={styles.qaIcon}><action.icon size={20} /></div>
                    <div className={styles.qaText}>
                      <span className={styles.qaLabel}>{action.label}</span>
                      <span className={styles.qaDesc}>{action.desc}</span>
                    </div>
                    <ArrowUpRight size={16} className={styles.qaArrow} />
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
