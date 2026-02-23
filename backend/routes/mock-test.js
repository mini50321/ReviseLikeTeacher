const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { generateMockTest, startMockTest, submitMockTest, getMockTestResult, listMockTests } = require('../services/mock-test');

router.post('/generate', authenticate, requireFeature('full_mock_tests'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { total_questions, duration_minutes, title } = req.body;
    const result = await generateMockTest(userId, { total_questions, duration_minutes, title });
    res.json(result);
  } catch (error) {
    console.error('Generate mock test error:', error);
    res.status(500).json({ error: 'Failed to generate mock test' });
  }
});

router.post('/:id/start', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await startMockTest(req.params.id, userId);
    if (!result) return res.status(404).json({ error: 'Mock test not found' });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('Start mock test error:', error);
    res.status(500).json({ error: 'Failed to start mock test' });
  }
});

router.post('/:id/submit', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answers } = req.body;
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Answers object required' });
    }
    const result = await submitMockTest(req.params.id, userId, answers);
    if (!result) return res.status(404).json({ error: 'Mock test not found' });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('Submit mock test error:', error);
    res.status(500).json({ error: 'Failed to submit mock test' });
  }
});

router.get('/:id/result', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await getMockTestResult(req.params.id, userId);
    if (!result) return res.status(404).json({ error: 'Mock test not found' });
    res.json(result);
  } catch (error) {
    console.error('Get mock test result error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tests = await listMockTests(userId);
    res.json({ tests });
  } catch (error) {
    console.error('List mock tests error:', error);
    res.status(500).json({ error: 'Failed to list mock tests' });
  }
});

module.exports = router;

