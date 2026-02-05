import React, { useState, useEffect, useRef } from "react";

interface StatItem {
  value: string;
  label: string;
}

interface AnimatedStatsProps {
  stats: StatItem[];
}

// Easing function: easeOutCubic
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const AnimatedStats: React.FC<AnimatedStatsProps> = ({ stats }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsVisible(true);
          setHasAnimated(true);
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [hasAnimated]);

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
          delay={index * 200}
          isVisible={isVisible}
        />
      ))}
    </div>
  );
};

interface AnimatedStatItemProps {
  value: string;
  label: string;
  delay: number;
  isVisible: boolean;
}

const AnimatedStatItem: React.FC<AnimatedStatItemProps> = ({
  value,
  label,
  delay,
  isVisible,
}) => {
  const [displayValue, setDisplayValue] = useState("0");
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!isVisible || hasStarted) return;

    const timeout = setTimeout(() => {
      setHasStarted(true);

      // Handle special case: "24/7"
      if (value === "24/7") {
        const sequence = ["2", "24", "24/", "24/7"];
        let i = 0;
        const typeInterval = setInterval(() => {
          setDisplayValue(sequence[i]);
          i++;
          if (i >= sequence.length) clearInterval(typeInterval);
        }, 400);
        return;
      }

      // Handle percentage or multiplier (e.g., "85%", "3x", "60%")
      const numMatch = value.match(/^(\d+)/);
      if (!numMatch) {
        setDisplayValue(value);
        return;
      }

      const targetNum = parseInt(numMatch[1], 10);
      const suffix = value.replace(/^\d+/, ""); // e.g., "%", "x"
      const duration = 2000;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const currentValue = Math.round(easedProgress * targetNum);
        setDisplayValue(`${currentValue}${suffix}`);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timeout);
  }, [isVisible, hasStarted, value, delay]);

  return (
    <div className="text-center">
      <p className="text-3xl sm:text-4xl font-bold text-primary">{displayValue}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
};

export default AnimatedStats;