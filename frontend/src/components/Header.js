'use client';

import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './Header.module.css';

export default function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/dashboard" className={styles.logo}>
          ReviseLikeTeacher
        </Link>

        <nav className={styles.nav}>
          {user?.role === 'admin' ? (
            <>
              <Link href="/admin/dashboard" className={styles.navLink}>
                Dashboard
              </Link>
              <Link href="/admin/question-studio" className={styles.navLink}>
                Questions
              </Link>
              <Link href="/admin/pdf-upload" className={styles.navLink}>
                PDF Upload
              </Link>
              <Link href="/admin/analytics" className={styles.navLink}>
                Analytics
              </Link>
              <Link href="/distractor-lab" className={styles.navLink}>
                Distractors
              </Link>
              <Link href="/integration-tags" className={styles.navLink}>
                Integration
              </Link>
              <Link href="/concept-clusters" className={styles.navLink}>
                Clusters
              </Link>
              <Link href="/saq-converter" className={styles.navLink}>
                SAQ Converter
              </Link>
              <Link href="/laq-generator" className={styles.navLink}>
                LAQ Generator
              </Link>
              <Link href="/question-quality" className={styles.navLink}>
                Quality
              </Link>
              <Link href="/student-progress" className={styles.navLink}>
                Progress
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className={styles.navLink}>
                Dashboard
              </Link>
              <Link href="/diagnostic" className={styles.navLink}>
                Diagnostic
              </Link>
              <Link href="/practice" className={styles.navLink}>
                Practice
              </Link>
              <Link href="/schedule" className={styles.navLink}>
                Schedule
              </Link>
              <Link href="/misconceptions" className={styles.navLink}>
                Misconceptions
              </Link>
              <Link href="/exam-notes" className={styles.navLink}>
                Exam Notes
              </Link>
              <Link href="/teaching-units" className={styles.navLink}>
                Teaching Units
              </Link>
              <Link href="/distractor-lab" className={styles.navLink}>
                Distractors
              </Link>
              <Link href="/metrics-lab" className={styles.navLink}>
                Analytics
              </Link>
              <Link href="/advanced-analytics" className={styles.navLink}>
                Rank
              </Link>
              <Link href="/daily-plan" className={styles.navLink}>
                Daily Plan
              </Link>
              <Link href="/mock-tests" className={styles.navLink}>
                Mock Tests
              </Link>
              <Link href="/crash-packs" className={styles.navLink}>
                Crash Packs
              </Link>
              <Link href="/last30" className={styles.navLink}>
                Last 30 Days
              </Link>
              <Link href="/integration-tags" className={styles.navLink}>
                Integration
              </Link>
              <Link href="/concept-clusters" className={styles.navLink}>
                Clusters
              </Link>
              <Link href="/subscription" className={styles.navLink}>
                Plans
              </Link>
            </>
          )}
        </nav>

        <div className={styles.userSection}>
          <span className={styles.userEmail}>{user?.email}</span>
          <button onClick={handleLogout} className={styles.logoutButton} title="Log Out" aria-label="Log Out">
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

