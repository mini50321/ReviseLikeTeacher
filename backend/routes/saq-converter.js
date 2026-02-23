const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const saqConverterService = require('../services/saq-converter');
const router = express.Router();

router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await saqConverterService.getConversionStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/conversions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, subject, topic, cognitive_level, conversion_type } = req.query;
    const conversions = await saqConverterService.getConversions({
      status, subject, topic, cognitive_level, conversion_type
    });
    res.json({ conversions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/unconverted', authenticate, requireAdmin, async (req, res) => {
  try {
    const { subject, topic, yield_category } = req.query;
    const mcqs = await saqConverterService.getUnconvertedMCQs({ subject, topic, yield_category });
    res.json({ mcqs, total: mcqs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/convert', authenticate, requireAdmin, async (req, res) => {
  try {
    const { question_ids } = req.body;

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return res.status(400).json({ error: 'question_ids array is required' });
    }

    if (question_ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 questions per batch' });
    }

    const result = await saqConverterService.convertMCQsToSAQs(question_ids);
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

    const result = await saqConverterService.reviewConversion(
      req.params.id, action, req.user.id, edited_data
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await saqConverterService.deleteConversion(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

