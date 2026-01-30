import React, { useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  MoreHorizontal,
  Phone,
  BarChart3,
  Sparkles,
  UserCog,
  Settings,
  FileText,
  DollarSign,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

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
];

const moreNavItems: NavItem[] = [
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Insight Generator', href: '/insights', icon: Sparkles, permission: 'canAccessInsightGenerator' },
  { title: 'Users', href: '/users', icon: UserCog, permission: 'canCreateUsers' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'System Logs', href: '/logs', icon: FileText, permission: 'canViewSystemLogs' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
];

export const MobileNav: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const permissions = usePermissions();

  const filteredMoreItems = moreNavItems.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around h-full px-2">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              'text-muted-foreground'
            )}
            activeClassName="text-primary"
          >
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
          </NavLink>
        ))}

        {filteredMoreItems.length > 0 && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="flex flex-col items-center justify-center gap-1 h-auto px-3 py-2 text-muted-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">More</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[70vh]">
              <SheetHeader>
                <SheetTitle>More Options</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-4 py-6">
                {filteredMoreItems.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 p-4 rounded-lg text-sm font-medium transition-colors',
                      'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    activeClassName="bg-primary/10 text-primary"
                  >
                    <item.icon className="h-6 w-6" />
                    <span className="text-center">{item.title}</span>
                  </NavLink>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};
