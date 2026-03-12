'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceChatInput from './VoiceChatInput';
import SequentialTextReveal from './SequentialTextReveal';
import { voiceAPI } from '../lib/api';
import styles from './QuestionDisplay.module.css';

export default function QuestionDisplay({ question, questionNumber, totalQuestions, onSubmit, loading }) {
  const [answerText, setAnswerText] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const [language, setLanguage] = useState('english');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [questionAudioState, setQuestionAudioState] = useState('idle');
  const startTimeRef = useRef(Date.now());
  const questionAudioRef = useRef(null);
  const questionAudioUrlRef = useRef(null);
  const spokenQuestionIdRef = useRef(null);

  let parsedOptions = null;
  if (question.options) {
    try {
      parsedOptions = typeof question.options === 'string'
        ? JSON.parse(question.options)
        : question.options;
      if (parsedOptions && !Object.values(parsedOptions).some(v => v)) {
        parsedOptions = null;
      }
    } catch (e) {
      parsedOptions = null;
    }
  }

  const isMCQ = (question.type === 'mcq' || question.type === 'true_false' || question.type === 'assertion_reason') && parsedOptions;

  useEffect(() => {
    setAnswerText('');
    setSelectedOption('');
    setTranscriptionError('');
    startTimeRef.current = Date.now();

    if (questionAudioRef.current) {
      questionAudioRef.current.pause();
      questionAudioRef.current = null;
    }
    if (questionAudioUrlRef.current) {
      URL.revokeObjectURL(questionAudioUrlRef.current);
      questionAudioUrlRef.current = null;
    }
    setQuestionAudioState('idle');
  }, [question.id]);

  useEffect(() => {
    if (!question.id || spokenQuestionIdRef.current === question.id) return;
    spokenQuestionIdRef.current = question.id;

    const questionText = question.stem || question.question_text || '';
    if (!questionText) return;

    let speakText = `Question ${questionNumber}. ${questionText}`;

    if (parsedOptions) {
      const optionEntries = Object.entries(parsedOptions).filter(([, v]) => v);
      if (optionEntries.length > 0) {
        speakText += '. Options: ';
        speakText += optionEntries.map(([label, text]) => `${label}, ${text}`).join('. ');
      }
    }

    setQuestionAudioState('loading');

    voiceAPI.speak(speakText).then(blob => {
      const url = URL.createObjectURL(blob);
      questionAudioUrlRef.current = url;
      const audio = new Audio(url);
      questionAudioRef.current = audio;

      audio.onplay = () => setQuestionAudioState('playing');
      audio.onended = () => setQuestionAudioState('done');
      audio.onerror = () => setQuestionAudioState('error');

      audio.play().catch(() => setQuestionAudioState('done'));
    }).catch(() => {
      setQuestionAudioState('error');
    });

    return () => {
      if (questionAudioRef.current) {
        questionAudioRef.current.pause();
      }
    };
  }, [question.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleOptionSelect = (label) => {
    setSelectedOption(label);
    setAnswerText(label);
  };

  const handleTextSubmit = useCallback((text) => {
    if (!text?.trim()) return;
    const spent = Math.floor((Date.now() - startTimeRef.current) / 1000);
    onSubmit(text.trim(), spent, 'text', language);
  }, [onSubmit, language]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault?.();
    if (!isMCQ || !selectedOption) return;
    onSubmit(selectedOption, timeSpent, 'text', null);
  }, [isMCQ, selectedOption, timeSpent, onSubmit]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading) return;
      if (e.target.matches('textarea, input') && e.key !== 'Enter') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isMCQ && selectedOption) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMCQ, selectedOption, loading, handleSubmit]);

  const isSubmitDisabled = () => {
    if (loading) return true;
    return !selectedOption;
  };

  const getSubmitLabel = () => {
    if (loading) return 'Submitting...';
    return 'Submit Answer';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.questionNumber}>
          Question {questionNumber} of {totalQuestions}
        </span>
      </div>

      <div className={styles.questionCard}>
        {(questionAudioState === 'loading' || questionAudioState === 'playing') && (
          <div className={styles.questionVoice}>
            <div className={styles.questionVoiceIcon}>
              {questionAudioState === 'loading' && (
                <div className={styles.qLoadingDots}><span></span><span></span><span></span></div>
              )}
              {questionAudioState === 'playing' && (
                <div className={styles.qSoundWave}>
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
              )}
            </div>
            <span className={styles.questionVoiceLabel}>
              {questionAudioState === 'loading' ? 'Reading question...' : 'Listening...'}
            </span>
            {questionAudioState === 'playing' && (
              <button
                className={styles.questionVoiceStop}
                onClick={() => {
                  if (questionAudioRef.current) {
                    questionAudioRef.current.pause();
                    setQuestionAudioState('done');
                  }
                }}
              >
                ⏹ Skip
              </button>
            )}
          </div>
        )}

        {questionAudioState === 'done' && (
          <div className={styles.questionVoice}>
            <button
              className={styles.questionVoiceReplay}
              onClick={() => {
                if (questionAudioRef.current) {
                  questionAudioRef.current.currentTime = 0;
                  questionAudioRef.current.play().catch(() => {});
                }
              }}
            >
              🔊 Replay Question
            </button>
          </div>
        )}

        <h2 className={styles.questionText}>
          <SequentialTextReveal
            text={question.stem || question.question_text}
            audioRef={questionAudioRef}
            audioState={questionAudioState === 'done' ? 'finished' : questionAudioState}
            className=""
            intervalMs={250}
          />
        </h2>

        {isMCQ && parsedOptions && (
          <div className={styles.mcqOptions}>
            {Object.entries(parsedOptions).map(([label, text]) => {
              if (!text) return null;
              return (
                <div
                  key={label}
                  className={`${styles.mcqOption} ${selectedOption === label ? styles.mcqOptionSelected : ''}`}
                  onClick={() => handleOptionSelect(label)}
                >
                  <span className={`${styles.mcqLabel} ${selectedOption === label ? styles.mcqLabelSelected : ''}`}>
                    {label}
                  </span>
                  <span className={styles.mcqText}>{text}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.meta}>
          {question.subject && (
            <span className={styles.subject}>{question.subject}</span>
          )}
          <button
            type="button"
            className={styles.langPill}
            onClick={() => setLanguage(prev => prev === 'english' ? 'hindi' : prev === 'hindi' ? 'hinglish' : 'english')}
          >
            {language === 'english' ? 'English' : language === 'hindi' ? 'Hindi' : 'Hinglish'}
          </button>
        </div>
      </div>

      {!isMCQ && (
        <div className={styles.answerForm}>
          <div className={styles.voiceChatInputWrap}>
            <VoiceChatInput
              language={language}
              onLanguageChange={null}
              placeholder="Type or speak your answer…"
              onTranscript={handleTextSubmit}
              onError={(e) => setTranscriptionError(e)}
              disabled={loading}
              submitLabel="Submit Answer"
            />
          </div>
          {transcriptionError && <div className={styles.error}>{transcriptionError}</div>}
        </div>
      )}

      {isMCQ && (
        <div className={styles.actions} style={{ marginTop: '16px' }}>
          <button
            type="button"
            className={styles.submitButton}
            disabled={isSubmitDisabled()}
            onClick={handleSubmit}
          >
            {getSubmitLabel()}
          </button>
        </div>
      )}
    </div>
  );
}
