'use client';

import { useState, useEffect } from 'react';
import styles from './QuestionDisplay.module.css';

export default function QuestionDisplay({ question, questionNumber, totalQuestions, onSubmit, loading }) {
  const [answer, setAnswer] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const [timer, setTimer] = useState(null);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    setTimer(interval);

    return () => {
      clearInterval(interval);
    };
  }, [question]);

  const handleSubmit = () => {
    if (!answer.trim()) {
      alert('Please enter an answer');
      return;
    }
    onSubmit(answer, timeSpent);
  };

  if (!question) {
    return <div>Loading question...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.questionNumber}>
          Question {questionNumber} of {totalQuestions}
        </span>
        <span className={styles.timer}>Time: {Math.floor(timeSpent / 60)}:{(timeSpent % 60).toString().padStart(2, '0')}</span>
      </div>

      <div className={styles.questionCard}>
        <div className={styles.questionMeta}>
          <span className={styles.subject}>{question.subject}</span>
          <span className={styles.topic}>{question.topic}</span>
          <span className={styles.difficulty}>{question.difficulty}</span>
        </div>

        <div className={styles.questionStem}>
          {question.stem}
        </div>

        {question.image_path && (
          <div className={styles.questionImage}>
            <img src={question.image_path} alt="Question" />
          </div>
        )}

        <div className={styles.answerSection}>
          <label className={styles.answerLabel}>Your Answer</label>
          <textarea
            className={styles.answerInput}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            rows={6}
            disabled={loading}
          />
        </div>

        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={loading || !answer.trim()}
        >
          {loading ? 'Submitting...' : 'Submit Answer'}
        </button>
      </div>
    </div>
  );
}

