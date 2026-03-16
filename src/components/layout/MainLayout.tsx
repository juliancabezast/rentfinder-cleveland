import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { PAIpAssistant } from '@/components/shared/PAIpAssistant';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  Phone,
  BarChart3,
  Sparkles,
  UserCog,
  Settings,
  DollarSign,
  MapPin,
  Shield,
  Target,
  Map,
  Gift,
  UserCheck,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: keyof ReturnType<typeof usePermissions>;
}

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Properties', href: '/properties', icon: Building2 },
  { title: 'Leads', href: '/leads', icon: Users },
  { title: 'Applicants', href: '/applicants', icon: UserCheck },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'My Route', href: '/showings/route', icon: Map, permission: 'canViewOwnRoute' },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
];

const analyticsNavItems: NavItem[] = [
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Voucher Intel', href: '/analytics/voucher-intel', icon: Shield, permission: 'canViewAllReports' },
  { title: 'Rent Benchmark', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Insight Generator', href: '/insights', icon: Sparkles, permission: 'canAccessInsightGenerator' },
];

const adminNavItems: NavItem[] = [
  { title: 'Referrals', href: '/settings', icon: Gift, permission: 'canViewReferrals' },
  { title: 'Users', href: '/users', icon: UserCog, permission: 'canCreateUsers' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { organization } = useAuth();
  const permissions = usePermissions();
  const location = useLocation();

  // Scroll to top on page navigation
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  const filterItems = (items: NavItem[]) => items.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  const allNavItems = [...mainNavItems, ...analyticsNavItems, ...adminNavItems];
  const filteredNavItems = filterItems(allNavItems);

  return (
    <div className="min-h-dvh flex w-full main-gradient-bg">
      {/* Skip to main content - Accessibility */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-white/90 backdrop-blur-xl text-slate-900">
          {/* Organization Logo/Name */}
          <div className="h-16 flex items-center px-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-slate-900">
                {organization?.name || 'Rent Finder'}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-2 space-y-0.5">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 min-h-[48px]',
                    'text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-50'
                  )}
                  activeClassName="!bg-indigo-50 !text-indigo-600 font-semibold"
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.title}</span>
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Main Content Area - offset by sidebar width */}
      <div className={cn(
        "flex-1 flex flex-col min-h-dvh transition-all duration-300",
        sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        {/* Animated accent line — red to green health gradient */}
        <div
          className="h-[2px] w-full"
          style={{
            background: 'linear-gradient(90deg, #ef4444, #f59e0b 40%, #22c55e 100%)',
          }}
        />

        {/* Page Content */}
        <main id="main-content" className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8 overflow-auto">
          {/* Animated background — floating gold orbs (hidden on mobile for performance) */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 hidden md:block" style={{ marginLeft: sidebarCollapsed ? '4rem' : '16rem' }}>
            <div className="absolute rounded-full w-[900px] h-[900px] top-[15%] -right-[100px] animate-float-fast" style={{ background: 'radial-gradient(circle, rgba(255,178,44,0.28) 0%, rgba(255,178,44,0.10) 35%, transparent 65%)' }} />
            <div className="absolute rounded-full w-[800px] h-[800px] top-[40%] -left-[100px] animate-float-fast-reverse" style={{ background: 'radial-gradient(circle, rgba(255,178,44,0.24) 0%, rgba(255,178,44,0.08) 35%, transparent 65%)' }} />
            <div className="absolute rounded-full w-[700px] h-[700px] bottom-[-5%] right-[5%] animate-float-fast" style={{ background: 'radial-gradient(circle, rgba(255,178,44,0.22) 0%, rgba(255,178,44,0.07) 35%, transparent 65%)', animationDelay: '-4s' }} />
          </div>
          <div className="relative z-10 w-full animate-fade-up">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* pAIp AI Assistant */}
      <PAIpAssistant />
    </div>
  );
};
