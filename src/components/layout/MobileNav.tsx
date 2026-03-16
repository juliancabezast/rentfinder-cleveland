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
  Settings,
  DollarSign,
  MapPin,
  Target,
  FileText,
  Brain,
  Bot,
  UserCheck,
  Mail,
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

// Main bottom bar items (pipeline core)
const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Leads', href: '/leads', icon: Users },
  { title: 'Showings', href: '/showings', icon: CalendarDays },
  { title: 'Properties', href: '/properties', icon: Building2 },
];

// Pipeline + Properties items in the More sheet
const pipelineMoreItems: NavItem[] = [
  { title: 'Applicants', href: '/applicants', icon: UserCheck },
  { title: 'Heat Map', href: '/analytics/heat-map', icon: MapPin, permission: 'canViewAllReports' },
  { title: 'Rent Benchmark', href: '/analytics/competitor-radar', icon: Target, permission: 'canViewAllReports' },
  { title: 'Knowledge Hub', href: '/knowledge', icon: Brain, permission: 'canAccessInsightGenerator' },
  { title: 'Calls', href: '/calls', icon: Phone, permission: 'canViewAllCallLogs' },
  { title: 'Emails', href: '/emails', icon: Mail, permission: 'canViewAllCallLogs' },
];

// Admin items
const adminNavItems: NavItem[] = [
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'canViewAllReports' },
  { title: 'Costs', href: '/costs', icon: DollarSign, permission: 'canViewCostDashboard' },
  { title: 'Agents', href: '/agents', icon: Bot, permission: 'canModifySettings' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'canModifySettings' },
  { title: 'System Logs', href: '/logs', icon: FileText, permission: 'canViewSystemLogs' },
];

export const MobileNav: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const permissions = usePermissions();

  const filterItems = (items: NavItem[]) => items.filter(
    (item) => !item.permission || permissions[item.permission]
  );

  const filteredPipelineMore = filterItems(pipelineMoreItems);
  const filteredAdminItems = filterItems(adminNavItems);

  const hasMoreItems = filteredPipelineMore.length > 0 || filteredAdminItems.length > 0;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-card/80 backdrop-blur-xl border-t border-white/30 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-16 px-2">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors relative',
              'text-muted-foreground flex-1 min-h-[48px] active:bg-muted/50'
            )}
            activeClassName="text-primary"
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                <item.icon className="h-5 w-5" />
                <span className="truncate">{item.title}</span>
                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {hasMoreItems && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="flex flex-col items-center justify-center gap-0.5 h-auto px-2 py-2 text-muted-foreground flex-1 min-h-[48px]"
                aria-label="More options"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">More</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[70vh]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              <SheetHeader>
                <SheetTitle>More Options</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-4">
                {/* Pipeline & Communications */}
                {filteredPipelineMore.length > 0 && (
                  <div>
                    <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pipeline & Comms
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredPipelineMore.map((item) => (
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

                {filteredAdminItems.length > 0 && filteredPipelineMore.length > 0 && (
                  <Separator />
                )}

                {/* Analytics & System */}
                {filteredAdminItems.length > 0 && (
                  <div>
                    <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Analytics & System
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {filteredAdminItems.map((item) => (
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
