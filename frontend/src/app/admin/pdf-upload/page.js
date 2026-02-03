'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Header from '../../../components/Header';
import api from '../../../lib/api';
import ManualQuestionForm from '../../../components/ManualQuestionForm';
import ExtractionReview from '../../../components/ExtractionReview';
import styles from './pdf-upload.module.css';

export default function PDFUploadPage() {
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [extractions, setExtractions] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [reviewingExtraction, setReviewingExtraction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPDFs();
  }, []);

  useEffect(() => {
    if (selectedPdf) {
      fetchExtractions(selectedPdf.id);
    }
  }, [selectedPdf]);

  const fetchPDFs = async () => {
    try {
      const response = await api.get('/pdf');
      setPdfs(response.data.pdfs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load PDFs');
    } finally {
      setLoading(false);
    }
  };

  const fetchExtractions = async (pdfId) => {
    try {
      const response = await api.get(`/extractions/${pdfId}`);
      setExtractions(response.data.extractions || []);
    } catch (err) {
      console.error('Failed to load extractions:', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/pdf/upload', formData);
      const uploadedPdf = response.data;

      const pdfData = {
        ...uploadedPdf,
        uploaded_at: uploadedPdf.uploaded_at || new Date().toISOString(),
        file_size: uploadedPdf.file_size || file.size
      };

      setPdfs(prev => [pdfData, ...prev]);
      setSelectedPdf(pdfData);
      setShowUpload(false);
      
      setTimeout(() => {
        fetchPDFs();
      }, 500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleManualQuestion = async (questionData) => {
    if (!selectedPdf) return;

    try {
      await api.post(`/pdf/${selectedPdf.id}/manual-question`, questionData);
      fetchExtractions(selectedPdf.id);
      setShowManualForm(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create question');
    }
  };

  const handleReviewAction = async (extractionId, action, corrections) => {
    try {
      await api.put(`/extractions/${extractionId}/review`, { action, corrections });
      fetchExtractions(selectedPdf.id);
      setReviewingExtraction(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to review extraction');
    }
  };

  if (showManualForm && selectedPdf) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <ManualQuestionForm
            pdfId={selectedPdf.id}
            onSave={handleManualQuestion}
            onCancel={() => setShowManualForm(false)}
          />
        </div>
      </ProtectedRoute>
    );
  }

  if (reviewingExtraction) {
    return (
      <ProtectedRoute requireAdmin>
        <div>
          <Header />
          <ExtractionReview
            extraction={reviewingExtraction}
            onReview={handleReviewAction}
            onCancel={() => setReviewingExtraction(null)}
          />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAdmin>
      <div>
        <Header />
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.header}>
              <h1 className={styles.title}>PDF Upload & Review</h1>
              <div className={styles.actions}>
                <label className={styles.uploadButton}>
                  Upload PDF
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.content}>
              <div className={styles.pdfList}>
                <h2 className={styles.sectionTitle}>Uploaded PDFs</h2>
                {loading ? (
                  <div className={styles.loading}>Loading...</div>
                ) : pdfs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No PDFs uploaded yet. Upload your first PDF to get started.</p>
                  </div>
                ) : (
                  <div className={styles.pdfCards}>
                    {pdfs.map((pdf, index) => (
                      <div
                        key={pdf.id || `pdf-${index}`}
                        className={`${styles.pdfCard} ${selectedPdf?.id === pdf.id ? styles.selected : ''}`}
                        onClick={() => setSelectedPdf(pdf)}
                      >
                        <div className={styles.pdfInfo}>
                          <h3 className={styles.pdfName}>{pdf.file_name || 'Untitled PDF'}</h3>
                          <p className={styles.pdfMeta}>
                            {pdf.uploaded_at ? new Date(pdf.uploaded_at).toLocaleDateString() : 'Unknown date'} • 
                            {pdf.file_size ? `${(pdf.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                          </p>
                          <span className={`${styles.status} ${styles[pdf.upload_status || 'uploaded']}`}>
                            {pdf.upload_status || 'uploaded'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.extractions}>
                <div className={styles.extractionsHeader}>
                  <h2 className={styles.sectionTitle}>
                    {selectedPdf ? `Questions from: ${selectedPdf.file_name}` : 'Questions'}
                  </h2>
                  {selectedPdf && (
                    <button
                      className={styles.addButton}
                      onClick={() => setShowManualForm(true)}
                    >
                      Add Manual Question
                    </button>
                  )}
                </div>

                {!selectedPdf ? (
                  <div className={styles.emptyState}>
                    <p>Select a PDF from the list to view extracted questions.</p>
                  </div>
                ) : extractions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No questions extracted yet. Add questions manually or wait for AI extraction.</p>
                  </div>
                ) : (
                  <div className={styles.extractionList}>
                    {extractions.map((extraction, index) => (
                      <div key={extraction.id || `extraction-${index}`} className={styles.extractionCard}>
                        <div className={styles.extractionHeader}>
                          <div className={styles.extractionMeta}>
                            <span className={styles.badge}>{extraction.detected_subject}</span>
                            <span className={styles.badge}>{extraction.detected_topic}</span>
                            <span className={styles.badge}>{extraction.detected_type}</span>
                          </div>
                          <span className={`${styles.status} ${styles[extraction.status]}`}>
                            {extraction.status}
                          </span>
                        </div>
                        <div className={styles.extractionText}>
                          {extraction.extracted_text.substring(0, 200)}
                          {extraction.extracted_text.length > 200 && '...'}
                        </div>
                        <div className={styles.extractionActions}>
                          <button
                            className={styles.reviewButton}
                            onClick={() => setReviewingExtraction(extraction)}
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

