import React from 'react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Target,
  Brain,
  Bot,
  Sparkles,
  UserCheck,
  Send,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: keyof ReturnType<typeof usePermissions>;
  end?: boolean;
}

// PIPELINE — core lead flow
const pipelineNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Leads', href: '/leads', icon: Users, end: true },
  { title: 'Nurturing Leads', href: '/leads/nurturing', icon: Sparkles, permission: 'canEditLeadInfo' },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'Applicants', href: '/applicants', icon: UserCheck },
  { title: 'Business', href: '/business', icon: Briefcase, permission: 'canEditLeadInfo' },
];

// PROPERTIES — inventory
const propertiesNavItems: NavItem[] = [
  { title: 'Properties', href: '/properties', icon: Building2 },
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Rent Benchmark', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
];

// COMMUNICATIONS — single hub entry; the /communications landing links out to
// its modules (Property Spotlight, Campaigns, Emails).
const commsNavItems: NavItem[] = [
  { title: 'Communications', href: '/communications', icon: Send, permission: 'canViewAllCallLogs' },
];

// ANALYTICS — data & reports (Reports + Costs merged into one page 2026-07-19)
const analyticsNavItems: NavItem[] = [
  { title: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'canViewAllReports', end: true },
];

// SYSTEM — config & technical
const systemNavItems: NavItem[] = [
  { title: 'Agents', href: '/agents', icon: Bot, permission: 'canModifySettings' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
];

// Knowledge Hub — pinned at bottom
const knowledgeHubItem: NavItem = {
  title: 'Knowledge Hub',
  href: '/knowledge',
  icon: Brain,
  permission: 'canAccessInsightGenerator',
};

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onCollapse }) => {
  const { organization } = useAuth();
  const permissions = usePermissions();

  const filterItems = (items: NavItem[]) => items.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  const filteredPipelineItems = filterItems(pipelineNavItems);
  const filteredPropertiesItems = filterItems(propertiesNavItems);
  const filteredCommsItems = filterItems(commsNavItems);
  const filteredAnalyticsItems = filterItems(analyticsNavItems);
  const filteredSystemItems = filterItems(systemNavItems);
  const showKnowledgeHub = !knowledgeHubItem.permission || permissions[knowledgeHubItem.permission];

  // Glass tooltip shown next to icons while the sidebar is collapsed —
  // fades/zooms in from the icon and vanishes on mouse-out (shadcn animations).
  const collapsedTipClass =
    'bg-white/90 backdrop-blur-xl border-slate-200/70 text-slate-800 text-[13px] font-semibold rounded-xl px-3 py-1.5 shadow-lg';

  const renderNavItem = (item: NavItem) => {
    const link = (
      <NavLink
        to={item.href}
        end={item.end}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200',
          'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          collapsed && 'justify-center px-2'
        )}
        activeClassName="!bg-primary/10 !text-primary !font-bold"
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span>{item.title}</span>}
      </NavLink>
    );

    if (!collapsed) {
      return <div key={item.href}>{link}</div>;
    }

    return (
      <Tooltip key={item.href} delayDuration={150}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className={collapsedTipClass}>
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderSection = (label: string, items: NavItem[], showSeparator: boolean = true) => {
    if (items.length === 0) return null;

    return (
      <>
        {showSeparator && <div className="my-3 mx-3 h-px bg-slate-100" />}
        {!collapsed && (
          <p className="px-3 py-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em]">
            {label}
          </p>
        )}
        {items.map(renderNavItem)}
      </>
    );
  };

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 h-screen transition-all duration-300 z-40',
        'bg-white/80 backdrop-blur-xl border-r border-slate-200/60',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Organization Logo/Name */}
      <header className="h-16 flex items-center px-4 border-b border-slate-100 flex-shrink-0">
        {organization?.logo_url ? (
          <img
            src={organization.logo_url}
            alt={organization.name}
            className={cn('h-8 object-contain', collapsed ? 'mx-auto' : '')}
          />
        ) : (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm text-slate-900 truncate">
                {organization?.name || 'Rent Finder'}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Navigation - Scrollable */}
      <ScrollArea className="flex-1 py-4">
        <nav aria-label="Primary" className="px-2 space-y-0.5">
          {/* PIPELINE Section */}
          {!collapsed && (
            <p className="px-3 py-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-[0.08em]">
              Pipeline
            </p>
          )}
          {filteredPipelineItems.map(renderNavItem)}

          {/* PROPERTIES Section */}
          {renderSection('Properties', filteredPropertiesItems)}

          {/* COMMUNICATIONS — single hub entry (no redundant section label) */}
          {filteredCommsItems.length > 0 && (
            <>
              <div className="my-3 mx-3 h-px bg-slate-100" />
              {filteredCommsItems.map(renderNavItem)}
            </>
          )}

          {/* ANALYTICS Section */}
          {renderSection('Analytics', filteredAnalyticsItems)}

          {/* SYSTEM Section */}
          {renderSection('System', filteredSystemItems)}
        </nav>
      </ScrollArea>

      {/* Knowledge Hub + Collapse Button - Fixed at bottom */}
      <div className="flex-shrink-0 border-t border-slate-100">
        {showKnowledgeHub && (
          <div className="px-2 pt-3">
            {(() => {
              const hubLink = (
                <NavLink
                  to={knowledgeHubItem.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200',
                    'bg-primary/10 text-primary hover:bg-primary/15',
                    collapsed && 'justify-center px-2'
                  )}
                  activeClassName="!bg-primary/15 !text-primary !font-bold"
                >
                  <span className="relative flex shrink-0">
                    <knowledgeHubItem.icon className="h-[18px] w-[18px]" />
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-ping opacity-75" />
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
                  </span>
                  {!collapsed && <span>{knowledgeHubItem.title}</span>}
                </NavLink>
              );
              if (!collapsed) return hubLink;
              return (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>{hubLink}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className={collapsedTipClass}>
                    {knowledgeHubItem.title}
                  </TooltipContent>
                </Tooltip>
              );
            })()}
          </div>
        )}
        {/* Collapse Button */}
        <div className="p-3">
          {collapsed ? (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCollapse(false)}
                  className="w-full px-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className={collapsedTipClass}>
                Expand
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCollapse(true)}
              className="w-full text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Collapse
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
};
