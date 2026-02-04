import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu, User, LogOut } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';
import { IntegrationStatusMini } from '@/components/dashboard/IntegrationStatusMini';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/properties': 'Properties',
  '/leads': 'Leads',
  '/showings': 'Showings',
  '/calls': 'Call Logs',
  '/reports': 'Reports',
  '/insights': 'Insight Generator',
  '/users': 'User Management',
  '/settings': 'Settings',
  '/logs': 'System Logs',
  '/costs': 'Cost Dashboard',
};

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const { userRecord, signOut } = useAuth();

  const getPageTitle = () => {
    // Check exact match first
    if (routeTitles[location.pathname]) {
      return routeTitles[location.pathname];
    }
    // Check for partial matches (for nested routes)
    for (const [path, title] of Object.entries(routeTitles)) {
      if (location.pathname.startsWith(path)) {
        return title;
      }
    }
    return 'Dashboard';
  };

  const getUserInitials = () => {
    if (!userRecord?.full_name) return 'U';
    const names = userRecord.full_name.split(' ');
    return names.map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeVariant = () => {
    switch (userRecord?.role) {
      case 'super_admin':
        return 'destructive';
      case 'admin':
        return 'default';
      case 'editor':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatRole = (role: string | undefined) => {
    if (!role) return '';
    return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth/login';
  };

  return (
    <header className="h-16 glass-card sticky top-0 z-40 flex items-center justify-between px-4 lg:px-6">
      {/* Left side - Menu button (mobile) + Page title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">{getPageTitle()}</h1>
      </div>

      {/* Right side - Integration Status + Notifications + User menu */}
      <div className="flex items-center gap-3">
        {/* Integration Status Mini (includes Live indicator) */}
        <IntegrationStatusMini />

        <NotificationsDropdown />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={userRecord?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline-block text-sm font-medium max-w-32 truncate">
                {userRecord?.full_name}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-2">
                <p className="text-sm font-medium">{userRecord?.full_name}</p>
                <p className="text-xs text-muted-foreground">{userRecord?.email}</p>
                <Badge variant={getRoleBadgeVariant()} className="w-fit">
                  {formatRole(userRecord?.role)}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                My Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
