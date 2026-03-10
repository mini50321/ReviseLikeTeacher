'use client';

import { useState, useEffect, useRef } from 'react';

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(/\S+/g) || [];
}

const WORD_INTERVAL_MS = 250;


export default function SequentialTextReveal({
  text,
  audioRef,
  audioState,
  className = '',
  intervalMs = WORD_INTERVAL_MS,
  autoStart = false,
  onComplete,
}) {
  const words = tokenize(text);
  const [revealedCount, setRevealedCount] = useState(0);
  const intervalRef = useRef(null);
  const completedRef = useRef(false);
  const startedRef = useRef(false);
  useEffect(() => {
    setRevealedCount(0);
    completedRef.current = false;
    startedRef.current = false;
  }, [text]);

  useEffect(() => {
    if (audioState === 'finished' || audioState === 'error') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setRevealedCount(words.length);
      if (!completedRef.current && words.length > 0 && onComplete) {
        completedRef.current = true;
        onComplete();
      }
    }
  }, [audioState, words.length]);

  useEffect(() => {
    const shouldStart = (autoStart || audioState === 'playing') && !startedRef.current;
    if (!shouldStart || words.length === 0) return;

    startedRef.current = true;
    setRevealedCount(1);
    let count = 1;
    if (count >= words.length) return;

    intervalRef.current = setInterval(() => {
      count += 1;
      setRevealedCount(count);
      if (count >= words.length) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (!completedRef.current && onComplete) {
          completedRef.current = true;
          onComplete();
        }
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoStart, audioState, words.length, intervalMs]);

  if (!text?.trim()) return null;

  if (!autoStart && (audioState === 'idle' || audioState === 'loading' || audioState === 'ready')) {
    return (
      <div className={className} aria-live="polite">
        <span aria-hidden="true">&nbsp;</span>
      </div>
    );
  }

  const visibleWords = words.slice(0, revealedCount);
  const visibleText = visibleWords.join(' ');

  return (
    <div className={className} aria-live="polite">
      {visibleText || '\u00A0'}
    </div>
  );
}
