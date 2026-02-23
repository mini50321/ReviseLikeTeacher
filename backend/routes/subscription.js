const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getSubscriptionInfo,
  upgradeTier,
  cancelSubscription,
  checkFeatureAccess,
  checkDailyLimit,
  TIER_FEATURES
} = require('../services/subscription');

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const info = await getSubscriptionInfo(userId);
    res.json(info);
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tiers', async (req, res) => {
  try {
    const tiers = Object.entries(TIER_FEATURES).map(([key, val]) => ({
      tier: key,
      label: val.label,
      price: val.price,
      daily_topic_limit: val.daily_topic_limit === -1 ? 'Unlimited' : val.daily_topic_limit,
      daily_mcq_limit: val.daily_mcq_limit === -1 ? 'Unlimited' : val.daily_mcq_limit,
      topic_mastery_flow: val.topic_mastery_flow,
      pyq_yield_mapping: val.pyq_yield_mapping,
      auto_revision_calendar: val.auto_revision_calendar,
      exam_trigger_notes: val.exam_trigger_notes,
      advanced_clinical_mcqs: val.advanced_clinical_mcqs,
      rank_prediction: val.rank_prediction,
      heatmap_analytics: val.heatmap_analytics,
      adaptive_daily_plan: val.adaptive_daily_plan,
      full_mock_tests: val.full_mock_tests,
      misconception_analytics: val.misconception_analytics,
      subject_scheduling: val.subject_scheduling,
      difficulty_adaptation: val.difficulty_adaptation
    }));
    res.json({ tiers });
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/upgrade', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tier, duration_days = 30 } = req.body;

    if (!tier || !['standard', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Choose standard or premium.' });
    }

    const result = await upgradeTier(userId, tier, duration_days);
    res.json({
      message: `Successfully upgraded to ${tier} plan`,
      ...result
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/cancel', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await cancelSubscription(userId);
    res.json({
      message: 'Subscription cancelled. You are now on the Free plan.',
      ...result
    });
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/check-feature/:feature', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { feature } = req.params;
    const result = await checkFeatureAccess(userId, feature);
    res.json(result);
  } catch (error) {
    console.error('Check feature error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/check-limit/:limitType', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limitType } = req.params;
    const result = await checkDailyLimit(userId, limitType);
    res.json(result);
  } catch (error) {
    console.error('Check limit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

