'use client';

import { useState } from 'react';
import styles from './ExtractionReview.module.css';

export default function ExtractionReview({ extraction, onReview, onCancel }) {
  const [action, setAction] = useState('');
  const [corrections, setCorrections] = useState({
    stem: extraction.extracted_text || '',
    type: extraction.detected_type || '',
    subject: extraction.detected_subject || '',
    topic: extraction.detected_topic || '',
    subtopic: extraction.detected_subtopic || '',
    difficulty: extraction.detected_difficulty || 'medium',
    importance: extraction.detected_importance || 'medium',
    cognitive_focus: extraction.detected_cognitive_focus || 'factual',
    key_points: Array.isArray(extraction.detected_key_points) 
      ? extraction.detected_key_points.join('\n')
      : '',
    previous_year_tags: Array.isArray(extraction.detected_previous_year_tags)
      ? JSON.stringify(extraction.detected_previous_year_tags)
      : ''
  });
  const [loading, setLoading] = useState(false);

  const handleCorrectionChange = (field, value) => {
    setCorrections(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!action) {
      alert('Please select an action');
      return;
    }

    setLoading(true);

    try {
      const submitCorrections = action === 'accept' ? {
        ...corrections,
        key_points: corrections.key_points.split('\n').filter(k => k.trim()),
        previous_year_tags: corrections.previous_year_tags
          ? JSON.parse(corrections.previous_year_tags)
          : []
      } : {};

      await onReview(extraction.id, action, submitCorrections);
    } catch (err) {
      alert('Failed to review extraction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Review Extraction</h2>
          <button className={styles.closeButton} onClick={onCancel}>×</button>
        </div>

        <div className={styles.content}>
          <div className={styles.originalSection}>
            <h3 className={styles.sectionTitle}>Original Extraction</h3>
            <div className={styles.originalText}>
              {extraction.extracted_text}
            </div>
            <div className={styles.originalMeta}>
              <span className={styles.metaItem}>
                <strong>Type:</strong> {extraction.detected_type}
              </span>
              <span className={styles.metaItem}>
                <strong>Subject:</strong> {extraction.detected_subject}
              </span>
              <span className={styles.metaItem}>
                <strong>Topic:</strong> {extraction.detected_topic}
              </span>
              <span className={styles.metaItem}>
                <strong>Difficulty:</strong> {extraction.detected_difficulty}
              </span>
              <span className={styles.metaItem}>
                <strong>Importance:</strong> {extraction.detected_importance}
              </span>
              <span className={styles.metaItem}>
                <strong>Confidence:</strong> {extraction.confidence_score}%
              </span>
            </div>
          </div>

          <div className={styles.correctionsSection}>
            <h3 className={styles.sectionTitle}>Corrections (if needed)</h3>
            
            <div className={styles.field}>
              <label>Question Stem</label>
              <textarea
                value={corrections.stem}
                onChange={(e) => handleCorrectionChange('stem', e.target.value)}
                rows={4}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Type</label>
                <select
                  value={corrections.type}
                  onChange={(e) => handleCorrectionChange('type', e.target.value)}
                >
                  <option value="mcq">MCQ</option>
                  <option value="saq">SAQ</option>
                  <option value="case_based">Case-based</option>
                  <option value="true_false">True/False</option>
                  <option value="assertion_reason">Assertion-Reason</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Subject</label>
                <input
                  type="text"
                  value={corrections.subject}
                  onChange={(e) => handleCorrectionChange('subject', e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>Topic</label>
                <input
                  type="text"
                  value={corrections.topic}
                  onChange={(e) => handleCorrectionChange('topic', e.target.value)}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Difficulty</label>
                <select
                  value={corrections.difficulty}
                  onChange={(e) => handleCorrectionChange('difficulty', e.target.value)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Importance</label>
                <select
                  value={corrections.importance}
                  onChange={(e) => handleCorrectionChange('importance', e.target.value)}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Cognitive Focus</label>
                <select
                  value={corrections.cognitive_focus}
                  onChange={(e) => handleCorrectionChange('cognitive_focus', e.target.value)}
                >
                  <option value="factual">Factual</option>
                  <option value="conceptual">Conceptual</option>
                  <option value="clinical">Clinical</option>
                </select>
              </div>
            </div>
          </div>

          <div className={styles.actionsSection}>
            <h3 className={styles.sectionTitle}>Action</h3>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className={`${styles.actionButton} ${action === 'accept' ? styles.active : ''}`}
                onClick={() => setAction('accept')}
              >
                Accept & Add to Bank
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${action === 'save_draft' ? styles.active : ''}`}
                onClick={() => setAction('save_draft')}
              >
                Save as Draft
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.reject} ${action === 'reject' ? styles.active : ''}`}
                onClick={() => setAction('reject')}
              >
                Reject
              </button>
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={loading || !action}
            >
              {loading ? 'Processing...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

