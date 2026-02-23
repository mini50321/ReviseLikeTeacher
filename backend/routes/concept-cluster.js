const express = require('express');
const { authenticate } = require('../middleware/auth');
const clusterService = require('../services/concept-cluster');
const router = express.Router();

router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await clusterService.getClusterStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching cluster stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats' });
  }
});

router.get('/list', authenticate, async (req, res) => {
  try {
    const { subject, topic, sort } = req.query;
    const clusters = await clusterService.listClusters(subject || null, topic || null, sort || 'repetition_score');
    res.json(clusters);
  } catch (error) {
    console.error('Error listing clusters:', error);
    res.status(500).json({ error: error.message || 'Failed to list clusters' });
  }
});

router.get('/patterns', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;
    const patterns = await clusterService.getRepetitionPatterns(subject || null);
    res.json(patterns);
  } catch (error) {
    console.error('Error fetching repetition patterns:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch patterns' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const detail = await clusterService.getClusterDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Cluster not found' });
    res.json(detail);
  } catch (error) {
    console.error('Error fetching cluster detail:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cluster' });
  }
});

router.post('/detect', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.body;
    const result = await clusterService.runClusterDetection(subject || null, topic || null);
    res.json(result);
  } catch (error) {
    console.error('Error running cluster detection:', error);
    res.status(500).json({ error: error.message || 'Failed to detect clusters' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await clusterService.deleteCluster(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error deleting cluster:', error);
    res.status(500).json({ error: error.message || 'Failed to delete cluster' });
  }
});

module.exports = router;

