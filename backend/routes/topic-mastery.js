const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { evaluateAnswer, generateSaqAnchors, generateMcqItems } = require('../services/ai');
const { detectMisconception } = require('../services/misconception');
const { getStudentPerformanceProfile, buildAdaptiveMCQQuery, fetchAdaptiveMCQs, getAdaptiveSAQCount, getAdaptiveMCQLimit, getDifficultyLabel } = require('../services/difficulty-adapter');

const MIN_ANCHOR_COMPETENCY_SCORE = 70;

router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Topic learning session not found' });
    }

    const tls = result.rows[0];

    let diagnosticData = null;
    if (tls.diagnostic_id) {
      const diagResult = await db.query(
        'SELECT * FROM diagnostic_assessment WHERE id = $1',
        [tls.diagnostic_id]
      );
      if (diagResult.rows.length > 0) {
        diagnosticData = diagResult.rows[0];
      }
    }

    res.json({ session: tls, diagnostic: diagnosticData });
  } catch (error) {
    console.error('Get topic mastery session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;

    let query = 'SELECT * FROM topic_learning_session WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND current_phase = $2';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC LIMIT 50';

    const result = await db.query(query, params);
    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('List topic mastery sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/concept-fixing/start', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tls = tlsResult.rows[0];

    const profile = await getStudentPerformanceProfile(userId, tls.subject, tls.topic);
    const adaptiveSAQCount = getAdaptiveSAQCount(profile);

    let misconceptionTags = [];
    if (tls.diagnostic_id) {
      const diagResult = await db.query(
        'SELECT misconception_tags FROM diagnostic_assessment WHERE id = $1',
        [tls.diagnostic_id]
      );
      if (diagResult.rows.length > 0 && diagResult.rows[0].misconception_tags) {
        try {
          misconceptionTags = JSON.parse(diagResult.rows[0].misconception_tags);
        } catch (e) {}
      }
    }

    const weakSubtopics = misconceptionTags.map(m => m.subtopic).filter(Boolean);

    const focusBuckets = tls.focus_buckets ? JSON.parse(tls.focus_buckets) : ['core'];
    const existingPlanIds = parseJsonArray(tls.concept_plan);
    const existingCorePoints = parseJsonArray(tls.concept_core_points);

    if (existingPlanIds.length > 0 && (tls.concept_anchor_index || 0) < existingPlanIds.length) {
      const currentPlanQuestionId = existingPlanIds[tls.concept_anchor_index || 0];
      const existingQuestionResult = await db.query('SELECT * FROM question WHERE id = $1', [currentPlanQuestionId]);
      if (existingQuestionResult.rows.length > 0) {
        await db.query(
          `UPDATE topic_learning_session SET current_phase = 'concept_fixing' WHERE id = $1`,
          [id]
        );

        return res.json({
          phase: 'concept_fixing',
          questions: [serializeQuestionForClient(existingQuestionResult.rows[0])],
          total_questions: existingPlanIds.length,
          current_anchor_index: (tls.concept_anchor_index || 0) + 1,
          learning_mode: 'guided_competency',
          concept_core_points: existingCorePoints,
          weak_subtopics: weakSubtopics,
          focus_buckets: focusBuckets,
          adaptive: {
            level: profile.level,
            difficulty_label: getDifficultyLabel(profile),
            saq_count: existingPlanIds.length,
            avg_score: profile.avgScore,
            recommendation: profile.recommendation
          }
        });
      }
    }

    const teachingPlan = await buildConceptTeachingPlan({
      tls,
      userId,
      profile,
      weakSubtopics,
      focusBuckets,
      targetCount: Math.max(4, Math.min(5, adaptiveSAQCount))
    });

    if (teachingPlan.anchorQuestions.length === 0) {
      const fallbackQuestions = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('saq', 'case_based', 'mcq')
         ORDER BY RANDOM()
         LIMIT 1`,
        [tls.subject, tls.topic]
      );
      if (fallbackQuestions.rows.length === 0) {
        return res.status(400).json({ error: 'No questions available for this topic' });
      }
      teachingPlan.anchorQuestions = [fallbackQuestions.rows[0]];
    }

    const conceptPlanIds = teachingPlan.anchorQuestions.map((q) => q.id);

    await db.query(
      `UPDATE topic_learning_session
       SET current_phase = 'concept_fixing',
           concept_plan = $1,
           concept_anchor_index = 0,
           concept_retry_count = 0,
           concept_core_points = $2,
           saq_completed = 0
       WHERE id = $3`,
      [JSON.stringify(conceptPlanIds), JSON.stringify(teachingPlan.corePoints), id]
    );

    const questionsForClient = [serializeQuestionForClient(teachingPlan.anchorQuestions[0])];

    res.json({
      phase: 'concept_fixing',
      questions: questionsForClient,
      total_questions: conceptPlanIds.length,
      current_anchor_index: 1,
      learning_mode: 'guided_competency',
      concept_core_points: teachingPlan.corePoints,
      weak_subtopics: weakSubtopics,
      focus_buckets: focusBuckets,
      adaptive: {
        level: profile.level,
        difficulty_label: getDifficultyLabel(profile),
        saq_count: conceptPlanIds.length,
        avg_score: profile.avgScore,
        recommendation: profile.recommendation
      }
    });
  } catch (error) {
    console.error('Concept fixing start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/concept-fixing/answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { question_id, answer_text, answer_method = 'text', language, time_spent_seconds = 0 } = req.body;

    if (!question_id || !answer_text || !answer_text.trim()) {
      return res.status(400).json({ error: 'Question ID and answer text are required' });
    }

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const conceptPlanIds = parseJsonArray(tlsResult.rows[0].concept_plan);
    const currentAnchorIndex = tlsResult.rows[0].concept_anchor_index || 0;
    const totalAnchors = conceptPlanIds.length;

    if (totalAnchors === 0) {
      return res.status(400).json({ error: 'Concept plan is not initialized. Please restart concept fixing.' });
    }

    const expectedQuestionId = conceptPlanIds[Math.min(currentAnchorIndex, totalAnchors - 1)];
    if (question_id !== expectedQuestionId) {
      return res.status(400).json({ error: 'Please answer the current guided SAQ before moving ahead.' });
    }

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [expectedQuestionId]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const question = questionResult.rows[0];

    const evaluation = await evaluateWithFallback(question, answer_text, userId);
    const isAnchorMastered = (evaluation.score || 0) >= MIN_ANCHOR_COMPETENCY_SCORE;

    const attemptId = db.generateUUID();
    await db.query(
      `INSERT INTO attempt
       (id, user_id, question_id, session_id, answer_text, answer_method, language,
        ai_feedback, ai_score, time_spent_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [attemptId, userId, question_id, tlsResult.rows[0].session_id, answer_text,
       answer_method, language || null, JSON.stringify(evaluation.feedback), evaluation.score, time_spent_seconds]
    );

    const currentSaqCount = tlsResult.rows[0].saq_completed || 0;
    const nextAnchorIndex = isAnchorMastered ? currentAnchorIndex + 1 : currentAnchorIndex;
    const nextRetryCount = isAnchorMastered ? 0 : (tlsResult.rows[0].concept_retry_count || 0) + 1;
    const phaseComplete = nextAnchorIndex >= totalAnchors;

    await db.query(
      `UPDATE topic_learning_session
       SET saq_completed = $1,
           concept_anchor_index = $2,
           concept_retry_count = $3,
           current_phase = $4
       WHERE id = $5`,
      [
        currentSaqCount + (isAnchorMastered ? 1 : 0),
        nextAnchorIndex,
        nextRetryCount,
        phaseComplete ? 'mcq_consolidation' : 'concept_fixing',
        id
      ]
    );

    let nextQuestion = null;
    if (!phaseComplete) {
      const nextQuestionId = conceptPlanIds[nextAnchorIndex];
      const nextQuestionResult = await db.query('SELECT * FROM question WHERE id = $1', [nextQuestionId]);
      if (nextQuestionResult.rows.length > 0) {
        nextQuestion = serializeQuestionForClient(nextQuestionResult.rows[0]);
      }
    }

    const teachingFollowUp = isAnchorMastered
      ? null
      : buildConceptFollowUp(question, evaluation, nextRetryCount);

    res.json({
      attempt_id: attemptId,
      score: evaluation.score,
      feedback: evaluation.feedback,
      teacher_response: evaluation.teacher_response || null,
      is_anchor_mastered: isAnchorMastered,
      current_anchor_index: Math.min(nextAnchorIndex + 1, totalAnchors),
      total_anchors: totalAnchors,
      retry_count: nextRetryCount,
      phase_complete: phaseComplete,
      next_action: phaseComplete
        ? 'start_mixed_practice'
        : (isAnchorMastered ? 'advance_anchor' : 'retry_same_anchor'),
      next_question: nextQuestion,
      teaching_follow_up: teachingFollowUp
    });
  } catch (error) {
    console.error('Concept fixing answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/laq/start', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tls = tlsResult.rows[0];

    let questions = await db.query(
      `SELECT * FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
         AND type IN ('laq', 'case_based')
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END,
                RANDOM()
       LIMIT 1`,
      [tls.subject, tls.topic]
    );

    if (questions.rows.length === 0) {
      questions = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type = 'saq'
           AND cognitive_focus = 'clinical'
         ORDER BY RANDOM()
         LIMIT 1`,
        [tls.subject, tls.topic]
      );
    }

    if (questions.rows.length === 0) {
      questions = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('saq', 'case_based')
         ORDER BY RANDOM()
         LIMIT 1`,
        [tls.subject, tls.topic]
      );
    }

    await db.query(
      `UPDATE topic_learning_session SET current_phase = 'laq' WHERE id = $1`,
      [id]
    );

    if (questions.rows.length === 0) {
      return res.json({
        phase: 'laq',
        questions: [],
        total_questions: 0,
        skip_reason: 'No LAQ/case-based questions available for this topic. Proceeding to MCQ.'
      });
    }

    const questionsForClient = questions.rows.map(q => ({
      id: q.id,
      stem: q.stem,
      type: q.type,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      yield_category: q.yield_category,
      options: q.options
    }));

    res.json({
      phase: 'laq',
      questions: questionsForClient,
      total_questions: questionsForClient.length
    });
  } catch (error) {
    console.error('LAQ start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/laq/answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { question_id, answer_text, answer_method = 'text', language, time_spent_seconds = 0 } = req.body;

    if (!question_id || !answer_text || !answer_text.trim()) {
      return res.status(400).json({ error: 'Question ID and answer text are required' });
    }

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [question_id]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const evaluation = await evaluateWithFallback(questionResult.rows[0], answer_text, userId);

    const attemptId = db.generateUUID();
    await db.query(
      `INSERT INTO attempt
       (id, user_id, question_id, session_id, answer_text, answer_method, language,
        ai_feedback, ai_score, time_spent_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [attemptId, userId, question_id, tlsResult.rows[0].session_id, answer_text,
       answer_method, language || null, JSON.stringify(evaluation.feedback), evaluation.score, time_spent_seconds]
    );

    await db.query(
      `UPDATE topic_learning_session SET laq_completed = laq_completed + 1 WHERE id = $1`,
      [id]
    );

    res.json({
      attempt_id: attemptId,
      score: evaluation.score,
      feedback: evaluation.feedback,
      teacher_response: evaluation.teacher_response || null
    });
  } catch (error) {
    console.error('LAQ answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/mcq/start', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tls = tlsResult.rows[0];
    const focusBuckets = tls.focus_buckets ? JSON.parse(tls.focus_buckets) : ['core'];

    const diagnosticLevel = tls.diagnostic_score !== null
      ? (tls.diagnostic_score >= 0.75 ? 'strong' : tls.diagnostic_score >= 0.5 ? 'good' : 'average')
      : 'average';

    const profile = await getStudentPerformanceProfile(userId, tls.subject, tls.topic);
    const mcqLimit = getAdaptiveMCQLimit(diagnosticLevel, profile);
    const adaptiveConfig = buildAdaptiveMCQQuery(tls.subject, tls.topic, focusBuckets, mcqLimit, profile);
    const difficultyLabel = getDifficultyLabel(profile);

    let mcqRows = await fetchAdaptiveMCQs(tls.subject, tls.topic, focusBuckets, mcqLimit, adaptiveConfig);

    if (mcqRows.length < 4) {
      const fallback = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('mcq', 'true_false', 'assertion_reason')
         ORDER BY RANDOM()
         LIMIT $3`,
        [tls.subject, tls.topic, mcqLimit]
      );
      mcqRows = fallback.rows;
    }

    const targetObjectiveCount = Math.max(4, Math.ceil(mcqLimit * 0.65));
    if (mcqRows.length < targetObjectiveCount) {
      const corePoints = parseJsonArray(tls.concept_core_points).slice(0, 10);
      const pyqExamples = mcqRows.slice(0, 8).map((q) => ({
        stem: q.stem,
        subtopic: q.subtopic
      }));
      const generatedObjective = await generateMcqItems({
        subject: tls.subject,
        topic: tls.topic,
        count: targetObjectiveCount - mcqRows.length,
        corePoints,
        pyqExamples
      });
      const persistedGeneratedObjective = await persistGeneratedObjectiveQuestions({
        generatedQuestions: generatedObjective.questions || [],
        subject: tls.subject,
        topic: tls.topic,
        userId
      });
      mcqRows = interleaveQuestions(mcqRows, persistedGeneratedObjective).slice(0, targetObjectiveCount);
    }

    const saqLimit = Math.max(2, Math.round(mcqLimit * 0.35));
    const saqRowsResult = await db.query(
      `SELECT * FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
         AND type IN ('saq', 'case_based')
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END,
                RANDOM()
       LIMIT $3`,
      [tls.subject, tls.topic, saqLimit]
    );
    const saqRows = saqRowsResult.rows;

    let questionRows = interleaveQuestions(mcqRows, saqRows);
    if (questionRows.length === 0) {
      questionRows = mcqRows;
    }

    await db.query(
      `UPDATE topic_learning_session SET current_phase = 'mcq_consolidation',
       mcq_total = $1, mcq_completed = 0, mcq_correct = 0,
       adaptive_level = $3, difficulty_label = $4 WHERE id = $2`,
      [questionRows.length, id, profile.level, difficultyLabel]
    );

    const questionsForClient = questionRows.map(q => ({
      id: q.id,
      stem: q.stem,
      type: q.type,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      yield_category: q.yield_category,
      options: q.options
    }));

    res.json({
      phase: 'mcq_consolidation',
      questions: questionsForClient,
      total_questions: questionsForClient.length,
      mcq_limit: mcqLimit,
      mode: 'mixed_practice',
      mix_breakdown: {
        objective: mcqRows.length,
        short_answer: saqRows.length
      },
      adaptive: {
        level: profile.level,
        difficulty_label: difficultyLabel,
        recommendation: profile.recommendation,
        distribution: adaptiveConfig.difficultyDistribution,
        avg_score: profile.avgScore,
        streak: profile.streak,
        misconception_rate: profile.misconceptionRate
      }
    });
  } catch (error) {
    console.error('MCQ start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/mcq/answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { question_id, answer_text, time_spent_seconds = 0 } = req.body;

    if (!question_id || !answer_text) {
      return res.status(400).json({ error: 'Question ID and answer are required' });
    }

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [question_id]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const question = questionResult.rows[0];

    const hasCorrectAnswer = question.correct_answer && question.correct_answer.trim() !== '';
    const isObjectiveType = ['mcq', 'true_false', 'assertion_reason'].includes(question.type) && hasCorrectAnswer;
    let isCorrect = false;
    let score = 0;
    let feedbackObj = {};
    let teacherResponse = '';

    if (isObjectiveType) {
      isCorrect = answer_text.trim().toUpperCase() === question.correct_answer.trim().toUpperCase();
      score = isCorrect ? 100 : 0;

      let parsedOptions = {};
      if (question.options) {
        try {
          parsedOptions = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        } catch (e) {}
      }

      const selectedText = parsedOptions[answer_text.trim().toUpperCase()] || answer_text;
      const correctText = parsedOptions[question.correct_answer.trim().toUpperCase()] || question.correct_answer;

      feedbackObj = {
        is_mcq: true,
        is_correct: isCorrect,
        selected_option: answer_text.trim().toUpperCase(),
        selected_text: selectedText,
        correct_option: question.correct_answer.trim().toUpperCase(),
        correct_text: correctText,
        model_explanation: question.ideal_answer || ''
      };

      if (isCorrect) {
        teacherResponse = `Good job choosing ${question.correct_answer.trim().toUpperCase()}, ${correctText}.`;
        teacherResponse += ' Now lock in the reason this option is best.';
        if (question.ideal_answer) teacherResponse += ' ' + question.ideal_answer;
        teacherResponse += ' Quick check: if one key clue changes in the stem, would your answer stay the same?';
      } else {
        teacherResponse = `Good attempt. The correct answer is ${question.correct_answer.trim().toUpperCase()}, ${correctText}.`;
        teacherResponse += ' Your main gap is identifying the discriminator clue.';
        if (question.ideal_answer) teacherResponse += ' ' + question.ideal_answer;
        teacherResponse += ` Quick check: which single phrase in the stem points to ${question.correct_answer.trim().toUpperCase()}?`;
      }
    } else {
      const evaluation = await evaluateWithFallback(question, answer_text, userId);
      score = evaluation.score || 0;
      isCorrect = score >= 70;
      feedbackObj = evaluation.feedback || {};
      teacherResponse = evaluation.teacher_response || null;
    }

    let misconceptionType = null;
    let distractorMeaning = null;
    let misconceptionData = null;

    if (isObjectiveType && !isCorrect) {
      try {
        misconceptionData = await detectMisconception(userId, question, answer_text, isCorrect, score);
        if (misconceptionData) {
          misconceptionType = misconceptionData.type;
          distractorMeaning = misconceptionData.distractor_meaning;
        }
      } catch (e) {
        console.error('Misconception detection error:', e);
        if (question.distractor_analysis) {
          try {
            const distractors = typeof question.distractor_analysis === 'string'
              ? JSON.parse(question.distractor_analysis)
              : question.distractor_analysis;
            const chosen = answer_text.trim().toUpperCase();
            if (distractors[chosen]) {
              distractorMeaning = distractors[chosen].meaning || distractors[chosen];
              misconceptionType = distractors[chosen].error_type || 'trap_susceptibility';
            }
          } catch (e2) {}
        }
      }
    }

    const attemptId = db.generateUUID();
    await db.query(
      `INSERT INTO attempt
       (id, user_id, question_id, session_id, answer_text, answer_method,
        ai_feedback, ai_score, time_spent_seconds, misconception_type,
        distractor_chosen_meaning, misconception_tags, concept_tested)
       VALUES ($1, $2, $3, $4, $5, 'text', $6, $7, $8, $9, $10, $11, $12)`,
      [attemptId, userId, question_id, tlsResult.rows[0].session_id, answer_text,
       JSON.stringify(feedbackObj), score, time_spent_seconds, misconceptionType,
       distractorMeaning,
       misconceptionData ? JSON.stringify({ severity: misconceptionData.severity, details: misconceptionData.details }) : null,
       misconceptionData ? misconceptionData.concept_tested : null]
    );

    const tls = tlsResult.rows[0];
    const newCompleted = (tls.mcq_completed || 0) + 1;
    const newCorrect = (tls.mcq_correct || 0) + (isCorrect ? 1 : 0);

    await db.query(
      `UPDATE topic_learning_session SET mcq_completed = $1, mcq_correct = $2 WHERE id = $3`,
      [newCompleted, newCorrect, id]
    );

    await db.query(
      `INSERT INTO questionmastery (id, user_id, question_id, mastery_level, attempt_count, last_attempt_at)
       VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET mastery_level = $4, attempt_count = questionmastery.attempt_count + 1,
                     last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [db.generateUUID(), userId, question_id, score]
    );

    res.json({
      attempt_id: attemptId,
      score,
      is_correct: isCorrect,
      feedback: feedbackObj,
      teacher_response: teacherResponse,
      misconception_type: misconceptionType,
      distractor_meaning: distractorMeaning,
      remediation: misconceptionData ? misconceptionData.remediation : null,
      severity: misconceptionData ? misconceptionData.severity : null,
      progress: { completed: newCompleted, total: tls.mcq_total || 0, correct: newCorrect }
    });
  } catch (error) {
    console.error('MCQ answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/mastery-check', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tls = tlsResult.rows[0];

    const mcqAccuracy = tls.mcq_total > 0
      ? (tls.mcq_correct / tls.mcq_total) * 100
      : 0;

    const focusBuckets = tls.focus_buckets ? JSON.parse(tls.focus_buckets) : ['core'];

    const coreTotal = await db.query(
      `SELECT COUNT(DISTINCT subtopic) as cnt FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active' AND yield_category = 'core'`,
      [tls.subject, tls.topic]
    );

    const coreAttempted = await db.query(
      `SELECT COUNT(DISTINCT q.subtopic) as cnt FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1 AND q.subject = $2 AND q.topic = $3
         AND q.yield_category = 'core' AND a.ai_score >= 70
         AND a.session_id = $4`,
      [userId, tls.subject, tls.topic, tls.session_id]
    );

    const totalCore = parseInt(coreTotal.rows[0]?.cnt || 0);
    const coveredCore = parseInt(coreAttempted.rows[0]?.cnt || 0);
    const coreCoverage = totalCore > 0 ? (coveredCore / totalCore) * 100 : 100;

    const saqRawScore = tls.diagnostic_score || 0;

    const competencyScore = (20 * saqRawScore) + (70 * (mcqAccuracy / 100)) + (10 * (coreCoverage / 100));

    const tuningResult = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name IN ('mastery_threshold_mastered', 'mastery_threshold_revision', 'core_coverage_threshold', 'competency_achieved_threshold')`
    );

    const tuning = {};
    tuningResult.rows.forEach(r => { tuning[r.parameter_name] = parseFloat(r.parameter_value); });

    const masteryThreshold = tuning.mastery_threshold_mastered || 85;
    const revisionThreshold = tuning.mastery_threshold_revision || 60;
    const coreThreshold = tuning.core_coverage_threshold || 90;
    const competencyThreshold = tuning.competency_achieved_threshold || 80;

    let masteryResult;
    if (mcqAccuracy >= masteryThreshold && coreCoverage >= coreThreshold && competencyScore >= competencyThreshold) {
      masteryResult = 'mastered';
    } else if (mcqAccuracy >= revisionThreshold) {
      masteryResult = 'revision_required';
    } else {
      masteryResult = 'relearn_core';
    }

    await db.query(
      `UPDATE topic_learning_session SET
       current_phase = 'mastery_check',
       mcq_accuracy = $1,
       core_coverage = $2,
       competency_score = $3,
       mastery_result = $4
       WHERE id = $5`,
      [mcqAccuracy, coreCoverage, competencyScore, masteryResult, id]
    );

    const masteryStatus = masteryResult === 'mastered' ? 'mastered' : masteryResult;

    const existingMastery = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
      [userId, tls.subject, tls.topic]
    );

    if (existingMastery.rows.length > 0) {
      await db.query(
        `UPDATE topicmastery SET
         mastery_level = $1, mastery_status = $2, competency_score = $3,
         mcq_accuracy = $4, core_coverage = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [competencyScore, masteryStatus, competencyScore, mcqAccuracy, coreCoverage,
         existingMastery.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO topicmastery
         (id, user_id, topic, subject, mastery_level, mastery_status, competency_score, mcq_accuracy, core_coverage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, topic, subject)
         DO UPDATE SET
           mastery_level = excluded.mastery_level,
           mastery_status = excluded.mastery_status,
           competency_score = excluded.competency_score,
           mcq_accuracy = excluded.mcq_accuracy,
           core_coverage = excluded.core_coverage,
           updated_at = CURRENT_TIMESTAMP`,
        [db.generateUUID(), userId, tls.topic, tls.subject,
         competencyScore, masteryStatus, competencyScore, mcqAccuracy, coreCoverage]
      );
    }

    const compLogId = db.generateUUID();
    await db.query(
      `INSERT INTO competency_score_log (id, user_id, topic, subject, score)
       VALUES ($1, $2, $3, $4, $5)`,
      [compLogId, userId, tls.topic, tls.subject, competencyScore]
    );

    let revisionDays = [];
    if (masteryResult === 'mastered') {
      revisionDays = [
        tuning.revision_interval_mastered_1 || 7,
        tuning.revision_interval_mastered_2 || 21,
        tuning.revision_interval_mastered_3 || 45
      ];
    } else if (masteryResult === 'revision_required') {
      revisionDays = [
        tuning.revision_interval_revision_1 || 3,
        tuning.revision_interval_revision_2 || 10,
        tuning.revision_interval_revision_3 || 25
      ];
    } else {
      revisionDays = [
        tuning.revision_interval_relearn_1 || 1,
        tuning.revision_interval_relearn_2 || 5,
        tuning.revision_interval_relearn_3 || 15
      ];
    }

    const tuningRevision = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name LIKE 'revision_interval_%'`
    );
    tuningRevision.rows.forEach(r => { tuning[r.parameter_name] = parseFloat(r.parameter_value); });

    if (masteryResult === 'mastered') {
      revisionDays = [
        tuning.revision_interval_mastered_1 || 7,
        tuning.revision_interval_mastered_2 || 21,
        tuning.revision_interval_mastered_3 || 45
      ];
    } else if (masteryResult === 'revision_required') {
      revisionDays = [
        tuning.revision_interval_revision_1 || 3,
        tuning.revision_interval_revision_2 || 10,
        tuning.revision_interval_revision_3 || 25
      ];
    } else {
      revisionDays = [
        tuning.revision_interval_relearn_1 || 1,
        tuning.revision_interval_relearn_2 || 5,
        tuning.revision_interval_relearn_3 || 15
      ];
    }

    const nextRevisionDate = new Date();
    nextRevisionDate.setDate(nextRevisionDate.getDate() + revisionDays[0]);

    if (existingMastery.rows.length > 0) {
      await db.query(
        `UPDATE topicmastery SET next_revision_date = $1, required_revisions = $2 WHERE id = $3`,
        [nextRevisionDate.toISOString().split('T')[0], revisionDays.length, existingMastery.rows[0].id]
      );
    }

    res.json({
      mastery_result: masteryResult,
      mcq_accuracy: Math.round(mcqAccuracy * 100) / 100,
      core_coverage: Math.round(coreCoverage * 100) / 100,
      competency_score: Math.round(competencyScore * 100) / 100,
      can_exit_topic: masteryResult === 'mastered' && competencyScore >= competencyThreshold,
      saq_raw_score: saqRawScore,
      mcq_stats: {
        total: tls.mcq_total,
        correct: tls.mcq_correct,
        completed: tls.mcq_completed
      },
      revision_schedule: {
        intervals_days: revisionDays,
        next_revision: nextRevisionDate.toISOString().split('T')[0]
      },
      thresholds: {
        mastered: masteryThreshold,
        revision: revisionThreshold,
        core_coverage: coreThreshold,
        competency: competencyThreshold
      }
    });
  } catch (error) {
    console.error('Mastery check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const tlsResult = await db.query(
      'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (tlsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const tls = tlsResult.rows[0];

    const thresholdResult = await db.query(
      `SELECT parameter_value FROM system_tuning_parameters WHERE parameter_name = 'competency_achieved_threshold' LIMIT 1`
    );
    const competencyThreshold = parseFloat(thresholdResult.rows[0]?.parameter_value || 80);
    const canExitTopic = tls.mastery_result === 'mastered' && (tls.competency_score || 0) >= competencyThreshold;

    if (!canExitTopic) {
      return res.status(400).json({
        error: 'Competency threshold not achieved yet. Continue mixed practice before exiting this topic.',
        mastery_result: tls.mastery_result,
        competency_score: tls.competency_score || 0,
        required_competency: competencyThreshold
      });
    }

    await db.query(
      `UPDATE topic_learning_session SET current_phase = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    if (tls.session_id) {
      await db.query(
        `UPDATE session SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [tls.session_id]
      );
    }

    let notesGenerated = false;
    try {
      const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const axiosLib = require('axios');

      let weakSubtopics = [];
      let misconceptions = [];

      if (tls.diagnostic_id) {
        const diagResult = await db.query(
          'SELECT misconception_tags FROM diagnostic_assessment WHERE id = $1',
          [tls.diagnostic_id]
        );
        if (diagResult.rows.length > 0 && diagResult.rows[0].misconception_tags) {
          try {
            const tags = JSON.parse(diagResult.rows[0].misconception_tags);
            weakSubtopics = tags.map(t => t.subtopic).filter(Boolean);
            misconceptions = tags.map(t => t.type || t.description).filter(Boolean);
          } catch (e) {}
        }
      }

      const aiRes = await axiosLib.post(`${AI_SERVICE_URL}/generate-notes`, {
        subject: tls.subject,
        topic: tls.topic,
        weak_subtopics: weakSubtopics.length > 0 ? weakSubtopics : null,
        mastery_status: tls.mastery_result,
        mcq_accuracy: tls.mcq_accuracy,
        core_coverage: tls.core_coverage,
        misconceptions: misconceptions.length > 0 ? misconceptions : null
      }, { timeout: 60000 });

      const noteId = db.generateUUID();
      await db.query(
        `INSERT INTO exam_trigger_notes (id, user_id, subject, topic, trigger_lines, differentiation_table, recall_bullets)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, subject, topic)
         DO UPDATE SET trigger_lines = $5, differentiation_table = $6, recall_bullets = $7, generated_at = CURRENT_TIMESTAMP`,
        [
          noteId, userId, tls.subject, tls.topic,
          JSON.stringify(aiRes.data.trigger_lines || []),
          JSON.stringify(aiRes.data.differentiation_table || []),
          JSON.stringify(aiRes.data.recall_bullets || [])
        ]
      );
      notesGenerated = true;
    } catch (noteErr) {
      console.error('Auto-generate notes on completion failed:', noteErr.message);
    }

    res.json({
      message: 'Topic learning session completed',
      session_id: id,
      exam_trigger_notes_generated: notesGenerated,
      subject: tls.subject,
      topic: tls.topic
    });
  } catch (error) {
    console.error('Complete topic session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseKeyPoints(raw) {
  const points = parseJsonArray(raw);
  return points.filter(Boolean).map((p) => String(p).trim()).filter(Boolean);
}

function parsePreviousYearWeight(raw) {
  const tags = parseJsonArray(raw);
  if (tags.length > 0) return Math.min(tags.length, 5);
  if (typeof raw === 'string' && raw.trim()) return 1;
  return 0;
}

function getQuestionPriority(question, weakSubtopics, profileLevel) {
  const yieldWeight = {
    core: 4,
    frequent: 3,
    occasional: 2,
    rare: 1
  }[question.yield_category] || 1;

  const weakBoost = weakSubtopics.includes(question.subtopic) ? 2 : 0;
  const pyqWeight = parsePreviousYearWeight(question.previous_year_tags) * 0.6;

  let profileBoost = 0;
  if (profileLevel === 'struggling' || profileLevel === 'needs_foundation') {
    profileBoost = question.difficulty === 'easy' ? 1 : (question.difficulty === 'medium' ? 0.6 : 0);
  } else if (profileLevel === 'mastering_fast') {
    profileBoost = question.difficulty === 'hard' ? 1 : (question.difficulty === 'medium' ? 0.6 : 0.2);
  } else {
    profileBoost = question.difficulty === 'medium' ? 0.8 : 0.4;
  }

  const keyPointBoost = Math.min(parseKeyPoints(question.key_points).length, 3) * 0.25;
  const typeBoost = ['saq', 'case_based'].includes(question.type) ? 1.2 : 0.4;
  return yieldWeight + weakBoost + pyqWeight + profileBoost + keyPointBoost + typeBoost;
}

function serializeQuestionForClient(q) {
  return {
    id: q.id,
    stem: q.stem,
    type: q.type,
    subject: q.subject,
    topic: q.topic,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    yield_category: q.yield_category,
    options: q.options
  };
}

function buildConceptFollowUp(question, evaluation, retryCount) {
  const keyPoints = parseKeyPoints(question.key_points);
  const hintSource = evaluation.feedback?.improvements || evaluation.feedback?.model_explanation || '';
  const shortHint = String(hintSource).split(/[.?!]/).find(Boolean)?.trim() || 'Focus on the highest-yield differentiator for this stem.';
  const fallbackProbe = keyPoints.length > 0
    ? `Can you now include this missing idea: ${keyPoints[Math.min(retryCount - 1, keyPoints.length - 1)]}?`
    : `Try again in 1-2 lines: what is the single best clue that supports your answer?`;

  return {
    hint: shortHint,
    subquestion: fallbackProbe
  };
}

function interleaveQuestions(objectiveQuestions, shortAnswerQuestions) {
  const mixed = [];
  const objective = [...objectiveQuestions];
  const shortAnswer = [...shortAnswerQuestions];

  while (objective.length > 0 || shortAnswer.length > 0) {
    if (objective.length > 0) mixed.push(objective.shift());
    if (shortAnswer.length > 0) mixed.push(shortAnswer.shift());
  }

  const seen = new Set();
  return mixed.filter((q) => {
    if (!q?.id || seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
}

async function buildConceptTeachingPlan({ tls, userId, profile, weakSubtopics, focusBuckets, targetCount = 5 }) {
  const candidateResult = await db.query(
    `SELECT * FROM question
     WHERE subject = $1 AND topic = $2 AND status = 'active'
       AND type IN ('saq', 'case_based', 'mcq', 'true_false', 'assertion_reason')
     ORDER BY RANDOM()
     LIMIT 80`,
    [tls.subject, tls.topic]
  );

  const candidates = candidateResult.rows || [];
  const ranked = candidates
    .map((q) => ({
      question: q,
      priority: getQuestionPriority(q, weakSubtopics, profile.level)
    }))
    .sort((a, b) => b.priority - a.priority);

  const selected = [];
  const usedSubtopics = new Set();

  for (const item of ranked) {
    const subtopic = item.question.subtopic || `__none__${item.question.id}`;
    if (usedSubtopics.has(subtopic) && selected.length >= 3) {
      continue;
    }
    selected.push(item.question);
    usedSubtopics.add(subtopic);
    if (selected.length >= targetCount) break;
  }

  if (selected.length < Math.min(4, targetCount)) {
    for (const item of ranked) {
      if (selected.find((q) => q.id === item.question.id)) continue;
      selected.push(item.question);
      if (selected.length >= Math.min(4, targetCount)) break;
    }
  }

  const corePoints = [];
  for (const question of selected) {
    const points = parseKeyPoints(question.key_points);
    for (const point of points) {
      if (!corePoints.includes(point)) {
        corePoints.push(point);
      }
      if (corePoints.length >= 8) break;
    }
    if (corePoints.length >= 8) break;
  }

  if (corePoints.length === 0) {
    const fallbackPoints = focusBuckets.map((bucket) => `${bucket} concepts`).slice(0, 4);
    corePoints.push(...fallbackPoints);
  }

  let anchors = selected.slice(0, targetCount);
  const minRequired = Math.max(4, Math.min(5, targetCount));
  if (anchors.length < minRequired) {
    const missingCount = minRequired - anchors.length;
    const pyqExamples = candidates.slice(0, 8).map((q) => ({
      stem: q.stem,
      subtopic: q.subtopic
    }));

    const generated = await generateSaqAnchors({
      subject: tls.subject,
      topic: tls.topic,
      count: missingCount,
      corePoints,
      pyqExamples
    });

    const generatedQuestions = await persistGeneratedAnchors({
      generatedQuestions: generated.questions || [],
      subject: tls.subject,
      topic: tls.topic,
      userId
    });

    anchors = anchors.concat(generatedQuestions);
  }

  return {
    anchorQuestions: anchors.slice(0, Math.max(targetCount, minRequired)),
    corePoints
  };
}

async function persistGeneratedAnchors({ generatedQuestions, subject, topic, userId }) {
  const persisted = [];
  for (const gq of generatedQuestions) {
    const stem = String(gq.stem || '').trim();
    if (!stem) continue;
    const id = db.generateUUID();
    const type = 'saq';
    const subtopic = String(gq.subtopic || topic).trim() || topic;
    const difficulty = ['easy', 'medium', 'hard'].includes(String(gq.difficulty || '').toLowerCase())
      ? String(gq.difficulty).toLowerCase()
      : 'medium';
    const yieldCategory = ['core', 'frequent', 'occasional', 'rare'].includes(String(gq.yield_category || '').toLowerCase())
      ? String(gq.yield_category).toLowerCase()
      : 'core';
    const idealAnswer = String(gq.ideal_answer || '').trim() || `Explain the key concept for ${topic}.`;
    const keyPoints = Array.isArray(gq.key_points) ? gq.key_points : [];
    const normalizedKeyPoints = keyPoints.map((p) => String(p).trim()).filter(Boolean).slice(0, 6);

    await db.query(
      `INSERT INTO question
       (id, stem, type, subject, topic, subtopic, difficulty, importance, yield_category,
        cognitive_focus, ideal_answer, key_points, previous_year_tags, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'medium', $8, 'conceptual', $9, $10, $11, 'active', $12)`,
      [
        id,
        stem,
        type,
        subject,
        topic,
        subtopic,
        difficulty,
        yieldCategory,
        idealAnswer,
        JSON.stringify(normalizedKeyPoints),
        JSON.stringify(['ai_generated_anchor']),
        userId || null
      ]
    );

    const inserted = await db.query('SELECT * FROM question WHERE id = $1', [id]);
    if (inserted.rows.length > 0) {
      persisted.push(inserted.rows[0]);
    }
  }
  return persisted;
}

async function persistGeneratedObjectiveQuestions({ generatedQuestions, subject, topic, userId }) {
  const persisted = [];
  for (const gq of generatedQuestions) {
    const stem = String(gq.stem || '').trim();
    if (!stem) continue;
    const options = gq.options && typeof gq.options === 'object' ? gq.options : null;
    const normalizedOptions = {
      A: String(options?.A || '').trim(),
      B: String(options?.B || '').trim(),
      C: String(options?.C || '').trim(),
      D: String(options?.D || '').trim()
    };
    if (!normalizedOptions.A || !normalizedOptions.B || !normalizedOptions.C || !normalizedOptions.D) {
      continue;
    }

    const id = db.generateUUID();
    const type = 'mcq';
    const subtopic = String(gq.subtopic || topic).trim() || topic;
    const difficulty = ['easy', 'medium', 'hard'].includes(String(gq.difficulty || '').toLowerCase())
      ? String(gq.difficulty).toLowerCase()
      : 'medium';
    const yieldCategory = ['core', 'frequent', 'occasional', 'rare'].includes(String(gq.yield_category || '').toLowerCase())
      ? String(gq.yield_category).toLowerCase()
      : 'core';
    const idealAnswer = String(gq.ideal_answer || '').trim() || `Identify the best answer for ${topic}.`;
    const keyPoints = Array.isArray(gq.key_points) ? gq.key_points : [];
    const normalizedKeyPoints = keyPoints.map((p) => String(p).trim()).filter(Boolean).slice(0, 6);
    const correctAnswer = ['A', 'B', 'C', 'D'].includes(String(gq.correct_answer || '').toUpperCase())
      ? String(gq.correct_answer).toUpperCase()
      : 'A';

    await db.query(
      `INSERT INTO question
       (id, stem, type, subject, topic, subtopic, difficulty, importance, yield_category,
        cognitive_focus, ideal_answer, key_points, previous_year_tags, options, correct_answer, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'medium', $8, 'conceptual', $9, $10, $11, $12, $13, 'active', $14)`,
      [
        id,
        stem,
        type,
        subject,
        topic,
        subtopic,
        difficulty,
        yieldCategory,
        idealAnswer,
        JSON.stringify(normalizedKeyPoints),
        JSON.stringify(['ai_generated_mixed_practice']),
        JSON.stringify(normalizedOptions),
        correctAnswer,
        userId || null
      ]
    );

    const inserted = await db.query('SELECT * FROM question WHERE id = $1', [id]);
    if (inserted.rows.length > 0) {
      persisted.push(inserted.rows[0]);
    }
  }
  return persisted;
}

async function evaluateWithFallback(question, answerText, userId) {
  const isMCQType = ['mcq', 'true_false', 'assertion_reason'].includes(question.type);
  const hasCorrectAnswer = question.correct_answer && question.correct_answer.trim() !== '';

  if (isMCQType && hasCorrectAnswer) {
    const isCorrect = answerText.trim().toUpperCase() === question.correct_answer.trim().toUpperCase();
    const score = isCorrect ? 100 : 0;
    let parsedOptions = {};
    if (question.options) {
      try {
        parsedOptions = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
      } catch (e) {}
    }
    const correctText = parsedOptions[question.correct_answer.trim().toUpperCase()] || question.correct_answer;

    return {
      score,
      feedback: {
        is_mcq: true,
        is_correct: isCorrect,
        correct_option: question.correct_answer.trim().toUpperCase(),
        correct_text: correctText,
        model_explanation: question.ideal_answer || ''
      },
      teacher_response: isCorrect
        ? `Good job. The correct answer is ${question.correct_answer.trim().toUpperCase()}. Can you state in one line why this option is best?`
        : `Good attempt. The correct answer is ${question.correct_answer.trim().toUpperCase()}, ${correctText}. What clue in the stem rules out your chosen option?`,
      mastery_impact: { delta: 0 }
    };
  }

  try {
    return await evaluateAnswer({
      question,
      studentAnswer: answerText,
      currentMastery: 0,
      userId
    });
  } catch (error) {
    console.error('AI evaluation fallback:', error);
    return {
      score: 50,
      feedback: {
        strengths: 'Thank you for your answer.',
        improvements: 'Keep practicing.',
        model_explanation: question.ideal_answer || ''
      },
      teacher_response: 'You made a sincere attempt. Focus on the core concept first, then connect it to one stem clue. What is your one-line takeaway from this question?',
      mastery_impact: { delta: 0 }
    };
  }
}

module.exports = router;

