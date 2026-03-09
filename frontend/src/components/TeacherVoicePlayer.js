'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './TeacherVoicePlayer.module.css';

export default function TeacherVoicePlayer({ text, autoPlay = false, label = 'Listen' }) {
  const [state, setState] = useState('idle');
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const textRef = useRef(null);
  const urlRef = useRef(null);

  const fetchAudio = useCallback(async (content) => {
    if (!content || !String(content).trim()) return;
    setState('loading');
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    try {
      const blob = await voiceAPI.speak(content);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setAudioUrl(url);
      setState('ready');
    } catch (err) {
      console.error('TTS error:', err);
      setState('error');
    }
  }, []);

  useEffect(() => {
    const content = text ? String(text).trim() : '';
    if (!content) {
      setState('idle');
      return;
    }
    if (textRef.current === content) return;
    textRef.current = content;
    fetchAudio(content);
  }, [text, fetchAudio]);

  useEffect(() => {
    if (!audioUrl || state !== 'ready') return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onplay = () => setState('playing');
    audio.onended = () => setState('finished');
    audio.onerror = () => setState('error');
    if (autoPlay) {
      audio.play().catch(() => setState('finished'));
    }
    return () => {
      audio.pause();
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    };
  }, [audioUrl, autoPlay]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (state === 'playing') {
      audioRef.current.pause();
      setState('finished');
    } else if (state === 'finished' || state === 'ready') {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const retry = () => {
    textRef.current = null;
    if (text && String(text).trim()) fetchAudio(String(text).trim());
  };

  if (!text || !String(text).trim()) return null;

  if (state === 'error') {
    return (
      <div className={styles.containerUnavailable}>
        <span className={styles.unavailableText}>Listen unavailable — read the text below</span>
        <button type="button" onClick={retry} className={styles.retryLink}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.icon}>
        {state === 'loading' && <span className={styles.dots}>...</span>}
        {state === 'playing' && <span className={styles.wave}>Speaking</span>}
        {(state === 'ready' || state === 'idle' || state === 'finished') && <span className={styles.speaker}>Listen</span>}
      </div>
      <span className={styles.status}>
        {state === 'loading' && 'Preparing...'}
        {state === 'playing' && 'Speaking...'}
        {state === 'ready' && label}
        {state === 'finished' && 'Replay'}
      </span>
      <div className={styles.controls}>
        {(state === 'finished' || state === 'playing' || state === 'ready') && (
          <button type="button" onClick={togglePlayback} className={styles.playBtn}>
            {state === 'playing' ? 'Pause' : 'Play'}
          </button>
        )}
      </div>
    </div>
  );
}
