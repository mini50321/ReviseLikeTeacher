const { db } = require('../db');

const TIER_FEATURES = {
  free: {
    label: 'Free',
    daily_topic_limit: 2,
    daily_mcq_limit: 20,
    daily_diagnostic_limit: 1,
    topic_mastery_flow: false,
    pyq_yield_mapping: false,
    auto_revision_calendar: false,
    exam_trigger_notes: false,
    advanced_clinical_mcqs: false,
    rank_prediction: false,
    heatmap_analytics: false,
    adaptive_daily_plan: false,
    full_mock_tests: false,
    subject_crash_packs: false,
    last_30_days_mode: false,
    integration_tagging: false,
    misconception_analytics: false,
    subject_scheduling: false,
    difficulty_adaptation: false,
    revision_reminders: 1,
    price: 0
  },
  standard: {
    label: 'Standard',
    daily_topic_limit: -1,
    daily_mcq_limit: -1,
    daily_diagnostic_limit: -1,
    topic_mastery_flow: true,
    pyq_yield_mapping: true,
    auto_revision_calendar: true,
    exam_trigger_notes: true,
    advanced_clinical_mcqs: false,
    rank_prediction: false,
    heatmap_analytics: false,
    adaptive_daily_plan: false,
    full_mock_tests: false,
    subject_crash_packs: false,
    last_30_days_mode: false,
    integration_tagging: false,
    misconception_analytics: true,
    subject_scheduling: true,
    difficulty_adaptation: true,
    revision_reminders: -1,
    price: 499
  },
  premium: {
    label: 'Premium',
    daily_topic_limit: -1,
    daily_mcq_limit: -1,
    daily_diagnostic_limit: -1,
    topic_mastery_flow: true,
    pyq_yield_mapping: true,
    auto_revision_calendar: true,
    exam_trigger_notes: true,
    advanced_clinical_mcqs: true,
    rank_prediction: true,
    heatmap_analytics: true,
    adaptive_daily_plan: true,
    full_mock_tests: true,
    subject_crash_packs: true,
    last_30_days_mode: true,
    integration_tagging: true,
    misconception_analytics: true,
    subject_scheduling: true,
    difficulty_adaptation: true,
    revision_reminders: -1,
    price: 999
  }
};

async function getUserTier(userId) {
  const subResult = await db.query(
    `SELECT tier, status, expires_at FROM subscription WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );

  if (subResult.rows.length > 0) {
    const sub = subResult.rows[0];
    if (sub.expires_at) {
      const expiry = new Date(sub.expires_at);
      if (expiry < new Date()) {
        await db.query(
          `UPDATE subscription SET status = 'expired' WHERE user_id = $1`,
          [userId]
        );
        await db.query(
          `UPDATE userprofile SET subscription_tier = 'free' WHERE user_id = $1`,
          [userId]
        );
        return 'free';
      }
    }
    return sub.tier;
  }

  const profileResult = await db.query(
    `SELECT subscription_tier FROM userprofile WHERE user_id = $1`,
    [userId]
  );

  return profileResult.rows.length > 0 ? (profileResult.rows[0].subscription_tier || 'free') : 'free';
}

function getTierFeatures(tier) {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

async function checkFeatureAccess(userId, featureName) {
  const tier = await getUserTier(userId);
  const features = getTierFeatures(tier);

  if (features[featureName] === undefined) {
    return { allowed: true, tier, reason: null };
  }

  if (typeof features[featureName] === 'boolean') {
    return {
      allowed: features[featureName],
      tier,
      reason: features[featureName] ? null : `This feature requires ${getMinimumTierForFeature(featureName)} plan or higher`
    };
  }

  return { allowed: true, tier, features };
}

async function checkDailyLimit(userId, limitType) {
  const tier = await getUserTier(userId);
  const features = getTierFeatures(tier);

  const limitValue = features[limitType];
  if (!limitValue || limitValue === -1) {
    return { allowed: true, tier, used: 0, limit: -1 };
  }

  let used = 0;
  const today = new Date().toISOString().split('T')[0];

  if (limitType === 'daily_topic_limit') {
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM topic_learning_session
       WHERE user_id = $1 AND date(started_at) = $2`,
      [userId, today]
    );
    used = parseInt(result.rows[0]?.cnt || 0);
  } else if (limitType === 'daily_mcq_limit') {
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM attempt
       WHERE user_id = $1 AND date(submitted_at) = $2 AND question_id IN (SELECT id FROM question WHERE type = 'mcq')`,
      [userId, today]
    );
    used = parseInt(result.rows[0]?.cnt || 0);
  } else if (limitType === 'daily_diagnostic_limit') {
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM diagnostic_assessment
       WHERE user_id = $1 AND date(started_at) = $2`,
      [userId, today]
    );
    used = parseInt(result.rows[0]?.cnt || 0);
  }

  return {
    allowed: used < limitValue,
    tier,
    used,
    limit: limitValue,
    remaining: Math.max(0, limitValue - used)
  };
}

function getMinimumTierForFeature(featureName) {
  if (TIER_FEATURES.standard[featureName] === true) return 'Standard';
  if (TIER_FEATURES.premium[featureName] === true) return 'Premium';
  return 'Premium';
}

async function getSubscriptionInfo(userId) {
  const tier = await getUserTier(userId);
  const features = getTierFeatures(tier);

  const subResult = await db.query(
    `SELECT * FROM subscription WHERE user_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );

  const subscription = subResult.rows.length > 0 ? subResult.rows[0] : null;

  return {
    tier,
    features,
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      started_at: subscription.started_at,
      expires_at: subscription.expires_at
    } : null,
    all_tiers: Object.entries(TIER_FEATURES).map(([key, val]) => ({
      tier: key,
      label: val.label,
      price: val.price,
      features: val
    }))
  };
}

async function upgradeTier(userId, newTier, durationDays = 30) {
  if (!TIER_FEATURES[newTier]) {
    throw new Error('Invalid tier');
  }

  const existingSub = await db.query(
    `SELECT id FROM subscription WHERE user_id = $1`,
    [userId]
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  if (existingSub.rows.length > 0) {
    await db.query(
      `UPDATE subscription SET tier = $1, status = 'active', started_at = CURRENT_TIMESTAMP, expires_at = $2
       WHERE user_id = $3`,
      [newTier, expiresAt.toISOString(), userId]
    );
  } else {
    await db.query(
      `INSERT INTO subscription (id, user_id, tier, status, started_at, expires_at)
       VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, $4)`,
      [db.generateUUID(), userId, newTier, expiresAt.toISOString()]
    );
  }

  await db.query(
    `UPDATE userprofile SET subscription_tier = $1 WHERE user_id = $2`,
    [newTier, userId]
  );

  return { tier: newTier, expires_at: expiresAt.toISOString() };
}

async function cancelSubscription(userId) {
  await db.query(
    `UPDATE subscription SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  await db.query(
    `UPDATE userprofile SET subscription_tier = 'free' WHERE user_id = $1`,
    [userId]
  );
  return { tier: 'free' };
}

module.exports = {
  TIER_FEATURES,
  getUserTier,
  getTierFeatures,
  checkFeatureAccess,
  checkDailyLimit,
  getSubscriptionInfo,
  upgradeTier,
  cancelSubscription,
  getMinimumTierForFeature
};

