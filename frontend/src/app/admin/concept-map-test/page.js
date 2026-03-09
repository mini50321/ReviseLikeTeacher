'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import Link from 'next/link';
import styles from './concept-map-test.module.css';

export default function ConceptMapTestPage() {
  const [topics, setTopics] = useState([]);
  const [backendOk, setBackendOk] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    setError('');
    try {
      const res = await api.get('/concept-map/topics');
      setTopics(res.data.topics || []);
      setBackendOk(true);
    } catch (err) {
      setBackendOk(false);
      setTopics([]);
      setError(err.response?.data?.error || 'Backend not reachable. Start the backend on port 3000.');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setError('');
    setSeedResult(null);
    try {
      const res = await api.post('/admin/seed/tuning-fork');
      setSeedResult(res.data);
      await checkBackend();
    } catch (err) {
      setError(err.response?.data?.error || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <ProtectedRoute>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Concept Map — Test</h1>
          <p className={styles.pageSubtitle}>
            Prepare data and test the Concept Map flow end-to-end.
          </p>

          {/* Prerequisites */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Prerequisites</h2>
            <ul className={styles.stepList}>
              <li><strong>Backend</strong> on port 3000</li>
              <li><strong>Frontend</strong> on port 3001</li>
              <li><strong>AI service</strong> on port 8000 (for voice/transcription)</li>
            </ul>
            <p className={styles.hint}>
              Run: <code>npm run start:backend</code>, <code>npm run dev:frontend</code>, and the AI service.
            </p>
          </section>

          {/* Status */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Status</h2>
            <p className={backendOk ? styles.statusOk : styles.statusError}>
              {backendOk === null ? 'Checking…' : backendOk ? '✓ Backend connected' : '✗ Backend not connected'}
            </p>
            {backendOk && (
              <p className={styles.topicsCount}>
                Topics: {topics.length > 0 ? topics.map(t => `${t.subject} — ${t.topic}`).join(', ') : 'None'}
              </p>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <button type="button" className={styles.secondaryBtn} onClick={checkBackend}>
              Refresh status
            </button>
          </section>

          {/* Seed */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Step 1 — Seed topics</h2>
            <p className={styles.stepDesc}>
              Load the Tuning Fork (ENT) topic with Rinne, Weber, ABC, Bing, Schwabach, Stenger concepts.
            </p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSeed}
              disabled={seeding || !backendOk}
            >
              {seeding ? 'Seeding…' : 'Seed tuning fork data'}
            </button>
            {seedResult && (
              <p className={styles.seedResult}>
                ✓ {seedResult.message}
              </p>
            )}
          </section>

          {/* Test flow */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Step 2 — Test the flow</h2>
            <p className={styles.stepDesc}>Go to the Concept Map and run through the session.</p>
            <ol className={styles.stepList}>
              <li>Choose topic <strong>ENT — Tuning Fork Tests</strong></li>
              <li>Answer the gross prompt (e.g. “Explain tuning fork tests…”). Give a short or incomplete answer to trigger probe questions.</li>
              <li>Click <strong>Start session</strong></li>
              <li>Answer probe questions (e.g. Rinne false negative, Weber lateralization).</li>
              <li>After all probes, you’ll see a <strong>Summary</strong> step — type a 4–5 sentence summary and submit.</li>
              <li>Session completes with score, missed points, and practice question.</li>
            </ol>
            <Link href="/concept-map" className={styles.linkBtn}>
              Open Concept Map →
            </Link>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
