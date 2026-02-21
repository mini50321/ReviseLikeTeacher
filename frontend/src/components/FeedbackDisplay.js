'use client';

import styles from './FeedbackDisplay.module.css';

export default function FeedbackDisplay({ attempt, onNext, onEnd, isLastQuestion }) {
  if (!attempt) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Loading feedback...</p>
        </div>
      </div>
    );
  }

  const score = attempt.score || 0;
  const feedbackData = attempt.feedback || {};
  const isPassing = score >= 70;
  const isMCQ = feedbackData.is_mcq === true;

  const formatFeedback = (feedback) => {
    if (typeof feedback === 'string') {
      return feedback;
    }
    
    if (typeof feedback === 'object' && feedback !== null) {
      const parts = [];
      
      if (feedback.strengths) {
        parts.push(`Strengths: ${feedback.strengths}`);
      }
      
      if (feedback.improvements) {
        parts.push(`Areas for Improvement: ${feedback.improvements}`);
      }
      
      if (feedback.model_explanation) {
        parts.push(`Explanation: ${feedback.model_explanation}`);
      }
      
      if (parts.length === 0) {
        return 'No feedback available.';
      }
      
      return parts.join('\n\n');
    }
    
    return 'No feedback available.';
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isMCQ ? (feedbackData.is_correct ? 'Correct!' : 'Incorrect') : 'Your Answer Feedback'}
          </h2>
          <div className={`${styles.scoreBadge} ${isPassing ? styles.passing : styles.failing}`}>
            {isMCQ ? (feedbackData.is_correct ? '✓ Correct' : '✗ Wrong') : `Score: ${score}%`}
          </div>
        </div>

        {isMCQ ? (
          <div className={styles.feedbackSection}>
            <div className={styles.mcqResult}>
              <div className={`${styles.mcqOptionResult} ${feedbackData.is_correct ? styles.mcqCorrectOption : styles.mcqWrongOption}`}>
                <span className={styles.mcqOptionLabel}>Your Answer</span>
                <span className={styles.mcqOptionValue}>
                  {feedbackData.selected_option}) {feedbackData.selected_text}
                </span>
              </div>

              {!feedbackData.is_correct && (
                <div className={`${styles.mcqOptionResult} ${styles.mcqCorrectOption}`}>
                  <span className={styles.mcqOptionLabel}>Correct Answer</span>
                  <span className={styles.mcqOptionValue}>
                    {feedbackData.correct_option}) {feedbackData.correct_text}
                  </span>
                </div>
              )}

              {feedbackData.model_explanation && feedbackData.model_explanation !== 'Well done!' && (
                <div className={styles.mcqExplanation}>
                  <h3 className={styles.feedbackTitle}>Explanation</h3>
                  <div className={styles.feedbackText}>{feedbackData.model_explanation}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.feedbackSection}>
            <h3 className={styles.feedbackTitle}>Feedback</h3>
            <div className={styles.feedbackText}>{formatFeedback(feedbackData)}</div>
          </div>
        )}

        <div className={styles.actions}>
          {isLastQuestion ? (
            <button onClick={onEnd} className={styles.endButton}>
              End Session
            </button>
          ) : (
            <button onClick={onNext} className={styles.nextButton}>
              Next Question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
