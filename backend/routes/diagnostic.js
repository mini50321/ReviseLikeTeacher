const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireDailyLimit } = require('../middleware/subscription');
const { db } = require('../db');
const { evaluateAnswer } = require('../services/ai');
const { startConceptMapSessionFromDiagnostic } = require('../services/diagnostic-to-tutoring');
const { getNextConcept, getFirstConcept } = require('../services/concept-map-pathway');

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

    // Single-SAQ Socratic flow: 1 question to infer level and teach
    let saqQuestions = await db.query(
      `SELECT * FROM question
       WHERE subject = $1 AND topic = $2 AND status = 'active'
         AND type = 'saq'
         AND (yield_category = 'core' OR yield_category = 'frequent')
       ORDER BY CASE yield_category WHEN 'core' THEN 1 WHEN 'frequent' THEN 2 ELSE 3 END,
                RANDOM()
       LIMIT 1`,
      [subject, topic]
    );

    if (saqQuestions.rows.length === 0) {
      saqQuestions = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type = 'saq'
         ORDER BY RANDOM()
         LIMIT 1`,
        [subject, topic]
      );
    }

    if (saqQuestions.rows.length === 0) {
      const allQuestions = await db.query(
        `SELECT * FROM question
         WHERE subject = $1 AND topic = $2 AND status = 'active'
           AND type IN ('saq', 'mcq', 'case_based', 'true_false', 'assertion_reason')
         ORDER BY CASE type WHEN 'saq' THEN 1 WHEN 'case_based' THEN 2 ELSE 3 END,
                  RANDOM()
         LIMIT 1`,
        [subject, topic]
      );
      saqQuestions = allQuestions;
    }

    if (saqQuestions.rows.length === 0) {
      return res.status(404).json({
        error: 'No questions available for this topic. Ask an admin to add questions first.'
      });
    }

    const diagnosticId = db.generateUUID();
    const questionIds = saqQuestions.rows.map(q => q.id);

    await db.query(
      `INSERT INTO diagnostic_assessment
       (id, user_id, subject, topic, saq_questions)
       VALUES ($1, $2, $3, $4, $5)`,
      [diagnosticId, userId, subject, topic, JSON.stringify(questionIds)]
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

    const questionsForClient = saqQuestions.rows.map(q => ({
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

    res.status(201).json({
      diagnostic_id: diagnosticId,
      session_id: sessionId,
      topic_learning_session_id: tlsId,
      subject,
      topic,
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

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [question_id]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const question = questionResult.rows[0];

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
    existingScores[question_id] = evaluation.score;

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

    res.json({
      attempt_id: attemptId,
      score: evaluation.score,
      feedback: evaluation.feedback,
      teacher_response: evaluation.teacher_response || null
    });
  } catch (error) {
    console.error('Diagnostic answer error:', error);
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

    // Single-SAQ flow: infer 6-level from score (excellent/strong/average/weak/very_weak; bored requires word count, skip for now)
    let studentLevel;
    if (avgScore >= 90) studentLevel = 'excellent';
    else if (avgScore >= 75) studentLevel = 'strong';
    else if (avgScore >= 50) studentLevel = 'average';
    else if (avgScore >= 30) studentLevel = 'weak';
    else studentLevel = 'very_weak';
    // topicmastery.diagnostic_level expects weak/average/good/strong
    const diagnosticLevel = ['excellent', 'strong', 'bored'].includes(studentLevel) ? 'strong'
      : studentLevel === 'average' ? 'average'
      : 'weak';

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
       SET raw_score = $1, diagnostic_level = $2, misconception_tags = $3
       WHERE id = $4`,
      [rawScore, diagnosticLevel, JSON.stringify(misconceptionTags), id]
    );

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

