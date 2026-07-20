import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface DashboardGreetingProps {
  className?: string;
  /** Header-bar variant: single tight two-line stack that fits the h-16 header */
  compact?: boolean;
}

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
};

const getGreeting = (timeOfDay: string) => {
  switch (timeOfDay) {
    case "morning":
      return "Good morning";
    case "afternoon":
      return "Good afternoon";
    default:
      return "Good evening";
  }
};

const getEmoji = (timeOfDay: string) => {
  switch (timeOfDay) {
    case "morning":
      return "☀️";
    case "afternoon":
      return "👋";
    default:
      return "🌙";
  }
};

const getSubtitle = (timeOfDay: string) => {
  switch (timeOfDay) {
    case "morning":
      return "Here's what's happening with your properties today";
    case "afternoon":
      return "Here's your afternoon update";
    default:
      return "Here's your evening summary";
  }
};

export const DashboardGreeting: React.FC<DashboardGreetingProps> = ({
  className,
  compact,
}) => {
  const { userRecord } = useAuth();
  const [timeOfDay, setTimeOfDay] = useState(getTimeOfDay);

  // Re-check time every 60 seconds to update greeting if user leaves tab open
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const firstName = userRecord?.full_name?.split(" ")[0] || "there";

  if (compact) {
    return (
      <div className={cn("min-w-0 leading-tight", className)}>
        <h1 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-1.5 truncate">
          <span className="truncate">{getGreeting(timeOfDay)}, {firstName}</span>
          <span aria-hidden>{getEmoji(timeOfDay)}</span>
        </h1>
        <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
          {getSubtitle(timeOfDay)}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("mb-6", className)}>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2 flex-wrap">
        <span>{getGreeting(timeOfDay)}, {firstName}</span>
        <span className="text-2xl sm:text-3xl">{getEmoji(timeOfDay)}</span>
      </h1>
      <p className="text-muted-foreground mt-1">
        {getSubtitle(timeOfDay)}
      </p>
    </div>
  );
};