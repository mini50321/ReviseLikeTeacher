'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './advanced-analytics.module.css';

function AdvancedAnalyticsContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('rank');
  const [rankData, setRankData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [compTrend, setCompTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendDays, setTrendDays] = useState(90);
  const [expandedSubject, setExpandedSubject] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadCompetencyTrend();
  }, [trendDays]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');
      const [rankRes, heatRes, trendRes] = await Promise.all([
        api.get('/analytics/rank-prediction').catch(() => ({ data: null })),
        api.get('/analytics/mastery-heatmap').catch(() => ({ data: null })),
        api.get(`/analytics/competency-trend?days=${trendDays}`).catch(() => ({ data: null }))
      ]);
      setRankData(rankRes.data);
      setHeatmapData(heatRes.data);
      setCompTrend(trendRes.data);
    } catch (err) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const loadCompetencyTrend = async () => {
    try {
      const res = await api.get(`/analytics/competency-trend?days=${trendDays}`);
      setCompTrend(res.data);
    } catch (e) {}
  };

  const RANK_TIER_META = {
    elite: { label: 'Top 100', color: '#ffd700', bg: 'rgba(255,215,0,0.12)' },
    excellent: { label: 'Top 500', color: '#81c784', bg: 'rgba(129,199,132,0.12)' },
    good: { label: 'Top 2000', color: '#42a5f5', bg: 'rgba(66,165,245,0.12)' },
    average: { label: 'Top 10000', color: '#ffb74d', bg: 'rgba(255,183,77,0.12)' },
    below_average: { label: 'Below Average', color: '#ef9a9a', bg: 'rgba(239,154,154,0.12)' },
    needs_improvement: { label: 'Needs Work', color: '#ef5350', bg: 'rgba(239,83,80,0.12)' }
  };

  const renderRank = () => {
    if (!rankData) return <p className={styles.emptyText}>Complete some topics to see your rank prediction.</p>;

    const tierMeta = RANK_TIER_META[rankData.rank_tier] || RANK_TIER_META.needs_improvement;
    const gaugePercent = Math.min(rankData.rank_score, 100);

    return (
      <>
        <div className={styles.rankHero}>
          <div className={styles.rankGaugeWrap}>
            <svg viewBox="0 0 200 120" className={styles.rankGauge}>
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="16"
                strokeLinecap="round"
              />
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={tierMeta.color}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${(gaugePercent / 100) * 251.2} 251.2`}
              />
            </svg>
            <div className={styles.rankScoreOverlay}>
              <div className={styles.rankScoreValue} style={{ color: tierMeta.color }}>
                {Math.round(rankData.rank_score)}
              </div>
              <div className={styles.rankScoreLabel}>Rank Score</div>
            </div>
          </div>

          <div className={styles.rankPrediction}>
            <div className={styles.rankTierBadge} style={{ background: tierMeta.bg, color: tierMeta.color }}>
              {tierMeta.label}
            </div>
            <div className={styles.rankRange}>
              Predicted Rank: <strong>{rankData.predicted_rank.min.toLocaleString()} — {rankData.predicted_rank.max.toLocaleString()}</strong>
            </div>
          </div>

          <div className={styles.goalTracker}>
            <div className={styles.goalLabel}>Goal: {rankData.goal.label}</div>
            <div className={`${styles.goalStatus} ${rankData.on_track ? styles.goalOnTrack : styles.goalOffTrack}`}>
              {rankData.on_track ? '✓ On Track' : '✗ Needs Improvement'}
            </div>
          </div>
        </div>

        <div className={styles.factorsCard}>
          <h3 className={styles.cardTitle}>Score Breakdown</h3>
          <div className={styles.factorsList}>
            {rankData.factors.map((f, idx) => (
              <div key={idx} className={styles.factorItem}>
                <div className={styles.factorHeader}>
                  <span className={styles.factorName}>{f.factor}</span>
                  <span className={styles.factorValue}>{f.value}/{f.max}</span>
                  <span className={styles.factorWeight}>{f.weight}%</span>
                </div>
                <div className={styles.factorBar}>
                  <div
                    className={styles.factorFill}
                    style={{
                      width: `${(f.value / f.max) * 100}%`,
                      background: f.value >= 80 ? '#81c784' : f.value >= 50 ? '#ffb74d' : '#ef5350'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.miniStat}>
            <div className={styles.miniStatValue}>{rankData.stats.topics_covered}</div>
            <div className={styles.miniStatLabel}>Topics Covered</div>
          </div>
          <div className={styles.miniStat}>
            <div className={styles.miniStatValue}>{rankData.stats.topics_mastered}</div>
            <div className={styles.miniStatLabel}>Topics Mastered</div>
          </div>
          <div className={styles.miniStat}>
            <div className={styles.miniStatValue}>{rankData.stats.questions_attempted}</div>
            <div className={styles.miniStatLabel}>Questions Done</div>
          </div>
          <div className={styles.miniStat}>
            <div className={styles.miniStatValue}>{rankData.stats.total_questions}</div>
            <div className={styles.miniStatLabel}>Total in Bank</div>
          </div>
        </div>
      </>
    );
  };

  const renderHeatmap = () => {
    if (!heatmapData || !heatmapData.subjects || heatmapData.subjects.length === 0) {
      return <p className={styles.emptyText}>Complete topic mastery sessions to build your heatmap.</p>;
    }

    const summary = heatmapData.summary;

    return (
      <>
        <div className={styles.heatmapSummary}>
          <div className={styles.heatmapStat}>
            <div className={styles.heatmapStatValue}>{summary.total_topics}</div>
            <div className={styles.heatmapStatLabel}>Total Topics</div>
          </div>
          <div className={styles.heatmapStat}>
            <div className={styles.heatmapStatValue} style={{ color: '#81c784' }}>{summary.mastered}</div>
            <div className={styles.heatmapStatLabel}>Mastered</div>
          </div>
          <div className={styles.heatmapStat}>
            <div className={styles.heatmapStatValue} style={{ color: '#ffb74d' }}>{summary.revision_required}</div>
            <div className={styles.heatmapStatLabel}>Revision</div>
          </div>
          <div className={styles.heatmapStat}>
            <div className={styles.heatmapStatValue} style={{ color: '#ef5350' }}>{summary.relearn_core}</div>
            <div className={styles.heatmapStatLabel}>Relearn</div>
          </div>
          <div className={styles.heatmapStat}>
            <div className={styles.heatmapStatValue}>{summary.overall_mastery}%</div>
            <div className={styles.heatmapStatLabel}>Avg Mastery</div>
          </div>
        </div>

        <div className={styles.heatmapLegend}>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#81c784' }} /> Mastered</span>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#ffb74d' }} /> Revision</span>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#ef5350' }} /> Relearn</span>
        </div>

        <div className={styles.heatmapGrid}>
          {heatmapData.subjects.map(subj => (
            <div key={subj.subject} className={styles.heatmapSubject}>
              <div
                className={styles.heatmapSubjectHeader}
                onClick={() => setExpandedSubject(expandedSubject === subj.subject ? null : subj.subject)}
              >
                <div className={styles.heatmapSubjectInfo}>
                  <span className={styles.heatmapSubjectName}>{subj.subject}</span>
                  <span className={styles.heatmapSubjectMeta}>
                    {subj.mastered_count}/{subj.total_count} mastered • {subj.completion_rate}%
                  </span>
                </div>
                <div className={styles.heatmapSubjectBar}>
                  <div
                    className={styles.heatmapSubjectFill}
                    style={{
                      width: `${subj.avg_mastery}%`,
                      background: subj.avg_mastery >= 80 ? '#81c784' : subj.avg_mastery >= 50 ? '#ffb74d' : '#ef5350'
                    }}
                  />
                </div>
                <span className={styles.heatmapExpandIcon}>{expandedSubject === subj.subject ? '▲' : '▼'}</span>
              </div>

              {expandedSubject === subj.subject && (
                <div className={styles.heatmapTopics}>
                  {subj.topics.map(t => {
                    const cellColor = t.color === 'green' ? '#81c784'
                      : t.color === 'yellow' ? '#ffb74d' : '#ef5350';
                    return (
                      <div key={t.topic} className={styles.heatmapTopicRow}>
                        <div className={styles.heatmapTopicDot} style={{ background: cellColor }} />
                        <div className={styles.heatmapTopicInfo}>
                          <span className={styles.heatmapTopicName}>{t.topic}</span>
                          <span className={styles.heatmapTopicStatus}>{(t.mastery_status || '').replace(/_/g, ' ')}</span>
                        </div>
                        <div className={styles.heatmapTopicScores}>
                          <span title="Competency">{Math.round(t.competency_score || 0)}</span>
                          <span title="MCQ Acc">{Math.round(t.mcq_accuracy || 0)}%</span>
                          <span title="Core Cov">{Math.round(t.core_coverage || 0)}%</span>
                        </div>
                        {t.next_revision && (
                          <span className={styles.heatmapRevDate}>
                            Rev: {new Date(t.next_revision).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderTrend = () => {
    if (!compTrend || compTrend.total_entries === 0) {
      return <p className={styles.emptyText}>Complete topic mastery sessions to see your competency trend.</p>;
    }

    const maxScore = Math.max(...(compTrend.overall_trend || []).map(p => p.avg_score), 1);

    return (
      <>
        <div className={styles.trendControls}>
          {[30, 60, 90].map(d => (
            <button
              key={d}
              className={`${styles.trendPeriodBtn} ${trendDays === d ? styles.trendPeriodActive : ''}`}
              onClick={() => setTrendDays(d)}
            >
              {d} Days
            </button>
          ))}
        </div>

        {compTrend.overall_trend && compTrend.overall_trend.length > 0 && (
          <div className={styles.trendCard}>
            <h3 className={styles.cardTitle}>Overall Competency Trend</h3>
            <div className={styles.trendChart}>
              {compTrend.overall_trend.map((point, idx) => {
                const height = Math.max(5, (point.avg_score / maxScore) * 100);
                const color = point.avg_score >= 80 ? '#81c784' : point.avg_score >= 50 ? '#ffb74d' : '#ef5350';
                return (
                  <div
                    key={point.date || idx}
                    className={styles.trendBar}
                    title={`${point.date}: ${Math.round(point.avg_score)} (${point.entries} entries)`}
                  >
                    <div
                      className={styles.trendBarFill}
                      style={{ height: `${height}%`, background: color }}
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

        {compTrend.by_topic && compTrend.by_topic.length > 0 && (
          <div className={styles.trendCard}>
            <h3 className={styles.cardTitle}>Per-Topic Competency Progress</h3>
            <div className={styles.topicTrendList}>
              {compTrend.by_topic.map((tp, idx) => {
                const latest = tp.scores[tp.scores.length - 1];
                const first = tp.scores[0];
                const delta = latest.score - first.score;
                return (
                  <div key={idx} className={styles.topicTrendItem}>
                    <div className={styles.topicTrendInfo}>
                      <span className={styles.topicTrendName}>{tp.topic}</span>
                      <span className={styles.topicTrendSubject}>{tp.subject}</span>
                    </div>
                    <div className={styles.topicTrendScores}>
                      {tp.scores.map((s, si) => (
                        <div
                          key={si}
                          className={styles.topicTrendDot}
                          style={{
                            background: s.score >= 80 ? '#81c784' : s.score >= 50 ? '#ffb74d' : '#ef5350',
                            width: `${Math.max(8, Math.min(20, s.score / 5))}px`,
                            height: `${Math.max(8, Math.min(20, s.score / 5))}px`
                          }}
                          title={`${Math.round(s.score)} — ${s.date}`}
                        />
                      ))}
                    </div>
                    <div className={styles.topicTrendDelta}>
                      <span style={{ color: delta >= 0 ? '#81c784' : '#ef5350' }}>
                        {delta >= 0 ? '+' : ''}{Math.round(delta)}
                      </span>
                      <span className={styles.topicTrendLatest}>{Math.round(latest.score)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return <div className={styles.loading}>Loading advanced analytics...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Advanced Analytics</h1>
        <p className={styles.subtitle}>Rank prediction, mastery heatmap, and competency trends</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          {[
            { key: 'rank', label: 'Rank Prediction' },
            { key: 'heatmap', label: 'Mastery Heatmap' },
            { key: 'trend', label: 'Competency Trend' }
          ].map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'rank' && renderRank()}
        {activeTab === 'heatmap' && renderHeatmap()}
        {activeTab === 'trend' && renderTrend()}
      </div>
    </div>
  );
}

export default function AdvancedAnalyticsPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <AdvancedAnalyticsContent />
      </div>
    </ProtectedRoute>
  );
}

