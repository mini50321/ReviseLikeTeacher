const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const qualityService = require('../services/question-quality');
const router = express.Router();

router.get('/health', authenticate, requireAdmin, async (req, res) => {
  try {
    const health = await qualityService.getQuestionBankHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/completeness', authenticate, requireAdmin, async (req, res) => {
  try {
    const completeness = await qualityService.getTopicCompleteness();
    res.json({ topics: completeness });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subjects', authenticate, requireAdmin, async (req, res) => {
  try {
    const subjects = await qualityService.getSubjectQualitySummary();
    res.json({ subjects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/issues', authenticate, requireAdmin, async (req, res) => {
  try {
    const issues = await qualityService.getQualityIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/validate/:subject/:topic', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await qualityService.validateMCQSet(req.params.subject, req.params.topic);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

