import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const PHRASES = [
  "Never Sleeps",
  "Qualifies Leads",
  "Books Showings",
  "Follows Up",
  "Speaks Spanish",
  "Tracks Costs",
  "Scores Leads",
  "Confirms Appointments",
  "Handles No-Shows",
  "Never Gives Up",
];

const RotatingHeroText: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % PHRASES.length);
        setIsAnimating(false);
      }, 500); // Half of the animation duration
    }, 3000); // Hold each phrase for 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="relative inline-block overflow-hidden align-bottom" style={{ height: "1.2em", minWidth: "280px" }}>
      <span
        className={cn(
          "absolute left-0 right-0 text-accent font-bold transition-all duration-500 ease-out",
          isAnimating
            ? "-translate-y-full opacity-0"
            : "translate-y-0 opacity-100"
        )}
        style={{
          background: "linear-gradient(90deg, hsl(var(--accent)) 0%, hsl(40, 100%, 60%) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {PHRASES[currentIndex]}
      </span>
      <span
        className={cn(
          "absolute left-0 right-0 text-accent font-bold transition-all duration-500 ease-out",
          isAnimating
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        )}
        style={{
          background: "linear-gradient(90deg, hsl(var(--accent)) 0%, hsl(40, 100%, 60%) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {PHRASES[(currentIndex + 1) % PHRASES.length]}
      </span>
    </span>
  );
};

export default RotatingHeroText;