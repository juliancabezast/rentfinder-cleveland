import type React from 'react';
import type { usePermissions } from '@/hooks/usePermissions';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  BarChart3,
  MapPin,
  Target,
  Brain,
  Bot,
  Sparkles,
  Send,
  Briefcase,
  ClipboardList,
  MessageSquareText,
  Settings,
} from 'lucide-react';

/**
 * The app's navigation, in one place.
 *
 * Sidebar and MobileNav used to keep their own hand-written copies of this
 * list, so every new page had to be added twice and in practice only ever got
 * added to the sidebar. By 2026-07-21 mobile was missing Playbook and Nurturing
 * Leads entirely and still pointed Communications at the retired /emails
 * module. Both now render from these arrays, so a page added here shows up in
 * both places or in neither.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: keyof ReturnType<typeof usePermissions>;
  /** NavLink `end` — only match this exact path, not its children. */
  end?: boolean;
}

/** Standalone, above the Pipeline label. */
export const NAV_TOP: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
];

/** Core lead flow. */
export const NAV_PIPELINE: NavItem[] = [
  { title: 'Leads', href: '/leads', icon: Users, end: true },
  { title: 'Nurturing Leads', href: '/leads/nurturing', icon: Sparkles, permission: 'canEditLeadInfo' },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'Requests', href: '/requests', icon: ClipboardList },
];

/** Single entry, no section label. */
export const NAV_PROPERTIES: NavItem[] = [
  { title: 'Properties', href: '/properties', icon: Building2 },
];

/** Market intelligence + playbooks. */
export const NAV_TOOLS: NavItem[] = [
  { title: 'Playbook', href: '/playbook', icon: MessageSquareText, permission: 'canEditLeadInfo' },
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Rent Benchmark', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
];

/** Single hub entry; /communications links out to Spotlight, Campaigns, Emails. */
export const NAV_COMMS: NavItem[] = [
  { title: 'Communications', href: '/communications', icon: Send, permission: 'canViewAllCallLogs' },
];

/** Business sits right above Analytics (Reports + Costs merged 2026-07-19). */
export const NAV_ANALYTICS: NavItem[] = [
  { title: 'Business', href: '/business', icon: Briefcase, permission: 'canEditLeadInfo' },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'canViewAllReports', end: true },
];

/** Settings lives in the top-right user menu on desktop, so it's not here. */
export const NAV_SYSTEM: NavItem[] = [
  { title: 'Agents', href: '/agents', icon: Bot, permission: 'canModifySettings' },
];

/** Pinned to the bottom of the sidebar. */
export const NAV_KNOWLEDGE: NavItem = {
  title: 'Knowledge Hub',
  href: '/knowledge',
  icon: Brain,
  permission: 'canAccessInsightGenerator',
};

/**
 * Mobile-only. The bottom bar has no user menu, so Settings would otherwise be
 * unreachable on a phone.
 */
export const NAV_MOBILE_EXTRA: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
];

/** Every destination, in sidebar order. */
export const NAV_ALL: NavItem[] = [
  ...NAV_TOP,
  ...NAV_PIPELINE,
  ...NAV_PROPERTIES,
  ...NAV_TOOLS,
  ...NAV_COMMS,
  ...NAV_ANALYTICS,
  ...NAV_SYSTEM,
  NAV_KNOWLEDGE,
];

/** The four that earn a permanent slot in the phone's bottom bar. */
export const MOBILE_BAR_HREFS = ['/dashboard', '/leads', '/showings', '/properties'];
