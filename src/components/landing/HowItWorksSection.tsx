import React, { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageSquare, Calendar, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    step: "1",
    icon: <Phone className="h-6 w-6" />,
    title: "Lead Calls In",
    desc: "Your AI agent answers 24/7, qualifies the prospect, and captures their needs",
  },
  {
    step: "2",
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Smart Nurturing",
    desc: "Automated follow-ups via call and SMS keep leads warm until they're ready",
  },
  {
    step: "3",
    icon: <Calendar className="h-6 w-6" />,
    title: "Showing Booked",
    desc: "AI schedules, confirms, and sends reminders automatically",
  },
  {
    step: "4",
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Lease Signed",
    desc: "Track the full journey from first call to signed lease in your dashboard",
  },
];

const HowItWorksSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [visibleCards, setVisibleCards] = useState<boolean[]>([false, false, false, false]);
  const [linesAnimated, setLinesAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Stagger card animations
          STEPS.forEach((_, index) => {
            setTimeout(() => {
              setVisibleCards((prev) => {
                const next = [...prev];
                next[index] = true;
                return next;
              });
            }, index * 200);
          });

          // Start line animation after cards
          setTimeout(() => setLinesAnimated(true), 400);

          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-20 sm:py-32"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">
            How It Works
          </Badge>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold text-foreground"
          >
            From Lead to Lease in 4 Simple Steps
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-8">
          {STEPS.map((item, index) => (
            <div key={index} className="relative">
              <div
                className={cn(
                  "text-center transition-all duration-500 ease-out",
                  "hover:-translate-y-1 hover:drop-shadow-lg cursor-default",
                  visibleCards[index]
                    ? "opacity-100 translate-y-0 scale-100"
                    : "opacity-0 translate-y-8 scale-95"
                )}
              >
                <div className="relative inline-flex group">
                  <div
                    className={cn(
                      "w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto transition-transform duration-300",
                      visibleCards[index] && "animate-[iconBounce_0.5s_ease-out]"
                    )}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                  <span
                    className={cn(
                      "absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center transition-all duration-500",
                      visibleCards[index] && "animate-[pulse_1s_ease-out]"
                    )}
                  >
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
              </div>

              {/* Animated connector line */}
              {index < 3 && (
                <svg
                  className="hidden md:block absolute top-8 left-[60%] w-[80%] h-4 overflow-visible"
                  aria-hidden="true"
                >
                  <line
                    x1="0"
                    y1="8"
                    x2="100%"
                    y2="8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    className={cn(
                      "text-border transition-all duration-1000 ease-out",
                      linesAnimated
                        ? "stroke-dashoffset-0"
                        : "[stroke-dashoffset:200]"
                    )}
                    style={{
                      strokeDashoffset: linesAnimated ? 0 : 200,
                      transition: `stroke-dashoffset 1s ease-out ${index * 0.2}s`,
                    }}
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes iconBounce {
          0% { transform: scale(0.8) rotate(-10deg); }
          50% { transform: scale(1.1) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </section>
  );
};

export default HowItWorksSection;