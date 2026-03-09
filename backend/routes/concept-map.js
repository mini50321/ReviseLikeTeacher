const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
const { scoreAnswerAgainstConcept } = require('../services/rubric-scorer');
const {
  buildMissedPointsQueue,
  getLeadingPromptForTier,
  getRecognitionForPoint,
  buildCompletionSummary,
  buildCompletionSummaryLines,
  pickMustRepeatMicroQuestion
} = require('../services/concept-map-session');
const { getRollingAccuracy, getSuggestedProfile } = require('../services/learner-profile');
const {
  getNextConcept,
  getFirstConcept,
  getPathway,
  getConceptWeight,
  setTopicPathwayOrder,
  resolveConceptId
} = require('../services/concept-map-pathway');
const {
  classifyStudentLevel,
  classifyStudentLevelFromAggregate
} = require('../services/student-level-classifier');
const { startConceptMapSessionFromDiagnostic } = require('../services/diagnostic-to-tutoring');
const {
  selectNextPrompt,
  getTunableConfig
} = require('../services/socratic-mcq-selector');
const {
  loadTutoringConfig,
  saveTutoringConfig,
  getSocraticMcqConfigFromTutoring
} = require('../services/tutoring-config');
const {
  importJsonlLines,
  listExamples,
  exportAsJsonl
} = require('../services/tutoring-training-examples');

