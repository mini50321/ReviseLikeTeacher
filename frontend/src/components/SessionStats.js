'use client';

import styles from './SessionStats.module.css';

export default function SessionStats({ stats, currentQuestion, totalQuestions }) {
  if (!stats) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Questions Answered</div>
        <div className={styles.statValue}>{stats.questionsAnswered || 0}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Average Score</div>
        <div className={styles.statValue}>
          {stats.averageScore ? Math.round(stats.averageScore) : 0}%
        </div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Correct Answers</div>
        <div className={styles.statValue}>{stats.correctAnswers || 0}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Progress</div>
        <div className={styles.statValue}>
          {currentQuestion}/{totalQuestions}
        </div>
      </div>
    </div>
  );
}

