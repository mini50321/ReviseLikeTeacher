'use client';

import { useState, useEffect } from 'react';
import api from '../lib/api';
import styles from './QuestionForm.module.css';

export default function QuestionForm({ question, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    stem: '',
    type: 'mcq',
    subject: '',
    topic: '',
    subtopic: '',
    difficulty: 'medium',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: '',
    key_points: '',
    previous_year_tags: '',
    image_path: '',
    status: 'active'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (question) {
      setFormData({
        stem: question.stem || '',
        type: question.type || 'mcq',
        subject: question.subject || '',
        topic: question.topic || '',
        subtopic: question.subtopic || '',
        difficulty: question.difficulty || 'medium',
        importance: question.importance || 'medium',
        cognitive_focus: question.cognitive_focus || 'factual',
        ideal_answer: question.ideal_answer || '',
        key_points: Array.isArray(question.key_points) 
          ? question.key_points.join('\n') 
          : (question.key_points || ''),
        previous_year_tags: Array.isArray(question.previous_year_tags)
          ? JSON.stringify(question.previous_year_tags)
          : (question.previous_year_tags || ''),
        image_path: question.image_path || '',
        status: question.status || 'active'
      });
    }
  }, [question]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.stem || !formData.subject || !formData.topic) {
      setError('Stem, subject, and topic are required');
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        ...formData,
        key_points: formData.key_points.split('\n').filter(k => k.trim()),
        previous_year_tags: formData.previous_year_tags 
          ? JSON.parse(formData.previous_year_tags)
          : []
      };

      if (question) {
        await api.put(`/questions/${question.id}`, submitData);
      } else {
        await api.post('/questions', submitData);
      }

      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save question');
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>
          {question ? 'Edit Question' : 'Create Question'}
        </h2>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Question Stem *</label>
            <textarea
              value={formData.stem}
              onChange={(e) => handleChange('stem', e.target.value)}
              rows={4}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Type *</label>
              <select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                required
              >
                <option value="mcq">MCQ</option>
                <option value="saq">SAQ</option>
                <option value="case_based">Case-based</option>
                <option value="true_false">True/False</option>
                <option value="assertion_reason">Assertion-Reason</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Subject *</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Topic *</label>
              <input
                type="text"
                value={formData.topic}
                onChange={(e) => handleChange('topic', e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label>Subtopic</label>
              <input
                type="text"
                value={formData.subtopic}
                onChange={(e) => handleChange('subtopic', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Difficulty</label>
              <select
                value={formData.difficulty}
                onChange={(e) => handleChange('difficulty', e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Importance</label>
              <select
                value={formData.importance}
                onChange={(e) => handleChange('importance', e.target.value)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Cognitive Focus</label>
              <select
                value={formData.cognitive_focus}
                onChange={(e) => handleChange('cognitive_focus', e.target.value)}
              >
                <option value="factual">Factual</option>
                <option value="conceptual">Conceptual</option>
                <option value="clinical">Clinical</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label>Ideal Answer</label>
            <textarea
              value={formData.ideal_answer}
              onChange={(e) => handleChange('ideal_answer', e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label>Key Points (one per line)</label>
            <textarea
              value={formData.key_points}
              onChange={(e) => handleChange('key_points', e.target.value)}
              rows={4}
              placeholder="Enter key points, one per line"
            />
          </div>

          <div className={styles.field}>
            <label>Previous Year Tags (JSON array)</label>
            <input
              type="text"
              value={formData.previous_year_tags}
              onChange={(e) => handleChange('previous_year_tags', e.target.value)}
              placeholder='[{"exam": "NEET PG", "year": 2023}]'
            />
          </div>

          <div className={styles.field}>
            <label>Image Path</label>
            <input
              type="text"
              value={formData.image_path}
              onChange={(e) => handleChange('image_path', e.target.value)}
              placeholder="URL or path to image"
            />
          </div>

          <div className={styles.field}>
            <label>Status</label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

