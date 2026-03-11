'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Stethoscope, Dumbbell, CalendarDays, ClipboardList,
  BrainCircuit, FileText, BookOpen, Search, BarChart3, Trophy,
  ScrollText, Zap, Target, Link2, Puzzle, CreditCard,
  PenSquare, FileUp, TrendingUp, RefreshCw, FlaskConical,
  BadgeCheck, Users, LogOut, ChevronLeft, ChevronRight, Map, GraduationCap, X
} from 'lucide-react';
import styles from './Header.module.css';

const iconProps = { size: 18, strokeWidth: 1.8 };

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
        { href: '/admin/dashboard', icon: <LayoutDashboard {...iconProps} />, text: 'Dashboard' },
        { href: '/admin/question-studio', icon: <PenSquare {...iconProps} />, text: 'Questions' },
        { href: '/admin/pdf-upload', icon: <FileUp {...iconProps} />, text: 'PDF Upload' },
        { href: '/admin/training-examples', icon: <GraduationCap {...iconProps} />, text: 'Training Examples' },
        { href: '/admin/concept-map-test', icon: <Map {...iconProps} />, text: 'Concept Map Test' },
        { href: '/admin/analytics', icon: <TrendingUp {...iconProps} />, text: 'Analytics' },
      ]
    },
    {
      label: 'Analysis',
      links: [
        { href: '/distractor-lab', icon: <Search {...iconProps} />, text: 'Distractors' },
        { href: '/integration-tags', icon: <Link2 {...iconProps} />, text: 'Integration' },
        { href: '/concept-clusters', icon: <Puzzle {...iconProps} />, text: 'Clusters' },
      ]
    },
    {
      label: 'Content',
      links: [
        { href: '/saq-converter', icon: <RefreshCw {...iconProps} />, text: 'SAQ Converter' },
        { href: '/laq-generator', icon: <FlaskConical {...iconProps} />, text: 'LAQ Generator' },
        { href: '/question-quality', icon: <BadgeCheck {...iconProps} />, text: 'Quality' },
      ]
    },
    {
      label: 'Students',
      links: [
        { href: '/student-progress', icon: <Users {...iconProps} />, text: 'Progress' },
      ]
    }
  ];

  const studentSections = [
    {
      label: 'Core',
      links: [
        { href: '/dashboard', icon: <LayoutDashboard {...iconProps} />, text: 'Dashboard' },
        { href: '/diagnostic', icon: <Stethoscope {...iconProps} />, text: 'Diagnostic' },
        { href: '/practice', icon: <Dumbbell {...iconProps} />, text: 'Practice' },
      ]
    },
    {
      label: 'Planning',
      links: [
        { href: '/today-plan', icon: <Target {...iconProps} />, text: "Today's Plan" },
        { href: '/schedule', icon: <CalendarDays {...iconProps} />, text: 'Schedule' },
        { href: '/daily-plan', icon: <ClipboardList {...iconProps} />, text: 'Daily Plan' },
      ]
    },
    {
      label: 'Learning',
      links: [
        { href: '/misconceptions', icon: <BrainCircuit {...iconProps} />, text: 'Misconceptions' },
        { href: '/concept-map', icon: <Map {...iconProps} />, text: 'Concept Map' },
        { href: '/exam-notes', icon: <FileText {...iconProps} />, text: 'Exam Notes' },
        { href: '/teaching-units', icon: <BookOpen {...iconProps} />, text: 'Teaching Units' },
      ]
    },
    {
      label: 'Insights',
      links: [
        { href: '/distractor-lab', icon: <Search {...iconProps} />, text: 'Distractors' },
        { href: '/metrics-lab', icon: <BarChart3 {...iconProps} />, text: 'Analytics' },
        { href: '/advanced-analytics', icon: <Trophy {...iconProps} />, text: 'Rank' },
      ]
    },
    {
      label: 'Testing',
      links: [
        { href: '/mock-tests', icon: <ScrollText {...iconProps} />, text: 'Mock Tests' },
        { href: '/crash-packs', icon: <Zap {...iconProps} />, text: 'Crash Packs' },
        { href: '/last30', icon: <Target {...iconProps} />, text: 'Last 30 Days' },
      ]
    },
    {
      label: 'Advanced',
      links: [
        { href: '/integration-tags', icon: <Link2 {...iconProps} />, text: 'Integration' },
        { href: '/concept-clusters', icon: <Puzzle {...iconProps} />, text: 'Clusters' },
      ]
    },
    {
      label: 'Account',
      links: [
        { href: '/onboarding', icon: <PenSquare {...iconProps} />, text: 'Onboarding' },
        { href: '/subscription', icon: <CreditCard {...iconProps} />, text: 'Plans' },
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
        {mobileOpen ? (
          <X size={22} strokeWidth={2} />
        ) : (
          <span className={styles.hamburger} />
        )}
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
            {collapsed ? <ChevronRight size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
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
            <LogOut size={18} strokeWidth={2} />
            {!collapsed && <span className={styles.logoutText}>Log Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
