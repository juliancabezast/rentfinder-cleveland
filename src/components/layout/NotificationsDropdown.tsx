import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, AlertCircle, Home, User, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: 'property_alert' | 'lead_alert' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_id?: string;
  related_type?: string;
}

export const NotificationsDropdown: React.FC = () => {
  const { organization } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (open && organization?.id) {
      fetchNotifications();
    }
  }, [open, organization?.id]);

  const fetchNotifications = async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      // Fetch property alerts as notifications
      const { data: alerts, error } = await supabase
        .from('property_alerts')
        .select('id, alert_type, message, is_read, created_at, property_id')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const mappedNotifications: Notification[] = (alerts || []).map((alert) => ({
        id: alert.id,
        type: 'property_alert',
        title: alert.alert_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        message: alert.message,
        is_read: alert.is_read || false,
        created_at: alert.created_at || new Date().toISOString(),
        related_id: alert.property_id,
        related_type: 'property',
      }));

      setNotifications(mappedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (!organization?.id) return;

    try {
      await supabase
        .from('property_alerts')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('organization_id', organization.id)
        .eq('is_read', false);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'property_alert':
        return Home;
      case 'lead_alert':
        return User;
      default:
        return AlertCircle;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.related_type === 'property' && notification.related_id) {
      window.location.href = `/properties/${notification.related_id}`;
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs h-7"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-80">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="py-2">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors text-left ${
                      !notification.is_read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-full ${
                        !notification.is_read
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
