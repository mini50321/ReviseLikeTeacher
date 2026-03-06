const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { getRollingAccuracy, getSuggestedProfile, getProfileTargets } = require('../services/learner-profile');

function parseJsonField(val, defaultValue = null) {
  if (val == null || val === '') return defaultValue;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return defaultValue;
  }
}

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.query;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic query params are required' });
    }
    const result = await db.query(
      `SELECT c.id AS concept_id, c.concept_key, c.name, c.display_order,
              m.id AS mastery_id, m.mastery, m.last_seen, m.next_due, m.weak_points, m.updated_at AS mastery_updated_at
       FROM topic_concept c
       LEFT JOIN concept_mastery m ON m.concept_id = c.id AND m.user_id = $3
       WHERE c.subject = $1 AND c.topic = $2
       ORDER BY c.display_order ASC, c.concept_key ASC`,
      [subject, topic, userId]
    );
    const rows = result.rows || [];
    const masteryList = rows.map((r) => ({
      concept_id: r.concept_id,
      concept_key: r.concept_key,
      name: r.name,
      display_order: r.display_order != null ? r.display_order : 0,
      mastery: r.mastery != null ? Number(r.mastery) : 0,
      last_seen: r.last_seen || null,
      next_due: r.next_due || null,
      weak_points: parseJsonField(r.weak_points, []),
      mastery_updated_at: r.mastery_updated_at || null
    }));
    res.json({ mastery: masteryList });
  } catch (error) {
    console.error('Concept mastery list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/suggested-profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, topic } = req.query;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic query params are required' });
    }
    const { accuracy, count } = await getRollingAccuracy(userId, subject, topic);
    const suggested = getSuggestedProfile(accuracy);
    const profileResult = await db.query(
      'SELECT learner_profile FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const current = (profileResult.rows && profileResult.rows[0]) ? profileResult.rows[0].learner_profile : null;
    const targets = getProfileTargets(suggested);
    let message = '';
    if (count === 0) {
      message = 'No recent attempts in this topic; using mid profile. Complete some questions to get a suggested profile.';
    } else if (suggested === 'top') {
      message = 'Rolling accuracy ≥85%. Increase depth: include deep points and edge cases.';
    } else if (suggested === 'mid') {
      message = 'Rolling accuracy 60–85%. Focus on must-know points and light traps.';
    } else {
      message = 'Rolling accuracy <60%. Simplify and add more repetition; one concept at a time.';
    }
    res.json({
      suggested_profile: suggested,
      current_profile: current,
      rolling_accuracy: accuracy,
      last_n_attempts: count,
      message,
      targets
    });
  } catch (error) {
    console.error('Suggested profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query(
      'SELECT learner_profile, time_budget FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const row = result.rows && result.rows[0];
    res.json({
      learner_profile: row?.learner_profile || null,
      time_budget: row?.time_budget || null
    });
  } catch (error) {
    console.error('Concept mastery profile get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { learner_profile, time_budget } = req.body;
    const allowedProfile = ['top', 'mid', 'struggling'].includes(learner_profile) ? learner_profile : null;
    const allowedBudget = ['short', 'medium', 'long'].includes(time_budget) ? time_budget : null;

    const existing = await db.query('SELECT id FROM userprofile WHERE user_id = $1', [userId]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    if (allowedProfile !== null || allowedBudget !== null) {
      const updates = [];
      const params = [];
      let p = 1;
      if (allowedProfile !== null) {
        updates.push(`learner_profile = $${p++}`);
        params.push(allowedProfile);
      }
      if (allowedBudget !== null) {
        updates.push(`time_budget = $${p++}`);
        params.push(allowedBudget);
      }
      params.push(userId);
      await db.query(
        `UPDATE userprofile SET ${updates.join(', ')} WHERE user_id = $${p}`,
        params
      );
    }

    const select = await db.query(
      'SELECT learner_profile, time_budget FROM userprofile WHERE user_id = $1',
      [userId]
    );
    const row = select.rows && select.rows[0];
    res.json({
      learner_profile: row?.learner_profile || null,
      time_budget: row?.time_budget || null
    });
  } catch (error) {
    console.error('Concept mastery profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conceptId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conceptId } = req.params;
    const conceptResult = await db.query('SELECT id, concept_key, name, display_order FROM topic_concept WHERE id = $1', [conceptId]);
    if (!conceptResult.rows || conceptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }
    const concept = conceptResult.rows[0];
    const masteryResult = await db.query(
      'SELECT id, mastery, last_seen, next_due, weak_points, updated_at FROM concept_mastery WHERE user_id = $1 AND concept_id = $2',
      [userId, conceptId]
    );
    const m = masteryResult.rows && masteryResult.rows[0];
    res.json({
      concept_id: concept.id,
      concept_key: concept.concept_key,
      name: concept.name,
      display_order: concept.display_order != null ? concept.display_order : 0,
      mastery: m ? Number(m.mastery) : 0,
      last_seen: m?.last_seen || null,
      next_due: m?.next_due || null,
      weak_points: parseJsonField(m?.weak_points, []),
      updated_at: m?.updated_at || null
    });
  } catch (error) {
    console.error('Concept mastery get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:conceptId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conceptId } = req.params;
    const { mastery, last_seen, next_due, weak_points } = req.body;

    const conceptResult = await db.query('SELECT id FROM topic_concept WHERE id = $1', [conceptId]);
    if (!conceptResult.rows || conceptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const existing = await db.query(
      'SELECT id, mastery, last_seen, next_due, weak_points FROM concept_mastery WHERE user_id = $1 AND concept_id = $2',
      [userId, conceptId]
    );
    const hasRow = existing.rows && existing.rows.length > 0;
    const row = hasRow ? existing.rows[0] : null;

    const newMastery = mastery !== undefined ? Math.max(0, Math.min(1, Number(mastery))) : (row ? Number(row.mastery) : 0);
    const newLastSeen = last_seen !== undefined ? last_seen : (row?.last_seen ?? null);
    const newNextDue = next_due !== undefined ? next_due : (row?.next_due ?? null);
    const newWeakPoints = weak_points !== undefined
      ? (Array.isArray(weak_points) ? weak_points : [])
      : parseJsonField(row?.weak_points, []);

    if (hasRow) {
      await db.query(
        `UPDATE concept_mastery SET mastery = $1, last_seen = $2, next_due = $3, weak_points = $4 WHERE user_id = $5 AND concept_id = $6`,
        [newMastery, newLastSeen, newNextDue, JSON.stringify(newWeakPoints), userId, conceptId]
      );
    } else {
      const id = db.generateUUID();
      await db.query(
        `INSERT INTO concept_mastery (id, user_id, concept_id, mastery, last_seen, next_due, weak_points)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, conceptId, newMastery, newLastSeen, newNextDue, JSON.stringify(newWeakPoints)]
      );
    }

    const select = await db.query(
      `SELECT c.id AS concept_id, c.concept_key, c.name, c.display_order,
              m.mastery, m.last_seen, m.next_due, m.weak_points, m.updated_at
       FROM topic_concept c
       LEFT JOIN concept_mastery m ON m.concept_id = c.id AND m.user_id = $2
       WHERE c.id = $1`,
      [conceptId, userId]
    );
    const r = select.rows && select.rows[0];
    if (!r) {
      return res.status(500).json({ error: 'Failed to read back mastery' });
    }
    res.json({
      concept_id: r.concept_id,
      concept_key: r.concept_key,
      name: r.name,
      display_order: r.display_order != null ? r.display_order : 0,
      mastery: r.mastery != null ? Number(r.mastery) : 0,
      last_seen: r.last_seen || null,
      next_due: r.next_due || null,
      weak_points: parseJsonField(r.weak_points, []),
      updated_at: r.updated_at || null
    });
  } catch (error) {
    console.error('Concept mastery upsert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
