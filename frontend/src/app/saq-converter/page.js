'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './saq-converter.module.css';

function SAQConverterContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [unconverted, setUnconverted] = useState([]);
  const [selectedMCQs, setSelectedMCQs] = useState(new Set());
  const [converting, setConverting] = useState(false);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYield, setFilterYield] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'convert') fetchUnconverted();
    if (activeTab === 'review') fetchConversions();
  }, [activeTab, filterSubject, filterTopic, filterStatus, filterYield]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.get('/saq-converter/stats');
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnconverted = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSubject) params.append('subject', filterSubject);
      if (filterTopic) params.append('topic', filterTopic);
      if (filterYield) params.append('yield_category', filterYield);
      const res = await api.get(`/saq-converter/unconverted?${params}`);
      setUnconverted(res.data.mcqs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load MCQs');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSubject) params.append('subject', filterSubject);
      if (filterTopic) params.append('topic', filterTopic);
      const res = await api.get(`/saq-converter/conversions?${params}`);
      setConversions(res.data.conversions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load conversions');
    } finally {
      setLoading(false);
    }
  };

  const toggleMCQSelection = (id) => {
    const newSet = new Set(selectedMCQs);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedMCQs(newSet);
  };

  const selectAll = () => {
    if (selectedMCQs.size === unconverted.length) {
      setSelectedMCQs(new Set());
    } else {
      setSelectedMCQs(new Set(unconverted.map(q => q.id)));
    }
  };

  const handleConvert = async () => {
    if (selectedMCQs.size === 0) return;
    setConverting(true);
    setError('');
    try {
      const res = await api.post('/saq-converter/convert', {
        question_ids: Array.from(selectedMCQs)
      });
      alert(`Converted ${res.data.converted} MCQs to SAQs successfully!`);
      setSelectedMCQs(new Set());
      fetchUnconverted();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleReview = async (convId, action, edited = null) => {
    try {
      await api.post(`/saq-converter/review/${convId}`, {
        action,
        edited_data: edited
      });
      setReviewingId(null);
      setEditData(null);
      fetchConversions();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Review failed');
    }
  };

  const handleDelete = async (convId) => {
    if (!confirm('Delete this conversion?')) return;
    try {
      await api.delete(`/saq-converter/${convId}`);
      fetchConversions();
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  const startEdit = (conv) => {
    setReviewingId(conv.id);
    setEditData({
      saq_stem: conv.saq_stem,
      core_concept: conv.core_concept,
      ideal_answer: conv.ideal_answer,
      key_points: Array.isArray(conv.key_points) ? conv.key_points : [],
      cognitive_level: conv.cognitive_level,
      conversion_type: conv.conversion_type,
      difficulty: conv.difficulty
    });
  };

  const renderOverview = () => {
    if (!stats) return null;

    const conversionRate = stats.total_mcqs > 0
      ? ((stats.total_conversions / stats.total_mcqs) * 100).toFixed(1)
      : 0;

    return (
      <div className={styles.overviewSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total_mcqs}</div>
            <div className={styles.statLabel}>Total MCQs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total_conversions}</div>
            <div className={styles.statLabel}>Converted</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{conversionRate}%</div>
            <div className={styles.statLabel}>Coverage</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.by_status?.approved || 0}</div>
            <div className={styles.statLabel}>Approved SAQs</div>
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
            <h3 className={styles.breakdownTitle}>By Cognitive Level</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.by_cognitive_level || {}).map(([level, count]) => (
                <div key={level} className={styles.breakdownItem}>
                  <span className={styles.label}>{level}</span>
                  <span className={styles.breakdownCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.breakdownCard}>
            <h3 className={styles.breakdownTitle}>By Conversion Type</h3>
            <div className={styles.breakdownList}>
              {Object.entries(stats.by_conversion_type || {}).map(([type, count]) => (
                <div key={type} className={styles.breakdownItem}>
                  <span className={styles.label}>{type.replace(/_/g, ' ')}</span>
                  <span className={styles.breakdownCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {stats.by_subject && stats.by_subject.length > 0 && (
          <div className={styles.subjectSection}>
            <h3 className={styles.breakdownTitle}>Conversions by Subject</h3>
            <div className={styles.subjectGrid}>
              {stats.by_subject.map(s => (
                <div key={s.subject} className={styles.subjectItem}>
                  <span className={styles.subjectName}>{s.subject}</span>
                  <div className={styles.subjectBar}>
                    <div
                      className={styles.subjectBarFill}
                      style={{ width: `${Math.min(100, (s.count / Math.max(...stats.by_subject.map(x => x.count))) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.subjectCount}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderConvertTab = () => (
    <div className={styles.convertSection}>
      <div className={styles.filterBar}>
        <input
          className={styles.filterInput}
          placeholder="Filter by subject..."
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
        />
        <input
          className={styles.filterInput}
          placeholder="Filter by topic..."
          value={filterTopic}
          onChange={e => setFilterTopic(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={filterYield}
          onChange={e => setFilterYield(e.target.value)}
        >
          <option value="">All Yields</option>
          <option value="core">Core</option>
          <option value="frequent">Frequent</option>
          <option value="occasional">Occasional</option>
          <option value="rare">Rare</option>
        </select>
      </div>

      <div className={styles.actionBar}>
        <button className={styles.selectAllButton} onClick={selectAll}>
          {selectedMCQs.size === unconverted.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className={styles.selectedCount}>{selectedMCQs.size} selected</span>
        <button
          className={styles.convertButton}
          onClick={handleConvert}
          disabled={selectedMCQs.size === 0 || converting}
        >
          {converting ? 'Converting...' : `Convert ${selectedMCQs.size} MCQs to SAQs`}
        </button>
      </div>

      {unconverted.length === 0 ? (
        <div className={styles.emptyState}>No unconverted MCQs found matching filters.</div>
      ) : (
        <div className={styles.mcqList}>
          {unconverted.map(q => (
            <div
              key={q.id}
              className={`${styles.mcqItem} ${selectedMCQs.has(q.id) ? styles.selected : ''}`}
              onClick={() => toggleMCQSelection(q.id)}
            >
              <div className={styles.mcqCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedMCQs.has(q.id)}
                  onChange={() => toggleMCQSelection(q.id)}
                />
              </div>
              <div className={styles.mcqContent}>
                <div className={styles.mcqStem}>{q.stem?.substring(0, 200)}{q.stem?.length > 200 ? '...' : ''}</div>
                <div className={styles.mcqMeta}>
                  <span className={styles.tag}>{q.subject}</span>
                  <span className={styles.tag}>{q.topic}</span>
                  {q.subtopic && <span className={styles.tag}>{q.subtopic}</span>}
                  {q.yield_category && (
                    <span className={`${styles.yieldBadge} ${styles[`yield_${q.yield_category}`]}`}>
                      {q.yield_category}
                    </span>
                  )}
                  <span className={styles.difficultyBadge}>{q.difficulty}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderReviewTab = () => (
    <div className={styles.reviewSection}>
      <div className={styles.filterBar}>
        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
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
        <input
          className={styles.filterInput}
          placeholder="Filter by topic..."
          value={filterTopic}
          onChange={e => setFilterTopic(e.target.value)}
        />
      </div>

      {conversions.length === 0 ? (
        <div className={styles.emptyState}>No conversions found.</div>
      ) : (
        <div className={styles.conversionList}>
          {conversions.map(conv => (
            <div key={conv.id} className={styles.conversionCard}>
              <div className={styles.conversionHeader}>
                <div className={styles.conversionMeta}>
                  <span className={`${styles.statusBadge} ${styles[`status_${conv.status}`]}`}>{conv.status}</span>
                  <span className={styles.tag}>{conv.subject}</span>
                  <span className={styles.tag}>{conv.topic}</span>
                  <span className={`${styles.cogBadge} ${styles[`cog_${conv.cognitive_level}`]}`}>{conv.cognitive_level}</span>
                  <span className={styles.typeBadge}>{conv.conversion_type?.replace(/_/g, ' ')}</span>
                </div>
                <button
                  className={styles.expandButton}
                  onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                >
                  {expandedId === conv.id ? '▲' : '▼'}
                </button>
              </div>

              <div className={styles.conversionComparison}>
                <div className={styles.comparisonSide}>
                  <div className={styles.comparisonLabel}>Original MCQ</div>
                  <div className={styles.comparisonText}>{conv.mcq_stem?.substring(0, 150)}...</div>
                </div>
                <div className={styles.comparisonArrow}>→</div>
                <div className={styles.comparisonSide}>
                  <div className={styles.comparisonLabel}>Converted SAQ</div>
                  <div className={styles.comparisonText}>{conv.saq_stem}</div>
                </div>
              </div>

              {expandedId === conv.id && (
                <div className={styles.expandedContent}>
                  <div className={styles.detailGroup}>
                    <strong>Core Concept:</strong> {conv.core_concept}
                  </div>
                  <div className={styles.detailGroup}>
                    <strong>Ideal Answer:</strong> {conv.ideal_answer}
                  </div>
                  <div className={styles.detailGroup}>
                    <strong>Key Points:</strong>
                    <ul className={styles.keyPointsList}>
                      {(Array.isArray(conv.key_points) ? conv.key_points : []).map((kp, i) => (
                        <li key={i}>{kp}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.detailGroup}>
                    <strong>MCQ Options:</strong>
                    <ul className={styles.optionsList}>
                      {(Array.isArray(conv.mcq_options) ? conv.mcq_options : []).map((opt, i) => (
                        <li key={i} className={opt === conv.correct_answer ? styles.correctOption : ''}>{opt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {reviewingId === conv.id && editData ? (
                <div className={styles.editForm}>
                  <div className={styles.formGroup}>
                    <label>SAQ Stem</label>
                    <textarea
                      className={styles.editTextarea}
                      value={editData.saq_stem}
                      onChange={e => setEditData({ ...editData, saq_stem: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Core Concept</label>
                    <input
                      className={styles.editInput}
                      value={editData.core_concept}
                      onChange={e => setEditData({ ...editData, core_concept: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Ideal Answer</label>
                    <textarea
                      className={styles.editTextarea}
                      value={editData.ideal_answer}
                      onChange={e => setEditData({ ...editData, ideal_answer: e.target.value })}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Cognitive Level</label>
                      <select
                        className={styles.editSelect}
                        value={editData.cognitive_level}
                        onChange={e => setEditData({ ...editData, cognitive_level: e.target.value })}
                      >
                        <option value="conceptual">Conceptual</option>
                        <option value="application">Application</option>
                        <option value="analysis">Analysis</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Type</label>
                      <select
                        className={styles.editSelect}
                        value={editData.conversion_type}
                        onChange={e => setEditData({ ...editData, conversion_type: e.target.value })}
                      >
                        <option value="why_question">Why Question</option>
                        <option value="differentiation">Differentiation</option>
                        <option value="mechanism">Mechanism</option>
                        <option value="clinical_reasoning">Clinical Reasoning</option>
                        <option value="explain">Explain</option>
                      </select>
                    </div>
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
                  </div>
                  <div className={styles.editActions}>
                    <button className={styles.saveButton} onClick={() => handleReview(conv.id, 'edit', editData)}>Save Changes</button>
                    <button className={styles.cancelButton} onClick={() => { setReviewingId(null); setEditData(null); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className={styles.conversionActions}>
                  {conv.status === 'pending' && (
                    <>
                      <button className={styles.approveButton} onClick={() => handleReview(conv.id, 'approve')}>Approve</button>
                      <button className={styles.editButton} onClick={() => startEdit(conv)}>Edit</button>
                      <button className={styles.rejectButton} onClick={() => handleReview(conv.id, 'reject')}>Reject</button>
                    </>
                  )}
                  {conv.status === 'edited' && (
                    <>
                      <button className={styles.approveButton} onClick={() => handleReview(conv.id, 'approve')}>Approve</button>
                      <button className={styles.editButton} onClick={() => startEdit(conv)}>Edit Again</button>
                    </>
                  )}
                  {conv.status === 'rejected' && (
                    <button className={styles.editButton} onClick={() => startEdit(conv)}>Re-edit</button>
                  )}
                  <button className={styles.deleteButton} onClick={() => handleDelete(conv.id)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading && !stats) {
    return <div className={styles.loading}>Loading SAQ Converter...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>MCQ → SAQ Conversion Engine</h1>
        <p className={styles.subtitle}>Convert MCQs into conceptual diagnostic SAQs for the mastery engine.</p>

        {error && <div className={styles.error}>{error}<button onClick={() => setError('')}>✕</button></div>}

        <div className={styles.tabs}>
          <button className={`${styles.tabButton} ${activeTab === 'overview' ? styles.activeTab : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`${styles.tabButton} ${activeTab === 'convert' ? styles.activeTab : ''}`} onClick={() => setActiveTab('convert')}>Convert MCQs</button>
          <button className={`${styles.tabButton} ${activeTab === 'review' ? styles.activeTab : ''}`} onClick={() => setActiveTab('review')}>Review & Approve</button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'convert' && renderConvertTab()}
          {activeTab === 'review' && renderReviewTab()}
        </div>
      </div>
    </div>
  );
}

export default function SAQConverterPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div>
        <Header />
        <SAQConverterContent />
      </div>
    </ProtectedRoute>
  );
}

