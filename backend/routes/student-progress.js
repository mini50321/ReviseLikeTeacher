const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const progressService = require('../services/student-progress');
const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  try {
    const overview = await progressService.getPlatformOverview();
    res.json(overview);
  } catch (error) {
    console.error('Platform overview error:', error);
    res.status(500).json({ error: 'Failed to fetch platform overview' });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const alerts = await progressService.getAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const { search } = req.query;
    const students = await progressService.getStudentList({ search });
    res.json({ students });
  } catch (error) {
    console.error('Student list error:', error);
    res.status(500).json({ error: 'Failed to fetch student list' });
  }
});

router.get('/students/:userId', async (req, res) => {
  try {
    const detail = await progressService.getStudentDetail(req.params.userId);
    if (!detail) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(detail);
  } catch (error) {
    console.error('Student detail error:', error);
    res.status(500).json({ error: 'Failed to fetch student detail' });
  }
});

module.exports = router;

