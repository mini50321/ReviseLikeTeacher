'use client';

import { useState, useEffect } from 'react';
import styles from './QuestionForm.module.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuestionForm({ question, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    question_text: '',
    subject: '',
    topic: '',
    subtopic: '',
    type: 'saq',
    difficulty: 'medium',
    importance: 'medium',
    yield_category: '',
    cognitive_focus: 'factual',
    status: 'active',
    options: { A: '', B: '', C: '', D: '' },
    correct_answer: '',
    distractor_analysis: '',
    concept_tags: '',
    trap_pattern: ''
  });

  useEffect(() => {
    if (question) {
      let parsedOptions = { A: '', B: '', C: '', D: '' };
      if (question.options) {
        try {
          parsedOptions = typeof question.options === 'string'
            ? JSON.parse(question.options)
            : question.options;
        } catch (e) {
          parsedOptions = { A: '', B: '', C: '', D: '' };
        }
      }

      setFormData({
        question_text: question.stem || question.question_text || '',
        subject: question.subject || '',
        topic: question.topic || '',
        subtopic: question.subtopic || '',
        type: question.type || 'saq',
        difficulty: question.difficulty || 'medium',
        importance: question.importance || 'medium',
        yield_category: question.yield_category || '',
        cognitive_focus: question.cognitive_focus || 'factual',
        status: question.status || 'active',
        ideal_answer: question.ideal_answer || '',
        key_points: question.key_points || [],
        previous_year_tags: question.previous_year_tags || [],
        options: parsedOptions,
        correct_answer: question.correct_answer || '',
        distractor_analysis: question.distractor_analysis || '',
        concept_tags: question.concept_tags || '',
        trap_pattern: question.trap_pattern || ''
      });
    }
  }, [question]);

  const needsOptions = formData.type === 'mcq' || formData.type === 'true_false' || formData.type === 'assertion_reason';

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'type') {
      if (value === 'true_false') {
        setFormData(prev => ({
          ...prev,
          type: value,
          options: { A: 'True', B: 'False', C: '', D: '' },
          correct_answer: ''
        }));
        return;
      }
      if (value !== 'mcq' && value !== 'true_false' && value !== 'assertion_reason') {
        setFormData(prev => ({
          ...prev,
          type: value,
          options: { A: '', B: '', C: '', D: '' },
          correct_answer: ''
        }));
        return;
      }
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOptionChange = (label, value) => {
    setFormData(prev => ({
      ...prev,
      options: { ...prev.options, [label]: value }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const getActiveOptions = () => {
    if (formData.type === 'true_false') return ['A', 'B'];
    return OPTION_LABELS;
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
              <label>Subtopic</label>
              <input
                name="subtopic"
                value={formData.subtopic}
                onChange={handleChange}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Yield Category</label>
              <select name="yield_category" value={formData.yield_category} onChange={handleChange}>
                <option value="">Not set</option>
                <option value="core">Core (≥10 PYQs)</option>
                <option value="frequent">Frequent (5-9 PYQs)</option>
                <option value="occasional">Occasional (2-4 PYQs)</option>
                <option value="rare">Rare (1 PYQ)</option>
              </select>
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

          {needsOptions && (
            <div className={styles.optionsSection}>
              <label className={styles.optionsSectionLabel}>Options *</label>
              <div className={styles.optionsList}>
                {getActiveOptions().map((label) => (
                  <div key={label} className={styles.optionRow}>
                    <div
                      className={`${styles.optionRadio} ${formData.correct_answer === label ? styles.optionRadioSelected : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, correct_answer: label }))}
                      title={`Mark ${label} as correct answer`}
                    >
                      {label}
                    </div>
                    <input
                      className={styles.optionInput}
                      value={formData.options[label] || ''}
                      onChange={(e) => handleOptionChange(label, e.target.value)}
                      placeholder={`Option ${label}`}
                      required
                      readOnly={formData.type === 'true_false'}
                    />
                    {formData.correct_answer === label && (
                      <span className={styles.correctBadge}>Correct</span>
                    )}
                  </div>
                ))}
              </div>
              {!formData.correct_answer && (
                <p className={styles.optionHint}>Click on an option letter to mark it as the correct answer</p>
              )}
            </div>
          )}

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
            <label>Explanation / Ideal Answer</label>
            <textarea
              name="ideal_answer"
              value={formData.ideal_answer || ''}
              onChange={handleChange}
              rows={4}
              placeholder={needsOptions
                ? "Explain why the correct answer is right and why other options are wrong..."
                : "Provide the model answer or explanation the AI will use to teach the student..."
              }
            />
            <span className={styles.fieldHint}>
              {needsOptions
                ? "The AI will use this to explain the answer to students after they respond"
                : "The AI will compare the student's answer against this and teach what they missed"
              }
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Key Points</label>
            <textarea
              name="key_points_text"
              value={Array.isArray(formData.key_points) ? formData.key_points.join('\n') : (formData.key_points || '')}
              onChange={(e) => {
                const points = e.target.value.split('\n').filter(p => p.trim());
                setFormData(prev => ({ ...prev, key_points: points }));
              }}
              rows={3}
              placeholder="Enter one key point per line..."
            />
            <span className={styles.fieldHint}>
              Important points the student must cover (one per line)
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Concept Tags</label>
            <input
              name="concept_tags"
              value={formData.concept_tags || ''}
              onChange={handleChange}
              placeholder="e.g. acid-base balance, enzyme kinetics"
            />
            <span className={styles.fieldHint}>
              Core medical concepts tested (comma-separated)
            </span>
          </div>

          {needsOptions && (
            <>
              <div className={styles.formGroup}>
                <label>Distractor Analysis</label>
                <textarea
                  name="distractor_analysis"
                  value={formData.distractor_analysis || ''}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Why each wrong option is tempting..."
                />
                <span className={styles.fieldHint}>
                  Explain the misconception each distractor exploits
                </span>
              </div>

              <div className={styles.formGroup}>
                <label>Trap Pattern</label>
                <input
                  name="trap_pattern"
                  value={formData.trap_pattern || ''}
                  onChange={handleChange}
                  placeholder="e.g. Reversal of Type 1 vs Type 2"
                />
                <span className={styles.fieldHint}>
                  Common trap or trick in this question
                </span>
              </div>
            </>
          )}

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
