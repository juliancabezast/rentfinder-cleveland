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
  UserCog,
  Settings,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Shield,
  Target,
  FileText,
  Brain,
  Bot,
   UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: keyof ReturnType<typeof usePermissions>;
  end?: boolean;
}

// OPERATIONS section
const operationsNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Properties', href: '/properties', icon: Building2 },
  { title: 'Leads', href: '/leads', icon: Users },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
];

// ANALYTICS section
const analyticsNavItems: NavItem[] = [
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Voucher Intel', href: '/analytics/voucher-intel', icon: Shield, permission: 'canViewAllReports' },
  { title: 'Competitor Radar', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
  { title: 'Knowledge Hub', href: '/knowledge', icon: Brain, permission: 'canAccessInsightGenerator' },
];

// ADMIN section
const adminNavItems: NavItem[] = [
  { title: 'Users', href: '/users', icon: UserCog, permission: 'canCreateUsers' },
  { title: 'Agents', href: '/agents', icon: Bot, permission: 'canModifySettings' },
   { title: 'Demo Requests', href: '/demo-requests', icon: UserPlus, permission: 'canModifySettings' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
  { title: 'System Logs', href: '/logs', icon: FileText, permission: 'canViewSystemLogs' },
];

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

  const filteredOperationsItems = filterItems(operationsNavItems);
  const filteredAnalyticsItems = filterItems(analyticsNavItems);
  const filteredAdminItems = filterItems(adminNavItems);

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.href}
      to={item.href}
      end={item.end}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200',
        'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
        collapsed && 'justify-center px-2'
      )}
      activeClassName="!bg-amber-400 !text-gray-900 font-semibold shadow-lg shadow-amber-400/30 hover:!bg-amber-400 hover:!text-gray-900"
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </NavLink>
  );

  const renderSection = (label: string, items: NavItem[], showSeparator: boolean = true) => {
    if (items.length === 0) return null;
    
    return (
      <>
        {showSeparator && <Separator className="my-3 bg-sidebar-border" />}
        {!collapsed && (
          <p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
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
        'hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 border-r border-sidebar-border z-40',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Organization Logo/Name */}
      <header className="h-16 flex items-center px-4 border-b border-sidebar-border flex-shrink-0">
        {organization?.logo_url ? (
          <img
            src={organization.logo_url}
            alt={organization.name}
            className={cn('h-8 object-contain', collapsed ? 'mx-auto' : '')}
          />
        ) : (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0" aria-hidden="true">
              <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm truncate">
                {organization?.name || 'Rent Finder'}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Navigation - Scrollable */}
      <ScrollArea className="flex-1 py-4">
        <nav aria-label="Primary" className="px-2 space-y-1">
          {/* OPERATIONS Section */}
          {!collapsed && (
            <p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              Operations
            </p>
          )}
          {filteredOperationsItems.map(renderNavItem)}

          {/* ANALYTICS Section */}
          {renderSection('Analytics', filteredAnalyticsItems)}

          {/* ADMIN Section */}
          {renderSection('Admin', filteredAdminItems)}
        </nav>
      </ScrollArea>

      {/* Live Indicator + Collapse Button - Fixed at bottom */}
      <div className="flex-shrink-0 border-t border-sidebar-border">
        {/* Live System Indicator */}
        <div className={cn(
          "flex items-center gap-2 px-4 py-2",
          collapsed && "justify-center px-2"
        )}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          {!collapsed && (
            <span className="text-xs text-sidebar-foreground/60">System Live</span>
          )}
        </div>
        
        {/* Collapse Button */}
        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapse(!collapsed)}
            className={cn(
              'w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
