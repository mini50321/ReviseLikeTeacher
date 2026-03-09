const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
const { seedTuningFork } = require('../services/seed-tuning-fork');

router.post('/seed/tuning-fork', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await seedTuningFork();
    res.json({
      success: true,
      inserted: result.inserted,
      skipped: result.skipped,
      subject: result.subject,
      topic: result.topic,
      message: `Seeded tuning fork concepts. Inserted: ${result.inserted}, Skipped: ${result.skipped}.`
    });
  } catch (error) {
    console.error('Seed tuning fork error:', error);
    res.status(500).json({ error: error.message || 'Seed failed' });
  }
});

router.get('/questions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM question';
    const params = [];
    let paramCount = 1;

    if (status && status.trim() !== '') {
      query += ` WHERE status = $${paramCount++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);

    res.json({
      questions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get admin questions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM session ORDER BY started_at DESC'
    );

    res.json({
      sessions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get admin sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/students', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.target_exam, p.exam_date, p.onboarding_completed
       FROM users u
       LEFT JOIN userprofile p ON u.id = p.user_id
       WHERE u.role = 'student'
       ORDER BY u.created_at DESC`
    );

    const students = [];
    for (const student of result.rows) {
      const attemptStats = await db.query(
        `SELECT COUNT(*) as total_attempts, AVG(ai_score) as avg_score
         FROM attempt WHERE user_id = $1`,
        [student.id]
      );

      const sessionStats = await db.query(
        `SELECT COUNT(*) as total_sessions,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions
         FROM session WHERE user_id = $1`,
        [student.id]
      );

      const masteryStats = await db.query(
        `SELECT AVG(mastery_level) as avg_mastery, COUNT(*) as topics_count
         FROM topicmastery WHERE user_id = $1`,
        [student.id]
      );

      students.push({
        id: student.id,
        email: student.email,
        created_at: student.created_at,
        target_exam: student.target_exam,
        exam_date: student.exam_date,
        onboarding_completed: student.onboarding_completed,
        total_attempts: parseInt(attemptStats.rows[0]?.total_attempts || 0),
        avg_score: Math.round((attemptStats.rows[0]?.avg_score || 0) * 100) / 100,
        total_sessions: parseInt(sessionStats.rows[0]?.total_sessions || 0),
        completed_sessions: parseInt(sessionStats.rows[0]?.completed_sessions || 0),
        avg_mastery: Math.round((masteryStats.rows[0]?.avg_mastery || 0) * 100) / 100,
        topics_count: parseInt(masteryStats.rows[0]?.topics_count || 0)
      });
    }

    res.json({ students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/students/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const userResult = await db.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.target_exam, p.exam_date, p.target_score_band,
              p.selected_subjects, p.daily_study_minutes, p.weekly_question_target,
              p.intelligence_level, p.onboarding_completed
       FROM users u
       LEFT JOIN userprofile p ON u.id = p.user_id
       WHERE u.id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = userResult.rows[0];

    const attemptsResult = await db.query(
      `SELECT a.*, q.stem, q.subject, q.topic, q.difficulty
       FROM attempt a
       JOIN question q ON a.question_id = q.id
       WHERE a.user_id = $1
       ORDER BY a.submitted_at DESC
       LIMIT 50`,
      [id]
    );

    const masteryResult = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 ORDER BY mastery_level DESC',
      [id]
    );

    const sessionsResult = await db.query(
      'SELECT * FROM session WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20',
      [id]
    );

    const readinessResult = await db.query(
      'SELECT * FROM examreadiness WHERE user_id = $1',
      [id]
    );

    res.json({
      student,
      attempts: attemptsResult.rows,
      mastery: masteryResult.rows,
      sessions: sessionsResult.rows,
      readiness: readinessResult.rows[0] || null
    });
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/question-difficulty', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT q.id, q.stem, q.subject, q.topic, q.difficulty, q.type,
              COUNT(a.id) as total_attempts,
              AVG(a.ai_score) as avg_score,
              MIN(a.ai_score) as min_score,
              MAX(a.ai_score) as max_score,
              SUM(CASE WHEN a.ai_score >= 70 THEN 1 ELSE 0 END) as pass_count,
              AVG(a.time_spent_seconds) as avg_time
       FROM question q
       LEFT JOIN attempt a ON q.id = a.question_id
       WHERE q.status = 'active'
       GROUP BY q.id
       ORDER BY avg_score ASC`
    );

    const questions = result.rows.map(row => {
      const totalAttempts = parseInt(row.total_attempts || 0);
      const passCount = parseInt(row.pass_count || 0);
      const avgScore = row.avg_score || 0;

      let computed_difficulty;
      if (totalAttempts === 0) {
        computed_difficulty = row.difficulty;
      } else if (avgScore < 40) {
        computed_difficulty = 'hard';
      } else if (avgScore < 65) {
        computed_difficulty = 'medium';
      } else {
        computed_difficulty = 'easy';
      }

      return {
        id: row.id,
        stem: row.stem ? row.stem.substring(0, 150) : '',
        subject: row.subject,
        topic: row.topic,
        type: row.type,
        set_difficulty: row.difficulty,
        computed_difficulty,
        difficulty_mismatch: row.difficulty !== computed_difficulty && totalAttempts >= 3,
        total_attempts: totalAttempts,
        avg_score: Math.round((avgScore) * 100) / 100,
        min_score: row.min_score || 0,
        max_score: row.max_score || 0,
        pass_rate: totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 10000) / 100 : 0,
        avg_time_seconds: Math.round(row.avg_time || 0)
      };
    });

    const subjectDifficulty = {};
    questions.forEach(q => {
      if (!subjectDifficulty[q.subject]) {
        subjectDifficulty[q.subject] = { total: 0, score_sum: 0, attempts: 0 };
      }
      subjectDifficulty[q.subject].total++;
      subjectDifficulty[q.subject].score_sum += q.avg_score * q.total_attempts;
      subjectDifficulty[q.subject].attempts += q.total_attempts;
    });

    const subjectSummary = Object.entries(subjectDifficulty).map(([subject, data]) => ({
      subject,
      total_questions: data.total,
      avg_score: data.attempts > 0 ? Math.round((data.score_sum / data.attempts) * 100) / 100 : 0,
      total_attempts: data.attempts
    })).sort((a, b) => a.avg_score - b.avg_score);

    res.json({
      questions,
      subject_summary: subjectSummary,
      total_with_mismatch: questions.filter(q => q.difficulty_mismatch).length
    });
  } catch (error) {
    console.error('Question difficulty error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/override/attempt/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Score must be between 0 and 100' });
    }

    const attemptResult = await db.query('SELECT * FROM attempt WHERE id = $1', [id]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const attempt = attemptResult.rows[0];
    const oldScore = attempt.ai_score;

    const newFeedback = feedback || (attempt.ai_feedback ? JSON.parse(attempt.ai_feedback) : {});
    newFeedback.teacher_override = true;
    newFeedback.original_ai_score = oldScore;
    newFeedback.override_by = req.user.email;
    newFeedback.override_at = new Date().toISOString();

    await db.query(
      'UPDATE attempt SET ai_score = $1, ai_feedback = $2 WHERE id = $3',
      [score, JSON.stringify(newFeedback), id]
    );

    const correctionId = db.generateUUID();
    await db.query(
      `INSERT INTO evaluation_corrections (id, attempt_id, admin_id, corrections)
       VALUES ($1, $2, $3, $4)`,
      [correctionId, id, req.user.userId, JSON.stringify({
        old_score: oldScore,
        new_score: score,
        feedback: feedback
      })]
    );

    const question = await db.query('SELECT * FROM question WHERE id = $1', [attempt.question_id]);
    if (question.rows.length > 0) {
      const q = question.rows[0];
      const scoreDiff = score - oldScore;
      const masteryDelta = (scoreDiff / 100) * 0.15;

      const mastery = await db.query(
        'SELECT * FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
        [attempt.user_id, q.topic, q.subject]
      );

      if (mastery.rows.length > 0) {
        const newMastery = Math.max(0, Math.min(100, mastery.rows[0].mastery_level + masteryDelta));
        await db.query(
          'UPDATE topicmastery SET mastery_level = $1 WHERE id = $2',
          [newMastery, mastery.rows[0].id]
        );
      }
    }

    const updated = await db.query('SELECT * FROM attempt WHERE id = $1', [id]);

    res.json({
      message: 'Score overridden successfully',
      attempt: updated.rows[0],
      old_score: oldScore,
      new_score: score
    });
  } catch (error) {
    console.error('Override attempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/override/mastery', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id, topic, subject, new_mastery } = req.body;

    if (!user_id || !topic || !subject) {
      return res.status(400).json({ error: 'user_id, topic, and subject are required' });
    }

    if (new_mastery === undefined || new_mastery < 0 || new_mastery > 100) {
      return res.status(400).json({ error: 'new_mastery must be between 0 and 100' });
    }

    const masteryResult = await db.query(
      'SELECT * FROM topicmastery WHERE user_id = $1 AND topic = $2 AND subject = $3',
      [user_id, topic, subject]
    );

    if (masteryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic mastery record not found' });
    }

    const oldMastery = masteryResult.rows[0].mastery_level;

    await db.query(
      'UPDATE topicmastery SET mastery_level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [new_mastery, masteryResult.rows[0].id]
    );

    res.json({
      message: 'Mastery overridden successfully',
      topic,
      subject,
      old_mastery: oldMastery,
      new_mastery: new_mastery
    });
  } catch (error) {
    console.error('Override mastery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/override/history', authenticate, requireAdmin, async (req, res) => {
  try {
    const evalCorrections = await db.query(
      `SELECT ec.*, a.user_id, a.question_id, a.ai_score,
              u.email as student_email, admin_u.email as admin_email
       FROM evaluation_corrections ec
       JOIN attempt a ON ec.attempt_id = a.id
       JOIN users u ON a.user_id = u.id
       JOIN users admin_u ON ec.admin_id = admin_u.id
       ORDER BY ec.timestamp DESC
       LIMIT 50`
    );

    res.json({ overrides: evalCorrections.rows });
  } catch (error) {
    console.error('Override history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/platform-stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const usersResult = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as students,
              SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins
       FROM users`
    );

    const attemptsResult = await db.query(
      `SELECT COUNT(*) as total, AVG(ai_score) as avg_score
       FROM attempt`
    );

    const sessionsResult = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM session`
    );

    const questionsResult = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM question`
    );

    const recentActivity = await db.query(
      `SELECT date(submitted_at) as date, COUNT(*) as attempts
       FROM attempt
       WHERE submitted_at >= date('now', '-7 days')
       GROUP BY date(submitted_at)
       ORDER BY date ASC`
    );

    res.json({
      users: {
        total: parseInt(usersResult.rows[0]?.total || 0),
        students: parseInt(usersResult.rows[0]?.students || 0),
        admins: parseInt(usersResult.rows[0]?.admins || 0)
      },
      attempts: {
        total: parseInt(attemptsResult.rows[0]?.total || 0),
        avg_score: Math.round((attemptsResult.rows[0]?.avg_score || 0) * 100) / 100
      },
      sessions: {
        total: parseInt(sessionsResult.rows[0]?.total || 0),
        completed: parseInt(sessionsResult.rows[0]?.completed || 0)
      },
      questions: {
        total: parseInt(questionsResult.rows[0]?.total || 0),
        active: parseInt(questionsResult.rows[0]?.active || 0)
      },
      recent_activity: recentActivity.rows
    });
  } catch (error) {
    console.error('Platform stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/yield', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, yield_category } = req.query;

    let query = 'SELECT * FROM subtopic_yield WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }
    if (topic) {
      query += ` AND topic = $${paramCount++}`;
      params.push(topic);
    }
    if (yield_category) {
      query += ` AND yield_category = $${paramCount++}`;
      params.push(yield_category);
    }

    query += ' ORDER BY pyq_count DESC';

    const result = await db.query(query, params);

    const summary = {
      core: 0,
      frequent: 0,
      occasional: 0,
      rare: 0,
      total: result.rows.length
    };
    result.rows.forEach(row => {
      if (summary[row.yield_category] !== undefined) {
        summary[row.yield_category]++;
      }
    });

    res.json({ subtopic_yield: result.rows, summary });
  } catch (error) {
    console.error('Get yield data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/yield/recalculate', authenticate, requireAdmin, async (req, res) => {
  try {
    const subtopicData = await db.query(
      `SELECT subject, topic, subtopic, COUNT(*) as pyq_count,
              previous_year_tags
       FROM question
       WHERE status = 'active' AND subtopic IS NOT NULL AND subtopic != ''
       GROUP BY subject, topic, subtopic`
    );

    let updated = 0;
    let inserted = 0;

    for (const row of subtopicData.rows) {
      const pyqCount = parseInt(row.pyq_count);
      let yieldCategory;
      if (pyqCount >= 10) yieldCategory = 'core';
      else if (pyqCount >= 5) yieldCategory = 'frequent';
      else if (pyqCount >= 2) yieldCategory = 'occasional';
      else yieldCategory = 'rare';

      let yearsSet = new Set();
      let mostRecentYear = null;

      const tagsQuestions = await db.query(
        `SELECT previous_year_tags FROM question
         WHERE subject = $1 AND topic = $2 AND subtopic = $3 AND status = 'active'`,
        [row.subject, row.topic, row.subtopic]
      );

      for (const tq of tagsQuestions.rows) {
        try {
          const tags = typeof tq.previous_year_tags === 'string'
            ? JSON.parse(tq.previous_year_tags)
            : tq.previous_year_tags;
          if (Array.isArray(tags)) {
            for (const tag of tags) {
              const yearMatches = String(tag).match(/\d{4}/g);
              if (yearMatches) {
                yearMatches.forEach(y => {
                  const yr = parseInt(y);
                  if (yr >= 2000 && yr <= 2030) yearsSet.add(yr);
                });
              }
            }
          }
        } catch (e) {}
      }

      const yearsArr = sorted(yearsSet);
      if (yearsArr.length > 0) mostRecentYear = yearsArr[yearsArr.length - 1];

      const existing = await db.query(
        'SELECT id FROM subtopic_yield WHERE subject = $1 AND topic = $2 AND subtopic = $3',
        [row.subject, row.topic, row.subtopic]
      );

      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE subtopic_yield SET pyq_count = $1, yield_category = $2,
           years_appeared = $3, most_recent_year = $4 WHERE id = $5`,
          [pyqCount, yieldCategory, JSON.stringify(yearsArr),
           mostRecentYear, existing.rows[0].id]
        );
        updated++;
      } else {
        const syId = db.generateUUID();
        await db.query(
          `INSERT INTO subtopic_yield (id, subject, topic, subtopic, pyq_count, yield_category, years_appeared, most_recent_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [syId, row.subject, row.topic, row.subtopic, pyqCount,
           yieldCategory, JSON.stringify(yearsArr), mostRecentYear]
        );
        inserted++;
      }
    }

    res.json({
      message: 'Yield classification recalculated',
      updated,
      inserted,
      total: updated + inserted
    });
  } catch (error) {
    console.error('Recalculate yield error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function sorted(set) {
  return Array.from(set).sort((a, b) => a - b);
}

module.exports = router;
