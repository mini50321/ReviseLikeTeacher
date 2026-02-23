'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceRecorder from './VoiceRecorder';
import LanguageSelector from './LanguageSelector';
import { voiceAPI } from '../lib/api';
import styles from './QuestionDisplay.module.css';

export default function QuestionDisplay({ question, questionNumber, totalQuestions, onSubmit, loading }) {
  const [answerText, setAnswerText] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const [answerMethod, setAnswerMethod] = useState('text');
  const [language, setLanguage] = useState('english');
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [questionAudioState, setQuestionAudioState] = useState('idle');
  const startTimeRef = useRef(Date.now());
  const voiceRecorderRef = useRef(null);
  const transcribeButtonRef = useRef(null);
  const transcriptionRef = useRef('');
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
    setTranscription('');
    setAudioBlob(null);
    setTranscriptionError('');
    transcriptionRef.current = '';
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

  const handleRecordingComplete = (blob) => {
    setAudioBlob(blob);
    setTranscription('');
    setTranscriptionError('');
    transcriptionRef.current = '';
  };

  const handleTranscribe = useCallback(async () => {
    if (!audioBlob) {
      setTranscriptionError('No recording available');
      return null;
    }

    setTranscribing(true);
    setTranscriptionError('');

    try {
      const result = await voiceAPI.transcribe(audioBlob, language);
      const text = result.transcription || '';
      setTranscription(text);
      setAnswerText(text);
      transcriptionRef.current = text;
      return text;
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscriptionError(error.message || 'Transcription failed. Please try again.');
      return null;
    } finally {
      setTranscribing(false);
    }
  }, [audioBlob, language]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (isMCQ) {
      if (!selectedOption) {
        alert('Please select an option');
        return;
      }
      onSubmit(selectedOption, timeSpent, 'text', null);
      return;
    }

    if (answerMethod === 'voice') {
      if (!audioBlob) {
        alert('Please record an answer first');
        return;
      }

      let finalText = transcriptionRef.current;
      if (!finalText.trim()) {
        finalText = await handleTranscribe();
        if (!finalText || !finalText.trim()) {
          return;
        }
      }

      onSubmit(finalText.trim(), timeSpent, 'voice', language);
      return;
    }

    if (!answerText.trim()) {
      alert('Please enter an answer');
      return;
    }

    onSubmit(answerText.trim(), timeSpent, 'text', null);
  }, [isMCQ, selectedOption, answerMethod, audioBlob, answerText, timeSpent, language, onSubmit, handleTranscribe]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading) return;
      if (e.target.matches('textarea, input') && e.key !== 'Enter') return;

      if (answerMethod === 'voice') {
        if (e.key === ' ' && !e.target.matches('textarea, input')) {
          e.preventDefault();
          if (voiceRecorderRef.current) {
            if (voiceRecorderRef.current.isRecording) {
              voiceRecorderRef.current.stopRecording();
            } else if (!voiceRecorderRef.current.hasRecording) {
              voiceRecorderRef.current.startRecording();
            } else if (audioBlob && !transcriptionRef.current && !transcribing) {
              if (transcribeButtonRef.current) {
                transcribeButtonRef.current.click();
              }
            }
          }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 't' && audioBlob && !transcribing) {
          e.preventDefault();
          if (transcribeButtonRef.current) {
            transcribeButtonRef.current.click();
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && answerText.trim()) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [answerMethod, audioBlob, transcribing, answerText, loading, handleSubmit]);

  const isSubmitDisabled = () => {
    if (loading) return true;
    if (isMCQ) return !selectedOption;
    if (answerMethod === 'voice') return !audioBlob;
    return !answerText.trim();
  };

  const getSubmitLabel = () => {
    if (loading) return 'Submitting...';
    if (isMCQ) return 'Submit Answer';
    if (answerMethod === 'voice' && !transcriptionRef.current && audioBlob) return 'Transcribe & Submit';
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

        <h2 className={styles.questionText}>{question.stem || question.question_text}</h2>

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

        {question.subject && (
          <div className={styles.meta}>
            <span className={styles.subject}>{question.subject}</span>
          </div>
        )}
      </div>

      {!isMCQ && (
        <form onSubmit={handleSubmit} className={styles.answerForm}>
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeButton} ${answerMethod === 'text' ? styles.active : ''}`}
              onClick={() => setAnswerMethod('text')}
            >
              Text Answer
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${answerMethod === 'voice' ? styles.active : ''}`}
              onClick={() => setAnswerMethod('voice')}
            >
              Voice Answer
            </button>
          </div>

          {answerMethod === 'text' ? (
            <div className={styles.textAnswer}>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type your answer here..."
                className={styles.textarea}
                rows={6}
                disabled={loading}
              />
            </div>
          ) : (
            <div className={styles.voiceAnswer}>
              <LanguageSelector value={language} onChange={setLanguage} />
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                Keyboard shortcuts: <strong>Space</strong> to start/stop recording, <strong>Ctrl+T</strong> to transcribe
              </div>
              <VoiceRecorder
                ref={voiceRecorderRef}
                onRecordingComplete={handleRecordingComplete}
                onError={(error) => setTranscriptionError(error)}
              />

              {audioBlob && (
                <div className={styles.transcriptionSection}>
                  <button
                    ref={transcribeButtonRef}
                    type="button"
                    onClick={handleTranscribe}
                    disabled={transcribing}
                    className={styles.transcribeButton}
                    title="Press Ctrl+T (or Cmd+T on Mac) to transcribe"
                  >
                    {transcribing ? 'Transcribing...' : 'Transcribe Audio'}
                  </button>

                  {transcriptionError && (
                    <div className={styles.error}>{transcriptionError}</div>
                  )}

                  {transcription && (
                    <div className={styles.transcriptionPreview}>
                      <label>Transcription Preview:</label>
                      <textarea
                        value={transcription}
                        onChange={(e) => {
                          setTranscription(e.target.value);
                          setAnswerText(e.target.value);
                          transcriptionRef.current = e.target.value;
                        }}
                        className={styles.transcriptionText}
                        rows={4}
                        placeholder="Transcription will appear here..."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitDisabled()}
            >
              {getSubmitLabel()}
            </button>
          </div>
        </form>
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
