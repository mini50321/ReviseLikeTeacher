'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './VoiceChatInput.module.css';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

const LANGUAGES = [
  { code: 'english', label: 'English' },
  { code: 'hindi', label: 'Hindi' },
  { code: 'hinglish', label: 'Hinglish' }
];

export default function VoiceChatInput({
  onTranscript,
  onError,
  language = 'english',
  onLanguageChange,
  placeholder = 'Type',
  disabled = false,
  submitLabel = 'Send'
}) {
  const [text, setText] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [useWebSpeech, setUseWebSpeech] = useState(false);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

  const langMap = { english: 'en-US', hindi: 'hi-IN', hinglish: 'en-IN' };
  const canUseWebSpeech = SpeechRecognition && (language === 'english' || language === 'hinglish');

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
  }, []);

  const endListening = useCallback(() => {
    setIsListening(false);
    setInterimText('');
    if (useWebSpeech) {
      stopRecognition();
    } else {
      stopMediaRecorder();
    }
  }, [useWebSpeech, stopRecognition, stopMediaRecorder]);

  useEffect(() => {
    return () => {
      stopRecognition();
      stopMediaRecorder();
    };
  }, [stopRecognition, stopMediaRecorder]);

  const transcriptRef = useRef('');

  const startWebSpeech = useCallback(async () => {
    if (!canUseWebSpeech || !SpeechRecognition) return;
    setUseWebSpeech(true);
    setInterimText('');
    transcriptRef.current = '';
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langMap[language] || 'en-US';
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          transcriptRef.current += (transcriptRef.current ? ' ' : '') + res[0].transcript;
          setInterimText('');
          setText(transcriptRef.current);
        } else {
          interim += res[0].transcript;
        }
      }
      if (interim) setInterimText(interim);
    };
    rec.onspeechend = () => {
      const combined = (transcriptRef.current || '').trim();
      if (combined) {
        onTranscript?.(combined);
      }
      transcriptRef.current = '';
      setText('');
      endListening();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') return;
      onError?.(e.error === 'not-allowed' ? 'Microphone access denied' : 'Speech recognition failed');
      endListening();
    };
    rec.onend = () => {};
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [canUseWebSpeech, language, onTranscript, onError, endListening]);

  const startMediaRecorder = useCallback(async () => {
    setUseWebSpeech(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (blob.size < 1000) {
          onError?.('No speech detected');
          setTranscribing(false);
          return;
        }
        setTranscribing(true);
        try {
          const res = await voiceAPI.transcribe(blob, language);
          const t = (res?.transcription || '').trim();
          if (t) {
            setText(t);
            onTranscript?.(t);
            setText('');
          } else {
            onError?.('No speech detected');
          }
        } catch (err) {
          onError?.(err?.message || 'Transcription failed');
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      setIsListening(true);
    } catch (err) {
      onError?.(err?.message || 'Microphone access denied');
    }
  }, [language, onTranscript, onError]);

  const handleMicClick = useCallback(() => {
    if (disabled || transcribing) return;
    if (isListening) {
      if (useWebSpeech) {
        stopRecognition();
        const final = (transcriptRef.current || text).trim();
        if (final) onTranscript?.(final);
        transcriptRef.current = '';
        setText('');
        endListening();
      } else {
        endListening();
        if (mediaRecorderRef.current?.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }
      return;
    }
    if (canUseWebSpeech) {
      startWebSpeech();
    } else {
      startMediaRecorder();
    }
  }, [disabled, transcribing, isListening, useWebSpeech, canUseWebSpeech, text, startWebSpeech, startMediaRecorder, stopRecognition, endListening, onTranscript]);

  const handleSubmit = useCallback(() => {
    const val = (text + ' ' + interimText).trim();
    if (!val || disabled) return;
    onTranscript?.(val);
    setText('');
    setInterimText('');
  }, [text, interimText, disabled, onTranscript]);

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <div className={styles.wrapper}>
      {onLanguageChange && (
        <div className={styles.langRow}>
          <div className={styles.langWrap}>
            <button
              type="button"
              className={styles.langBtn}
              onClick={() => setLangOpen(o => !o)}
              disabled={disabled}
              aria-label="Change language"
            >
              {currentLang.label}
            </button>
            {langOpen && (
              <>
                <div className={styles.langBackdrop} onClick={() => setLangOpen(false)} />
                <div className={styles.langDropdown}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      className={`${styles.langOption} ${language === l.code ? styles.langActive : ''}`}
                      onClick={() => { onLanguageChange(l.code); setLangOpen(false); }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className={styles.bar}>
        <button type="button" className={styles.attachBtn} aria-label="Attach" disabled={disabled}>
          +
        </button>
        <textarea
          rows={1}
          className={styles.input}
          value={text || interimText}
          onChange={(e) => {
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        {(isListening || transcribing || !(text || interimText).trim()) && (
          <button
            type="button"
            className={styles.micBtn}
            onClick={handleMicClick}
            disabled={disabled}
            aria-label={isListening ? 'End' : 'Microphone'}
          >
            {transcribing ? (
              <span className={styles.spinner} />
            ) : isListening ? (
              <span className={styles.endBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </span>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
        )}
        {!isListening && !transcribing && (text || interimText).trim() && (
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={disabled}
            aria-label={submitLabel}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M4 20l16-8L4 4v5.5L13 12 4 14.5V20z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
