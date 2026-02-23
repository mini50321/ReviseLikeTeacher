'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './concept-clusters.module.css';

function ConceptClustersContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'clusters') loadClusters();
    if (activeTab === 'patterns') loadPatterns();
  }, [activeTab, filterSubject]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await api.get('/concept-clusters/stats');
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const loadClusters = async () => {
    setLoading(true);
    try {
      const params = filterSubject ? `?subject=${encodeURIComponent(filterSubject)}` : '';
      const res = await api.get(`/concept-clusters/list${params}`);
      setClusters(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load clusters');
    } finally {
      setLoading(false);
    }
  };

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const params = filterSubject ? `?subject=${encodeURIComponent(filterSubject)}` : '';
      const res = await api.get(`/concept-clusters/patterns${params}`);
      setPatterns(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load patterns');
    } finally {
      setLoading(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setError('');
    try {
      const body = {};
      if (filterSubject) body.subject = filterSubject;
      const res = await api.post('/concept-clusters/detect', body);
      alert(`Found ${res.data.clusters_found} clusters, saved ${res.data.clusters_saved}.`);
      loadStats();
      if (activeTab === 'clusters') loadClusters();
      if (activeTab === 'patterns') loadPatterns();
    } catch (err) {
      setError(err.response?.data?.error || 'Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const handleClusterClick = async (clusterId) => {
    try {
      const res = await api.get(`/concept-clusters/${clusterId}`);
      setSelectedCluster(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cluster detail');
    }
  };

  const getRepScoreClass = (score) => {
    if (score >= 70) return styles.repHigh;
    if (score >= 40) return styles.repMedium;
    return styles.repLow;
  };

  const getFreqClass = (label) => {
    const map = { Core: styles.freqCore, Frequent: styles.freqFrequent, Occasional: styles.freqOccasional, Rare: styles.freqRare };
    return map[label] || styles.freqRare;
  };

  const getBarClass = (label) => {
    const map = { Core: styles.patternBarCore, Frequent: styles.patternBarFrequent, Occasional: styles.patternBarOccasional, Rare: styles.patternBarRare };
    return map[label] || styles.patternBarRare;
  };

  const subjects = stats?.by_subject?.map(s => s.subject) || [];

  if (loading && !stats) {
    return <div className={styles.loading}>Loading Concept Clusters...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Concept Clusters</h1>
        <p className={styles.subtitle}>Detect similar questions framed differently &amp; identify repetition patterns across years</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          {['overview', 'clusters', 'patterns'].map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' ? 'Overview' : tab === 'clusters' ? 'Clusters' : 'Repetition Patterns'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && stats && (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statGold}`}>{stats.total_clusters}</div>
                <div className={styles.statLabel}>Total Clusters</div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statBlue}`}>{stats.total_questions_clustered}</div>
                <div className={styles.statLabel}>Questions Clustered</div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statGreen}`}>{stats.by_subject?.length || 0}</div>
                <div className={styles.statLabel}>Subjects Covered</div>
              </div>
            </div>

            {isAdmin && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Run Cluster Detection</h3>
                <div className={styles.filterRow}>
                  <select
                    className={styles.filterSelect}
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                  >
                    <option value="">All Subjects</option>
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className={styles.button} onClick={handleDetect} disabled={detecting}>
                    {detecting ? 'Detecting...' : 'Detect Clusters'}
                  </button>
                </div>
              </div>
            )}

            {stats.by_subject && stats.by_subject.length > 0 && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Clusters by Subject</h3>
                <div className={styles.subjectGrid}>
                  {stats.by_subject.map(s => (
                    <div key={s.subject} className={styles.subjectCard}>
                      <span className={styles.subjectName}>{s.subject}</span>
                      <span className={styles.subjectStat}>{s.cluster_count} clusters &bull; {s.total_questions} Qs</span>
                      <span className={styles.subjectStat}>Avg Repetition: {s.avg_repetition_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.top_repetitions && stats.top_repetitions.length > 0 && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Highest Repetition Clusters</h3>
                <div className={styles.clusterList}>
                  {stats.top_repetitions.map((c, idx) => (
                    <div key={idx} className={styles.clusterItem}>
                      <div className={styles.clusterHeader}>
                        <span className={styles.clusterName}>{c.cluster_name}</span>
                        <span className={`${styles.repScore} ${getRepScoreClass(c.repetition_score)}`}>
                          {c.repetition_score}
                        </span>
                      </div>
                      <div className={styles.clusterMeta}>
                        {c.subject} &bull; {c.topic} &bull; {c.question_count} Qs &bull; Span: {c.year_span} yrs
                      </div>
                      <div className={styles.coreConcept}>{c.core_concept}</div>
                      {c.years_appeared && c.years_appeared.length > 0 && (
                        <div className={styles.yearTags}>
                          {c.years_appeared.map(y => (
                            <span key={y} className={styles.yearTag}>{y}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'clusters' && (
          <>
            <div className={styles.filterRow}>
              <select
                className={styles.filterSelect}
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={styles.button} onClick={loadClusters}>Refresh</button>
              {isAdmin && (
                <button className={styles.button} onClick={handleDetect} disabled={detecting}>
                  {detecting ? 'Detecting...' : 'Detect New'}
                </button>
              )}
            </div>

            {loading ? (
              <div className={styles.loading}>Loading clusters...</div>
            ) : clusters.length === 0 ? (
              <p className={styles.emptyText}>No clusters found. Run detection to discover concept clusters.</p>
            ) : (
              <div className={styles.clusterList}>
                {clusters.map(c => (
                  <div key={c.id} className={styles.clusterItem} onClick={() => handleClusterClick(c.id)}>
                    <div className={styles.clusterHeader}>
                      <span className={styles.clusterName}>{c.cluster_name}</span>
                      <span className={`${styles.repScore} ${getRepScoreClass(c.repetition_score)}`}>
                        Rep: {c.repetition_score}
                      </span>
                    </div>
                    <div className={styles.clusterMeta}>
                      {c.subject} &bull; {c.topic} &bull; {c.question_count} questions &bull; {c.year_span} year span
                    </div>
                    <div className={styles.coreConcept}>{c.core_concept}</div>
                    {c.framing_variants && c.framing_variants.length > 0 && (
                      <div className={styles.framingTags}>
                        {c.framing_variants.map((v, i) => (
                          <span key={i} className={styles.framingTag}>{v}</span>
                        ))}
                      </div>
                    )}
                    {c.years_appeared && c.years_appeared.length > 0 && (
                      <div className={styles.yearTags}>
                        {c.years_appeared.map(y => (
                          <span key={y} className={styles.yearTag}>{y}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'patterns' && (
          <>
            <div className={styles.filterRow}>
              <select
                className={styles.filterSelect}
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={styles.button} onClick={loadPatterns}>Refresh</button>
            </div>

            {loading ? (
              <div className={styles.loading}>Loading repetition patterns...</div>
            ) : patterns.length === 0 ? (
              <p className={styles.emptyText}>No patterns found. Run cluster detection first.</p>
            ) : (
              <div className={styles.patternList}>
                {patterns.map((p, idx) => (
                  <div key={idx} className={styles.patternItem}>
                    <div className={`${styles.patternBar} ${getBarClass(p.frequency_label)}`} />
                    <div className={styles.patternDetails}>
                      <div className={styles.patternConcept}>{p.core_concept}</div>
                      <div className={styles.patternMeta}>
                        {p.subject} &bull; {p.topic} &bull; {p.question_count} Qs &bull; {p.year_span} yr span
                      </div>
                      {p.framing_variants && p.framing_variants.length > 0 && (
                        <div className={styles.framingTags}>
                          {p.framing_variants.map((v, i) => (
                            <span key={i} className={styles.framingTag}>{v}</span>
                          ))}
                        </div>
                      )}
                      {p.years_appeared && p.years_appeared.length > 0 && (
                        <div className={styles.yearTags}>
                          {p.years_appeared.map(y => (
                            <span key={y} className={styles.yearTag}>{y}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.patternRight}>
                      <div className={styles.patternScore} style={{ color: p.repetition_score >= 70 ? '#ff8a80' : p.repetition_score >= 40 ? '#ffa726' : '#66bb6a' }}>
                        {p.repetition_score}
                      </div>
                      <div className={styles.patternLabel}>rep score</div>
                      <span className={`${styles.frequencyBadge} ${getFreqClass(p.frequency_label)}`}>
                        {p.frequency_label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selectedCluster && (
          <div className={styles.detailOverlay} onClick={() => setSelectedCluster(null)}>
            <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{selectedCluster.cluster_name}</h2>
                <button className={styles.closeButton} onClick={() => setSelectedCluster(null)}>✕</button>
              </div>

              <div className={styles.detailSummary}>
                {selectedCluster.concept_summary}
              </div>

              <div className={styles.detailStats}>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{selectedCluster.question_count}</div>
                  <div className={styles.detailStatLabel}>Questions</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{selectedCluster.repetition_score}</div>
                  <div className={styles.detailStatLabel}>Rep Score</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{selectedCluster.year_span}</div>
                  <div className={styles.detailStatLabel}>Year Span</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{selectedCluster.years_appeared?.length || 0}</div>
                  <div className={styles.detailStatLabel}>Years Appeared</div>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Core Concept</h3>
                <p style={{ color: '#bbb' }}>{selectedCluster.core_concept}</p>
              </div>

              {selectedCluster.framing_variants && selectedCluster.framing_variants.length > 0 && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Framing Variants</h3>
                  <div className={styles.framingTags}>
                    {selectedCluster.framing_variants.map((v, i) => (
                      <span key={i} className={styles.framingTag}>{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedCluster.years_appeared && selectedCluster.years_appeared.length > 0 && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Years Appeared</h3>
                  <div className={styles.yearTags}>
                    {selectedCluster.years_appeared.map(y => (
                      <span key={y} className={styles.yearTag}>{y}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedCluster.questions && selectedCluster.questions.length > 0 && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Questions in Cluster</h3>
                  <div className={styles.questionsList}>
                    {selectedCluster.questions.map((q, idx) => (
                      <div key={q.id} className={styles.questionItem}>
                        <p className={styles.questionStem}>{idx + 1}. {q.stem}</p>
                        <div className={styles.questionInfo}>
                          <span className={styles.infoBadge}>{q.type}</span>
                          <span className={styles.infoBadge}>{q.difficulty}</span>
                          {q.yield_category && <span className={styles.infoBadge}>{q.yield_category}</span>}
                          {q.previous_year_tags && <span className={styles.infoBadge}>{q.previous_year_tags}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConceptClustersPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <ConceptClustersContent />
      </div>
    </ProtectedRoute>
  );
}

