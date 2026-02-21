'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './metrics-lab.module.css';

export default function MetricsLabPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [scoreTrend, setScoreTrend] = useState([]);
  const [subjectPerf, setSubjectPerf] = useState([]);
  const [weakStrong, setWeakStrong] = useState({ weak_topics: [], strong_topics: [] });
  const [difficultyData, setDifficultyData] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAllAnalytics();
  }, []);

  const fetchAllAnalytics = async () => {
    try {
      setLoading(true);
      const [summaryRes, trendRes, subjectRes, wsRes, diffRes, actRes] = await Promise.all([
        api.get('/analytics/summary'),
        api.get('/analytics/score-trend?days=30'),
        api.get('/analytics/subject-performance'),
        api.get('/analytics/weak-strong-topics'),
        api.get('/analytics/difficulty-analysis'),
        api.get('/analytics/activity-heatmap')
      ]);

      setSummary(summaryRes.data);
      setScoreTrend(trendRes.data.trend || []);
      setSubjectPerf(subjectRes.data.subjects || []);
      setWeakStrong(wsRes.data);
      setDifficultyData(diffRes.data.difficulties || {});
      setActivity(actRes.data.activity || []);
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

  const getScoreColor = (score) => {
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#fbbf24';
    if (score >= 40) return '#fb923c';
    return '#f87171';
  };

  const getMaxCount = () => {
    if (activity.length === 0) return 1;
    return Math.max(...activity.map(a => parseInt(a.count || 0)), 1);
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
            <h1 className={styles.title}>Analytics & Metrics</h1>
            <p className={styles.subtitle}>Track your progress and performance</p>

            <div className={styles.tabs}>
              {['overview', 'subjects', 'topics', 'difficulty', 'activity'].map(tab => (
                <button
                  key={tab}
                  className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && summary && (
              <div className={styles.overviewSection}>
                <div className={styles.statsRow}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Total Attempts</div>
                    <div className={styles.statValue}>{summary.total_attempts}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Average Score</div>
                    <div className={styles.statValue} style={{ color: getScoreColor(summary.avg_score) }}>
                      {summary.avg_score}%
                    </div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Accuracy Rate</div>
                    <div className={styles.statValue}>{summary.accuracy_rate}%</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Study Streak</div>
                    <div className={styles.statValue}>{summary.current_streak} days</div>
                  </div>
                </div>

                <div className={styles.statsRow}>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Sessions Completed</div>
                    <div className={styles.statValue}>{summary.completed_sessions}/{summary.total_sessions}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Average Mastery</div>
                    <div className={styles.statValue} style={{ color: getScoreColor(summary.avg_mastery) }}>
                      {summary.avg_mastery}%
                    </div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Topics Mastered</div>
                    <div className={styles.statValue}>{summary.mastered_topics}/{summary.topics_covered}</div>
                  </div>
                  <div className={styles.statCard}>
                    <div className={styles.statLabel}>Study Time</div>
                    <div className={styles.statValue}>{summary.total_time_minutes} min</div>
                  </div>
                </div>

                {scoreTrend.length > 0 && (
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Score Trend (Last 30 Days)</h3>
                    <div className={styles.trendChart}>
                      {scoreTrend.map((point, idx) => {
                        const height = Math.max(5, (point.avg_score || 0));
                        return (
                          <div key={point.date || idx} className={styles.trendBar} title={`${point.date}: ${Math.round(point.avg_score)}% (${point.attempts} attempts)`}>
                            <div
                              className={styles.trendBarFill}
                              style={{
                                height: `${height}%`,
                                background: getScoreColor(point.avg_score)
                              }}
                            />
                            <div className={styles.trendBarLabel}>
                              {new Date(point.date).getDate()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'subjects' && (
              <div className={styles.subjectsSection}>
                {subjectPerf.length === 0 ? (
                  <div className={styles.emptyText}>No subject data yet. Start practicing!</div>
                ) : (
                  <div className={styles.subjectGrid}>
                    {subjectPerf.map((subject, idx) => (
                      <div key={subject.subject || idx} className={styles.subjectCard}>
                        <h3 className={styles.subjectName}>{subject.subject}</h3>
                        <div className={styles.subjectStats}>
                          <div className={styles.subjectStat}>
                            <span className={styles.subjectStatLabel}>Avg Score</span>
                            <span className={styles.subjectStatValue} style={{ color: getScoreColor(subject.avg_score) }}>
                              {subject.avg_score}%
                            </span>
                          </div>
                          <div className={styles.subjectStat}>
                            <span className={styles.subjectStatLabel}>Accuracy</span>
                            <span className={styles.subjectStatValue}>{subject.accuracy}%</span>
                          </div>
                          <div className={styles.subjectStat}>
                            <span className={styles.subjectStatLabel}>Attempts</span>
                            <span className={styles.subjectStatValue}>{subject.total_attempts}</span>
                          </div>
                          <div className={styles.subjectStat}>
                            <span className={styles.subjectStatLabel}>Avg Time</span>
                            <span className={styles.subjectStatValue}>{subject.avg_time_seconds}s</span>
                          </div>
                        </div>
                        <div className={styles.subjectBar}>
                          <div
                            className={styles.subjectBarFill}
                            style={{
                              width: `${subject.avg_score}%`,
                              background: getScoreColor(subject.avg_score)
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'topics' && (
              <div className={styles.topicsSection}>
                <div className={styles.topicsGrid}>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Weak Topics (Need Attention)</h3>
                    {weakStrong.weak_topics.length === 0 ? (
                      <div className={styles.emptyText}>No weak topics found</div>
                    ) : (
                      <div className={styles.topicList}>
                        {weakStrong.weak_topics.map((topic, idx) => (
                          <div key={`weak-${topic.topic}-${topic.subject}`} className={styles.topicItem}>
                            <div className={styles.topicInfo}>
                              <span className={styles.topicName}>{topic.topic}</span>
                              <span className={styles.topicSubject}>{topic.subject}</span>
                            </div>
                            <div className={styles.topicMastery}>
                              <div className={styles.topicBar}>
                                <div
                                  className={styles.topicBarFill}
                                  style={{
                                    width: `${topic.mastery_level}%`,
                                    background: getScoreColor(topic.mastery_level)
                                  }}
                                />
                              </div>
                              <span className={styles.topicPercent}>{Math.round(topic.mastery_level)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Strong Topics</h3>
                    {weakStrong.strong_topics.length === 0 ? (
                      <div className={styles.emptyText}>No strong topics yet</div>
                    ) : (
                      <div className={styles.topicList}>
                        {weakStrong.strong_topics.map((topic, idx) => (
                          <div key={`strong-${topic.topic}-${topic.subject}`} className={styles.topicItem}>
                            <div className={styles.topicInfo}>
                              <span className={styles.topicName}>{topic.topic}</span>
                              <span className={styles.topicSubject}>{topic.subject}</span>
                            </div>
                            <div className={styles.topicMastery}>
                              <div className={styles.topicBar}>
                                <div
                                  className={styles.topicBarFill}
                                  style={{
                                    width: `${topic.mastery_level}%`,
                                    background: getScoreColor(topic.mastery_level)
                                  }}
                                />
                              </div>
                              <span className={styles.topicPercent}>{Math.round(topic.mastery_level)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'difficulty' && (
              <div className={styles.difficultySection}>
                <div className={styles.difficultyGrid}>
                  {['easy', 'medium', 'hard'].map(level => {
                    const data = difficultyData[level];
                    return (
                      <div key={level} className={styles.difficultyCard}>
                        <h3 className={styles.difficultyLevel}>
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </h3>
                        {data ? (
                          <div className={styles.difficultyStats}>
                            <div className={styles.difficultyStat}>
                              <span>Attempts</span>
                              <strong>{data.total_attempts}</strong>
                            </div>
                            <div className={styles.difficultyStat}>
                              <span>Avg Score</span>
                              <strong style={{ color: getScoreColor(data.avg_score) }}>{data.avg_score}%</strong>
                            </div>
                            <div className={styles.difficultyStat}>
                              <span>Accuracy</span>
                              <strong>{data.accuracy}%</strong>
                            </div>
                            <div className={styles.difficultyStat}>
                              <span>Avg Time</span>
                              <strong>{data.avg_time_seconds}s</strong>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.emptyText}>No data</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className={styles.activitySection}>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Activity (Last 90 Days)</h3>
                  {activity.length === 0 ? (
                    <div className={styles.emptyText}>No activity yet</div>
                  ) : (
                    <div className={styles.activityGrid}>
                      {activity.map((day, idx) => {
                        const intensity = Math.min(1, parseInt(day.count || 0) / getMaxCount());
                        return (
                          <div
                            key={day.date || idx}
                            className={styles.activityCell}
                            title={`${day.date}: ${day.count} attempts`}
                            style={{
                              background: `rgba(74, 222, 128, ${0.15 + intensity * 0.85})`
                            }}
                          />
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
