'use client';

import { useState } from 'react';
import { authAPI } from '../../lib/api';
import Link from 'next/link';
import styles from '../login/login.module.css';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.resetPassword(email);
      setSuccess(true);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>ReviseLikeTeacher</h1>
          <h2 className={styles.subtitle}>Check Your Email</h2>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>
            If an account exists with that email, a password reset link has been sent.
          </p>
          <Link href="/login" className={styles.link} style={{ display: 'block', textAlign: 'center' }}>
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>ReviseLikeTeacher</h1>
        <h2 className={styles.subtitle}>Reset Password</h2>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter your email address"
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className={styles.links}>
          <Link href="/login" className={styles.link}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

