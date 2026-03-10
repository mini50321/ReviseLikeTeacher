'use client';

import { useEffect, useRef, useState } from 'react';
import SequentialTextReveal from './SequentialTextReveal';
import styles from './ChatConversation.module.css';

export default function ChatConversation({
  messages = [],
  className,
  onPlayAudio,
  revealingMessageId,
  audioRef,
  audioState,
  revealIntervalMs = 250
}) {
  const scrollRef = useRef(null);
  const lastMessageRef = useRef(null);
  const [reactions, setReactions] = useState({});
  const [playingKey, setPlayingKey] = useState(null);
  const [revealedDone, setRevealedDone] = useState({});

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className={`${styles.container} ${className || ''}`} ref={scrollRef}>
      {messages.map((m, i) => {
        const key = m.id || i;
        const isAssistant = m.role === 'assistant';
        const isLast = i === messages.length - 1;
        const state = reactions[key] || {};
        const isRevealing = isAssistant && revealingMessageId && m.id === revealingMessageId;
        const isRevealed = revealedDone[key];

        return (
          <div
            key={key}
            ref={isLast ? lastMessageRef : null}
            className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.assistant}`}
          >
            <div className={styles.content}>
              {isRevealing ? (
                <SequentialTextReveal
                  text={m.content}
                  audioRef={audioRef}
                  audioState={audioState}
                  className=""
                  intervalMs={revealIntervalMs}
                  onComplete={() =>
                    setRevealedDone(prev => (prev[key] ? prev : { ...prev, [key]: true }))
                  }
                />
              ) : (
                m.content
              )}
            </div>
            {isAssistant && isLast && isRevealing && !isRevealed && (
              <div className={styles.loadingRow}>
                <span className={styles.loadingDots}>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            {isAssistant && isLast && isRevealed && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${state.copied ? styles.actionBtnActive : ''}`}
                  aria-label="Copy"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard && m.content) {
                      navigator.clipboard.writeText(m.content).catch(() => {});
                      setReactions(prev => ({
                        ...prev,
                        [key]: { ...prev[key], copied: true },
                      }));
                      setTimeout(() => {
                        setReactions(prev => ({
                          ...prev,
                          [key]: { ...prev[key], copied: false },
                        }));
                      }, 1200);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${state.reaction === 'like' ? styles.actionBtnActive : ''}`}
                  aria-label="Like"
                  onClick={() =>
                    setReactions(prev => ({
                      ...prev,
                      [key]: {
                        ...prev[key],
                        reaction: prev[key]?.reaction === 'like' ? null : 'like',
                      },
                    }))
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${state.reaction === 'dislike' ? styles.actionBtnActive : ''}`}
                  aria-label="Dislike"
                  onClick={() =>
                    setReactions(prev => ({
                      ...prev,
                      [key]: {
                        ...prev[key],
                        reaction: prev[key]?.reaction === 'dislike' ? null : 'dislike',
                      },
                    }))
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                  </svg>
                </button>
                <button type="button" className={styles.actionBtn} aria-label="Share">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
                {onPlayAudio && m.content && (
                  <button
                    type="button"
                    className={`${styles.playBtn} ${playingKey === key ? styles.playBtnActive : ''}`}
                    onClick={async () => {
                      if (!onPlayAudio) return;
                      const k = key;
                      if (playingKey === k) {
                        setPlayingKey(null);
                        return;
                      }
                      setPlayingKey(k);
                      try {
                        await onPlayAudio(m.content);
                      } finally {
                        setPlayingKey(prev => (prev === k ? null : prev));
                      }
                    }}
                    aria-label={playingKey === key ? 'Stop' : 'Play'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      {playingKey === key ? (
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      ) : (
                        <polygon points="5 3 19 12 5 21 5 3" />
                      )}
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
