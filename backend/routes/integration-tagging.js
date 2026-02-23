const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const integrationService = require('../services/integration-tagging');
const router = express.Router();

router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await integrationService.getIntegrationStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching integration stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats' });
  }
});

router.get('/map', authenticate, requireFeature('integration_tagging'), async (req, res) => {
  try {
    const { subject } = req.query;
    const map = await integrationService.getIntegrationMap(subject || null);
    res.json(map);
  } catch (error) {
    console.error('Error fetching integration map:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch map' });
  }
});

router.get('/connections', authenticate, requireFeature('integration_tagging'), async (req, res) => {
  try {
    const connections = await integrationService.getSubjectConnections();
    res.json(connections);
  } catch (error) {
    console.error('Error fetching subject connections:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch connections' });
  }
});

router.get('/practice', authenticate, requireFeature('integration_tagging'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, type, limit } = req.query;
    const questions = await integrationService.getIntegrationPractice(
      userId,
      subject || null,
      type || null,
      parseInt(limit) || 15
    );
    res.json(questions);
  } catch (error) {
    console.error('Error fetching integration practice:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch practice questions' });
  }
});

router.post('/auto-detect', authenticate, async (req, res) => {
  try {
    const { questionIds } = req.body;
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required' });
    }
    if (questionIds.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 questions per request' });
    }
    const result = await integrationService.autoDetectIntegrations(questionIds);
    res.json(result);
  } catch (error) {
    console.error('Error auto-detecting integrations:', error);
    res.status(500).json({ error: error.message || 'Failed to detect integrations' });
  }
});

router.post('/manual', authenticate, async (req, res) => {
  try {
    const { questionId, tagData } = req.body;
    if (!questionId || !tagData) {
      return res.status(400).json({ error: 'questionId and tagData are required' });
    }
    const result = await integrationService.addManualTag(questionId, tagData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error adding manual tag:', error);
    res.status(500).json({ error: error.message || 'Failed to add tag' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await integrationService.deleteTag(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: error.message || 'Failed to delete tag' });
  }
});

module.exports = router;

