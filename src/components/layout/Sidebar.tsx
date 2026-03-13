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
  Phone,
  BarChart3,
  Settings,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Target,
  Brain,
  Bot,
  Sparkles,
  UserCheck,
  Mail,
  Megaphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

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
];

// PROPERTIES — inventory
const propertiesNavItems: NavItem[] = [
  { title: 'Properties', href: '/properties', icon: Building2 },
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Rent Benchmark', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
];

// COMMUNICATIONS — contact channels
const commsNavItems: NavItem[] = [
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Emails', href: '/emails', icon: Mail, permission: 'canViewAllCallLogs' },
  { title: 'Campaigns', href: '/campaigns', icon: Megaphone, permission: 'canViewAllCallLogs' },
];

// ANALYTICS — data & reports
const analyticsNavItems: NavItem[] = [
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
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

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.href}
      to={item.href}
      end={item.end}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200',
        'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        collapsed && 'justify-center px-2'
      )}
      activeClassName="!bg-indigo-50 !text-indigo-600 !font-bold"
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </NavLink>
  );

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
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
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

          {/* COMMUNICATIONS Section */}
          {renderSection('Communications', filteredCommsItems)}

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
            <NavLink
              to={knowledgeHubItem.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200',
                'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
                collapsed && 'justify-center px-2'
              )}
              activeClassName="!bg-indigo-100 !text-indigo-700 !font-bold"
            >
              <span className="relative flex shrink-0">
                <knowledgeHubItem.icon className="h-[18px] w-[18px]" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-indigo-500 animate-ping opacity-75" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              {!collapsed && <span>{knowledgeHubItem.title}</span>}
            </NavLink>
          </div>
        )}
        {/* Collapse Button */}
        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapse(!collapsed)}
            className={cn(
              'w-full text-slate-400 hover:bg-slate-50 hover:text-slate-600',
              collapsed && 'px-2'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
};
