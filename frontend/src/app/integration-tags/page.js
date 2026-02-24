'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './integration-tags.module.css';

const TYPE_LABELS = {
  cross_subject: 'Cross-Subject',
  cross_topic: 'Cross-Topic',
  clinical_bridge: 'Clinical Bridge',
  mechanism_link: 'Mechanism Link',
  pharmacology_bridge: 'Pharma Bridge'
};

const TYPE_CLASS = {
  cross_subject: styles.typeCrossSubject,
  cross_topic: styles.typeCrossTopic,
  clinical_bridge: styles.typeClinicalBridge,
  mechanism_link: styles.typeMechanismLink,
  pharmacology_bridge: styles.typePharma
};

function IntegrationTagsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [stats, setStats] = useState(null);
  const [map, setMap] = useState([]);
  const [connections, setConnections] = useState(null);
  const [practiceQuestions, setPracticeQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [showAnswer, setShowAnswer] = useState({});
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (activeTab === 'map' && isPremium) loadMap();
    if (activeTab === 'connections' && isPremium) loadConnections();
    if (activeTab === 'practice' && isPremium) loadPractice();
  }, [activeTab, filterSubject, filterType]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      if (!isAdmin) {
        const subRes = await api.get('/subscription');
        setIsPremium(subRes.data.features.integration_tagging);
        if (!subRes.data.features.integration_tagging) {
          setLoading(false);
          return;
        }
      } else {
        setIsPremium(true);
      }
      const statsRes = await api.get('/integration-tags/stats');
      setStats(statsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadMap = async () => {
    setLoading(true);
    try {
      const params = filterSubject ? `?subject=${encodeURIComponent(filterSubject)}` : '';
      const res = await api.get(`/integration-tags/map${params}`);
      setMap(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load map');
    } finally {
      setLoading(false);
    }
  };

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await api.get('/integration-tags/connections');
      setConnections(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  };

  const loadPractice = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSubject) params.set('subject', filterSubject);
      if (filterType) params.set('type', filterType);
      const res = await api.get(`/integration-tags/practice?${params.toString()}`);
      setPracticeQuestions(res.data);
      setCurrentQIndex(0);
      setUserAnswers({});
      setShowAnswer({});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load practice');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setError('');
    try {
      const qRes = await api.get('/questions?limit=20&status=active&offset=0');
      const questionIds = (qRes.data.questions || qRes.data || []).map(q => q.id).slice(0, 20);
      if (questionIds.length === 0) {
        setError('No active questions found to analyze');
        return;
      }
      const result = await api.post('/integration-tags/auto-detect', { questionIds });
      alert(`Tagged ${result.data.tagged} integration points. ${result.data.errors?.length || 0} errors.`);
      loadInitial();
    } catch (err) {
      setError(err.response?.data?.error || 'Auto-detect failed');
    } finally {
      setDetecting(false);
    }
  };

  const handleSelectAnswer = (questionId, answer) => {
    if (showAnswer[questionId]) return;
    setUserAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleCheckAnswer = (questionId) => {
    setShowAnswer(prev => ({ ...prev, [questionId]: true }));
  };

  const getTypeStyle = (type) => TYPE_CLASS[type] || styles.typeCrossSubject;

  if (loading && !stats) {
    return <div className={styles.loading}>Loading Integration Tags...</div>;
  }

  if (!isAdmin && !isPremium) {
    return (
      <div className={styles.premiumRequired}>
        <h2 className={styles.premiumTitle}>Premium Feature</h2>
        <p className={styles.premiumMessage}>Integration-Style Tagging is available only to Premium subscribers.</p>
        <button className={styles.button} onClick={() => router.push('/subscription')}>Upgrade to Premium</button>
      </div>
    );
  }

  const subjects = stats?.by_subject?.map(s => s.primary_subject) || [];

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Integration Tags</h1>
        <p className={styles.subtitle}>Explore cross-subject connections and practice integration-style questions</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          {['overview', 'map', 'connections', 'practice'].map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' ? 'Overview' : tab === 'map' ? 'Integration Map' : tab === 'connections' ? 'Subject Links' : 'Practice'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && stats && (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statGreen}`}>{stats.total_tags}</div>
                <div className={styles.statLabel}>Total Tags</div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statOrange}`}>{stats.untagged_questions}</div>
                <div className={styles.statLabel}>Untagged Qs</div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statValue} ${styles.statBlue}`}>{stats.by_type?.length || 0}</div>
                <div className={styles.statLabel}>Tag Types</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stats.by_subject?.length || 0}</div>
                <div className={styles.statLabel}>Subjects</div>
              </div>
            </div>

            {isAdmin && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Admin: Auto-Detect Integrations</h3>
                <div className={styles.adminControls}>
                  <button
                    className={styles.adminButton}
                    onClick={handleAutoDetect}
                    disabled={detecting}
                  >
                    {detecting ? 'Detecting...' : 'Run Auto-Detection (20 Qs)'}
                  </button>
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>
                    AI will analyze questions and tag cross-subject integrations
                  </span>
                </div>
              </div>
            )}

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Integration Types</h3>
              <div className={styles.typeDistribution}>
                {(stats.by_type || []).map(t => (
                  <div key={t.integration_type} className={`${styles.typeBadge} ${getTypeStyle(t.integration_type)}`}>
                    <span className={styles.typeCount}>{t.cnt}</span>
                    {TYPE_LABELS[t.integration_type] || t.integration_type}
                  </div>
                ))}
                {(!stats.by_type || stats.by_type.length === 0) && (
                  <p className={styles.emptyText}>No tags yet. Use auto-detection to get started.</p>
                )}
              </div>
            </div>

            {stats.top_labels && stats.top_labels.length > 0 && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Top Integration Labels</h3>
                <div className={styles.topLabels}>
                  {stats.top_labels.map((label, idx) => (
                    <div key={idx} className={styles.topLabelRow}>
                      <span className={styles.topLabelText}>{label.integration_label}</span>
                      <span className={`${styles.topLabelType} ${getTypeStyle(label.integration_type)}`}>
                        {TYPE_LABELS[label.integration_type] || label.integration_type}
                      </span>
                      <span className={styles.topLabelCount}>{label.cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.by_subject && stats.by_subject.length > 0 && (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Tags by Subject</h3>
                <div className={styles.typeDistribution}>
                  {stats.by_subject.map(s => (
                    <div key={s.primary_subject} className={`${styles.typeBadge} ${styles.typeCrossSubject}`}>
                      <span className={styles.typeCount}>{s.cnt}</span>
                      {s.primary_subject}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'map' && (
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
              <button className={styles.button} onClick={loadMap}>Refresh</button>
            </div>

            {loading ? (
              <div className={styles.loading}>Loading integration map...</div>
            ) : (
              <div className={styles.integrationList}>
                {map.length === 0 ? (
                  <p className={styles.emptyText}>No integration tags found. Run auto-detection first.</p>
                ) : map.map((item, idx) => (
                  <div key={idx} className={styles.integrationItem}>
                    <div className={styles.integrationHeader}>
                      <span className={styles.integrationLabel}>{item.label}</span>
                      <span className={`${styles.integrationTypePill} ${getTypeStyle(item.type)}`}>
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                    <p className={styles.integrationExplanation}>{item.explanation}</p>
                    <div className={styles.linkedBadges}>
                      <span className={styles.linkedBadge}>{item.primary_subject} › {item.primary_topic}</span>
                      {(item.linked_subjects || []).map((ls, i) => (
                        <span key={i} className={styles.linkedBadge}>
                          → {ls}{item.linked_topics?.[i] ? ` › ${item.linked_topics[i]}` : ''}
                        </span>
                      ))}
                    </div>
                    <span className={styles.questionCount}>{item.questions?.length || 0} question(s)</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'connections' && (
          <>
            {loading ? (
              <div className={styles.loading}>Loading subject connections...</div>
            ) : connections ? (
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Subject-to-Subject Connections ({connections.edges?.length || 0} links)</h3>
                {connections.edges?.length === 0 ? (
                  <p className={styles.emptyText}>No connections found yet.</p>
                ) : (
                  <div className={styles.connectionsGraph}>
                    {connections.edges.map((edge, idx) => (
                      <div key={idx} className={styles.edgeCard}>
                        <span className={styles.edgeNode}>{edge.source}</span>
                        <span className={styles.edgeArrow}>⟷</span>
                        <span className={styles.edgeNode}>{edge.target}</span>
                        <span className={styles.edgeWeight}>×{edge.weight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {activeTab === 'practice' && (
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
              <select
                className={styles.filterSelect}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className={styles.button} onClick={loadPractice}>Load Questions</button>
            </div>

            {loading ? (
              <div className={styles.loading}>Loading practice questions...</div>
            ) : practiceQuestions.length === 0 ? (
              <p className={styles.emptyText}>No integration-tagged questions available. Run auto-detection on more questions.</p>
            ) : (
              <div className={styles.practiceSection}>
                {(() => {
                  const q = practiceQuestions[currentQIndex];
                  if (!q) return null;
                  const options = Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : []);
                  const answered = showAnswer[q.id];
                  const userAns = userAnswers[q.id];

                  return (
                    <div className={styles.questionCard}>
                      <div className={styles.questionMeta}>
                        <span className={styles.metaBadge}>{q.subject}</span>
                        <span className={styles.metaBadge}>{q.topic}</span>
                        {q.subtopic && <span className={styles.metaBadge}>{q.subtopic}</span>}
                        <span className={`${styles.metaBadge} ${getTypeStyle(q.integration_type)}`}>
                          {TYPE_LABELS[q.integration_type] || q.integration_type}
                        </span>
                        <span className={styles.metaBadge}>Q {currentQIndex + 1}/{practiceQuestions.length}</span>
                      </div>

                      <p className={styles.questionStem}>{q.stem}</p>

                      {options.length > 0 && (
                        <div className={styles.optionsGrid}>
                          {options.map((opt, idx) => {
                            let optClass = styles.optionButton;
                            if (answered) {
                              if (opt === q.correct_answer) optClass += ` ${styles.correctOption}`;
                              else if (opt === userAns && opt !== q.correct_answer) optClass += ` ${styles.wrongOption}`;
                            } else if (userAns === opt) {
                              optClass += ` ${styles.selectedOption}`;
                            }
                            return (
                              <button
                                key={idx}
                                className={optClass}
                                onClick={() => handleSelectAnswer(q.id, opt)}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {!answered && userAns && (
                        <button className={styles.checkButton} onClick={() => handleCheckAnswer(q.id)}>
                          Check Answer
                        </button>
                      )}

                      {answered && q.integration_label && (
                        <div className={styles.integrationHint}>
                          <div className={styles.integrationHintLabel}>Integration Insight</div>
                          <div>{q.integration_label}</div>
                          {q.explanation && <div style={{ marginTop: '0.3rem' }}>{q.explanation}</div>}
                          {q.linked_subjects && q.linked_subjects.length > 0 && (
                            <div style={{ marginTop: '0.3rem' }}>
                              Linked: {q.linked_subjects.join(', ')}
                              {q.linked_topics && q.linked_topics.length > 0 && ` (${q.linked_topics.join(', ')})`}
                            </div>
                          )}
                        </div>
                      )}

                      <div className={styles.practiceControls}>
                        <div className={styles.navButtons}>
                          <button
                            className={styles.controlButton}
                            onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentQIndex === 0}
                          >
                            Previous
                          </button>
                          <button
                            className={styles.controlButton}
                            onClick={() => setCurrentQIndex(prev => Math.min(practiceQuestions.length - 1, prev + 1))}
                            disabled={currentQIndex === practiceQuestions.length - 1}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationTagsPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <IntegrationTagsContent />
      </div>
    </ProtectedRoute>
  );
}

