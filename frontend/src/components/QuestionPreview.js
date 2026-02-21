'use client';

import styles from './QuestionPreview.module.css';

export default function QuestionPreview({ question, onClose }) {
  if (!question) return null;

  let parsedOptions = null;
  if (question.options) {
    try {
      parsedOptions = typeof question.options === 'string'
        ? JSON.parse(question.options)
        : question.options;
    } catch (e) {
      parsedOptions = null;
    }
  }

  const hasOptions = parsedOptions && Object.values(parsedOptions).some(v => v);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Question Preview</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <div className={styles.content}>
          <div className={styles.questionText}>{question.stem || question.question_text}</div>

          {hasOptions && (
            <div className={styles.optionsPreview}>
              {Object.entries(parsedOptions).map(([label, text]) => {
                if (!text) return null;
                const isCorrect = question.correct_answer === label;
                return (
                  <div
                    key={label}
                    className={`${styles.optionItem} ${isCorrect ? styles.optionCorrect : ''}`}
                  >
                    <span className={styles.optionLabel}>{label}</span>
                    <span className={styles.optionText}>{text}</span>
                    {isCorrect && <span className={styles.correctTag}>Correct</span>}
                  </div>
                );
              })}
            </div>
          )}

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
