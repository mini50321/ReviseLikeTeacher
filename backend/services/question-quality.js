const { db } = require('../db');

async function getQuestionBankHealth() {
  const totalQ = await db.query(`SELECT COUNT(*) as count FROM question WHERE status = 'active'`);
  const byType = await db.query(`SELECT type, COUNT(*) as count FROM question WHERE status = 'active' GROUP BY type`);
  const bySubject = await db.query(
    `SELECT subject, COUNT(*) as count FROM question WHERE status = 'active' GROUP BY subject ORDER BY count DESC`
  );
  const byYield = await db.query(
    `SELECT yield_category, COUNT(*) as count FROM question WHERE status = 'active' AND yield_category IS NOT NULL GROUP BY yield_category`
  );
  const noYield = await db.query(
    `SELECT COUNT(*) as count FROM question WHERE status = 'active' AND (yield_category IS NULL OR yield_category = '')`
  );
  const withTraps = await db.query(
    `SELECT COUNT(*) as count FROM question WHERE status = 'active' AND trap_pattern IS NOT NULL AND trap_pattern != ''`
  );
  const withDistractors = await db.query(
    `SELECT COUNT(*) as count FROM question WHERE status = 'active' AND distractor_analysis IS NOT NULL AND distractor_analysis != ''`
  );
  const withConceptTags = await db.query(
    `SELECT COUNT(*) as count FROM question WHERE status = 'active' AND concept_tags IS NOT NULL AND concept_tags != ''`
  );

  const total = totalQ.rows[0]?.count || 0;

  return {
    total_questions: total,
    by_type: byType.rows.reduce((acc, r) => { acc[r.type] = r.count; return acc; }, {}),
    by_subject: bySubject.rows,
    yield_coverage: {
      by_category: byYield.rows.reduce((acc, r) => { acc[r.yield_category] = r.count; return acc; }, {}),
      unclassified: noYield.rows[0]?.count || 0,
      classified_pct: total > 0 ? (((total - (noYield.rows[0]?.count || 0)) / total) * 100).toFixed(1) : 0
    },
    enrichment: {
      with_trap_pattern: withTraps.rows[0]?.count || 0,
      with_distractor_analysis: withDistractors.rows[0]?.count || 0,
      with_concept_tags: withConceptTags.rows[0]?.count || 0,
      trap_pct: total > 0 ? ((withTraps.rows[0]?.count / total) * 100).toFixed(1) : 0,
      distractor_pct: total > 0 ? ((withDistractors.rows[0]?.count / total) * 100).toFixed(1) : 0,
      concept_tags_pct: total > 0 ? ((withConceptTags.rows[0]?.count / total) * 100).toFixed(1) : 0
    }
  };
}

