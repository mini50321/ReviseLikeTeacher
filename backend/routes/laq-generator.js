const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const laqService = require('../services/laq-generator');
const router = express.Router();

router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await laqService.getLAQStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/topics', authenticate, requireAdmin, async (req, res) => {
  try {
    const topics = await laqService.getAvailableTopics();
    res.json({ topics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, status, difficulty } = req.query;
    const laqs = await laqService.getLAQs({ subject, topic, status, difficulty });
    res.json({ laqs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const laq = await laqService.getLAQById(req.params.id);
    if (!laq) return res.status(404).json({ error: 'LAQ not found' });
    res.json(laq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, difficulty } = req.body;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'Subject and topic are required' });
    }
    const result = await laqService.generateLAQ(subject, topic, difficulty || 'medium');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/review/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { action, edited_data } = req.body;
    if (!['approve', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, reject, or edit' });
    }
    const result = await laqService.reviewLAQ(req.params.id, action, req.user.id, edited_data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await laqService.deleteLAQ(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

