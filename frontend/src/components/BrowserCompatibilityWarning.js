'use client';

import { useState, useEffect } from 'react';
import styles from './BrowserCompatibilityWarning.module.css';

export default function BrowserCompatibilityWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    const detectedIssues = [];

    if (typeof navigator.mediaDevices === 'undefined' || !navigator.mediaDevices.getUserMedia) {
      detectedIssues.push('Media recording is not supported');
    }

    if (typeof MediaRecorder === 'undefined') {
      detectedIssues.push('MediaRecorder API is not available');
    }

    if (detectedIssues.length > 0) {
      setIssues(detectedIssues);
      setShowWarning(true);
    }
  }, []);

  if (!showWarning) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <span>⚠️ Browser compatibility: {issues.join(', ')}. Some features may not work.</span>
        <button onClick={() => setShowWarning(false)} className={styles.closeButton}>
          ×
        </button>
      </div>
    </div>
  );
}

