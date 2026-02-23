const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.post('/rapid-fire', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic, tls_id } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    let weakSubtopics = [];
    let masteryResult = null;

    if (tls_id) {
      const tlsResult = await db.query(
        'SELECT * FROM topic_learning_session WHERE id = $1 AND user_id = $2',
        [tls_id, userId]
      );
      if (tlsResult.rows.length > 0) {
        const tls = tlsResult.rows[0];
        masteryResult = tls.mastery_result;

        if (tls.diagnostic_id) {
          const diagResult = await db.query(
            'SELECT misconception_tags FROM diagnostic_assessment WHERE id = $1',
            [tls.diagnostic_id]
          );
          if (diagResult.rows.length > 0 && diagResult.rows[0].misconception_tags) {
            try {
              const tags = JSON.parse(diagResult.rows[0].misconception_tags);
              weakSubtopics = tags.map(t => t.subtopic).filter(Boolean);
            } catch (e) {}
          }
        }
      }
    }

    if (weakSubtopics.length === 0) {
      const weakResult = await db.query(
        `SELECT DISTINCT q.subtopic FROM attempt a
         JOIN question q ON a.question_id = q.id
         WHERE a.user_id = $1 AND q.subject = $2 AND q.topic = $3
           AND a.ai_score < 70 AND q.subtopic IS NOT NULL
         ORDER BY q.subtopic
         LIMIT 5`,
        [userId, subject, topic]
      );
      weakSubtopics = weakResult.rows.map(r => r.subtopic);
    }

    const aiRes = await axios.post(`${AI_SERVICE_URL}/generate-rapid-fire`, {
      subject,
      topic,
      weak_subtopics: weakSubtopics.length > 0 ? weakSubtopics : null,
      mastery_result: masteryResult,
      count: 10
    }, { timeout: 60000 });

    res.json(aiRes.data);
  } catch (error) {
    console.error('Rapid-fire generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate rapid-fire questions' });
  }
});

