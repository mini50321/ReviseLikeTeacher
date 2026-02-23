'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Header from '../../components/Header';
import api from '../../lib/api';
import styles from './subscription.module.css';

function SubscriptionContent() {
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const res = await api.get('/subscription');
      setSubscriptionInfo(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load subscription info');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tier) => {
    try {
      setUpgrading(true);
      setError('');
      setSuccess('');
      await api.post('/subscription/upgrade', { tier, duration_days: 30 });
      setSuccess(`Successfully upgraded to ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan!`);
      await loadSubscription();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upgrade');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will be downgraded to the Free plan.')) return;
    try {
      setUpgrading(true);
      setError('');
      setSuccess('');
      await api.post('/subscription/cancel');
      setSuccess('Subscription cancelled. You are now on the Free plan.');
      await loadSubscription();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel');
    } finally {
      setUpgrading(false);
    }
  };

  const currentTier = subscriptionInfo?.tier || 'free';

  const tierData = [
    {
      key: 'free',
      name: 'Free',
      price: '₹0',
      period: 'forever',
      description: 'Get started with basic practice',
      color: '#9e9e9e',
      features: [
        { text: '2 topics per day', included: true },
        { text: '20 MCQs per day', included: true },
        { text: '1 diagnostic per day', included: true },
        { text: 'Basic MCQ practice', included: true },
        { text: 'Single revision reminder', included: true },
        { text: 'Full topic mastery flow', included: false },
        { text: 'PYQ yield mapping', included: false },
        { text: 'Auto revision calendar', included: false },
        { text: 'Exam trigger notes', included: false },
        { text: 'Misconception analytics', included: false },
        { text: 'Subject scheduling', included: false },
        { text: 'Difficulty adaptation', included: false },
        { text: 'Advanced clinical MCQs', included: false },
        { text: 'Rank prediction', included: false },
        { text: 'Heatmap analytics', included: false }
      ]
    },
    {
      key: 'standard',
      name: 'Standard',
      price: '₹499',
      period: '/month',
      description: 'Full adaptive mastery engine',
      color: '#64b5f6',
      popular: true,
      features: [
        { text: 'Unlimited topics per day', included: true },
        { text: 'Unlimited MCQs per day', included: true },
        { text: 'Unlimited diagnostics', included: true },
        { text: 'Full topic mastery flow (SAQ → LAQ → MCQ)', included: true },
        { text: 'PYQ yield mapping', included: true },
        { text: 'Auto revision calendar', included: true },
        { text: 'Exam trigger notes', included: true },
        { text: 'Misconception analytics', included: true },
        { text: 'Subject scheduling', included: true },
        { text: 'Difficulty adaptation', included: true },
        { text: 'Unlimited revision reminders', included: true },
        { text: 'Advanced clinical MCQs', included: false },
        { text: 'Rank prediction', included: false },
        { text: 'Heatmap analytics', included: false },
        { text: 'Full mock tests', included: false }
      ]
    },
    {
      key: 'premium',
      name: 'Premium',
      price: '₹999',
      period: '/month',
      description: 'Everything + advanced analytics & mocks',
      color: '#ffb74d',
      features: [
        { text: 'Everything in Standard', included: true },
        { text: 'Advanced clinical MCQs', included: true },
        { text: 'Rank prediction', included: true },
        { text: 'Heatmap analytics', included: true },
        { text: 'Adaptive daily plan', included: true },
        { text: 'Full mock tests + remediation', included: true },
        { text: 'Subject crash packs', included: true },
        { text: 'Last 30 days revision mode', included: true },
        { text: 'Integration-style tagging', included: true },
        { text: 'Priority support', included: true }
      ]
    }
  ];

  if (loading) {
    return <div className={styles.loading}>Loading subscription info...</div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <h1 className={styles.title}>Choose Your Plan</h1>
          <p className={styles.subtitle}>Unlock the full adaptive mastery engine to maximize your NEET-PG preparation</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        {subscriptionInfo?.subscription?.expires_at && currentTier !== 'free' && (
          <div className={styles.currentPlanBanner}>
            <span>Current plan: <strong>{currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}</strong></span>
            <span>Expires: {new Date(subscriptionInfo.subscription.expires_at).toLocaleDateString()}</span>
          </div>
        )}

        <div className={styles.tiersGrid}>
          {tierData.map((tier) => (
            <div
              key={tier.key}
              className={`${styles.tierCard} ${currentTier === tier.key ? styles.tierCardActive : ''} ${tier.popular ? styles.tierCardPopular : ''}`}
              style={{ '--tier-color': tier.color }}
            >
              {tier.popular && <div className={styles.popularBadge}>Most Popular</div>}
              {currentTier === tier.key && <div className={styles.currentBadge}>Current Plan</div>}

              <div className={styles.tierHeader}>
                <h2 className={styles.tierName}>{tier.name}</h2>
                <p className={styles.tierDescription}>{tier.description}</p>
                <div className={styles.tierPricing}>
                  <span className={styles.tierPrice}>{tier.price}</span>
                  <span className={styles.tierPeriod}>{tier.period}</span>
                </div>
              </div>

              <ul className={styles.featureList}>
                {tier.features.map((feature, idx) => (
                  <li key={idx} className={`${styles.featureItem} ${feature.included ? styles.featureIncluded : styles.featureExcluded}`}>
                    <span className={styles.featureIcon}>{feature.included ? '✓' : '✗'}</span>
                    <span className={styles.featureText}>{feature.text}</span>
                  </li>
                ))}
              </ul>

              <div className={styles.tierActions}>
                {currentTier === tier.key ? (
                  tier.key !== 'free' ? (
                    <button className={styles.cancelButton} onClick={handleCancel} disabled={upgrading}>
                      {upgrading ? 'Processing...' : 'Cancel Plan'}
                    </button>
                  ) : (
                    <button className={styles.currentPlanButton} disabled>Active</button>
                  )
                ) : (
                  tier.key === 'free' ? (
                    currentTier !== 'free' && (
                      <button className={styles.downgradeButton} onClick={handleCancel} disabled={upgrading}>
                        {upgrading ? 'Processing...' : 'Downgrade to Free'}
                      </button>
                    )
                  ) : (
                    <button
                      className={styles.upgradeButton}
                      style={{ backgroundColor: tier.color }}
                      onClick={() => handleUpgrade(tier.key)}
                      disabled={upgrading}
                    >
                      {upgrading ? 'Processing...' : `Upgrade to ${tier.name}`}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.faqSection}>
          <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
          <div className={styles.faqGrid}>
            <div className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>Can I switch plans anytime?</h3>
              <p className={styles.faqAnswer}>Yes, you can upgrade or downgrade at any time. When upgrading, your new plan starts immediately. When downgrading, you retain access until the current billing period ends.</p>
            </div>
            <div className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>What happens when my plan expires?</h3>
              <p className={styles.faqAnswer}>You will automatically be moved to the Free plan. All your data and progress will be preserved, but premium features will be locked until you renew.</p>
            </div>
            <div className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>Is the Free plan really free?</h3>
              <p className={styles.faqAnswer}>Yes! The Free plan gives you access to basic MCQ practice, limited daily topics, and a single revision reminder. It's a great way to explore the platform.</p>
            </div>
            <div className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>What is the topic mastery flow?</h3>
              <p className={styles.faqAnswer}>The topic mastery flow is a structured learning path: Diagnostic → SAQ Concept Fixing → LAQ Application → MCQ Consolidation → Mastery Check. It's the core of the adaptive engine.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <ProtectedRoute>
      <div>
        <Header />
        <SubscriptionContent />
      </div>
    </ProtectedRoute>
  );
}

