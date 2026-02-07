'use client';

import { useState } from 'react';
import styles from './ExtractionReview.module.css';

export default function ExtractionReview({ extraction, onApprove, onReject, onEdit }) {
  if (!extraction) return null;

  const [editedText, setEditedText] = useState(extraction.extracted_text || '');

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Review Extraction</h2>
        <div className={styles.content}>
          <div className={styles.extractedText}>
            <label>Extracted Text</label>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={8}
            />
          </div>
          <div className={styles.actions}>
            <button onClick={() => onReject(extraction.id)} className={styles.rejectButton}>
              Reject
            </button>
            <button onClick={() => onEdit(extraction.id, editedText)} className={styles.editButton}>
              Edit & Approve
            </button>
            <button onClick={() => onApprove(extraction.id)} className={styles.approveButton}>
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

