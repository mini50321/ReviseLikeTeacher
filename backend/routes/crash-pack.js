const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { generateCrashPack, listSubjectsForCrashPack } = require('../services/crash-pack');

router.get('/subjects', authenticate, requireFeature('subject_crash_packs'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const subjects = await listSubjectsForCrashPack(userId);
    res.json({ subjects });
  } catch (error) {
    console.error('Crash pack subjects error:', error);
    res.status(500).json({ error: 'Failed to load subjects' });
  }
});

router.get('/generate/:subject', authenticate, requireFeature('subject_crash_packs'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const subject = decodeURIComponent(req.params.subject);
    const pack = await generateCrashPack(userId, subject);
    res.json(pack);
  } catch (error) {
    console.error('Crash pack generate error:', error);
    res.status(500).json({ error: 'Failed to generate crash pack' });
  }
});

module.exports = router;

