'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import styles from './analytics.module.css';

export default function AdminAnalyticsPage() {
  const [platformStats, setPlatformStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [difficultyData, setDifficultyData] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('platform');
  const [overrideHistory, setOverrideHistory] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, studentsRes, diffRes, historyRes] = await Promise.all([
        api.get('/admin/platform-stats'),
        api.get('/admin/students'),
        api.get('/admin/question-difficulty'),
        api.get('/admin/override/history')
      ]);

      setPlatformStats(statsRes.data);
      setStudents(studentsRes.data.students || []);
      setDifficultyData(diffRes.data);
      setOverrideHistory(historyRes.data.overrides || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetail = async (studentId) => {
    try {
      const res = await api.get(`/admin/students/${studentId}`);
      setStudentDetail(res.data);
      setSelectedStudent(studentId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load student details');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#fbbf24';
    if (score >= 40) return '#fb923c';
    return '#f87171';
  };

  if (loading) {
    return (
      <ProtectedRoute requireAdmin>
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

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <h1 className={styles.title}>Admin Analytics</h1>

            <div className={styles.tabs}>
              {['platform', 'students', 'difficulty', 'overrides'].map(tab => (
                <button
                  key={tab}
                  className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
                  onClick={() => { setActiveTab(tab); setSelectedStudent(null); }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {activeTab === 'platform' && platformStats && (
              <div>
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Students</div>
                    <div className={styles.statValue}>{platformStats.users.students}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Attempts</div>
                    <div className={styles.statValue}>{platformStats.attempts.total}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Platform Avg Score</div>
                    <div className={styles.statValue} style={{ color: getScoreColor(platformStats.attempts.avg_score) }}>
                      {platformStats.attempts.avg_score}%
                    </div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Active Questions</div>
                    <div className={styles.statValue}>{platformStats.questions.active}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Completed Sessions</div>
                    <div className={styles.statValue}>{platformStats.sessions.completed}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Admins</div>
                    <div className={styles.statValue}>{platformStats.users.admins}</div>
                  </div>
                </div>

                {platformStats.recent_activity.length > 0 && (
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Recent Activity (7 Days)</h3>
                    <div className={styles.activityBars}>
                      {platformStats.recent_activity.map((day, idx) => (
                        <div key={day.date || idx} className={styles.activityBarWrap}>
                          <div className={styles.activityBarOuter}>
                            <div
                              className={styles.activityBarInner}
                              style={{
                                height: `${Math.min(100, (parseInt(day.attempts) / Math.max(...platformStats.recent_activity.map(d => parseInt(d.attempts)))) * 100)}%`
                              }}
                            />
                          </div>
                          <div className={styles.activityBarLabel}>{new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}</div>
                          <div className={styles.activityBarCount}>{day.attempts}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'students' && !selectedStudent && (
              <div>
                {students.length === 0 ? (
                  <div className={styles.emptyText}>No students registered yet</div>
                ) : (
                  <div className={styles.studentTable}>
                    <div className={styles.tableHeader}>
                      <span>Email</span>
                      <span>Avg Score</span>
                      <span>Attempts</span>
                      <span>Mastery</span>
                      <span>Sessions</span>
                      <span>Action</span>
                    </div>
                    {students.map((student, idx) => (
                      <div key={student.id || idx} className={styles.tableRow}>
                        <span className={styles.studentEmail}>{student.email}</span>
                        <span style={{ color: getScoreColor(student.avg_score) }}>{student.avg_score}%</span>
                        <span>{student.total_attempts}</span>
                        <span style={{ color: getScoreColor(student.avg_mastery) }}>{student.avg_mastery}%</span>
                        <span>{student.completed_sessions}/{student.total_sessions}</span>
                        <button
                          className={styles.viewButton}
                          onClick={() => fetchStudentDetail(student.id)}
                        >
                          View Details
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'students' && selectedStudent && studentDetail && (
              <StudentDetailView
                data={studentDetail}
                onBack={() => { setSelectedStudent(null); setStudentDetail(null); }}
                getScoreColor={getScoreColor}
                onRefresh={() => fetchStudentDetail(selectedStudent)}
              />
            )}

            {activeTab === 'difficulty' && difficultyData && (
              <div>
                {difficultyData.total_with_mismatch > 0 && (
                  <div className={styles.warningBanner}>
                    {difficultyData.total_with_mismatch} questions have a difficulty mismatch between set and computed difficulty
                  </div>
                )}

                {difficultyData.subject_summary && difficultyData.subject_summary.length > 0 && (
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Subject Difficulty Summary</h3>
                    <div className={styles.subjectSummary}>
                      {difficultyData.subject_summary.map((s, idx) => (
                        <div key={s.subject || idx} className={styles.subjectRow}>
                          <span className={styles.subjectName}>{s.subject}</span>
                          <span className={styles.subjectQuestions}>{s.total_questions} questions</span>
                          <span style={{ color: getScoreColor(s.avg_score) }}>{s.avg_score}% avg</span>
                          <span>{s.total_attempts} attempts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Question Difficulty Analysis</h3>
                  <div className={styles.questionDiffTable}>
                    <div className={styles.qdHeader}>
                      <span>Question</span>
                      <span>Subject</span>
                      <span>Set</span>
                      <span>Computed</span>
                      <span>Avg Score</span>
                      <span>Pass Rate</span>
                      <span>Attempts</span>
                    </div>
                    {(difficultyData.questions || []).slice(0, 50).map((q, idx) => (
                      <div key={q.id || idx} className={`${styles.qdRow} ${q.difficulty_mismatch ? styles.mismatchRow : ''}`}>
                        <span className={styles.qdStem}>{q.stem}</span>
                        <span>{q.subject}</span>
                        <span className={styles.diffBadge}>{q.set_difficulty}</span>
                        <span className={`${styles.diffBadge} ${q.difficulty_mismatch ? styles.mismatchBadge : ''}`}>
                          {q.computed_difficulty}
                        </span>
                        <span style={{ color: getScoreColor(q.avg_score) }}>{q.avg_score}%</span>
                        <span>{q.pass_rate}%</span>
                        <span>{q.total_attempts}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'overrides' && (
              <div>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Override History</h3>
                  {overrideHistory.length === 0 ? (
                    <div className={styles.emptyText}>No overrides performed yet</div>
                  ) : (
                    <div className={styles.overrideList}>
                      {overrideHistory.map((override, idx) => {
                        let corrections = {};
                        try { corrections = JSON.parse(override.corrections); } catch (e) {}
                        return (
                          <div key={override.id || idx} className={styles.overrideItem}>
                            <div className={styles.overrideHeader}>
                              <span className={styles.overrideAdmin}>{override.admin_email}</span>
                              <span className={styles.overrideDate}>
                                {new Date(override.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.overrideDetails}>
                              <span>Student: {override.student_email}</span>
                              <span>
                                Score: {corrections.old_score} → {corrections.new_score}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

function StudentDetailView({ data, onBack, getScoreColor, onRefresh }) {
  const [overrideAttemptId, setOverrideAttemptId] = useState(null);
  const [overrideScore, setOverrideScore] = useState('');
  const [overridingMastery, setOverridingMastery] = useState(null);
  const [newMastery, setNewMastery] = useState('');
  const [saving, setSaving] = useState(false);

  const handleScoreOverride = async () => {
    if (!overrideAttemptId || overrideScore === '') return;
    const score = parseInt(overrideScore);
    if (isNaN(score) || score < 0 || score > 100) {
      alert('Score must be between 0 and 100');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/admin/override/attempt/${overrideAttemptId}`, { score });
      setOverrideAttemptId(null);
      setOverrideScore('');
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to override score');
    } finally {
      setSaving(false);
    }
  };

  const handleMasteryOverride = async () => {
    if (!overridingMastery || newMastery === '') return;
    const mastery = parseFloat(newMastery);
    if (isNaN(mastery) || mastery < 0 || mastery > 100) {
      alert('Mastery must be between 0 and 100');
      return;
    }

    setSaving(true);
    try {
      await api.put('/admin/override/mastery', {
        user_id: data.student.id,
        topic: overridingMastery.topic,
        subject: overridingMastery.subject,
        new_mastery: mastery
      });
      setOverridingMastery(null);
      setNewMastery('');
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to override mastery');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.studentDetail}>
      <button className={styles.backButton} onClick={onBack}>← Back to Students</button>

      <div className={styles.studentHeader}>
        <h2>{data.student.email}</h2>
        <div className={styles.studentMeta}>
          <span>Exam: {data.student.target_exam || 'N/A'}</span>
          <span>Joined: {new Date(data.student.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {data.readiness && (
        <div className={styles.readinessCard}>
          <span>Readiness: </span>
          <strong style={{ color: getScoreColor(data.readiness.readiness_percentage) }}>
            {Math.round(data.readiness.readiness_percentage)}%
          </strong>
          <span className={styles.readinessStatus}>{data.readiness.status}</span>
        </div>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Topic Mastery (Click to Override)</h3>
        {data.mastery.length === 0 ? (
          <div className={styles.emptyText}>No mastery data</div>
        ) : (
          <div className={styles.masteryList}>
            {data.mastery.map((m, idx) => (
              <div key={m.id || idx} className={styles.masteryItem}>
                <div className={styles.masteryInfo}>
                  <span className={styles.masteryTopic}>{m.topic}</span>
                  <span className={styles.masterySubject}>{m.subject}</span>
                </div>
                <div className={styles.masteryBarWrap}>
                  <div className={styles.masteryBar}>
                    <div
                      className={styles.masteryBarFill}
                      style={{
                        width: `${m.mastery_level}%`,
                        background: getScoreColor(m.mastery_level)
                      }}
                    />
                  </div>
                  <span>{Math.round(m.mastery_level)}%</span>
                </div>
                {overridingMastery?.topic === m.topic && overridingMastery?.subject === m.subject ? (
                  <div className={styles.overrideForm}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newMastery}
                      onChange={(e) => setNewMastery(e.target.value)}
                      placeholder="New mastery (0-100)"
                      className={styles.overrideInput}
                    />
                    <button className={styles.overrideSave} onClick={handleMasteryOverride} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button className={styles.overrideCancel} onClick={() => setOverridingMastery(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.overrideButton}
                    onClick={() => { setOverridingMastery(m); setNewMastery(Math.round(m.mastery_level).toString()); }}
                  >
                    Override
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Recent Attempts (Click Score to Override)</h3>
        {data.attempts.length === 0 ? (
          <div className={styles.emptyText}>No attempts</div>
        ) : (
          <div className={styles.attemptsList}>
            {data.attempts.map((attempt, idx) => (
              <div key={attempt.id || idx} className={styles.attemptItem}>
                <div className={styles.attemptQuestion}>{attempt.stem?.substring(0, 100)}...</div>
                <div className={styles.attemptMeta}>
                  <span>{attempt.subject} / {attempt.topic}</span>
                  <span>{attempt.answer_method}</span>
                  <span>{new Date(attempt.submitted_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.attemptScore}>
                  {overrideAttemptId === attempt.id ? (
                    <div className={styles.overrideForm}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={overrideScore}
                        onChange={(e) => setOverrideScore(e.target.value)}
                        placeholder="New score"
                        className={styles.overrideInput}
                      />
                      <button className={styles.overrideSave} onClick={handleScoreOverride} disabled={saving}>
                        {saving ? '...' : 'Save'}
                      </button>
                      <button className={styles.overrideCancel} onClick={() => setOverrideAttemptId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.scoreButton}
                      style={{ color: getScoreColor(attempt.ai_score) }}
                      onClick={() => { setOverrideAttemptId(attempt.id); setOverrideScore((attempt.ai_score || 0).toString()); }}
                      title="Click to override score"
                    >
                      {attempt.ai_score || 0}%
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