async function getTopicCompleteness() {
  const topics = await db.query(
    `SELECT subject, topic,
       COUNT(*) as total,
       SUM(CASE WHEN type = 'mcq' THEN 1 ELSE 0 END) as mcq_count,
       SUM(CASE WHEN type = 'saq' THEN 1 ELSE 0 END) as saq_count,
       SUM(CASE WHEN type = 'laq' THEN 1 ELSE 0 END) as laq_count,
       SUM(CASE WHEN yield_category = 'core' THEN 1 ELSE 0 END) as core_count,
       SUM(CASE WHEN yield_category = 'frequent' THEN 1 ELSE 0 END) as frequent_count,
       SUM(CASE WHEN yield_category = 'occasional' THEN 1 ELSE 0 END) as occasional_count,
       SUM(CASE WHEN yield_category = 'rare' THEN 1 ELSE 0 END) as rare_count,
       SUM(CASE WHEN trap_pattern IS NOT NULL AND trap_pattern != '' THEN 1 ELSE 0 END) as trap_count,
       SUM(CASE WHEN cognitive_focus = 'factual' THEN 1 ELSE 0 END) as factual_count,
       SUM(CASE WHEN cognitive_focus = 'conceptual' THEN 1 ELSE 0 END) as conceptual_count,
       SUM(CASE WHEN cognitive_focus = 'clinical' THEN 1 ELSE 0 END) as clinical_count
     FROM question WHERE status = 'active'
     GROUP BY subject, topic
     ORDER BY subject, topic`
  );

  return topics.rows.map(t => {
    const mcqCount = t.mcq_count || 0;
    const coreFreq = (t.core_count || 0) + (t.frequent_count || 0);
    const coreFreqPct = mcqCount > 0 ? ((coreFreq / mcqCount) * 100).toFixed(1) : 0;
    const trapPct = mcqCount > 0 ? (((t.trap_count || 0) / mcqCount) * 100).toFixed(1) : 0;
    const factual = t.factual_count || 0;
    const clinical = t.clinical_count || 0;
    const conceptual = t.conceptual_count || 0;
    const totalCog = factual + clinical + conceptual;
    const balanceScore = totalCog > 0
      ? (100 - Math.abs(50 - ((clinical + conceptual) / totalCog * 100))).toFixed(0)
      : 0;

    const issues = [];
    if (mcqCount < 8) issues.push('insufficient_mcqs');
    if ((t.saq_count || 0) === 0) issues.push('no_saqs');
    if ((t.laq_count || 0) === 0) issues.push('no_laqs');
    if (parseFloat(coreFreqPct) < 70) issues.push('low_core_frequent');
    if ((t.trap_count || 0) < 1) issues.push('no_trap_questions');
    if (parseFloat(balanceScore) < 40) issues.push('poor_cognitive_balance');
    if ((t.core_count || 0) === 0) issues.push('no_core_questions');

    let readiness = 'ready';
    if (issues.length >= 4) readiness = 'critical';
    else if (issues.length >= 2) readiness = 'needs_work';
    else if (issues.length >= 1) readiness = 'minor_gaps';

    return {
      subject: t.subject,
      topic: t.topic,
      total: t.total,
      mcq_count: mcqCount,
      saq_count: t.saq_count || 0,
      laq_count: t.laq_count || 0,
      core_frequent_pct: parseFloat(coreFreqPct),
      trap_coverage_pct: parseFloat(trapPct),
      cognitive_balance: parseFloat(balanceScore),
      factual_count: factual,
      clinical_count: clinical,
      conceptual_count: conceptual,
      yield: {
        core: t.core_count || 0,
        frequent: t.frequent_count || 0,
        occasional: t.occasional_count || 0,
        rare: t.rare_count || 0
      },
      issues,
      readiness
    };
  });
}

async function validateMCQSet(subject, topic) {
  const mcqs = await db.query(
    `SELECT id, stem, difficulty, yield_category, cognitive_focus, trap_pattern,
            previous_year_tags, distractor_analysis, concept_tags
     FROM question
     WHERE subject = $1 AND topic = $2 AND type = 'mcq' AND status = 'active'`,
    [subject, topic]
  );

  if (mcqs.rows.length === 0) {
    return { valid: false, errors: ['No MCQs found for this topic'], rules: {} };
  }

  const total = mcqs.rows.length;
  const coreFreq = mcqs.rows.filter(q =>
    q.yield_category === 'core' || q.yield_category === 'frequent'
  ).length;
  const coreFreqPct = (coreFreq / total) * 100;

  const trapQuestions = mcqs.rows.filter(q =>
    q.trap_pattern && q.trap_pattern !== '' && q.trap_pattern !== 'null'
  ).length;

  const factual = mcqs.rows.filter(q => q.cognitive_focus === 'factual').length;
  const clinical = mcqs.rows.filter(q => q.cognitive_focus === 'clinical').length;
  const conceptual = mcqs.rows.filter(q => q.cognitive_focus === 'conceptual').length;

  const yearTags = mcqs.rows
    .map(q => safeJsonParse(q.previous_year_tags, []))
    .flat()
    .filter(Boolean);
  const uniqueYears = [...new Set(yearTags)];

  const rules = {
    rule_1_year_mixing: {
      label: 'Mix years randomly (avoid pattern memory)',
      passed: uniqueYears.length >= 2,
      detail: `${uniqueYears.length} unique years represented`,
      years: uniqueYears.sort()
    },
    rule_2_core_frequent: {
      label: '≥70% from Core + Frequent zones',
      passed: coreFreqPct >= 70,
      detail: `${coreFreqPct.toFixed(1)}% from Core+Frequent (${coreFreq}/${total})`,
      value: parseFloat(coreFreqPct.toFixed(1)),
      threshold: 70
    },
    rule_3_trap_questions: {
      label: 'Include 1–2 trap-heavy questions',
      passed: trapQuestions >= 1,
      detail: `${trapQuestions} trap questions found`,
      value: trapQuestions
    },
    rule_4_cognitive_balance: {
      label: 'Balance factual recall and clinical reasoning',
      passed: factual > 0 && (clinical + conceptual) > 0,
      detail: `Factual: ${factual}, Clinical: ${clinical}, Conceptual: ${conceptual}`,
      breakdown: { factual, clinical, conceptual }
    }
  };

  const passedCount = Object.values(rules).filter(r => r.passed).length;
  const errors = Object.values(rules).filter(r => !r.passed).map(r => r.label);

  return {
    valid: passedCount === 4,
    score: Math.round((passedCount / 4) * 100),
    total_mcqs: total,
    passed_rules: passedCount,
    total_rules: 4,
    errors,
    rules
  };
}

