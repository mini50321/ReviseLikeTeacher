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
  const [showManualForm, setShowManualForm] = useState(false);
  const [reviewingExtraction, setReviewingExtraction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPDFs();
  }, []);

  useEffect(() => {
    if (selectedPdf) {
      fetchExtractions(selectedPdf.id);
      setExtractionResult(null);
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

      setTimeout(() => { fetchPDFs(); }, 500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractQuestions = async () => {
    if (!selectedPdf) return;

    setExtracting(true);
    setError('');
    setExtractionResult(null);

    try {
      const response = await api.post(`/pdf/${selectedPdf.id}/extract`, {}, {
        timeout: 300000
      });

      setExtractionResult(response.data);
      fetchExtractions(selectedPdf.id);
      fetchPDFs();
    } catch (err) {
      setError(err.response?.data?.error || 'AI extraction failed. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  const handleDeletePdf = async (pdfId) => {
    if (!confirm('Delete this PDF and all its extracted questions?')) return;

    try {
      await api.delete(`/pdf/${pdfId}`);
      setPdfs(prev => prev.filter(p => p.id !== pdfId));
      if (selectedPdf?.id === pdfId) {
        setSelectedPdf(null);
        setExtractions([]);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete PDF');
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

  const getImportanceStyle = (importance) => {
    switch (importance) {
      case 'high': return { background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#fca5a5' };
      case 'medium': return { background: 'rgba(251, 191, 36, 0.25)', border: '1px solid rgba(251, 191, 36, 0.5)', color: '#fde68a' };
      case 'low': return { background: 'rgba(107, 114, 128, 0.25)', border: '1px solid rgba(107, 114, 128, 0.5)', color: '#d1d5db' };
      default: return {};
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
            <div className={styles.topBar}>
              <div className={styles.titleGroup}>
                <h1 className={styles.pageTitle}>PDF Upload & Extract</h1>
                <p className={styles.pageSubtitle}>Upload source files, run AI extraction, and review generated questions in one workspace.</p>
              </div>
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

            {error && <div className={styles.error}>{error}</div>}

            {extractionResult && (
              <div className={styles.extractionSummary}>
                <h3 className={styles.summaryTitle}>Extraction Complete</h3>
                <p className={styles.summaryText}>{extractionResult.summary}</p>
                {extractionResult.importance_breakdown && (
                  <div className={styles.importanceBreakdown}>
                    <span className={styles.importanceChip} style={getImportanceStyle('high')}>
                      High: {extractionResult.importance_breakdown.high || 0}
                    </span>
                    <span className={styles.importanceChip} style={getImportanceStyle('medium')}>
                      Medium: {extractionResult.importance_breakdown.medium || 0}
                    </span>
                    <span className={styles.importanceChip} style={getImportanceStyle('low')}>
                      Low: {extractionResult.importance_breakdown.low || 0}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className={styles.content}>
              <aside className={styles.leftPanel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.sectionTitle}>Uploaded PDFs</h2>
                  <span className={styles.pdfCount}>{pdfs.length}</span>
                </div>
                {loading ? (
                  <div className={styles.loading}>Loading...</div>
                ) : pdfs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No PDFs uploaded yet.</p>
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
                            {pdf.file_size ? ` ${(pdf.file_size / 1024 / 1024).toFixed(2)} MB` : ' Unknown size'}
                          </p>
                          <div className={styles.pdfActions}>
                            <span className={`${styles.status} ${styles[pdf.upload_status || 'uploaded']}`}>
                              {pdf.upload_status || 'uploaded'}
                            </span>
                            <button
                              className={styles.deleteButton}
                              onClick={(e) => { e.stopPropagation(); handleDeletePdf(pdf.id); }}
                              title="Delete PDF"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </aside>

              <section className={styles.rightPanel}>
                <div className={styles.workspaceHeader}>
                  <div>
                    <h2 className={styles.workspaceTitle}>{selectedPdf ? selectedPdf.file_name : 'Select a PDF to begin'}</h2>
                    <p className={styles.workspaceSubTitle}>
                      {selectedPdf ? 'Run extraction or add questions manually for this document.' : 'Choose one document from the left panel.'}
                    </p>
                  </div>
                  {selectedPdf && (
                    <div className={styles.workspaceActions}>
                      <button
                        className={styles.extractButton}
                        onClick={handleExtractQuestions}
                        disabled={extracting}
                      >
                        {extracting ? 'Extracting with AI...' : 'Extract Questions'}
                      </button>
                      <button
                        className={styles.addButton}
                        onClick={() => setShowManualForm(true)}
                      >
                        Add Manual
                      </button>
                    </div>
                  )}
                </div>

                {extracting && (
                  <div className={styles.extractingState}>
                    <div className={styles.spinner}></div>
                    <p>AI is reading the PDF and extracting questions...</p>
                    <p className={styles.extractingHint}>This may take 30-60 seconds depending on the PDF size.</p>
                  </div>
                )}

                {!selectedPdf ? (
                  <div className={styles.emptyState}>
                    <p>Select a PDF from the list to view or extract questions.</p>
                  </div>
                ) : !extracting && extractions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No questions extracted yet. Click "Extract Questions" to let AI parse this PDF.</p>
                  </div>
                ) : !extracting && (
                  <div className={styles.extractionList}>
                    {extractions.map((extraction, index) => (
                      <div key={extraction.id || `extraction-${index}`} className={styles.extractionCard}>
                        <div className={styles.extractionHeader}>
                          <div className={styles.extractionMeta}>
                            <span className={styles.badge}>{extraction.detected_subject}</span>
                            <span className={styles.badge}>{extraction.detected_topic}</span>
                            <span className={styles.badge}>{extraction.detected_type}</span>
                            <span
                              className={styles.importanceBadge}
                              style={getImportanceStyle(extraction.detected_importance)}
                            >
                              {extraction.detected_importance || 'medium'}
                            </span>
                            {extraction.frequency_count > 1 && (
                              <span className={styles.badge} style={{ background: 'rgba(139, 92, 246, 0.25)', border: '1px solid rgba(139, 92, 246, 0.5)' }}>
                                Repeated {extraction.frequency_count}x
                              </span>
                            )}
                            {extraction.most_recent_year && (
                              <span className={styles.badge} style={{ background: 'rgba(59, 130, 246, 0.25)', border: '1px solid rgba(59, 130, 246, 0.5)' }}>
                                Last: {extraction.most_recent_year}
                              </span>
                            )}
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
              </section>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
