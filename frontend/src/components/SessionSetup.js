'use client';

import { useState } from 'react';
import styles from './SessionSetup.module.css';

export default function SessionSetup({ onStart, onCancel, defaultMode, loading }) {
  const [numberOfQuestions, setNumberOfQuestions] = useState(10);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');

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
            <input
              id="subject"
              type="text"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              placeholder="e.g., Mathematics, Physics"
              disabled={loading}
            />
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

