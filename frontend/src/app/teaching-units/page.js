'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './teaching-units.module.css';

function TeachingUnitsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topics, setTopics] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [activeSection, setActiveSection] = useState('concepts');

  const paramSubject = searchParams.get('subject');
  const paramTopic = searchParams.get('topic');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (paramSubject && paramTopic && !selectedUnit) {
      loadOrGenerate(paramSubject, paramTopic);
    }
  }, [paramSubject, paramTopic]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [topicsRes, unitsRes] = await Promise.all([
        api.get('/teaching-units/topics-available').catch(() => ({ data: { topics: [] } })),
        api.get('/teaching-units').catch(() => ({ data: { units: [] } }))
      ]);

      setTopics(topicsRes.data.topics || []);
      setUnits(unitsRes.data.units || []);

      const subjectSet = new Set();
      (topicsRes.data.topics || []).forEach(t => subjectSet.add(t.subject));
      setSubjects([...subjectSet].sort());

      if (paramSubject) setSubjectFilter(paramSubject);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadOrGenerate = async (subject, topic) => {
    try {
      setGenerating(true);
      setError('');
      const res = await api.post('/teaching-units/generate', { subject, topic });
      setSelectedUnit(res.data);
      if (!res.data.already_existed) {
        await loadData();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate teaching unit');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedUnit) return;
    try {
      setGenerating(true);
      setError('');
      const res = await api.post('/teaching-units/regenerate', {
        subject: selectedUnit.subject,
        topic: selectedUnit.topic
      });
      setSelectedUnit(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to regenerate');
    } finally {
      setGenerating(false);
    }
  };

  const viewUnit = async (subject, topic) => {
    try {
      setGenerating(true);
      setError('');
      const res = await api.get(`/teaching-units/${encodeURIComponent(subject)}/${encodeURIComponent(topic)}`);
      setSelectedUnit(res.data);
      setActiveSection('concepts');
    } catch (err) {
      if (err.response?.status === 404) {
        await loadOrGenerate(subject, topic);
      } else {
        setError(err.response?.data?.error || 'Failed to load teaching unit');
      }
    } finally {
      setGenerating(false);
    }
  };

  const filteredTopics = subjectFilter
    ? topics.filter(t => t.subject === subjectFilter)
    : topics;

  const sections = [
    { key: 'concepts', label: 'Core Concepts', count: selectedUnit?.concept_core_block?.length || 0 },
    { key: 'comparisons', label: 'Comparison Tables', count: selectedUnit?.comparison_tables?.length || 0 },
    { key: 'clinical', label: 'Clinical Scenarios', count: selectedUnit?.clinical_scenarios?.length || 0 },
    { key: 'numerical', label: 'Recall Points', count: selectedUnit?.numerical_recall_points?.length || 0 },
    { key: 'traps', label: 'Trap Patterns', count: selectedUnit?.trap_patterns?.length || 0 }
  ];

  const renderConceptCoreBlock = () => {
    const concepts = selectedUnit?.concept_core_block || [];
    if (concepts.length === 0) return <p className={styles.emptyText}>No core concepts generated.</p>;

    return (
      <div className={styles.conceptGrid}>
        {concepts.map((c, idx) => (
          <div key={idx} className={`${styles.conceptCard} ${c.high_yield ? styles.conceptHighYield : ''}`}>
            <div className={styles.conceptHeader}>
              <span className={styles.conceptType}>{c.type}</span>
              {c.high_yield && <span className={styles.highYieldBadge}>High Yield</span>}
            </div>
            <h3 className={styles.conceptTitle}>{c.title}</h3>
            <p className={styles.conceptContent}>{c.content}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderComparisonTables = () => {
    const tables = selectedUnit?.comparison_tables || [];
    if (tables.length === 0) return <p className={styles.emptyText}>No comparison tables generated.</p>;

    return (
      <div className={styles.tablesContainer}>
        {tables.map((table, idx) => (
          <div key={idx} className={styles.comparisonTableCard}>
            <h3 className={styles.compTableTitle}>{table.title}</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.compTable}>
                <thead>
                  <tr>
                    <th className={styles.compTh}>Feature</th>
                    {(table.columns || []).map((col, ci) => (
                      <th key={ci} className={styles.compTh}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(table.rows || []).map((row, ri) => (
                    <tr key={ri}>
                      <td className={`${styles.compTd} ${styles.compFeature}`}>{row.feature}</td>
                      {(row.values || []).map((val, vi) => (
                        <td key={vi} className={styles.compTd}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderClinicalScenarios = () => {
    const scenarios = selectedUnit?.clinical_scenarios || [];
    if (scenarios.length === 0) return <p className={styles.emptyText}>No clinical scenarios generated.</p>;

    return (
      <div className={styles.scenarioList}>
        {scenarios.map((s, idx) => (
          <div key={idx} className={styles.scenarioCard}>
            <div className={styles.scenarioNumber}>Case {idx + 1}</div>
            <div className={styles.scenarioBody}>
              <p className={styles.scenarioText}>{s.scenario}</p>
              <div className={styles.scenarioMeta}>
                <div className={styles.scenarioField}>
                  <span className={styles.scenarioLabel}>Key Concept:</span>
                  <span className={styles.scenarioValue}>{s.key_concept}</span>
                </div>
                <div className={styles.scenarioField}>
                  <span className={styles.scenarioLabel}>Expected Answer:</span>
                  <span className={styles.scenarioValue}>{s.expected_answer}</span>
                </div>
                <div className={styles.scenarioTeachingPoint}>
                  <span className={styles.tpIcon}>💡</span> {s.teaching_point}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderNumericalRecall = () => {
    const points = selectedUnit?.numerical_recall_points || [];
    if (points.length === 0) return <p className={styles.emptyText}>No numerical recall points generated.</p>;

    return (
      <div className={styles.recallGrid}>
        {points.map((p, idx) => (
          <div key={idx} className={styles.recallCard}>
            <div className={styles.recallFact}>{p.fact}</div>
            <div className={styles.recallContext}>{p.context}</div>
            {p.mnemonic && (
              <div className={styles.recallMnemonic}>
                <span className={styles.mnemonicIcon}>🧠</span> {p.mnemonic}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderTrapPatterns = () => {
    const traps = selectedUnit?.trap_patterns || [];
    if (traps.length === 0) return <p className={styles.emptyText}>No trap patterns identified.</p>;

    return (
      <div className={styles.trapList}>
        {traps.map((t, idx) => (
          <div key={idx} className={styles.trapCard}>
            <div className={styles.trapHeader}>
              <span className={styles.trapIcon}>⚠️</span>
              <span className={styles.trapSubtopic}>{t.related_subtopic}</span>
            </div>
            <div className={styles.trapDescription}>{t.trap}</div>
            <div className={styles.trapDetails}>
              <div className={styles.trapDetail}>
                <span className={styles.trapDetailLabel}>Why tempting:</span>
                <span>{t.why_tempting}</span>
              </div>
              <div className={styles.trapDetail}>
                <span className={styles.trapDetailLabel}>Correct approach:</span>
                <span className={styles.trapCorrect}>{t.correct_approach}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className={styles.loading}>Loading teaching units...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        {selectedUnit ? (
          <>
            <div className={styles.unitHeader}>
              <button className={styles.backButton} onClick={() => setSelectedUnit(null)}>← Back to Topics</button>
              <div>
                <h1 className={styles.unitTitle}>{selectedUnit.topic}</h1>
                <p className={styles.unitSubject}>{selectedUnit.subject}</p>
              </div>
              <button
                className={styles.regenerateButton}
                onClick={handleRegenerate}
                disabled={generating}
              >
                {generating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.sectionTabs}>
              {sections.map(s => (
                <button
                  key={s.key}
                  className={`${styles.sectionTab} ${activeSection === s.key ? styles.sectionTabActive : ''}`}
                  onClick={() => setActiveSection(s.key)}
                >
                  {s.label} <span className={styles.sectionCount}>({s.count})</span>
                </button>
              ))}
            </div>

            <div className={styles.sectionContent}>
              {activeSection === 'concepts' && renderConceptCoreBlock()}
              {activeSection === 'comparisons' && renderComparisonTables()}
              {activeSection === 'clinical' && renderClinicalScenarios()}
              {activeSection === 'numerical' && renderNumericalRecall()}
              {activeSection === 'traps' && renderTrapPatterns()}
            </div>

            {selectedUnit.generated_by && (
              <div className={styles.generatedMeta}>
                Generated by {selectedUnit.generated_by} on {new Date(selectedUnit.generated_at).toLocaleDateString()}
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className={styles.title}>Teaching Units</h1>
            <p className={styles.subtitle}>Structured learning blocks generated from PYQ analysis</p>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.filterRow}>
              <select
                className={styles.filterSelect}
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {generating && (
              <div className={styles.generatingOverlay}>
                <div className={styles.generatingSpinner}></div>
                <p>Generating teaching unit...</p>
              </div>
            )}

            <div className={styles.topicGrid}>
              {filteredTopics.map((t, idx) => (
                <div
                  key={`${t.subject}-${t.topic}-${idx}`}
                  className={`${styles.topicCard} ${t.has_teaching_unit ? styles.topicCardGenerated : ''}`}
                  onClick={() => t.has_teaching_unit ? viewUnit(t.subject, t.topic) : loadOrGenerate(t.subject, t.topic)}
                >
                  <div className={styles.topicCardHeader}>
                    <h3 className={styles.topicCardTitle}>{t.topic}</h3>
                    {t.has_teaching_unit && <span className={styles.generatedBadge}>Generated</span>}
                  </div>
                  <p className={styles.topicCardSubject}>{t.subject}</p>
                  <div className={styles.topicCardStats}>
                    <span>{t.question_count} questions</span>
                    {t.core_count > 0 && <span className={styles.coreTag}>{t.core_count} core</span>}
                  </div>
                  <div className={styles.topicCardAction}>
                    {t.has_teaching_unit ? 'View Unit →' : 'Generate Unit →'}
                  </div>
                </div>
              ))}
            </div>

            {filteredTopics.length === 0 && (
              <div className={styles.emptyState}>
                <p>No topics found. Upload PYQ PDFs to create the question bank first.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TeachingUnitsPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <TeachingUnitsContent />
      </div>
    </ProtectedRoute>
  );
}

