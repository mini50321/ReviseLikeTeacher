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
                Admin Dashboard
              </Link>
              <Link href="/admin/question-studio" className={styles.navLink}>
                Question Studio
              </Link>
              <Link href="/admin/pdf-upload" className={styles.navLink}>
                PDF Upload
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className={styles.navLink}>
                Dashboard
              </Link>
              <Link href="/practice" className={styles.navLink}>
                Practice
              </Link>
              <Link href="/schedule" className={styles.navLink}>
                Schedule
              </Link>
              <Link href="/metrics-lab" className={styles.navLink}>
                Analytics
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