router.post('/rapid-fire/check', authenticate, async (req, res) => {
  try {
    const { question, user_answer, correct_answer } = req.body;

    if (!user_answer || !correct_answer) {
      return res.status(400).json({ error: 'Answer and correct answer required' });
    }

    const normalizedUser = user_answer.trim().toLowerCase();
    const normalizedCorrect = correct_answer.trim().toLowerCase();

    const isCorrect = normalizedUser === normalizedCorrect
      || normalizedCorrect.includes(normalizedUser)
      || normalizedUser.includes(normalizedCorrect);

    res.json({
      is_correct: isCorrect,
      correct_answer: correct_answer,
      user_answer: user_answer
    });
  } catch (error) {
    console.error('Rapid-fire check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/next-topic', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { current_subject, current_topic } = req.query;

    const profileResult = await db.query(
      'SELECT goal_tier FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const goalTier = profileResult.rows[0]?.goal_tier || 'good_rank';

    const masteredTopics = await db.query(
      `SELECT topic, subject FROM topicmastery
       WHERE user_id = $1 AND mastery_status = 'mastered'`,
      [userId]
    );
    const masteredSet = new Set(masteredTopics.rows.map(r => `${r.subject}|${r.topic}`));

    const weakTopics = await db.query(
      `SELECT topic, subject, competency_score, mastery_status FROM topicmastery
       WHERE user_id = $1 AND mastery_status IN ('relearn_core', 'revision_required')
       ORDER BY competency_score ASC
       LIMIT 5`,
      [userId]
    );

    const highYieldTopics = await db.query(
      `SELECT subject, topic,
              COUNT(*) as question_count,
              SUM(CASE WHEN yield_category = 'core' THEN 1 ELSE 0 END) as core_count,
              SUM(CASE WHEN yield_category = 'frequent' THEN 1 ELSE 0 END) as frequent_count
       FROM question
       WHERE status = 'active' AND type = 'mcq'
       GROUP BY subject, topic
       HAVING SUM(CASE WHEN yield_category IN ('core', 'frequent') THEN 1 ELSE 0 END) > 0
       ORDER BY core_count DESC, frequent_count DESC
       LIMIT 50`
    );

    const recommendations = [];

    for (const wt of weakTopics.rows) {
      if (wt.subject === current_subject && wt.topic === current_topic) continue;
      recommendations.push({
        subject: wt.subject,
        topic: wt.topic,
        reason: 'weakness',
        reason_label: wt.mastery_status === 'relearn_core' ? 'Needs Relearning' : 'Needs Revision',
        competency_score: wt.competency_score,
        priority: 1
      });
    }

    for (const ht of highYieldTopics.rows) {
      const key = `${ht.subject}|${ht.topic}`;
      if (masteredSet.has(key)) continue;
      if (ht.subject === current_subject && ht.topic === current_topic) continue;
      if (recommendations.find(r => r.subject === ht.subject && r.topic === ht.topic)) continue;

      const inProgress = await db.query(
        `SELECT id FROM topicmastery WHERE user_id = $1 AND subject = $2 AND topic = $3`,
        [userId, ht.subject, ht.topic]
      );

      recommendations.push({
        subject: ht.subject,
        topic: ht.topic,
        reason: inProgress.rows.length > 0 ? 'in_progress' : 'high_yield',
        reason_label: inProgress.rows.length > 0 ? 'Continue Learning' : 'High-Yield Topic',
        core_count: parseInt(ht.core_count),
        frequent_count: parseInt(ht.frequent_count),
        priority: inProgress.rows.length > 0 ? 2 : 3
      });

      if (recommendations.length >= 8) break;
    }

    if (recommendations.length === 0 && current_subject) {
      const sameSubjectTopics = await db.query(
        `SELECT DISTINCT topic FROM question
         WHERE subject = $1 AND status = 'active' AND topic != $2
         ORDER BY topic
         LIMIT 5`,
        [current_subject, current_topic || '']
      );

      for (const st of sameSubjectTopics.rows) {
        const key = `${current_subject}|${st.topic}`;
        if (masteredSet.has(key)) continue;
        recommendations.push({
          subject: current_subject,
          topic: st.topic,
          reason: 'same_subject',
          reason_label: 'Same Subject',
          priority: 4
        });
      }
    }

    recommendations.sort((a, b) => a.priority - b.priority);

    const primaryRec = recommendations.length > 0 ? recommendations[0] : null;

    res.json({
      primary_recommendation: primaryRec,
      alternatives: recommendations.slice(1, 5),
      total_mastered: masteredSet.size,
      total_weak: weakTopics.rows.length
    });
  } catch (error) {
    console.error('Next topic recommendation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/add-to-revision', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }

    const existing = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, subject, topic]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'No mastery record found for this topic' });
    }

    const mastery = existing.rows[0];
    let revisionDays;

    if (mastery.mastery_status === 'mastered') {
      revisionDays = [7, 21, 45];
    } else if (mastery.mastery_status === 'revision_required') {
      revisionDays = [3, 10, 25];
    } else {
      revisionDays = [1, 5, 15];
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + revisionDays[0]);

    await db.query(
      `UPDATE topicmastery SET
       next_revision_date = $1, required_revisions = $2,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nextDate.toISOString().split('T')[0], revisionDays.length, mastery.id]
    );

    res.json({
      message: 'Added to revision schedule',
      next_revision: nextDate.toISOString().split('T')[0],
      revision_intervals: revisionDays,
      mastery_status: mastery.mastery_status
    });
  } catch (error) {
    console.error('Add to revision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/completion-summary/:id', authenticate, async (req, res) => {
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

    const masteryResult = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, tls.subject, tls.topic]
    );

    const notesResult = await db.query(
      'SELECT * FROM exam_trigger_notes WHERE user_id = $1 AND subject = $2 AND topic = $3',
      [userId, tls.subject, tls.topic]
    );

    const scoreTrend = await db.query(
      `SELECT score, recorded_at FROM competency_score_log
       WHERE user_id = $1 AND subject = $2 AND topic = $3
       ORDER BY recorded_at DESC LIMIT 5`,
      [userId, tls.subject, tls.topic]
    );

    const competencyAchieved = tls.mastery_result === 'mastered'
      && (tls.competency_score || 0) >= 80
      && (tls.core_coverage || 0) >= 90;

    const mastery = masteryResult.rows[0] || {};

    res.json({
      session: {
        id: tls.id,
        subject: tls.subject,
        topic: tls.topic,
        mastery_result: tls.mastery_result,
        mcq_accuracy: tls.mcq_accuracy,
        core_coverage: tls.core_coverage,
        competency_score: tls.competency_score,
        diagnostic_score: tls.diagnostic_score,
        mcq_total: tls.mcq_total,
        mcq_correct: tls.mcq_correct,
        mcq_completed: tls.mcq_completed
      },
      competency_achieved: competencyAchieved,
      topic_status: competencyAchieved ? 'green' : (tls.mastery_result === 'revision_required' ? 'yellow' : 'red'),
      has_exam_notes: notesResult.rows.length > 0,
      score_trend: scoreTrend.rows.map(r => ({
        score: r.score,
        date: r.recorded_at
      })),
      revision_info: {
        next_revision_date: mastery.next_revision_date || null,
        mastery_status: mastery.mastery_status || tls.mastery_result,
        required_revisions: mastery.required_revisions || 0
      }
    });
  } catch (error) {
    console.error('Completion summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

