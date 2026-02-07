'use client';

import { useState } from 'react';
import styles from './LanguageSelector.module.css';

export default function LanguageSelector({ value, onChange }) {
  const languages = [
    { code: 'english', label: 'English', flag: '🇬🇧' },
    { code: 'hindi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'hinglish', label: 'Hinglish', flag: '🌐' }
  ];

  return (
    <div className={styles.container}>
      <label className={styles.label}>Recording Language</label>
      <div className={styles.options}>
        {languages.map((lang) => (
          <button
            key={lang.code}
            type="button"
            className={`${styles.option} ${value === lang.code ? styles.active : ''}`}
            onClick={() => onChange(lang.code)}
          >
            <span className={styles.flag}>{lang.flag}</span>
            <span className={styles.label}>{lang.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

