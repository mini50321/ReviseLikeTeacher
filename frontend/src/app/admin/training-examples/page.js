'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import styles from './training-examples.module.css';

export default function TrainingExamplesPage() {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addForm, setAddForm] = useState({
    studentQuestion: '',
    tutorReply: '',
    subject: '',
    topic: '',
    studentLevel: ''
  });
  const [adding, setAdding] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMeta, setImportMeta] = useState({
    subject: '',
    topic: '',
    student_level: '',
    source_file: ''
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filters, setFilters] = useState({
    subject: '',
    topic: '',
    student_level: '',
    limit: 50
  });

  useEffect(() => {
    fetchExamples();
  }, [filters.subject, filters.topic, filters.student_level, filters.limit]);

  const fetchExamples = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.subject) params.subject = filters.subject;
      if (filters.topic) params.topic = filters.topic;
      if (filters.student_level) params.student_level = filters.student_level;
      if (filters.limit) params.limit = filters.limit;
      const res = await api.get('/concept-map/training-examples', { params });
      setExamples(res.data.examples || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load examples');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExample = async () => {
    const sq = (addForm.studentQuestion || '').trim();
    const tr = (addForm.tutorReply || '').trim();
    if (!sq || !tr) {
      setError('Please enter both the student question and tutor reply.');
      return;
    }
    const messages = [
      { role: 'user', content: sq },
      { role: 'assistant', content: tr }
    ];
    const line = JSON.stringify({ messages });
    setAdding(true);
    setError('');
    setImportResult(null);
    try {
      const payload = {
        jsonl_content: [line],
        ...(addForm.subject && { subject: addForm.subject }),
        ...(addForm.topic && { topic: addForm.topic }),
        ...(addForm.studentLevel && { student_level: addForm.studentLevel })
      };
      const res = await api.post('/concept-map/training-examples/import', payload);
      setImportResult(res.data);
      setAddForm({ studentQuestion: '', tutorReply: '', subject: '', topic: '', studentLevel: '' });
      fetchExamples();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add example');
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setError('Paste JSONL content (one object per line)');
      return;
    }
    const lines = trimmed.split(/\n/).filter(Boolean);
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const payload = {
        jsonl_content: lines,
        ...(importMeta.subject && { subject: importMeta.subject }),
        ...(importMeta.topic && { topic: importMeta.topic }),
        ...(importMeta.student_level && { student_level: importMeta.student_level }),
        ...(importMeta.source_file && { source_file: importMeta.source_file })
      };
      const res = await api.post('/concept-map/training-examples/import', payload);
      setImportResult(res.data);
      setImportText('');
      fetchExamples();
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setError('');
    try {
      const params = {};
      if (filters.subject) params.subject = filters.subject;
      if (filters.topic) params.topic = filters.topic;
      if (filters.student_level) params.student_level = filters.student_level;
      const res = await api.get('/concept-map/training-examples/export', {
        params,
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tutoring-training.jsonl';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const previewContent = (msg) => {
    if (!msg || !msg.content) return '';
    const s = String(msg.content);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  };

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.topBar}>
              <div className={styles.titleGroup}>
                <h1 className={styles.pageTitle}>Tutoring Examples</h1>
                <p className={styles.pageSubtitle}>Add sample conversations so the AI tutor learns your teaching style. Each example shows a student question and how the tutor should reply.</p>
              </div>
              <button className={styles.exportButton} onClick={handleExport}>
                Download all
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {importResult && (
              <div className={styles.importResult}>
                Added {importResult.imported} example{importResult.imported !== 1 ? 's' : ''}
                {importResult.skipped > 0 && `, skipped ${importResult.skipped}`}
                {importResult.errors?.length > 0 && (
                  <span> — {importResult.errors.length} error(s)</span>
                )}
              </div>
            )}

            <section className={styles.addSection}>
              <h2 className={styles.sectionTitle}>Add an example</h2>
              <p className={styles.helpText}>Describe one sample exchange: what the student asks and how the tutor should respond.</p>
              <div className={styles.addForm}>
                <label className={styles.label}>Student question</label>
                <textarea
                  className={styles.textarea}
                  placeholder="e.g. What is the Eustachian tube?"
                  value={addForm.studentQuestion}
                  onChange={e => setAddForm(p => ({ ...p, studentQuestion: e.target.value }))}
                  rows={2}
                />
                <label className={styles.label}>Tutor reply</label>
                <textarea
                  className={styles.textarea}
                  placeholder="e.g. The Eustachian tube connects the middle ear to the nasopharynx. It helps equalize pressure."
                  value={addForm.tutorReply}
                  onChange={e => setAddForm(p => ({ ...p, tutorReply: e.target.value }))}
                  rows={3}
                />
                <div className={styles.addMeta}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.labelSmall}>Subject</label>
                    <input
                      type="text"
                      placeholder="e.g. ENT"
                      value={addForm.subject}
                      onChange={e => setAddForm(p => ({ ...p, subject: e.target.value }))}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.labelSmall}>Topic</label>
                    <input
                      type="text"
                      placeholder="e.g. Hearing Physiology"
                      value={addForm.topic}
                      onChange={e => setAddForm(p => ({ ...p, topic: e.target.value }))}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.labelSmall}>Student level</label>
                    <select
                      value={addForm.studentLevel}
                      onChange={e => setAddForm(p => ({ ...p, studentLevel: e.target.value }))}
                      className={styles.select}
                    >
                      <option value="">Any</option>
                      <option value="excellent">Excellent</option>
                      <option value="strong">Strong</option>
                      <option value="average">Average</option>
                      <option value="weak">Weak</option>
                      <option value="very_weak">Very weak</option>
                      <option value="bored">Bored</option>
                    </select>
                  </div>
                </div>
                <button
                  className={styles.addButton}
                  onClick={handleAddExample}
                  disabled={adding || !addForm.studentQuestion.trim() || !addForm.tutorReply.trim()}
                >
                  {adding ? 'Adding…' : 'Add example'}
                </button>
              </div>

              <button
                type="button"
                className={styles.advancedToggle}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? '− Hide bulk import' : '+ Bulk import from file'}
              </button>
              {showAdvanced && (
                <div className={styles.advancedPanel}>
                  <p className={styles.helpText}>Paste multiple examples in technical format (one per line). For most users, use the form above instead.</p>
                  <textarea
                    className={styles.textarea}
                    placeholder='{"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}'
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    rows={5}
                  />
                  <div className={styles.importMeta}>
                    <input
                      type="text"
                      placeholder="Subject (optional)"
                      value={importMeta.subject}
                      onChange={e => setImportMeta(p => ({ ...p, subject: e.target.value }))}
                      className={styles.input}
                    />
                    <input
                      type="text"
                      placeholder="Topic (optional)"
                      value={importMeta.topic}
                      onChange={e => setImportMeta(p => ({ ...p, topic: e.target.value }))}
                      className={styles.input}
                    />
                    <select
                      value={importMeta.student_level}
                      onChange={e => setImportMeta(p => ({ ...p, student_level: e.target.value }))}
                      className={styles.select}
                    >
                      <option value="">Student level (optional)</option>
                      <option value="excellent">excellent</option>
                      <option value="strong">strong</option>
                      <option value="average">average</option>
                      <option value="weak">weak</option>
                      <option value="very_weak">very_weak</option>
                      <option value="bored">bored</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Source file (optional)"
                      value={importMeta.source_file}
                      onChange={e => setImportMeta(p => ({ ...p, source_file: e.target.value }))}
                      className={styles.input}
                    />
                  </div>
                  <button
                    className={styles.importButton}
                    onClick={handleImport}
                    disabled={importing || !importText.trim()}
                  >
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </div>
              )}
            </section>

            <section className={styles.listSection}>
              <h2 className={styles.sectionTitle}>Your examples</h2>
              <div className={styles.filters}>
                <input
                  type="text"
                  placeholder="Subject"
                  value={filters.subject}
                  onChange={e => handleFilterChange('subject', e.target.value)}
                  className={styles.input}
                />
                <input
                  type="text"
                  placeholder="Topic"
                  value={filters.topic}
                  onChange={e => handleFilterChange('topic', e.target.value)}
                  className={styles.input}
                />
                <select
                  value={filters.student_level}
                  onChange={e => handleFilterChange('student_level', e.target.value)}
                  className={styles.select}
                >
                  <option value="">All levels</option>
                  <option value="excellent">excellent</option>
                  <option value="strong">strong</option>
                  <option value="average">average</option>
                  <option value="weak">weak</option>
                  <option value="very_weak">very_weak</option>
                  <option value="bored">bored</option>
                </select>
                <button className={styles.refreshButton} onClick={fetchExamples}>Refresh</button>
              </div>

              {loading ? (
                <div className={styles.loading}>Loading…</div>
              ) : examples.length === 0 ? (
                <div className={styles.emptyState}>No examples yet. Add your first example above.</div>
              ) : (
                <div className={styles.exampleList}>
                  {examples.map((ex, idx) => (
                    <div key={ex.id || idx} className={styles.exampleCard}>
                      <div className={styles.exampleHeader}>
                        <span className={styles.badge}>{ex.subject || '—'}</span>
                        <span className={styles.badge}>{ex.topic || '—'}</span>
                        <span className={styles.levelBadge}>{ex.student_level || 'average'}</span>
                        {ex.source_file && (
                          <span className={styles.sourceBadge}>{ex.source_file}</span>
                        )}
                      </div>
                      <div className={styles.exampleMessages}>
                        {(ex.messages || []).slice(0, 4).map((m, i) => (
                          <div key={i} className={styles.msgRow}>
                            <span className={styles.msgRole}>{m.role === 'user' ? 'Student:' : 'Tutor:'}</span>
                            <span className={styles.msgContent}>{previewContent(m)}</span>
                          </div>
                        ))}
                        {(ex.messages || []).length > 4 && (
                          <div className={styles.msgRow}>
                            <span className={styles.msgRole}>…</span>
                            <span className={styles.msgContent}>+{ex.messages.length - 4} more</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
