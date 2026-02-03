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
  FileText,
  DollarSign,
  MapPin,
  Shield,
  Target,
  Map,
  Gift,
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
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'My Route', href: '/showings/route', icon: Map, permission: 'canViewOwnRoute' },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Documents', href: '/documents', icon: FileText, permission: 'canViewDocuments' },
];

const analyticsNavItems: NavItem[] = [
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Voucher Intel', href: '/analytics/voucher-intel', icon: Shield, permission: 'canViewAllReports' },
  { title: 'Competitor Radar', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Insight Generator', href: '/insights', icon: Sparkles, permission: 'canAccessInsightGenerator' },
];

const adminNavItems: NavItem[] = [
  { title: 'Referrals', href: '/referrals', icon: Gift, permission: 'canViewReferrals' },
  { title: 'Users', href: '/users', icon: UserCog, permission: 'canCreateUsers' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'System Logs', href: '/logs', icon: FileText, permission: 'canViewSystemLogs' },
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
    <div className="min-h-screen flex w-full main-gradient-bg">
      {/* Desktop Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
          {/* Organization Logo/Name */}
          <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sidebar-primary flex items-center justify-center">
                <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">
                {organization?.name || 'Rent Finder'}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-2 space-y-1">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                    'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                  activeClassName="bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20 hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.title}</span>
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        {/* Page Content with gradient overlay for depth */}
        <main className="flex-1 p-4 lg:p-8 pb-20 lg:pb-8 overflow-auto">
          <div className="max-w-7xl mx-auto animate-fade-up">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
};
