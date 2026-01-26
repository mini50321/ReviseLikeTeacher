'use client';

import styles from './QuestionPreview.module.css';

export default function QuestionPreview({ question, onClose }) {
  if (!question) return null;

  const keyPoints = Array.isArray(question.key_points) 
    ? question.key_points 
    : (question.key_points ? [question.key_points] : []);

  const previousYearTags = Array.isArray(question.previous_year_tags)
    ? question.previous_year_tags
    : (question.previous_year_tags ? [question.previous_year_tags] : []);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Question Preview</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.meta}>
            <span className={styles.badge}>{question.subject}</span>
            <span className={styles.badge}>{question.topic}</span>
            <span className={styles.badge}>{question.type}</span>
            <span className={styles.badge}>{question.difficulty}</span>
            <span className={styles.badge}>{question.importance}</span>
            <span className={styles.badge}>{question.cognitive_focus}</span>
            <span className={`${styles.status} ${styles[question.status]}`}>
              {question.status}
            </span>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Question Stem</h3>
            <p className={styles.stem}>{question.stem}</p>
          </div>

          {question.image_path && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Image</h3>
              <div className={styles.imageContainer}>
                <img src={question.image_path} alt="Question" />
              </div>
            </div>
          )}

          {question.ideal_answer && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Ideal Answer</h3>
              <p className={styles.answer}>{question.ideal_answer}</p>
            </div>
          )}

          {keyPoints.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Key Points</h3>
              <ul className={styles.keyPoints}>
                {keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {previousYearTags.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Previous Year Tags</h3>
              <div className={styles.tags}>
                {previousYearTags.map((tag, index) => (
                  <span key={index} className={styles.tag}>
                    {typeof tag === 'object' ? `${tag.exam} ${tag.year}` : tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

