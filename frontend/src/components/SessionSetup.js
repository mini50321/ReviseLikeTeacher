'use client';

import { useEffect, useState } from 'react';
import api from '../lib/api';
import styles from './SessionSetup.module.css';

export default function SessionSetup({ onStart, onCancel, defaultMode, loading }) {
  const [numberOfQuestions, setNumberOfQuestions] = useState(10);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadSubjects = async () => {
      try {
        const response = await api.get('/questions', {
          params: { limit: 500, offset: 0 }
        });
        const uniqueSubjects = [...new Set((response.data.questions || [])
          .map((question) => question.subject)
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b));

        if (mounted) {
          setSubjects(uniqueSubjects);
        }
      } catch (error) {
        if (mounted) {
          setSubjects([]);
        }
      }
    };

    loadSubjects();

    return () => {
      mounted = false;
    };
  }, []);

  const handleStart = () => {
    const config = {
      number_of_questions: numberOfQuestions,
      subjects: selectedSubject ? [selectedSubject] : []
    };
    onStart(config);
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>Start Practice Session</h2>
          
          <div className={styles.formGroup}>
            <label htmlFor="questions">Number of Questions</label>
            <input
              id="questions"
              type="number"
              min="1"
              max="50"
              value={numberOfQuestions}
              onChange={(e) => setNumberOfQuestions(parseInt(e.target.value) || 10)}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="subject">Subject (Optional)</label>
            <select
              id="subject"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              disabled={loading}
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onCancel}
              className={styles.cancelButton}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStart}
              className={styles.startButton}
              disabled={loading}
            >
              {loading ? 'Starting...' : 'Start Session'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

