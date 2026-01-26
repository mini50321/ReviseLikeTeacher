'use client';

import { useState } from 'react';
import api from '../lib/api';
import styles from './FeedbackDisplay.module.css';

export default function FeedbackDisplay({ attempt, onNext, onEnd, isLastQuestion }) {
  const [rating, setRating] = useState(null);

  const handleRating = async (ratingValue) => {
    if (!attempt?.id) return;
    
    try {
      await api.post(`/attempts/${attempt.id}/feedback/rate`, { rating: ratingValue });
      setRating(ratingValue);
    } catch (error) {
      console.error('Failed to save rating:', error);
    }
  };

  if (!attempt || !attempt.feedback) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading feedback...</div>
      </div>
    );
  }

  const feedback = typeof attempt.feedback === 'string' 
    ? JSON.parse(attempt.feedback) 
    : attempt.feedback;

  return (
    <div className={styles.container}>
      <div className={styles.feedbackCard}>
        <div className={styles.scoreSection}>
          <div className={styles.scoreCircle}>
            <span className={styles.scoreValue}>{attempt.score || 0}</span>
            <span className={styles.scoreLabel}>Score</span>
          </div>
        </div>

        <div className={styles.feedbackSection}>
          <div className={styles.feedbackBlock}>
            <h3 className={styles.feedbackTitle}>What You Did Well</h3>
            <p className={styles.feedbackText}>
              {feedback.strengths || 'Thank you for your answer. Keep practicing to improve.'}
            </p>
          </div>

          <div className={styles.feedbackBlock}>
            <h3 className={styles.feedbackTitle}>What Was Missing</h3>
            <p className={styles.feedbackText}>
              {feedback.improvements || 'Review the topic to improve your understanding.'}
            </p>
          </div>

          <div className={styles.feedbackBlock}>
            <h3 className={styles.feedbackTitle}>Complete Answer</h3>
            <details className={styles.details}>
              <summary className={styles.summary}>View Model Explanation</summary>
              <p className={styles.feedbackText}>
                {feedback.model_explanation || 'Review the topic materials for a complete understanding.'}
              </p>
            </details>
          </div>
        </div>

        {attempt.mastery_impact && (
          <div className={styles.masteryImpact}>
            <span className={styles.masteryLabel}>Mastery Impact:</span>
            <span className={styles.masteryValue}>
              {attempt.mastery_impact.topic} {attempt.mastery_impact.delta > 0 ? '+' : ''}
              {attempt.mastery_impact.delta?.toFixed(1)}%
            </span>
          </div>
        )}

        <div className={styles.ratingSection}>
          <p className={styles.ratingLabel}>Rate this feedback:</p>
          <div className={styles.ratingButtons}>
            <button
              type="button"
              className={`${styles.ratingButton} ${rating === 'good' ? styles.active : ''}`}
              onClick={() => handleRating('good')}
            >
              Good
            </button>
            <button
              type="button"
              className={`${styles.ratingButton} ${rating === 'bad' ? styles.active : ''}`}
              onClick={() => handleRating('bad')}
            >
              Bad
            </button>
            <button
              type="button"
              className={`${styles.ratingButton} ${rating === 'worse' ? styles.active : ''}`}
              onClick={() => handleRating('worse')}
            >
              Worse
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          {isLastQuestion ? (
            <button
              className={styles.endButton}
              onClick={onEnd}
            >
              End Session
            </button>
          ) : (
            <button
              className={styles.nextButton}
              onClick={onNext}
            >
              Next Question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

