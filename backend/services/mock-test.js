const { db } = require('../db');

const NEETPG_CONFIG = {
  total_questions: 200,
  duration_minutes: 210,
  subjects_distribution: {
    'General Medicine': 25,
    'General Surgery': 15,
    'Obstetrics & Gynaecology': 15,
    'Paediatrics': 12,
    'Pathology': 15,
    'Pharmacology': 15,
    'Anatomy': 12,
    'Physiology': 12,
    'Biochemistry': 10,
    'Microbiology': 12,
    'Community Medicine': 10,
    'Forensic Medicine': 5,
    'Ophthalmology': 5,
    'ENT': 5,
    'Orthopaedics': 5,
    'Dermatology': 3,
    'Psychiatry': 3,
    'Anaesthesia': 3,
    'Radiology': 3
  }
};

async function generateMockTest(userId, options = {}) {
  const totalQuestions = options.total_questions || NEETPG_CONFIG.total_questions;
  const duration = options.duration_minutes || NEETPG_CONFIG.duration_minutes;

  const profileResult = await db.query(
    'SELECT selected_subjects FROM userprofile WHERE user_id = $1',
    [userId]
  );

  let selectedSubjects = [];
  if (profileResult.rows.length > 0 && profileResult.rows[0].selected_subjects) {
    const raw = profileResult.rows[0].selected_subjects;
    selectedSubjects = typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  if (selectedSubjects.length === 0) {
    selectedSubjects = Object.keys(NEETPG_CONFIG.subjects_distribution);
  }

  const totalWeight = selectedSubjects.reduce((s, subj) => s + (NEETPG_CONFIG.subjects_distribution[subj] || 5), 0);

  const subjectCounts = {};
  let assigned = 0;
  for (const subj of selectedSubjects) {
    const weight = NEETPG_CONFIG.subjects_distribution[subj] || 5;
    const count = Math.max(1, Math.round((weight / totalWeight) * totalQuestions));
    subjectCounts[subj] = count;
    assigned += count;
  }

  const diff = totalQuestions - assigned;
  if (diff !== 0 && selectedSubjects.length > 0) {
    subjectCounts[selectedSubjects[0]] = Math.max(1, subjectCounts[selectedSubjects[0]] + diff);
  }

  const allQuestionIds = [];
  const subjectActual = {};

  for (const subj of selectedSubjects) {
    const needed = subjectCounts[subj] || 1;

    const coreResult = await db.query(
      `SELECT id FROM question
       WHERE subject = $1 AND type = 'mcq' AND status = 'active'
         AND yield_category IN ('core', 'frequent')
       ORDER BY RANDOM()
       LIMIT $2`,
      [subj, Math.ceil(needed * 0.7)]
    );

    const coreIds = coreResult.rows.map(r => r.id);
    const remaining = needed - coreIds.length;

    let otherIds = [];
    if (remaining > 0) {
      const otherResult = await db.query(
        `SELECT id FROM question
         WHERE subject = $1 AND type = 'mcq' AND status = 'active'
           AND id NOT IN (${coreIds.map((_, i) => `$${i + 2}`).join(',') || "''"})
         ORDER BY RANDOM()
         LIMIT $${coreIds.length + 2}`,
        [subj, ...coreIds, remaining]
      );
      otherIds = otherResult.rows.map(r => r.id);
    }

    const subjectIds = [...coreIds, ...otherIds];
    allQuestionIds.push(...subjectIds);
    subjectActual[subj] = subjectIds.length;
  }

  if (allQuestionIds.length < 10) {
    const fillResult = await db.query(
      `SELECT id FROM question WHERE type = 'mcq' AND status = 'active' ORDER BY RANDOM() LIMIT $1`,
      [totalQuestions]
    );
    allQuestionIds.length = 0;
    allQuestionIds.push(...fillResult.rows.map(r => r.id));
  }

  for (let i = allQuestionIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allQuestionIds[i], allQuestionIds[j]] = [allQuestionIds[j], allQuestionIds[i]];
  }

  const mockId = db.generateUUID();
  const title = options.title || `Mock Test — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  await db.query(
    `INSERT INTO mock_test (id, user_id, title, subjects, total_questions, duration_minutes, question_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')`,
    [
      mockId,
      userId,
      title,
      JSON.stringify(selectedSubjects),
      allQuestionIds.length,
      duration,
      JSON.stringify(allQuestionIds)
    ]
  );

  return {
    id: mockId,
    title,
    total_questions: allQuestionIds.length,
    duration_minutes: duration,
    subjects: selectedSubjects,
    subject_distribution: subjectActual,
    status: 'created'
  };
}

