'use client';

import styles from './QuestionPreview.module.css';

export default function QuestionPreview({ question, onClose }) {
  if (!question) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Question Preview</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <div className={styles.content}>
          <div className={styles.questionText}>{question.question_text}</div>
          <div className={styles.meta}>
            <span className={styles.metaItem}>Subject: {question.subject}</span>
            {question.topic && <span className={styles.metaItem}>Topic: {question.topic}</span>}
            <span className={styles.metaItem}>Difficulty: {question.difficulty}</span>
            <span className={styles.metaItem}>Type: {question.type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

