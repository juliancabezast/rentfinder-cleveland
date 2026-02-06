import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StatItem {
  value: string;
  label: string;
}

interface AnimatedStatsProps {
  stats: StatItem[];
}

// Easing function: easeOutCubic
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

// Sequential timing config
const STAT_CONFIG = [
  { duration: 1500, pauseAfter: 400 }, // 85%
  { duration: 1000, pauseAfter: 400 }, // 3x
  { duration: 1500, pauseAfter: 400 }, // 60%
  { duration: 800, pauseAfter: 0 },    // 24/7
];

export const AnimatedStats: React.FC<AnimatedStatsProps> = ({ stats }) => {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          // Start the sequential animation
          setActiveIndex(0);
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [hasAnimated]);

  const handleStatComplete = (index: number) => {
    setCompletedIndices((prev) => [...prev, index]);
    
    // Schedule next stat after pause
    if (index < stats.length - 1) {
      setTimeout(() => {
        setActiveIndex(index + 1);
      }, STAT_CONFIG[index].pauseAfter);
    }
  };

  return (
    <div
      ref={containerRef}
      className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto"
    >
      {stats.map((stat, index) => (
        <AnimatedStatItem
          key={index}
          value={stat.value}
          label={stat.label}
          duration={STAT_CONFIG[index]?.duration || 1500}
          isActive={activeIndex === index}
          isCompleted={completedIndices.includes(index)}
          onComplete={() => handleStatComplete(index)}
        />
      ))}
    </div>
  );
};

interface AnimatedStatItemProps {
  value: string;
  label: string;
  duration: number;
  isActive: boolean;
  isCompleted: boolean;
  onComplete: () => void;
}

const AnimatedStatItem: React.FC<AnimatedStatItemProps> = ({
  value,
  label,
  duration,
  isActive,
  isCompleted,
  onComplete,
}) => {
  const [displayValue, setDisplayValue] = useState("0");
  const [showGlow, setShowGlow] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!isActive || hasStarted.current) return;
    hasStarted.current = true;
    setIsVisible(true);

    // Handle special case: "24/7" with typewriter effect
    if (value === "24/7") {
      const sequence = ["2", "24", "24/", "24/7"];
      let i = 0;
      const typeInterval = setInterval(() => {
        setDisplayValue(sequence[i]);
        i++;
        if (i >= sequence.length) {
          clearInterval(typeInterval);
          setShowGlow(true);
          setTimeout(() => setShowGlow(false), 600);
          onComplete();
        }
      }, duration / sequence.length);
      return;
    }

    // Handle percentage or multiplier (e.g., "85%", "3x", "60%")
    const numMatch = value.match(/^(\d+)/);
    if (!numMatch) {
      setDisplayValue(value);
      onComplete();
      return;
    }

    const targetNum = parseInt(numMatch[1], 10);
    const suffix = value.replace(/^\d+/, ""); // e.g., "%", "x"
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = Math.round(easedProgress * targetNum);
      setDisplayValue(`${currentValue}${suffix}`);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete - show glow
        setShowGlow(true);
        setTimeout(() => setShowGlow(false), 600);
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [isActive, value, duration, onComplete]);

  const shouldShow = isVisible || isCompleted;

  return (
    <div 
      className={cn(
        "text-center transition-all duration-500 ease-out",
        shouldShow 
          ? "opacity-100 translate-y-0" 
          : "opacity-0 translate-y-5"
      )}
    >
      <p 
        className={cn(
          "text-3xl sm:text-4xl font-bold text-primary transition-all duration-300",
          showGlow && "drop-shadow-[0_0_20px_rgba(255,178,44,0.6)]"
        )}
        style={{
          textShadow: showGlow ? "0 0 20px rgba(255, 178, 44, 0.5)" : "none",
        }}
      >
        {displayValue}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
};
