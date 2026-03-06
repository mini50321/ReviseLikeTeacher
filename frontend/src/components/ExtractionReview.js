'use client';

import { useState, useEffect } from 'react';
import styles from './ExtractionReview.module.css';

export default function ExtractionReview({ extraction, onReview, onCancel }) {
  if (!extraction) return null;

  const parseKeyPoints = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw) {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const [editedStem, setEditedStem] = useState(extraction.extracted_text || '');
  const [editedType, setEditedType] = useState(extraction.detected_type || 'mcq');
  const [editedSubject, setEditedSubject] = useState(extraction.detected_subject || '');
  const [editedTopic, setEditedTopic] = useState(extraction.detected_topic || '');
  const [editedSubtopic, setEditedSubtopic] = useState(extraction.detected_subtopic || '');
  const [editedDifficulty, setEditedDifficulty] = useState(extraction.detected_difficulty || 'medium');
  const [editedImportance, setEditedImportance] = useState(extraction.detected_importance || 'medium');
  const [editedKeyPoints, setEditedKeyPoints] = useState((parseKeyPoints(extraction.detected_key_points)).join('\n'));
  const [editedIdealAnswer, setEditedIdealAnswer] = useState(extraction.extracted_ideal_answer || '');
  const [editedCorrectAnswer, setEditedCorrectAnswer] = useState(extraction.extracted_correct_answer || '');
  const [editedOptions, setEditedOptions] = useState({ A: '', B: '', C: '', D: '' });

  useEffect(() => {
    setEditedStem(extraction.extracted_text || '');
    setEditedType(extraction.detected_type || 'mcq');
    setEditedSubject(extraction.detected_subject || '');
    setEditedTopic(extraction.detected_topic || '');
    setEditedSubtopic(extraction.detected_subtopic || '');
    setEditedImportance(extraction.detected_importance || 'medium');
    setEditedKeyPoints((parseKeyPoints(extraction.detected_key_points)).join('\n'));
    setEditedIdealAnswer(extraction.extracted_ideal_answer || '');
    setEditedCorrectAnswer(extraction.extracted_correct_answer || '');
  }, [extraction.id]);

  useEffect(() => {
    if (extraction.extracted_options) {
      try {
        const parsed = typeof extraction.extracted_options === 'string'
          ? JSON.parse(extraction.extracted_options)
          : extraction.extracted_options;
        setEditedOptions({ A: '', B: '', C: '', D: '', ...parsed });
      } catch (e) {
        // ignore
      }
    }
  }, [extraction.extracted_options]);

  let examTags = [];
  try {
    examTags = extraction.detected_previous_year_tags
      ? (typeof extraction.detected_previous_year_tags === 'string'
          ? JSON.parse(extraction.detected_previous_year_tags)
          : extraction.detected_previous_year_tags)
      : [];
  } catch (e) {
    examTags = [];
  }

  const isMCQ = ['mcq', 'true_false', 'assertion_reason'].includes(editedType);

  const handleAccept = () => {
    const keyPointsArr = editedKeyPoints
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const corrections = {
      stem: editedStem,
      type: editedType,
      subject: editedSubject,
      topic: editedTopic,
      subtopic: editedSubtopic.trim() || null,
      difficulty: editedDifficulty,
      importance: editedImportance,
      key_points: keyPointsArr,
      ideal_answer: editedIdealAnswer,
      options: isMCQ ? JSON.stringify(editedOptions) : null,
      correct_answer: isMCQ ? editedCorrectAnswer : null
    };
    onReview(extraction.id, 'accept', corrections);
  };

  const handleReject = () => {
    onReview(extraction.id, 'reject', null);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Review Extracted Question</h2>

        {(extraction.frequency_count > 1 || extraction.most_recent_year || examTags.length > 0) && (
          <div className={styles.insightBox}>
            <h3 className={styles.insightTitle}>Importance Insights</h3>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Importance:</span>
              <span className={`${styles.insightValue} ${styles[`importance_${extraction.detected_importance}`]}`}>
                {extraction.detected_importance || 'medium'}
              </span>
            </div>
            {extraction.frequency_count > 1 && (
              <div className={styles.insightRow}>
                <span className={styles.insightLabel}>Frequency:</span>
                <span className={styles.insightValue}>
                  Similar topic appeared {extraction.frequency_count} times in this paper
                </span>
              </div>
            )}
            {extraction.most_recent_year && (
              <div className={styles.insightRow}>
                <span className={styles.insightLabel}>Last appeared:</span>
                <span className={styles.insightValue}>{extraction.most_recent_year}</span>
              </div>
            )}
            {examTags.length > 0 && (
              <div className={styles.insightRow}>
                <span className={styles.insightLabel}>Exam tags:</span>
                <span className={styles.insightValue}>{examTags.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.fieldGroup}>
            <label>Question Text</label>
            <textarea
              value={editedStem}
              onChange={(e) => setEditedStem(e.target.value)}
              rows={5}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label>Type</label>
              <select value={editedType} onChange={(e) => setEditedType(e.target.value)}>
                <option value="mcq">MCQ</option>
                <option value="saq">Short Answer</option>
                <option value="case_based">Case Based</option>
                <option value="true_false">True/False</option>
                <option value="assertion_reason">Assertion-Reason</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label>Subject</label>
              <input value={editedSubject} onChange={(e) => setEditedSubject(e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label>Topic</label>
              <input value={editedTopic} onChange={(e) => setEditedTopic(e.target.value)} placeholder="e.g. Tuning Fork Tests" />
            </div>
            <div className={styles.fieldGroup}>
              <label>Subtopic</label>
              <input value={editedSubtopic} onChange={(e) => setEditedSubtopic(e.target.value)} placeholder="e.g. Rinne, Weber" />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label>Key points (one per line; used by AI for teaching)</label>
            <textarea
              value={editedKeyPoints}
              onChange={(e) => setEditedKeyPoints(e.target.value)}
              rows={3}
              placeholder="Point 1&#10;Point 2&#10;Point 3"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label>Difficulty</label>
              <select value={editedDifficulty} onChange={(e) => setEditedDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label>Importance</label>
              <select value={editedImportance} onChange={(e) => setEditedImportance(e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {isMCQ && (
            <div className={styles.optionsSection}>
              <label>Options</label>
              {['A', 'B', 'C', 'D'].map((label) => (
                <div key={label} className={styles.optionRow}>
                  <div
                    className={`${styles.optionRadio} ${editedCorrectAnswer === label ? styles.optionRadioSelected : ''}`}
                    onClick={() => setEditedCorrectAnswer(label)}
                  >
                    {label}
                  </div>
                  <input
                    value={editedOptions[label] || ''}
                    onChange={(e) => setEditedOptions(prev => ({ ...prev, [label]: e.target.value }))}
                    placeholder={`Option ${label}`}
                  />
                </div>
              ))}
              <p className={styles.optionHint}>Click a letter to mark the correct answer</p>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label>Ideal Answer / Explanation</label>
            <textarea
              value={editedIdealAnswer}
              onChange={(e) => setEditedIdealAnswer(e.target.value)}
              rows={3}
              placeholder="Explanation for the correct answer..."
            />
          </div>

          <div className={styles.actions}>
            <button onClick={onCancel} className={styles.cancelButton}>Cancel</button>
            <button onClick={handleReject} className={styles.rejectButton}>Reject</button>
            <button onClick={handleAccept} className={styles.approveButton}>Accept & Add to Bank</button>
          </div>
        </div>
      </div>
    </div>
  );
}
