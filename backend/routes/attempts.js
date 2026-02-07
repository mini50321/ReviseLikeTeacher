const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { evaluateAnswer } = require('../services/ai');

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      question_id,
      session_id,
      answer_text,
      answer_method,
      language,
      time_spent_seconds = 0
    } = req.body;

    console.log('Attempt submission received:', {
      question_id,
      session_id,
      has_answer_text: !!answer_text,
      answer_method,
      language: language || 'not specified',
      time_spent_seconds
    });

    if (!question_id) {
      return res.status(400).json({ error: 'Question ID is required' });
    }
    if (!answer_text || answer_text.trim() === '') {
      return res.status(400).json({ error: 'Answer text is required and cannot be empty' });
    }
    if (!answer_method || !['voice', 'text'].includes(answer_method)) {
      return res.status(400).json({ error: 'Answer method is required and must be "voice" or "text"' });
    }

    if (!language && answer_method === 'voice') {
      return res.status(400).json({ error: 'Language is required for voice answers' });
    }

    if (language && !['english', 'hindi', 'hinglish'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language. Must be: english, hindi, or hinglish' });
    }

    const questionResult = await db.query('SELECT * FROM question WHERE id = $1', [question_id]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionResult.rows[0];

    const masteryResult = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
      [userId, question.topic, question.subject]
    );

    const currentMastery = masteryResult.rows[0]?.mastery_level || 0;

    let evaluation;
    try {
      evaluation = await evaluateAnswer({
        question,
        studentAnswer: answer_text,
        currentMastery,
        userId
      });
    } catch (error) {
      console.error('Error evaluating answer, using fallback:', error);
      const fallbackScore = 50;
      evaluation = {
        score: fallbackScore,
        feedback: {
          strengths: "Thank you for your answer.",
          improvements: "Keep practicing to improve.",
          model_explanation: question.ideal_answer || "Review the topic for a complete answer."
        },
        mastery_impact: {
          delta: 0
        }
      };
    }

    if (!evaluation || evaluation.score === undefined || !evaluation.feedback) {
      console.error('Invalid evaluation object:', evaluation);
      const fallbackScore = 50;
      evaluation = {
        score: fallbackScore,
        feedback: {
          strengths: "Thank you for your answer.",
          improvements: "Keep practicing to improve.",
          model_explanation: question.ideal_answer || "Review the topic for a complete answer."
        },
        mastery_impact: {
          delta: 0
        }
      };
    }

    if (!evaluation.mastery_impact || evaluation.mastery_impact.delta === undefined) {
      evaluation.mastery_impact = {
        delta: 0
      };
    }

    const attemptId = db.generateUUID();

    await db.query(
      `INSERT INTO attempt 
       (id, user_id, question_id, session_id, answer_text, answer_method, language, 
        ai_feedback, ai_score, time_spent_seconds) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [attemptId, userId, question_id, session_id || null, answer_text, answer_method, language || null,
       JSON.stringify(evaluation.feedback), evaluation.score, time_spent_seconds]
    );

    const insertedAttempt = await db.query(
      'SELECT * FROM attempt WHERE id = $1',
      [attemptId]
    );

    const newMastery = currentMastery + evaluation.mastery_impact.delta;
    const masteryUpdate = newMastery > 100 ? 100 : (newMastery < 0 ? 0 : newMastery);

    if (masteryResult.rows.length > 0) {
      await db.query(
        'UPDATE topicmastery SET mastery_level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [masteryUpdate, masteryResult.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO topicmastery (user_id, topic, subject, mastery_level) 
         VALUES ($1, $2, $3, $4)`,
        [userId, question.topic, question.subject, masteryUpdate]
      );
    }

    await db.query(
      `INSERT INTO questionmastery (user_id, question_id, mastery_level, attempt_count, last_attempt_at) 
       VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP) 
       ON CONFLICT (user_id, question_id) 
       DO UPDATE SET mastery_level = $3, attempt_count = questionmastery.attempt_count + 1, 
                     last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [userId, question_id, masteryUpdate]
    );

    res.status(201).json({
      id: insertedAttempt.rows[0]?.id || null,
      feedback: evaluation.feedback,
      score: evaluation.score,
      mastery_impact: {
        topic: question.topic,
        previous_mastery: currentMastery,
        new_mastery: masteryUpdate,
        delta: evaluation.mastery_impact?.delta || 0
      }
    });
  } catch (error) {
    console.error('Submit attempt error:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.post('/:id/feedback/rate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback_text } = req.body;
    const userId = req.user.userId;

    if (!rating || !['good', 'bad', 'worse'].includes(rating)) {
      return res.status(400).json({ error: 'Valid rating required' });
    }

    const attemptResult = await db.query('SELECT user_id FROM attempt WHERE id = $1', [id]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attemptResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const ratingId = db.generateUUID();
    await db.query(
      `INSERT INTO feedback_ratings (id, attempt_id, user_id, rating, feedback_text) 
       VALUES ($1, $2, $3, $4, $5)`,
      [ratingId, id, userId, rating, feedback_text || null]
    );

    await db.query(
      'UPDATE attempt SET feedback_rating = $1 WHERE id = $2',
      [rating, id]
    );

    res.json({ message: 'Rating saved' });
  } catch (error) {
    console.error('Rate feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

