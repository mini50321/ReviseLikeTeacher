'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './crash-packs.module.css';

function CrashPacksContent() {
  const router = useRouter();
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [packData, setPackData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [packLoading, setPackLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState(null);

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    try {
      setLoading(true);
      setError('');
      setNeedsUpgrade(false);
      const res = await api.get('/crash-packs/subjects');
      setSubjects(res.data.subjects || []);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.upgrade_required) {
        setNeedsUpgrade(true);
      } else {
        setError(err.response?.data?.error || 'Failed to load subjects');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPack = async (subject) => {
    try {
      setPackLoading(true);
      setError('');
      setSelectedSubject(subject);
      setExpandedTopic(null);
      const res = await api.get(`/crash-packs/generate/${encodeURIComponent(subject)}`);
      setPackData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate crash pack');
    } finally {
      setPackLoading(false);
    }
  };

  const goBack = () => {
    setSelectedSubject(null);
    setPackData(null);
  };

  if (loading) {
    return <div className={styles.loading}>Loading crash packs...</div>;
  }

  if (needsUpgrade) {
    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Subject Crash Packs</h1>
          <div className={styles.upgradeCard}>
            <div className={styles.upgradeTitle}>Premium Feature</div>
            <p className={styles.upgradeText}>
              Crash Packs bundle all high-yield content for a subject into one intensive review:
              core subtopics, exam trigger notes, comparison tables, trap patterns, and weak area analysis.
            </p>
            <button className={styles.upgradeBtn} onClick={() => router.push('/subscription')}>
              View Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSubject && packData) {
    const s = packData.summary;

    return (
      <div className={styles.main}>
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={goBack}>← All Subjects</button>

          <div className={styles.packHeader}>
            <div className={styles.packSubject}>{packData.subject}</div>
            <p className={styles.subtitle}>Intensive high-yield review pack</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{s.total_high_yield_topics}</div>
              <div className={styles.summaryLabel}>High-Yield Topics</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue} style={{ color: '#81c784' }}>{s.mastered_count}</div>
              <div className={styles.summaryLabel}>Mastered</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue} style={{ color: '#ef5350' }}>{s.weak_count}</div>
              <div className={styles.summaryLabel}>Weak</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{s.avg_competency}</div>
              <div className={styles.summaryLabel}>Avg Competency</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{s.total_core_mcqs}</div>
              <div className={styles.summaryLabel}>Core MCQs</div>
            </div>
          </div>

          {packLoading ? (
            <div className={styles.loading}>Generating crash pack...</div>
          ) : (
            <div className={styles.topicList}>
              {packData.topics.map((t, idx) => {
                const isExpanded = expandedTopic === idx;
                const priorityColor = t.priority === 'high' ? '#ef5350' : t.priority === 'medium' ? '#ffb74d' : '#81c784';
                const statusColor = t.status === 'mastered' ? '#81c784' : t.status === 'revision_required' ? '#ffb74d' : t.status === 'relearn_core' ? '#ef5350' : '#9e9e9e';
                const statusBg = t.status === 'mastered' ? 'rgba(129,199,132,0.12)' : t.status === 'revision_required' ? 'rgba(255,183,77,0.12)' : t.status === 'relearn_core' ? 'rgba(239,83,80,0.12)' : 'rgba(158,158,158,0.12)';

                return (
                  <div key={idx} className={styles.topicCard}>
                    <div className={styles.topicHeader} onClick={() => setExpandedTopic(isExpanded ? null : idx)}>
                      <div className={styles.topicPriority} style={{ background: priorityColor }} />
                      <div className={styles.topicInfo}>
                        <span className={styles.topicName}>{t.topic}</span>
                        <span className={styles.topicMeta}>
                          {t.total_pyqs} PYQs • {t.mcq_count} MCQs • {t.core_subtopics.length} subtopics
                        </span>
                      </div>
                      <span className={styles.topicMasteryBadge} style={{ background: statusBg, color: statusColor }}>
                        {(t.status || 'not started').replace(/_/g, ' ')}
                      </span>
                      <span className={styles.topicExpandIcon}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {isExpanded && (
                      <div className={styles.topicBody}>
                        {t.mastery && (
                          <div className={styles.masteryBar}>
                            <div className={styles.masteryBarLabel}>
                              <span>Competency: {Math.round(t.mastery.competency || 0)}</span>
                              <span>MCQ Acc: {Math.round(t.mastery.mcq_accuracy || 0)}%</span>
                              <span>Core Cov: {Math.round(t.mastery.core_coverage || 0)}%</span>
                            </div>
                            <div className={styles.masteryBarTrack}>
                              <div
                                className={styles.masteryBarFill}
                                style={{
                                  width: `${t.mastery.level || 0}%`,
                                  background: (t.mastery.level || 0) >= 80 ? '#81c784' : (t.mastery.level || 0) >= 50 ? '#ffb74d' : '#ef5350'
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <h4 className={styles.sectionTitle}>Core & Frequent Subtopics</h4>
                        <div className={styles.subtopicList}>
                          {t.core_subtopics.map((st, si) => (
                            <span
                              key={si}
                              className={`${styles.subtopicChip} ${st.yield_category === 'core' ? styles.chipCore : styles.chipFrequent}`}
                            >
                              {st.subtopic} ({st.pyq_count})
                            </span>
                          ))}
                        </div>

                        {t.exam_notes && t.exam_notes.trigger_lines?.length > 0 && (
                          <>
                            <h4 className={styles.sectionTitle}>Exam Trigger Lines</h4>
                            <div className={styles.notesList}>
                              {t.exam_notes.trigger_lines.map((line, li) => (
                                <div key={li} className={styles.noteItem}>{line}</div>
                              ))}
                            </div>
                          </>
                        )}

                        {t.exam_notes && t.exam_notes.recall_bullets?.length > 0 && (
                          <>
                            <h4 className={styles.sectionTitle}>Recall Bullets</h4>
                            <div className={styles.notesList}>
                              {t.exam_notes.recall_bullets.map((b, bi) => (
                                <div key={bi} className={styles.noteItem}>• {b}</div>
                              ))}
                            </div>
                          </>
                        )}

                        {t.teaching && t.teaching.comparison_tables?.length > 0 && (
                          <>
                            <h4 className={styles.sectionTitle}>High-Yield Comparison Tables</h4>
                            {t.teaching.comparison_tables.map((tbl, ti) => {
                              if (typeof tbl === 'string') {
                                return <div key={ti} className={styles.noteItem}>{tbl}</div>;
                              }
                              if (tbl && tbl.headers && tbl.rows) {
                                return (
                                  <table key={ti} className={styles.comparisonTable}>
                                    <thead>
                                      <tr>{tbl.headers.map((h, hi) => <th key={hi}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                      {tbl.rows.map((row, ri) => (
                                        <tr key={ri}>
                                          {(Array.isArray(row) ? row : Object.values(row)).map((cell, ci) => (
                                            <td key={ci}>{cell}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                );
                              }
                              return <div key={ti} className={styles.noteItem}>{JSON.stringify(tbl)}</div>;
                            })}
                          </>
                        )}

                        {t.teaching && t.teaching.trap_patterns?.length > 0 && (
                          <>
                            <h4 className={styles.sectionTitle}>Trap Patterns</h4>
                            <div className={styles.trapList}>
                              {t.teaching.trap_patterns.map((tp, tpi) => (
                                <div key={tpi} className={styles.trapItem}>
                                  <span>⚠️</span>
                                  <span>{typeof tp === 'string' ? tp : tp.description || JSON.stringify(tp)}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {t.misconceptions.length > 0 && (
                          <>
                            <h4 className={styles.sectionTitle}>Your Misconception Patterns</h4>
                            <div className={styles.misconceptionList}>
                              {t.misconceptions.map((mc, mi) => (
                                <span key={mi} className={styles.misconceptionChip}>
                                  {mc.type} (×{mc.count})
                                </span>
                              ))}
                            </div>
                          </>
                        )}

                        <div className={styles.actionBtns}>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            onClick={() => router.push(`/diagnostic?subject=${encodeURIComponent(packData.subject)}&topic=${encodeURIComponent(t.topic)}`)}
                          >
                            Start Diagnostic
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                            onClick={() => router.push(`/teaching-units?subject=${encodeURIComponent(packData.subject)}&topic=${encodeURIComponent(t.topic)}`)}
                          >
                            Teaching Unit
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                            onClick={() => router.push(`/exam-notes?subject=${encodeURIComponent(packData.subject)}&topic=${encodeURIComponent(t.topic)}`)}
                          >
                            Exam Notes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Subject Crash Packs</h1>
        <p className={styles.subtitle}>
          Intensive high-yield review — core subtopics, exam notes, trap patterns, and weak area analysis per subject
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {subjects.length > 0 ? (
          <div className={styles.subjectGrid}>
            {subjects.map((s, idx) => (
              <div
                key={idx}
                className={styles.subjectCard}
                onClick={() => loadPack(s.subject)}
              >
                <div className={styles.subjectName}>{s.subject}</div>
                <div className={styles.subjectStats}>
                  <span className={styles.subjectStat}>
                    <span className={styles.subjectStatValue}>{s.high_yield_subtopics}</span> subtopics
                  </span>
                  <span className={styles.subjectStat}>
                    <span className={styles.subjectStatValue}>{s.core_mcqs_available}</span> MCQs
                  </span>
                  <span className={styles.subjectStat}>
                    <span className={styles.subjectStatValue}>{s.topics_mastered}</span>/{s.topics_covered} mastered
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No subjects available. Complete onboarding to get started.</p>
        )}
      </div>
    </div>
  );
}

export default function CrashPacksPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <CrashPacksContent />
      </div>
    </ProtectedRoute>
  );
}

