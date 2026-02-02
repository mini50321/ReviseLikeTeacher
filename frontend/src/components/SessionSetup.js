'use client';

import { useState } from 'react';
import styles from './SessionSetup.module.css';

export default function SessionSetup({ onStart, onCancel, defaultMode, loading = false }) {
  const [numberOfQuestions, setNumberOfQuestions] = useState(10);
  const [mode, setMode] = useState(defaultMode || 'balanced');
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [difficultyMix, setDifficultyMix] = useState({
    easy: 30,
    medium: 50,
    hard: 20
  });

  const availableSubjects = [
    'Anatomy', 'Physiology', 'Biochemistry', 'Pathology',
    'Pharmacology', 'Microbiology', 'Forensic Medicine',
    'Community Medicine', 'Ophthalmology', 'ENT'
  ];

  const handleSubjectToggle = (subject) => {
    setSubjects(prev =>
      prev.includes(subject)
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
  };

  const handleStart = () => {
    if (numberOfQuestions < 5 || numberOfQuestions > 50) {
      alert('Number of questions must be between 5 and 50');
      return;
    }

    onStart({
      number_of_questions: numberOfQuestions,
      mode,
      subjects: subjects.length > 0 ? subjects : availableSubjects,
      topics,
      difficulty_mix: difficultyMix
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Practice Session Setup</h2>

        <div className={styles.field}>
          <label>Number of Questions</label>
          <input
            type="number"
            min={5}
            max={50}
            value={numberOfQuestions}
            onChange={(e) => setNumberOfQuestions(parseInt(e.target.value) || 5)}
          />
        </div>

        <div className={styles.field}>
          <label>Mode</label>
          <div className={styles.modeOptions}>
            <button
              type="button"
              className={`${styles.modeButton} ${mode === 'balanced' ? styles.active : ''}`}
              onClick={() => setMode('balanced')}
            >
              Balanced Mix
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${mode === 'clinical' ? styles.active : ''}`}
              onClick={() => setMode('clinical')}
            >
              More Clinical
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${mode === 'rapid' ? styles.active : ''}`}
              onClick={() => setMode('rapid')}
            >
              Rapid-Fire
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label>Subjects (optional - leave empty for all)</label>
          <div className={styles.subjectGrid}>
            {availableSubjects.map(subject => (
              <button
                key={subject}
                type="button"
                className={`${styles.subjectButton} ${subjects.includes(subject) ? styles.selected : ''}`}
                onClick={() => handleSubjectToggle(subject)}
              >
                {subject}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.startButton}
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? 'Starting...' : 'Start Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

