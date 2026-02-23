const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/subscription');
const { generateSubjectPlan, updateSubjectRating, getSubjectAllocations } = require('../services/subject-scheduler');

router.post('/generate', authenticate, requireFeature('subject_scheduling'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await generateSubjectPlan(userId);

    if (!result) {
      return res.status(404).json({ error: 'Profile not found or no subjects selected. Please complete onboarding.' });
    }

    res.json(result);
  } catch (error) {
    console.error('Generate subject plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const allocations = await getSubjectAllocations(userId);

    if (allocations.length === 0) {
      return res.json({ allocations: [], generated: false });
    }

    res.json({ allocations, generated: true });
  } catch (error) {
    console.error('Get subject plan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/rating', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, self_rating } = req.body;

    if (!subject || !self_rating || self_rating < 1 || self_rating > 5) {
      return res.status(400).json({ error: 'Subject and valid self_rating (1-5) required' });
    }

    await updateSubjectRating(userId, subject, self_rating);

    res.json({ message: 'Rating updated' });
  } catch (error) {
    console.error('Update subject rating error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/ratings/bulk', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { ratings } = req.body;

    if (!ratings || !Array.isArray(ratings)) {
      return res.status(400).json({ error: 'Ratings array required' });
    }

    for (const { subject, self_rating } of ratings) {
      if (subject && self_rating >= 1 && self_rating <= 5) {
        await updateSubjectRating(userId, subject, self_rating);
      }
    }

    res.json({ message: 'Ratings updated', count: ratings.length });
  } catch (error) {
    console.error('Bulk update ratings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

