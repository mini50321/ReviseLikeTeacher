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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [conceptDraft, setConceptDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftSuccess, setDraftSuccess] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftTopic, setDraftTopic] = useState('');

  const groupExtractionsByChunk = (items, chunkSize = pageSize) => {
    const groups = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const start = i + 1;
      const end = Math.min(i + chunkSize, items.length);
      groups.push({
        range: `${start}-${end}`,
        items: items.slice(i, i + chunkSize)
      });
    }
    return groups;
  };

  useEffect(() => {
    fetchPDFs();
  }, []);

  useEffect(() => {
    if (selectedPdf) {
      fetchExtractions(selectedPdf.id);
      setExtractionResult(null);
      setCurrentPage(1);
    }
  }, [selectedPdf]);

  useEffect(() => {
    setCurrentPage(1);
  }, [extractions.length]);

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

  const handleBuildConceptDraft = async () => {
    if (!selectedPdf) return;
    if (!draftSubject.trim() || !draftTopic.trim()) {
      setDraftError('Subject and topic are required to build a concept draft.');
      return;
    }
    setDraftLoading(true);
    setDraftError('');
    setDraftSuccess('');
    setConceptDraft(null);
    try {
      const res = await api.post(`/pdf/${selectedPdf.id}/concept-draft`, {
        subject: draftSubject.trim(),
        topic: draftTopic.trim(),
        max_concepts: 6
      });
      setConceptDraft(res.data.draft || null);
    } catch (err) {
      setDraftError(err.response?.data?.error || 'Failed to build concept draft');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSaveConceptsFromDraft = async () => {
    if (!conceptDraft || !Array.isArray(conceptDraft.concepts) || conceptDraft.concepts.length === 0) {
      setDraftError('No concept draft available to save.');
      return;
    }
    if (!draftSubject.trim() || !draftTopic.trim()) {
      setDraftError('Subject and topic are required to save concepts.');
      return;
    }
    setSubmitting(true);
    setDraftError('');
    setDraftSuccess('');
    try {
      const res = await api.post('/concept-map/import-from-draft', {
        subject: draftSubject.trim(),
        topic: draftTopic.trim(),
        concepts: conceptDraft.concepts
      });
      setDraftSuccess(
        `Saved concepts to Concept Map. Created ${res.data.created_count || 0}, updated ${res.data.updated_count || 0}.`
      );
    } catch (err) {
      setDraftError(err.response?.data?.error || 'Failed to save concepts to Concept Map');
    } finally {
      setSubmitting(false);
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
      await api.post(`/pdf/${selectedPdf.id}/extract`);

      const poll = async () => {
        try {
          const [pdfRes, extRes] = await Promise.all([
            api.get(`/pdf/${selectedPdf.id}`),
            api.get(`/extractions/${selectedPdf.id}`)
          ]);

          setSelectedPdf(pdfRes.data.pdf);
          setExtractions(extRes.data.extractions || []);

          const status = pdfRes.data.pdf.upload_status;
          if (status === 'processing') {
            setTimeout(poll, 7000);
          } else {
            setExtracting(false);
            setExtractionResult({
              summary: pdfRes.data.pdf.extraction_summary || '',
              importance_breakdown: {},
              yield_breakdown: {}
            });
          }
        } catch (e) {
          setTimeout(poll, 10000);
        }
      };

      poll();
    } catch (err) {
      setError(err.response?.data?.error || 'AI extraction failed. Please try again.');
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
                        className={styles.secondaryButton}
                        onClick={handleBuildConceptDraft}
                        disabled={draftLoading}
                      >
                        {draftLoading ? 'Building concept draft…' : 'Build Concept Draft'}
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

                {extracting && extractions.length === 0 && (
                  <div className={styles.extractingState}>
                    <div className={styles.spinner}></div>
                    <p>AI is reading the PDF and extracting questions...</p>
                  </div>
                )}

                {extracting && extractions.length > 0 && (
                  <div className={styles.extractingState}>
                    <div className={styles.spinner}></div>
                    <p>Extracting more questions… {extractions.length} so far.</p>
                  </div>
                )}

                {!selectedPdf ? (
                  <div className={styles.emptyState}>
                    <p>Select a PDF from the list to view or extract questions.</p>
                  </div>
                ) : extractions.length === 0 && !extracting ? (
                  <div className={styles.emptyState}>
                    <p>No questions extracted yet. Click "Extract Questions" to let AI parse this PDF.</p>
                  </div>
                ) : (
                  <div className={styles.extractionList}>
                    <div className={styles.draftPanel}>
                      <h3 className={styles.sectionTitle}>Concept Map Draft (from this PDF)</h3>
                      <div className={styles.draftControls}>
                        <input
                          type="text"
                          placeholder="Subject (e.g. ENT)"
                          value={draftSubject}
                          onChange={e => setDraftSubject(e.target.value)}
                          className={styles.draftInput}
                        />
                        <input
                          type="text"
                          placeholder="Topic (e.g. Hearing Physiology)"
                          value={draftTopic}
                          onChange={e => setDraftTopic(e.target.value)}
                          className={styles.draftInput}
                        />
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleBuildConceptDraft}
                          disabled={draftLoading}
                        >
                          {draftLoading ? 'Building…' : 'Generate draft'}
                        </button>
                        {conceptDraft && conceptDraft.concepts?.length > 0 && (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={handleSaveConceptsFromDraft}
                            disabled={submitting}
                          >
                            {submitting ? 'Saving…' : 'Save to Concept Map'}
                          </button>
                        )}
                      </div>
                      {draftError && <p className={styles.error}>{draftError}</p>}
                      {draftSuccess && <p className={styles.success}>{draftSuccess}</p>}
                      {conceptDraft && Array.isArray(conceptDraft.concepts) && conceptDraft.concepts.length > 0 && (
                        <pre className={styles.draftPreview}>
{JSON.stringify(conceptDraft, null, 2)}
                        </pre>
                      )}
                    </div>

                    {extractions.length > 0 && (() => {
                      const groups = groupExtractionsByChunk(extractions);
                      const totalPages = groups.length || 1;
                      const safePage = Math.min(Math.max(currentPage, 1), totalPages);
                      const group = groups[safePage - 1] || { range: '1-0', items: [] };
                      return (
                        <>
                          <div className={styles.pageGroup}>
                            <h3 className={styles.pageGroupTitle}>
                              Questions {group.range}
                            </h3>
                            {group.items.map((extraction, index) => (
                              <div key={extraction.id || `extraction-${group.range}-${index}`} className={styles.extractionCard}>
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
                                    {(extraction.detected_type || '').toLowerCase() === 'mcq' && extraction.pyq_label === 'latest' && (
                                      <span className={`${styles.badge} ${styles.pyqLatest}`}>
                                        Latest PYQ
                                      </span>
                                    )}
                                    {(extraction.detected_type || '').toLowerCase() === 'mcq' && extraction.pyq_label === 'older' && (
                                      <span className={`${styles.badge} ${styles.pyqOlder}`}>
                                        Older PYQ
                                      </span>
                                    )}
                                  </div>
                                  <span className={`${styles.status} ${styles[extraction.status]}`}>
                                    {extraction.status}
                                  </span>
                                </div>
                                <div className={styles.extractionText}>
                                  {(extraction.extracted_text || '').substring(0, 200)}
                                  {(extraction.extracted_text || '').length > 200 && '...'}
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
                          {totalPages > 1 && (
                            <div className={styles.pagination}>
                              <button
                                className={styles.pageNavButton}
                                disabled={safePage === 1}
                                onClick={() => safePage > 1 && setCurrentPage(safePage - 1)}
                              >
                                ‹
                              </button>
                              {(() => {
                                const items = [];
                                if (totalPages <= 5) {
                                  for (let p = 1; p <= totalPages; p++) {
                                    items.push(p);
                                  }
                                } else {
                                  items.push(1);
                                  let start = Math.max(2, safePage - 1);
                                  let end = Math.min(totalPages - 1, safePage + 1);
                                  if (start > 2) {
                                    items.push('prevMore');
                                  }
                                  for (let p = start; p <= end; p++) {
                                    items.push(p);
                                  }
                                  if (end < totalPages - 1) {
                                    items.push('nextMore');
                                  }
                                  items.push(totalPages);
                                }
                                return items.map((item, idx) => {
                                  if (typeof item === 'number') {
                                    return (
                                      <button
                                        key={`page-${item}`}
                                        className={`${styles.pageButton} ${item === safePage ? styles.pageButtonActive : ''}`}
                                        onClick={() => setCurrentPage(item)}
                                      >
                                        {item}
                                      </button>
                                    );
                                  }
                                  return (
                                    <span key={`ellipsis-${idx}`} className={styles.pageButtonEllipsis}>
                                      …
                                    </span>
                                  );
                                });
                              })()}
                              <button
                                className={styles.pageNavButton}
                                disabled={safePage === totalPages}
                                onClick={() => safePage < totalPages && setCurrentPage(safePage + 1)}
                              >
                                ›
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
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
