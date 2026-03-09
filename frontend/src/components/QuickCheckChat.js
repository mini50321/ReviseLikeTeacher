'use client';

import { useEffect, useRef } from 'react';
import SequentialTextReveal from './SequentialTextReveal';
import styles from './QuickCheckChat.module.css';

/**
 * WhatsApp-style chat: messages stack vertically (question → answer → next question),
 * new messages appear at bottom, content scrolls up.
 * Assistant messages use SequentialTextReveal when they're the active (playing) message.
 */
export default function QuickCheckChat({
  messages = [],
  playingMessageId,
  audioRef,
  audioState,
  className = '',
}) {
  const scrollRef = useRef(null);
  const lastMessageRef = useRef(null);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className={`${styles.container} ${className}`} ref={scrollRef}>
      {messages.map((m, i) => (
        <div
          key={m.id || i}
          ref={i === messages.length - 1 ? lastMessageRef : null}
          className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.assistant}`}
        >
          {m.role === 'user' ? (
            <div className={styles.content}>{m.content}</div>
          ) : (
            <div className={styles.content}>
              {playingMessageId === m.id ? (
                <SequentialTextReveal
                  text={m.content}
                  audioRef={audioRef}
                  audioState={audioState}
                  className={styles.revealContent}
                  intervalMs={250}
                />
              ) : (
                m.content
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
