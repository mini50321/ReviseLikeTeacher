'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { voiceAPI } from '../lib/api';
import styles from './RealtimeVoiceCoach.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function RealtimeVoiceCoach({
  context = {},
  onTurnComplete,
  onError,
  disabled = false,
  placeholder = 'Type or use mic for live voice…',
  submitLabel = 'Ask Teacher',
  onStreamUpdate
}) {
  const [text, setText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [lastAssistantTranscript, setLastAssistantTranscript] = useState('');
  const [userStream, setUserStream] = useState('');
  const [assistantStream, setAssistantStream] = useState('');
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const pendingUserRef = useRef('');
  const assistantTranscriptRef = useRef('');
  const onTurnCompleteRef = useRef(onTurnComplete);
  onTurnCompleteRef.current = onTurnComplete;
  const onStreamUpdateRef = useRef(onStreamUpdate);
  onStreamUpdateRef.current = onStreamUpdate;

  const updateStreams = useCallback((userText, assistantText) => {
    setUserStream(userText);
    setAssistantStream(assistantText);
    if (onStreamUpdateRef.current) {
      onStreamUpdateRef.current({
        studentPartial: userText,
        teacherPartial: assistantText
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    if (dcRef.current) {
      try { dcRef.current.close(); } catch (e) {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) {}
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  useEffect(() => {
    return disconnect;
  }, [disconnect]);

  const handleDataChannelMessage = useCallback(
    (event, onTurnCompleteCb) => {
      try {
        const ev = JSON.parse(event.data);
        const t = ev.type;

        // eslint-disable-next-line no-console
        console.log('Realtime event', t, ev);

        const extractItemText = (item) => {
          if (!item) return '';
          if (Array.isArray(item.content) && item.content.length > 0) {
            const c0 = item.content[0];
            if (typeof c0 === 'string') return c0;
            if (c0.transcript) return c0.transcript;
            if (c0.text?.value) return c0.text.value;
            if (c0.text) return c0.text;
          }
          if (item.transcript) return item.transcript;
          if (item.text) return item.text;
          return '';
        };

        const extractResponseText = (response) => {
          if (!response) return '';
          const out = response.output || response.outputs;
          if (!Array.isArray(out) || out.length === 0) return '';
          return extractItemText(out[0]);
        };

        // User messages (conversation.item.*)
        if (t.startsWith('conversation.item') && ev.item) {
          const txt = extractItemText(ev.item);
          if (txt) {
            pendingUserRef.current = txt;
            updateStreams(pendingUserRef.current, assistantTranscriptRef.current);
          }
        }

        // Assistant messages (response.output_item.* or response.*)
        if (t.startsWith('response.output_item') && ev.item) {
          const txt = extractItemText(ev.item);
          if (txt) {
            assistantTranscriptRef.current = txt;
            setLastAssistantTranscript(txt);
            updateStreams(pendingUserRef.current, assistantTranscriptRef.current);
          }
        }

        if (t === 'response.done' && ev.response) {
          const txt = extractResponseText(ev.response);
          if (txt) {
            assistantTranscriptRef.current = txt;
            setLastAssistantTranscript(txt);
            updateStreams(pendingUserRef.current, assistantTranscriptRef.current);
          }

          const userText = (pendingUserRef.current || '').trim();
          const assistantText = (assistantTranscriptRef.current || '').trim();
          if (userText || assistantText) {
            setLastUserTranscript(userText);
            setLastAssistantTranscript(assistantText);
            onTurnCompleteCb?.({ student: userText, teacher: assistantText, fromRealtime: true });
          }
          pendingUserRef.current = '';
          assistantTranscriptRef.current = '';
          updateStreams('', '');
        }

        if (t === 'error') {
          onError?.(ev.error?.message || 'Realtime error');
        }
      } catch (e) {
        console.warn('Realtime event parse error:', e);
      }
    },
    [updateStreams]
  );

  const startRealtime = useCallback(async () => {
    if (disabled || isConnecting || isConnected) return;
    setIsConnecting(true);
    onError?.('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        if (audioRef.current && e.streams?.[0]) {
          audioRef.current.srcObject = e.streams[0];
        }
      };

      pc.addTrack(stream.getTracks()[0]);

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => handleDataChannelMessage(e, (turn) => onTurnCompleteRef.current?.(turn));
      dc.onclose = () => disconnect();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/voice/realtime-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          subject: context.subject,
          topic: context.topic,
          questionStem: context.questionStem,
          studentAnswer: context.studentAnswer,
          conversationHistory: context.conversationHistory || []
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Session failed: ${res.status}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });

      setIsConnected(true);
    } catch (err) {
      console.error('Realtime connect error:', err);
      onError?.(err.message || 'Failed to start live voice');
      disconnect();
    } finally {
      setIsConnecting(false);
    }
  }, [disabled, isConnecting, isConnected, context, onTurnComplete, onError, handleDataChannelMessage, disconnect]);

  const handleTextSubmit = useCallback(async () => {
    const val = text.trim();
    if (!val || disabled) return;
    try {
      const response = await voiceAPI.coachTurn({
        transcript: val,
        subject: context.subject,
        topic: context.topic,
        questionStem: context.questionStem,
        studentAnswer: context.studentAnswer,
        topK: 3,
        latencyMode: 'fast',
        conversationHistory: context.conversationHistory || []
      });
      const teacher = response?.teacher_response || '';
      if (teacher) {
        onTurnComplete?.({ student: val, teacher, fromRealtime: false });
      }
      setText('');
    } catch (err) {
      onError?.(err.message || 'Failed to get response');
    }
  }, [text, disabled, context, onTurnComplete, onError]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <input
          type="text"
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleTextSubmit()}
          placeholder={placeholder}
          disabled={disabled || isConnected}
        />
        {isConnecting ? (
          <span className={styles.status}>Connecting…</span>
        ) : isConnected ? (
          <button
            type="button"
            className={styles.stopBtn}
            onClick={disconnect}
            aria-label="Stop live voice"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.micBtn}
            onClick={startRealtime}
            disabled={disabled}
            aria-label="Start live voice"
            title="Live voice — faster response"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <span className={styles.liveBadge}>Live</span>
          </button>
        )}
        {!isConnected && (text || '').trim() && (
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleTextSubmit}
            disabled={disabled}
            aria-label={submitLabel}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 20l16-8L4 4v5.5L13 12 4 14.5V20z" />
            </svg>
          </button>
        )}
      </div>
      {(userStream || assistantStream) && (
        <div className={styles.liveTranscript}>
          {userStream && (
            <div className={styles.userLine}>
              <span className={styles.userLabel}>You</span>
              <span className={styles.text}>{userStream}</span>
            </div>
          )}
          {assistantStream && (
            <div className={styles.assistantLine}>
              <span className={styles.assistantLabel}>Teacher</span>
              <span className={styles.text}>{assistantStream}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
