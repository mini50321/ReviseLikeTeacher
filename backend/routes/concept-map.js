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
    name: row.name,
    display_order: row.display_order != null ? row.display_order : 0,
    must_know_points: parseJsonField(row.must_know_points, []),
    deep_points: parseJsonField(row.deep_points, []),
    traps: parseJsonField(row.traps, []),
    leading_questions: parseJsonField(row.leading_questions, []),
    example_phrases: parseJsonField(row.example_phrases, []),
    grading_rubric: parseJsonField(row.grading_rubric, []),
    micro_questions: parseJsonField(row.micro_questions, []),
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
    res.json({
      subject,
      topic,
      learner_level: level,
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
    const snapshot = JSON.stringify({
      concept_results: conceptResults,
      missed_points_queue: missedQueue,
      concepts: concepts.map(c => ({ id: c.id, concept_key: c.concept_key, name: c.name, leading_questions: c.leading_questions, micro_questions: c.micro_questions }))
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
        return res.json({
          phase: 'completed',
          time_up: true,
          summary_text: summary,
          summary_lines: summaryLines,
          missed_points: missedLabels,
          must_repeat_question: mustRepeat,
          message: 'Time\'s up. Here\'s your summary.'
        });
      }
    }
    const snapshot = parseJsonField(session.snapshot, {});
    const conceptResults = snapshot.concept_results || [];
    const missedQueue = snapshot.missed_points_queue || [];
    const conceptsData = snapshot.concepts || [];
    const completedIds = parseJsonField(session.completed_point_ids, []);
    const currentConceptId = session.current_concept_id;
    const currentPointId = session.current_point_id;
    let probeCount = (session.probe_count || 0) + 1;
    let leadingTier = session.leading_tier || 1;
    if (!currentConceptId || !currentPointId) {
      await db.query(
        `UPDATE concept_map_session SET phase = 'completed', summary_text = $1, missed_points_text = $2, must_repeat_question = $3 WHERE id = $4`,
        [
          buildCompletionSummary(conceptResults, completedIds),
          JSON.stringify([]),
          pickMustRepeatMicroQuestion(conceptResults, conceptsData) || '',
          sessionId
        ]
      );
      const conceptIds = (conceptsData || []).map(c => c.id).filter(Boolean);
      await setConceptMasteryNextDue(userId, conceptIds);
      const updated = await db.query('SELECT * FROM concept_map_session WHERE id = $1', [sessionId]);
      const u = updated.rows[0];
      const summaryLines = (u.summary_text || '').split(/\.\s+/).filter(Boolean).slice(0, 3);
      return res.json({
        phase: 'completed',
        summary_text: u.summary_text,
        summary_lines: summaryLines,
        missed_points: [],
        must_repeat_question: u.must_repeat_question
      });
    }
    const conceptRow = await db.query('SELECT * FROM topic_concept WHERE id = $1', [currentConceptId]);
    if (!conceptRow.rows || conceptRow.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    const concept = serializeConcept(conceptRow.rows[0]);
    const scoreResult = scoreAnswerAgainstConcept(concept, String(answer_text).trim(), session.learner_level || 'mid');
    const pointNowHit = (scoreResult.pointsHit || []).some(p => (p.id || p.label) === currentPointId);
    const currentItem = missedQueue.find(m => m.concept_id === currentConceptId && m.point_id === currentPointId);
    if (pointNowHit) {
      completedIds.push(`${currentConceptId}|${currentPointId}`);
      probeCount = 0;
      leadingTier = 1;
    } else if (probeCount >= 3) {
      completedIds.push(`${currentConceptId}|${currentPointId}`);
      probeCount = 0;
      leadingTier = 1;
    }
    const remaining = missedQueue.filter(m => !completedIds.includes(`${m.concept_id}|${m.point_id}`));
    let nextItem = remaining[0];
    let nextLeadingPrompt = null;
    let nextLeadingTier = 1;
    if (nextItem) {
      nextLeadingPrompt = getLeadingPromptForTier(nextItem.leading_questions, 1);
    }
    if (!pointNowHit && probeCount < 3 && remaining.length > 0 && remaining[0].concept_id === currentConceptId && remaining[0].point_id === currentPointId) {
      nextItem = currentItem;
      nextLeadingTier = Math.min(4, leadingTier + 1);
      nextLeadingPrompt = getLeadingPromptForTier(currentItem.leading_questions, nextLeadingTier) || getLeadingPromptForTier(currentItem.leading_questions, 4);
    } else if (pointNowHit || probeCount >= 3) {
      nextItem = remaining[0];
      if (nextItem) {
        nextLeadingPrompt = getLeadingPromptForTier(nextItem.leading_questions, 1);
      }
    }
    const revealedText = !pointNowHit && probeCount >= 3 && currentItem
      ? (getLeadingPromptForTier(currentItem.leading_questions, 4) || currentItem.point_description || '')
      : null;
    if (!nextItem) {
      const summary = buildCompletionSummary(conceptResults, completedIds);
      const missedLabels = missedQueue.slice(0, 3).map(m => m.point_label || m.point_id);
      const mustRepeat = pickMustRepeatMicroQuestion(conceptResults, conceptsData);
      await db.query(
        `UPDATE concept_map_session SET phase = 'completed', summary_text = $1, missed_points_text = $2, must_repeat_question = $3, completed_point_ids = $4, current_concept_id = $5, current_point_id = $6, probe_count = 0, leading_tier = 1 WHERE id = $7`,
        [summary, JSON.stringify(missedLabels), mustRepeat || '', JSON.stringify(completedIds), null, null, sessionId]
      );
      const conceptIds = (conceptsData || []).map(c => c.id).filter(Boolean);
      await setConceptMasteryNextDue(userId, conceptIds);
      const summaryLines = buildCompletionSummaryLines(conceptResults);
      return res.json({
        phase: 'completed',
        summary_text: summary,
        summary_lines: summaryLines,
        missed_points: missedLabels,
        must_repeat_question: mustRepeat,
        point_just_covered: pointNowHit,
        revealed_after_three: !pointNowHit && probeCount >= 3,
        revealed_text: revealedText
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
        leading_tier: nextLeadingTier
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
      name,
      display_order = 0,
      must_know_points = [],
      deep_points = [],
      traps = [],
      leading_questions = [],
      example_phrases = [],
      grading_rubric = [],
      micro_questions = []
    } = req.body;

    if (!subject || !topic || !concept_key || !name) {
      return res.status(400).json({ error: 'subject, topic, concept_key, and name are required' });
    }

    const id = db.generateUUID();
    await db.query(
      `INSERT INTO topic_concept
       (id, subject, topic, concept_key, name, display_order, must_know_points, deep_points, traps, leading_questions, example_phrases, grading_rubric, micro_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        subject,
        topic,
        concept_key.trim(),
        name.trim(),
        display_order,
        JSON.stringify(Array.isArray(must_know_points) ? must_know_points : []),
        JSON.stringify(Array.isArray(deep_points) ? deep_points : []),
        JSON.stringify(Array.isArray(traps) ? traps : []),
        JSON.stringify(Array.isArray(leading_questions) ? leading_questions : []),
        JSON.stringify(Array.isArray(example_phrases) ? example_phrases : []),
        JSON.stringify(Array.isArray(grading_rubric) ? grading_rubric : []),
        JSON.stringify(Array.isArray(micro_questions) ? micro_questions : [])
      ]
    );

    const select = await db.query('SELECT * FROM topic_concept WHERE id = $1', [id]);
    res.status(201).json(serializeConcept(select.rows[0]));
  } catch (error) {
    console.error('Concept map create error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      name = row.name,
      display_order = row.display_order,
      must_know_points,
      deep_points,
      traps,
      leading_questions,
      example_phrases,
      grading_rubric,
      micro_questions
    } = req.body;

    const mustKnow = must_know_points !== undefined ? (Array.isArray(must_know_points) ? must_know_points : []) : parseJsonField(row.must_know_points, []);
    const deep = deep_points !== undefined ? (Array.isArray(deep_points) ? deep_points : []) : parseJsonField(row.deep_points, []);
    const trapsArr = traps !== undefined ? (Array.isArray(traps) ? traps : []) : parseJsonField(row.traps, []);
    const leading = leading_questions !== undefined ? (Array.isArray(leading_questions) ? leading_questions : []) : parseJsonField(row.leading_questions, []);
    const examples = example_phrases !== undefined ? (Array.isArray(example_phrases) ? example_phrases : []) : parseJsonField(row.example_phrases, []);
    const rubric = grading_rubric !== undefined ? (Array.isArray(grading_rubric) ? grading_rubric : []) : parseJsonField(row.grading_rubric, []);
    const micro = micro_questions !== undefined ? (Array.isArray(micro_questions) ? micro_questions : []) : parseJsonField(row.micro_questions, []);

    await db.query(
      `UPDATE topic_concept SET
        subject = $1, topic = $2, concept_key = $3, name = $4, display_order = $5,
        must_know_points = $6, deep_points = $7, traps = $8, leading_questions = $9,
        example_phrases = $10, grading_rubric = $11, micro_questions = $12
       WHERE id = $13`,
      [
        subject,
        topic,
        concept_key,
        name,
        display_order,
        JSON.stringify(mustKnow),
        JSON.stringify(deep),
        JSON.stringify(trapsArr),
        JSON.stringify(leading),
        JSON.stringify(examples),
        JSON.stringify(rubric),
        JSON.stringify(micro),
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
