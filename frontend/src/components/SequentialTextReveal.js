'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Splits text into words for sequential reveal.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(/\S+/g) || [];
}

/** Interval in ms between each word. Equal spacing. */
const WORD_INTERVAL_MS = 250;

/**
 * Reveals text sequentially at equal time intervals.
 * Each word appears after the same fixed delay (e.g., 250ms between words).
 */
export default function SequentialTextReveal({
  text,
  audioRef,
  audioState,
  className = '',
  intervalMs = WORD_INTERVAL_MS,
}) {
  const words = tokenize(text);
  const [revealedCount, setRevealedCount] = useState(0);
  const intervalRef = useRef(null);

  // Reset when text changes
  useEffect(() => {
    setRevealedCount(0);
  }, [text]);

  // When finished or error, show full text
  useEffect(() => {
    if (audioState === 'finished' || audioState === 'error') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setRevealedCount(words.length);
    }
  }, [audioState, words.length]);

  // Equal-interval reveal when playing: word 1 at t=0, word 2 at t=interval, word 3 at t=2*interval, ...
  useEffect(() => {
    if (audioState !== 'playing' || words.length === 0) return;

    setRevealedCount(1); // First word immediately

    let count = 1;
    if (count >= words.length) return;

    intervalRef.current = setInterval(() => {
      count += 1;
      setRevealedCount(count);
      if (count >= words.length) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [audioState, words.length, intervalMs]);

  if (!text?.trim()) return null;

  // Before playback: show nothing
  if (audioState === 'idle' || audioState === 'loading' || audioState === 'ready') {
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
