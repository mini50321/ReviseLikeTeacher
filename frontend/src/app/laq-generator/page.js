'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './laq-generator.module.css';

function LAQGeneratorContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [laqs, setLaqs] = useState([]);
  const [topics, setTopics] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchTopics();
  }, []);

  useEffect(() => {
    if (activeTab === 'library') fetchLAQs();
  }, [activeTab, filterStatus, filterSubject, filterDifficulty]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/laq-generator/stats');
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async () => {
    try {
      const res = await api.get('/laq-generator/topics');
      setTopics(res.data.topics || []);
    } catch {}
  };

  const fetchLAQs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSubject) params.append('subject', filterSubject);
      if (filterDifficulty) params.append('difficulty', filterDifficulty);
      const res = await api.get(`/laq-generator/list?${params}`);
      setLaqs(res.data.laqs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load LAQs');
    } finally {
      setLoading(false);
    }
  };

  const subjects = [...new Set(topics.map(t => t.subject))].sort();
  const filteredTopics = selectedSubject
    ? topics.filter(t => t.subject === selectedSubject)
    : [];

  const handleGenerate = async () => {
    if (!selectedSubject || !selectedTopic) return;
    setGenerating(true);
    setError('');
    try {
      const res = await api.post('/laq-generator/generate', {
        subject: selectedSubject,
        topic: selectedTopic,
        difficulty: selectedDifficulty
      });
      setExpandedId(res.data.id);
      setActiveTab('library');
      fetchLAQs();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleReview = async (laqId, action, edited = null) => {
    try {
      await api.post(`/laq-generator/review/${laqId}`, { action, edited_data: edited });
      setEditingId(null);
      setEditData(null);
      fetchLAQs();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Review failed');
    }
  };

  const handleDelete = async (laqId) => {
    if (!confirm('Delete this LAQ?')) return;
    try {
      await api.delete(`/laq-generator/${laqId}`);
      fetchLAQs();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  const startEdit = (laq) => {
    setEditingId(laq.id);
    setEditData({
      vignette: laq.vignette,
      questions: [...laq.questions],
      model_answers: [...laq.model_answers],
      clinical_pearls: [...(laq.clinical_pearls || [])],
      difficulty: laq.difficulty
    });
  };

  const renderOverview = () => {
    if (!stats) return null;

    return (
      <div className={styles.overviewSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Total LAQs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.by_status?.approved || 0}</div>
            <div className={styles.statLabel}>Approved</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.by_status?.pending || 0}</div>
            <div className={styles.statLabel}>Pending Review</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.by_subject?.length || 0}</div>
            <div className={styles.statLabel}>Subjects Covered</div>
          </div>
        </div>

        <div className={styles.breakdownRow}>
          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>By Status</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.by_status || {}).map(([status, count]) => (
                <div key={status} className={styles.breakdownItem}>
                  <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{status}</span>
                  <span className={styles.breakdownCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>By Difficulty</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.by_difficulty || {}).map(([diff, count]) => (
                <div key={diff} className={styles.breakdownItem}>
                  <span className={`${styles.diffBadge} ${styles[`diff_${diff}`]}`}>{diff}</span>
                  <span className={styles.breakdownCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {stats.top_topics && stats.top_topics.length > 0 && (
          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>Top Topics</h3>
            <div className={styles.topTopicsList}>
              {stats.top_topics.map((t, i) => (
                <div key={i} className={styles.topTopicItem}>
                  <span className={styles.topTopicRank}>#{i + 1}</span>
                  <span className={styles.topTopicName}>{t.subject} → {t.topic}</span>
                  <span className={styles.topTopicCount}>{t.count} LAQs</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGenerateTab = () => (
    <div className={styles.generateSection}>
      <div className={styles.generateCard}>
        <h3 className={styles.generateTitle}>Generate Clinical Integration LAQ</h3>
        <p className={styles.generateDesc}>
          Combines 2–3 high-yield concepts into a clinical vignette testing diagnosis, mechanism, and next step.
        </p>

        <div className={styles.generateForm}>
          <div className={styles.formGroup}>
            <label>Subject</label>
            <select
              className={styles.formSelect}
              value={selectedSubject}
              onChange={e => { setSelectedSubject(e.target.value); setSelectedTopic(''); }}
            >
              <option value="">Select subject...</option>
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Topic</label>
            <select
              className={styles.formSelect}
              value={selectedTopic}
              onChange={e => setSelectedTopic(e.target.value)}
              disabled={!selectedSubject}
            >
              <option value="">Select topic...</option>
              {filteredTopics.map(t => (
                <option key={t.topic} value={t.topic}>{t.topic} ({t.question_count} MCQs)</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Difficulty</label>
            <select
              className={styles.formSelect}
              value={selectedDifficulty}
              onChange={e => setSelectedDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <button
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={!selectedSubject || !selectedTopic || generating}
          >
            {generating ? 'Generating Vignette...' : 'Generate LAQ'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderLibraryTab = () => (
    <div className={styles.librarySection}>
      <div className={styles.filterBar}>
        <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="edited">Edited</option>
        </select>
        <input
          className={styles.filterInput}
          placeholder="Filter by subject..."
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
        />
        <select className={styles.filterSelect} value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}>
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {laqs.length === 0 ? (
        <div className={styles.emptyState}>No LAQs found. Generate your first clinical vignette!</div>
      ) : (
        <div className={styles.laqList}>
          {laqs.map(laq => (
            <div key={laq.id} className={styles.laqCard}>
              <div className={styles.laqHeader}>
                <div className={styles.laqMeta}>
                  <span className={`${styles.statusBadge} ${styles[`status_${laq.status}`]}`}>{laq.status}</span>
                  <span className={styles.tag}>{laq.subject}</span>
                  <span className={styles.tag}>{laq.topic}</span>
                  <span className={`${styles.diffBadge} ${styles[`diff_${laq.difficulty}`]}`}>{laq.difficulty}</span>
                </div>
                <button
                  className={styles.expandButton}
                  onClick={() => setExpandedId(expandedId === laq.id ? null : laq.id)}
                >
                  {expandedId === laq.id ? '▲' : '▼'}
                </button>
              </div>

              <div className={styles.vignettePreview}>
                {expandedId === laq.id ? laq.vignette : `${laq.vignette?.substring(0, 200)}...`}
              </div>

              {expandedId === laq.id && (
                <div className={styles.expandedContent}>
                  <div className={styles.questionsSection}>
                    <h4 className={styles.sectionTitle}>Questions</h4>
                    {laq.questions.map((q, i) => (
                      <div key={i} className={styles.questionItem}>
                        <div className={styles.questionNumber}>Q{i + 1}</div>
                        <div className={styles.questionText}>{q}</div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.answersSection}>
                    <h4 className={styles.sectionTitle}>Model Answers</h4>
                    {laq.model_answers.map((a, i) => (
                      <div key={i} className={styles.answerItem}>
                        <div className={styles.answerNumber}>A{i + 1}</div>
                        <div className={styles.answerText}>{a}</div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.detailsGrid}>
                    {laq.key_concepts_tested?.length > 0 && (
                      <div className={styles.detailCard}>
                        <h5>Key Concepts</h5>
                        <div className={styles.tagList}>
                          {laq.key_concepts_tested.map((c, i) => (
                            <span key={i} className={styles.conceptTag}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {laq.integrated_topics?.length > 0 && (
                      <div className={styles.detailCard}>
                        <h5>Integrated Topics</h5>
                        <div className={styles.tagList}>
                          {laq.integrated_topics.map((t, i) => (
                            <span key={i} className={styles.intTag}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {laq.clinical_pearls?.length > 0 && (
                      <div className={styles.detailCard}>
                        <h5>Clinical Pearls</h5>
                        <ul className={styles.pearlList}>
                          {laq.clinical_pearls.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {laq.common_mistakes?.length > 0 && (
                      <div className={styles.detailCard}>
                        <h5>Common Mistakes</h5>
                        <ul className={styles.mistakeList}>
                          {laq.common_mistakes.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {laq.trap_elements?.length > 0 && (
                      <div className={styles.detailCard}>
                        <h5>Trap Elements</h5>
                        <div className={styles.tagList}>
                          {laq.trap_elements.map((t, i) => (
                            <span key={i} className={styles.trapTag}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {editingId === laq.id && editData ? (
                    <div className={styles.editForm}>
                      <div className={styles.formGroup}>
                        <label>Vignette</label>
                        <textarea
                          className={styles.editTextarea}
                          value={editData.vignette}
                          onChange={e => setEditData({ ...editData, vignette: e.target.value })}
                          rows={6}
                        />
                      </div>
                      {editData.questions.map((q, i) => (
                        <div key={i} className={styles.formGroup}>
                          <label>Question {i + 1}</label>
                          <textarea
                            className={styles.editTextareaSmall}
                            value={q}
                            onChange={e => {
                              const newQ = [...editData.questions];
                              newQ[i] = e.target.value;
                              setEditData({ ...editData, questions: newQ });
                            }}
                          />
                        </div>
                      ))}
                      {editData.model_answers.map((a, i) => (
                        <div key={i} className={styles.formGroup}>
                          <label>Model Answer {i + 1}</label>
                          <textarea
                            className={styles.editTextareaSmall}
                            value={a}
                            onChange={e => {
                              const newA = [...editData.model_answers];
                              newA[i] = e.target.value;
                              setEditData({ ...editData, model_answers: newA });
                            }}
                          />
                        </div>
                      ))}
                      <div className={styles.formGroup}>
                        <label>Difficulty</label>
                        <select
                          className={styles.editSelect}
                          value={editData.difficulty}
                          onChange={e => setEditData({ ...editData, difficulty: e.target.value })}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                      <div className={styles.editActions}>
                        <button className={styles.saveButton} onClick={() => handleReview(laq.id, 'edit', editData)}>Save</button>
                        <button className={styles.cancelButton} onClick={() => { setEditingId(null); setEditData(null); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.laqActions}>
                      {(laq.status === 'pending' || laq.status === 'edited') && (
                        <>
                          <button className={styles.approveButton} onClick={() => handleReview(laq.id, 'approve')}>Approve</button>
                          <button className={styles.editButton} onClick={() => startEdit(laq)}>Edit</button>
                          {laq.status === 'pending' && (
                            <button className={styles.rejectButton} onClick={() => handleReview(laq.id, 'reject')}>Reject</button>
                          )}
                        </>
                      )}
                      {laq.status === 'rejected' && (
                        <button className={styles.editButton} onClick={() => startEdit(laq)}>Re-edit</button>
                      )}
                      <button className={styles.deleteButton} onClick={() => handleDelete(laq.id)}>Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading && !stats) {
    return <div className={styles.loading}>Loading LAQ Generator...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>LAQ Clinical Integration Generator</h1>
        <p className={styles.subtitle}>Create clinical vignettes combining high-yield concepts for NEET-PG preparation.</p>

        {error && <div className={styles.error}>{error}<button onClick={() => setError('')}>✕</button></div>}

        <div className={styles.tabs}>
          <button className={`${styles.tabButton} ${activeTab === 'overview' ? styles.activeTab : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`${styles.tabButton} ${activeTab === 'generate' ? styles.activeTab : ''}`} onClick={() => setActiveTab('generate')}>Generate</button>
          <button className={`${styles.tabButton} ${activeTab === 'library' ? styles.activeTab : ''}`} onClick={() => setActiveTab('library')}>Library</button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'generate' && renderGenerateTab()}
          {activeTab === 'library' && renderLibraryTab()}
        </div>
      </div>
    </div>
  );
}

export default function LAQGeneratorPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div>
        <Header />
        <LAQGeneratorContent />
      </div>
    </ProtectedRoute>
  );
}

