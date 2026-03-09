'use client';

import { useEffect, useRef } from 'react';
import styles from './ChatConversation.module.css';

export default function ChatConversation({ messages = [], className, onPlayAudio }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className={`${styles.container} ${className || ''}`} ref={scrollRef}>
      {messages.map((m, i) => (
        <div
          key={m.id || i}
          className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.assistant}`}
        >
          <div className={styles.content}>{m.content}</div>
          {m.role === 'assistant' && (
            <div className={styles.actions}>
              <button type="button" className={styles.actionBtn} aria-label="Like">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                </svg>
              </button>
              <button type="button" className={styles.actionBtn} aria-label="Dislike">
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
                  className={styles.playBtn}
                  onClick={() => onPlayAudio(m.content)}
                  aria-label="Play"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