async function getSubjectQualitySummary() {
  const subjects = await db.query(
    `SELECT subject,
       COUNT(*) as total,
       SUM(CASE WHEN type = 'mcq' THEN 1 ELSE 0 END) as mcq_count,
       SUM(CASE WHEN type = 'saq' THEN 1 ELSE 0 END) as saq_count,
       SUM(CASE WHEN type = 'laq' THEN 1 ELSE 0 END) as laq_count,
       COUNT(DISTINCT topic) as topic_count,
       SUM(CASE WHEN yield_category IN ('core', 'frequent') THEN 1 ELSE 0 END) as core_freq,
       SUM(CASE WHEN trap_pattern IS NOT NULL AND trap_pattern != '' THEN 1 ELSE 0 END) as enriched_traps,
       SUM(CASE WHEN distractor_analysis IS NOT NULL AND distractor_analysis != '' THEN 1 ELSE 0 END) as enriched_distractors
     FROM question WHERE status = 'active'
     GROUP BY subject ORDER BY subject`
  );

  return subjects.rows.map(s => {
    const mcq = s.mcq_count || 0;
    const coreFreqPct = mcq > 0 ? (((s.core_freq || 0) / mcq) * 100).toFixed(1) : 0;
    const enrichmentPct = s.total > 0
      ? ((((s.enriched_traps || 0) + (s.enriched_distractors || 0)) / (s.total * 2)) * 100).toFixed(1)
      : 0;

    let health = 'good';
    if (mcq < 20 || parseFloat(coreFreqPct) < 50) health = 'poor';
    else if (mcq < 50 || parseFloat(coreFreqPct) < 70) health = 'fair';

    return {
      subject: s.subject,
      total: s.total,
      mcq_count: mcq,
      saq_count: s.saq_count || 0,
      laq_count: s.laq_count || 0,
      topic_count: s.topic_count || 0,
      core_frequent_pct: parseFloat(coreFreqPct),
      enrichment_pct: parseFloat(enrichmentPct),
      health
    };
  });
}

async function getQualityIssues() {
  const completeness = await getTopicCompleteness();
  const critical = completeness.filter(t => t.readiness === 'critical');
  const needsWork = completeness.filter(t => t.readiness === 'needs_work');

  const lowCorePct = completeness.filter(t => t.core_frequent_pct < 70 && t.mcq_count > 0);
  const noTraps = completeness.filter(t => t.trap_coverage_pct === 0 && t.mcq_count >= 5);
  const noSAQs = completeness.filter(t => t.saq_count === 0 && t.mcq_count >= 5);
  const noLAQs = completeness.filter(t => t.laq_count === 0 && t.mcq_count >= 5);
  const insufficientMCQs = completeness.filter(t => t.mcq_count < 8 && t.mcq_count > 0);

  return {
    summary: {
      total_topics: completeness.length,
      ready: completeness.filter(t => t.readiness === 'ready').length,
      minor_gaps: completeness.filter(t => t.readiness === 'minor_gaps').length,
      needs_work: needsWork.length,
      critical: critical.length
    },
    issues: {
      low_core_frequent: lowCorePct.map(t => ({ subject: t.subject, topic: t.topic, value: t.core_frequent_pct })),
      no_trap_questions: noTraps.map(t => ({ subject: t.subject, topic: t.topic, mcq_count: t.mcq_count })),
      no_saqs: noSAQs.map(t => ({ subject: t.subject, topic: t.topic })),
      no_laqs: noLAQs.map(t => ({ subject: t.subject, topic: t.topic })),
      insufficient_mcqs: insufficientMCQs.map(t => ({ subject: t.subject, topic: t.topic, count: t.mcq_count }))
    }
  };
}

function safeJsonParse(str, fallback) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || fallback);
  } catch {
    return fallback;
  }
}

module.exports = {
  getQuestionBankHealth,
  getTopicCompleteness,
  validateMCQSet,
  getSubjectQualitySummary,
  getQualityIssues
};

