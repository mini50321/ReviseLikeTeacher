'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import SessionSetup from '../../components/SessionSetup';
import QuestionDisplay from '../../components/QuestionDisplay';
import FeedbackDisplay from '../../components/FeedbackDisplay';
import SessionStats from '../../components/SessionStats';
import styles from './practice.module.css';

export default function PracticePage() {
  const [sessionSetupOpen, setSessionSetupOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');

  useEffect(() => {
    if (mode) {
      setSessionSetupOpen(true);
    }
  }, [mode]);

  const handleSessionStart = async (config) => {
    setLoading(true);
    try {
      const sessionResponse = await api.post('/sessions', {
        session_type: 'practice',
        configuration: config
      });
      const newSession = sessionResponse.data;

      const questionsParams = {
        limit: config.number_of_questions || 10,
        status: 'active'
      };
      
      if (config.subjects && config.subjects.length > 0) {
        questionsParams.subject = config.subjects[0];
      }

      const questionsResponse = await api.get('/questions', {
        params: questionsParams
      });

      setSession(newSession);
      setQuestions(questionsResponse.data.questions || []);
      setCurrentQuestionIndex(0);
      setSessionSetupOpen(false);
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Failed to start session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSubmit = async (answerText, timeSpent) => {
    if (!session || !questions[currentQuestionIndex]) return;

    setLoading(true);
    try {
      const question = questions[currentQuestionIndex];
      const response = await api.post('/attempts', {
        question_id: question.id,
        session_id: session.id,
        answer_text: answerText,
        answer_method: 'text',
        time_spent_seconds: timeSpent
      });

      setCurrentAttempt(response.data);
      setShowFeedback(true);
      updateSessionStats(response.data);
    } catch (error) {
      console.error('Failed to submit answer:', error);
      alert('Failed to submit answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateSessionStats = (attemptData) => {
    setSessionStats(prev => ({
      questionsAnswered: (prev?.questionsAnswered || 0) + 1,
      totalScore: (prev?.totalScore || 0) + (attemptData.score || 0),
      averageScore: ((prev?.totalScore || 0) + (attemptData.score || 0)) / ((prev?.questionsAnswered || 0) + 1),
      correctAnswers: (prev?.correctAnswers || 0) + ((attemptData.score || 0) >= 70 ? 1 : 0)
    }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowFeedback(false);
      setCurrentAttempt(null);
    } else {
      handleEndSession();
    }
  };

  const handleEndSession = async () => {
    if (!session) return;

    try {
      await api.post(`/sessions/${session.id}/complete`);
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  if (sessionSetupOpen) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <SessionSetup
            onStart={handleSessionStart}
            onCancel={() => {
              setSessionSetupOpen(false);
              if (!session) router.push('/dashboard');
            }}
            defaultMode={mode}
          />
        </div>
      </ProtectedRoute>
    );
  }

  if (!session || questions.length === 0) {
    return (
      <ProtectedRoute>
        <div>
          <Header />
          <main className={styles.main}>
            <div className={styles.container}>
              <div className={styles.emptyState}>
                <h2>Start a Practice Session</h2>
                <p>Click the button below to configure and start a practice session.</p>
                <button
                  className={styles.startButton}
                  onClick={() => setSessionSetupOpen(true)}
                >
                  Start Practice Session
                </button>
              </div>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <ProtectedRoute>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <SessionStats
              stats={sessionStats}
              currentQuestion={currentQuestionIndex + 1}
              totalQuestions={questions.length}
            />

            {!showFeedback ? (
              <QuestionDisplay
                question={currentQuestion}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={questions.length}
                onSubmit={handleAnswerSubmit}
                loading={loading}
              />
            ) : (
              <FeedbackDisplay
                attempt={currentAttempt}
                onNext={handleNextQuestion}
                onEnd={handleEndSession}
                isLastQuestion={currentQuestionIndex === questions.length - 1}
              />
            )}

            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

