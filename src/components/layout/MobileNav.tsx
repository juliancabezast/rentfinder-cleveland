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
  MapPin,
  Shield,
  Target,
  Map,
  Gift,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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

const analyticsNavItems: NavItem[] = [
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Voucher Intel', href: '/analytics/voucher-intel', icon: Shield, permission: 'canViewAllReports' },
  { title: 'Competitor Radar', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Insight Generator', href: '/insights', icon: Sparkles, permission: 'canAccessInsightGenerator' },
];

const moreNavItems: NavItem[] = [
  { title: 'My Route', href: '/showings/route', icon: Map, permission: 'canViewOwnRoute' },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Documents', href: '/documents', icon: FileText, permission: 'canViewDocuments' },
  { title: 'Referrals', href: '/referrals', icon: Gift, permission: 'canViewReferrals' },
  { title: 'Users', href: '/users', icon: UserCog, permission: 'canCreateUsers' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'System Logs', href: '/logs', icon: FileText, permission: 'canViewSystemLogs' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
];

export const MobileNav: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const permissions = usePermissions();

  const filterItems = (items: NavItem[]) => items.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  const filteredAnalyticsItems = filterItems(analyticsNavItems);
  const filteredMoreItems = filterItems(moreNavItems);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/80 dark:bg-card/80 backdrop-blur-xl border-t border-white/30 z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-full px-2">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors relative',
              'text-muted-foreground min-w-[60px] min-h-[44px]'
            )}
            activeClassName="text-primary"
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <item.icon className="h-5 w-5" />
                <span className="truncate">{item.title}</span>
                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-accent" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {filteredMoreItems.length > 0 && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="flex flex-col items-center justify-center gap-1 h-auto px-3 py-2 text-muted-foreground min-w-[60px] min-h-[44px]"
                aria-label="More options"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">More</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[70vh]">
              <SheetHeader>
                <SheetTitle>More Options</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-4">
                {/* Analytics Section */}
                {filteredAnalyticsItems.length > 0 && (
                  <div>
                    <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Analytics
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredAnalyticsItems.map((item) => (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors',
                            'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          activeClassName="bg-primary/10 text-primary"
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="text-center text-xs">{item.title}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}

                {filteredMoreItems.length > 0 && filteredAnalyticsItems.length > 0 && (
                  <Separator />
                )}

                {/* Admin / Other Section */}
                {filteredMoreItems.length > 0 && (
                  <div>
                    <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Admin & More
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredMoreItems.map((item) => (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors',
                            'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          activeClassName="bg-primary/10 text-primary"
                        >
                          <item.icon className="h-5 w-5" />
                          <span className="text-center text-xs">{item.title}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};
