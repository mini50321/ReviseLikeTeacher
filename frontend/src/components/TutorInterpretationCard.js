'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './TutorInterpretationCard.module.css';

export default function TutorInterpretationCard({
  text,
  speakText,
  autoPlay = false,
  showText = true,
  showActions = true,
  variant = 'default'
}) {
  const displayText = (text || '').trim();
  const toSpeak = (speakText || text || '').trim();

  const [audioState, setAudioState] = useState('idle');
  const [reaction, setReaction] = useState(null);

  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const speakKeyRef = useRef('');

  const revokeUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const fetchAndPrepare = useCallback(async () => {
    if (!toSpeak) return;
    const currentKey = toSpeak;
    speakKeyRef.current = currentKey;

    setAudioState('loading');
    revokeUrl();
    try {
      const blob = await voiceAPI.speak(toSpeak);
      if (speakKeyRef.current !== currentKey) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => setAudioState('playing');
      audio.onended = () => setAudioState('finished');
      audio.onerror = () => setAudioState('error');
      setAudioState('ready');
    } catch (e) {
      setAudioState('error');
    }
  }, [toSpeak]);

  const play = useCallback(async () => {
    if (!toSpeak) return;
    if (audioRef.current && audioState === 'playing') {
      audioRef.current.pause();
      setAudioState('finished');
      return;
    }

    if (!audioRef.current || audioState === 'idle' || audioState === 'error') {
      await fetchAndPrepare();
    }

    try {
      audioRef.current?.currentTime !== undefined && (audioRef.current.currentTime = 0);
      await audioRef.current?.play();
    } catch {
      setAudioState('finished');
    }
  }, [audioState, fetchAndPrepare, toSpeak]);

  useEffect(() => {
    if (!autoPlay) return;
    if (!toSpeak) return;
    play();
  }, [autoPlay, toSpeak]);

  useEffect(() => () => {
    revokeUrl();
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const copy = useCallback(async () => {
    if (!displayText) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(displayText);
      }
    } catch {
      return;
    }
  }, [displayText]);

  const share = useCallback(async () => {
    if (!displayText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: displayText, title: 'Tutor note' });
        return;
      }
    } catch {
      return;
    }
    await copy();
  }, [copy, displayText]);

  if ((!displayText || !displayText.trim()) && (!toSpeak || !toSpeak.trim())) return null;
  if (!showText && !showActions) return null;

  return (
    <div className={`${styles.card} ${variant === 'actionsOnly' ? styles.actionsOnlyCard : ''}`}>
      {showText && <div className={styles.text}>{displayText}</div>}
      {showActions && (
        <div className={`${styles.actions} ${variant === 'actionsOnly' ? styles.actionsNoMargin : ''}`}>
          <div className={styles.actionsLeft}>
            <button type="button" className={styles.iconBtn} aria-label="Copy" onClick={copy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.iconBtn} ${reaction === 'like' ? styles.iconBtnActive : ''}`}
              aria-label="Like"
              onClick={() => setReaction(prev => (prev === 'like' ? null : 'like'))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.iconBtn} ${reaction === 'dislike' ? styles.iconBtnActive : ''}`}
              aria-label="Dislike"
              onClick={() => setReaction(prev => (prev === 'dislike' ? null : 'dislike'))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
              </svg>
            </button>

            <button type="button" className={styles.iconBtn} aria-label="Share" onClick={share}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className={`${styles.playBtn} ${audioState === 'playing' ? styles.playBtnActive : ''}`}
            aria-label={audioState === 'playing' ? 'Pause' : 'Play'}
            onClick={play}
          >
            {audioState === 'playing' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="4" height="12" rx="1" />
                <rect x="14" y="6" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

