const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireDailyLimit } = require('../middleware/subscription');
const { db } = require('../db');
const { evaluateAnswer } = require('../services/ai');
const { startConceptMapSessionFromDiagnostic } = require('../services/diagnostic-to-tutoring');
const { getNextConcept, getFirstConcept } = require('../services/concept-map-pathway');
const { classifyStudentLevel } = require('../services/student-level-classifier');
const { scoreAnswerAgainstConcept } = require('../services/rubric-scorer');
const { buildTutorFlowPlan } = require('../services/tutor-flow-orchestrator');
const { logTutorEvent } = require('../services/tutor-monitoring');
const {
  safeParseJson,
  serializeTopicConcept,
  mapStudentLevelToDiagnosticLevel,
  levelToMasteryStatus,
  buildTutorPlan
} = require('../services/diagnostic-tutor-rules');

async function loadConceptForDiagnostic(subject, topic, preferredConceptId = null) {
  let query = `
    SELECT * FROM topic_concept
    WHERE subject = $1 AND topic = $2
  `;
  const params = [subject, topic];
  if (preferredConceptId) {
    query += ' AND id = $3';
    params.push(preferredConceptId);
  }
  query += ' ORDER BY display_order ASC, concept_key ASC LIMIT 1';
  const result = await db.query(query, params);
  return result.rows[0] ? serializeTopicConcept(result.rows[0]) : null;
}

function normalizePromptText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.prompt || value.text || value.label || value.description || '';
  }
  return String(value);
}

