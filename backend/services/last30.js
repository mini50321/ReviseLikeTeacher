const { db } = require('../db');

const PHASE_CONFIG = [
  { day_start: 1, day_end: 10, phase: 'core_revision', label: 'Core Revision Sprint', focus: 'Revisit all weak + revision-required topics' },
  { day_start: 11, day_end: 20, phase: 'mcq_blitz', label: 'MCQ Blitz', focus: 'High-volume MCQ practice across all subjects' },
  { day_start: 21, day_end: 27, phase: 'mock_tests', label: 'Mock Test Week', focus: 'Full-length mock tests + targeted remediation' },
  { day_start: 28, day_end: 30, phase: 'rapid_recall', label: 'Final Rapid Recall', focus: 'Exam trigger notes + last-minute bullets only' }
];

async function generateLast30Plan(userId) {
  const profileResult = await db.query(
    'SELECT * FROM userprofile WHERE user_id = $1',
    [userId]
  );

  if (profileResult.rows.length === 0) return null;

  const profile = profileResult.rows[0];
  const examDate = profile.exam_date ? new Date(profile.exam_date) : null;
  const today = new Date();
  const dailyMinutes = profile.daily_study_minutes || 120;

  if (!examDate) {
    return { error: 'Set your exam date in onboarding to use Last 30 Days mode' };
  }

  const daysRemaining = Math.max(0, Math.ceil((examDate - today) / (1000 * 60 * 60 * 24)));
  const selectedSubjects = profile.selected_subjects
    ? (typeof profile.selected_subjects === 'string' ? JSON.parse(profile.selected_subjects) : profile.selected_subjects)
    : [];

  const masteryResult = await db.query(
    `SELECT subject, topic, mastery_level, mastery_status, competency_score, mcq_accuracy, core_coverage, next_revision_date
     FROM topicmastery WHERE user_id = $1 ORDER BY competency_score ASC`,
    [userId]
  );

  const allTopics = masteryResult.rows;
  const weakTopics = allTopics.filter(t => t.mastery_status === 'relearn_core');
  const revisionTopics = allTopics.filter(t => t.mastery_status === 'revision_required');
  const masteredTopics = allTopics.filter(t => t.mastery_status === 'mastered');

  const notesResult = await db.query(
    `SELECT subject, topic FROM exam_trigger_notes WHERE user_id = $1`,
    [userId]
  );
  const notesSet = new Set(notesResult.rows.map(r => `${r.subject}::${r.topic}`));

  const mockResult = await db.query(
    `SELECT id, score, correct_count, wrong_count, completed_at
     FROM mock_test WHERE user_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 5`,
    [userId]
  );

  const subjectStats = {};
  allTopics.forEach(t => {
    if (!subjectStats[t.subject]) {
      subjectStats[t.subject] = { total: 0, mastered: 0, weak: 0, revision: 0, avg_competency: 0, competency_sum: 0 };
    }
    subjectStats[t.subject].total++;
    subjectStats[t.subject].competency_sum += (t.competency_score || 0);
    if (t.mastery_status === 'mastered') subjectStats[t.subject].mastered++;
    else if (t.mastery_status === 'relearn_core') subjectStats[t.subject].weak++;
    else if (t.mastery_status === 'revision_required') subjectStats[t.subject].revision++;
  });

  Object.values(subjectStats).forEach(s => {
    s.avg_competency = s.total > 0 ? Math.round((s.competency_sum / s.total) * 100) / 100 : 0;
  });

  const weakSubjects = Object.entries(subjectStats)
    .filter(([_, s]) => s.avg_competency < 50 || s.weak > s.mastered)
    .sort(([_, a], [__, b]) => a.avg_competency - b.avg_competency)
    .map(([subj]) => subj);

  let currentPhaseIndex = 0;
  if (daysRemaining <= 3) currentPhaseIndex = 3;
  else if (daysRemaining <= 10) currentPhaseIndex = 2;
  else if (daysRemaining <= 20) currentPhaseIndex = 1;

  const currentPhase = PHASE_CONFIG[currentPhaseIndex];
  const dayInPhase = Math.max(1, (currentPhase.day_end - currentPhase.day_start + 1) - (daysRemaining - currentPhase.day_start) + 1);

  const dailyPlan = buildDailyTasks(currentPhase.phase, {
    weakTopics,
    revisionTopics,
    masteredTopics,
    allTopics,
    dailyMinutes,
    dayInPhase,
    notesSet,
    selectedSubjects,
    subjectStats
  });

  const countdown = [];
  for (let d = 0; d < Math.min(daysRemaining, 30); d++) {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() + d);
    const dayNum = 30 - daysRemaining + d + 1;
    let phase = PHASE_CONFIG[0];
    for (const p of PHASE_CONFIG) {
      if (dayNum >= p.day_start && dayNum <= p.day_end) { phase = p; break; }
    }
    countdown.push({
      date: dayDate.toISOString().split('T')[0],
      day_number: d + 1,
      days_to_exam: daysRemaining - d,
      phase: phase.phase,
      phase_label: phase.label
    });
  }

  return {
    exam_date: examDate.toISOString().split('T')[0],
    days_remaining: daysRemaining,
    daily_study_minutes: dailyMinutes,
    current_phase: {
      ...currentPhase,
      day_in_phase: dayInPhase
    },
    phases: PHASE_CONFIG,
    stats: {
      total_topics: allTopics.length,
      mastered: masteredTopics.length,
      revision_required: revisionTopics.length,
      weak: weakTopics.length,
      notes_generated: notesSet.size,
      notes_remaining: allTopics.length - notesSet.size,
      mock_tests_done: mockResult.rows.length,
      avg_mock_score: mockResult.rows.length > 0
        ? Math.round(mockResult.rows.reduce((s, m) => s + (m.score || 0), 0) / mockResult.rows.length * 100) / 100
        : 0,
      weak_subjects: weakSubjects,
      subject_breakdown: subjectStats
    },
    daily_plan: dailyPlan,
    countdown
  };
}

