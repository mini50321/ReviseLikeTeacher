'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import QuestionForm from '../../../components/QuestionForm';
import QuestionPreview from '../../../components/QuestionPreview';
import styles from './question-studio.module.css';

export default function QuestionStudioPage() {
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [filters, setFilters] = useState({
    subject: '',
    topic: '',
    type: '',
    difficulty: '',
    importance: '',
    yield_category: '',
    cognitive_focus: '',
    status: 'active'
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setShowForm(true);
    }
    fetchQuestions();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [filters.status]);

  useEffect(() => {
    applyFilters();
  }, [questions, filters]);

  const fetchQuestions = async () => {
    try {
      const statusFilter = filters.status || '';
      console.log('Fetching questions with status filter:', statusFilter);
      const response = await api.get('/admin/questions', {
        params: { status: statusFilter }
      });
      const questions = response.data.questions || [];
      console.log('Fetched questions:', questions.length, 'with status filter:', statusFilter);
      console.log('Question statuses:', questions.map(q => ({ id: q.id, status: q.status })));
      questions.forEach((q, idx) => {
        if (!q.id) {
          console.warn(`Question at index ${idx} missing ID:`, q);
        }
      });
      setQuestions(questions);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...questions];

    if (filters.subject) {
      filtered = filtered.filter(q => q.subject === filters.subject);
    }
    if (filters.topic) {
      filtered = filtered.filter(q => q.topic === filters.topic);
    }
    if (filters.type) {
      filtered = filtered.filter(q => q.type === filters.type);
    }
    if (filters.difficulty) {
      filtered = filtered.filter(q => q.difficulty === filters.difficulty);
    }
    if (filters.importance) {
      filtered = filtered.filter(q => q.importance === filters.importance);
    }
    if (filters.yield_category) {
      filtered = filtered.filter(q => q.yield_category === filters.yield_category);
    }
    if (filters.cognitive_focus) {
      filtered = filtered.filter(q => q.cognitive_focus === filters.cognitive_focus);
    }
    if (filters.status) {
      filtered = filtered.filter(q => q.status === filters.status);
    }

    setFilteredQuestions(filtered);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCreate = () => {
    setEditingQuestion(null);
    setShowForm(true);
  };

  const handleEdit = (question) => {
    console.log('Editing question:', question);
    if (!question.id) {
      console.warn('Question missing ID:', question);
    }
    setEditingQuestion(question);
    setShowForm(true);
  };

  const handlePreview = (question) => {
    setPreviewQuestion(question);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingQuestion(null);
    router.replace('/admin/question-studio');
  };

  const handleFormSave = async (formData) => {
    try {
      const questionData = {
        stem: formData.question_text || formData.stem,
        type: formData.type,
        subject: formData.subject,
        topic: formData.topic || '',
        subtopic: formData.subtopic || '',
        difficulty: formData.difficulty || 'medium',
        importance: formData.importance || 'medium',
        yield_category: formData.yield_category || null,
        cognitive_focus: formData.cognitive_focus || 'factual',
        ideal_answer: formData.ideal_answer || '',
        key_points: formData.key_points || [],
        previous_year_tags: formData.previous_year_tags || [],
        options: formData.options || null,
        correct_answer: formData.correct_answer || null,
        distractor_analysis: formData.distractor_analysis || null,
        concept_tags: formData.concept_tags || null,
        trap_pattern: formData.trap_pattern || null,
        status: formData.status || 'active'
      };

      if (editingQuestion && editingQuestion.id) {
        await api.put(`/questions/${editingQuestion.id}`, questionData);
      } else {
        await api.post('/questions', questionData);
      }
      
      await fetchQuestions();
      handleFormClose();
    } catch (err) {
      console.error('Save question error:', err);
      alert(err.response?.data?.error || 'Failed to save question');
    }
  };

  const handleDelete = async (questionId) => {
    if (!questionId) {
      alert('Invalid question ID');
      return;
    }

    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      console.log('Deleting question with ID:', questionId);
      const response = await api.put(`/questions/${questionId}`, { status: 'inactive' });
      console.log('Delete successful, response:', response.data);
      console.log('Updated question status:', response.data?.status);
      
      if (response.data?.status !== 'inactive') {
        console.error('WARNING: Question status was not set to inactive! Status is:', response.data?.status);
      }
      
      await fetchQuestions();
    } catch (err) {
      console.error('Delete question error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      console.error('Full error:', err);
      
      let errorMessage = 'Failed to delete question';
      if (err.response?.status === 404) {
        errorMessage = 'Question not found. It may have already been deleted.';
      } else if (err.response?.status === 400) {
        errorMessage = err.response.data?.error || 'Invalid request';
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      alert(errorMessage);
    }
  };

  const subjects = [...new Set(questions.map(q => q.subject))].sort();
  const topics = [...new Set(questions.map(q => q.topic))].sort();

  if (showForm) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <QuestionForm
            question={editingQuestion}
            onSave={handleFormSave}
            onCancel={handleFormClose}
          />
        </div>
      </ProtectedRoute>
    );
  }

  if (previewQuestion) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <QuestionPreview
            question={previewQuestion}
            onClose={() => setPreviewQuestion(null)}
          />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.header}>
              <h1 className={styles.title}>Question Studio</h1>
              <button className={styles.createButton} onClick={handleCreate}>
                Create Question
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.filters}>
              <div className={styles.filterGroup}>
                <label>Subject</label>
                <select
                  value={filters.subject}
                  onChange={(e) => handleFilterChange('subject', e.target.value)}
                >
                  <option value="">All</option>
                  {subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Topic</label>
                <select
                  value={filters.topic}
                  onChange={(e) => handleFilterChange('topic', e.target.value)}
                >
                  <option value="">All</option>
                  {topics.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="mcq">MCQ</option>
                  <option value="saq">SAQ</option>
                  <option value="case_based">Case-based</option>
                  <option value="true_false">True/False</option>
                  <option value="assertion_reason">Assertion-Reason</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Difficulty</label>
                <select
                  value={filters.difficulty}
                  onChange={(e) => handleFilterChange('difficulty', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Importance</label>
                <select
                  value={filters.importance}
                  onChange={(e) => handleFilterChange('importance', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Yield</label>
                <select
                  value={filters.yield_category}
                  onChange={(e) => handleFilterChange('yield_category', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="core">Core</option>
                  <option value="frequent">Frequent</option>
                  <option value="occasional">Occasional</option>
                  <option value="rare">Rare</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Cognitive Focus</label>
                <select
                  value={filters.cognitive_focus}
                  onChange={(e) => handleFilterChange('cognitive_focus', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="factual">Factual</option>
                  <option value="conceptual">Conceptual</option>
                  <option value="clinical">Clinical</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label>Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className={styles.loading}>Loading questions...</div>
            ) : (
              <div className={styles.questionsList}>
                {filteredQuestions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No questions found. Create your first question!</p>
                  </div>
                ) : (
                  filteredQuestions.map((question, index) => (
                    <div key={question.id || `question-${index}`} className={styles.questionCard}>
                      <div className={styles.questionHeader}>
                        <div className={styles.questionMeta}>
                          <span className={styles.subject}>{question.subject}</span>
                          <span className={styles.topic}>{question.topic}</span>
                          <span className={styles.type}>{question.type}</span>
                          <span className={styles.difficulty}>{question.difficulty}</span>
                          {question.yield_category && (
                            <span className={`${styles.yield} ${styles[`yield_${question.yield_category}`] || ''}`}>
                              {question.yield_category}
                            </span>
                          )}
                        </div>
                        <span className={`${styles.status} ${styles[question.status]}`}>
                          {question.status}
                        </span>
                      </div>
                      <div className={styles.questionStem}>
                        {question.stem.substring(0, 200)}
                        {question.stem.length > 200 && '...'}
                      </div>
                      <div className={styles.questionActions}>
                        <button
                          className={styles.actionButton}
                          onClick={() => handlePreview(question)}
                        >
                          Preview
                        </button>
                        <button
                          className={styles.actionButton}
                          onClick={() => handleEdit(question)}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDelete(question.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

