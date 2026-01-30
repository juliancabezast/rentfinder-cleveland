import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone,
  Calendar,
  UserPlus,
  MessageSquare,
  Home,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type ActivityType =
  | "call"
  | "showing_scheduled"
  | "showing_completed"
  | "showing_cancelled"
  | "lead_created"
  | "lead_qualified"
  | "sms_sent"
  | "property_alert"
  | "human_control";

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
  maxHeight?: string;
}

const activityConfig: Record<
  ActivityType,
  { icon: React.ElementType; color: string }
> = {
  call: { icon: Phone, color: "text-blue-500 bg-blue-100" },
  showing_scheduled: { icon: Calendar, color: "text-green-500 bg-green-100" },
  showing_completed: { icon: CheckCircle, color: "text-green-600 bg-green-100" },
  showing_cancelled: { icon: XCircle, color: "text-red-500 bg-red-100" },
  lead_created: { icon: UserPlus, color: "text-purple-500 bg-purple-100" },
  lead_qualified: { icon: UserPlus, color: "text-accent bg-accent/20" },
  sms_sent: { icon: MessageSquare, color: "text-teal-500 bg-teal-100" },
  property_alert: { icon: Home, color: "text-amber-500 bg-amber-100" },
  human_control: { icon: AlertTriangle, color: "text-orange-500 bg-orange-100" },
};

export const ActivityFeed = ({
  activities,
  loading = false,
  maxHeight = "400px",
}: ActivityFeedProps) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent activity to display.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }} className="px-6 pb-6">
          <div className="space-y-4">
            {activities.map((activity) => {
              const config = activityConfig[activity.type] || activityConfig.call;
              const Icon = config.icon;

              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-full shrink-0",
                      config.color.split(" ")[1]
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4", config.color.split(" ")[0])}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {activity.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(parseISO(activity.timestamp), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export const ActivityFeedSkeleton = () => (
  <ActivityFeed activities={[]} loading />
);
