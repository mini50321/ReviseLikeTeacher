'use client';

import { useState, useEffect } from 'react';
import styles from './QuestionForm.module.css';

export default function QuestionForm({ question, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    question_text: '',
    subject: '',
    topic: '',
    type: 'saq',
    difficulty: 'medium',
    importance: 'medium',
    cognitive_focus: 'factual',
    status: 'active'
  });

  useEffect(() => {
    if (question) {
      setFormData({
        question_text: question.stem || question.question_text || '',
        subject: question.subject || '',
        topic: question.topic || '',
        type: question.type || 'saq',
        difficulty: question.difficulty || 'medium',
        importance: question.importance || 'medium',
        cognitive_focus: question.cognitive_focus || 'factual',
        status: question.status || 'active',
        ideal_answer: question.ideal_answer || '',
        key_points: question.key_points || [],
        previous_year_tags: question.previous_year_tags || []
      });
    }
  }, [question]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>{question ? 'Edit Question' : 'Create Question'}</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label>Question Text *</label>
            <textarea
              name="question_text"
              value={formData.question_text}
              onChange={handleChange}
              required
              rows={4}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Subject *</label>
              <input
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Topic</label>
              <input
                name="topic"
                value={formData.topic}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="saq">Short Answer (SAQ)</option>
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="case_based">Case-based</option>
                <option value="true_false">True/False</option>
                <option value="assertion_reason">Assertion-Reason</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Difficulty</label>
              <select name="difficulty" value={formData.difficulty} onChange={handleChange}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Importance</label>
              <select name="importance" value={formData.importance} onChange={handleChange}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Cognitive Focus</label>
              <select name="cognitive_focus" value={formData.cognitive_focus} onChange={handleChange}>
                <option value="factual">Factual</option>
                <option value="conceptual">Conceptual</option>
                <option value="clinical">Clinical</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton}>
              {question ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

