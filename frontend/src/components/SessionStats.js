'use client';

import styles from './SessionStats.module.css';

export default function SessionStats({ stats, currentQuestion, totalQuestions }) {
  if (!stats) {
    return (
      <div className={styles.container}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Question</span>
          <span className={styles.statValue}>{currentQuestion}/{totalQuestions}</span>
        </div>
      </div>
    );
  }

  const accuracy = stats.questionsAnswered > 0
    ? ((stats.correctAnswers / stats.questionsAnswered) * 100).toFixed(0)
    : 0;

  return (
    <div className={styles.container}>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Question</span>
        <span className={styles.statValue}>{currentQuestion}/{totalQuestions}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Answered</span>
        <span className={styles.statValue}>{stats.questionsAnswered}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Accuracy</span>
        <span className={styles.statValue}>{accuracy}%</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Avg Score</span>
        <span className={styles.statValue}>{stats.averageScore?.toFixed(0) || 0}%</span>
      </div>
    </div>
  );
}

