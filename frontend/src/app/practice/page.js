'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import SessionSetup from '../../components/SessionSetup';
import QuestionDisplay from '../../components/QuestionDisplay';
import FeedbackDisplay from '../../components/FeedbackDisplay';
import SessionStats from '../../components/SessionStats';
import styles from './practice.module.css';

function PracticePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams?.get('mode');
  const [sessionSetupOpen, setSessionSetupOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return !!params.get('mode');
    }
    return false;
  });
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const initializedFromUrl = useRef(false);

  useEffect(() => {
    if (mode && !initializedFromUrl.current) {
      initializedFromUrl.current = true;
      setSessionSetupOpen(true);
    }
  }, [mode]);

  useEffect(() => {
    console.log('State update:', { hasSession: !!session, questionsCount: questions.length, sessionSetupOpen });
  }, [session, questions, sessionSetupOpen]);

  const handleSessionStart = async (config) => {
    setLoading(true);
    try {
      console.log('Creating session with config:', config);
      const sessionResponse = await api.post('/sessions', {
        session_type: 'practice',
        configuration: config
      });
      const newSession = sessionResponse.data;
      console.log('Session created - full response:', JSON.stringify(newSession, null, 2));

      if (!newSession || !newSession.id) {
        console.error('Invalid session object received:', newSession);
        alert('Failed to create session. Please try again.');
        setLoading(false);
        return;
      }

      const questionsParams = {
        limit: config.number_of_questions || 10,
        status: 'active'
      };
      
      if (config.subjects && config.subjects.length > 0) {
        questionsParams.subject = config.subjects[0];
      }

      console.log('Fetching questions with params:', questionsParams);
      const questionsResponse = await api.get('/questions', {
        params: questionsParams
      });

      const fetchedQuestions = questionsResponse.data.questions || [];
      console.log('Questions fetched:', fetchedQuestions.length);

      if (fetchedQuestions.length === 0) {
        alert('No questions found matching your criteria. Please try different subjects or check if questions exist in the database.');
        setLoading(false);
        return;
      }

      console.log('About to set state - Session ID:', newSession.id, 'Questions count:', fetchedQuestions.length);
      console.log('Current state before update - Session:', session?.id, 'Questions:', questions.length);
      
      setSession(newSession);
      setQuestions(fetchedQuestions);
      setCurrentQuestionIndex(0);
      setSessionSetupOpen(false);
      
      console.log('State setters called - Session:', newSession.id, 'Questions:', fetchedQuestions.length);
    } catch (error) {
      console.error('Failed to start session:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to start session. Please try again.';
      alert(`Error: ${errorMessage}`);
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
      <div>
        <Header />
          <SessionSetup
            onStart={handleSessionStart}
            onCancel={() => {
              setSessionSetupOpen(false);
              if (!session) router.push('/dashboard');
            }}
            defaultMode={mode}
            loading={loading}
          />
      </div>
    );
  }

  if (!session || questions.length === 0) {
    console.log('Rendering empty state - Session:', session?.id, 'Questions:', questions.length);
    return (
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.emptyState}>
              <h2>Start a Practice Session</h2>
              <p>Click the button below to configure and start a practice session.</p>
              <button
                type="button"
                className={styles.startButton}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSessionSetupOpen(true);
                }}
              >
                Start Practice Session
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  console.log('Rendering practice view - Questions:', questions.length, 'Index:', currentQuestionIndex);
  
  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) {
    console.error('No current question!');
    return (
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.emptyState}>
              <h2>Error loading question</h2>
            </div>
          </div>
        </main>
      </div>
    );
  }
  
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
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
  );
}

export default function PracticePage() {
  return (
    <ProtectedRoute>
      <PracticePageContent />
    </ProtectedRoute>
  );
}

