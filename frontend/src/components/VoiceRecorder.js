'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import styles from './VoiceRecorder.module.css';

const VoiceRecorder = forwardRef(function VoiceRecorder({ onRecordingComplete, onError }, ref) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState('');
  const [checkingDevices, setCheckingDevices] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [audioUrl]);

  const updateAudioLevel = () => {
    if (analyserRef.current && isRecording && !isPaused) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(Math.min(100, (average / 255) * 100));
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    } else {
      setAudioLevel(0);
    }
  };

  const checkMicrophoneAvailability = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support microphone access. Please use Chrome, Edge, or Firefox.');
      }

      return true;
    } catch (error) {
      console.error('Microphone check error:', error);
      throw error;
    }
  };

  const startRecording = async () => {
    setError('');
    setCheckingDevices(true);

    try {
      await checkMicrophoneAvailability();

      let stream;
      const attempts = [
        { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        { audio: { echoCancellation: true } },
        { audio: true }
      ];
      
      let lastError;
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
          if (error.name !== 'NotFoundError' && error.name !== 'DevicesNotFoundError') {
            throw error;
          }
        }
      }
      
      if (!stream) {
        throw lastError || new Error('Failed to access microphone');
      }
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        if (onRecordingComplete) {
          onRecordingComplete(blob);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      updateAudioLevel();
      setCheckingDevices(false);
    } catch (error) {
      console.error('Error starting recording:', error);
      setCheckingDevices(false);
      
      let errorMessage = 'Failed to start recording. ';
      
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please:\n' +
          '1. Connect a microphone to your computer\n' +
          '2. Check if it\'s enabled in system settings\n' +
          '3. Try clearing site data: Settings → Privacy → Site Settings → localhost:3001 → Reset permissions\n' +
          '4. Refresh the page and try again';
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone permission denied. Please:\n' +
          '1. Click the lock icon in your browser\'s address bar\n' +
          '2. Allow microphone access\n' +
          '3. Refresh the page and try again';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Microphone is being used by another application. Please:\n' +
          '1. Close other applications using the microphone\n' +
          '2. Try again';
      } else if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage += 'Please check your microphone connection and browser permissions.';
      }
      
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      updateAudioLevel();
    }
  };

  const resetRecording = () => {
    stopRecording();
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setAudioLevel(0);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file (WAV, MP3, WebM, etc.)');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Audio file is too large. Maximum size is 10MB.');
      e.target.value = '';
      return;
    }

    setError('');
    const blob = new Blob([file], { type: file.type });
    setAudioBlob(blob);
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    if (onRecordingComplete) {
      onRecordingComplete(blob);
    }
    e.target.value = '';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    isRecording,
    hasRecording: !!audioBlob
  }));

  return (
    <div className={styles.container}>
      {error && (
        <div className={styles.errorMessage}>
          <div className={styles.errorIcon}>⚠️</div>
          <div className={styles.errorText}>
            {error.split('\n').map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className={styles.errorClose}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.controls}>
        {!isRecording && !audioBlob && (
          <>
            <button
              type="button"
              onClick={startRecording}
              className={styles.recordButton}
              disabled={checkingDevices}
              title="Start Recording"
            >
              {checkingDevices ? (
                <>
                  <span className={styles.spinner}></span>
                  Checking microphone...
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  Start Recording
                </>
              )}
            </button>
            <label className={styles.uploadButton}>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
              </svg>
              Upload Audio File
            </label>
          </>
        )}

        {isRecording && (
          <>
            <button
              type="button"
              onClick={isPaused ? resumeRecording : pauseRecording}
              className={styles.pauseButton}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className={styles.stopButton}
              title="Stop Recording"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
              Stop
            </button>
          </>
        )}

        {audioBlob && !isRecording && (
          <>
            <button
              type="button"
              onClick={resetRecording}
              className={styles.resetButton}
              title="Record Again"
            >
              Record Again
            </button>
          </>
        )}
      </div>

      {isRecording && (
        <div className={styles.recordingInfo}>
          <div className={styles.timeDisplay}>{formatTime(recordingTime)}</div>
          <div className={styles.visualizer}>
            <div
              className={styles.levelBar}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>
      )}

      {audioUrl && !isRecording && (
        <div className={styles.playback}>
          <audio src={audioUrl} controls className={styles.audioPlayer} />
        </div>
      )}
    </div>
  );
});

export default VoiceRecorder;

