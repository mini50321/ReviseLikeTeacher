const { db } = require('../db');

async function generateCrashPack(userId, subject) {
  const yieldResult = await db.query(
    `SELECT topic, subtopic, pyq_count, yield_category
     FROM subtopic_yield
     WHERE subject = $1 AND yield_category IN ('core', 'frequent')
     ORDER BY pyq_count DESC`,
    [subject]
  );

  const coreTopics = {};
  yieldResult.rows.forEach(r => {
    if (!coreTopics[r.topic]) {
      coreTopics[r.topic] = { topic: r.topic, subtopics: [], total_pyqs: 0 };
    }
    coreTopics[r.topic].subtopics.push({
      subtopic: r.subtopic,
      pyq_count: r.pyq_count,
      yield_category: r.yield_category
    });
    coreTopics[r.topic].total_pyqs += r.pyq_count || 0;
  });

  const topicList = Object.values(coreTopics).sort((a, b) => b.total_pyqs - a.total_pyqs);

  const masteryResult = await db.query(
    `SELECT topic, mastery_level, mastery_status, competency_score, mcq_accuracy, core_coverage
     FROM topicmastery
     WHERE user_id = $1 AND subject = $2`,
    [userId, subject]
  );

  const masteryMap = {};
  masteryResult.rows.forEach(r => {
    masteryMap[r.topic] = r;
  });

  const notesResult = await db.query(
    `SELECT topic, trigger_lines, differentiation_table, recall_bullets
     FROM exam_trigger_notes
     WHERE user_id = $1 AND subject = $2`,
    [userId, subject]
  );

  const notesMap = {};
  notesResult.rows.forEach(r => {
    notesMap[r.topic] = {
      trigger_lines: safeJsonParse(r.trigger_lines, []),
      differentiation_table: safeJsonParse(r.differentiation_table, null),
      recall_bullets: safeJsonParse(r.recall_bullets, [])
    };
  });

  const teachingResult = await db.query(
    `SELECT topic, concept_core_block, comparison_tables, trap_patterns
     FROM teaching_unit
     WHERE subject = $1`,
    [subject]
  );

  const teachingMap = {};
  teachingResult.rows.forEach(r => {
    teachingMap[r.topic] = {
      concept_core: safeJsonParse(r.concept_core_block, null),
      comparison_tables: safeJsonParse(r.comparison_tables, []),
      trap_patterns: safeJsonParse(r.trap_patterns, [])
    };
  });

  const mcqCountResult = await db.query(
    `SELECT topic, COUNT(*) as count
     FROM question
     WHERE subject = $1 AND type = 'mcq' AND status = 'active'
       AND yield_category IN ('core', 'frequent')
     GROUP BY topic
     ORDER BY count DESC`,
    [subject]
  );

  const mcqCountMap = {};
  mcqCountResult.rows.forEach(r => {
    mcqCountMap[r.topic] = parseInt(r.count);
  });

  const misconceptionResult = await db.query(
    `SELECT q.topic, a.misconception_type, COUNT(*) as cnt
     FROM attempt a
     JOIN question q ON a.question_id = q.id
     WHERE a.user_id = $1 AND q.subject = $2
       AND a.misconception_type IS NOT NULL AND a.misconception_type != ''
     GROUP BY q.topic, a.misconception_type
     ORDER BY cnt DESC`,
    [userId, subject]
  );

  const misconceptionMap = {};
  misconceptionResult.rows.forEach(r => {
    if (!misconceptionMap[r.topic]) misconceptionMap[r.topic] = [];
    misconceptionMap[r.topic].push({ type: r.misconception_type, count: parseInt(r.cnt) });
  });

  const topics = topicList.map(t => {
    const m = masteryMap[t.topic];
    const notes = notesMap[t.topic];
    const teaching = teachingMap[t.topic];
    const misconceptions = misconceptionMap[t.topic] || [];

    let status = 'not_started';
    let priority = 'high';
    if (m) {
      status = m.mastery_status || 'in_progress';
      if (m.mastery_status === 'mastered' && (m.competency_score || 0) >= 80) {
        priority = 'low';
      } else if (m.mastery_status === 'revision_required') {
        priority = 'medium';
      }
    }

    return {
      topic: t.topic,
      core_subtopics: t.subtopics,
      total_pyqs: t.total_pyqs,
      mcq_count: mcqCountMap[t.topic] || 0,
      mastery: m ? {
        level: m.mastery_level,
        status: m.mastery_status,
        competency: m.competency_score,
        mcq_accuracy: m.mcq_accuracy,
        core_coverage: m.core_coverage
      } : null,
      exam_notes: notes || null,
      teaching: teaching || null,
      misconceptions,
      priority,
      status
    };
  });

  const totalTopics = topics.length;
  const mastered = topics.filter(t => t.status === 'mastered').length;
  const weak = topics.filter(t => t.priority === 'high').length;
  const avgCompetency = topics.filter(t => t.mastery?.competency).length > 0
    ? Math.round(topics.reduce((s, t) => s + (t.mastery?.competency || 0), 0) / topics.filter(t => t.mastery?.competency).length * 100) / 100
    : 0;

  return {
    subject,
    generated_at: new Date().toISOString(),
    summary: {
      total_high_yield_topics: totalTopics,
      mastered_count: mastered,
      weak_count: weak,
      avg_competency: avgCompetency,
      total_core_mcqs: Object.values(mcqCountMap).reduce((s, c) => s + c, 0)
    },
    topics
  };
}

async function listSubjectsForCrashPack(userId) {
  const profileResult = await db.query(
    'SELECT selected_subjects FROM userprofile WHERE user_id = $1',
    [userId]
  );

  let subjects = [];
  if (profileResult.rows.length > 0 && profileResult.rows[0].selected_subjects) {
    const raw = profileResult.rows[0].selected_subjects;
    subjects = typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  const subjectSummaries = [];
  for (const subj of subjects) {
    const yieldCount = await db.query(
      `SELECT COUNT(*) as cnt FROM subtopic_yield WHERE subject = $1 AND yield_category IN ('core', 'frequent')`,
      [subj]
    );

    const masteryCount = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN mastery_status = 'mastered' THEN 1 ELSE 0 END) as mastered
       FROM topicmastery WHERE user_id = $1 AND subject = $2`,
      [userId, subj]
    );

    const mcqCount = await db.query(
      `SELECT COUNT(*) as cnt FROM question WHERE subject = $1 AND type = 'mcq' AND status = 'active' AND yield_category IN ('core', 'frequent')`,
      [subj]
    );

    subjectSummaries.push({
      subject: subj,
      high_yield_subtopics: parseInt(yieldCount.rows[0]?.cnt || 0),
      topics_covered: parseInt(masteryCount.rows[0]?.total || 0),
      topics_mastered: parseInt(masteryCount.rows[0]?.mastered || 0),
      core_mcqs_available: parseInt(mcqCount.rows[0]?.cnt || 0)
    });
  }

  return subjectSummaries;
}

function safeJsonParse(val, fallback) {
  if (!val) return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

module.exports = { generateCrashPack, listSubjectsForCrashPack };