function buildDailyTasks(phase, ctx) {
  const tasks = [];
  let minutesLeft = ctx.dailyMinutes;

  if (phase === 'core_revision') {
    const topicsToRevise = [...ctx.weakTopics, ...ctx.revisionTopics].slice(0, 5);
    const perTopic = Math.max(15, Math.floor(minutesLeft * 0.6 / Math.max(topicsToRevise.length, 1)));

    for (const t of topicsToRevise) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perTopic, minutesLeft);
      tasks.push({
        type: 'revision',
        subject: t.subject,
        topic: t.topic,
        duration: mins,
        description: `Revise: ${t.topic}`,
        action_url: `/diagnostic?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}`,
        priority: t.mastery_status === 'relearn_core' ? 'critical' : 'high'
      });
      minutesLeft -= mins;
    }

    if (minutesLeft > 10) {
      tasks.push({
        type: 'practice',
        subject: null,
        topic: null,
        duration: minutesLeft,
        description: 'Mixed MCQ practice (weak subjects)',
        action_url: '/practice?mode=balanced',
        priority: 'medium'
      });
    }
  }

  if (phase === 'mcq_blitz') {
    const subjectSlots = ctx.selectedSubjects.slice(0, 6);
    const perSubject = Math.max(10, Math.floor(minutesLeft * 0.8 / Math.max(subjectSlots.length, 1)));

    for (const subj of subjectSlots) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perSubject, minutesLeft);
      tasks.push({
        type: 'mcq_blitz',
        subject: subj,
        topic: null,
        duration: mins,
        description: `MCQ Blitz: ${subj}`,
        action_url: `/practice?subject=${encodeURIComponent(subj)}&mode=rapid`,
        priority: ctx.subjectStats[subj]?.avg_competency < 50 ? 'critical' : 'medium'
      });
      minutesLeft -= mins;
    }

    if (minutesLeft > 10) {
      const needsNotes = ctx.allTopics.filter(t => !ctx.notesSet.has(`${t.subject}::${t.topic}`)).slice(0, 2);
      for (const t of needsNotes) {
        if (minutesLeft <= 0) break;
        tasks.push({
          type: 'notes',
          subject: t.subject,
          topic: t.topic,
          duration: Math.min(10, minutesLeft),
          description: `Generate exam notes: ${t.topic}`,
          action_url: `/exam-notes?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}&generate=true`,
          priority: 'low'
        });
        minutesLeft -= 10;
      }
    }
  }

  if (phase === 'mock_tests') {
    tasks.push({
      type: 'mock_test',
      subject: null,
      topic: null,
      duration: Math.min(210, minutesLeft),
      description: 'Full-length mock test',
      action_url: '/mock-tests',
      priority: 'critical'
    });
    minutesLeft -= 210;

    if (minutesLeft > 15) {
      tasks.push({
        type: 'remediation',
        subject: null,
        topic: null,
        duration: minutesLeft,
        description: 'Review mock test results + remediate weak areas',
        action_url: '/mock-tests',
        priority: 'high'
      });
    }
  }

  if (phase === 'rapid_recall') {
    const topTopics = [...ctx.weakTopics, ...ctx.revisionTopics, ...ctx.masteredTopics].slice(0, 10);
    const perTopic = Math.max(5, Math.floor(minutesLeft / Math.max(topTopics.length, 1)));

    for (const t of topTopics) {
      if (minutesLeft <= 0) break;
      const mins = Math.min(perTopic, minutesLeft);
      const hasNotes = ctx.notesSet.has(`${t.subject}::${t.topic}`);
      tasks.push({
        type: 'rapid_recall',
        subject: t.subject,
        topic: t.topic,
        duration: mins,
        description: `Rapid recall: ${t.topic}`,
        action_url: hasNotes
          ? `/exam-notes?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}`
          : `/crash-packs`,
        priority: t.mastery_status === 'relearn_core' ? 'critical' : 'medium'
      });
      minutesLeft -= mins;
    }
  }

  return tasks;
}

module.exports = { generateLast30Plan };