async function startMockTest(mockId, userId) {
  const result = await db.query(
    `SELECT * FROM mock_test WHERE id = $1 AND user_id = $2`,
    [mockId, userId]
  );

  if (result.rows.length === 0) return null;

  const mock = result.rows[0];
  if (mock.status !== 'created') {
    return { error: 'Test already started or completed', status: mock.status };
  }

  await db.query(
    `UPDATE mock_test SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [mockId]
  );

  const questionIds = JSON.parse(mock.question_ids || '[]');

  const questions = [];
  for (let i = 0; i < questionIds.length; i++) {
    const qResult = await db.query(
      `SELECT id, stem, subject, topic, subtopic, difficulty, options FROM question WHERE id = $1`,
      [questionIds[i]]
    );
    if (qResult.rows.length > 0) {
      const q = qResult.rows[0];
      questions.push({
        index: i,
        id: q.id,
        stem: q.stem,
        subject: q.subject,
        topic: q.topic,
        subtopic: q.subtopic,
        difficulty: q.difficulty,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
      });
    }
  }

  return {
    id: mockId,
    title: mock.title,
    total_questions: questions.length,
    duration_minutes: mock.duration_minutes,
    started_at: new Date().toISOString(),
    questions
  };
}

async function submitMockTest(mockId, userId, answers) {
  const result = await db.query(
    `SELECT * FROM mock_test WHERE id = $1 AND user_id = $2`,
    [mockId, userId]
  );

  if (result.rows.length === 0) return null;

  const mock = result.rows[0];
  if (mock.status !== 'in_progress') {
    return { error: 'Test not in progress', status: mock.status };
  }

  const questionIds = JSON.parse(mock.question_ids || '[]');

  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const subjectStats = {};
  const topicStats = {};
  const detailedResults = [];

  for (const qId of questionIds) {
    const qResult = await db.query(
      `SELECT id, stem, subject, topic, subtopic, correct_answer, options, difficulty,
              yield_category, concept_tags, trap_pattern
       FROM question WHERE id = $1`,
      [qId]
    );

    if (qResult.rows.length === 0) continue;

    const q = qResult.rows[0];
    const userAnswer = answers[qId] || null;
    const correctAnswer = q.correct_answer;
    const isCorrect = userAnswer && userAnswer === correctAnswer;
    const isSkipped = !userAnswer;

    if (isSkipped) skipped++;
    else if (isCorrect) correct++;
    else wrong++;

    if (!subjectStats[q.subject]) {
      subjectStats[q.subject] = { total: 0, correct: 0, wrong: 0, skipped: 0 };
    }
    subjectStats[q.subject].total++;
    if (isSkipped) subjectStats[q.subject].skipped++;
    else if (isCorrect) subjectStats[q.subject].correct++;
    else subjectStats[q.subject].wrong++;

    const topicKey = `${q.subject}::${q.topic}`;
    if (!topicStats[topicKey]) {
      topicStats[topicKey] = { subject: q.subject, topic: q.topic, total: 0, correct: 0, wrong: 0 };
    }
    topicStats[topicKey].total++;
    if (isCorrect) topicStats[topicKey].correct++;
    else if (!isSkipped) topicStats[topicKey].wrong++;

    detailedResults.push({
      question_id: qId,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      yield_category: q.yield_category,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      is_correct: isCorrect,
      is_skipped: isSkipped,
      concept_tags: q.concept_tags,
      trap_pattern: q.trap_pattern
    });
  }

  const totalAttempted = correct + wrong;
  const score = totalAttempted > 0 ? Math.round((correct / questionIds.length) * 100 * 100) / 100 : 0;

  const subjectBreakdown = Object.entries(subjectStats).map(([subj, stats]) => ({
    subject: subj,
    total: stats.total,
    correct: stats.correct,
    wrong: stats.wrong,
    skipped: stats.skipped,
    accuracy: stats.total - stats.skipped > 0
      ? Math.round((stats.correct / (stats.total - stats.skipped)) * 100 * 100) / 100
      : 0,
    score_pct: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100 * 100) / 100 : 0
  })).sort((a, b) => a.accuracy - b.accuracy);

  const weakTopics = Object.values(topicStats)
    .filter(t => t.total >= 2 && (t.correct / t.total) < 0.5)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
    .slice(0, 10);

  const strongTopics = Object.values(topicStats)
    .filter(t => t.total >= 2 && (t.correct / t.total) >= 0.8)
    .sort((a, b) => (b.correct / b.total) - (a.correct / a.total))
    .slice(0, 10);

  const trapFailures = detailedResults.filter(r => !r.is_correct && !r.is_skipped && r.trap_pattern);
  const coreFailures = detailedResults.filter(r => !r.is_correct && !r.is_skipped && r.yield_category === 'core');

  const remediation = {
    weak_subjects: subjectBreakdown.filter(s => s.accuracy < 50).map(s => s.subject),
    weak_topics: weakTopics.map(t => ({ subject: t.subject, topic: t.topic, accuracy: Math.round((t.correct / t.total) * 100) })),
    strong_topics: strongTopics.map(t => ({ subject: t.subject, topic: t.topic, accuracy: Math.round((t.correct / t.total) * 100) })),
    core_failures_count: coreFailures.length,
    trap_failures_count: trapFailures.length,
    priority_actions: []
  };

  if (coreFailures.length > 5) {
    remediation.priority_actions.push('Focus on Core subtopics — you missed ' + coreFailures.length + ' core questions');
  }
  if (trapFailures.length > 3) {
    remediation.priority_actions.push('Review trap patterns — you fell for ' + trapFailures.length + ' distractor traps');
  }
  if (skipped > questionIds.length * 0.2) {
    remediation.priority_actions.push('Reduce skipping — ' + skipped + ' questions left unanswered');
  }
  for (const ws of remediation.weak_subjects.slice(0, 3)) {
    remediation.priority_actions.push('Strengthen ' + ws + ' — below 50% accuracy');
  }
  for (const wt of remediation.weak_topics.slice(0, 3)) {
    remediation.priority_actions.push('Revise ' + wt.topic + ' (' + wt.subject + ') — ' + wt.accuracy + '% accuracy');
  }

  await db.query(
    `UPDATE mock_test SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      answers = $1,
      score = $2,
      correct_count = $3,
      wrong_count = $4,
      skipped_count = $5,
      subject_breakdown = $6,
      remediation_report = $7
     WHERE id = $8`,
    [
      JSON.stringify(answers),
      score,
      correct,
      wrong,
      skipped,
      JSON.stringify(subjectBreakdown),
      JSON.stringify(remediation),
      mockId
    ]
  );

  return {
    id: mockId,
    score,
    correct,
    wrong,
    skipped,
    total: questionIds.length,
    attempted: totalAttempted,
    subject_breakdown: subjectBreakdown,
    remediation
  };
}

async function getMockTestResult(mockId, userId) {
  const result = await db.query(
    `SELECT * FROM mock_test WHERE id = $1 AND user_id = $2`,
    [mockId, userId]
  );

  if (result.rows.length === 0) return null;

  const mock = result.rows[0];

  return {
    id: mock.id,
    title: mock.title,
    status: mock.status,
    total_questions: mock.total_questions,
    duration_minutes: mock.duration_minutes,
    score: mock.score,
    correct_count: mock.correct_count,
    wrong_count: mock.wrong_count,
    skipped_count: mock.skipped_count,
    started_at: mock.started_at,
    completed_at: mock.completed_at,
    subjects: JSON.parse(mock.subjects || '[]'),
    subject_breakdown: JSON.parse(mock.subject_breakdown || '[]'),
    remediation_report: JSON.parse(mock.remediation_report || '{}')
  };
}

async function listMockTests(userId) {
  const result = await db.query(
    `SELECT id, title, status, total_questions, duration_minutes, score, correct_count, wrong_count, skipped_count, started_at, completed_at, created_at
     FROM mock_test WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  generateMockTest,
  startMockTest,
  submitMockTest,
  getMockTestResult,
  listMockTests
};

