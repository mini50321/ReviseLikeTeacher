const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { evaluateAnswer, evaluateQuickCheck } = require('../services/ai');

const round = (num, decimals) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);

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

    const isMCQType = ['mcq', 'true_false', 'assertion_reason'].includes(question.type);
    const hasCorrectAnswer = question.correct_answer && question.correct_answer.trim() !== '';

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

      const selectedText = parsedOptions[answer_text.trim().toUpperCase()] || answer_text;
      const correctText = parsedOptions[question.correct_answer.trim().toUpperCase()] || question.correct_answer;

      const difficultyMultiplier = { easy: 0.8, medium: 1.0, hard: 1.2 };
      const mult = difficultyMultiplier[question.difficulty] || 1.0;
      const delta = isCorrect ? round(0.15 * mult, 3) : round(-0.075 * mult, 3);

      let keyPointsText = '';
      if (question.key_points) {
        try {
          const kp = typeof question.key_points === 'string' ? JSON.parse(question.key_points) : question.key_points;
          if (Array.isArray(kp) && kp.length > 0) {
            keyPointsText = kp.join('. ');
          }
        } catch (e) {}
      }

      let teacherResponse = '';
      if (isCorrect) {
        teacherResponse = `Good job choosing ${question.correct_answer.trim().toUpperCase()}, ${correctText}. `;
        teacherResponse += `Now lock in the why behind this option. `;
        if (question.ideal_answer) {
          teacherResponse += `${question.ideal_answer} `;
        }
        if (keyPointsText) {
          teacherResponse += `Focus on these high-yield points: ${keyPointsText}. `;
        }
        teacherResponse += `Quick check: if one feature in the stem changes, would your option still stay the same?`;
      } else {
        teacherResponse = `Good attempt. You chose ${answer_text.trim().toUpperCase()}, ${selectedText}, but the correct answer is ${question.correct_answer.trim().toUpperCase()}, ${correctText}. `;
        teacherResponse += `Your main gap is the discriminator that separates these options. `;
        if (question.ideal_answer) {
          teacherResponse += `${question.ideal_answer} `;
        }
        if (keyPointsText) {
          teacherResponse += `Remember these high-yield points: ${keyPointsText}. `;
        }
        if (!question.ideal_answer && !keyPointsText) {
          teacherResponse += `Review the core concept and compare it with why your chosen option is wrong. `;
        }
        teacherResponse += `Quick check: what single clue in this stem most strongly points to ${question.correct_answer.trim().toUpperCase()}?`;
      }

      evaluation = {
        score,
        feedback: {
          is_mcq: true,
          is_correct: isCorrect,
          selected_option: answer_text.trim().toUpperCase(),
          selected_text: selectedText,
          correct_option: question.correct_answer.trim().toUpperCase(),
          correct_text: correctText,
          strengths: isCorrect ? 'Correct answer!' : `You selected ${answer_text.trim().toUpperCase()}) ${selectedText}`,
          improvements: isCorrect ? 'Great job! Keep it up.' : `The correct answer is ${question.correct_answer.trim().toUpperCase()}) ${correctText}`,
          model_explanation: question.ideal_answer || (isCorrect ? 'Well done!' : `The correct answer is option ${question.correct_answer.trim().toUpperCase()}.`)
        },
        teacher_response: teacherResponse,
        mastery_impact: {
          delta
        }
      };
    } else {
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
          teacher_response: "You made a sincere attempt. Your main gap is concept precision. Rebuild the core idea first, then link it to the stem. What is the one clue that should guide your answer next time?",
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
          teacher_response: "You made a sincere attempt. Your main gap is concept precision. Rebuild the core idea first, then link it to the stem. What is the one clue that should guide your answer next time?",
          mastery_impact: {
            delta: 0
          }
        };
      }
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
    const today = new Date();
    const nextRev = new Date(today);
    nextRev.setDate(nextRev.getDate() + (evaluation.score >= 70 ? 3 : 1));
    const nextRevisionDate = nextRev.toISOString().split('T')[0];

    if (masteryResult.rows.length > 0) {
      await db.query(
        'UPDATE topicmastery SET mastery_level = $1, next_revision_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [masteryUpdate, nextRevisionDate, masteryResult.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO topicmastery (id, user_id, topic, subject, mastery_level, next_revision_date) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [db.generateUUID(), userId, question.topic, question.subject, masteryUpdate, nextRevisionDate]
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

    const defaultTeacherResponse = "You made a sincere attempt. Your main gap is concept precision. Rebuild the core idea first, then link it to the stem. What is the one clue that should guide your answer next time?";
    res.status(201).json({
      id: insertedAttempt.rows[0]?.id || null,
      feedback: evaluation.feedback,
      score: evaluation.score,
      teacher_response: evaluation.teacher_response ?? defaultTeacherResponse,
      question_context: {
        question_id: question.id,
        stem: question.stem || null,
        subject: question.subject || null,
        topic: question.topic || null
      },
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

router.post('/:id/quick-check', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { quick_check_answer, teacher_response } = req.body;

    if (!quick_check_answer || !quick_check_answer.trim()) {
      return res.status(400).json({ error: 'quick_check_answer is required' });
    }

    const attemptResult = await db.query(
      `SELECT a.*, q.*
       FROM attempt a
       JOIN question q ON q.id = a.question_id
       WHERE a.id = $1`,
      [id]
    );

    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const row = attemptResult.rows[0];
    if (row.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const question = {
      id: row.question_id,
      stem: row.stem,
      type: row.type,
      ideal_answer: row.ideal_answer,
      key_points: row.key_points,
      topic: row.topic,
      subject: row.subject,
      difficulty: row.difficulty
    };

    const quickCheck = await evaluateQuickCheck({
      question,
      originalAnswer: row.answer_text || '',
      teacherResponse: teacher_response || '',
      quickCheckAnswer: quick_check_answer.trim()
    });

    res.json({
      understanding_level: quickCheck.understanding_level || 'partial',
      follow_up: quickCheck.follow_up,
      can_proceed: quickCheck.can_proceed !== false
    });
  } catch (error) {
    console.error('Quick-check route error:', error);
    res.status(500).json({ error: error.message || 'Quick-check failed' });
  }
});

module.exports = router;

