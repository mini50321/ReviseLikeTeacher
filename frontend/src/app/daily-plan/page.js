'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import { RefreshCw, BookOpen, PencilLine, Stethoscope, Coffee, CircleCheckBig } from 'lucide-react';
import styles from './daily-plan.module.css';

const TYPE_CONFIG = {
  revision: { icon: RefreshCw, label: 'Revision', color: '#ef5350' },
  learning: { icon: BookOpen, label: 'Learning', color: '#42a5f5' },
  practice: { icon: PencilLine, label: 'Practice', color: '#ffb74d' },
  diagnostic: { icon: Stethoscope, label: 'New Topic', color: '#ce93d8' },
  break: { icon: Coffee, label: 'Break', color: '#4dd0e1' }
};

function DailyPlanContent() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [completedBlocks, setCompletedBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  useEffect(() => {
    loadPlan();
  }, []);

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError('');
      setNeedsUpgrade(false);

      const [planRes, progressRes] = await Promise.all([
        api.get('/daily-plan/today').catch(e => {
          if (e.response?.status === 403 && e.response?.data?.upgrade_required) {
            setNeedsUpgrade(true);
            return { data: null };
          }
          throw e;
        }),
        api.get('/daily-plan/progress').catch(() => ({ data: { completed_blocks: [] } }))
      ]);

      setPlan(planRes.data);
      setCompletedBlocks(progressRes.data?.completed_blocks || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load daily plan');
    } finally {
      setLoading(false);
    }
  };

  const markComplete = async (blockIndex) => {
    try {
      const res = await api.post('/daily-plan/complete-block', { block_index: blockIndex });
      setCompletedBlocks(res.data.completed_blocks);
    } catch (err) {
      setError('Failed to mark block complete');
    }
  };

  const goToBlock = (block) => {
    if (block.action_url) {
      router.push(block.action_url);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading your daily plan...</div>;
  }

  if (needsUpgrade) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Adaptive Daily Plan</h1>
          <div className={styles.upgradeCard}>
            <div className={styles.upgradeTitle}>Premium Feature</div>
            <p className={styles.upgradeText}>
              The Adaptive Daily Plan creates a personalized study schedule based on your revision queue,
              weak areas, and exam timeline. Upgrade to Premium to unlock this feature.
            </p>
            <button className={styles.upgradeBtn} onClick={() => router.push('/subscription')}>
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!plan || !plan.blocks || plan.blocks.length === 0) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Adaptive Daily Plan</h1>
          <div className={styles.emptyState}>
            <p>No plan generated yet. Complete onboarding and start some topics to get a personalized daily plan.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalBlocks = plan.blocks.length;
  const doneCount = completedBlocks.length;
  const progressPct = totalBlocks > 0 ? Math.round((doneCount / totalBlocks) * 100) : 0;

  const revMin = plan.summary?.revision_minutes || 0;
  const learnMin = plan.summary?.learning_minutes || 0;
  const pracMin = plan.summary?.practice_minutes || 0;
  const totalMin = plan.total_planned_minutes || 1;

  const urgency = plan.context?.urgency_level || 'normal';
  const urgencyClass = urgency === 'critical' ? styles.contextPillUrgent
    : urgency === 'high' ? styles.contextPillHigh : '';

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <h1 className={styles.title}>Today's Plan</h1>
          <button className={styles.refreshBtn} onClick={loadPlan}>Refresh</button>
        </div>
        <p className={styles.subtitle}>{plan.date}</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.contextBar}>
          <span className={styles.contextPill}>
            {plan.context?.days_remaining} days to exam
          </span>
          <span className={`${styles.contextPill} ${urgencyClass}`}>
            {urgency.charAt(0).toUpperCase() + urgency.slice(1)} urgency
          </span>
          <span className={styles.contextPill}>
            {plan.total_available_minutes} min available
          </span>
          {plan.summary?.overdue_revisions > 0 && (
            <span className={`${styles.contextPill} ${styles.contextPillUrgent}`}>
              {plan.summary.overdue_revisions} overdue revisions
            </span>
          )}
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{plan.total_planned_minutes}</div>
            <div className={styles.summaryLabel}>Minutes Planned</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{totalBlocks}</div>
            <div className={styles.summaryLabel}>Study Blocks</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{doneCount}/{totalBlocks}</div>
            <div className={styles.summaryLabel}>Completed</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue} style={{ color: progressPct >= 80 ? '#81c784' : progressPct >= 40 ? '#ffb74d' : '#ef5350' }}>
              {progressPct}%
            </div>
            <div className={styles.summaryLabel}>Progress</div>
          </div>
        </div>

        <div className={styles.distributionBar}>
          {revMin > 0 && (
            <div
              className={styles.distributionSegment}
              style={{ width: `${(revMin / totalMin) * 100}%`, background: '#ef5350' }}
            />
          )}
          {learnMin > 0 && (
            <div
              className={styles.distributionSegment}
              style={{ width: `${(learnMin / totalMin) * 100}%`, background: '#42a5f5' }}
            />
          )}
          {pracMin > 0 && (
            <div
              className={styles.distributionSegment}
              style={{ width: `${(pracMin / totalMin) * 100}%`, background: '#ffb74d' }}
            />
          )}
        </div>

        <div className={styles.distributionLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#ef5350' }} /> Revision ({revMin}m)
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#42a5f5' }} /> Learning ({learnMin}m)
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#ffb74d' }} /> Practice ({pracMin}m)
          </span>
        </div>

        <div className={styles.timelineHeader}>
          <h2 className={styles.timelineTitle}>Study Blocks</h2>
          <span className={styles.progressText}>{doneCount} of {totalBlocks} completed</span>
        </div>

        <div className={styles.timeline}>
          <div className={styles.timelineConnector} />
          {plan.blocks.map((block, idx) => {
            const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.learning;
            const isDone = completedBlocks.includes(idx);

            const dotClass = [
              styles.blockDot,
              isDone ? styles.blockDotCompleted : '',
              !isDone && block.type === 'revision' ? styles.blockDotRevision : '',
              !isDone && block.type === 'learning' ? styles.blockDotLearning : '',
              !isDone && block.type === 'practice' ? styles.blockDotPractice : '',
              !isDone && block.type === 'diagnostic' ? styles.blockDotDiagnostic : '',
              !isDone && block.type === 'break' ? styles.blockDotBreak : ''
            ].filter(Boolean).join(' ');

            const typeClass = block.type === 'revision' ? styles.blockTypeRevision
              : block.type === 'learning' ? styles.blockTypeLearning
              : block.type === 'practice' ? styles.blockTypePractice
              : block.type === 'diagnostic' ? styles.blockTypeDiagnostic
              : styles.blockTypeBreak;

            const priorityClass = block.priority === 'high' ? styles.blockPriorityHigh
              : block.priority === 'medium' ? styles.blockPriorityMedium
              : styles.blockPriorityLow;

            return (
              <div key={idx} className={styles.block}>
                <div className={styles.blockTimeline}>
                  <div className={dotClass} />
                </div>
                <div className={`${styles.blockCard} ${isDone ? styles.blockCardCompleted : ''}`}>
                  <div className={styles.blockHeader}>
                    <span className={styles.blockIcon}>
                      <config.icon size={18} strokeWidth={2} style={{ color: config.color }} />
                    </span>
                    <span className={`${styles.blockType} ${typeClass}`}>{config.label}</span>
                    <span className={styles.blockDuration}>{block.duration_minutes} min</span>
                  </div>
                  <div className={styles.blockDescription}>{block.description}</div>
                  <div className={styles.blockMeta}>
                    {block.subject && (
                      <span className={styles.blockSubject}>{block.subject}</span>
                    )}
                    {block.priority && (
                      <span className={`${styles.blockPriority} ${priorityClass}`}>
                        {block.priority}
                      </span>
                    )}
                    {block.competency_score != null && (
                      <span className={styles.blockSubject}>
                        Score: {Math.round(block.competency_score)}
                      </span>
                    )}
                  </div>
                  <div className={styles.blockActions}>
                    {isDone ? (
                      <span className={styles.completedBadge}>
                        <CircleCheckBig size={14} strokeWidth={2.2} />
                        Done
                      </span>
                    ) : (
                      <>
                        {block.action_url && (
                          <button className={styles.startBtn} onClick={() => goToBlock(block)}>
                            Start
                          </button>
                        )}
                        <button className={styles.completeBtn} onClick={() => markComplete(idx)}>
                          Mark Done
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DailyPlanPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <DailyPlanContent />
      </div>
    </ProtectedRoute>
  );
}