router.get('/topics', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;

    let query = `
      SELECT subject, topic, COUNT(*) as question_count,
             SUM(CASE WHEN yield_category = 'core' THEN 1 ELSE 0 END) as core_count,
             SUM(CASE WHEN yield_category = 'frequent' THEN 1 ELSE 0 END) as frequent_count,
             SUM(CASE WHEN type = 'saq' THEN 1 ELSE 0 END) as saq_count
      FROM question
      WHERE status = 'active'
        AND type IN ('saq', 'mcq', 'case_based', 'true_false', 'assertion_reason')`;
    const params = [];
    let paramCount = 1;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }

    query += ' GROUP BY subject, topic ORDER BY subject, topic';

    const result = await db.query(query, params);

    const userId = req.user.userId;
    const masteryResult = await db.query(
      'SELECT topic, subject, mastery_status, diagnostic_level, mastery_level FROM topicmastery WHERE user_id = $1',
      [userId]
    );

    const masteryMap = {};
    masteryResult.rows.forEach(m => {
      masteryMap[`${m.subject}|${m.topic}`] = m;
    });

    const topics = result.rows.map(row => {
      const key = `${row.subject}|${row.topic}`;
      const mastery = masteryMap[key];
      return {
        subject: row.subject,
        topic: row.topic,
        question_count: parseInt(row.question_count),
        core_count: parseInt(row.core_count || 0),
        frequent_count: parseInt(row.frequent_count || 0),
        saq_count: parseInt(row.saq_count || 0),
        mastery_status: mastery?.mastery_status || 'not_started',
        diagnostic_level: mastery?.diagnostic_level || null,
        mastery_level: mastery?.mastery_level || 0
      };
    });

    const subjects = [...new Set(topics.map(t => t.subject))].sort();

    res.json({ topics, subjects });
  } catch (error) {
    console.error('Get diagnostic topics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/start', authenticate, requireDailyLimit('daily_diagnostic_limit'), async (req, res) => {
  try {
    const userId = req.user.userId;
    let { subject, topic, next_from_concept_id, for_concept_id, first_for_subject } = req.body;

    if (for_concept_id) {
      const { resolveConceptId } = require('../services/concept-map-pathway');
      const resolved = await resolveConceptId(for_concept_id);
      if (!resolved) {
        return res.status(404).json({ error: 'Concept not found' });
      }
      subject = resolved.subject;
      topic = resolved.topic;
    } else if (next_from_concept_id) {
      const nextConcept = await getNextConcept(next_from_concept_id);
      if (!nextConcept) {
        return res.status(404).json({ error: 'No next concept in pathway' });
      }
      subject = nextConcept.subject;
      topic = nextConcept.topic;
    } else if (first_for_subject && !subject) {
      return res.status(400).json({ error: 'subject required when using first_for_subject' });
    } else if (first_for_subject) {
      const firstConcept = await getFirstConcept(subject);
      if (!firstConcept) {
        return res.status(404).json({ error: 'No concepts found for subject' });
      }
      subject = firstConcept.subject;
      topic = firstConcept.topic;
    }

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required (or use next_from_concept_id)' });
    }

    const concept = await loadConceptForDiagnostic(subject, topic, for_concept_id || null);
    const conceptPlan = concept ? buildTutorPlan(concept) : null;
    const conceptPlanLength = Array.isArray(conceptPlan?.checkpoints) ? conceptPlan.checkpoints.length : 0;

    let saqQuestions = [];
    if (concept) {
      const microQuestions = Array.isArray(concept.micro_questions) ? concept.micro_questions : [];
      const fallbackQuestions = Array.isArray(concept.leading_questions) ? concept.leading_questions : [];
      const stem = normalizePromptText(
        microQuestions[0]?.question
        || microQuestions[0]?.stem
        || fallbackQuestions[0]
        || null
      );
      if (stem) {
        const questionId = db.generateUUID();
        const idealAnswer = normalizePromptText(
          microQuestions[0]?.compact_answer
          || concept.saqs?.[0]?.compact_answer
          || concept.concept_explanation
          || ''
        );
        const keyPoints = Array.isArray(concept.core_points)
          ? concept.core_points
          : (Array.isArray(concept.must_know_points) ? concept.must_know_points : []);
        const questionTags = Array.isArray(concept.downstream_concept_ids)
          ? concept.downstream_concept_ids
          : [];

        await db.query(
          `INSERT INTO question
           (id, stem, type, subject, topic, subtopic, difficulty, importance, yield_category,
            cognitive_focus, ideal_answer, key_points, concept_tags, status, created_by, concept_id)
           VALUES ($1, $2, 'saq', $3, $4, $5, 'medium', 'medium', 'core',
                   'conceptual', $6, $7, $8, 'active', $9, $10)`,
          [
            questionId,
            stem,
            subject,
            topic,
            concept.name || null,
            idealAnswer || null,
            JSON.stringify(keyPoints),
            JSON.stringify(questionTags),
            userId,
            concept.id
          ]
        );

        saqQuestions = [{
          id: questionId,
          stem,
          type: 'saq',
          subject,
          topic,
          subtopic: concept.name,
          difficulty: 'medium',
          yield_category: 'core',
          options: null,
          concept_id: concept.id
        }];
      }
    }

    if (saqQuestions.length === 0) {
      const fromQuestionTable = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type = 'saq'
         ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END,
                  RANDOM()
         LIMIT 1`,
        [subject, topic]
      );
      saqQuestions = fromQuestionTable.rows;
    }

    if (saqQuestions.length === 0) {
      return res.status(404).json({
        error: 'No questions available for this topic. Ask an admin to add questions first.'
      });
    }

    const diagnosticId = db.generateUUID();
    const questionIds = saqQuestions.map(q => q.id);
    const tutorState = {
      concept_id: concept?.id || null,
      concept_plan: conceptPlan,
      student_level: null,
      mastery_status: 'in_progress'
    };

    await db.query(
      `INSERT INTO diagnostic_assessment
       (id, user_id, subject, topic, concept_id, concept_plan, saq_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [diagnosticId, userId, subject, topic, tutorState.concept_id, JSON.stringify(conceptPlan), JSON.stringify(questionIds)]
    );

    const sessionId = db.generateUUID();
    await db.query(
      `INSERT INTO session (id, user_id, session_type, configuration, status)
       VALUES ($1, $2, 'practice', $3, 'in_progress')`,
      [sessionId, userId, JSON.stringify({ type: 'diagnostic', subject, topic, diagnostic_id: diagnosticId })]
    );

    const tlsId = db.generateUUID();
    const profileResult = await db.query(
      'SELECT goal_tier FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const goalTier = profileResult.rows[0]?.goal_tier || 'good_rank';

    await db.query(
      `INSERT INTO topic_learning_session
       (id, user_id, session_id, subject, topic, current_phase, goal_tier, diagnostic_id)
       VALUES ($1, $2, $3, $4, $5, 'diagnostic', $6, $7)`,
      [tlsId, userId, sessionId, subject, topic, goalTier, diagnosticId]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      session_id: sessionId,
      diagnostic_id: diagnosticId,
      topic_learning_session_id: tlsId,
      subject,
      topic,
      concept_id: tutorState.concept_id,
      phase: 'saq',
      event_type: 'diagnostic_start',
      message: 'Diagnostic session started',
      metadata: {
        question_count: questionIds.length,
        concept_plan_length: conceptPlanLength,
        goal_tier: goalTier
      }
    });

    const questionsForClient = saqQuestions.map(q => ({
      id: q.id,
      stem: q.stem,
      type: q.type,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      yield_category: q.yield_category,
      options: q.options,
      concept_id: q.concept_id || concept?.id || null
    }));

    res.status(201).json({
      diagnostic_id: diagnosticId,
      session_id: sessionId,
      topic_learning_session_id: tlsId,
      subject,
      topic,
      concept: concept || null,
      concept_plan: conceptPlan,
      questions: questionsForClient,
      total_questions: questionsForClient.length
    });
  } catch (error) {
    console.error('Start diagnostic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { question_id, answer_text, answer_method = 'text', language, time_spent_seconds = 0 } = req.body;

    if (!question_id || !answer_text || !answer_text.trim()) {
      return res.status(400).json({ error: 'Question ID and answer text are required' });
    }

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const diagnosticConcept = diagnostic.concept_id
      ? await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, diagnostic.concept_id)
      : null;

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [question_id]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const question = questionResult.rows[0];
    const questionConcept = diagnosticConcept || (question.concept_id
      ? await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, question.concept_id)
      : null);

    const isMCQType = ['mcq', 'true_false', 'assertion_reason'].includes(question.type);
    const hasCorrectAnswer = question.correct_answer && question.correct_answer.trim() !== '';
    let evaluation;

    if (isMCQType && hasCorrectAnswer) {
      const isCorrect = answer_text.trim().toUpperCase() === question.correct_answer.trim().toUpperCase();
      const score = isCorrect ? 100 : 0;

      let parsedOptions = {};
      if (question.options) {
        try {
          parsedOptions = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        } catch (e) {
          parsedOptions = {};
        }
      }

      const correctText = parsedOptions[question.correct_answer.trim().toUpperCase()] || question.correct_answer;

      evaluation = {
        score,
        feedback: {
          is_mcq: true,
          is_correct: isCorrect,
          correct_option: question.correct_answer.trim().toUpperCase(),
          correct_text: correctText,
          strengths: isCorrect ? 'Correct!' : 'Incorrect.',
          improvements: isCorrect ? 'Well done.' : `The correct answer is ${question.correct_answer.trim().toUpperCase()}) ${correctText}`,
          model_explanation: question.ideal_answer || ''
        },
        mastery_impact: { delta: 0 }
      };
    } else {
      try {
        evaluation = await evaluateAnswer({
          question,
          studentAnswer: answer_text,
          currentMastery: 0,
          userId
        });
      } catch (error) {
        console.error('Diagnostic AI evaluation error:', error);
        evaluation = {
          score: 50,
          feedback: {
            strengths: 'Thank you for your answer.',
            improvements: 'Keep practicing.',
            model_explanation: question.ideal_answer || ''
          },
          mastery_impact: { delta: 0 }
        };
      }
    }

    const conceptForScoring = questionConcept || {
      grading_rubric: safeParseJson(question.key_points, []),
      traps: safeParseJson(question.trap_pattern, []),
      saqs: [{ compact_answer: question.ideal_answer || '' }]
    };

    const wordCount = answer_text.trim().split(/\s+/).filter(Boolean).length;
    let studentLevelResult;
    let scoreResult;

    if (wordCount < 6) {
      const rubric = Array.isArray(conceptForScoring.grading_rubric) ? conceptForScoring.grading_rubric : [];
      const pointsMissed = rubric.map(item => {
        const id = item.id || item.label;
        const label = item.label || item.id || '';
        return {
          id,
          label,
          description: item.description || ''
        };
      });
      scoreResult = {
        scorePercent: 0,
        pointsHit: [],
        pointsMissed,
        pointsExpected: pointsMissed.length,
        pointsTotal: pointsMissed.length
      };
      studentLevelResult = {
        level: 'very_weak',
        score_percent: 0,
        misconception_count: 0,
        misconceptions: [],
        points_hit: 0,
        points_missed: pointsMissed.length,
        points_total: pointsMissed.length,
        word_count: wordCount
      };
    } else {
      studentLevelResult = classifyStudentLevel(conceptForScoring, answer_text);
      scoreResult = scoreAnswerAgainstConcept(
        conceptForScoring,
        answer_text,
        studentLevelResult.level === 'excellent' || studentLevelResult.level === 'strong' ? 'top' : 'mid'
      );
    }
    const tutorFlow = questionConcept
      ? buildTutorFlowPlan({
          concept: questionConcept,
          studentLevelResult,
          scoreResult,
          answerText: answer_text.trim(),
          phase: 'saq',
          usedMcqIds: []
        })
      : null;

    const sessionResult = await db.query(
      `SELECT s.id FROM session s
       JOIN topic_learning_session tls ON tls.session_id = s.id
       WHERE tls.diagnostic_id = $1 AND s.user_id = $2
       LIMIT 1`,
      [id, userId]
    );
    const sessionId = sessionResult.rows[0]?.id || null;

    const attemptId = db.generateUUID();
    await db.query(
      `INSERT INTO attempt
       (id, user_id, question_id, session_id, answer_text, answer_method, language,
        ai_feedback, ai_score, time_spent_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [attemptId, userId, question_id, sessionId, answer_text, answer_method,
       language || null, JSON.stringify(evaluation.feedback), evaluation.score, time_spent_seconds]
    );

    const existingAnswers = diagnostic.saq_answers ? JSON.parse(diagnostic.saq_answers) : {};
    const existingScores = diagnostic.saq_scores ? JSON.parse(diagnostic.saq_scores) : {};

    existingAnswers[question_id] = { text: answer_text, attempt_id: attemptId };
  const perQuestionScore = typeof scoreResult.scorePercent === 'number'
    ? scoreResult.scorePercent
    : evaluation.score;
  existingScores[question_id] = perQuestionScore;

    await db.query(
      `UPDATE diagnostic_assessment SET saq_answers = $1, saq_scores = $2 WHERE id = $3`,
      [JSON.stringify(existingAnswers), JSON.stringify(existingScores), id]
    );

    const nextRevDays = evaluation.score >= 70 ? 3 : 1;
    const nextRev = new Date();
    nextRev.setDate(nextRev.getDate() + nextRevDays);
    const nextRevisionDate = nextRev.toISOString().split('T')[0];
    const tmResult = await db.query(
      'SELECT id FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
      [userId, diagnostic.topic, diagnostic.subject]
    );
    if (tmResult.rows.length > 0) {
      await db.query(
        'UPDATE topicmastery SET next_revision_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [nextRevisionDate, tmResult.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO topicmastery (id, user_id, topic, subject, mastery_level, next_revision_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [db.generateUUID(), userId, diagnostic.topic, diagnostic.subject, evaluation.score, nextRevisionDate]
      );
    }

    const finalScore = typeof scoreResult.scorePercent === 'number'
      ? scoreResult.scorePercent
      : evaluation.score;

    res.json({
      attempt_id: attemptId,
      score: finalScore,
      feedback: evaluation.feedback,
      student_level: studentLevelResult.level,
      mastery_status: levelToMasteryStatus(studentLevelResult.level),
      concept_id: questionConcept?.id || diagnostic.concept_id || null,
      concept_name: questionConcept?.name || null,
      next_teacher_prompt: tutorFlow?.next_teacher_prompt || null,
      missing_points: scoreResult.pointsMissed || [],
      teacher_response: evaluation.teacher_response || tutorFlow?.next_teacher_prompt || null,
      tutor_step: tutorFlow?.tutor_step || null,
      tutor_flow: tutorFlow
    });
  } catch (error) {
    console.error('Diagnostic answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/saq-answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { answer_text, answer_method = 'text', language, time_spent_seconds = 0 } = req.body;

    if (!answer_text || !answer_text.trim()) {
      return res.status(400).json({ error: 'Answer text is required' });
    }

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const concept = diagnostic.concept_id
      ? await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, diagnostic.concept_id)
      : null;

    const conceptForScoring = concept || {
      grading_rubric: [],
      traps: [],
      saqs: []
    };

    const wordCount = answer_text.trim().split(/\s+/).filter(Boolean).length;
    let studentLevelResult;
    let scoreResult;

    if (wordCount < 6) {
      const rubric = Array.isArray(conceptForScoring.grading_rubric) ? conceptForScoring.grading_rubric : [];
      const pointsMissed = rubric.map(item => ({
        id: item.id || item.label,
        label: item.label || item.id || '',
        description: item.description || ''
      }));
      scoreResult = {
        scorePercent: 0,
        pointsHit: [],
        pointsMissed,
        pointsExpected: pointsMissed.length,
        pointsTotal: pointsMissed.length
      };
      studentLevelResult = {
        level: 'very_weak',
        score_percent: 0,
        misconception_count: 0,
        misconceptions: [],
        points_hit: 0,
        points_missed: pointsMissed.length,
        points_total: pointsMissed.length,
        word_count: wordCount
      };
    } else {
      studentLevelResult = classifyStudentLevel(conceptForScoring, answer_text);
      scoreResult = scoreAnswerAgainstConcept(
        conceptForScoring,
        answer_text,
        studentLevelResult.level === 'excellent' || studentLevelResult.level === 'strong' ? 'top' : 'mid'
      );
    }

    const tutorFlow = concept
      ? buildTutorFlowPlan({
          concept,
          studentLevelResult,
          scoreResult,
          answerText: answer_text.trim(),
          phase: 'saq',
          usedMcqIds: []
        })
      : null;

    const nextPhase = concept ? (tutorFlow?.phase || 'socratic') : 'mcq';
    const mcqPlanToStore = nextPhase === 'mcq' && tutorFlow?.mcq_plan ? JSON.stringify(tutorFlow.mcq_plan) : null;

    await db.query(
      `UPDATE diagnostic_assessment
       SET student_level = $1, mastery_status = $2, phase = $3, mcq_plan = COALESCE($4, mcq_plan)
       WHERE id = $5`,
      [studentLevelResult.level, levelToMasteryStatus(studentLevelResult.level), nextPhase, mcqPlanToStore, id]
    );

    const finalScore = typeof scoreResult.scorePercent === 'number'
      ? scoreResult.scorePercent
      : 0;

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: nextPhase,
      event_type: 'diagnostic_saq_answer',
      student_level: studentLevelResult.level,
      score: finalScore,
      mastery_status: levelToMasteryStatus(studentLevelResult.level),
      next_phase: nextPhase,
      retry_count: 0,
      metadata: {
        question_id,
        word_count: wordCount,
        missing_points: (scoreResult.pointsMissed || []).length,
        tutor_step: tutorFlow?.tutor_step || null
      }
    });

    res.json({
      diagnostic_id: id,
      phase: nextPhase,
      score: finalScore,
      student_level: studentLevelResult.level,
      next_teacher_prompt: tutorFlow?.next_teacher_prompt || null,
      missing_points: scoreResult.pointsMissed || [],
      tutor_step: tutorFlow?.tutor_step || null,
      tutor_flow: tutorFlow
    });
  } catch (error) {
    console.error('Diagnostic SAQ answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/socratic-turn', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { student_answer } = req.body;

    if (!student_answer || !student_answer.trim()) {
      return res.status(400).json({ error: 'Student answer is required' });
    }

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const concept = diagnostic.concept_id
      ? await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, diagnostic.concept_id)
      : null;

    const turns = diagnostic.socratic_turns ? safeParseJson(diagnostic.socratic_turns, []) : [];
    const updatedTurns = [...turns, { student_answer }];

    const conceptForScoring = concept || {
      grading_rubric: [],
      traps: [],
      saqs: []
    };

    const allAnswersText = updatedTurns.map(t => t.student_answer).join(' ').trim();
    const wordCount = allAnswersText.split(/\s+/).filter(Boolean).length;

    let studentLevelResult;
    let scoreResult;

    if (wordCount < 6) {
      const rubric = Array.isArray(conceptForScoring.grading_rubric) ? conceptForScoring.grading_rubric : [];
      const pointsMissed = rubric.map(item => ({
        id: item.id || item.label,
        label: item.label || item.id || '',
        description: item.description || ''
      }));
      scoreResult = {
        scorePercent: 0,
        pointsHit: [],
        pointsMissed,
        pointsExpected: pointsMissed.length,
        pointsTotal: pointsMissed.length
      };
      studentLevelResult = {
        level: 'very_weak',
        score_percent: 0,
        misconception_count: 0,
        misconceptions: [],
        points_hit: 0,
        points_missed: pointsMissed.length,
        points_total: pointsMissed.length,
        word_count: wordCount
      };
    } else {
      studentLevelResult = classifyStudentLevel(conceptForScoring, allAnswersText);
      scoreResult = scoreAnswerAgainstConcept(
        conceptForScoring,
        allAnswersText,
        studentLevelResult.level === 'excellent' || studentLevelResult.level === 'strong' ? 'top' : 'mid'
      );
    }

    const tutorFlow = concept
      ? buildTutorFlowPlan({
          concept,
          studentLevelResult,
          scoreResult,
          answerText: allAnswersText,
          phase: 'socratic',
          socraticTurns: updatedTurns,
          usedMcqIds: []
        })
      : null;
    const nextPhase = tutorFlow?.phase || 'socratic';
    const remainingPoints = scoreResult.pointsMissed || [];
    const nextTeacherPrompt = nextPhase === 'socratic' && concept
      ? tutorFlow.next_teacher_prompt
      : null;

    await db.query(
      'UPDATE diagnostic_assessment SET socratic_turns = $1, phase = $2, student_level = $3, mastery_status = $4 WHERE id = $5',
      [JSON.stringify(updatedTurns), nextPhase, studentLevelResult.level, levelToMasteryStatus(studentLevelResult.level), id]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: nextPhase,
      event_type: 'diagnostic_socratic_turn',
      student_level: studentLevelResult.level,
      score: typeof scoreResult.scorePercent === 'number' ? scoreResult.scorePercent : null,
      mastery_status: levelToMasteryStatus(studentLevelResult.level),
      retry_count: updatedTurns.length,
      next_phase: nextPhase,
      metadata: {
        word_count: wordCount,
        missing_points: remainingPoints.length,
        turn_count: updatedTurns.length
      }
    });

    res.json({
      diagnostic_id: id,
      phase: nextPhase,
      student_level: studentLevelResult.level,
      missing_points: remainingPoints,
      socratic_turns: updatedTurns,
      next_teacher_prompt: nextPhase === 'final_recall'
        ? (tutorFlow?.final_recall_prompt || 'Now summarize the full answer in 4-5 exam sentences.')
        : nextTeacherPrompt,
      tutor_flow: tutorFlow
    });
  } catch (error) {
    console.error('Diagnostic Socratic turn error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/final-recall', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { answer_text } = req.body;

    if (!answer_text || !answer_text.trim()) {
      return res.status(400).json({ error: 'Final recall answer is required' });
    }

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const concept = diagnostic.concept_id
      ? await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, diagnostic.concept_id)
      : null;

    const conceptForScoring = concept || {
      grading_rubric: [],
      traps: [],
      saqs: []
    };

    const studentLevelResult = classifyStudentLevel(conceptForScoring, answer_text);
    const scoreResult = scoreAnswerAgainstConcept(
      conceptForScoring,
      answer_text,
      studentLevelResult.level === 'excellent' || studentLevelResult.level === 'strong' ? 'top' : 'mid'
    );

    const tutorFlow = concept
      ? buildTutorFlowPlan({
          concept,
          studentLevelResult,
          scoreResult,
          answerText: answer_text.trim(),
          phase: 'final_recall',
          usedMcqIds: []
        })
      : null;

    const mcqPlanToStore = tutorFlow?.mcq_plan ? JSON.stringify(tutorFlow.mcq_plan) : null;

    await db.query(
      'UPDATE diagnostic_assessment SET final_recall_answer = $1, phase = $2, student_level = $3, mastery_status = $4, mcq_plan = COALESCE($5, mcq_plan) WHERE id = $6',
      [answer_text, 'mcq', studentLevelResult.level, levelToMasteryStatus(studentLevelResult.level), mcqPlanToStore, id]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: 'mcq',
      event_type: 'diagnostic_final_recall',
      student_level: studentLevelResult.level,
      score: typeof scoreResult.scorePercent === 'number' ? scoreResult.scorePercent : null,
      mastery_status: levelToMasteryStatus(studentLevelResult.level),
      next_phase: 'mcq',
      metadata: {
        word_count: answer_text.trim().split(/\s+/).filter(Boolean).length,
        tutor_step: tutorFlow?.tutor_step || null
      }
    });

    res.json({
      diagnostic_id: id,
      phase: 'mcq',
      student_level: studentLevelResult.level,
      tutor_step: tutorFlow?.tutor_step || null,
      tutor_flow: tutorFlow
    });
  } catch (error) {
    console.error('Diagnostic final recall error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/mcqs', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const plan = diagnostic.mcq_plan ? safeParseJson(diagnostic.mcq_plan, null) : null;

    res.json({
      diagnostic_id: id,
      phase: diagnostic.phase || 'mcq',
      mcq_plan: plan
    });
  } catch (error) {
    console.error('Diagnostic get MCQs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/mcq-answer', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { mcq_id, selected_option } = req.body;

    if (!mcq_id || !selected_option) {
      return res.status(400).json({ error: 'mcq_id and selected_option are required' });
    }

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const plan = diagnostic.mcq_plan ? safeParseJson(diagnostic.mcq_plan, null) : null;
    const tutorStep = plan || {};
    const mcqs = Array.isArray(tutorStep.mcqs) ? tutorStep.mcqs : [];
    const target = mcqs.find(m => (m.id || m.mcq_id) === mcq_id);
    const correctAnswer = target?.correct_answer;
    const isCorrect = correctAnswer
      ? String(selected_option).trim().toUpperCase() === String(correctAnswer).trim().toUpperCase()
      : null;

    const results = diagnostic.mcq_results ? safeParseJson(diagnostic.mcq_results, []) : [];
    const updatedResults = [...results, { mcq_id, selected_option, is_correct: isCorrect }];

    await db.query(
      'UPDATE diagnostic_assessment SET mcq_results = $1 WHERE id = $2',
      [JSON.stringify(updatedResults), id]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: diagnostic.phase || 'mcq',
      event_type: 'diagnostic_mcq_answer',
      score: isCorrect === null ? null : (isCorrect ? 100 : 0),
      mastery_status: diagnostic.mastery_status || null,
      metadata: {
        mcq_id,
        selected_option,
        is_correct: isCorrect
      }
    });

    res.json({
      diagnostic_id: id,
      phase: diagnostic.phase || 'mcq',
      mcq_results: updatedResults
    });
  } catch (error) {
    console.error('Diagnostic MCQ answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete-block', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const level = diagnostic.student_level || 'average';
    const plan = diagnostic.mcq_plan ? safeParseJson(diagnostic.mcq_plan, null) : null;
    const results = diagnostic.mcq_results ? safeParseJson(diagnostic.mcq_results, []) : [];

    const requiredMcqs = plan?.required_mcqs || results.length || 0;
    const answered = results.length;
    const correctCount = results.filter(r => r.is_correct === true).length;

    let masteryDecision = 'continue';
    if (answered === 0 || requiredMcqs === 0) {
      masteryDecision = 'continue';
    } else {
      const ratio = correctCount / requiredMcqs;
      if (['excellent', 'strong', 'bored'].includes(level)) {
        masteryDecision = ratio >= 0.8 ? 'mastered' : 'continue';
      } else if (level === 'average') {
        masteryDecision = ratio >= 0.7 ? 'mastered' : 'relearn';
      } else {
        masteryDecision = ratio >= 0.75 ? 'mastered' : 'relearn';
      }
    }

    await db.query(
      'UPDATE diagnostic_assessment SET phase = $1, mastery_decision = $2 WHERE id = $3',
      ['completed', masteryDecision, id]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: 'completed',
      event_type: 'diagnostic_complete_block',
      student_level: level,
      mastery_status: masteryDecision,
      score: answered > 0 ? Math.round((correctCount / answered) * 100) : null,
      metadata: {
        required_mcqs: requiredMcqs,
        answered,
        correct_count: correctCount,
        mastery_decision: masteryDecision
      }
    });

    let nextConcept = null;
    if (masteryDecision === 'mastered' && diagnostic.concept_id) {
      const currentConceptRow = await loadConceptForDiagnostic(diagnostic.subject, diagnostic.topic, diagnostic.concept_id);
      if (currentConceptRow) {
        const downstreamConcepts = currentConceptRow.downstream_concept_ids || [];
        if (downstreamConcepts.length > 0) {
          const next = await getNextConcept(downstreamConcepts[0]);
          if (next) {
            nextConcept = {
              id: next.id,
              subject: next.subject,
              topic: next.topic,
              concept_key: next.concept_key
            };
          }
        }
      }
    }

    res.json({
      diagnostic_id: id,
      phase: 'completed',
      student_level: level,
      mcq_answered: answered,
      mcq_correct: correctCount,
      required_mcqs: requiredMcqs,
      mastery_decision: masteryDecision,
      next_concept: nextConcept
    });
  } catch (error) {
    console.error('Diagnostic complete block error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const diagResult = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (diagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    const diagnostic = diagResult.rows[0];
    const scores = diagnostic.saq_scores ? JSON.parse(diagnostic.saq_scores) : {};
    const questions = diagnostic.saq_questions ? JSON.parse(diagnostic.saq_questions) : [];
    const totalQuestions = questions.length;

    const scoreValues = Object.values(scores);
    const correctCount = scoreValues.filter(s => s >= 70).length;
    const rawScore = totalQuestions > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length / 100 : 0;
    const avgScore = totalQuestions > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;

    let studentLevel;
    if (avgScore >= 90) studentLevel = 'excellent';
    else if (avgScore >= 75) studentLevel = 'strong';
    else if (avgScore >= 50) studentLevel = 'average';
    else if (avgScore >= 30) studentLevel = 'weak';
    else studentLevel = 'very_weak';
    const diagnosticLevel = mapStudentLevelToDiagnosticLevel(studentLevel);

    const misconceptionTags = [];
    for (const qId of questions) {
      const score = scores[qId];
      if (score !== undefined && score < 70) {
        const qResult = await db.query('SELECT subtopic, topic FROM question WHERE id = $1', [qId]);
        if (qResult.rows.length > 0) {
          misconceptionTags.push({
            question_id: qId,
            subtopic: qResult.rows[0].subtopic || qResult.rows[0].topic,
            score: score,
            type: score < 30 ? 'concept_missing' : 'application_failure'
          });
        }
      }
    }

    await db.query(
      `UPDATE diagnostic_assessment
       SET raw_score = $1, diagnostic_level = $2, student_level = $3, mastery_status = $4, misconception_tags = $5
       WHERE id = $6`,
      [rawScore, diagnosticLevel, studentLevel, levelToMasteryStatus(studentLevel), JSON.stringify(misconceptionTags), id]
    );

    await logTutorEvent({
      user_id: userId,
      session_type: 'diagnostic',
      diagnostic_id: id,
      subject: diagnostic.subject,
      topic: diagnostic.topic,
      concept_id: diagnostic.concept_id || null,
      phase: 'completed',
      event_type: 'diagnostic_complete',
      student_level: studentLevel,
      score: Math.round(rawScore * 100) / 100,
      mastery_status: masteryStatus,
      metadata: {
        total_questions: totalQuestions,
        correct_count: correctCount,
        misconception_count: misconceptionTags.length,
        diagnostic_level: diagnosticLevel
      }
    });

    const existingMastery = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
      [userId, diagnostic.topic, diagnostic.subject]
    );

    const masteryStatus = diagnosticLevel === 'weak' ? 'relearn_core' :
                          diagnosticLevel === 'average' ? 'in_progress' :
                          diagnosticLevel === 'good' ? 'in_progress' : 'in_progress';

    const completeNextRev = new Date();
    completeNextRev.setDate(completeNextRev.getDate() + 3);
    const completeNextRevisionDate = completeNextRev.toISOString().split('T')[0];
    if (existingMastery.rows.length > 0) {
      await db.query(
        `UPDATE topicmastery SET diagnostic_level = $1, saq_raw_score = $2,
         mastery_status = $3, next_revision_date = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
        [diagnosticLevel, rawScore, masteryStatus, completeNextRevisionDate, existingMastery.rows[0].id]
      );
    } else {
      const masteryId = db.generateUUID();
      await db.query(
        `INSERT INTO topicmastery
         (id, user_id, topic, subject, mastery_level, mastery_status, diagnostic_level, saq_raw_score, next_revision_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [masteryId, userId, diagnostic.topic, diagnostic.subject,
         rawScore * 25, masteryStatus, diagnosticLevel, rawScore, completeNextRevisionDate]
      );
    }

    const tlsResult = await db.query(
      `SELECT id FROM topic_learning_session WHERE diagnostic_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (tlsResult.rows.length > 0) {
      await db.query(
        `UPDATE topic_learning_session SET diagnostic_score = $1,
         current_phase = 'concept_fixing', saq_completed = $2 WHERE id = $3`,
        [rawScore, totalQuestions, tlsResult.rows[0].id]
      );
    }

    const profileResult = await db.query(
      'SELECT goal_tier, student_category FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const goalTier = profileResult.rows[0]?.goal_tier || 'good_rank';
    const studentCategory = profileResult.rows[0]?.student_category || 'average';

    let focusBuckets;
    if (goalTier === 'top_rank' && (studentCategory === 'bright' || diagnosticLevel === 'strong')) {
      focusBuckets = ['core', 'frequent', 'occasional'];
    } else if (goalTier === 'good_rank' || diagnosticLevel === 'good') {
      focusBuckets = ['core', 'frequent'];
    } else {
      focusBuckets = ['core'];
    }

    if (tlsResult.rows.length > 0) {
      await db.query(
        `UPDATE topic_learning_session SET focus_buckets = $1 WHERE id = $2`,
        [JSON.stringify(focusBuckets), tlsResult.rows[0].id]
      );
    }

    let conceptMapSession = null;
    try {
      const tutoringResult = await startConceptMapSessionFromDiagnostic(userId, id, { inferredStudentLevel: studentLevel });
      if (!tutoringResult.error && tutoringResult.session_id) {
        conceptMapSession = {
          session_id: tutoringResult.session_id,
          subject: tutoringResult.subject,
          topic: tutoringResult.topic,
          student_level: tutoringResult.student_level,
          next_step: tutoringResult.next_step,
          completed: tutoringResult.completed
        };
      }
    } catch (e) {
      console.error('Auto-start tutoring from diagnostic:', e.message);
    }

    res.json({
      diagnostic_id: id,
      raw_score: rawScore,
      correct_count: correctCount,
      total_questions: totalQuestions,
      diagnostic_level: diagnosticLevel,
      student_level: studentLevel,
      concept_id: diagnostic.concept_id || null,
      concept_plan: safeParseJson(diagnostic.concept_plan, null),
      misconception_tags: misconceptionTags,
      focus_buckets: focusBuckets,
      next_phase: 'concept_fixing',
      recommendation: getRecommendation(diagnosticLevel, focusBuckets),
      concept_map_session: conceptMapSession
    });
  } catch (error) {
    console.error('Complete diagnostic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM diagnostic_assessment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Diagnostic assessment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get diagnostic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT * FROM diagnostic_assessment WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    res.json({ assessments: result.rows });
  } catch (error) {
    console.error('Get diagnostics history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getRecommendation(level, buckets) {
  const bucketLabel = buckets.join(', ');
  switch (level) {
    case 'weak':
      return `Your foundation needs strengthening. Focus on ${bucketLabel} concepts with targeted explanations and practice.`;
    case 'average':
      return `You have a fair understanding. Let's solidify ${bucketLabel} areas with focused SAQs and concept-fixing exercises.`;
    case 'good':
      return `Good grasp of the fundamentals! We'll refine ${bucketLabel} zones and move to clinical application.`;
    case 'strong':
      return `Excellent foundation! We'll challenge you with ${bucketLabel} areas including harder clinical MCQs and trap questions.`;
    default:
      return `Let's begin working on ${bucketLabel} areas to build mastery.`;
  }
}

module.exports = router;

