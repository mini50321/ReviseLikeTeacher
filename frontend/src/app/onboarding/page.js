'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    target_exam: '',
    exam_date: '',
    target_score_band: '',
    goal_tier: '',
    student_category: '',
    selected_subjects: [],
    daily_study_minutes: 60,
    weekly_question_target: 50
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const subjects = [
    'Anatomy', 'Physiology', 'Biochemistry', 'Pathology',
    'Pharmacology', 'Microbiology', 'Forensic Medicine',
    'Community Medicine', 'Ophthalmology', 'ENT',
    'General Medicine', 'General Surgery', 'Obstetrics & Gynaecology',
    'Paediatrics', 'Orthopaedics', 'Dermatology',
    'Psychiatry', 'Anaesthesia', 'Radiology'
  ];

  const scoreBands = ['600-650', '650-700', '700-750', '750+'];

  const goalTiers = [
    { value: 'top_rank', label: 'Top 100 Rank' },
    { value: 'good_rank', label: 'Top 1000 Rank' },
    { value: 'seat_only', label: 'Just Securing a Seat' }
  ];

  const studentCategories = [
    { value: 'bright', label: 'Bright — I grasp concepts quickly' },
    { value: 'average', label: 'Average — I need moderate practice' },
    { value: 'weak', label: 'Weak — I need extra help and repetition' }
  ];

  const stepMeta = [
    { title: 'Target exam', description: 'Pick the exam you are preparing for.' },
    { title: 'Exam timeline', description: 'Set your expected exam date.' },
    { title: 'Score ambition', description: 'Choose the score band you want to target.' },
    { title: 'Goal level', description: 'Define the outcome you are aiming for.' },
    { title: 'Self assessment', description: 'Tell us your current learning comfort level.' },
    { title: 'Subjects', description: 'Choose subjects to prioritize in your plan.' },
    { title: 'Daily commitment', description: 'Set realistic daily study minutes.' },
    { title: 'Weekly output', description: 'Set your weekly question practice goal.' }
  ];

  const currentStepMeta = stepMeta[step - 1];

  const handleSubjectToggle = (subject) => {
    setFormData(prev => ({
      ...prev,
      selected_subjects: prev.selected_subjects.includes(subject)
        ? prev.selected_subjects.filter(s => s !== subject)
        : [...prev.selected_subjects, subject]
    }));
  };

  const handleNext = () => {
    if (step === 1 && !formData.target_exam) {
      setError('Please select target exam');
      return;
    }
    if (step === 2 && !formData.exam_date) {
      setError('Please select exam date');
      return;
    }
    if (step === 3 && !formData.target_score_band) {
      setError('Please select target score band');
      return;
    }
    if (step === 4 && !formData.goal_tier) {
      setError('Please select your goal');
      return;
    }
    if (step === 5 && !formData.student_category) {
      setError('Please select your self-assessment');
      return;
    }
    if (step === 6 && formData.selected_subjects.length === 0) {
      setError('Please select at least one subject');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (formData.daily_study_minutes < 15 || formData.daily_study_minutes > 480) {
      setError('Daily study minutes must be between 15 and 480');
      return;
    }
    if (formData.weekly_question_target < 5 || formData.weekly_question_target > 500) {
      setError('Weekly question target must be between 5 and 500');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/onboarding', formData);
      router.push('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete onboarding');
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.progress}>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ width: `${(step / 8) * 100}%` }}
                />
              </div>
              <span className={styles.progressText}>Step {step} of 8</span>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.stepBadge}>Step {step} / 8</span>
                <h1 className={styles.title}>Complete Your Profile</h1>
                <p className={styles.stepDescription}>
                  {currentStepMeta?.title} - {currentStepMeta?.description}
                </p>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              {step === 1 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>Select Target Exam</h2>
                  <div className={styles.options}>
                    <button
                      type="button"
                      className={`${styles.option} ${formData.target_exam === 'NEET PG' ? styles.selected : ''}`}
                      onClick={() => setFormData({ ...formData, target_exam: 'NEET PG' })}
                    >
                      NEET PG
                    </button>
                    <button
                      type="button"
                      className={`${styles.option} ${formData.target_exam === 'AIIMS' ? styles.selected : ''}`}
                      onClick={() => setFormData({ ...formData, target_exam: 'AIIMS' })}
                    >
                      AIIMS
                    </button>
                    <button
                      type="button"
                      className={`${styles.option} ${formData.target_exam === 'Other' ? styles.selected : ''}`}
                      onClick={() => setFormData({ ...formData, target_exam: 'Other' })}
                    >
                      Other
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>Select Exam Date</h2>
                  <input
                    type="date"
                    className={styles.input}
                    value={formData.exam_date}
                    onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}

              {step === 3 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>Select Target Score Band</h2>
                  <div className={styles.options}>
                    {scoreBands.map(band => (
                      <button
                        key={band}
                        type="button"
                        className={`${styles.option} ${formData.target_score_band === band ? styles.selected : ''}`}
                        onClick={() => setFormData({ ...formData, target_score_band: band })}
                      >
                        {band}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>What is your goal?</h2>
                  <div className={styles.options}>
                    {goalTiers.map(tier => (
                      <button
                        key={tier.value}
                        type="button"
                        className={`${styles.option} ${formData.goal_tier === tier.value ? styles.selected : ''}`}
                        onClick={() => setFormData({ ...formData, goal_tier: tier.value })}
                      >
                        {tier.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>How would you rate yourself?</h2>
                  <div className={styles.options}>
                    {studentCategories.map(cat => (
                      <button
                        key={cat.value}
                        type="button"
                        className={`${styles.option} ${formData.student_category === cat.value ? styles.selected : ''}`}
                        onClick={() => setFormData({ ...formData, student_category: cat.value })}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className={styles.step}>
                  <div className={styles.stepTitleRow}>
                    <h2 className={styles.stepTitle}>Select Subjects</h2>
                    <span className={styles.selectionCount}>
                      {formData.selected_subjects.length} selected
                    </span>
                  </div>
                  <div className={styles.subjectGrid}>
                    {subjects.map(subject => (
                      <button
                        key={subject}
                        type="button"
                        className={`${styles.subjectButton} ${formData.selected_subjects.includes(subject) ? styles.selected : ''}`}
                        onClick={() => handleSubjectToggle(subject)}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>Daily Study Minutes</h2>
                  <input
                    type="number"
                    className={styles.input}
                    value={formData.daily_study_minutes}
                    onChange={(e) => setFormData({ ...formData, daily_study_minutes: parseInt(e.target.value) || 0 })}
                    min={15}
                    max={480}
                  />
                  <div className={styles.rangeMeta}>
                    <span>Min 15</span>
                    <span>Max 480</span>
                  </div>
                  <p className={styles.hint}>Recommended: 60-180 minutes per day</p>
                </div>
              )}

              {step === 8 && (
                <div className={styles.step}>
                  <h2 className={styles.stepTitle}>Weekly Question Target</h2>
                  <input
                    type="number"
                    className={styles.input}
                    value={formData.weekly_question_target}
                    onChange={(e) => setFormData({ ...formData, weekly_question_target: parseInt(e.target.value) || 0 })}
                    min={5}
                    max={500}
                  />
                  <div className={styles.rangeMeta}>
                    <span>Min 5</span>
                    <span>Max 500</span>
                  </div>
                  <p className={styles.hint}>Recommended: 50-100 questions per week</p>
                </div>
              )}

              <div className={styles.actions}>
                {step > 1 && (
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => setStep(step - 1)}
                  >
                    Back
                  </button>
                )}
                {step < 8 ? (
                  <button
                    type="button"
                    className={styles.nextButton}
                    onClick={handleNext}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? 'Completing...' : 'Complete Onboarding'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

