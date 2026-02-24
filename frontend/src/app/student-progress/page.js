'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, ClipboardList, User } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './student-progress.module.css';

function StudentProgressContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await api.get('/student-progress/overview');
      setOverview(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/student-progress/alerts');
      setAlerts(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load alerts');
    }
  };

  const fetchStudents = async (search = '') => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/student-progress/students${params}`);
      setStudents(res.data.students || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load students');
    }
  };

  const fetchStudentDetail = async (userId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/student-progress/students/${userId}`);
      setStudentDetail(res.data);
      setSelectedStudent(userId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load student detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'alerts' && !alerts) fetchAlerts();
    if (activeTab === 'students' && students.length === 0) fetchStudents();
  }, [activeTab]);

  const handleSearch = () => {
    fetchStudents(searchQuery);
  };

  const getStatusDot = (status) => {
    const map = { active: styles.dotActive, at_risk: styles.dotAtRisk, inactive: styles.dotInactive, never_started: styles.dotNever };
    return map[status] || styles.dotNever;
  };

  const getAccuracyClass = (acc) => {
    if (acc >= 70) return styles.accHigh;
    if (acc >= 40) return styles.accMed;
    return styles.accLow;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderOverview = () => {
    if (!overview) return <div className={styles.loading}>Loading overview...</div>;

    const maxAttempts = Math.max(...(overview.weekly_activity || []).map(d => d.attempts), 1);

    return (
      <>
        <div className={styles.overviewGrid}>
          <div className={styles.overviewCard}>
            <div className={styles.overviewValue}>{overview.total_students}</div>
            <div className={styles.overviewLabel}>Total Students</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${styles.green}`}>{overview.active_students_7d}</div>
            <div className={styles.overviewLabel}>Active (7d)</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewValue}>{overview.new_signups_7d}</div>
            <div className={styles.overviewLabel}>New Signups (7d)</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewValue}>{overview.total_attempts?.toLocaleString()}</div>
            <div className={styles.overviewLabel}>Total Attempts</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${overview.platform_accuracy >= 60 ? styles.green : styles.orange}`}>{overview.platform_accuracy}%</div>
            <div className={styles.overviewLabel}>Platform Accuracy</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${styles.green}`}>{overview.topics_mastered}</div>
            <div className={styles.overviewLabel}>Topics Mastered</div>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Weekly Activity (14 days)</div>
            <div className={styles.activityTimeline}>
              {(overview.weekly_activity || []).map((day, i) => (
                <div key={i} className={styles.activityDay}>
                  <span className={styles.activityDate}>{new Date(day.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <div className={styles.activityBar}>
                    <div className={styles.activityBarFill} style={{ width: `${Math.max((day.attempts / maxAttempts) * 100, 5)}%` }}>
                      <span className={styles.activityBarText}>{day.attempts}</span>
                    </div>
                  </div>
                  <span className={styles.activityUsers}>{day.users} users</span>
                </div>
              ))}
              {(!overview.weekly_activity || overview.weekly_activity.length === 0) && (
                <div className={styles.emptyState}>No activity data yet</div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Weakest Subjects (by accuracy)</div>
            <div className={styles.chartList}>
              {(overview.accuracy_by_subject || []).slice(0, 10).map((s, i) => (
                <div key={i} className={styles.chartItem}>
                  <span className={styles.chartLabel} title={s.subject}>{s.subject}</span>
                  <div className={styles.chartBar}>
                    <div
                      className={`${styles.chartBarFill} ${s.avg_accuracy >= 70 ? styles.fillGreen : s.avg_accuracy >= 40 ? styles.fillOrange : styles.fillRed}`}
                      style={{ width: `${s.avg_accuracy}%` }}
                    />
                  </div>
                  <span className={styles.chartValue}>{s.avg_accuracy}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Common Weak Topics</div>
            <div className={styles.chartList}>
              {(overview.common_weak_topics || []).map((t, i) => (
                <div key={i} className={styles.chartItem}>
                  <span className={styles.chartLabel} title={`${t.subject} → ${t.topic}`}>{t.topic}</span>
                  <div className={styles.chartBar}>
                    <div className={`${styles.chartBarFill} ${styles.fillRed}`} style={{ width: `${Math.min((t.student_count / overview.total_students) * 100, 100)}%` }} />
                  </div>
                  <span className={styles.chartValue}>{t.student_count}</span>
                </div>
              ))}
              {(!overview.common_weak_topics || overview.common_weak_topics.length === 0) && (
                <div className={styles.emptyState}>No weak topics data</div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Distribution</div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.35rem' }}>Subscription Tiers</div>
              <div>
                {Object.entries(overview.tier_distribution || {}).map(([tier, count]) => (
                  <span key={tier} className={`${styles.distPill} ${styles[`dist${tier.charAt(0).toUpperCase() + tier.slice(1)}`] || styles.distFree}`}>
                    {tier}: {count}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.35rem' }}>Goal Tiers</div>
              <div>
                {Object.entries(overview.goal_distribution || {}).map(([goal, count]) => (
                  <span key={goal} className={`${styles.distPill} ${styles.distFree}`}>
                    {goal}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderAlerts = () => {
    if (!alerts) return <div className={styles.loading}>Loading alerts...</div>;

    return (
      <>
        <div className={styles.overviewGrid} style={{ marginBottom: '1.5rem' }}>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${styles.red}`}>{alerts.total_alerts}</div>
            <div className={styles.overviewLabel}>Total Alerts</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${styles.orange}`}>{alerts.inactive?.length || 0}</div>
            <div className={styles.overviewLabel}>Inactive (7d+)</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={`${styles.overviewValue} ${styles.red}`}>{alerts.struggling?.length || 0}</div>
            <div className={styles.overviewLabel}>Struggling (&lt;40%)</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewValue}>{alerts.never_started?.length || 0}</div>
            <div className={styles.overviewLabel}>Never Started</div>
          </div>
        </div>

        <div className={styles.alertsContainer}>
          <div className={styles.alertCard}>
            <div className={styles.alertTitle}>
              <span className={styles.alertIcon}><AlertTriangle size={18} strokeWidth={2} /></span> Inactive Students
            </div>
            <div className={styles.alertList}>
              {(alerts.inactive || []).map((s, i) => (
                <div key={i} className={styles.alertItem} onClick={() => fetchStudentDetail(s.id)}>
                  <span className={styles.alertName}>{s.full_name || s.email}</span>
                  <span className={`${styles.alertBadge} ${styles.badgeOrange}`}>
                    {Math.floor((Date.now() - new Date(s.last_activity).getTime()) / 86400000)}d ago
                  </span>
                </div>
              ))}
              {(!alerts.inactive || alerts.inactive.length === 0) && <div className={styles.emptyState}>None</div>}
            </div>
          </div>

          <div className={styles.alertCard}>
            <div className={styles.alertTitle}>
              <span className={styles.alertIcon}><AlertCircle size={18} strokeWidth={2} /></span> Struggling Students
            </div>
            <div className={styles.alertList}>
              {(alerts.struggling || []).map((s, i) => (
                <div key={i} className={styles.alertItem} onClick={() => fetchStudentDetail(s.id)}>
                  <span className={styles.alertName}>{s.full_name || s.email}</span>
                  <span className={`${styles.alertBadge} ${styles.badgeRed}`}>{s.accuracy}%</span>
                </div>
              ))}
              {(!alerts.struggling || alerts.struggling.length === 0) && <div className={styles.emptyState}>None</div>}
            </div>
          </div>

          <div className={styles.alertCard}>
            <div className={styles.alertTitle}>
              <span className={styles.alertIcon}><ClipboardList size={18} strokeWidth={2} /></span> Overdue Revisions
            </div>
            <div className={styles.alertList}>
              {(alerts.overdue_revisions || []).map((s, i) => (
                <div key={i} className={styles.alertItem} onClick={() => fetchStudentDetail(s.id)}>
                  <span className={styles.alertName}>{s.full_name || s.email}</span>
                  <span className={`${styles.alertBadge} ${styles.badgeRed}`}>{s.overdue_count} overdue</span>
                </div>
              ))}
              {(!alerts.overdue_revisions || alerts.overdue_revisions.length === 0) && <div className={styles.emptyState}>None</div>}
            </div>
          </div>

          <div className={styles.alertCard}>
            <div className={styles.alertTitle}>
              <span className={styles.alertIcon}><User size={18} strokeWidth={2} /></span> Never Started
            </div>
            <div className={styles.alertList}>
              {(alerts.never_started || []).map((s, i) => (
                <div key={i} className={styles.alertItem} onClick={() => fetchStudentDetail(s.id)}>
                  <span className={styles.alertName}>{s.full_name || s.email}</span>
                  <span className={`${styles.alertBadge} ${styles.badgeGray}`}>Joined {formatDate(s.joined_at)}</span>
                </div>
              ))}
              {(!alerts.never_started || alerts.never_started.length === 0) && <div className={styles.emptyState}>None</div>}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderStudentList = () => {
    return (
      <>
        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className={styles.searchButton} onClick={handleSearch}>Search</button>
        </div>

        {students.length === 0 ? (
          <div className={styles.emptyState}>No students found. Click Search to load.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.studentTable}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Name / Email</th>
                  <th>Tier</th>
                  <th>Goal</th>
                  <th>Attempts</th>
                  <th>Accuracy</th>
                  <th>Mastered</th>
                  <th>Sessions</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className={styles.clickableRow} onClick={() => fetchStudentDetail(s.id)}>
                    <td>
                      <span className={`${styles.statusDot} ${getStatusDot(s.status)}`}></span>
                      <span className={styles.statusLabel}>{s.status?.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.full_name || '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#888' }}>{s.email}</div>
                    </td>
                    <td>
                      <span className={`${styles.tierTag} ${styles[`tier_${s.subscription_tier}`]}`}>{s.subscription_tier}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#555' }}>{s.goal_tier || '—'}</td>
                    <td>{s.total_attempts}</td>
                    <td>
                      <span className={`${styles.accuracyBadge} ${getAccuracyClass(s.accuracy)}`}>{s.accuracy}%</span>
                    </td>
                    <td>{s.mastered_topics}</td>
                    <td>{s.sessions_completed}</td>
                    <td style={{ fontSize: '0.85rem', color: '#888' }}>
                      {s.last_activity ? formatDate(s.last_activity) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  const renderStudentDetail = () => {
    if (detailLoading) return <div className={styles.loading}>Loading student details...</div>;
    if (!studentDetail) return null;

    const { profile, stats, mastery, sessions, subject_breakdown, misconceptions, revision, competency_trend, mock_tests, diagnostics } = studentDetail;

    return (
      <>
        <button className={styles.backButton} onClick={() => { setSelectedStudent(null); setStudentDetail(null); }}>
          ← Back to List
        </button>

        <div className={styles.detailHeader}>
          <div className={styles.detailName}>{profile.full_name || 'Student'}</div>
          <div className={styles.detailEmail}>{profile.email}</div>
          <div className={styles.detailMeta}>
            <span className={styles.metaItem}>Joined: <strong>{formatDate(profile.joined_at)}</strong></span>
            <span className={styles.metaItem}>Goal: <strong>{profile.goal_tier || '—'}</strong></span>
            <span className={styles.metaItem}>Category: <strong>{profile.student_category || '—'}</strong></span>
            <span className={styles.metaItem}>Tier: <strong>{profile.subscription_tier || 'free'}</strong></span>
            <span className={styles.metaItem}>Exam: <strong>{formatDate(profile.exam_date)}</strong></span>
            <span className={styles.metaItem}>Daily Hours: <strong>{profile.daily_study_hours || '—'}</strong></span>
          </div>
        </div>

        <div className={styles.detailStatsGrid}>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue}>{stats.total_attempts}</div>
            <div className={styles.detailStatLabel}>Total Attempts</div>
          </div>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue} style={{ color: stats.accuracy >= 70 ? '#10b981' : stats.accuracy >= 40 ? '#f59e0b' : '#ef4444' }}>{stats.accuracy}%</div>
            <div className={styles.detailStatLabel}>Accuracy</div>
          </div>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue}>{stats.subjects_practiced}</div>
            <div className={styles.detailStatLabel}>Subjects</div>
          </div>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue} style={{ color: '#10b981' }}>{mastery.by_status?.mastered || 0}</div>
            <div className={styles.detailStatLabel}>Mastered</div>
          </div>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue} style={{ color: '#f59e0b' }}>{mastery.by_status?.revision_required || 0}</div>
            <div className={styles.detailStatLabel}>Needs Revision</div>
          </div>
          <div className={styles.detailStatCard}>
            <div className={styles.detailStatValue}>{revision.adherence}%</div>
            <div className={styles.detailStatLabel}>Revision Adherence</div>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Mastery Breakdown</div>
            <div className={styles.masteryGrid}>
              {Object.entries(mastery.by_status || {}).map(([status, count]) => (
                <span key={status} className={`${styles.masteryPill} ${styles[`mastery_${status}`] || ''}`}>
                  {status.replace(/_/g, ' ')}: {count}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Revision Status</div>
            <div className={styles.revisionBar}>
              <div className={styles.revisionStat}>
                <div className={styles.revisionStatValue} style={{ color: '#4361ee' }}>{revision.total}</div>
                <div className={styles.revisionStatLabel}>Total</div>
              </div>
              <div className={styles.revisionStat}>
                <div className={styles.revisionStatValue} style={{ color: '#10b981' }}>{revision.completed}</div>
                <div className={styles.revisionStatLabel}>Completed</div>
              </div>
              <div className={styles.revisionStat}>
                <div className={styles.revisionStatValue} style={{ color: '#ef4444' }}>{revision.overdue}</div>
                <div className={styles.revisionStatLabel}>Overdue</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Subject-wise Accuracy</div>
            {(subject_breakdown || []).map((s, i) => (
              <div key={i} className={styles.subjectRow}>
                <span className={styles.subjectName}>{s.subject}</span>
                <div className={styles.subjectBarWrap}>
                  <div
                    className={styles.subjectBarFill}
                    style={{
                      width: `${s.accuracy}%`,
                      background: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444'
                    }}
                  />
                </div>
                <span className={styles.subjectAcc} style={{ color: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444' }}>
                  {s.accuracy}%
                </span>
              </div>
            ))}
            {(!subject_breakdown || subject_breakdown.length === 0) && <div className={styles.emptyState}>No data yet</div>}
          </div>

          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Misconception Types</div>
            {(misconceptions || []).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {misconceptions.map((m, i) => (
                  <span key={i} className={styles.miscTag}>
                    {m.misconception_type} ({m.count})
                  </span>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No misconceptions logged</div>
            )}
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Recent Learning Sessions</div>
            <div className={styles.sessionList}>
              {(sessions || []).slice(0, 15).map((s, i) => (
                <div key={i} className={styles.sessionItem}>
                  <span className={styles.sessionSubject}>{s.subject}</span>
                  <span className={styles.sessionTopic}>{s.topic}</span>
                  <span className={`${styles.sessionPhase} ${styles[`phase_${s.current_phase}`] || ''}`}>{s.current_phase?.replace(/_/g, ' ')}</span>
                  <span className={styles.sessionDate}>{formatDate(s.started_at)}</span>
                </div>
              ))}
              {(!sessions || sessions.length === 0) && <div className={styles.emptyState}>No sessions</div>}
            </div>
          </div>

          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Competency Score Trend</div>
            <div className={styles.trendList}>
              {(competency_trend || []).slice(0, 10).map((t, i) => (
                <div key={i} className={styles.trendItem}>
                  <span className={styles.trendTopic}>{t.topic}</span>
                  <span className={`${styles.trendScore} ${t.score >= 80 ? styles.scoreHigh : t.score >= 60 ? styles.scoreMed : styles.scoreLow}`}>
                    {parseFloat(t.score).toFixed(0)}
                  </span>
                </div>
              ))}
              {(!competency_trend || competency_trend.length === 0) && <div className={styles.emptyState}>No data</div>}
            </div>
          </div>
        </div>

        {mock_tests && mock_tests.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Mock Tests</div>
            <div className={styles.mockList}>
              {mock_tests.map((m, i) => (
                <div key={i} className={styles.mockItem}>
                  <span className={styles.mockTitle}>{m.title || `Mock Test`}</span>
                  <span className={styles.mockScore}>{m.score ? `${parseFloat(m.score).toFixed(0)}%` : m.status}</span>
                  <span className={styles.mockDate}>{formatDate(m.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {diagnostics && diagnostics.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Diagnostic Assessments</div>
            <div className={styles.sessionList}>
              {diagnostics.map((d, i) => (
                <div key={i} className={styles.sessionItem}>
                  <span className={styles.sessionSubject}>{d.subject}</span>
                  <span className={styles.sessionTopic}>{d.topic}</span>
                  <span className={`${styles.sessionPhase} ${d.diagnostic_level === 'strong' || d.diagnostic_level === 'good' ? styles.phase_completed : styles.phase_concept_fixing}`}>
                    {d.diagnostic_level}
                  </span>
                  <span className={styles.sessionDate}>{formatDate(d.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return <div className={styles.loading}>Loading Student Progress Dashboard...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Student Progress Dashboard</h1>
        <p className={styles.subtitle}>Monitor student performance, identify at-risk learners, and track platform-wide analytics.</p>

        {error && <div className={styles.error}>{error}</div>}

        {selectedStudent && studentDetail ? (
          renderStudentDetail()
        ) : (
          <>
            <div className={styles.tabs}>
              <button className={`${styles.tabButton} ${activeTab === 'overview' ? styles.activeTab : ''}`} onClick={() => setActiveTab('overview')}>Platform Overview</button>
              <button className={`${styles.tabButton} ${activeTab === 'alerts' ? styles.activeTab : ''}`} onClick={() => setActiveTab('alerts')}>Alerts & Interventions</button>
              <button className={`${styles.tabButton} ${activeTab === 'students' ? styles.activeTab : ''}`} onClick={() => setActiveTab('students')}>Student Directory</button>
            </div>

            <div className={styles.tabContent}>
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'alerts' && renderAlerts()}
              {activeTab === 'students' && renderStudentList()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentProgressPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div>
        <Header />
        <StudentProgressContent />
      </div>
    </ProtectedRoute>
  );
}

