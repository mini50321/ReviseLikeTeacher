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
          <button onClick={handleLogout} className={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}

