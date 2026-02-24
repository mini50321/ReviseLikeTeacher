'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import {
  Brain,
  RefreshCw,
  Zap,
  MessageCircleWarning,
  Microscope,
  Waves,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import styles from './distractor-lab.module.css';

function DistractorLabContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'stats' : 'vulnerability');
  const [stats, setStats] = useState(null);
  const [vulnerability, setVulnerability] = useState(null);
  const [trapGroups, setTrapGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [enrichSubject, setEnrichSubject] = useState('');
  const [enrichLimit, setEnrichLimit] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const promises = [
        api.get('/distractor-intelligence/stats').catch(() => ({ data: null }))
      ];

      if (!isAdmin) {
        promises.push(
          api.get('/distractor-intelligence/student-vulnerability').catch(() => ({ data: null }))
        );
      }

      promises.push(
        api.get('/distractor-intelligence/trap-patterns').catch(() => ({ data: { trap_groups: [] } }))
      );

      const results = await Promise.all(promises);

      setStats(results[0].data);

      if (!isAdmin) {
        setVulnerability(results[1].data);
        setTrapGroups(results[2].data?.trap_groups || []);
      } else {
        setTrapGroups(results[1].data?.trap_groups || []);
      }
    } catch (err) {
      setError('Failed to load distractor intelligence data');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    try {
      setEnriching(true);
      setError('');
      setEnrichResult(null);
      const res = await api.post('/distractor-intelligence/enrich', {
        subject: enrichSubject || undefined,
        limit: enrichLimit
      });
      setEnrichResult(res.data);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to enrich questions');
    } finally {
      setEnriching(false);
    }
  };

  const ERROR_TYPE_META = {
    concept_missing: { label: 'Concept Missing', color: '#ef5350', icon: Brain },
    confusion_pair: { label: 'Confusion Pair', color: '#ff9800', icon: RefreshCw },
    rule_exception_failure: { label: 'Rule Exception', color: '#ab47bc', icon: Zap },
    memory_slip: { label: 'Memory Slip', color: '#42a5f5', icon: MessageCircleWarning },
    application_failure: { label: 'Application Failure', color: '#26a69a', icon: Microscope },
    overgeneralization: { label: 'Overgeneralization', color: '#7e57c2', icon: Waves },
    trap_susceptibility: { label: 'Trap Susceptibility', color: '#ec407a', icon: ShieldAlert }
  };

  const renderStats = () => {
    if (!stats) return <p className={styles.emptyText}>No stats available.</p>;

    return (
      <>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total_mcqs}</div>
            <div className={styles.statLabel}>Total MCQs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.enriched_count}</div>
            <div className={styles.statLabel}>Distractor Analyzed</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.concept_tagged_count}</div>
            <div className={styles.statLabel}>Concept Tagged</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.trap_pattern_count}</div>
            <div className={styles.statLabel}>Traps Identified</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: stats.coverage_percentage >= 80 ? '#81c784' : stats.coverage_percentage >= 50 ? '#ffb74d' : '#ef5350' }}>
              {stats.coverage_percentage}%
            </div>
            <div className={styles.statLabel}>Coverage</div>
          </div>
        </div>

        {stats.subject_breakdown && stats.subject_breakdown.length > 0 && (
          <div className={styles.breakdownCard}>
            <h3 className={styles.cardTitle}>Subject Breakdown</h3>
            <div className={styles.breakdownTable}>
              <div className={styles.breakdownHeader}>
                <span className={styles.breakdownCol}>Subject</span>
                <span className={styles.breakdownColNum}>Total</span>
                <span className={styles.breakdownColNum}>Enriched</span>
                <span className={styles.breakdownColNum}>Tagged</span>
                <span className={styles.breakdownColNum}>Traps</span>
                <span className={styles.breakdownColNum}>Coverage</span>
              </div>
              {stats.subject_breakdown.map(s => (
                <div key={s.subject} className={styles.breakdownRow}>
                  <span className={styles.breakdownCol}>{s.subject}</span>
                  <span className={styles.breakdownColNum}>{s.total}</span>
                  <span className={styles.breakdownColNum}>{s.enriched}</span>
                  <span className={styles.breakdownColNum}>{s.concept_tagged}</span>
                  <span className={styles.breakdownColNum}>{s.trap_identified}</span>
                  <span className={styles.breakdownColNum}>
                    <span className={styles.coverageBadge} style={{
                      color: s.coverage >= 80 ? '#81c784' : s.coverage >= 50 ? '#ffb74d' : '#ef5350',
                      background: s.coverage >= 80 ? 'rgba(129,199,132,0.15)' : s.coverage >= 50 ? 'rgba(255,183,77,0.15)' : 'rgba(239,83,80,0.15)'
                    }}>
                      {s.coverage}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderEnrichment = () => {
    return (
      <div className={styles.enrichCard}>
        <h3 className={styles.cardTitle}>AI Distractor Enrichment</h3>
        <p className={styles.enrichDesc}>
          Analyze MCQs that are missing distractor data and generate error archetypes, concept tags, and trap patterns using AI.
        </p>
        <div className={styles.enrichControls}>
          <div className={styles.enrichField}>
            <label className={styles.enrichLabel}>Subject (optional)</label>
            <select
              className={styles.enrichSelect}
              value={enrichSubject}
              onChange={e => setEnrichSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {stats?.subject_breakdown?.map(s => (
                <option key={s.subject} value={s.subject}>{s.subject} ({s.total - s.enriched} unenriched)</option>
              ))}
            </select>
          </div>
          <div className={styles.enrichField}>
            <label className={styles.enrichLabel}>Batch Size</label>
            <select
              className={styles.enrichSelect}
              value={enrichLimit}
              onChange={e => setEnrichLimit(parseInt(e.target.value))}
            >
              {[5, 10, 15, 20].map(n => (
                <option key={n} value={n}>{n} questions</option>
              ))}
            </select>
          </div>
          <button
            className={styles.enrichButton}
            onClick={handleEnrich}
            disabled={enriching}
          >
            {enriching ? 'Enriching...' : 'Run Enrichment'}
          </button>
        </div>

        {enrichResult && (
          <div className={styles.enrichResult}>
            <div className={styles.enrichResultHeader}>
              ✓ {enrichResult.enriched} of {enrichResult.total_processed} questions enriched
            </div>
            {enrichResult.enrichments && enrichResult.enrichments.length > 0 && (
              <div className={styles.enrichmentList}>
                {enrichResult.enrichments.map((e, idx) => (
                  <div key={idx} className={`${styles.enrichmentItem} ${e.enriched ? styles.enrichmentSuccess : styles.enrichmentFallback}`}>
                    <span className={styles.enrichmentId}>{e.question_id.substring(0, 8)}...</span>
                    <span className={styles.enrichmentStatus}>{e.enriched ? 'Enriched' : 'Fallback'}</span>
                    {e.concept_tags?.length > 0 && (
                      <div className={styles.enrichmentTags}>
                        {e.concept_tags.map((tag, ti) => (
                          <span key={ti} className={styles.conceptTag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {e.trap_pattern && <span className={styles.trapBadge}>{e.trap_pattern}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderVulnerability = () => {
    if (!vulnerability) return <p className={styles.emptyText}>Complete some MCQ practice to see your distractor vulnerability analysis.</p>;

    return (
      <>
        <div className={styles.vulnSummary}>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#ef5350' }}>{vulnerability.total_errors}</div>
            <div className={styles.statLabel}>Total Errors Analyzed</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{vulnerability.error_type_summary?.length || 0}</div>
            <div className={styles.statLabel}>Error Types Found</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{vulnerability.top_trap_vulnerabilities?.length || 0}</div>
            <div className={styles.statLabel}>Trap Patterns Fallen For</div>
          </div>
        </div>

        {vulnerability.error_type_summary && vulnerability.error_type_summary.length > 0 && (
          <div className={styles.vulnCard}>
            <h3 className={styles.cardTitle}>Your Error Profile</h3>
            <div className={styles.errorTypeList}>
              {vulnerability.error_type_summary.map(et => {
                const meta = ERROR_TYPE_META[et.type] || { label: et.type, color: '#9e9e9e', icon: HelpCircle };
                const Icon = meta.icon;
                const maxCount = Math.max(...vulnerability.error_type_summary.map(x => x.total));
                return (
                  <div key={et.type} className={styles.errorTypeItem}>
                    <div className={styles.errorTypeHeader}>
                      <span className={styles.errorTypeIcon}>
                        <Icon size={18} strokeWidth={2.1} />
                      </span>
                      <span className={styles.errorTypeName}>{meta.label}</span>
                      <span className={styles.errorTypeCount} style={{ color: meta.color }}>{et.total}</span>
                    </div>
                    <div className={styles.errorTypeBar}>
                      <div
                        className={styles.errorTypeFill}
                        style={{ width: `${(et.total / maxCount) * 100}%`, backgroundColor: meta.color }}
                      ></div>
                    </div>
                    {et.examples && et.examples.length > 0 && (
                      <div className={styles.errorExamples}>
                        {et.examples.slice(0, 3).map((ex, idx) => (
                          <div key={idx} className={styles.errorExample}>
                            <span className={styles.errorExSubject}>{ex.subject} → {ex.topic}</span>
                            {ex.distractor_meaning && <span className={styles.errorExMeaning}>{ex.distractor_meaning}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vulnerability.top_trap_vulnerabilities && vulnerability.top_trap_vulnerabilities.length > 0 && (
          <div className={styles.vulnCard}>
            <h3 className={styles.cardTitle}>Trap Patterns You Fall For</h3>
            <div className={styles.trapVulnList}>
              {vulnerability.top_trap_vulnerabilities.map((tv, idx) => (
                <div key={idx} className={styles.trapVulnItem}>
                  <span className={styles.trapVulnRank}>{idx + 1}</span>
                  <span className={styles.trapVulnPattern}>{tv.trap_pattern}</span>
                  <span className={styles.trapVulnCount}>{tv.times_fallen}x</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderTrapPatterns = () => {
    const filtered = subjectFilter
      ? trapGroups.filter(g => g.subject === subjectFilter)
      : trapGroups;

    if (filtered.length === 0) return <p className={styles.emptyText}>No trap patterns identified yet.</p>;

    return (
      <>
        <div className={styles.filterRow}>
          <select
            className={styles.filterSelect}
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
          >
            <option value="">All Subjects</option>
            {[...new Set(trapGroups.map(g => g.subject))].sort().map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className={styles.trapGroupList}>
          {filtered.map((group, idx) => (
            <div key={idx} className={styles.trapGroupCard}>
              <div className={styles.trapGroupHeader}>
                <h3 className={styles.trapGroupTitle}>{group.topic}</h3>
                <span className={styles.trapGroupSubject}>{group.subject}</span>
                <span className={styles.trapGroupCount}>{group.patterns.length} traps</span>
              </div>
              <div className={styles.trapPatternList}>
                {group.patterns.map((p, pi) => (
                  <div key={pi} className={styles.trapPatternItem}>
                    <div className={styles.trapPatternText}>{p.trap_pattern}</div>
                    <div className={styles.trapPatternMeta}>
                      {p.difficulty && <span className={styles.diffTag}>{p.difficulty}</span>}
                      {p.yield_category && <span className={styles.yieldTag}>{p.yield_category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  if (loading) {
    return <div className={styles.loading}>Loading distractor intelligence...</div>;
  }

  const tabs = isAdmin
    ? [
      { key: 'stats', label: 'Coverage Stats' },
      { key: 'enrich', label: 'AI Enrichment' },
      { key: 'traps', label: 'Trap Patterns' }
    ]
    : [
      { key: 'vulnerability', label: 'My Vulnerability' },
      { key: 'traps', label: 'Trap Library' },
      { key: 'stats', label: 'Coverage Stats' }
    ];

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Distractor Intelligence</h1>
        <p className={styles.subtitle}>
          {isAdmin
            ? 'Analyze and enrich MCQ distractor data across the question bank'
            : 'Understand your error patterns and which exam traps you are vulnerable to'}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          {tabs.map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'stats' && renderStats()}
        {activeTab === 'enrich' && isAdmin && renderEnrichment()}
        {activeTab === 'vulnerability' && !isAdmin && renderVulnerability()}
        {activeTab === 'traps' && renderTrapPatterns()}
      </div>
    </div>
  );
}

export default function DistractorLabPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <DistractorLabContent />
      </div>
    </ProtectedRoute>
  );
}

