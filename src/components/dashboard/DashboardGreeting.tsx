import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface DashboardGreetingProps {
  className?: string;
}

export const DashboardGreeting: React.FC<DashboardGreetingProps> = ({
  className,
}) => {
  const { userRecord } = useAuth();
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "☀️";
    if (hour < 17) return "👋";
    return "🌙";
  };

  const firstName = userRecord?.full_name?.split(" ")[0] || "there";

  return (
    <div className={cn("mb-6", className)}>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2 flex-wrap">
        <span>{getGreeting()}, {firstName}</span>
        <span className="text-2xl sm:text-3xl">{getEmoji()}</span>
      </h1>
      <p className="text-muted-foreground mt-1">
        Here's what's happening with your properties today
      </p>
    </div>
  );
};
