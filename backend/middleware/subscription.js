const { checkFeatureAccess, checkDailyLimit } = require('../services/subscription');

function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'admin') {
        req.subscriptionTier = 'admin';
        return next();
      }

      const userId = req.user.userId;
      const result = await checkFeatureAccess(userId, featureName);

      if (!result.allowed) {
        return res.status(403).json({
          error: 'Feature not available on your current plan',
          feature: featureName,
          current_tier: result.tier,
          reason: result.reason,
          upgrade_required: true
        });
      }

      req.subscriptionTier = result.tier;
      next();
    } catch (error) {
      console.error('Subscription check error:', error);
      next();
    }
  };
}

function requireDailyLimit(limitType) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'admin') {
        req.subscriptionTier = 'admin';
        req.dailyLimitInfo = { allowed: true, tier: 'admin', used: 0, limit: null, remaining: null };
        return next();
      }

      const userId = req.user.userId;
      const result = await checkDailyLimit(userId, limitType);

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Daily limit reached on your current plan',
          limit_type: limitType,
          current_tier: result.tier,
          used: result.used,
          limit: result.limit,
          remaining: 0,
          upgrade_required: true
        });
      }

      req.subscriptionTier = result.tier;
      req.dailyLimitInfo = result;
      next();
    } catch (error) {
      console.error('Daily limit check error:', error);
      next();
    }
  };
}

module.exports = { requireFeature, requireDailyLimit };

