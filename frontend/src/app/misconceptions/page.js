'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import {
  Brain,
  RefreshCw,
  Zap,
  MessageCircleWarning,
  Microscope,
  Waves,
  ShieldAlert,
  HelpCircle,
  BookOpen
} from 'lucide-react';
import styles from './misconceptions.module.css';

const TYPE_META = {
  concept_missing: {
    label: 'Concept Missing',
    icon: Brain,
    desc: 'Core concept not understood or absent from knowledge',
    iconClass: styles.typeIconConceptMissing,
    fillClass: styles.fillConceptMissing
  },
  confusion_pair: {
    label: 'Confusion Pair',
    icon: RefreshCw,
    desc: 'Two similar concepts mixed up repeatedly',
    iconClass: styles.typeIconConfusionPair,
    fillClass: styles.fillConfusionPair
  },
  rule_exception_failure: {
    label: 'Rule Exception',
    icon: Zap,
    desc: 'Failed to recognize exception to a general rule',
    iconClass: styles.typeIconRuleException,
    fillClass: styles.fillRuleException
  },
  memory_slip: {
    label: 'Memory Slip',
    icon: MessageCircleWarning,
    desc: 'Knew concept but recalled incorrectly under pressure',
    iconClass: styles.typeIconMemorySlip,
    fillClass: styles.fillMemorySlip
  },
  application_failure: {
    label: 'Application Failure',
    icon: Microscope,
    desc: 'Cannot apply known concept to clinical scenario',
    iconClass: styles.typeIconApplicationFailure,
    fillClass: styles.fillApplicationFailure
  },
  overgeneralization: {
    label: 'Overgeneralization',
    icon: Waves,
    desc: 'Applied a rule too broadly without considering specifics',
    iconClass: styles.typeIconOvergeneralization,
    fillClass: styles.fillOvergeneralization
  },
  trap_susceptibility: {
    label: 'Trap Susceptibility',
    icon: ShieldAlert,
    desc: 'Fell for exam-style distractor traps',
    iconClass: styles.typeIconTrapSusceptibility,
    fillClass: styles.fillTrapSusceptibility
  }
};

function MisconceptionsContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [analytics, setAnalytics] = useState(null);
  const [confusionPairs, setConfusionPairs] = useState(null);
  const [history, setHistory] = useState([]);
  const [remediation, setRemediation] = useState(null);

  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsRes, pairsRes, historyRes] = await Promise.all([
        api.get('/misconceptions/analytics'),
        api.get('/misconceptions/confusion-pairs'),
        api.get('/misconceptions/history?limit=30')
      ]);
      setAnalytics(analyticsRes.data);
      setConfusionPairs(pairsRes.data);
      setHistory(historyRes.data.misconceptions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load misconception data');
    } finally {
      setLoading(false);
    }
  };

  const loadRemediation = async (subject, topic) => {
    try {
      const res = await api.get(`/misconceptions/remediation?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`);
      setRemediation(res.data);
      setSelectedSubject(subject);
      setSelectedTopic(topic);
      setActiveTab('remediation');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load remediation plan');
    }
  };

  const handleResolve = async (pairId) => {
    try {
      await api.put(`/misconceptions/confusion-pairs/${pairId}/resolve`);
      const pairsRes = await api.get('/misconceptions/confusion-pairs');
      setConfusionPairs(pairsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resolve confusion pair');
    }
  };

  const totalMisconceptions = analytics?.by_type?.reduce((sum, t) => sum + t.count, 0) || 0;
  const maxTypeCount = analytics?.by_type?.length > 0 ? Math.max(...analytics.by_type.map(t => t.count)) : 1;
  const maxTrend = analytics?.daily_trend?.length > 0 ? Math.max(...analytics.daily_trend.map(t => t.count)) : 1;

  const renderOverview = () => {
    if (!analytics) return null;

    return (
      <>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ef5350' }}>
              {totalMisconceptions}
            </div>
            <div className={styles.statLabel}>Total Misconceptions</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ff9800' }}>
              {analytics.confusion_pairs?.triggered || 0}
            </div>
            <div className={styles.statLabel}>Triggered Pairs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#64b5f6' }}>
              {analytics.confusion_pairs?.unresolved || 0}
            </div>
            <div className={styles.statLabel}>Unresolved Pairs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ce93d8' }}>
              {analytics.by_type?.length || 0}
            </div>
            <div className={styles.statLabel}>Error Types Found</div>
          </div>
        </div>

        <div className={styles.card} style={{ animationDelay: '0.1s' }}>
          <div className={styles.sectionTitle}>Error Type Breakdown</div>
          {analytics.by_type?.length > 0 ? (
            <div className={styles.typeGrid}>
              {analytics.by_type.map((item) => {
                const meta = TYPE_META[item.type] || {
                  label: item.type,
                  icon: HelpCircle,
                  desc: '',
                  iconClass: '',
                  fillClass: ''
                };
                const Icon = meta.icon;
                return (
                  <div key={item.type} className={styles.typeCard}>
                    <div className={styles.typeHeader}>
                      <div className={`${styles.typeIcon} ${meta.iconClass}`}>
                        <Icon size={20} strokeWidth={2} />
                      </div>
                      <div className={styles.typeCount}>{item.count}</div>
                    </div>
                    <div className={styles.typeName}>{meta.label}</div>
                    <div className={styles.typeDesc}>{meta.desc}</div>
                    <div className={styles.typeBar}>
                      <div
                        className={`${styles.typeBarFill} ${meta.fillClass}`}
                        style={{ width: `${(item.count / maxTypeCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h3>No misconceptions detected yet</h3>
              <p>Complete MCQ sessions to see your error patterns</p>
            </div>
          )}
        </div>

        {analytics.daily_trend?.length > 0 && (
          <div className={styles.card} style={{ animationDelay: '0.2s' }}>
            <div className={styles.sectionTitle}>Daily Trend (Last 30 Days)</div>
            <div className={styles.trendChart}>
              {analytics.daily_trend.slice().reverse().map((day, i) => (
                <div
                  key={i}
                  className={styles.trendBar}
                  style={{ height: `${Math.max(8, (day.count / maxTrend) * 100)}%` }}
                  data-count={`${day.date}: ${day.count}`}
                  title={`${day.date}: ${day.count} errors`}
                />
              ))}
            </div>
          </div>
        )}

        {analytics.by_subject && Object.keys(analytics.by_subject).length > 0 && (
          <div className={styles.card} style={{ animationDelay: '0.3s' }}>
            <div className={styles.sectionTitle}>By Subject</div>
            {Object.entries(analytics.by_subject).map(([subject, types]) => {
              const subTotal = Object.values(types).reduce((s, v) => s + v, 0);
              return (
                <div key={subject} className={styles.historyItem} style={{ cursor: 'pointer' }}>
                  <div className={styles.historyIcon} style={{ background: 'rgba(156, 39, 176, 0.2)' }}>
                    <BookOpen size={18} strokeWidth={2} />
                  </div>
                  <div className={styles.historyContent}>
                    <div className={styles.historyQuestion}>{subject}</div>
                    <div className={styles.historyMeta}>
                      <span className={styles.historyBadge + ' ' + styles.historyBadgeType}>
                        {subTotal} errors
                      </span>
                      {Object.entries(types).map(([type, count]) => (
                        <span key={type} className={styles.historyBadge + ' ' + styles.historyBadgeTopic}>
                          {TYPE_META[type]?.label || type}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderConfusionPairs = () => {
    if (!confusionPairs) return null;

    return (
      <div className={styles.card}>
        <div className={styles.sectionTitle}>
          Confusion Pairs ({confusionPairs.pairs?.length || 0})
          {confusionPairs.triggered_count > 0 && (
            <span style={{ fontSize: 14, color: '#ef9a9a', marginLeft: 12 }}>
              {confusionPairs.triggered_count} triggered (need comparison drill)
            </span>
          )}
        </div>
        {confusionPairs.pairs?.length > 0 ? (
          confusionPairs.pairs.map((pair) => (
            <div
              key={pair.id}
              className={`${styles.pairCard} ${pair.occurrence_count >= 2 && !pair.resolved ? styles.pairTriggered : ''}`}
            >
              <div className={styles.pairHeader}>
                <div className={styles.pairConcepts}>
                  <span className={styles.pairConceptA}>{pair.concept_a}</span>
                  <span className={styles.pairVs}>VS</span>
                  <span className={styles.pairConceptB}>{pair.concept_b}</span>
                </div>
                <span className={`${styles.pairOccurrence} ${pair.occurrence_count >= 2 ? styles.pairOccurrenceHigh : styles.pairOccurrenceLow}`}>
                  {pair.occurrence_count}x
                </span>
              </div>
              <div className={styles.pairMeta}>
                <span className={styles.pairSubject}>{pair.subject}</span>
                <span className={styles.pairTopic}>{pair.topic}</span>
                {pair.resolved ? (
                  <span className={styles.resolvedBadge}>Resolved</span>
                ) : (
                  <>
                    <button
                      className={styles.resolveButton}
                      onClick={() => handleResolve(pair.id)}
                    >
                      Mark Resolved
                    </button>
                    {pair.occurrence_count >= 2 && (
                      <button
                        className={styles.resolveButton}
                        onClick={() => loadRemediation(pair.subject, pair.topic)}
                        style={{ borderColor: 'rgba(156, 39, 176, 0.3)', color: '#ce93d8', background: 'rgba(156, 39, 176, 0.1)' }}
                      >
                        View Remediation
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <h3>No confusion pairs recorded</h3>
            <p>Confusion pairs are detected when you repeatedly mix up two similar concepts</p>
          </div>
        )}
      </div>
    );
  };

  const renderRemediation = () => {
    if (!remediation) return null;

    return (
      <div className={styles.card}>
        <div className={styles.sectionTitle}>
          Remediation Plan: {selectedTopic}
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginLeft: 12 }}>
            {selectedSubject}
          </span>
        </div>
        <div className={styles.statsGrid} style={{ marginBottom: 20 }}>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ce93d8' }}>{remediation.total_actions}</div>
            <div className={styles.statLabel}>Total Actions</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ef5350' }}>{remediation.high_priority_count}</div>
            <div className={styles.statLabel}>High Priority</div>
          </div>
        </div>
        {remediation.plan?.length > 0 ? (
          remediation.plan.map((item, i) => (
            <div key={i} className={styles.remediationCard}>
              <span className={`${styles.remediationPriority} ${
                item.priority === 'high' ? styles.priorityHigh :
                item.priority === 'medium' ? styles.priorityMedium : styles.priorityLow
              }`}>
                {item.priority}
              </span>
              <div className={styles.remediationType}>
                {item.type === 'confusion_pair_drill' && `Comparison Drill: ${item.concepts?.join(' vs ')}`}
                {item.type === 'application_failure_drill' && 'Clinical Application Practice'}
                {item.type === 'memory_drill' && 'Memory Reinforcement'}
                {item.type === 'concept_review' && 'Concept Review'}
              </div>
              <div className={styles.remediationAction}>{item.action}</div>
              {item.subtopic && (
                <div className={styles.remediationTopic}>Subtopic: {item.subtopic}</div>
              )}
              {item.count && (
                <div className={styles.remediationTopic}>Occurrences: {item.count}</div>
              )}
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <h3>No remediation actions needed</h3>
            <p>Great job! No significant error patterns found for this topic</p>
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => (
    <div className={styles.card}>
      <div className={styles.sectionTitle}>Recent Misconceptions</div>
      {history.length > 0 ? (
        history.map((item) => {
          const meta = TYPE_META[item.misconception_type] || {
            label: item.misconception_type,
            icon: HelpCircle,
            iconClass: ''
          };
          const Icon = meta.icon;
          return (
            <div key={item.id} className={styles.historyItem}>
              <div className={`${styles.historyIcon} ${meta.iconClass}`}>
                <Icon size={18} strokeWidth={2} />
              </div>
              <div className={styles.historyContent}>
                <div className={styles.historyQuestion}>{item.stem}</div>
                <div className={styles.historyMeta}>
                  <span className={styles.historyBadge + ' ' + styles.historyBadgeType}>
                    {meta.label}
                  </span>
                  <span className={styles.historyBadge + ' ' + styles.historyBadgeTopic}>
                    {item.topic}{item.subtopic ? ` / ${item.subtopic}` : ''}
                  </span>
                  <span className={styles.historyBadge + ' ' + styles.historyBadgeDate}>
                    {new Date(item.submitted_at).toLocaleDateString()}
                  </span>
                  {item.ai_score !== null && (
                    <span className={styles.historyBadge + ' ' + styles.historyBadgeTopic}>
                      Score: {item.ai_score}
                    </span>
                  )}
                </div>
                {item.distractor_chosen_meaning && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                    Distractor: {item.distractor_chosen_meaning}
                  </div>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className={styles.emptyState}>
          <h3>No misconception history yet</h3>
          <p>Answer questions in the mastery flow to see your error patterns here</p>
        </div>
      )}
    </div>
  );

  if (loading) return <div className={styles.loading}>Loading misconception data...</div>;

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <button className={styles.backButton} onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </button>

        <h1 className={styles.title}>Misconception Tracker</h1>
        <p className={styles.subtitle}>
          Understand your error patterns and get targeted remediation
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'pairs' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('pairs')}
          >
            Confusion Pairs
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          {remediation && (
            <button
              className={`${styles.tab} ${activeTab === 'remediation' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('remediation')}
            >
              Remediation
            </button>
          )}
        </div>

        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'pairs' && renderConfusionPairs()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'remediation' && renderRemediation()}
      </div>
    </div>
  );
}

export default function MisconceptionsPage() {
  return (
    <ProtectedRoute>
      <Header />
      <MisconceptionsContent />
    </ProtectedRoute>
  );
}

