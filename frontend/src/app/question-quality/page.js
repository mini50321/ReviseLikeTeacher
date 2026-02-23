'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './question-quality.module.css';

function QuestionQualityContent() {
  const [activeTab, setActiveTab] = useState('health');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [completeness, setCompleteness] = useState([]);
  const [issues, setIssues] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validatingTopic, setValidatingTopic] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterReadiness, setFilterReadiness] = useState('');

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    if (activeTab === 'subjects' && subjects.length === 0) fetchSubjects();
    if (activeTab === 'topics' && completeness.length === 0) fetchCompleteness();
    if (activeTab === 'issues' && !issues) fetchIssues();
  }, [activeTab]);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await api.get('/question-quality/health');
      setHealth(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/question-quality/subjects');
      setSubjects(res.data.subjects || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load subjects');
    }
  };

  const fetchCompleteness = async () => {
    try {
      const res = await api.get('/question-quality/completeness');
      setCompleteness(res.data.topics || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load completeness');
    }
  };

  const fetchIssues = async () => {
    try {
      const res = await api.get('/question-quality/issues');
      setIssues(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load issues');
    }
  };

  const handleValidate = async (subject, topic) => {
    setValidatingTopic(`${subject}/${topic}`);
    try {
      const res = await api.get(`/question-quality/validate/${encodeURIComponent(subject)}/${encodeURIComponent(topic)}`);
      setValidation(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Validation failed');
    }
  };

  const filteredTopics = completeness.filter(t => {
    if (filterSubject && t.subject !== filterSubject) return false;
    if (filterReadiness && t.readiness !== filterReadiness) return false;
    return true;
  });

  const allSubjects = [...new Set(completeness.map(t => t.subject))].sort();

  const renderHealth = () => {
    if (!health) return null;

    return (
      <div className={styles.healthSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{health.total_questions}</div>
            <div className={styles.statLabel}>Total Questions</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{health.by_type?.mcq || 0}</div>
            <div className={styles.statLabel}>MCQs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{health.by_type?.saq || 0}</div>
            <div className={styles.statLabel}>SAQs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{health.by_type?.laq || 0}</div>
            <div className={styles.statLabel}>LAQs</div>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Yield Classification</h3>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${health.yield_coverage?.classified_pct}%` }} />
            </div>
            <div className={styles.progressLabel}>{health.yield_coverage?.classified_pct}% classified</div>
            <div className={styles.yieldBreakdown}>
              {Object.entries(health.yield_coverage?.by_category || {}).map(([cat, count]) => (
                <div key={cat} className={styles.yieldItem}>
                  <span className={`${styles.yieldDot} ${styles[`yield_${cat}`]}`} />
                  <span className={styles.yieldName}>{cat}</span>
                  <span className={styles.yieldCount}>{count}</span>
                </div>
              ))}
              <div className={styles.yieldItem}>
                <span className={`${styles.yieldDot} ${styles.yield_none}`} />
                <span className={styles.yieldName}>Unclassified</span>
                <span className={styles.yieldCount}>{health.yield_coverage?.unclassified}</span>
              </div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Enrichment Coverage</h3>
            <div className={styles.enrichmentList}>
              <div className={styles.enrichmentItem}>
                <span>Trap Patterns</span>
                <div className={styles.miniBar}>
                  <div className={styles.miniBarFill} style={{ width: `${health.enrichment?.trap_pct}%` }} />
                </div>
                <span className={styles.enrichmentPct}>{health.enrichment?.trap_pct}%</span>
              </div>
              <div className={styles.enrichmentItem}>
                <span>Distractor Analysis</span>
                <div className={styles.miniBar}>
                  <div className={styles.miniBarFill} style={{ width: `${health.enrichment?.distractor_pct}%` }} />
                </div>
                <span className={styles.enrichmentPct}>{health.enrichment?.distractor_pct}%</span>
              </div>
              <div className={styles.enrichmentItem}>
                <span>Concept Tags</span>
                <div className={styles.miniBar}>
                  <div className={styles.miniBarFill} style={{ width: `${health.enrichment?.concept_tags_pct}%` }} />
                </div>
                <span className={styles.enrichmentPct}>{health.enrichment?.concept_tags_pct}%</span>
              </div>
            </div>
          </div>
        </div>

        {health.by_subject && health.by_subject.length > 0 && (
          <div className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Questions by Subject</h3>
            <div className={styles.subjectBars}>
              {health.by_subject.map(s => (
                <div key={s.subject} className={styles.subjectBarItem}>
                  <span className={styles.subjectBarName}>{s.subject}</span>
                  <div className={styles.subjectBar}>
                    <div
                      className={styles.subjectBarFill}
                      style={{ width: `${Math.min(100, (s.count / Math.max(...health.by_subject.map(x => x.count))) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.subjectBarCount}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSubjects = () => (
    <div className={styles.subjectsSection}>
      {subjects.length === 0 ? (
        <div className={styles.emptyState}>No subject data available.</div>
      ) : (
        <div className={styles.subjectCards}>
          {subjects.map(s => (
            <div key={s.subject} className={`${styles.subjectCard} ${styles[`health_${s.health}`]}`}>
              <div className={styles.subjectCardHeader}>
                <h3 className={styles.subjectCardName}>{s.subject}</h3>
                <span className={`${styles.healthBadge} ${styles[`hb_${s.health}`]}`}>{s.health}</span>
              </div>
              <div className={styles.subjectCardStats}>
                <div className={styles.subjectStat}>
                  <span className={styles.subjectStatVal}>{s.total}</span>
                  <span className={styles.subjectStatLbl}>Total</span>
                </div>
                <div className={styles.subjectStat}>
                  <span className={styles.subjectStatVal}>{s.mcq_count}</span>
                  <span className={styles.subjectStatLbl}>MCQ</span>
                </div>
                <div className={styles.subjectStat}>
                  <span className={styles.subjectStatVal}>{s.saq_count}</span>
                  <span className={styles.subjectStatLbl}>SAQ</span>
                </div>
                <div className={styles.subjectStat}>
                  <span className={styles.subjectStatVal}>{s.laq_count}</span>
                  <span className={styles.subjectStatLbl}>LAQ</span>
                </div>
              </div>
              <div className={styles.subjectCardMeta}>
                <span>{s.topic_count} topics</span>
                <span>Core+Freq: {s.core_frequent_pct}%</span>
                <span>Enriched: {s.enrichment_pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTopics = () => (
    <div className={styles.topicsSection}>
      <div className={styles.filterBar}>
        <select className={styles.filterSelect} value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
          <option value="">All Subjects</option>
          {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={styles.filterSelect} value={filterReadiness} onChange={e => setFilterReadiness(e.target.value)}>
          <option value="">All Readiness</option>
          <option value="ready">Ready</option>
          <option value="minor_gaps">Minor Gaps</option>
          <option value="needs_work">Needs Work</option>
          <option value="critical">Critical</option>
        </select>
        <span className={styles.filterCount}>{filteredTopics.length} topics</span>
      </div>

      <div className={styles.topicTable}>
        <div className={styles.topicTableHead}>
          <span>Subject / Topic</span>
          <span>MCQ</span>
          <span>SAQ</span>
          <span>LAQ</span>
          <span>Core+Freq%</span>
          <span>Traps%</span>
          <span>Balance</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filteredTopics.map(t => (
          <div key={`${t.subject}-${t.topic}`} className={`${styles.topicTableRow} ${styles[`row_${t.readiness}`]}`}>
            <span className={styles.topicName}>
              <strong>{t.subject}</strong>
              <br />{t.topic}
            </span>
            <span>{t.mcq_count}</span>
            <span>{t.saq_count}</span>
            <span>{t.laq_count}</span>
            <span className={t.core_frequent_pct < 70 ? styles.warnValue : ''}>{t.core_frequent_pct}%</span>
            <span className={t.trap_coverage_pct === 0 ? styles.warnValue : ''}>{t.trap_coverage_pct}%</span>
            <span>{t.cognitive_balance}</span>
            <span>
              <span className={`${styles.readinessBadge} ${styles[`rb_${t.readiness}`]}`}>{t.readiness.replace(/_/g, ' ')}</span>
            </span>
            <span>
              <button className={styles.validateBtn} onClick={() => handleValidate(t.subject, t.topic)}>Validate</button>
            </span>
          </div>
        ))}
      </div>

      {validation && validatingTopic && (
        <div className={styles.validationModal}>
          <div className={styles.validationContent}>
            <div className={styles.validationHeader}>
              <h3>MCQ Set Validation: {validatingTopic}</h3>
              <button className={styles.closeBtn} onClick={() => { setValidation(null); setValidatingTopic(null); }}>✕</button>
            </div>
            <div className={styles.validationScore}>
              <div className={`${styles.scoreCircle} ${validation.valid ? styles.scorePass : styles.scoreFail}`}>
                {validation.score}%
              </div>
              <div className={styles.scoreLabel}>
                {validation.passed_rules}/{validation.total_rules} rules passed
              </div>
            </div>
            <div className={styles.rulesList}>
              {Object.entries(validation.rules || {}).map(([key, rule]) => (
                <div key={key} className={`${styles.ruleItem} ${rule.passed ? styles.rulePassed : styles.ruleFailed}`}>
                  <span className={styles.ruleIcon}>{rule.passed ? '✓' : '✗'}</span>
                  <div className={styles.ruleContent}>
                    <div className={styles.ruleLabel}>{rule.label}</div>
                    <div className={styles.ruleDetail}>{rule.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderIssues = () => {
    if (!issues) return null;

    const issueTypes = [
      { key: 'low_core_frequent', label: 'Low Core+Frequent Coverage (<70%)', color: '#e74c3c' },
      { key: 'no_trap_questions', label: 'Missing Trap Questions', color: '#f39c12' },
      { key: 'no_saqs', label: 'No SAQs Available', color: '#9b59b6' },
      { key: 'no_laqs', label: 'No LAQs Available', color: '#3498db' },
      { key: 'insufficient_mcqs', label: 'Insufficient MCQs (<8)', color: '#e67e22' }
    ];

    return (
      <div className={styles.issuesSection}>
        <div className={styles.issueSummary}>
          <div className={`${styles.summaryCard} ${styles.summaryReady}`}>
            <div className={styles.summaryValue}>{issues.summary?.ready || 0}</div>
            <div className={styles.summaryLabel}>Ready</div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryMinor}`}>
            <div className={styles.summaryValue}>{issues.summary?.minor_gaps || 0}</div>
            <div className={styles.summaryLabel}>Minor Gaps</div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryWork}`}>
            <div className={styles.summaryValue}>{issues.summary?.needs_work || 0}</div>
            <div className={styles.summaryLabel}>Needs Work</div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCritical}`}>
            <div className={styles.summaryValue}>{issues.summary?.critical || 0}</div>
            <div className={styles.summaryLabel}>Critical</div>
          </div>
        </div>

        <div className={styles.issueCategories}>
          {issueTypes.map(it => {
            const items = issues.issues?.[it.key] || [];
            if (items.length === 0) return null;
            return (
              <div key={it.key} className={styles.issueCategory}>
                <div className={styles.issueCategoryHeader} style={{ borderLeftColor: it.color }}>
                  <span className={styles.issueCategoryTitle}>{it.label}</span>
                  <span className={styles.issueCategoryCount}>{items.length} topics</span>
                </div>
                <div className={styles.issueCategoryItems}>
                  {items.slice(0, 10).map((item, i) => (
                    <div key={i} className={styles.issueItem}>
                      <span>{item.subject} → {item.topic}</span>
                      {item.value !== undefined && <span className={styles.issueValue}>{item.value}%</span>}
                      {item.count !== undefined && <span className={styles.issueValue}>{item.count} MCQs</span>}
                    </div>
                  ))}
                  {items.length > 10 && (
                    <div className={styles.issueMore}>+{items.length - 10} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading && !health) {
    return <div className={styles.loading}>Loading Question Quality Dashboard...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Question Bank Quality</h1>
        <p className={styles.subtitle}>MCQ construction rules compliance, coverage analysis, and quality metrics.</p>

        {error && <div className={styles.error}>{error}<button onClick={() => setError('')}>✕</button></div>}

        <div className={styles.tabs}>
          <button className={`${styles.tabButton} ${activeTab === 'health' ? styles.activeTab : ''}`} onClick={() => setActiveTab('health')}>Bank Health</button>
          <button className={`${styles.tabButton} ${activeTab === 'subjects' ? styles.activeTab : ''}`} onClick={() => setActiveTab('subjects')}>Subjects</button>
          <button className={`${styles.tabButton} ${activeTab === 'topics' ? styles.activeTab : ''}`} onClick={() => setActiveTab('topics')}>Topic Quality</button>
          <button className={`${styles.tabButton} ${activeTab === 'issues' ? styles.activeTab : ''}`} onClick={() => setActiveTab('issues')}>Issues</button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'health' && renderHealth()}
          {activeTab === 'subjects' && renderSubjects()}
          {activeTab === 'topics' && renderTopics()}
          {activeTab === 'issues' && renderIssues()}
        </div>
      </div>
    </div>
  );
}

export default function QuestionQualityPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div>
        <Header />
        <QuestionQualityContent />
      </div>
    </ProtectedRoute>
  );
}

