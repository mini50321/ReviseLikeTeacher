const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { db } = require('../db');

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const overdue = await db.query(
      `SELECT * FROM topicmastery
       WHERE user_id = $1 AND next_revision_date IS NOT NULL
         AND next_revision_date <= $2
         AND mastery_status != 'not_started'
       ORDER BY next_revision_date ASC`,
      [userId, today]
    );

    const upcoming = await db.query(
      `SELECT * FROM topicmastery
       WHERE user_id = $1 AND next_revision_date IS NOT NULL
         AND next_revision_date > $2
         AND mastery_status != 'not_started'
       ORDER BY next_revision_date ASC
       LIMIT 20`,
      [userId, today]
    );

    const mastered = await db.query(
      `SELECT * FROM topicmastery
       WHERE user_id = $1 AND mastery_status = 'mastered'
       ORDER BY updated_at DESC`,
      [userId]
    );

    const needsRelearn = await db.query(
      `SELECT * FROM topicmastery
       WHERE user_id = $1 AND mastery_status IN ('relearn_core', 'revision_required')
       ORDER BY competency_score ASC`,
      [userId]
    );

    res.json({
      overdue: overdue.rows.map(r => enrichRevisionItem(r, today)),
      upcoming: upcoming.rows.map(r => enrichRevisionItem(r, today)),
      mastered: mastered.rows,
      needs_attention: needsRelearn.rows,
      stats: {
        overdue_count: overdue.rows.length,
        upcoming_count: upcoming.rows.length,
        mastered_count: mastered.rows.length,
        needs_attention_count: needsRelearn.rows.length,
        total_topics: overdue.rows.length + upcoming.rows.length + mastered.rows.length
      }
    });
  } catch (error) {
    console.error('Revision queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/due-today', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT * FROM topicmastery
       WHERE user_id = $1 AND next_revision_date IS NOT NULL
         AND next_revision_date <= $2
         AND mastery_status != 'not_started'
       ORDER BY
         CASE mastery_status
           WHEN 'relearn_core' THEN 1
           WHEN 'revision_required' THEN 2
           WHEN 'mastered' THEN 3
           ELSE 4
         END,
         competency_score ASC`,
      [userId, today]
    );

    res.json({
      due_topics: result.rows.map(r => enrichRevisionItem(r, today)),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Due today error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/start-revision', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const topicResult = await db.query(
      'SELECT * FROM topicmastery WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic mastery record not found' });
    }

    const topic = topicResult.rows[0];

    const sessionId = db.generateUUID();
    await db.query(
      `INSERT INTO session (id, user_id, session_type, configuration, status)
       VALUES ($1, $2, 'revision', $3, 'in_progress')`,
      [sessionId, userId, JSON.stringify({ subject: topic.subject, topic: topic.topic, source: 'revision_queue' })]
    );

    const tlsId = db.generateUUID();
    await db.query(
      `INSERT INTO topic_learning_session
       (id, user_id, session_id, subject, topic, current_phase, diagnostic_score, focus_buckets)
       VALUES ($1, $2, $3, $4, $5, 'mcq_consolidation', $6, $7)`,
      [tlsId, userId, sessionId, topic.subject, topic.topic,
       topic.saq_raw_score || 0,
       JSON.stringify(topic.mastery_status === 'mastered' ? ['core', 'frequent'] : ['core'])]
    );

    res.json({
      session_id: sessionId,
      topic_learning_session_id: tlsId,
      topic: topic.topic,
      subject: topic.subject,
      mastery_status: topic.mastery_status,
      revision_round: (topic.completed_revisions || 0) + 1
    });
  } catch (error) {
    console.error('Start revision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/complete-revision', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { mcq_accuracy, new_mastery_status } = req.body;

    const topicResult = await db.query(
      'SELECT * FROM topicmastery WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic mastery record not found' });
    }

    const topic = topicResult.rows[0];
    const completedRevisions = (topic.completed_revisions || 0) + 1;
    const today = new Date().toISOString().split('T')[0];

    const tuningResult = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name LIKE 'revision_interval_%'`
    );
    const tuning = {};
    tuningResult.rows.forEach(r => { tuning[r.parameter_name] = parseFloat(r.parameter_value); });

    const status = new_mastery_status || topic.mastery_status;

    let intervals;
    if (status === 'mastered') {
      intervals = [
        tuning.revision_interval_mastered_1 || 7,
        tuning.revision_interval_mastered_2 || 21,
        tuning.revision_interval_mastered_3 || 45
      ];
    } else if (status === 'revision_required') {
      intervals = [
        tuning.revision_interval_revision_1 || 3,
        tuning.revision_interval_revision_2 || 10,
        tuning.revision_interval_revision_3 || 25
      ];
    } else {
      intervals = [
        tuning.revision_interval_relearn_1 || 1,
        tuning.revision_interval_relearn_2 || 5,
        tuning.revision_interval_relearn_3 || 15
      ];
    }

    const roundIndex = Math.min(completedRevisions - 1, intervals.length - 1);
    const nextIntervalDays = intervals[roundIndex];

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + nextIntervalDays);
    const nextDateString = nextDate.toISOString().split('T')[0];

    const updateFields = {
      completed_revisions: completedRevisions,
      last_revision_date: today,
      revision_count: (topic.revision_count || 0) + 1
    };

    if (new_mastery_status) {
      updateFields.mastery_status = new_mastery_status;
    }

    if (mcq_accuracy !== undefined) {
      updateFields.mcq_accuracy = mcq_accuracy;
    }

    if (completedRevisions >= topic.required_revisions) {
      updateFields.next_revision_date = null;
    } else {
      updateFields.next_revision_date = nextDateString;
    }

    const setClauses = Object.entries(updateFields)
      .map(([key], i) => `${key} = $${i + 2}`)
      .join(', ');
    const values = Object.values(updateFields);

    await db.query(
      `UPDATE topicmastery SET ${setClauses} WHERE id = $1`,
      [id, ...values]
    );

    res.json({
      message: 'Revision completed',
      completed_revisions: completedRevisions,
      required_revisions: topic.required_revisions,
      next_revision_date: updateFields.next_revision_date,
      next_interval_days: nextIntervalDays,
      all_revisions_complete: completedRevisions >= topic.required_revisions,
      mastery_status: updateFields.mastery_status || topic.mastery_status
    });
  } catch (error) {
    console.error('Complete revision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/snooze', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { days = 1 } = req.body;

    const topicResult = await db.query(
      'SELECT * FROM topicmastery WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic mastery record not found' });
    }

    const snoozeDate = new Date();
    snoozeDate.setDate(snoozeDate.getDate() + Math.min(days, 7));
    const snoozeDateString = snoozeDate.toISOString().split('T')[0];

    await db.query(
      'UPDATE topicmastery SET next_revision_date = $1 WHERE id = $2',
      [snoozeDateString, id]
    );

    res.json({
      message: `Revision snoozed for ${days} day(s)`,
      new_date: snoozeDateString
    });
  } catch (error) {
    console.error('Snooze revision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/add-to-schedule', authenticate, requireFeature('auto_revision_calendar'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { topic_mastery_id } = req.body;

    if (!topic_mastery_id) {
      return res.status(400).json({ error: 'topic_mastery_id is required' });
    }

    const topicResult = await db.query(
      'SELECT * FROM topicmastery WHERE id = $1 AND user_id = $2',
      [topic_mastery_id, userId]
    );

    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic mastery record not found' });
    }

    const topic = topicResult.rows[0];
    const revisionDate = topic.next_revision_date || new Date().toISOString().split('T')[0];

    const existing = await db.query(
      'SELECT * FROM revisionschedule WHERE user_id = $1 AND date = $2',
      [userId, revisionDate]
    );

    if (existing.rows.length > 0) {
      const schedule = existing.rows[0];
      let existingTopics = [];
      let existingSubjects = [];
      try {
        existingTopics = typeof schedule.topics === 'string' ? JSON.parse(schedule.topics) : (schedule.topics || []);
        existingSubjects = typeof schedule.subjects === 'string' ? JSON.parse(schedule.subjects) : (schedule.subjects || []);
      } catch (e) {}

      if (!existingTopics.includes(topic.topic)) {
        existingTopics.push(topic.topic);
      }
      if (!existingSubjects.includes(topic.subject)) {
        existingSubjects.push(topic.subject);
      }

      await db.query(
        `UPDATE revisionschedule SET
         topics = $1, subjects = $2,
         planned_questions = planned_questions + 10
         WHERE id = $3`,
        [JSON.stringify(existingTopics), JSON.stringify(existingSubjects), schedule.id]
      );

      res.json({ message: 'Topic added to existing schedule', date: revisionDate });
    } else {
      const scheduleId = db.generateUUID();
      await db.query(
        `INSERT INTO revisionschedule
         (id, user_id, date, planned_questions, planned_minutes, subjects, topics, status)
         VALUES ($1, $2, $3, 10, 30, $4, $5, 'scheduled')`,
        [scheduleId, userId, revisionDate,
         JSON.stringify([topic.subject]), JSON.stringify([topic.topic])]
      );

      res.json({ message: 'New schedule created for revision', date: revisionDate, schedule_id: scheduleId });
    }
  } catch (error) {
    console.error('Add to schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/intervals', authenticate, async (req, res) => {
  try {
    const tuningResult = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name LIKE 'revision_interval_%'
       ORDER BY parameter_name`
    );

    const intervals = {
      mastered: [],
      revision_required: [],
      relearn_core: []
    };

    tuningResult.rows.forEach(r => {
      const val = parseFloat(r.parameter_value);
      if (r.parameter_name.includes('mastered')) intervals.mastered.push(val);
      else if (r.parameter_name.includes('revision')) intervals.revision_required.push(val);
      else if (r.parameter_name.includes('relearn')) intervals.relearn_core.push(val);
    });

    res.json({ intervals });
  } catch (error) {
    console.error('Get intervals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function enrichRevisionItem(topic, today) {
  const nextDate = topic.next_revision_date;
  let daysUntil = null;
  let urgency = 'normal';

  if (nextDate) {
    const diffMs = new Date(nextDate).getTime() - new Date(today).getTime();
    daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) urgency = 'overdue';
    else if (daysUntil === 0) urgency = 'today';
    else if (daysUntil <= 2) urgency = 'soon';
  }

  return {
    ...topic,
    days_until_revision: daysUntil,
    urgency,
    revision_progress: topic.required_revisions
      ? `${topic.completed_revisions || 0}/${topic.required_revisions}`
      : '0/3'
  };
}

module.exports = router;

