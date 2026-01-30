import React, { useState } from 'react';
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
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: keyof ReturnType<typeof usePermissions>;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Properties', href: '/properties', icon: Building2 },
  { title: 'Leads', href: '/leads', icon: Users },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Insight Generator', href: '/insights', icon: Sparkles, permission: 'canAccessInsightGenerator' },
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

  const filteredNavItems = navItems.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
          {/* Organization Logo/Name */}
          <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
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
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                  activeClassName="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
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

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
};
