'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import styles from './Header.module.css';

export default function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      document.body.classList.add('has-sidebar');
      document.body.classList.toggle('sidebar-collapsed', collapsed);
    }
    return () => {
      document.body.classList.remove('has-sidebar', 'sidebar-collapsed');
    };
  }, [isAuthenticated, collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (href) => pathname === href || pathname?.startsWith(href + '/');

  const adminSections = [
    {
      label: 'Management',
      links: [
        { href: '/admin/dashboard', icon: '📊', text: 'Dashboard' },
        { href: '/admin/question-studio', icon: '✏️', text: 'Questions' },
        { href: '/admin/pdf-upload', icon: '📄', text: 'PDF Upload' },
        { href: '/admin/analytics', icon: '📈', text: 'Analytics' },
      ]
    },
    {
      label: 'Analysis',
      links: [
        { href: '/distractor-lab', icon: '🔍', text: 'Distractors' },
        { href: '/integration-tags', icon: '🔗', text: 'Integration' },
        { href: '/concept-clusters', icon: '🧩', text: 'Clusters' },
      ]
    },
    {
      label: 'Content',
      links: [
        { href: '/saq-converter', icon: '🔄', text: 'SAQ Converter' },
        { href: '/laq-generator', icon: '🧪', text: 'LAQ Generator' },
        { href: '/question-quality', icon: '✅', text: 'Quality' },
      ]
    },
    {
      label: 'Students',
      links: [
        { href: '/student-progress', icon: '👥', text: 'Progress' },
      ]
    }
  ];

  const studentSections = [
    {
      label: 'Core',
      links: [
        { href: '/dashboard', icon: '🏠', text: 'Dashboard' },
        { href: '/diagnostic', icon: '🩺', text: 'Diagnostic' },
        { href: '/practice', icon: '💪', text: 'Practice' },
      ]
    },
    {
      label: 'Planning',
      links: [
        { href: '/schedule', icon: '📅', text: 'Schedule' },
        { href: '/daily-plan', icon: '📋', text: 'Daily Plan' },
      ]
    },
    {
      label: 'Learning',
      links: [
        { href: '/misconceptions', icon: '🧠', text: 'Misconceptions' },
        { href: '/exam-notes', icon: '📝', text: 'Exam Notes' },
        { href: '/teaching-units', icon: '📚', text: 'Teaching Units' },
      ]
    },
    {
      label: 'Insights',
      links: [
        { href: '/distractor-lab', icon: '🔍', text: 'Distractors' },
        { href: '/metrics-lab', icon: '📈', text: 'Analytics' },
        { href: '/advanced-analytics', icon: '🏆', text: 'Rank' },
      ]
    },
    {
      label: 'Testing',
      links: [
        { href: '/mock-tests', icon: '📝', text: 'Mock Tests' },
        { href: '/crash-packs', icon: '⚡', text: 'Crash Packs' },
        { href: '/last30', icon: '🎯', text: 'Last 30 Days' },
      ]
    },
    {
      label: 'Advanced',
      links: [
        { href: '/integration-tags', icon: '🔗', text: 'Integration' },
        { href: '/concept-clusters', icon: '🧩', text: 'Clusters' },
      ]
    },
    {
      label: 'Account',
      links: [
        { href: '/subscription', icon: '💎', text: 'Plans' },
      ]
    }
  ];

  const sections = user?.role === 'admin' ? adminSections : studentSections;

  return (
    <>
      <button
        className={styles.mobileToggle}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className={`${styles.hamburger} ${mobileOpen ? styles.hamburgerOpen : ''}`} />
      </button>

      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
      >
        <div className={styles.sidebarHeader}>
          <Link href={user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'} className={styles.logo}>
            {collapsed ? 'R' : 'ReviseLikeTeacher'}
          </Link>
          <button
            className={styles.collapseButton}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />
              }
            </svg>
          </button>
        </div>

        <nav className={styles.nav}>
          {sections.map((section) => (
            <div key={section.label} className={styles.navSection}>
              {!collapsed && <div className={styles.sectionLabel}>{section.label}</div>}
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.navLink} ${isActive(link.href) ? styles.navLinkActive : ''}`}
                  title={collapsed ? link.text : undefined}
                >
                  <span className={styles.navIcon}>{link.icon}</span>
                  {!collapsed && <span className={styles.navText}>{link.text}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.userSection}>
          {!collapsed && <div className={styles.userEmail}>{user?.email}</div>}
          <button onClick={logout} className={styles.logoutButton} title="Log Out" aria-label="Log Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!collapsed && <span className={styles.logoutText}>Log Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