async function setConceptMasteryNextDue(userId, conceptIds, daysFromNow = 2) {
  if (!Array.isArray(conceptIds) || conceptIds.length === 0) return;
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + daysFromNow);
  const nextDueStr = nextDue.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];
  for (const conceptId of conceptIds) {
    if (!conceptId) continue;
    const existing = await db.query(
      'SELECT id FROM concept_mastery WHERE user_id = $1 AND concept_id = $2',
      [userId, conceptId]
    );
    if (existing.rows && existing.rows.length > 0) {
      await db.query(
        'UPDATE concept_mastery SET next_due = $1, last_seen = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [nextDueStr, todayStr, existing.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO concept_mastery (id, user_id, concept_id, mastery, last_seen, next_due)
         VALUES ($1, $2, $3, 0, $4, $5)`,
        [db.generateUUID(), userId, conceptId, todayStr, nextDueStr]
      );
    }
  }
}

function parseJsonField(val, defaultValue = null) {
  if (val == null || val === '') return defaultValue;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return defaultValue;
  }
}

function serializeConcept(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id || null,
    name: row.name,
    display_order: row.display_order != null ? row.display_order : 0,
    concept_weight: row.concept_weight != null ? row.concept_weight : 1,
    prerequisite_concept_ids: parseJsonField(row.prerequisite_concept_ids, []),
    downstream_concept_ids: parseJsonField(row.downstream_concept_ids, []),
    section: row.section || null,
    chapter: row.chapter || null,
    main_topic: row.main_topic || null,
    subtopic: row.subtopic || null,
    must_know_points: parseJsonField(row.must_know_points, []),
    deep_points: parseJsonField(row.deep_points, []),
    traps: parseJsonField(row.traps, []),
    leading_questions: parseJsonField(row.leading_questions, []),
    example_phrases: parseJsonField(row.example_phrases, []),
    grading_rubric: parseJsonField(row.grading_rubric, []),
    micro_questions: parseJsonField(row.micro_questions, []),
    saqs: parseJsonField(row.saqs, []),
    mcqs: parseJsonField(row.mcqs, []),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/topics', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT DISTINCT subject, topic FROM topic_gross_prompt ORDER BY subject ASC, topic ASC'
    );
    const topics = (result.rows || []).map(r => ({ subject: r.subject, topic: r.topic }));
    res.json({ topics });
  } catch (error) {
    console.error('Concept map topics list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/next-concept', authenticate, async (req, res) => {
  try {
    const { concept_id } = req.query;
    if (!concept_id) {
      return res.status(400).json({ error: 'concept_id query param is required' });
    }
    const next = await getNextConcept(concept_id);
    res.json({ next_concept: next });
  } catch (error) {
    console.error('Next concept error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/first-concept', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.query;
    if (!subject) {
      return res.status(400).json({ error: 'subject query param is required' });
    }
    const first = await getFirstConcept(subject, topic || null);
    res.json({ first_concept: first });
  } catch (error) {
    console.error('First concept error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pathway', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;
    if (!subject) {
      return res.status(400).json({ error: 'subject query param is required' });
    }
    const pathway = await getPathway(subject);
    res.json({ pathway });
  } catch (error) {
    console.error('Pathway error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/concept-weight/:conceptId', authenticate, async (req, res) => {
  try {
    const { conceptId } = req.params;
    if (!conceptId) {
      return res.status(400).json({ error: 'conceptId is required' });
    }
    const weight = await getConceptWeight(conceptId);
    res.json({ concept_id: conceptId, weight });
  } catch (error) {
    console.error('Concept weight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/next-prompt', authenticate, async (req, res) => {
  try {
    const { concept_id, concept_map_id, current_point, student_level, probe_count = 0, leading_tier = 1, used_mcq_ids = [], config: bodyConfig } = req.body;
    const conceptRef = concept_id || concept_map_id;
    if (!conceptRef) {
      return res.status(400).json({ error: 'concept_id or concept_map_id is required' });
    }
    const row = await resolveConceptId(conceptRef);
    if (!row) return res.status(404).json({ error: 'Concept not found' });
    const concept = serializeConcept(row);
    const tutoringConfig = bodyConfig || getSocraticMcqConfigFromTutoring(await loadTutoringConfig());
    const result = selectNextPrompt({
      concept,
      currentPoint: current_point || null,
      studentLevel: student_level || 'average',
      probeCount: probe_count,
      leadingTier: leading_tier,
      usedMcqIds: Array.isArray(used_mcq_ids) ? used_mcq_ids : [],
      config: tutoringConfig
    });
    res.json({
      type: result.type,
      socratic_prompt: result.content,
      mcq: result.mcq
    });
  } catch (error) {
    console.error('Next prompt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/socratic-mcq-config', authenticate, async (req, res) => {
  try {
    const config = getTunableConfig();
    res.json({ config });
  } catch (error) {
    console.error('Socratic MCQ config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tutoring-config', authenticate, async (req, res) => {
  try {
    const config = await loadTutoringConfig();
    res.json({ config });
  } catch (error) {
    console.error('Tutoring config get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/training-examples/import', authenticate, requireAdmin, async (req, res) => {
  try {
    const { jsonl_content, concept_id, concept_map_id, subject, topic, student_level, source_file } = req.body;
    let lines = [];
    if (typeof jsonl_content === 'string') {
      lines = jsonl_content.split(/\n/).filter(Boolean);
    } else if (Array.isArray(jsonl_content)) {
      lines = jsonl_content.map(l => typeof l === 'string' ? l : JSON.stringify(l));
    } else {
      return res.status(400).json({ error: 'jsonl_content (string or array) required' });
    }
    const result = await importJsonlLines(lines, {
      conceptId: concept_id,
      conceptMapId: concept_map_id,
      subject,
      topic,
      studentLevel: student_level,
      sourceFile: source_file
    });
    res.json({ ...result });
  } catch (error) {
    console.error('Training examples import error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/training-examples', authenticate, async (req, res) => {
  try {
    const { concept_id, concept_map_id, subject, topic, student_level, limit } = req.query;
    const filters = {};
    if (concept_id) filters.concept_id = concept_id;
    if (concept_map_id) filters.concept_map_id = concept_map_id;
    if (subject) filters.subject = subject;
    if (topic) filters.topic = topic;
    if (student_level) filters.student_level = student_level;
    if (limit) filters.limit = parseInt(limit, 10) || 50;
    const examples = await listExamples(filters);
    res.json({ examples, count: examples.length });
  } catch (error) {
    console.error('Training examples list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/training-examples/export', authenticate, async (req, res) => {
  try {
    const { concept_id, concept_map_id, subject, topic, student_level } = req.query;
    const filters = {};
    if (concept_id) filters.concept_id = concept_id;
    if (concept_map_id) filters.concept_map_id = concept_map_id;
    if (subject) filters.subject = subject;
    if (topic) filters.topic = topic;
    if (student_level) filters.student_level = student_level;
    const jsonl = await exportAsJsonl(filters);
    res.set('Content-Type', 'application/x-ndjson');
    res.set('Content-Disposition', 'attachment; filename="tutoring-training.jsonl"');
    res.send(jsonl);
  } catch (error) {
    console.error('Training examples export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/tutoring-config', authenticate, requireAdmin, async (req, res) => {
  try {
    const params = req.body;
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Config object required' });
    }
    const config = await saveTutoringConfig(params);
    res.json({ config });
  } catch (error) {
    console.error('Tutoring config save error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/classify-level', authenticate, async (req, res) => {
  try {
    const { concept_id, concept_map_id, answer_text, learner_level = 'mid' } = req.body;
    const conceptRef = concept_id || concept_map_id;
    if (!conceptRef || answer_text == null) {
      return res.status(400).json({ error: 'concept_id or concept_map_id and answer_text are required' });
    }
    const row = await resolveConceptId(conceptRef);
    if (!row) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    const concept = serializeConcept(row);
    const level = ['top', 'mid', 'struggling'].includes(learner_level) ? learner_level : 'mid';
    const classification = classifyStudentLevel(concept, String(answer_text).trim(), level);
    res.json({
      concept_id: concept.id,
      student_level: classification.level,
      score_percent: classification.score_percent,
      misconception_count: classification.misconception_count,
      misconceptions: classification.misconceptions,
      points_hit: classification.points_hit,
      points_missed: classification.points_missed,
      points_total: classification.points_total,
      word_count: classification.word_count
    });
  } catch (error) {
    console.error('Classify level error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/topic-pathway-order', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topics } = req.body;
    if (!subject || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'subject and topics (array) are required' });
    }
    await setTopicPathwayOrder(subject, topics);
    res.json({ subject, topics });
  } catch (error) {
    console.error('Topic pathway order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.query;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic query params are required' });
    }
    const result = await db.query(
      `SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 ORDER BY display_order ASC, concept_key ASC`,
      [subject, topic]
    );
    const concepts = (result.rows || []).map(serializeConcept);
    res.json({ concepts });
  } catch (error) {
    console.error('Concept map list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/gross-prompt', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.query;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic query params are required' });
    }
    const result = await db.query(
      'SELECT id, subject, topic, prompt_text FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'No gross prompt defined for this topic' });
    }
    const row = result.rows[0];
    res.json({ id: row.id, subject: row.subject, topic: row.topic, prompt_text: row.prompt_text });
  } catch (error) {
    console.error('Gross prompt get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/gross-prompt', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, prompt_text } = req.body;
    if (!subject || !topic || prompt_text == null) {
      return res.status(400).json({ error: 'subject, topic, and prompt_text are required' });
    }
    const existing = await db.query(
      'SELECT id FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );
    const text = String(prompt_text).trim();
    if (existing.rows && existing.rows.length > 0) {
      await db.query(
        'UPDATE topic_gross_prompt SET prompt_text = $1 WHERE subject = $2 AND topic = $3',
        [text, subject, topic]
      );
      const updated = await db.query(
        'SELECT id, subject, topic, prompt_text, updated_at FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
        [subject, topic]
      );
      return res.json(updated.rows[0]);
    }
    const id = db.generateUUID();
    await db.query(
      'INSERT INTO topic_gross_prompt (id, subject, topic, prompt_text) VALUES ($1, $2, $3, $4)',
      [id, subject, topic, text]
    );
    const inserted = await db.query(
      'SELECT id, subject, topic, prompt_text, created_at, updated_at FROM topic_gross_prompt WHERE id = $1',
      [id]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    console.error('Gross prompt create/update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/gross-submit', authenticate, async (req, res) => {
  try {
    const { subject, topic, answer_text, learner_level = 'mid' } = req.body;
    if (!subject || !topic || answer_text == null) {
      return res.status(400).json({ error: 'subject, topic, and answer_text are required' });
    }
    const conceptsResult = await db.query(
      `SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 ORDER BY display_order ASC, concept_key ASC`,
      [subject, topic]
    );
    const concepts = (conceptsResult.rows || []).map(serializeConcept);
    if (concepts.length === 0) {
      return res.status(404).json({ error: 'No concepts found for this topic' });
    }
    const level = ['top', 'mid', 'struggling'].includes(learner_level) ? learner_level : 'mid';
    const answer = String(answer_text).trim();
    const conceptResults = [];
    let totalExpected = 0;
    let totalHit = 0;
    for (const concept of concepts) {
      const scoreResult = scoreAnswerAgainstConcept(concept, answer, level);
      totalExpected += scoreResult.pointsExpected;
      totalHit += scoreResult.numerator;
      conceptResults.push({
        concept_id: concept.id,
        concept_key: concept.concept_key,
        concept_name: concept.name,
        display_order: concept.display_order,
        score: scoreResult.score,
        scorePercent: scoreResult.scorePercent,
        pointsHit: scoreResult.pointsHit,
        pointsMissed: scoreResult.pointsMissed,
        pointsExpected: scoreResult.pointsExpected,
        pointsTotal: scoreResult.pointsTotal
      });
    }
    const overallScorePercent = totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0;
    let nextStep = null;
    for (const cr of conceptResults) {
      if (cr.pointsMissed && cr.pointsMissed.length > 0) {
        const concept = concepts.find(c => c.id === cr.concept_id);
        const firstMissed = cr.pointsMissed[0];
        const leadingQuestions = (concept && concept.leading_questions) || [];
        const firstLeading = Array.isArray(leadingQuestions) ? leadingQuestions.find(l => l && (l.tier === 1 || l.prompt)) : null;
        nextStep = {
          concept_id: cr.concept_id,
          concept_key: cr.concept_key,
          concept_name: cr.concept_name,
          point_id: firstMissed.id,
          point_label: firstMissed.label,
          point_description: firstMissed.description,
          leading_prompt: firstLeading ? (firstLeading.prompt || firstLeading) : null,
          leading_tier: firstLeading && firstLeading.tier != null ? firstLeading.tier : 1
        };
        break;
      }
    }
    const levelClassification = classifyStudentLevelFromAggregate(conceptResults, answer, concepts);

    res.json({
      subject,
      topic,
      learner_level: level,
      student_level: levelClassification.level,
      student_level_detail: {
        score_percent: levelClassification.score_percent,
        misconception_count: levelClassification.misconception_count,
        misconceptions: levelClassification.misconceptions
      },
      concept_results: conceptResults,
      aggregated: {
        total_points_expected: totalExpected,
        total_points_hit: totalHit,
        overall_score_percent: overallScorePercent,
        concepts_with_misses: conceptResults.filter(cr => cr.pointsMissed && cr.pointsMissed.length > 0).length
      },
      next_step: nextStep
    });
  } catch (error) {
    console.error('Gross submit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/session/start-from-diagnostic', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { diagnostic_id } = req.body;
    if (!diagnostic_id) {
      return res.status(400).json({ error: 'diagnostic_id is required' });
    }
    const result = await startConceptMapSessionFromDiagnostic(userId, diagnostic_id);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    res.status(201).json({
      session_id: result.session_id,
      subject: result.subject,
      topic: result.topic,
      student_level: result.student_level,
      prompt_text: result.prompt_text,
      aggregated: result.aggregated,
      next_step: result.next_step,
      completed: result.completed,
      auto_started: true
    });
  } catch (error) {
    console.error('Start from diagnostic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/session/start', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    let { subject, topic, answer_text, learner_level } = req.body;
    if (!subject || !topic || answer_text == null) {
      return res.status(400).json({ error: 'subject, topic, and answer_text are required' });
    }
    if (!learner_level || !['top', 'mid', 'struggling'].includes(learner_level)) {
      const profileResult = await db.query(
        'SELECT learner_profile FROM userprofile WHERE user_id = $1',
        [userId]
      );
      const savedProfile = (profileResult.rows && profileResult.rows[0]) ? profileResult.rows[0].learner_profile : null;
      if (savedProfile && ['top', 'mid', 'struggling'].includes(savedProfile)) {
        learner_level = savedProfile;
      } else {
        const { accuracy } = await getRollingAccuracy(userId, subject, topic);
        learner_level = getSuggestedProfile(accuracy);
      }
    }
    const conceptsResult = await db.query(
      `SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 ORDER BY display_order ASC, concept_key ASC`,
      [subject, topic]
    );
    const concepts = (conceptsResult.rows || []).map(serializeConcept);
    if (concepts.length === 0) {
      return res.status(404).json({ error: 'No concepts found for this topic' });
    }
    const level = ['top', 'mid', 'struggling'].includes(learner_level) ? learner_level : 'mid';
    const answer = String(answer_text).trim();
    const conceptResults = [];
    let totalExpected = 0;
    let totalHit = 0;
    for (const concept of concepts) {
      const scoreResult = scoreAnswerAgainstConcept(concept, answer, level);
      totalExpected += scoreResult.pointsExpected;
      totalHit += scoreResult.numerator;
      conceptResults.push({
        concept_id: concept.id,
        concept_key: concept.concept_key,
        concept_name: concept.name,
        display_order: concept.display_order,
        score: scoreResult.score,
        scorePercent: scoreResult.scorePercent,
        pointsHit: scoreResult.pointsHit,
        pointsMissed: scoreResult.pointsMissed,
        pointsExpected: scoreResult.pointsExpected,
        pointsTotal: scoreResult.pointsTotal
      });
    }
    const overallScorePercent = totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0;
    const missedQueue = buildMissedPointsQueue(conceptResults, concepts);
    const promptResult = await db.query(
      'SELECT prompt_text FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );
    const promptText = (promptResult.rows && promptResult.rows[0]) ? promptResult.rows[0].prompt_text : null;
    let timeLimitMinutes = 15;
    const profileRow = await db.query(
      'SELECT time_budget FROM userprofile WHERE user_id = $1',
      [userId]
    );
    if (profileRow.rows && profileRow.rows[0] && profileRow.rows[0].time_budget) {
      const budget = profileRow.rows[0].time_budget;
      if (budget === 'short') timeLimitMinutes = 10;
      else if (budget === 'long') timeLimitMinutes = 25;
      else timeLimitMinutes = 15;
    }
    const sessionId = db.generateUUID();
    let currentConceptId = null;
    let currentPointId = null;
    let leadingTier = 1;
    let leadingPrompt = null;
    if (missedQueue.length > 0) {
      const first = missedQueue[0];
      currentConceptId = first.concept_id;
      currentPointId = first.point_id;
      leadingPrompt = getLeadingPromptForTier(first.leading_questions, 1);
    }
    const levelClassification = classifyStudentLevelFromAggregate(conceptResults, answer, concepts);
    const snapshot = JSON.stringify({
      concept_results: conceptResults,
      missed_points_queue: missedQueue,
      concepts: concepts.map(c => ({
        id: c.id,
        concept_key: c.concept_key,
        name: c.name,
        leading_questions: c.leading_questions,
        micro_questions: c.micro_questions,
        mcqs: c.mcqs || []
      })),
      student_level: levelClassification.level
    });
    await db.query(
      `INSERT INTO concept_map_session (id, user_id, subject, topic, learner_level, snapshot, current_concept_id, current_point_id, probe_count, leading_tier, phase, completed_point_ids, time_limit_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'probing', $10, $11)`,
      [sessionId, userId, subject, topic, level, snapshot, currentConceptId, currentPointId, leadingTier, JSON.stringify([]), timeLimitMinutes]
    );
    const firstMissed = missedQueue[0];
    res.status(201).json({
      session_id: sessionId,
      subject,
      topic,
      learner_level: level,
      student_level: levelClassification.level,
      student_level_detail: {
        score_percent: levelClassification.score_percent,
        misconception_count: levelClassification.misconception_count,
        misconceptions: levelClassification.misconceptions
      },
      prompt_text: promptText,
      aggregated: {
        total_points_expected: totalExpected,
        total_points_hit: totalHit,
        overall_score_percent: overallScorePercent
      },
      concept_results: conceptResults,
      phase: 'probing',
      next_step: firstMissed ? {
        concept_id: currentConceptId,
        concept_key: firstMissed.concept_key,
        concept_name: firstMissed.concept_name,
        point_id: currentPointId,
        point_label: firstMissed.point_label,
        point_description: firstMissed.point_description,
        leading_prompt: leadingPrompt,
        leading_tier: 1
      } : null,
      completed: missedQueue.length === 0
    });
  } catch (error) {
    console.error('Session start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/session/:sessionId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const result = await db.query(
      'SELECT * FROM concept_map_session WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const row = result.rows[0];
    const snapshot = parseJsonField(row.snapshot, {});
    const completedIds = parseJsonField(row.completed_point_ids, []);
    const summaryPrompt = row.phase === 'summary_request'
      ? `Now summarize the full ${row.topic} in 4-5 exam sentences.`
      : null;

    let nextStep = null;
    if (row.phase === 'probing') {
      const missedQueue = snapshot.missed_points_queue || [];
      const conceptsData = snapshot.concepts || [];
      const remaining = missedQueue.filter(m => !completedIds.includes(`${m.concept_id}|${m.point_id}`));
      const currentItem = remaining[0];
      if (currentItem) {
        const tutoringConfig = getSocraticMcqConfigFromTutoring(await loadTutoringConfig());
        const studentLevel = snapshot.student_level || 'average';
        const conceptForPrompt = conceptsData.find(c => c.id === currentItem.concept_id);
        const probeCount = row.probe_count ?? 0;
        const leadingTier = row.leading_tier ?? 1;
        const selectorResult = selectNextPrompt({
          concept: conceptForPrompt || {},
          currentPoint: currentItem,
          studentLevel,
          probeCount,
          leadingTier,
          usedMcqIds: snapshot.used_mcq_ids || [],
          config: tutoringConfig
        });
        const leadingPrompt = selectorResult.type === 'mcq' && selectorResult.mcq
          ? (selectorResult.mcq.question || null)
          : (selectorResult.content || getLeadingPromptForTier(currentItem.leading_questions || [], leadingTier));
        nextStep = {
          concept_id: currentItem.concept_id,
          concept_key: currentItem.concept_key,
          concept_name: currentItem.concept_name,
          point_id: currentItem.point_id,
          point_label: currentItem.point_label,
          point_description: currentItem.point_description,
          leading_prompt: leadingPrompt,
          leading_tier: leadingTier,
          mcq: selectorResult.type === 'mcq' ? selectorResult.mcq : undefined
        };
      }
    }

    res.json({
      session_id: row.id,
      subject: row.subject,
      topic: row.topic,
      learner_level: row.learner_level,
      phase: row.phase,
      current_concept_id: row.current_concept_id,
      current_point_id: row.current_point_id,
      probe_count: row.probe_count,
      leading_tier: row.leading_tier,
      snapshot: snapshot,
      completed_point_ids: completedIds,
      summary_text: row.summary_text,
      summary_prompt: summaryPrompt,
      next_step: nextStep,
      missed_points_text: parseJsonField(row.missed_points_text, []),
      must_repeat_question: row.must_repeat_question,
      started_at: row.started_at,
      updated_at: row.updated_at
    });
  } catch (error) {
    console.error('Session get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/session/:sessionId/answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { answer_text } = req.body;
    if (answer_text == null) {
      return res.status(400).json({ error: 'answer_text is required' });
    }
    const sessionResult = await db.query(
      'SELECT * FROM concept_map_session WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (!sessionResult.rows || sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];
    if (session.phase === 'summary_request') {
      const snap = parseJsonField(session.snapshot, {});
      const conceptsData = snap.concepts || [];
      const lastConceptId = snap.primary_concept_id || (conceptsData[0] && conceptsData[0].id);
      const summaryText = String(answer_text || '').trim();
      let summaryScorePercent = 0;
      if (conceptsData.length > 0) {
        for (const c of conceptsData) {
          const fullConcept = await db.query('SELECT * FROM topic_concept WHERE id = $1', [c.id]);
          if (fullConcept.rows && fullConcept.rows.length > 0) {
            const conceptObj = serializeConcept(fullConcept.rows[0]);
            const sr = scoreAnswerAgainstConcept(conceptObj, summaryText, session.learner_level || 'mid');
            summaryScorePercent = Math.max(summaryScorePercent, sr.scorePercent);
          }
        }
      }

      // If the summary is too weak, stay in summary_request and ask the student to improve it.
      if (summaryScorePercent < 70) {
        return res.json({
          phase: 'summary_request',
          summary_requested: true,
          summary_score_percent: summaryScorePercent,
          message: 'Your summary is not strong enough yet. Focus on the core steps and key clinical points, then try again.'
        });
      }
      const conceptResults = snap.concept_results || [];
      const completedIds = parseJsonField(session.completed_point_ids, []);
      const summary = buildCompletionSummary(conceptResults, completedIds);
      const missedLabels = (snap.missed_points_queue || []).slice(0, 3).map(m => m.point_label || m.point_id);
      const mustRepeat = pickMustRepeatMicroQuestion(conceptResults, conceptsData);
      let nextConcept = null;
      if (lastConceptId) {
        nextConcept = await getNextConcept(lastConceptId);
      }
      await db.query(
        `UPDATE concept_map_session SET phase = 'completed', summary_text = $1, missed_points_text = $2, must_repeat_question = $3, current_concept_id = $4, current_point_id = $5 WHERE id = $6`,
        [summary, JSON.stringify(missedLabels), mustRepeat || '', null, null, sessionId]
      );
      const conceptIds = (conceptsData || []).map(c => c.id).filter(Boolean);
      await setConceptMasteryNextDue(userId, conceptIds);
      const summaryLines = buildCompletionSummaryLines(conceptResults);
      return res.json({
        phase: 'completed',
        summary_requested: true,
        summary_text: summary,
        summary_lines: summaryLines,
        summary_score_percent: summaryScorePercent,
        missed_points: missedLabels,
        must_repeat_question: mustRepeat,
        next_concept: nextConcept
      });
    }
    if (session.phase === 'completed') {
      const missed = parseJsonField(session.missed_points_text, []);
      return res.json({
        phase: 'completed',
        summary_text: session.summary_text,
        summary_lines: session.summary_text ? session.summary_text.split(/\.\s+/).filter(Boolean).slice(0, 3) : [],
        missed_points: missed,
        must_repeat_question: session.must_repeat_question
      });
    }
    const timeLimitMinutes = session.time_limit_minutes != null ? parseInt(session.time_limit_minutes, 10) : null;
    if (timeLimitMinutes != null && timeLimitMinutes > 0 && session.started_at) {
      const started = new Date(session.started_at).getTime();
      const elapsedMinutes = (Date.now() - started) / (60 * 1000);
      if (elapsedMinutes >= timeLimitMinutes) {
        const snapshot = parseJsonField(session.snapshot, {});
        const conceptResults = snapshot.concept_results || [];
        const missedQueue = snapshot.missed_points_queue || [];
        const conceptsData = snapshot.concepts || [];
        const completedIds = parseJsonField(session.completed_point_ids, []);
        const summary = buildCompletionSummary(conceptResults, completedIds);
        const missedLabels = missedQueue.slice(0, 3).map(m => m.point_label || m.point_id);
        const mustRepeat = pickMustRepeatMicroQuestion(conceptResults, conceptsData);
        await db.query(
          `UPDATE concept_map_session SET phase = 'completed', summary_text = $1, missed_points_text = $2, must_repeat_question = $3 WHERE id = $4`,
          [summary, JSON.stringify(missedLabels), mustRepeat || '', sessionId]
        );
        const conceptIds = (conceptsData || []).map(c => c.id).filter(Boolean);
        await setConceptMasteryNextDue(userId, conceptIds);
        const summaryLines = buildCompletionSummaryLines(conceptResults);
        let nextConcept = null;
        const lastId = conceptResults[0]?.concept_id || conceptsData[0]?.id;
        if (lastId) nextConcept = await getNextConcept(lastId);
        return res.json({
          phase: 'completed',
          time_up: true,
          summary_text: summary,
          summary_lines: summaryLines,
          missed_points: missedLabels,
          must_repeat_question: mustRepeat,
          next_concept: nextConcept,
          message: 'Time\'s up. Here\'s your summary.'
        });
      }
    }
    const snapshot = parseJsonField(session.snapshot, {});
    const conceptResults = snapshot.concept_results || [];
    const missedQueue = snapshot.missed_points_queue || [];
    const tutoringConfig = getSocraticMcqConfigFromTutoring(await loadTutoringConfig());
    const conceptsData = snapshot.concepts || [];
    const completedIds = parseJsonField(session.completed_point_ids, []);
    let currentConceptId = session.current_concept_id ?? session.currentConceptId;
    let currentPointId = session.current_point_id ?? session.currentPointId;
    if ((!currentConceptId || !currentPointId) && missedQueue.length > 0) {
      const first = missedQueue[0];
      currentConceptId = currentConceptId || first.concept_id;
      currentPointId = currentPointId || first.point_id;
    }
    let probeCount = (session.probe_count ?? session.probeCount ?? 0) + 1;
    let leadingTier = session.leading_tier ?? session.leadingTier ?? 1;
    if (!currentConceptId || !currentPointId) {
      const summary = buildCompletionSummary(conceptResults, completedIds);
      await db.query(
        `UPDATE concept_map_session SET phase = 'completed', summary_text = $1, missed_points_text = $2, must_repeat_question = $3 WHERE id = $4`,
        [summary, JSON.stringify([]), pickMustRepeatMicroQuestion(conceptResults, conceptsData) || '', sessionId]
      );
      const conceptIds = (conceptsData || []).map(c => c.id).filter(Boolean);
      await setConceptMasteryNextDue(userId, conceptIds);
      let nextConcept = null;
      const lastId = conceptResults[0]?.concept_id || conceptsData[0]?.id;
      if (lastId) nextConcept = await getNextConcept(lastId);
      const summaryLines = summary.split(/\.\s+/).filter(Boolean).slice(0, 3);
      return res.json({
        phase: 'completed',
        summary_text: summary,
        summary_lines: summaryLines,
        missed_points: [],
        must_repeat_question: pickMustRepeatMicroQuestion(conceptResults, conceptsData),
        next_concept: nextConcept
      });
    }
    const conceptRow = await db.query('SELECT * FROM topic_concept WHERE id = $1', [currentConceptId]);
    if (!conceptRow.rows || conceptRow.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    const concept = serializeConcept(conceptRow.rows[0]);
    const scoreResult = scoreAnswerAgainstConcept(concept, String(answer_text).trim(), session.learner_level || 'mid');
    const scorePercentForAnswer = typeof scoreResult.scorePercent === 'number' ? scoreResult.scorePercent : 0;
    const pointNowHit =
      scorePercentForAnswer >= 70 &&
      (scoreResult.pointsHit || []).some(p => (p.id || p.label) === currentPointId);
    const currentItem = missedQueue.find(m => m.concept_id === currentConceptId && m.point_id === currentPointId);
    if (pointNowHit) {
      completedIds.push(`${currentConceptId}|${currentPointId}`);
      probeCount = 0;
      leadingTier = 1;
    }
    const remaining = missedQueue.filter(m => !completedIds.includes(`${m.concept_id}|${m.point_id}`));
    let nextItem = remaining[0];
    let nextLeadingPrompt = null;
    let nextLeadingTier = 1;
    let nextMcq = null;
    const studentLevel = snapshot.student_level || 'average';
    const conceptForPrompt = (nextItem?.concept_id === currentConceptId) ? concept : (conceptsData.find(c => c.id === (nextItem?.concept_id || currentConceptId)) || concept);
    if (nextItem) {
      const selectorResult = selectNextPrompt({
        concept: conceptForPrompt,
        currentPoint: nextItem,
        studentLevel,
        probeCount: (nextItem?.concept_id === currentConceptId && nextItem?.point_id === currentPointId) ? probeCount : 0,
        leadingTier: (nextItem?.concept_id === currentConceptId && nextItem?.point_id === currentPointId) ? leadingTier : 1,
        usedMcqIds: snapshot.used_mcq_ids || [],
        config: tutoringConfig
      });
      if (selectorResult.type === 'mcq' && selectorResult.mcq) {
        nextMcq = selectorResult.mcq;
      } else {
        nextLeadingPrompt = selectorResult.content || getLeadingPromptForTier(nextItem.leading_questions, 1);
      }
    }
    if (!pointNowHit && probeCount < 3 && remaining.length > 0 && remaining[0].concept_id === currentConceptId && remaining[0].point_id === currentPointId) {
      nextItem = currentItem;
      nextLeadingTier = Math.min(4, leadingTier + 1);
      const selectorResult = selectNextPrompt({
        concept,
        currentPoint: currentItem,
        studentLevel,
        probeCount,
        leadingTier: nextLeadingTier,
        usedMcqIds: snapshot.used_mcq_ids || [],
        config: tutoringConfig
      });
      if (selectorResult.type === 'mcq' && selectorResult.mcq) {
        nextMcq = selectorResult.mcq;
        nextLeadingPrompt = null;
      } else {
        nextLeadingPrompt = selectorResult.content || getLeadingPromptForTier(currentItem.leading_questions, nextLeadingTier) || getLeadingPromptForTier(currentItem.leading_questions, 4);
        nextMcq = null;
      }
    } else if (pointNowHit) {
      nextItem = remaining[0];
      if (nextItem) {
        const nextConcept = conceptsData.find(c => c.id === nextItem.concept_id) || concept;
        const selectorResult = selectNextPrompt({
          concept: nextConcept,
          currentPoint: nextItem,
          studentLevel,
          probeCount: 0,
          leadingTier: 1,
          usedMcqIds: snapshot.used_mcq_ids || [],
          config: tutoringConfig
        });
        if (selectorResult.type === 'mcq' && selectorResult.mcq) {
          nextMcq = selectorResult.mcq;
          nextLeadingPrompt = null;
        } else {
          nextLeadingPrompt = selectorResult.content || getLeadingPromptForTier(nextItem.leading_questions, 1);
        }
      }
    }
    const revealedText = !pointNowHit && probeCount >= 3 && currentItem
      ? (getLeadingPromptForTier(currentItem.leading_questions, 4) || currentItem.point_description || '')
      : null;
    if (!nextItem) {
      const summaryRequestText = `Now summarize the full ${session.topic} in 4-5 exam sentences.`;
      const updatedSnapshot = JSON.stringify({
        ...snapshot,
        primary_concept_id: currentConceptId
      });
      await db.query(
        `UPDATE concept_map_session SET phase = 'summary_request', snapshot = $1, completed_point_ids = $2, current_concept_id = $3, current_point_id = $4, probe_count = 0, leading_tier = 1 WHERE id = $5`,
        [updatedSnapshot, JSON.stringify(completedIds), currentConceptId, currentPointId, sessionId]
      );
      return res.json({
        phase: 'summary_request',
        summary_prompt: summaryRequestText,
        point_just_covered: pointNowHit,
        revealed_after_three: !pointNowHit && probeCount >= 3,
        revealed_text: revealedText,
        message: 'All core points covered. Please provide your summary.'
      });
    }
    await db.query(
      `UPDATE concept_map_session SET current_concept_id = $1, current_point_id = $2, probe_count = $3, leading_tier = $4, completed_point_ids = $5 WHERE id = $6`,
      [nextItem.concept_id, nextItem.point_id, pointNowHit || probeCount >= 3 ? 0 : probeCount, nextLeadingTier, JSON.stringify(completedIds), sessionId]
    );
    res.json({
      phase: 'probing',
      point_just_covered: pointNowHit,
      revealed_after_three: !pointNowHit && probeCount >= 3,
      revealed_text: revealedText,
      next_step: {
        concept_id: nextItem.concept_id,
        concept_key: nextItem.concept_key,
        concept_name: nextItem.concept_name,
        point_id: nextItem.point_id,
        point_label: nextItem.point_label,
        point_description: nextItem.point_description,
        leading_prompt: nextLeadingPrompt,
        leading_tier: nextLeadingTier,
        prompt_type: nextMcq ? 'mcq' : 'socratic',
        mcq: nextMcq || undefined
      },
      score_for_current: pointNowHit ? { hit: true } : { hit: false, probe_count: probeCount }
    });
  } catch (error) {
    console.error('Session answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/score', authenticate, async (req, res) => {
  try {
    const { concept_id, answer_text, learner_level = 'mid' } = req.body;
    if (!concept_id || answer_text == null) {
      return res.status(400).json({ error: 'concept_id and answer_text are required' });
    }
    const result = await db.query('SELECT * FROM topic_concept WHERE id = $1', [concept_id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    const concept = serializeConcept(result.rows[0]);
    const level = ['top', 'mid', 'struggling'].includes(learner_level) ? learner_level : 'mid';
    const scoreResult = scoreAnswerAgainstConcept(concept, String(answer_text).trim(), level);
    res.json({
      concept_id,
      concept_key: concept.concept_key,
      concept_name: concept.name,
      learner_level: level,
      ...scoreResult
    });
  } catch (error) {
    console.error('Concept map score error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM topic_concept WHERE id = $1', [id]);
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    res.json(serializeConcept(result.rows[0]));
  } catch (error) {
    console.error('Concept map get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      subject,
      topic,
      concept_key,
      concept_map_id,
      name,
      display_order = 0,
      concept_weight = 1,
      prerequisite_concept_ids = [],
      downstream_concept_ids = [],
      section,
      chapter,
      main_topic,
      subtopic,
      must_know_points = [],
      deep_points = [],
      traps = [],
      leading_questions = [],
      example_phrases = [],
      grading_rubric = [],
      micro_questions = [],
      saqs = [],
      mcqs = []
    } = req.body;

    if (!subject || !topic || !concept_key || !name) {
      return res.status(400).json({ error: 'subject, topic, concept_key, and name are required' });
    }

    const id = db.generateUUID();
    await db.query(
      `INSERT INTO topic_concept
       (id, subject, topic, concept_key, concept_map_id, name, display_order, concept_weight,
        prerequisite_concept_ids, downstream_concept_ids, section, chapter, main_topic, subtopic,
        must_know_points, deep_points, traps, leading_questions, example_phrases, grading_rubric, micro_questions, saqs, mcqs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        id,
        subject,
        topic,
        concept_key.trim(),
        concept_map_id || null,
        name.trim(),
        display_order,
        concept_weight != null ? concept_weight : 1,
        JSON.stringify(Array.isArray(prerequisite_concept_ids) ? prerequisite_concept_ids : []),
        JSON.stringify(Array.isArray(downstream_concept_ids) ? downstream_concept_ids : []),
        section || null,
        chapter || null,
        main_topic || null,
        subtopic || null,
        JSON.stringify(Array.isArray(must_know_points) ? must_know_points : []),
        JSON.stringify(Array.isArray(deep_points) ? deep_points : []),
        JSON.stringify(Array.isArray(traps) ? traps : []),
        JSON.stringify(Array.isArray(leading_questions) ? leading_questions : []),
        JSON.stringify(Array.isArray(example_phrases) ? example_phrases : []),
        JSON.stringify(Array.isArray(grading_rubric) ? grading_rubric : []),
        JSON.stringify(Array.isArray(micro_questions) ? micro_questions : []),
        JSON.stringify(Array.isArray(saqs) ? saqs : []),
        JSON.stringify(Array.isArray(mcqs) ? mcqs : [])
      ]
    );

    const select = await db.query('SELECT * FROM topic_concept WHERE id = $1', [id]);
    res.status(201).json(serializeConcept(select.rows[0]));
  } catch (error) {
    console.error('Concept map create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/import-from-draft', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, concepts, gross_prompt } = req.body || {};

    if (!subject || !topic || !Array.isArray(concepts) || concepts.length === 0) {
      return res.status(400).json({ error: 'subject, topic, and a non-empty concepts array are required' });
    }

    const created = [];
    const updated = [];

    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i] || {};
      const conceptKey = (c.concept_key || '').trim();
      const name = (c.name || '').trim();
      if (!conceptKey || !name) {
        continue;
      }

      const displayOrder = c.display_order != null ? c.display_order : i + 1;
      const conceptWeight = c.concept_weight != null ? c.concept_weight : 1;

      const prerequisiteIds = Array.isArray(c.prerequisite_concept_ids) ? c.prerequisite_concept_ids : [];
      const downstreamIds = Array.isArray(c.downstream_concept_ids) ? c.downstream_concept_ids : [];
      const mustKnow = Array.isArray(c.must_know_points) ? c.must_know_points : [];
      const deepPoints = Array.isArray(c.deep_points) ? c.deep_points : [];
      const traps = Array.isArray(c.traps) ? c.traps : [];
      const leading = Array.isArray(c.leading_questions) ? c.leading_questions : [];
      const examplePhrases = Array.isArray(c.example_phrases) ? c.example_phrases : [];
      const rubric = Array.isArray(c.grading_rubric) ? c.grading_rubric : [];
      const microQuestions = Array.isArray(c.micro_questions) ? c.micro_questions : [];
      const saqs = Array.isArray(c.saqs) ? c.saqs : [];
      const mcqs = Array.isArray(c.mcqs) ? c.mcqs : [];

      const section = c.section || null;
      const chapter = c.chapter || null;
      const mainTopic = c.main_topic || null;
      const subtopic = c.subtopic || null;
      const conceptMapId = c.concept_map_id || null;

      const existing = await db.query(
        'SELECT id FROM topic_concept WHERE subject = $1 AND topic = $2 AND concept_key = $3',
        [subject, topic, conceptKey]
      );

      if (existing.rows && existing.rows.length > 0) {
        const id = existing.rows[0].id;
        await db.query(
          `UPDATE topic_concept SET
            concept_map_id = $1,
            name = $2,
            display_order = $3,
            concept_weight = $4,
            prerequisite_concept_ids = $5,
            downstream_concept_ids = $6,
            section = $7,
            chapter = $8,
            main_topic = $9,
            subtopic = $10,
            must_know_points = $11,
            deep_points = $12,
            traps = $13,
            leading_questions = $14,
            example_phrases = $15,
            grading_rubric = $16,
            micro_questions = $17,
            saqs = $18,
            mcqs = $19,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $20`,
          [
            conceptMapId,
            name,
            displayOrder,
            conceptWeight,
            JSON.stringify(prerequisiteIds),
            JSON.stringify(downstreamIds),
            section,
            chapter,
            mainTopic,
            subtopic,
            JSON.stringify(mustKnow),
            JSON.stringify(deepPoints),
            JSON.stringify(traps),
            JSON.stringify(leading),
            JSON.stringify(examplePhrases),
            JSON.stringify(rubric),
            JSON.stringify(microQuestions),
            JSON.stringify(saqs),
            JSON.stringify(mcqs),
            id
          ]
        );
        updated.push({ id, concept_key: conceptKey, name });
      } else {
        const id = db.generateUUID();
        await db.query(
          `INSERT INTO topic_concept
           (id, subject, topic, concept_key, concept_map_id, name, display_order, concept_weight,
            prerequisite_concept_ids, downstream_concept_ids, section, chapter, main_topic, subtopic,
            must_know_points, deep_points, traps, leading_questions, example_phrases, grading_rubric,
            micro_questions, saqs, mcqs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            id,
            subject,
            topic,
            conceptKey,
            conceptMapId,
            name,
            displayOrder,
            conceptWeight,
            JSON.stringify(prerequisiteIds),
            JSON.stringify(downstreamIds),
            section,
            chapter,
            mainTopic,
            subtopic,
            JSON.stringify(mustKnow),
            JSON.stringify(deepPoints),
            JSON.stringify(traps),
            JSON.stringify(leading),
            JSON.stringify(examplePhrases),
            JSON.stringify(rubric),
            JSON.stringify(microQuestions),
            JSON.stringify(saqs),
            JSON.stringify(mcqs)
          ]
        );
        created.push({ id, concept_key: conceptKey, name });
      }
    }

    // Ensure there is a gross prompt entry so Concept Map UI shows this topic
    const existingPrompt = await db.query(
      'SELECT id FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
      [subject, topic]
    );
    if (!existingPrompt.rows || existingPrompt.rows.length === 0) {
      const promptId = db.generateUUID();
      const promptText =
        gross_prompt ||
        `Describe the core concepts of ${topic} in your own words. Focus on the key steps, mechanisms, and clinical relevance.`;
      await db.query(
        'INSERT INTO topic_gross_prompt (id, subject, topic, prompt_text) VALUES ($1, $2, $3, $4)',
        [promptId, subject, topic, promptText]
      );
    }

    res.status(201).json({
      subject,
      topic,
      created_count: created.length,
      updated_count: updated.length,
      created,
      updated
    });
  } catch (error) {
    console.error('Concept draft import error:', error);
    res.status(500).json({ error: 'Failed to import concepts from draft' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM topic_concept WHERE id = $1', [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const row = existing.rows[0];
    const {
      subject = row.subject,
      topic = row.topic,
      concept_key = row.concept_key,
      concept_map_id,
      name = row.name,
      display_order = row.display_order,
      concept_weight,
      prerequisite_concept_ids,
      downstream_concept_ids,
      section,
      chapter,
      main_topic,
      subtopic,
      must_know_points,
      deep_points,
      traps,
      leading_questions,
      example_phrases,
      grading_rubric,
      micro_questions,
      saqs,
      mcqs
    } = req.body;

    const conceptMapId = concept_map_id !== undefined ? (concept_map_id || null) : row.concept_map_id;
    const weight = concept_weight !== undefined ? (concept_weight != null ? concept_weight : 1) : row.concept_weight;
    const prereq = prerequisite_concept_ids !== undefined ? (Array.isArray(prerequisite_concept_ids) ? prerequisite_concept_ids : []) : parseJsonField(row.prerequisite_concept_ids, []);
    const downstr = downstream_concept_ids !== undefined ? (Array.isArray(downstream_concept_ids) ? downstream_concept_ids : []) : parseJsonField(row.downstream_concept_ids, []);
    const sec = section !== undefined ? (section || null) : row.section;
    const ch = chapter !== undefined ? (chapter || null) : row.chapter;
    const mt = main_topic !== undefined ? (main_topic || null) : row.main_topic;
    const st = subtopic !== undefined ? (subtopic || null) : row.subtopic;
    const mustKnow = must_know_points !== undefined ? (Array.isArray(must_know_points) ? must_know_points : []) : parseJsonField(row.must_know_points, []);
    const deep = deep_points !== undefined ? (Array.isArray(deep_points) ? deep_points : []) : parseJsonField(row.deep_points, []);
    const trapsArr = traps !== undefined ? (Array.isArray(traps) ? traps : []) : parseJsonField(row.traps, []);
    const leading = leading_questions !== undefined ? (Array.isArray(leading_questions) ? leading_questions : []) : parseJsonField(row.leading_questions, []);
    const examples = example_phrases !== undefined ? (Array.isArray(example_phrases) ? example_phrases : []) : parseJsonField(row.example_phrases, []);
    const rubric = grading_rubric !== undefined ? (Array.isArray(grading_rubric) ? grading_rubric : []) : parseJsonField(row.grading_rubric, []);
    const micro = micro_questions !== undefined ? (Array.isArray(micro_questions) ? micro_questions : []) : parseJsonField(row.micro_questions, []);
    const saqsArr = saqs !== undefined ? (Array.isArray(saqs) ? saqs : []) : parseJsonField(row.saqs, []);
    const mcqsArr = mcqs !== undefined ? (Array.isArray(mcqs) ? mcqs : []) : parseJsonField(row.mcqs, []);

    await db.query(
      `UPDATE topic_concept SET
        subject = $1, topic = $2, concept_key = $3, concept_map_id = $4, name = $5, display_order = $6, concept_weight = $7,
        prerequisite_concept_ids = $8, downstream_concept_ids = $9, section = $10, chapter = $11, main_topic = $12, subtopic = $13,
        must_know_points = $14, deep_points = $15, traps = $16, leading_questions = $17,
        example_phrases = $18, grading_rubric = $19, micro_questions = $20, saqs = $21, mcqs = $22
       WHERE id = $23`,
      [
        subject,
        topic,
        concept_key,
        conceptMapId,
        name,
        display_order,
        weight,
        JSON.stringify(prereq),
        JSON.stringify(downstr),
        sec,
        ch,
        mt,
        st,
        JSON.stringify(mustKnow),
        JSON.stringify(deep),
        JSON.stringify(trapsArr),
        JSON.stringify(leading),
        JSON.stringify(examples),
        JSON.stringify(rubric),
        JSON.stringify(micro),
        JSON.stringify(saqsArr),
        JSON.stringify(mcqsArr),
        id
      ]
    );

    const select = await db.query('SELECT * FROM topic_concept WHERE id = $1', [id]);
    res.json(serializeConcept(select.rows[0]));
  } catch (error) {
    console.error('Concept map update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM topic_concept WHERE id = $1', [id]);
    const rowCount = result.rowCount != null ? result.rowCount : 0;
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('Concept map delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
