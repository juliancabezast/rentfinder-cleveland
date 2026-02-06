import React, { useState, useEffect } from "react";

const PHRASES = [
  "Never Sleeps",
  "Qualifies Leads",
  "Books Showings",
  "Follows Up",
  "Tracks Costs",
  "Scores Leads",
  "Confirms Appointments",
  "Handles No-Shows",
  "Never Gives Up",
];

const RotatingHeroText: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Start fade out
      setIsVisible(false);
      
      // After fade out (500ms), change text and fade in
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % PHRASES.length);
        setIsVisible(true);
      }, 500);
    }, 4000); // 3.5s visible + 0.5s transition

    return () => clearInterval(interval);
  }, []);

  return (
    <span 
      className="inline-block align-baseline"
      style={{ 
        minWidth: "clamp(200px, 40vw, 340px)",
      }}
    >
      <span
        className="inline-block transition-opacity duration-500 ease-in-out font-bold"
        style={{
          opacity: isVisible ? 1 : 0,
          color: "hsl(40, 100%, 58%)", // #ffb22c accent color
        }}
      >
        {PHRASES[currentIndex]}
      </span>
    </span>
  );
};

export default RotatingHeroText;