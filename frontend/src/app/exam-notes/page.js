'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './exam-notes.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ExamNotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [subjects, setSubjects] = useState([]);

  const paramSubject = searchParams.get('subject');
  const paramTopic = searchParams.get('topic');
  const paramGenerate = searchParams.get('generate');
  const paramSessionId = searchParams.get('session_id');

  const fetchNotes = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      let url = `${API_URL}/api/exam-trigger-notes`;
      if (subjectFilter) url += `?subject=${encodeURIComponent(subjectFilter)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch notes');

      const data = await res.json();
      setNotes(data.notes || []);

      const uniqueSubjects = [...new Set((data.notes || []).map(n => n.subject))];
      setSubjects(uniqueSubjects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router, subjectFilter]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (paramSubject && paramTopic && paramGenerate === 'true' && !generating) {
      handleGenerate(paramSubject, paramTopic, paramSessionId);
    } else if (paramSubject && paramTopic && notes.length > 0) {
      const match = notes.find(n => n.subject === paramSubject && n.topic === paramTopic);
      if (match) setSelectedNote(match);
    }
  }, [paramSubject, paramTopic, paramGenerate, notes]);

  const handleGenerate = async (subject, topic, sessionId) => {
    setGenerating(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/exam-trigger-notes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, topic, topic_learning_session_id: sessionId || null })
      });
      if (!res.ok) throw new Error('Failed to generate notes');
      const data = await res.json();
      setSelectedNote(data.notes);
      await fetchNotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedNote) return;
    setGenerating(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/exam-trigger-notes/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: selectedNote.subject, topic: selectedNote.topic })
      });
      if (!res.ok) throw new Error('Failed to regenerate notes');
      const data = await res.json();
      setSelectedNote(data.notes);
      await fetchNotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/exam-trigger-notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete notes');
      setSelectedNote(null);
      await fetchNotes();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.loading}>Loading exam trigger notes...</div>
        </div>
      </main>
    );
  }

  if (selectedNote) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <button className={styles.backButton} onClick={() => setSelectedNote(null)}>
            &larr; Back to all notes
          </button>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.topicHeader}>
            <div className={styles.topicInfo}>
              <h2>{selectedNote.topic}</h2>
              <p>{selectedNote.subject}</p>
              {selectedNote.generated_at && (
                <span className={styles.generatedDate}>
                  Generated: {new Date(selectedNote.generated_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className={styles.topicActions}>
              <button
                className={styles.regenerateButton}
                onClick={handleRegenerate}
                disabled={generating}
              >
                {generating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>

          <div className={styles.card} style={{ animationDelay: '0.1s' }}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon} style={{ background: 'rgba(255, 152, 0, 0.2)', color: '#ffb74d' }}>
                ⚡
              </span>
              Exam Trigger Lines
            </div>
            {(selectedNote.trigger_lines || []).map((line, idx) => (
              <div key={idx} className={styles.triggerLine}>
                <span className={styles.triggerNumber}>{idx + 1}</span>
                <span className={styles.triggerText}>{line}</span>
              </div>
            ))}
          </div>

          <div className={styles.card} style={{ animationDelay: '0.2s' }}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon} style={{ background: 'rgba(33, 150, 243, 0.2)', color: '#90caf9' }}>
                📊
              </span>
              High-Yield Differentiation Table
            </div>
            {(selectedNote.differentiation_table || []).length > 0 ? (
              <table className={styles.diffTable}>
                <thead>
                  <tr>
                    <th>Feature</th>
                    {(() => {
                      const first = selectedNote.differentiation_table[0];
                      const cols = Object.keys(first).filter(k => k !== 'feature');
                      return cols.map(col => (
                        <th key={col}>{first[col] || col.replace(/_/g, ' ')}</th>
                      ));
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {selectedNote.differentiation_table.slice(1).map((row, idx) => {
                    const cols = Object.keys(row).filter(k => k !== 'feature');
                    return (
                      <tr key={idx}>
                        <td className={styles.diffFeature}>{row.feature}</td>
                        {cols.map(col => (
                          <td key={col}>{row[col]}</td>
                        ))}
                      </tr>
                    );
                  })}
                  {selectedNote.differentiation_table.length <= 1 &&
                    selectedNote.differentiation_table.map((row, idx) => {
                      const cols = Object.keys(row).filter(k => k !== 'feature');
                      return (
                        <tr key={idx}>
                          <td className={styles.diffFeature}>{row.feature}</td>
                          {cols.map(col => (
                            <td key={col}>{row[col]}</td>
                          ))}
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>No differentiation table available.</p>
            )}
          </div>

          <div className={styles.card} style={{ animationDelay: '0.3s' }}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon} style={{ background: 'rgba(239, 83, 80, 0.2)', color: '#ef9a9a' }}>
                🎯
              </span>
              Last-Minute Recall Bullets
            </div>
            {(selectedNote.recall_bullets || []).map((bullet, idx) => (
              <div key={idx} className={styles.recallBullet}>
                <span className={styles.recallIcon}>★</span>
                <span className={styles.recallText}>{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Exam Trigger Notes</h1>
        <p className={styles.subtitle}>
          AI-generated high-yield revision sheets for rapid recall before exams
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {subjects.length > 1 && (
          <div className={styles.filterRow}>
            <select
              className={styles.filterSelect}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {notes.length === 0 ? (
          <div className={styles.card}>
            <div className={styles.emptyState}>
              <h3>No Exam Trigger Notes Yet</h3>
              <p>
                Complete a topic mastery session to auto-generate exam trigger notes,
                or generate them manually from the dashboard.
              </p>
              <button
                className={styles.generateButton}
                onClick={() => router.push('/dashboard')}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.notesList}>
            {notes.map(note => (
              <div
                key={note.id}
                className={styles.notesListItem}
                onClick={() => setSelectedNote(note)}
              >
                <div className={styles.notesListTopic}>{note.topic}</div>
                <div className={styles.notesListSubject}>{note.subject}</div>
                <div className={styles.notesListMeta}>
                  <span className={styles.notesListBadge}>
                    {(note.trigger_lines || []).length} triggers
                  </span>
                  <span className={styles.notesListBadge}>
                    {(note.recall_bullets || []).length} bullets
                  </span>
                  {note.generated_at && (
                    <span className={styles.notesListBadge}>
                      {new Date(note.generated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

