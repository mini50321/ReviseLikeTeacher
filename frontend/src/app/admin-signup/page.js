'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import Link from 'next/link';
import api from '../../lib/api';
import styles from '../login/login.module.css';

export default function AdminSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register-admin', {
        email,
        password
      });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setSuccess('Admin account created! Redirecting...');
        setTimeout(() => {
          router.push('/admin/dashboard');
        }, 1500);
      } else {
        setSuccess(response.data.message || 'Account updated to admin. Please log in.');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create admin account');
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>ReviseLikeTeacher</h1>
        <h2 className={styles.subtitle}>Admin Sign Up</h2>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: 'rgba(46, 125, 50, 0.2)', color: '#fff', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(46, 125, 50, 0.4)' }}>{success}</div>}

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
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Must be at least 8 characters
            </small>
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            {loading ? 'Creating admin account...' : 'Create Admin Account'}
          </button>
        </form>

        <div className={styles.links}>
          <Link href="/login" className={styles.link}>
            Already have an account? Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

