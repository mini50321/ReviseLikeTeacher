'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './schedule.module.css';

function ScheduleContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('queue');
  const [schedule, setSchedule] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [queue, setQueue] = useState(null);
  const [studyPlan, setStudyPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [studyPlanGate, setStudyPlanGate] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [scheduleRes, priorityRes, queueRes, planRes] = await Promise.all([
        api.get('/schedule').catch(() => ({ data: { schedule: [] } })),
        api.get('/schedule/priorities').catch(() => ({ data: { priorities: [] } })),
        api.get('/revision-queue').catch(() => ({ data: null })),
        api.get('/subject-plan').catch(() => ({ data: { allocations: [], generated: false } }))
      ]);
      setSchedule(scheduleRes.data.schedule || []);
      setPriorities(priorityRes.data.priorities || []);
      setQueue(queueRes.data);
      if (planRes.data.generated) {
        setStudyPlan({ allocations: planRes.data.allocations });
      }
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
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (date, status) => {
    try {
      await api.put(`/schedule/${date}`, { status });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const startRevision = async (topicMasteryId) => {
    try {
      const res = await api.post(`/revision-queue/${topicMasteryId}/start-revision`);
      router.push(`/topic-mastery?sessionId=${res.data.topic_learning_session_id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start revision');
    }
  };

  const snoozeTopic = async (topicMasteryId, days) => {
    try {
      await api.post(`/revision-queue/${topicMasteryId}/snooze`, { days });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to snooze revision');
    }
  };

  const addToSchedule = async (topicMasteryId) => {
    try {
      await api.post('/revision-queue/add-to-schedule', { topic_mastery_id: topicMasteryId });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add to schedule');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isToday = (dateString) => {
    if (!dateString) return false;
    return dateString === new Date().toISOString().split('T')[0];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'mastered': return '#81c784';
      case 'revision_required': return '#ffb74d';
      case 'relearn_core': return '#ef5350';
      default: return 'rgba(255,255,255,0.6)';
    }
  };

  const getUrgencyStyle = (urgency) => {
    switch (urgency) {
      case 'overdue': return { background: 'rgba(239,83,80,0.2)', color: '#ef9a9a', border: '1px solid rgba(239,83,80,0.3)' };
      case 'today': return { background: 'rgba(255,152,0,0.2)', color: '#ffb74d', border: '1px solid rgba(255,152,0,0.3)' };
      case 'soon': return { background: 'rgba(33,150,243,0.15)', color: '#64b5f6', border: '1px solid rgba(33,150,243,0.3)' };
      default: return { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' };
    }
  };

  const getRetentionColor = (retention) => {
    if (retention >= 80) return '#81c784';
    if (retention >= 60) return '#ffb74d';
    if (retention >= 40) return '#ff9800';
    return '#ef5350';
  };

  const renderQueue = () => {
    if (!queue) return <div className={styles.emptyState}><p>No revision data available yet. Complete topic mastery flows to build your revision queue.</p></div>;

    const overdueCount = queue.stats?.overdue_count || 0;
    const upcomingCount = queue.stats?.upcoming_count || 0;
    const masteredCount = queue.stats?.mastered_count || 0;
    const attentionCount = queue.stats?.needs_attention_count || 0;

    return (
      <>
        <div className={styles.queueStats}>
          <div className={`${styles.queueStatCard} ${overdueCount > 0 ? styles.queueStatOverdue : ''}`}>
            <div className={styles.queueStatValue} style={{ color: overdueCount > 0 ? '#ef5350' : 'rgba(255,255,255,0.95)' }}>
              {overdueCount}
            </div>
            <div className={styles.queueStatLabel}>Overdue</div>
          </div>
          <div className={styles.queueStatCard}>
            <div className={styles.queueStatValue} style={{ color: '#64b5f6' }}>{upcomingCount}</div>
            <div className={styles.queueStatLabel}>Upcoming</div>
          </div>
          <div className={styles.queueStatCard}>
            <div className={styles.queueStatValue} style={{ color: '#81c784' }}>{masteredCount}</div>
            <div className={styles.queueStatLabel}>Mastered</div>
          </div>
          <div className={styles.queueStatCard}>
            <div className={styles.queueStatValue} style={{ color: '#ffb74d' }}>{attentionCount}</div>
            <div className={styles.queueStatLabel}>Needs Work</div>
          </div>
        </div>

        {queue.overdue?.length > 0 && (
          <div className={styles.queueSection}>
            <h3 className={styles.queueSectionTitle}>
              <span className={styles.queueDot} style={{ background: '#ef5350' }} />
              Overdue Revisions
            </h3>
            {queue.overdue.map((item) => renderQueueItem(item))}
          </div>
        )}

        {queue.upcoming?.length > 0 && (
          <div className={styles.queueSection}>
            <h3 className={styles.queueSectionTitle}>
              <span className={styles.queueDot} style={{ background: '#64b5f6' }} />
              Upcoming Revisions
            </h3>
            {queue.upcoming.map((item) => renderQueueItem(item))}
          </div>
        )}

        {queue.needs_attention?.length > 0 && (
          <div className={styles.queueSection}>
            <h3 className={styles.queueSectionTitle}>
              <span className={styles.queueDot} style={{ background: '#ffb74d' }} />
              Needs Attention
            </h3>
            {queue.needs_attention.map((item) => renderQueueItem(item))}
          </div>
        )}

        {overdueCount === 0 && upcomingCount === 0 && attentionCount === 0 && (
          <div className={styles.emptyState}>
            <p>No revisions scheduled yet.</p>
            <p>Complete topic mastery flows to build your revision queue.</p>
          </div>
        )}
      </>
    );
  };

  const renderQueueItem = (item) => {
    const urgencyStyle = getUrgencyStyle(item.urgency);
    return (
      <div key={item.id} className={styles.queueItem}>
        <div className={styles.queueItemLeft}>
          <div className={styles.queueItemTopic}>{item.topic}</div>
          <div className={styles.queueItemSubject}>{item.subject}</div>
          <div className={styles.queueItemMeta}>
            <span className={styles.queueBadge} style={{ color: getStatusColor(item.mastery_status) }}>
              {(item.mastery_status || 'unknown').replace(/_/g, ' ')}
            </span>
            <span className={styles.queueBadge}>
              {item.revision_progress} revisions
            </span>
            {item.competency_score > 0 && (
              <span className={styles.queueBadge}>
                Score: {Math.round(item.competency_score)}
              </span>
            )}
          </div>
        </div>
        <div className={styles.queueItemRight}>
          {item.next_revision_date && (
            <div className={styles.queueDate} style={urgencyStyle}>
              {item.urgency === 'overdue' && `${Math.abs(item.days_until_revision)}d overdue`}
              {item.urgency === 'today' && 'Due today'}
              {item.urgency === 'soon' && `In ${item.days_until_revision}d`}
              {item.urgency === 'normal' && formatDate(item.next_revision_date)}
            </div>
          )}
          <div className={styles.queueActions}>
            <button
              className={styles.queueStartBtn}
              onClick={() => startRevision(item.id)}
            >
              Start
            </button>
            <button
              className={styles.queueAddBtn}
              onClick={() => addToSchedule(item.id)}
            >
              + Schedule
            </button>
            {item.urgency === 'overdue' || item.urgency === 'today' ? (
              <button
                className={styles.queueSnoozeBtn}
                onClick={() => snoozeTopic(item.id, 1)}
              >
                +1d
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderSchedule = () => (
    <>
      <div className={styles.scheduleActions}>
        <button
          onClick={generateSchedule}
          disabled={generating}
          className={styles.button}
        >
          {generating ? 'Generating...' : 'Regenerate Schedule'}
        </button>
      </div>

      {schedule.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No schedule available yet.</p>
          {hasProfile ? (
            <p>Click Regenerate Schedule to create your personalized plan.</p>
          ) : (
            <>
              <p>Complete onboarding first.</p>
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
                {isToday(item.date) && <span className={styles.todayBadge}>Today</span>}
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
                      {Array.isArray(item.subjects) ? item.subjects.join(', ') : typeof item.subjects === 'string' ? item.subjects : 'N/A'}
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
                      <button className={styles.completeBtn} onClick={() => updateStatus(item.date, 'complete')}>
                        Complete
                      </button>
                      <button className={styles.skipBtn} onClick={() => updateStatus(item.date, 'skipped')}>
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
    </>
  );

  const renderPriorities = () => (
    <>
      {priorities.length > 0 ? (
        <div className={styles.prioritiesCard}>
          <h3 className={styles.prioritiesTitle}>Topic Priority Rankings</h3>
          <div className={styles.priorityList}>
            {priorities.slice(0, 15).map((topic, idx) => (
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
      ) : (
        <div className={styles.emptyState}>
          <p>No topic priority data available yet.</p>
          <p>Complete mastery flows to see prioritized topics here.</p>
        </div>
      )}
    </>
  );

  const generateStudyPlan = async () => {
    try {
      setGeneratingPlan(true);
      setError('');
      setStudyPlanGate(null);
      const res = await api.post('/subject-plan/generate');
      setStudyPlan(res.data);
    } catch (err) {
      const responseData = err.response?.data;
      if (err.response?.status === 403 && responseData?.upgrade_required) {
        setStudyPlanGate({
          reason: responseData.reason || 'Study plan requires Standard plan or higher.',
          currentTier: responseData.current_tier || 'free'
        });
        return;
      }
      setError(err.response?.data?.error || 'Failed to generate study plan');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const getBarColor = (idx) => {
    const colors = ['#7c4dff', '#448aff', '#00bfa5', '#ff6d00', '#e040fb', '#64dd17', '#ffd600', '#ff1744', '#00b0ff', '#76ff03'];
    return colors[idx % colors.length];
  };

  const renderStudyPlan = () => {
    if (studyPlanGate && !studyPlan) {
      return (
        <div className={styles.emptyState}>
          <p>{studyPlanGate.reason}</p>
          <p>Current plan: {studyPlanGate.currentTier}</p>
          <div className={styles.actions}>
            <button
              className={styles.button}
              onClick={() => router.push('/subscription')}
            >
              Upgrade Plan
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => setStudyPlanGate(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    if (!studyPlan) {
      return (
        <div className={styles.emptyState}>
          <p>No study plan generated yet.</p>
          <p>Generate a plan to see subject-wise hour allocation based on your goals.</p>
          <button
            className={styles.button}
            onClick={generateStudyPlan}
            disabled={generatingPlan}
          >
            {generatingPlan ? 'Generating...' : 'Generate Study Plan'}
          </button>
        </div>
      );
    }

    const allocs = studyPlan.allocations || [];
    const summary = studyPlan.summary;
    const topicSeq = studyPlan.topic_sequence || [];
    const maxHours = Math.max(...allocs.map(a => a.allocated_hours || 0), 1);

    return (
      <>
        <div className={styles.scheduleActions}>
          <button
            onClick={generateStudyPlan}
            disabled={generatingPlan}
            className={styles.button}
          >
            {generatingPlan ? 'Regenerating...' : 'Regenerate Plan'}
          </button>
        </div>

        {summary && (
          <div className={styles.planSummaryCard}>
            <div className={styles.planSummaryGrid}>
              <div className={styles.planSummaryItem}>
                <div className={styles.planSummaryValue}>{Math.round(summary.total_hours)}h</div>
                <div className={styles.planSummaryLabel}>Total Hours</div>
              </div>
              <div className={styles.planSummaryItem}>
                <div className={styles.planSummaryValue}>{summary.days_remaining}d</div>
                <div className={styles.planSummaryLabel}>Days Left</div>
              </div>
              <div className={styles.planSummaryItem}>
                <div className={styles.planSummaryValue}>{summary.daily_hours}h/day</div>
                <div className={styles.planSummaryLabel}>Daily Study</div>
              </div>
              <div className={styles.planSummaryItem}>
                <div className={styles.planSummaryValue}>{summary.subjects_count}</div>
                <div className={styles.planSummaryLabel}>Subjects</div>
              </div>
              {summary.exam_date && (
                <div className={styles.planSummaryItem}>
                  <div className={styles.planSummaryValue}>{summary.exam_date}</div>
                  <div className={styles.planSummaryLabel}>Exam Date</div>
                </div>
              )}
              <div className={styles.planSummaryItem}>
                <div className={styles.planSummaryValue}>{(summary.goal_tier || '').replace(/_/g, ' ')}</div>
                <div className={styles.planSummaryLabel}>Goal</div>
              </div>
            </div>
          </div>
        )}

        <div className={styles.planCard}>
          <h3 className={styles.planCardTitle}>Subject Hour Allocation</h3>
          <div className={styles.planFormula}>
            Priority = Weight × (6 − Rating) → Hours = Total × (Priority / ΣPriority)
          </div>
          {allocs.map((alloc, idx) => (
            <div key={alloc.subject} className={styles.allocRow}>
              <div className={styles.allocHeader}>
                <div className={styles.allocRank}>#{alloc.priority_rank || idx + 1}</div>
                <div className={styles.allocSubject}>{alloc.subject}</div>
                <div className={styles.allocHours}>{alloc.allocated_hours}h</div>
                <div className={styles.allocDaily}>{alloc.daily_hours}h/day</div>
              </div>
              <div className={styles.allocBarContainer}>
                <div
                  className={styles.allocBar}
                  style={{
                    width: `${(alloc.allocated_hours / maxHours) * 100}%`,
                    background: getBarColor(idx)
                  }}
                />
              </div>
              <div className={styles.allocSplit}>
                <span className={styles.allocSplitTag} style={{ background: 'rgba(33,150,243,0.15)', color: '#64b5f6' }}>
                  Learn {alloc.learning_percentage}%
                </span>
                <span className={styles.allocSplitTag} style={{ background: 'rgba(255,152,0,0.15)', color: '#ffb74d' }}>
                  Practice {alloc.practice_percentage}%
                </span>
                <span className={styles.allocSplitTag} style={{ background: 'rgba(76,175,80,0.15)', color: '#81c784' }}>
                  Revise {alloc.revision_percentage}%
                </span>
                {alloc.avg_mastery > 0 && (
                  <span className={styles.allocSplitTag} style={{ background: 'rgba(156,39,176,0.15)', color: '#ce93d8' }}>
                    Mastery {Math.round(alloc.avg_mastery)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {topicSeq.length > 0 && (
          <div className={styles.planCard}>
            <h3 className={styles.planCardTitle}>Recommended Topic Sequence</h3>
            <div className={styles.planFormula}>
              High-yield Core first → Student weakness → Easy wins for momentum
            </div>
            <div className={styles.topicSeqList}>
              {topicSeq.slice(0, 30).map((t, idx) => (
                <div key={`${t.subject}-${t.topic}-${idx}`} className={styles.topicSeqItem}>
                  <div className={styles.topicSeqRank}>{idx + 1}</div>
                  <div className={styles.topicSeqInfo}>
                    <span className={styles.topicSeqTopic}>{t.topic}</span>
                    <span className={styles.topicSeqSubject}>{t.subject}</span>
                  </div>
                  <div className={styles.topicSeqMeta}>
                    {t.has_core && (
                      <span className={styles.topicSeqTag} style={{ background: 'rgba(239,83,80,0.15)', color: '#ef9a9a' }}>
                        Core
                      </span>
                    )}
                    <span className={styles.topicSeqTag} style={{
                      background: t.mastery_status === 'mastered' ? 'rgba(76,175,80,0.15)' :
                        t.mastery_status === 'not_started' ? 'rgba(255,255,255,0.08)' :
                        'rgba(255,152,0,0.15)',
                      color: t.mastery_status === 'mastered' ? '#81c784' :
                        t.mastery_status === 'not_started' ? 'rgba(255,255,255,0.5)' :
                        '#ffb74d'
                    }}>
                      {(t.mastery_status || 'not started').replace(/_/g, ' ')}
                    </span>
                    {t.mastery_level > 0 && (
                      <span className={styles.topicSeqTag}>
                        {Math.round(t.mastery_level)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return <div className={styles.loading}>Loading schedule...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Revision Schedule</h1>
            <p className={styles.subtitle}>Spaced repetition queue &amp; smart revision plan</p>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'queue' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Revision Queue
            {queue?.stats?.overdue_count > 0 && (
              <span className={styles.tabBadge}>{queue.stats.overdue_count}</span>
            )}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'schedule' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            Weekly Schedule
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'priorities' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('priorities')}
          >
            Priorities
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'studyplan' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('studyplan')}
          >
            Study Plan
          </button>
        </div>

        {activeTab === 'queue' && renderQueue()}
        {activeTab === 'schedule' && renderSchedule()}
        {activeTab === 'priorities' && renderPriorities()}
        {activeTab === 'studyplan' && renderStudyPlan()}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <ProtectedRoute>
      <Header />
      <ScheduleContent />
    </ProtectedRoute>
  );
}
